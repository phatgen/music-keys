const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const DB_FILE = path.join(__dirname, 'songs.json');
const PORT    = process.env.PORT || 3001;

// ── Tiny JSON file "database" ─────────────────────────────────────────────────

function readSongs() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return []; }
}

function writeSongs(songs) {
  fs.writeFileSync(DB_FILE, JSON.stringify(songs, null, 2));
}

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// GET /api/songs — return all songs, newest first
app.get('/api/songs', (req, res) => {
  res.json(readSongs());
});

// POST /api/songs — create a song
app.post('/api/songs', (req, res) => {
  const { name, notes } = req.body;
  if (!Array.isArray(notes)) return res.status(400).json({ error: 'notes must be an array' });

  const song = {
    id: Date.now(),
    name: (typeof name === 'string' && name.trim()) || 'Untitled Song',
    notes,
    createdAt: new Date().toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    }),
  };

  const songs = readSongs();
  songs.unshift(song);
  writeSongs(songs);
  res.status(201).json(song);
});

// PATCH /api/songs/:id — rename a song
app.patch('/api/songs/:id', (req, res) => {
  const id   = Number(req.params.id);
  const name = req.body?.name?.trim();
  if (!name) return res.status(400).json({ error: 'name is required' });

  const songs = readSongs();
  const idx   = songs.findIndex(s => s.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Song not found' });

  songs[idx] = { ...songs[idx], name };
  writeSongs(songs);
  res.json(songs[idx]);
});

// DELETE /api/songs/:id — delete a song
app.delete('/api/songs/:id', (req, res) => {
  const id    = Number(req.params.id);
  const songs = readSongs();
  writeSongs(songs.filter(s => s.id !== id));
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`Piano Helper server running on http://localhost:${PORT}`);
  console.log(`Songs stored in: ${DB_FILE}`);
});
