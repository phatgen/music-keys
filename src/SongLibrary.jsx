import { useState, useEffect } from 'react';

const STORAGE_KEY = 'piano-helper-songs';

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useSongLibrary() {
  const [songs, setSongs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
  }, [songs]);

  const saveSong = (name, notes) => {
    const song = {
      id: Date.now(),
      name: name.trim() || 'Untitled Song',
      notes,
      createdAt: new Date().toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
      }),
    };
    setSongs(prev => [song, ...prev]);
    return song;
  };

  const deleteSong = (id) => setSongs(prev => prev.filter(s => s.id !== id));

  const renameSong = (id, name) =>
    setSongs(prev => prev.map(s => s.id === id ? { ...s, name: name.trim() || s.name } : s));

  return { songs, saveSong, deleteSong, renameSong };
}

// ── Single song card ─────────────────────────────────────────────────────────

function SongCard({ song, onDelete, onRename }) {
  const [editing,  setEditing]  = useState(false);
  const [name,     setName]     = useState(song.name);
  const [expanded, setExpanded] = useState(false);

  function commitRename() {
    if (name.trim()) onRename(song.id, name);
    setEditing(false);
  }

  // Build a compact display string: show note names only (no octave)
  const noteNames = song.notes.map(n => n.name).join(' · ');
  const noteCount = song.notes.length;

  return (
    <div className="song-card">
      {/* Header row */}
      <div className="song-card-header" onClick={() => !editing && setExpanded(e => !e)}>
        <div className="song-card-left">
          {editing ? (
            <input
              className="song-name-input"
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditing(false); }}
              autoFocus
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className="song-card-name">{song.name}</span>
          )}
          <span className="song-card-meta">{song.createdAt} · {noteCount} note{noteCount !== 1 ? 's' : ''}</span>
        </div>

        <div className="song-card-actions">
          <button
            className="icon-btn"
            title="Rename"
            onClick={e => { e.stopPropagation(); setEditing(v => !v); }}
          >✏️</button>
          <button
            className="icon-btn"
            title="Delete"
            onClick={e => { e.stopPropagation(); onDelete(song.id); }}
          >🗑️</button>
          <span className="song-card-chevron">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded note sequence */}
      {expanded && (
        <div className="song-card-notes">
          {noteNames || '(no notes recorded)'}
        </div>
      )}
    </div>
  );
}

// ── Library panel ─────────────────────────────────────────────────────────────

export function SongLibrary({ songs, onDelete, onRename }) {
  if (songs.length === 0) {
    return (
      <div className="library-empty">
        <div className="library-empty-icon">🎵</div>
        <p>No saved songs yet.</p>
        <p>Start listening to some music and tap <strong>Save Song</strong> to keep a note sequence.</p>
      </div>
    );
  }

  return (
    <div className="song-list">
      {songs.map(song => (
        <SongCard
          key={song.id}
          song={song}
          onDelete={onDelete}
          onRename={onRename}
        />
      ))}
    </div>
  );
}
