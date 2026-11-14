'use strict';
// Connexion centralisee de node-gateway : avec le droit « admin » fourni par la passerelle (req.gateway),
// /api/auth/gateway ouvre la porte de l'ecran gestionnaire (200) ; sinon 204. Le mot de passe actuel reste valable.
// Hors passerelle : toujours 204.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-gw-'));
process.env.QUIZ_DATA_DIR = dir;
process.env.MANAGER_PASSWORD = 'mot-de-passe-de-test-' + Math.random().toString(36).slice(2);
const express = require('express');
const app = require('../server');

let srv, base;
const gw = (role) => ({ 'x-test-gateway': JSON.stringify({ app: 'quiz', role, user: { login: 'anim', name: 'Anim', email: null, isSuper: false } }) });
const gate = (headers = {}) => fetch(base + '/api/auth/gateway', { headers });

test.before(async () => {
  const outer = express();
  outer.use((req, res, next) => { const h = req.get('x-test-gateway'); if (h) req.gateway = JSON.parse(h); next(); });
  outer.use('/quiz', app);
  srv = http.createServer(outer);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.address().port}/quiz`;
});
test.after(() => { srv.close(); fs.rmSync(dir, { recursive: true, force: true }); setImmediate(() => process.exit(0)); });

test('droit admin de la passerelle -> porte ouverte (200)', async () => {
  const r = await gate(gw('admin'));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
  assert.equal(r.headers.get('set-cookie'), null);
});

test('un simple membre, un anonyme ou un droit nul -> 204 (porte du mot de passe)', async () => {
  for (const h of [gw('member'), gw(null), {}]) assert.equal((await gate(h)).status, 204);
});

test('mot de passe actuel inchange', async () => {
  const login = (password) => fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
  assert.equal((await login(process.env.MANAGER_PASSWORD)).status, 200);
  assert.equal((await login('faux')).status, 401);
});
