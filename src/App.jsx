import { useEffect, useRef } from 'react';
import { usePitchDetector } from './usePitchDetector';
import { PianoKeyboard } from './PianoKeyboard';
import { NoteHistory } from './NoteHistory';
import './App.css';

function displayName(note) {
  if (!note) return '—';
  return note.name;
}

export default function App() {
  const { note, history, isListening, error, start, stop, clearHistory } = usePitchDetector();
  const historyRef = useRef(null);

  // Auto-scroll history strip to the right as new notes arrive
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollLeft = historyRef.current.scrollWidth;
    }
  }, [history]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Piano Helper</h1>
        <p className="subtitle">Play music — see the notes!</p>
      </header>

      {/* Big note display */}
      <div className={`note-display ${note ? 'note-display-active' : ''}`}>
        <span className="note-name">{displayName(note)}</span>
        {note && <span className="note-octave">oct {note.octave}</span>}
      </div>

      {/* Piano keyboard */}
      <PianoKeyboard activeNote={note} />

      {/* Note history */}
      <section className="history-section">
        <div className="history-header">
          <h2>Notes heard</h2>
          <button className="btn-clear" onClick={clearHistory} disabled={history.length === 0}>
            Clear
          </button>
        </div>
        <div className="history-scroll" ref={historyRef}>
          <NoteHistory history={history} />
        </div>
      </section>

      {/* Error */}
      {error && (
        <div className="error-banner">
          ⚠️ {error}
        </div>
      )}

      {/* Controls */}
      <div className="controls">
        {!isListening ? (
          <button className="btn-start" onClick={start}>
            🎵 Start Listening
          </button>
        ) : (
          <button className="btn-stop" onClick={stop}>
            ⏹ Stop
          </button>
        )}
      </div>

      <footer className="app-footer">
        <p>Best with a single melody.<br />Full band music shows approximate notes.</p>
      </footer>
    </div>
  );
}
