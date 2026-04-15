import { useState, useEffect, useCallback, useRef } from 'react';

const API_URL_KEY     = 'piano-helper-api-url';
const DEFAULT_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function storedApiUrl() {
  return localStorage.getItem(API_URL_KEY) || DEFAULT_API_URL;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useSongLibrary() {
  // API URL is read from localStorage at runtime — no rebuild needed to change it
  const [apiUrl,  setApiUrlState] = useState(storedApiUrl);
  const [songs,   setSongs]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error,   setError]       = useState(null);

  // Refs so callbacks always see the latest values without being recreated
  const apiUrlRef = useRef(apiUrl);
  const songsRef  = useRef(songs);
  useEffect(() => { apiUrlRef.current = apiUrl; },  [apiUrl]);
  useEffect(() => { songsRef.current  = songs; },   [songs]);

  // Refetch whenever the URL changes
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${apiUrl}/api/songs`)
      .then(r => { if (!r.ok) throw new Error(`Server responded ${r.status}`); return r.json(); })
      .then(data => { setSongs(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [apiUrl]);

  // Persist + apply a new API URL (called from the settings UI)
  const setApiUrl = useCallback((url) => {
    const clean = url.trim().replace(/\/$/, '');
    localStorage.setItem(API_URL_KEY, clean);
    setApiUrlState(clean);
  }, []);

  // Optimistic save
  const saveSong = useCallback((name, notes) => {
    const tempId   = -(Date.now());
    const tempSong = {
      id: tempId,
      name: name?.trim() || 'Untitled Song',
      notes,
      createdAt: new Date().toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
      }),
    };
    setSongs(prev => [tempSong, ...prev]);

    fetch(`${apiUrlRef.current}/api/songs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: tempSong.name, notes }),
    })
      .then(r => r.json())
      .then(saved => setSongs(prev => prev.map(s => s.id === tempId ? saved : s)))
      .catch(() => setSongs(prev => prev.filter(s => s.id !== tempId)));
  }, []);

  // Optimistic delete
  const deleteSong = useCallback((id) => {
    const backup = songsRef.current.find(s => s.id === id);
    setSongs(prev => prev.filter(s => s.id !== id));

    fetch(`${apiUrlRef.current}/api/songs/${id}`, { method: 'DELETE' })
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

    fetch(`${apiUrlRef.current}/api/songs/${id}`, {
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

  return { songs, loading, error, apiUrl, setApiUrl, saveSong, deleteSong, renameSong };
}

// ── Single song card ─────────────────────────────────────────────────────────

function SongCard({ song, onOpen, onDelete, onRename }) {
  const [editing, setEditing] = useState(false);
  const [name,    setName]    = useState(song.name);

  function commitRename() {
    if (name.trim()) onRename(song.id, name);
    setEditing(false);
  }

  const noteCount = song.notes.length;

  return (
    <div className="song-card">
      <div className="song-card-header" onClick={() => !editing && onOpen(song)}>
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
          <button className="icon-btn" title="Rename" onClick={e => { e.stopPropagation(); setEditing(v => !v); }}>✏️</button>
          <button className="icon-btn" title="Delete" onClick={e => { e.stopPropagation(); onDelete(song.id); }}>🗑️</button>
          <span className="song-card-chevron">›</span>
        </div>
      </div>
    </div>
  );
}

// ── Library panel ─────────────────────────────────────────────────────────────

function ServerSetup({ apiUrl, onSave, error }) {
  const [val, setVal] = useState(apiUrl);
  return (
    <div className="library-empty">
      <div className="library-empty-icon">{error ? '⚠️' : '🔌'}</div>
      {error
        ? <p className="server-error-msg">Could not connect to server</p>
        : <p className="server-error-msg">Set your server URL</p>
      }
      <p className="server-url-hint">
        {error
          ? 'Check the URL below or deploy the Cloudflare Worker in the worker/ folder.'
          : 'Enter the URL of your Cloudflare Worker or local server.'}
      </p>
      <input
        className="save-input server-url-input"
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onSave(val)}
        placeholder="https://piano-helper-api.you.workers.dev"
        spellCheck={false}
        autoCapitalize="none"
      />
      <button className="btn-confirm" onClick={() => onSave(val)} disabled={!val.trim()}>
        Connect
      </button>
    </div>
  );
}

export function SongLibrary({ songs, loading, error, apiUrl, onSetApiUrl, onOpen, onDelete, onRename }) {
  const [editingUrl, setEditingUrl] = useState(false);

  if (loading) {
    return (
      <div className="library-empty">
        <div className="library-empty-icon">⏳</div>
        <p>Loading songs…</p>
      </div>
    );
  }

  if (error || editingUrl) {
    return (
      <ServerSetup
        apiUrl={apiUrl}
        error={error}
        onSave={url => { onSetApiUrl(url); setEditingUrl(false); }}
      />
    );
  }

  return (
    <div className="song-list-wrap">
      {songs.length === 0 ? (
        <div className="library-empty">
          <div className="library-empty-icon">🎵</div>
          <p>No saved songs yet.</p>
          <p>Start listening to some music and tap <strong>Save Song</strong> to keep a note sequence.</p>
        </div>
      ) : (
        <div className="song-list">
          {songs.map(song => (
            <SongCard
              key={song.id}
              song={song}
              onOpen={onOpen}
              onDelete={onDelete}
              onRename={onRename}
            />
          ))}
        </div>
      )}
      <p className="server-footer">
        Server: <span className="server-footer-url">{apiUrl}</span>
        <button className="server-footer-btn" onClick={() => setEditingUrl(true)}>change</button>
      </p>
    </div>
  );
}
