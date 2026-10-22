// Lecture des liens YouTube / Spotify et import de playlists.
//
// Sans cle d'API, on lit les pages publiques (YouTube : ytInitialData ; Spotify : page embed) :
// pratique mais fragile et limite (~100 titres YouTube, ~100 Spotify). Avec les variables
// d'environnement YOUTUBE_API_KEY ou SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET, on passe par les API
// officielles (plus fiables, pagination complete).

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

// Reconnait un lien YouTube / Spotify. kind : 'video' | 'track' | 'playlist' | 'album'.
function parseMediaUrl(raw) {
  const s = String(raw || '').trim();
  let m = s.match(/^spotify:(track|playlist|album):([A-Za-z0-9]+)$/);
  if (m) return { provider: 'spotify', kind: m[1], id: m[2] };
  let u;
  try { u = new URL(s); } catch (e) { return null; }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    return /^[\w-]{11}$/.test(id) ? { provider: 'youtube', kind: 'video', id } : null;
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const list = u.searchParams.get('list');
    const v = u.searchParams.get('v') || (u.pathname.match(/^\/(?:embed|shorts)\/([\w-]{11})/) || [])[1];
    if (u.pathname === '/playlist' && list) return { provider: 'youtube', kind: 'playlist', id: list };
    if (v && /^[\w-]{11}$/.test(v)) return { provider: 'youtube', kind: 'video', id: v };
    if (list) return { provider: 'youtube', kind: 'playlist', id: list };
    return null;
  }
  if (host === 'open.spotify.com') {
    m = u.pathname.match(/\/(track|playlist|album)\/([A-Za-z0-9]+)/);
    if (m) return { provider: 'spotify', kind: m[1], id: m[2] };
  }
  return null;
}

// Formate pour stockage (questions.media_url) : lien canonique court.
function canonicalUrl(p) {
  if (p.provider === 'youtube') return 'https://www.youtube.com/watch?v=' + p.id;
  return 'https://open.spotify.com/' + p.kind + '/' + p.id;
}

// Retire les mentions parasites des titres YouTube ("(Official Video)", "[HD]", "| Lyrics"...).
function cleanTitle(t) {
  return String(t || '')
    .replace(/[\(\[][^\)\]]*(official|video|clip|lyrics?|paroles|audio|hd|hq|4k|remaster|visuali[sz]er|live)[^\)\]]*[\)\]]/gi, '')
    .replace(/\s*[|｜]\s*(official|lyrics?|clip|audio).*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function getText(url, headers) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr,en;q=0.8', ...(headers || {}) } });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' sur ' + new URL(url).hostname);
  return r.text();
}
async function getJson(url, headers) {
  return JSON.parse(await getText(url, headers));
}

// ---- YouTube ----

function extractJsonAfter(html, marker) {
  const i = html.indexOf(marker);
  if (i < 0) return null;
  const start = html.indexOf('{', i);
  let depth = 0, inStr = false, esc = false;
  for (let k = start; k < html.length; k++) {
    const c = html[k];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(html.slice(start, k + 1));
  }
  return null;
}

// Parcourt recursivement l'objet ytInitialData et collecte les playlistVideoRenderer.
function collectYoutubeRenderers(node, out) {
  if (!node || typeof node !== 'object') return;
  if (node.playlistVideoRenderer) {
    const r = node.playlistVideoRenderer;
    const title = r.title && (r.title.runs ? r.title.runs.map((x) => x.text).join('') : r.title.simpleText);
    const byline = r.shortBylineText && r.shortBylineText.runs && r.shortBylineText.runs[0].text;
    if (r.videoId && title && !/^\[?(Deleted|Private) video\]?$/i.test(title)) {
      out.push({ videoId: r.videoId, title, channel: byline || '', duration: Number(r.lengthSeconds) || 0 });
    }
    return;
  }
  for (const k of Object.keys(node)) collectYoutubeRenderers(node[k], out);
}

function splitArtistTitle(title, channel) {
  const clean = cleanTitle(title);
  const m = clean.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  return { artist: String(channel || '').replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim(), title: clean };
}

async function fetchYoutubePlaylist(id) {
  const key = process.env.YOUTUBE_API_KEY;
  let name = 'Playlist YouTube';
  const items = [];
  if (key) {
    const meta = await getJson('https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=' + encodeURIComponent(id) + '&key=' + key);
    if (meta.items && meta.items[0]) name = meta.items[0].snippet.title;
    let token = '';
    do {
      const d = await getJson('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=' + encodeURIComponent(id) + '&key=' + key + (token ? '&pageToken=' + token : ''));
      for (const it of d.items || []) {
        const s = it.snippet;
        if (!s || !s.resourceId || /^(Deleted|Private) video$/i.test(s.title)) continue;
        items.push({ videoId: s.resourceId.videoId, title: s.title, channel: s.videoOwnerChannelTitle || '', duration: 0 });
      }
      token = d.nextPageToken || '';
    } while (token && items.length < 500);
  } else {
    const html = await getText('https://www.youtube.com/playlist?list=' + encodeURIComponent(id) + '&hl=fr');
    const data = extractJsonAfter(html, 'ytInitialData');
    if (!data) throw new Error('Page YouTube illisible (definir YOUTUBE_API_KEY pour un import fiable)');
    const t = data.metadata && data.metadata.playlistMetadataRenderer && data.metadata.playlistMetadataRenderer.title;
    if (t) name = t;
    collectYoutubeRenderers(data, items);
  }
  if (!items.length) throw new Error('Aucune video lisible (playlist privee ou vide ?)');
  return {
    name,
    tracks: items.map((it) => {
      const at = splitArtistTitle(it.title, it.channel);
      return { ...at, url: 'https://www.youtube.com/watch?v=' + it.videoId, duration: it.duration };
    })
  };
}

// ---- Spotify ----

let spotifyToken = null; // { value, expires }
async function spotifyApiToken() {
  if (spotifyToken && spotifyToken.expires > Date.now() + 30000) return spotifyToken.value;
  const id = process.env.SPOTIFY_CLIENT_ID, secret = process.env.SPOTIFY_CLIENT_SECRET;
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  if (!r.ok) throw new Error('Authentification Spotify refusee (' + r.status + ')');
  const d = await r.json();
  spotifyToken = { value: d.access_token, expires: Date.now() + d.expires_in * 1000 };
  return spotifyToken.value;
}

async function fetchSpotifyList(kind, id) {
  if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
    const auth = { Authorization: 'Bearer ' + await spotifyApiToken() };
    const meta = await getJson('https://api.spotify.com/v1/' + kind + 's/' + id + '?fields=name', auth);
    const tracks = [];
    let next = 'https://api.spotify.com/v1/' + kind + 's/' + id + '/tracks?limit=50' + (kind === 'playlist' ? '&fields=next,items(track(id,name,artists(name)))' : '');
    while (next && tracks.length < 500) {
      const d = await getJson(next, auth);
      for (const it of d.items || []) {
        const t = kind === 'playlist' ? it.track : it;
        if (t && t.id) tracks.push({ title: t.name, artist: (t.artists || []).map((a) => a.name).join(', '), url: 'https://open.spotify.com/track/' + t.id });
      }
      next = d.next;
    }
    return { name: meta.name, tracks };
  }
  const html = await getText('https://open.spotify.com/embed/' + kind + '/' + id);
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('Page Spotify illisible (definir SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET pour un import fiable)');
  const entity = JSON.parse(m[1]).props.pageProps.state.data.entity;
  const tracks = (entity.trackList || [])
    .map((t) => {
      const tid = String(t.uri || '').split(':')[2];
      return tid ? { title: t.title, artist: t.subtitle || '', url: 'https://open.spotify.com/track/' + tid } : null;
    })
    .filter(Boolean);
  return { name: entity.name || entity.title || 'Playlist Spotify', tracks };
}

// Renvoie { name, tracks: [{ title, artist, url, duration }] } pour une playlist/album YouTube ou Spotify.
async function fetchPlaylist(raw) {
  const p = parseMediaUrl(raw);
  if (!p || p.kind === 'video' || p.kind === 'track') throw new Error('Lien de playlist YouTube ou Spotify attendu');
  const res = p.provider === 'youtube' ? await fetchYoutubePlaylist(p.id) : await fetchSpotifyList(p.kind, p.id);
  if (!res.tracks.length) throw new Error('Aucun morceau trouve');
  return res;
}

module.exports = { parseMediaUrl, canonicalUrl, cleanTitle, splitArtistTitle, fetchPlaylist, extractJsonAfter, collectYoutubeRenderers };
