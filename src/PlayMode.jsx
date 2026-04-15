import { useState, useRef, useEffect, useCallback } from 'react';
import { usePitchDetector } from './usePitchDetector';
import { SheetMusic } from './SheetMusic';
import { PianoKeyboard } from './PianoKeyboard';

const ANTHROPIC_API     = 'https://api.anthropic.com/v1/messages';
const API_KEY_STORAGE   = 'piano-helper-api-key';
const ADVANCE_COOLDOWN  = 900; // ms between note advances

// ── Claude API call ────────────────────────────────────────────────────────

async function analyzeSheetMusic(apiKey, base64, mimeType) {
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: base64 },
          },
          {
            type: 'text',
            text: `This is a photo of sheet music. Extract all melody notes in playing order (left to right, top staff first for piano).

Rules:
- Natural note names only: A B C D E F G
- Sharps → round DOWN (C#→C, D#→D, F#→F, G#→G, A#→A)
- Flats  → round UP   (Bb→B, Eb→E, Ab→A, Db→D, Gb→G)
- Octave: middle C = C4 (the C just below the treble clef staff)
- Chords: use only the highest note
- Include repeated notes separately

Return ONLY a valid JSON array, nothing else:
[{"name":"C","octave":4},{"name":"E","octave":4}]

If the image is not readable sheet music, return: []`,
          },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('Invalid API key — check it and try again.');
    if (res.status === 429) throw new Error('Rate limit hit — wait a moment and retry.');
    throw new Error(body.error?.message || `API error ${res.status}`);
  }

  const data  = await res.json();
  const text  = (data.content?.[0]?.text ?? '').trim();
  const match = text.match(/\[[\s\S]*?\]/);
  if (!match) throw new Error('Unexpected AI response — try a clearer photo.');

  const parsed = JSON.parse(match[0]);
  return Array.isArray(parsed)
    ? parsed.filter(n => /^[A-G]$/.test(n.name) && typeof n.octave === 'number')
    : [];
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── API key setup screen ───────────────────────────────────────────────────

function ApiKeySetup({ onSave }) {
  const [val, setVal] = useState('');
  const valid = val.startsWith('sk-');
  return (
    <div className="play-setup">
      <div className="play-setup-icon">🤖</div>
      <h2 className="play-setup-title">Connect to Claude AI</h2>
      <p className="play-setup-desc">
        Play Mode uses Claude AI to read sheet music photos and turn them into
        notes you can play step by step. You need a free Anthropic API key.
      </p>
      <a
        className="play-setup-link"
        href="https://console.anthropic.com/settings/keys"
        target="_blank"
        rel="noreferrer"
      >
        Get a free API key →
      </a>
      <input
        className="save-input"
        type="password"
        placeholder="sk-ant-api03-…"
        value={val}
        onChange={e => setVal(e.target.value.trim())}
        onKeyDown={e => e.key === 'Enter' && valid && onSave(val)}
        autoComplete="off"
        spellCheck={false}
      />
      <button className="btn-confirm" onClick={() => onSave(val)} disabled={!valid}>
        Save Key
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function PlayMode({ saveSong }) {
  const [apiKey, setApiKeyState] = useState(() => localStorage.getItem(API_KEY_STORAGE) ?? '');

  // phase: 'photo' | 'analyzing' | 'ready' | 'playing' | 'done'
  const [phase,    setPhase]    = useState('photo');
  const [notes,    setNotes]    = useState([]);
  const [cursor,   setCursor]   = useState(0);
  const [error,    setError]    = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [saveName, setSaveName] = useState('');

  const fileRef    = useRef(null);
  const lastAdvRef = useRef(0);

  const { note, isRequesting, volBarRef, start, stop } = usePitchDetector();

  // Stop mic when this tab is unmounted (user switches tab)
  useEffect(() => () => stop(), [stop]);

  // Advance cursor when mic hears the expected note
  useEffect(() => {
    if (phase !== 'playing' || !note || cursor >= notes.length) return;
    if (note.name !== notes[cursor].name) return;
    const now = Date.now();
    if (now - lastAdvRef.current < ADVANCE_COOLDOWN) return;
    lastAdvRef.current = now;
    const next = cursor + 1;
    if (next >= notes.length) { stop(); setPhase('done'); }
    else setCursor(next);
  }, [note, phase, cursor, notes, stop]);

  const saveApiKey  = useCallback(key => {
    localStorage.setItem(API_KEY_STORAGE, key);
    setApiKeyState(key);
  }, []);

  const clearApiKey = useCallback(() => {
    localStorage.removeItem(API_KEY_STORAGE);
    setApiKeyState('');
  }, []);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setError(null);
    setPhase('analyzing');
    try {
      const base64   = await fileToBase64(file);
      const mimeType = file.type || 'image/jpeg';
      const parsed   = await analyzeSheetMusic(apiKey, base64, mimeType);
      if (parsed.length === 0) {
        setError("Couldn't find any notes. Try a clearer photo with the sheet music filling the frame.");
        setPhase('photo');
        return;
      }
      setNotes(parsed);
      setCursor(0);
      setPhase('ready');
    } catch (err) {
      setError(err.message);
      setPhase('photo');
    }
  }

  async function handleStart() {
    lastAdvRef.current = 0;
    setPhase('playing');
    await start();
  }

  function handlePause() {
    stop();
    setPhase('ready');
  }

  function handleSkip() {
    lastAdvRef.current = Date.now();
    const next = cursor + 1;
    if (next >= notes.length) { stop(); setPhase('done'); }
    else setCursor(next);
  }

  function handleReset() {
    stop();
    setNotes([]);
    setCursor(0);
    setError(null);
    setSaving(false);
    setPhase('photo');
  }

  function handleSaveToLibrary() {
    setSaveName('');
    setSaving(true);
  }

  function confirmSave() {
    saveSong(saveName, [...notes]);
    setSaving(false);
  }

  // ── No API key ─────────────────────────────────────────────────────────
  if (!apiKey) return <ApiKeySetup onSave={saveApiKey} />;

  const expected  = notes[cursor] ?? null;
  const isPlaying = phase === 'playing';

  // ── Done ───────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <>
        <div className="play-done">
          <div className="play-done-icon">🎉</div>
          <h2 className="play-done-title">You played it!</h2>
          <p className="play-done-sub">{notes.length} notes · well done!</p>
          <section className="card">
            <SheetMusic notes={notes} highlightIndex={notes.length - 1} />
          </section>
          <button className="btn-save-song play-save-btn" onClick={handleSaveToLibrary}>
            💾 Save to Library
          </button>
          <div className="play-done-btns">
            <button className="btn-cancel" onClick={handleReset}>New Song</button>
            <button className="btn-confirm" onClick={() => { setCursor(0); setPhase('ready'); }}>
              Play Again
            </button>
          </div>
        </div>

        {saving && (
          <>
            <div className="overlay-backdrop" onClick={() => setSaving(false)} />
            <div className="save-sheet">
              <div className="save-sheet-handle" />
              <h3 className="save-sheet-title">Name this song</h3>
              <input
                className="save-input"
                placeholder="e.g. Twinkle Twinkle"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmSave(); if (e.key === 'Escape') setSaving(false); }}
                autoFocus
              />
              <div className="save-sheet-preview">
                {notes.length} notes · {notes.map(n => n.name).join(' ')}
              </div>
              <div className="save-sheet-btns">
                <button className="btn-cancel" onClick={() => setSaving(false)}>Cancel</button>
                <button className="btn-confirm" onClick={confirmSave}>Save</button>
              </div>
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <div className="play-mode">
      {error && (
        <div className="error-banner">
          <strong>Problem reading photo</strong>
          <p>{error}</p>
        </div>
      )}

      {/* ── Photo / Analyzing ── */}
      {(phase === 'photo' || phase === 'analyzing') && (
        <div className="play-photo-card card">
          {phase === 'analyzing' ? (
            <div className="play-analyzing">
              <div className="play-spinner" />
              <p className="play-analyzing-text">Reading the notes…</p>
            </div>
          ) : (
            <>
              <div className="play-photo-icon">📷</div>
              <p className="play-photo-desc">
                Take a photo of sheet music or choose one from your gallery.
                Claude AI will extract the notes so you can play them step by step.
              </p>
              <button
                className="btn-start play-photo-btn"
                onClick={() => fileRef.current?.click()}
              >
                Take / Choose Photo
              </button>
              <button className="play-change-key" onClick={clearApiKey}>
                Change API key
              </button>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFile}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {/* ── Ready / Playing ── */}
      {(phase === 'ready' || phase === 'playing') && (
        <>
          {/* Current note cue */}
          <div className={`play-cue ${isPlaying ? 'play-cue-active' : ''}`}>
            {isPlaying ? (
              <>
                <span className="play-cue-label">Play this note</span>
                <span className="play-cue-name">{expected?.name ?? '—'}</span>
                <span className="play-cue-octave">octave {expected?.octave}</span>
                <div className="vol-meter-wrap">
                  <div className="vol-meter-bar" ref={volBarRef} />
                </div>
              </>
            ) : (
              <>
                <span className="play-cue-label">Ready</span>
                <span className="play-cue-name">{notes.length}</span>
                <span className="play-cue-octave">notes found · tap Start</span>
              </>
            )}
          </div>

          {/* Progress */}
          {isPlaying && (
            <div className="play-progress">
              <div className="play-progress-track">
                <div
                  className="play-progress-fill"
                  style={{ width: `${(cursor / notes.length) * 100}%` }}
                />
              </div>
              <span className="play-progress-label">{cursor + 1} / {notes.length}</span>
            </div>
          )}

          {/* Sheet music */}
          <section className="card">
            <div className="card-label">Sheet Music</div>
            <SheetMusic notes={notes} highlightIndex={cursor} />
          </section>

          {/* Piano — green = expected, purple = what mic hears */}
          <PianoKeyboard
            activeNote={isPlaying ? note : null}
            expectedNote={expected}
          />

          {/* Controls */}
          <div className="play-controls">
            {!isPlaying ? (
              <>
                <button className="btn-cancel" onClick={handleReset}>New Photo</button>
                <button
                  className="btn-start"
                  onClick={handleStart}
                  disabled={isRequesting}
                >
                  {isRequesting ? '⏳ Mic…' : '▶ Start Playing'}
                </button>
              </>
            ) : (
              <>
                <button className="btn-cancel" onClick={handlePause}>Pause</button>
                <button className="btn-skip" onClick={handleSkip}>Skip ›</button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
