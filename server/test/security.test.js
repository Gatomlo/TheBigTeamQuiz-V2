'use strict';
// Securite du quiz derriere la passerelle : gestion reservee au droit « admin » (HTTP et Socket.IO), uploads limites
// aux medias, aucun CORS, mot de passe sans valeur par defaut. En autonome : comportement historique conserve.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-sec-'));
process.env.QUIZ_DATA_DIR = dir;
delete process.env.MANAGER_PASSWORD; // doit generer un mot de passe aleatoire, pas « quiz2024 »
const express = require('express');
const { io: ioc } = require('socket.io-client');
const app = require('../server');

let srv, base, port, standalone, sbase;
// Simule la passerelle : req.gateway depuis un en-tete de test ; identify(req) lit le meme en-tete sur la poignee de main.
const roleOf = (h) => { try { return JSON.parse(h || 'null'); } catch (e) { return null; } };
const gwHeader = (role) => ({ 'x-test-gateway': JSON.stringify({ app: 'quiz', role, user: role ? { login: 'anim', name: 'Anim', email: null, isSuper: false } : null }) });
const identify = (req) => roleOf(req.headers['x-test-gateway']) || { app: 'quiz', user: null, role: null };

test.before(async () => {
  const outer = express();
  outer.use((req, res, next) => { const h = roleOf(req.get('x-test-gateway')); req.gateway = h || { app: 'quiz', user: null, role: null }; next(); });
  outer.use('/quiz', app);
  srv = http.createServer(outer);
  app.attachToServer(srv, { mountPath: '/quiz', identify });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  port = srv.address().port;
  base = `http://127.0.0.1:${port}/quiz`;
});
test.after(() => { srv.close(); fs.rmSync(dir, { recursive: true, force: true }); setImmediate(() => process.exit(0)); });

const get = (p, h = {}) => fetch(base + p, { headers: h });

test('HTTP : gestion reservee a l\'admin de la passerelle, parties publiques preservees', async () => {
  for (const [method, p] of [['GET', '/api/epreuves'], ['GET', '/api/scenarios'], ['GET', '/api/games'], ['POST', '/api/epreuves'], ['DELETE', '/api/games/1'], ['POST', '/api/import-playlist'], ['POST', '/api/upload']]) {
    for (const h of [{}, gwHeader(null), gwHeader('member')]) {
      assert.equal((await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...h }, body: method === 'GET' || method === 'DELETE' ? undefined : '{}' })).status, 401, `${method} ${p}`);
    }
  }
  assert.equal((await get('/api/epreuves', gwHeader('admin'))).status, 200);
  assert.equal((await get('/api/leaderboard')).status, 200, 'classement public');
  assert.equal((await get('/api/games/share/inconnu')).status, 404, 'partage public (404, pas 401)');
});

test('aucun CORS derriere la passerelle', async () => {
  const r = await get('/api/leaderboard', { origin: 'https://evil.example' });
  assert.equal(r.headers.get('access-control-allow-origin'), null);
});

test('upload : medias seulement, jamais de HTML/SVG/JS ; fichiers servis sans interpretation', async () => {
  const send = (name, type, h = gwHeader('admin')) => {
    const fd = new FormData(); fd.append('file', new Blob(['x'], { type }), name);
    return fetch(base + '/api/upload', { method: 'POST', body: fd, headers: h });
  };
  for (const [n, t] of [['x.html', 'text/html'], ['x.svg', 'image/svg+xml'], ['x.js', 'text/javascript'], ['x.HTML', 'text/html'], ['x.php', 'text/plain'], ['sans-extension', 'text/plain']]) {
    assert.equal((await send(n, t)).status, 415, n);
  }
  assert.equal((await send('x.mp3', 'audio/mpeg', gwHeader(null))).status, 401, 'anonyme refuse');
  const ok = await send('Photo.PNG', 'image/png');
  assert.equal(ok.status, 200);
  const { url } = await ok.json();
  assert.match(url, /\.png$/, 'extension normalisee');
  const f = await fetch(base + url);
  assert.equal(f.status, 200);
  assert.equal(f.headers.get('x-content-type-options'), 'nosniff');
  assert.match(f.headers.get('content-security-policy'), /sandbox/);
});

const connect = (headers) => new Promise((resolve, reject) => {
  const s = ioc(`http://127.0.0.1:${port}`, { path: '/quiz/socket.io', transports: ['websocket'], extraHeaders: headers, reconnection: false });
  s.on('connect', () => resolve(s)); s.on('connect_error', reject);
});
const probe = (socket, event) => new Promise((resolve) => {
  let seen = false; socket.once('unauthorized', (info) => { seen = info.event === event; });
  socket.emit(event, {}, () => {});
  setTimeout(() => resolve(seen), 300);
});

test('Socket.IO : pilotage refuse aux non-admin, evenements des joueurs preserves', async () => {
  const anon = await connect({});
  const member = await connect(gwHeader('member'));
  const admin = await connect(gwHeader('admin'));
  for (const s of [anon, member]) {
    for (const ev of ['launch-scenario', 'close-game', 'set-config', 'resolve-correct', 'lock-all', 'sync-teams']) assert.equal(await probe(s, ev), true, `${ev} doit etre refuse`);
    for (const ev of ['register-role', 'buzz', 'cast-vote', 'submit-answer', 'create-team']) assert.equal(await probe(s, ev), false, `${ev} doit rester public`);
  }
  assert.equal(await probe(admin, 'lock-all'), false, 'l\'admin pilote');
  [anon, member, admin].forEach((s) => s.close());
});

test('mot de passe : pas de valeur par defaut, genere au premier demarrage ; 8 caracteres minimum', async () => {
  const login = (password) => fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
  assert.equal((await login('quiz2024')).status, 401, 'l\'ancien mot de passe public ne marche plus');
  const { DatabaseSync } = require('node:sqlite');
  const row = new DatabaseSync(path.join(dir, 'quiz.db'), { readOnly: true }).prepare("SELECT value FROM settings WHERE key = 'manager_password_hash'").get();
  assert.ok(row && row.value.includes(':'), 'empreinte enregistree');
  const r = await fetch(base + '/api/change-password', { method: 'POST', headers: { 'content-type': 'application/json', ...gwHeader('admin') }, body: JSON.stringify({ currentPassword: 'x', newPassword: 'court' }) });
  assert.equal(r.status, 400);
});
