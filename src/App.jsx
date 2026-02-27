import { useEffect, useRef, useState } from 'react';
import { usePitchDetector } from './usePitchDetector';
import { PianoKeyboard } from './PianoKeyboard';
import { NoteHistory } from './NoteHistory';
import { SheetMusic } from './SheetMusic';
import { useSongLibrary, SongLibrary } from './SongLibrary';
import './App.css';

export default function App() {
  const { note, history, isListening, error, start, stop, clearHistory } = usePitchDetector();
  const { songs, saveSong, deleteSong, renameSong } = useSongLibrary();

  const [tab,      setTab]      = useState('listen');  // 'listen' | 'library'
  const [saving,   setSaving]   = useState(false);
  const [saveName, setSaveName] = useState('');
  const saveInputRef = useRef(null);

  // Focus the save name input when the dialog opens
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
    // Switch to library so they can see it was saved
    setTab('library');
  }

  function cancelSave() {
    setSaving(false);
  }

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
          {/* Big current note */}
          <div className={`note-display ${note ? 'note-display-active' : ''}`}>
            <span className="note-name">{note ? note.name : '—'}</span>
            {note
              ? <span className="note-sub">octave {note.octave}</span>
              : <span className="note-sub">{isListening ? 'listening for notes…' : 'tap Start to begin'}</span>
            }
          </div>

          {/* Sheet music — only visible once we have notes */}
          {history.length > 0 && (
            <section className="card">
              <div className="card-label">Sheet Music</div>
              <SheetMusic notes={history} />
            </section>
          )}

          {/* Piano keyboard */}
          <PianoKeyboard activeNote={note} />

          {/* Note history strip */}
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

          {/* Error */}
          {error && <div className="error-banner">⚠️ {error}</div>}

          {/* Start / Stop */}
          <div className="controls">
            {!isListening
              ? <button className="btn-start" onClick={start}>🎵 Start Listening</button>
              : <button className="btn-stop"  onClick={stop}>⏹ Stop</button>
            }
          </div>

          <p className="app-footer">
            Shows natural notes only (no sharps) · Best with melody held close to mic ·
            Full band music is approximate
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
