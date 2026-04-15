/**
 * Piano Helper – Cloudflare Worker API
 *
 * Routes:
 *   GET    /api/songs        list all songs (newest first)
 *   POST   /api/songs        create a song
 *   PATCH  /api/songs/:id    rename a song
 *   DELETE /api/songs/:id    delete a song
 *
 * Storage: all songs kept as a single JSON array in Cloudflare KV
 * under the key "songs". Fine for a personal library of dozens of songs.
 */

const SONGS_KEY = 'songs';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function noContent() {
  return new Response(null, { status: 204, headers: CORS });
}

async function readSongs(env) {
  const raw = await env.SONGS_KV.get(SONGS_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function writeSongs(env, songs) {
  await env.SONGS_KV.put(SONGS_KEY, JSON.stringify(songs));
}

export default {
  async fetch(request, env) {
    const { method, url } = request;
    const { pathname } = new URL(url);

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // GET /api/songs
    if (pathname === '/api/songs' && method === 'GET') {
      return json(await readSongs(env));
    }

    // POST /api/songs
    if (pathname === '/api/songs' && method === 'POST') {
      const { name, notes } = await request.json().catch(() => ({}));
      if (!Array.isArray(notes)) return json({ error: 'notes must be an array' }, 400);

      const song = {
        id: Date.now(),
        name: (typeof name === 'string' && name.trim()) || 'Untitled Song',
        notes,
        createdAt: new Date().toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
        }),
      };

      const songs = await readSongs(env);
      songs.unshift(song);
      await writeSongs(env, songs);
      return json(song, 201);
    }

    // /api/songs/:id routes
    const match = pathname.match(/^\/api\/songs\/(\d+)$/);
    if (match) {
      const id = Number(match[1]);

      // PATCH /api/songs/:id — rename
      if (method === 'PATCH') {
        const { name } = await request.json().catch(() => ({}));
        const trimmed = name?.trim();
        if (!trimmed) return json({ error: 'name is required' }, 400);

        const songs = await readSongs(env);
        const idx   = songs.findIndex(s => s.id === id);
        if (idx === -1) return json({ error: 'Song not found' }, 404);

        songs[idx] = { ...songs[idx], name: trimmed };
        await writeSongs(env, songs);
        return json(songs[idx]);
      }

      // DELETE /api/songs/:id
      if (method === 'DELETE') {
        const songs = await readSongs(env);
        await writeSongs(env, songs.filter(s => s.id !== id));
        return noContent();
      }
    }

    return json({ error: 'Not found' }, 404);
  },
};
