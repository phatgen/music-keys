import { useEffect, useRef, useState } from 'react';
import { usePitchDetector } from './usePitchDetector';
import { PianoKeyboard } from './PianoKeyboard';
import { NoteHistory } from './NoteHistory';
import { SheetMusic } from './SheetMusic';
import { useSongLibrary, SongLibrary } from './SongLibrary';
import './App.css';

export default function App() {
  const { note, history, isListening, isRequesting, error, volBarRef, start, stop, clearHistory } = usePitchDetector();
  const { songs, saveSong, deleteSong, renameSong } = useSongLibrary();

  const [tab,      setTab]      = useState('listen');
  const [saving,   setSaving]   = useState(false);
  const [saveName, setSaveName] = useState('');
  const saveInputRef = useRef(null);

  useEffect(() => {
    if (saving && saveInputRef.current) saveInputRef.current.focus();
  }, [saving]);

  function openSaveDialog() {
    setSaveName('');
    setSaving(true);
  }

  function confirmSave() {
    if (history.length === 0) return;
    saveSong(saveName, [...history]);
    setSaving(false);
    clearHistory();
    setTab('library');
  }

  function cancelSave() {
    setSaving(false);
  }

  // Label and style for the start/stop/requesting button
  const ctrlLabel = isRequesting ? '⏳ Waiting for mic…'
                  : isListening  ? '⏹ Stop'
                  :                '🎵 Start Listening';
  const ctrlClass = isRequesting ? 'btn-requesting'
                  : isListening  ? 'btn-stop'
                  :                'btn-start';

  return (
    <div className="app">

      {/* ── Header ── */}
      <header className="app-header">
        <div className="app-title-row">
          <h1>Piano Helper</h1>
          {isListening && (
            <span className="listening-badge">
              <span className="pulse-dot" /> Listening
            </span>
          )}
          {isRequesting && (
            <span className="listening-badge requesting-badge">
              Allow mic in browser…
            </span>
          )}
        </div>

        <nav className="tab-bar">
          <button
            className={`tab-btn ${tab === 'listen' ? 'tab-active' : ''}`}
            onClick={() => setTab('listen')}
          >
            🎵 Listen
          </button>
          <button
            className={`tab-btn ${tab === 'library' ? 'tab-active' : ''}`}
            onClick={() => setTab('library')}
          >
            📚 Library
            {songs.length > 0 && <span className="tab-badge">{songs.length}</span>}
          </button>
        </nav>
      </header>

      {/* ══════════════════════════════════════════════════════════ LISTEN TAB */}
      {tab === 'listen' && (
        <>
          {/* Error — sits right below the header so it's always visible */}
          {error && (
            <div className="error-banner">
              <strong>⚠️ Microphone problem</strong>
              <p>{error}</p>
            </div>
          )}

          {/* Big current note */}
          <div className={`note-display ${note ? 'note-display-active' : ''}`}>
            <span className="note-name">{note ? note.name : '—'}</span>
            {note
              ? <span className="note-sub">octave {note.octave}</span>
              : <span className="note-sub">
                  {isRequesting ? 'waiting for microphone permission…'
                  : isListening  ? 'listening for notes…'
                  :                'tap Start to begin'}
                </span>
            }
            {isListening && (
              <div className="vol-meter-wrap" title="Mic volume">
                <div className="vol-meter-bar" ref={volBarRef} />
              </div>
            )}
          </div>

          {/* Note history strip — top priority, visible without scrolling */}
          <section className="card">
            <div className="history-header">
              <span className="card-label">Notes heard</span>
              <div className="history-actions">
                {history.length > 0 && (
                  <>
                    <button className="btn-save-song" onClick={openSaveDialog}>
                      💾 Save Song
                    </button>
                    <button className="btn-clear" onClick={clearHistory}>
                      Clear
                    </button>
                  </>
                )}
              </div>
            </div>
            <NoteHistory history={history} />
          </section>

          {/* Sheet music */}
          {history.length > 0 && (
            <section className="card">
              <div className="card-label">Sheet Music</div>
              <SheetMusic notes={history} />
            </section>
          )}

          {/* Piano keyboard */}
          <PianoKeyboard activeNote={note} />

          {/* Start / Stop / Requesting */}
          <div className="controls">
            <button
              className={ctrlClass}
              onClick={isListening ? stop : isRequesting ? undefined : start}
              disabled={isRequesting}
            >
              {ctrlLabel}
            </button>
          </div>

          <p className="app-footer">
            Natural notes only · Best with melody close to mic · Full band music is approximate
          </p>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════ LIBRARY TAB */}
      {tab === 'library' && (
        <div className="library-view">
          <SongLibrary songs={songs} onDelete={deleteSong} onRename={renameSong} />
        </div>
      )}

      {/* ══════════════════════════════════════════════════ SAVE BOTTOM SHEET */}
      {saving && (
        <>
          <div className="overlay-backdrop" onClick={cancelSave} />
          <div className="save-sheet">
            <div className="save-sheet-handle" />
            <h3 className="save-sheet-title">Name this song</h3>
            <input
              ref={saveInputRef}
              className="save-input"
              placeholder="e.g. Star Wars Theme"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmSave(); if (e.key === 'Escape') cancelSave(); }}
            />
            <div className="save-sheet-preview">
              {history.length} notes · {history.map(n => n.name).join(' ')}
            </div>
            <div className="save-sheet-btns">
              <button className="btn-cancel" onClick={cancelSave}>Cancel</button>
              <button className="btn-confirm" onClick={confirmSave} disabled={history.length === 0}>
                Save
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
