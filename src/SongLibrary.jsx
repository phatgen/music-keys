import { useState, useEffect, useCallback, useRef } from 'react';

// Set VITE_API_URL in .env.local to point at your server.
// Falls back to localhost for local development.
const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useSongLibrary() {
  const [songs,   setSongs]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // Cache a ref to songs for rollback in optimistic updates
  const songsRef = useRef(songs);
  useEffect(() => { songsRef.current = songs; }, [songs]);

  // Initial load
  useEffect(() => {
    fetch(`${API}/api/songs`)
      .then(r => { if (!r.ok) throw new Error(`Server responded ${r.status}`); return r.json(); })
      .then(data => { setSongs(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  // Optimistic save — adds to state immediately, corrects id once server replies
  const saveSong = useCallback((name, notes) => {
    const tempId   = -(Date.now()); // negative so it can't collide with server ids
    const tempSong = {
      id: tempId,
      name: name?.trim() || 'Untitled Song',
      notes,
      createdAt: new Date().toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
      }),
    };
    setSongs(prev => [tempSong, ...prev]);

    fetch(`${API}/api/songs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: tempSong.name, notes }),
    })
      .then(r => r.json())
      .then(saved => setSongs(prev => prev.map(s => s.id === tempId ? saved : s)))
      .catch(() => setSongs(prev => prev.filter(s => s.id !== tempId))); // rollback
  }, []);

  // Optimistic delete
  const deleteSong = useCallback((id) => {
    const backup = songsRef.current.find(s => s.id === id);
    setSongs(prev => prev.filter(s => s.id !== id));

    fetch(`${API}/api/songs/${id}`, { method: 'DELETE' })
      .catch(() => {
        if (backup) setSongs(prev => [backup, ...prev].sort((a, b) => b.id - a.id));
      });
  }, []);

  // Optimistic rename
  const renameSong = useCallback((id, name) => {
    const trimmed = name?.trim();
    if (!trimmed) return;
    const backup = songsRef.current.find(s => s.id === id);
    setSongs(prev => prev.map(s => s.id === id ? { ...s, name: trimmed } : s));

    fetch(`${API}/api/songs/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
      .then(r => r.json())
      .then(updated => setSongs(prev => prev.map(s => s.id === id ? updated : s)))
      .catch(() => {
        if (backup) setSongs(prev => prev.map(s => s.id === id ? backup : s));
      });
  }, []);

  return { songs, loading, error, saveSong, deleteSong, renameSong };
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

export function SongLibrary({ songs, loading, error, onDelete, onRename }) {
  if (loading) {
    return (
      <div className="library-empty">
        <div className="library-empty-icon">⏳</div>
        <p>Loading songs…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="library-empty">
        <div className="library-empty-icon">⚠️</div>
        <p style={{ color: 'var(--accent2)' }}>Could not connect to server</p>
        <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>{error}</p>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
          Run <code>npm start</code> inside the <code>server/</code> folder.
        </p>
      </div>
    );
  }

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
