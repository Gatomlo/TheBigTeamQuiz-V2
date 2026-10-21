const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const multer = require('multer');
const { Server } = require('socket.io');
const { DatabaseSync } = require('node:sqlite'); // module natif Node (>= 22.5), zero dependance npm

const app = express();
// Necessaire derriere le proxy d'Infomaniak pour que req.ip reflete le vrai
// client (X-Forwarded-For) plutot que l'adresse interne du proxy - sans ca,
// toutes les requetes semblent venir de la meme IP et la limitation de
// tentatives de connexion ci-dessous bloquerait tout le monde en meme temps.
app.set('trust proxy', true);
const server = http.createServer(app); // utilise seulement en lancement autonome (voir la fin du fichier)
let io = null; // Socket.IO est cree par createIo() : sur ce serveur HTTP, ou celui de la passerelle

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Base de donnees (historique des parties + epreuves/scenarios) ----
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
const db = new DatabaseSync(path.join(dataDir, 'quiz.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at INTEGER,
    ended_at INTEGER,
    epreuves_played TEXT,
    share_token TEXT
  );
  CREATE TABLE IF NOT EXISTS game_teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    team_name TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(game_id) REFERENCES games(id)
  );
  CREATE TABLE IF NOT EXISTS epreuves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    response_type TEXT NOT NULL,
    category TEXT,
    default_points INTEGER NOT NULL DEFAULT 10,
    timer_enabled INTEGER NOT NULL DEFAULT 0,
    timer_seconds INTEGER NOT NULL DEFAULT 30,
    host_note TEXT
  );
  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    epreuve_id INTEGER NOT NULL,
    order_index INTEGER NOT NULL,
    text TEXT,
    images TEXT,
    audio_path TEXT, video_path TEXT,
    qcm_options TEXT,
    qcm_correct_index INTEGER,
    host_note TEXT,
    FOREIGN KEY(epreuve_id) REFERENCES epreuves(id)
  );
  CREATE TABLE IF NOT EXISTS scenarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    show_menu_on_display INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS scenario_epreuves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scenario_id INTEGER NOT NULL,
    epreuve_id INTEGER NOT NULL,
    order_index INTEGER NOT NULL,
    response_type_override TEXT,
    default_points_override INTEGER,
    FOREIGN KEY(scenario_id) REFERENCES scenarios(id),
    FOREIGN KEY(epreuve_id) REFERENCES epreuves(id)
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Migration legere pour les bases deja existantes (creees avant l'ajout du
// timer/de la note animateur) : CREATE TABLE IF NOT EXISTS n'ajoute pas de
// colonnes a une table qui existe deja, donc on les ajoute nous-memes si absentes.
function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
ensureColumn('epreuves', 'timer_enabled', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('epreuves', 'timer_seconds', 'INTEGER NOT NULL DEFAULT 30');
ensureColumn('epreuves', 'host_note', 'TEXT');
ensureColumn('questions', 'host_note', 'TEXT');
ensureColumn('questions', 'hint', 'TEXT'); // indice/anecdote, distinct de host_note (la reponse)
ensureColumn('scenarios', 'show_menu_on_display', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('scenarios', 'vote_settings', 'TEXT'); // JSON : reglages par defaut du vote de l'epreuve suivante (voir normalizeVoteSettings)
ensureColumn('games', 'epreuves_played', 'TEXT');
ensureColumn('games', 'share_token', 'TEXT');

const insertGame = db.prepare('INSERT INTO games (started_at, ended_at, epreuves_played, share_token) VALUES (?, ?, ?, ?)');
const insertGameTeam = db.prepare('INSERT INTO game_teams (game_id, team_name, score) VALUES (?, ?, ?)');
const topTeamsStmt = db.prepare(`
  SELECT gt.team_name, gt.score, date(g.ended_at / 1000, 'unixepoch', 'localtime') AS game_date
  FROM game_teams gt
  JOIN games g ON g.id = gt.game_id
  ORDER BY gt.score DESC
  LIMIT 10
`);

app.get('/api/leaderboard', (req, res) => {
  res.json(topTeamsStmt.all());
});

// ---- Historique des parties ----
const listGamesStmt = db.prepare('SELECT * FROM games WHERE ended_at IS NOT NULL ORDER BY ended_at DESC');
const listGameTeamsStmt = db.prepare('SELECT team_name, score FROM game_teams WHERE game_id=? ORDER BY score DESC');
const getGameByTokenStmt = db.prepare('SELECT * FROM games WHERE share_token=?');
const deleteGameTeamsStmt = db.prepare('DELETE FROM game_teams WHERE game_id=?');
const deleteGameStmt = db.prepare('DELETE FROM games WHERE id=?');

function parseGameRow(g) {
  return {
    id: g.id,
    started_at: g.started_at,
    ended_at: g.ended_at,
    epreuves_played: g.epreuves_played ? JSON.parse(g.epreuves_played) : [],
    share_token: g.share_token,
    teams: listGameTeamsStmt.all(g.id)
  };
}

app.get('/api/games', (req, res) => {
  res.json(listGamesStmt.all().map(parseGameRow));
});

// Vue publique (page de resultats partagee par lien unique, voir server/public/result.html) :
// pas d'authentification, mais un token opaque non devinable (crypto.randomUUID) sert de cle d'acces.
app.get('/api/games/share/:token', (req, res) => {
  const game = getGameByTokenStmt.get(req.params.token);
  if (!game) return res.status(404).json({ error: 'not found' });
  res.json(parseGameRow(game));
});

app.delete('/api/games/:id', (req, res) => {
  deleteGameTeamsStmt.run(req.params.id);
  deleteGameStmt.run(req.params.id);
  res.json({ ok: true });
});

// ---- Epreuves / questions ----
const listEpreuvesStmt = db.prepare('SELECT * FROM epreuves ORDER BY id');
const insertEpreuveStmt = db.prepare('INSERT INTO epreuves (name, response_type, category, default_points, timer_enabled, timer_seconds, host_note) VALUES (?, ?, ?, ?, ?, ?, ?)');
const updateEpreuveStmt = db.prepare('UPDATE epreuves SET name=?, response_type=?, category=?, default_points=?, timer_enabled=?, timer_seconds=?, host_note=? WHERE id=?');
const deleteEpreuveStmt = db.prepare('DELETE FROM epreuves WHERE id=?');
const deleteQuestionsForEpreuveStmt = db.prepare('DELETE FROM questions WHERE epreuve_id=?');
const deleteScenarioEpreuvesForEpreuveStmt = db.prepare('DELETE FROM scenario_epreuves WHERE epreuve_id=?');

const listQuestionsForEpreuveStmt = db.prepare('SELECT * FROM questions WHERE epreuve_id=? ORDER BY order_index');
const nextOrderIndexStmt = db.prepare('SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM questions WHERE epreuve_id=?');
const insertQuestionStmt = db.prepare('INSERT INTO questions (epreuve_id, order_index, text, images, audio_path, video_path, qcm_options, qcm_correct_index, host_note, hint) VALUES (?,?,?,?,?,?,?,?,?,?)');
const updateQuestionStmt = db.prepare('UPDATE questions SET text=?, images=?, audio_path=?, video_path=?, qcm_options=?, qcm_correct_index=?, host_note=?, hint=? WHERE id=?');
const updateQuestionOrderStmt = db.prepare('UPDATE questions SET order_index=? WHERE id=?');
const getQuestionStmt = db.prepare('SELECT * FROM questions WHERE id=?');
const deleteQuestionStmt = db.prepare('DELETE FROM questions WHERE id=?');

function parseQuestionRow(q) {
  return {
    ...q,
    images: q.images ? JSON.parse(q.images) : [],
    qcm_options: q.qcm_options ? JSON.parse(q.qcm_options) : null
  };
}

app.get('/api/epreuves', (req, res) => {
  const epreuves = listEpreuvesStmt.all();
  res.json(epreuves.map((e) => ({ ...e, questions: listQuestionsForEpreuveStmt.all(e.id).map(parseQuestionRow) })));
});

app.post('/api/epreuves', (req, res) => {
  const { name, response_type, category, default_points, timer_enabled, timer_seconds, host_note } = req.body || {};
  if (!name || !['buzzer', 'qcm', 'direct'].includes(response_type)) return res.status(400).json({ error: 'invalid' });
  const id = insertEpreuveStmt.run(
    name, response_type, category || null, Number(default_points) || 10,
    timer_enabled ? 1 : 0, Number(timer_seconds) || 30, host_note || null
  ).lastInsertRowid;
  res.json({ id });
});

app.put('/api/epreuves/:id', (req, res) => {
  const { name, response_type, category, default_points, timer_enabled, timer_seconds, host_note } = req.body || {};
  updateEpreuveStmt.run(
    name, response_type, category || null, Number(default_points) || 10,
    timer_enabled ? 1 : 0, Number(timer_seconds) || 30, host_note || null,
    req.params.id
  );
  res.json({ ok: true });
});

app.delete('/api/epreuves/:id', (req, res) => {
  deleteQuestionsForEpreuveStmt.run(req.params.id);
  deleteScenarioEpreuvesForEpreuveStmt.run(req.params.id);
  deleteEpreuveStmt.run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/epreuves/:id/questions', (req, res) => {
  const { text, images, audio_path, video_path, qcm_options, qcm_correct_index, host_note, hint } = req.body || {};
  const orderIndex = nextOrderIndexStmt.get(req.params.id).next;
  const id = insertQuestionStmt.run(
    req.params.id, orderIndex, text || null,
    JSON.stringify(images || []), audio_path || null, video_path || null,
    qcm_options ? JSON.stringify(qcm_options) : null,
    typeof qcm_correct_index === 'number' ? qcm_correct_index : null,
    host_note || null, hint || null
  ).lastInsertRowid;
  res.json({ id });
});

app.put('/api/questions/:id', (req, res) => {
  const { text, images, audio_path, video_path, qcm_options, qcm_correct_index, host_note, hint } = req.body || {};
  updateQuestionStmt.run(
    text || null, JSON.stringify(images || []), audio_path || null, video_path || null,
    qcm_options ? JSON.stringify(qcm_options) : null,
    typeof qcm_correct_index === 'number' ? qcm_correct_index : null,
    host_note || null, hint || null,
    req.params.id
  );
  res.json({ ok: true });
});

// Echange l'order_index de deux questions voisines (boutons monter/descendre).
app.post('/api/questions/:id/move', (req, res) => {
  const { direction } = req.body || {};
  const question = getQuestionStmt.get(req.params.id);
  if (!question) return res.status(404).json({ error: 'not found' });
  const siblings = listQuestionsForEpreuveStmt.all(question.epreuve_id);
  const pos = siblings.findIndex((q) => q.id === question.id);
  const swapPos = direction === 'up' ? pos - 1 : pos + 1;
  if (swapPos < 0 || swapPos >= siblings.length) return res.json({ ok: true });
  const other = siblings[swapPos];
  updateQuestionOrderStmt.run(other.order_index, question.id);
  updateQuestionOrderStmt.run(question.order_index, other.id);
  res.json({ ok: true });
});

app.delete('/api/questions/:id', (req, res) => {
  deleteQuestionStmt.run(req.params.id);
  res.json({ ok: true });
});

// Reordonnancement complet (glisser-deposer cote gestionnaire) : plus pratique
// qu'une suite d'appels a /move (qui ne fait qu'un echange avec le voisin) -
// on recoit l'ordre final voulu et on ecrit order_index = position dans le
// tableau recu, pour chaque question de l'epreuve.
app.post('/api/epreuves/:id/questions/reorder', (req, res) => {
  const { orderedIds } = req.body || {};
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'invalid' });
  const siblings = listQuestionsForEpreuveStmt.all(req.params.id);
  const validIds = new Set(siblings.map((q) => q.id));
  if (orderedIds.length !== siblings.length || !orderedIds.every((id) => validIds.has(id))) {
    return res.status(400).json({ error: 'orderedIds must match the epreuve questions exactly' });
  }
  orderedIds.forEach((id, index) => updateQuestionOrderStmt.run(index, id));
  res.json({ ok: true });
});

// ---- Scenarios ----
const listScenariosStmt = db.prepare('SELECT * FROM scenarios ORDER BY id');
const getScenarioStmt = db.prepare('SELECT * FROM scenarios WHERE id=?');
const insertScenarioStmt = db.prepare('INSERT INTO scenarios (name, show_menu_on_display, vote_settings) VALUES (?, ?, ?)');
const updateScenarioStmt = db.prepare('UPDATE scenarios SET name=?, show_menu_on_display=?, vote_settings=? WHERE id=?');
const deleteScenarioStmt = db.prepare('DELETE FROM scenarios WHERE id=?');
const deleteScenarioEpreuvesStmt = db.prepare('DELETE FROM scenario_epreuves WHERE scenario_id=?');
const insertScenarioEpreuveStmt = db.prepare('INSERT INTO scenario_epreuves (scenario_id, epreuve_id, order_index, response_type_override, default_points_override) VALUES (?,?,?,?,?)');
const listScenarioEpreuvesStmt = db.prepare(`
  SELECT se.*, e.name AS epreuve_name, e.response_type AS epreuve_response_type,
         e.default_points AS epreuve_default_points, e.category AS epreuve_category,
         e.timer_enabled AS epreuve_timer_enabled, e.timer_seconds AS epreuve_timer_seconds,
         e.host_note AS epreuve_host_note
  FROM scenario_epreuves se
  JOIN epreuves e ON e.id = se.epreuve_id
  WHERE se.scenario_id = ?
  ORDER BY se.order_index
`);

// Reglages du vote "epreuve suivante" propres a un scenario (colonne JSON) :
// auto = propose le vote automatiquement au retour au menu apres une epreuve ;
// count = nombre d'epreuves proposees, tirees au hasard (0 = toutes les restantes) ;
// duration = secondes (0 = jusqu'a la cloture manuelle) ; live = scores visibles
// pendant le vote ; autoLaunch = lance l'epreuve gagnante apres quelques secondes.
function normalizeVoteSettings(raw) {
  let src = raw;
  if (typeof src === 'string') { try { src = JSON.parse(src); } catch (e) { src = null; } }
  src = src && typeof src === 'object' ? src : {};
  const toInt = (v, min, max, fallback) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  return {
    auto: !!src.auto,
    count: toInt(src.count, 0, 8, 0),
    duration: toInt(src.duration, 0, 600, 30),
    live: !!src.live,
    autoLaunch: !!src.autoLaunch
  };
}

app.get('/api/scenarios', (req, res) => {
  const scenarios = listScenariosStmt.all();
  res.json(scenarios.map((s) => ({ ...s, vote_settings: normalizeVoteSettings(s.vote_settings), epreuves: listScenarioEpreuvesStmt.all(s.id) })));
});

app.post('/api/scenarios', (req, res) => {
  const { name, epreuves, show_menu_on_display, vote_settings } = req.body || {};
  if (!name) return res.status(400).json({ error: 'invalid' });
  const id = insertScenarioStmt.run(name, show_menu_on_display === false ? 0 : 1, JSON.stringify(normalizeVoteSettings(vote_settings))).lastInsertRowid;
  (epreuves || []).forEach((e, i) => {
    insertScenarioEpreuveStmt.run(id, e.epreuve_id, i, e.response_type_override || null, e.default_points_override || null);
  });
  res.json({ id });
});

app.put('/api/scenarios/:id', (req, res) => {
  const { name, epreuves, show_menu_on_display, vote_settings } = req.body || {};
  // Sans vote_settings dans la requete (ancien client), on conserve les reglages existants.
  const existing = getScenarioStmt.get(req.params.id);
  const voteJson = JSON.stringify(normalizeVoteSettings(vote_settings !== undefined ? vote_settings : (existing && existing.vote_settings)));
  updateScenarioStmt.run(name, show_menu_on_display === false ? 0 : 1, voteJson, req.params.id);
  deleteScenarioEpreuvesStmt.run(req.params.id);
  (epreuves || []).forEach((e, i) => {
    insertScenarioEpreuveStmt.run(req.params.id, e.epreuve_id, i, e.response_type_override || null, e.default_points_override || null);
  });
  res.json({ ok: true });
});

app.delete('/api/scenarios/:id', (req, res) => {
  deleteScenarioEpreuvesStmt.run(req.params.id);
  deleteScenarioStmt.run(req.params.id);
  res.json({ ok: true });
});

// ---- Upload de medias (questions) ----
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname))
  }),
  limits: { fileSize: 200 * 1024 * 1024 } // 200 Mo, large pour de la video
});
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  res.json({ url: '/uploads/' + req.file.filename });
});

// Mot de passe unique pour l'ecran gestionnaire (pas de comptes individuels :
// un seul secret partage, adapte a un usage ponctuel/soiree - voir
// server/README.md). A definir via la variable d'environnement
// MANAGER_PASSWORD en production ; valeur par defaut uniquement pour les
// tests locaux, a changer avant un vrai evenement.
// Valeur de secours tant qu'aucun mot de passe n'a ete defini depuis
// l'interface (voir POST /api/change-password, qui ecrit dans settings et
// prend le pas des cet instant). A definir via la variable d'environnement
// MANAGER_PASSWORD au premier deploiement ; valeur par defaut uniquement pour
// les tests locaux, a changer avant un vrai evenement (ou simplement changee
// une fois depuis l'ecran gestionnaire une fois deployee).
const MANAGER_PASSWORD = process.env.MANAGER_PASSWORD || 'quiz2024';
const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSettingStmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

// scrypt (module natif crypto, aucune dependance npm) : le mot de passe
// change depuis l'interface n'est jamais stocke en clair, seulement son
// empreinte salee. timingSafeEqual pour la comparaison finale, afin qu'un
// attaquant ne puisse pas deduire des bytes corrects a partir du temps de
// reponse (les deux buffers sont toujours de meme longueur ici : sortie fixe
// de scryptSync convertie en hex).
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
}
function verifyHashedPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'));
}
function checkManagerPassword(password) {
  if (typeof password !== 'string') return false;
  const stored = getSettingStmt.get('manager_password_hash');
  if (stored && stored.value) return verifyHashedPassword(password, stored.value);
  return password === MANAGER_PASSWORD; // pas encore change depuis l'interface
}

// Limitation des tentatives par IP (login ET changement de mot de passe,
// meme compteur) : sans ca, rien n'empeche d'essayer des mots de passe en
// boucle jusqu'a tomber sur le bon. Verrouillage temporaire (pas permanent)
// apres plusieurs echecs, remis a zero des qu'une tentative reussit.
// Purement en memoire (pas besoin de survivre a un redemarrage pour cet
// usage ponctuel/soiree).
const loginAttemptsByIp = new Map(); // ip -> { count, lockedUntil }
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 5 * 60 * 1000;
function isLoginLocked(ip) {
  const entry = loginAttemptsByIp.get(ip);
  return !!entry && entry.lockedUntil > Date.now();
}
function lockoutSecondsLeft(ip) {
  const entry = loginAttemptsByIp.get(ip);
  return entry ? Math.ceil((entry.lockedUntil - Date.now()) / 1000) : 0;
}
function recordFailedLoginAttempt(ip) {
  const entry = loginAttemptsByIp.get(ip) || { count: 0, lockedUntil: 0 };
  entry.count++;
  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
    entry.count = 0;
  }
  loginAttemptsByIp.set(ip, entry);
}

app.post('/api/login', (req, res) => {
  if (isLoginLocked(req.ip)) {
    return res.status(429).json({ ok: false, error: 'locked', retryAfterSeconds: lockoutSecondsLeft(req.ip) });
  }
  if (checkManagerPassword((req.body || {}).password)) {
    loginAttemptsByIp.delete(req.ip);
    return res.json({ ok: true });
  }
  recordFailedLoginAttempt(req.ip);
  res.status(401).json({ ok: false });
});

// Envoye depuis l'ecran gestionnaire (Regler le mot de passe) : remplace le
// mot de passe partage. Protege par la meme limitation de tentatives que le
// login (sur l'ancien mot de passe fourni), sans quoi cet endpoint deviendrait
// lui-meme une porte de brute-force.
app.post('/api/change-password', (req, res) => {
  if (isLoginLocked(req.ip)) {
    return res.status(429).json({ ok: false, error: 'locked', retryAfterSeconds: lockoutSecondsLeft(req.ip) });
  }
  const { currentPassword, newPassword } = req.body || {};
  if (typeof newPassword !== 'string' || newPassword.length < 4) {
    return res.status(400).json({ ok: false, error: 'weak_password' });
  }
  if (!checkManagerPassword(currentPassword)) {
    recordFailedLoginAttempt(req.ip);
    return res.status(401).json({ ok: false });
  }
  loginAttemptsByIp.delete(req.ip);
  setSettingStmt.run('manager_password_hash', hashPassword(newPassword));
  res.json({ ok: true });
});

// ---- Etat du jeu en memoire (une seule partie en cours a la fois) ----
let teams = [];
let teamScores = {};
let teamSounds = {};
let sessionStartedAt = null;
let sessionPlayedEpreuveNames = []; // noms des epreuves jouees depuis le debut de la session (historique des parties)
let rehearsalMode = false; // mode repetition : aucune partie n'est ecrite dans l'historique tant qu'il est actif
// Petites statistiques accumulees pendant la partie en cours, pour enrichir
// le recap affiche a la cloture (voir close-game) au-dela du simple classement.
let sessionStats = { fastestBuzz: null, correctCounts: {} }; // fastestBuzz: { team, ms } | null ; correctCounts: { teamName: nombre de bonnes reponses }
function resetSessionStats() {
  sessionStats = { fastestBuzz: null, correctCounts: {} };
}
let qrVisible = false; // le grand ecran affiche le QR code plein cadre
let scoreboardVisible = null; // { type: 'current' } ou { type: 'alltime', rows } ou null

// Message libre pousse par l'animateur sur le display (texte/image/video/compte
// a rebours, combinables), utilise pour l'ecran d'attente avant le lancement
// d'une epreuve, une pause, etc. Structure volontairement generique : c'est la
// meme brique qui accueillera plus tard des animations d'attente automatiques
// (il suffira d'ajouter un "type" d'animation sans changer ce mecanisme de base).
let displayMessage = null; // { text, imageUrl, videoUrl, countdownSeconds, countdownEndsAt } | null

// Compte les ecrans "display" connectes, pour savoir si le gestionnaire doit
// couper son propre son (un grand ecran separe s'occupe alors de l'audio).
let displayClientCount = 0;
// Compte les telephones joueurs connectes (tous roles "phone", equipe choisie
// ou non) : affiche cote gestionnaire comme indicateur rapide de connexion
// avant de lancer la partie (pas une correspondance stricte 1 telephone = 1
// equipe, plusieurs personnes peuvent partager le meme telephone/la meme equipe).
let phoneClientCount = 0;
const socketRoles = new Map();

let config = {
  buzzMode: 'single',                 // 'single' (1 seul buzzer) ou 'podium3' (podium de 3)
  excludeWrongTeamAfterCooldown: true,  // une equipe fautive reste exclue pour le reste de la question
  maxAnswerSeconds: 0,                   // 0 = desactive ; temps de reflexion max avant deblocage automatique
  buzzVolume: 1                          // 0 a 1 : gain du son de buzz synthetise (cote telephone, voir buzz.js)
};

// Une fois le podium de 3 epuise (3 mauvaises reponses) sur une question, la
// suite se comporte comme le mode "un seul buzzer" (round.forceSingleMode) :
// plus de reconstitution d'un nouveau podium, chaque buzz suivant devient
// immediatement seul actif.
function capForMode() {
  if (round.forceSingleMode) return 1;
  return config.buzzMode === 'podium3' ? 3 : 1;
}

function freshRound() {
  return {
    open: false,           // une manche de buzz est en cours pour la question actuelle
    buzzes: [],             // [{team, ts}] dans l'ordre d'arrivee = classement du podium
    activeIndex: null,       // index dans buzzes de l'equipe actuellement "a la parole"
    activeTeam: null,         // pratique cote client : buzzes[activeIndex]?.team
    excludedTeams: [],         // equipes qui ne peuvent plus buzzer pour cette question
    forceSingleMode: false,     // podium epuise (3 mauvaises reponses) : cf capForMode()
    answerDeadlineAt: null,      // timestamp au-dela duquel le deblocage auto se declenche
    reflectionEndsAt: null,       // fin du temps imparti pour buzzer (epreuve.timer_enabled), avant verrouillage auto
    reflectionRemainingMs: null,   // temps restant memorise pendant qu'une equipe repond (timer en pause)
    startedAt: 0,
    lastResult: null   // { team, correct, points, ts, timeout } - dernier resultat de buzz annonce, affiche brievement sur le display
  };
}

let round = freshRound();
let answerDeadlineTimer = null;
let reflectionTimer = null;

function clearAnswerDeadlineTimer() {
  if (answerDeadlineTimer) { clearTimeout(answerDeadlineTimer); answerDeadlineTimer = null; }
}
function clearReflectionTimer() {
  if (reflectionTimer) { clearTimeout(reflectionTimer); reflectionTimer = null; }
}

// Timer optionnel (par epreuve) qui limite le temps disponible pour buzzer.
// Se met en pause des qu'une equipe est "a la parole" (setActiveIndex) — en
// meme temps que la musique/video, coupee cote client sur ce meme evenement —
// et reprend quand le buzz rouvre sans personne actif. A expiration, verrouille
// tous les buzzers (round.open = false), sans attendre de decision de l'animateur.
function startReflectionTimer(ms) {
  clearReflectionTimer();
  round.reflectionEndsAt = Date.now() + ms;
  round.reflectionRemainingMs = null;
  reflectionTimer = setTimeout(() => {
    reflectionTimer = null;
    round.reflectionEndsAt = null;
    round.open = false;
    game.mediaPlaying = false; // temps ecoule : la piste s'arrete en meme temps que le verrouillage des buzzers
    round.lastResult = { team: null, correct: false, points: null, ts: Date.now(), timeout: true }; // "Trop tard" sur le display
    broadcastState();
  }, ms);
}
function pauseReflectionTimer() {
  if (round.reflectionEndsAt) {
    round.reflectionRemainingMs = Math.max(0, round.reflectionEndsAt - Date.now());
    round.reflectionEndsAt = null;
  }
  clearReflectionTimer();
}
function resumeReflectionTimer() {
  if (round.reflectionRemainingMs != null) {
    const ms = round.reflectionRemainingMs;
    round.reflectionRemainingMs = null;
    startReflectionTimer(ms);
  }
}

function setActiveIndex(idx) {
  clearAnswerDeadlineTimer();
  round.activeIndex = idx;
  round.activeTeam = idx === null ? null : round.buzzes[idx].team;
  if (idx !== null) {
    pauseReflectionTimer(); // une equipe repond : le temps pour buzzer (et les medias, cote client) est en pause
  }
  if (idx !== null && config.maxAnswerSeconds > 0) {
    const delayMs = config.maxAnswerSeconds * 1000;
    round.answerDeadlineAt = Date.now() + delayMs;
    answerDeadlineTimer = setTimeout(() => {
      answerDeadlineTimer = null;
      handleWrong(); // temps ecoule sans decision de l'animateur : traite comme une mauvaise reponse
      broadcastState();
    }, delayMs);
  } else {
    round.answerDeadlineAt = null;
  }
}

// Reouvre immediatement le buzz (aucun delai/cooldown : ca n'apportait rien et
// donnait juste l'impression que le compte a rebours du temps pour buzzer
// bloquait). A partir de la, seul un nouveau buzz "single" peut etre actif
// (voir capForMode / round.forceSingleMode) : le podium ne se reforme pas.
function reopenSingleAfterPodiumExhausted() {
  setActiveIndex(null);
  round.forceSingleMode = true;
  round.buzzes = [];
  resumeReflectionTimer();
}

// Traite une mauvaise reponse (manuelle ou par expiration du temps de reflexion) :
// promotion immediate du buzzer suivant du podium s'il y en a un (2e, puis 3e) ;
// une fois les 3 epuisees, reouverture immediate en mode "un seul buzzer".
function handleWrong() {
  const wrongIdx = round.activeIndex;
  if (wrongIdx === null) return;
  const wrongTeam = round.buzzes[wrongIdx].team;
  // Resultat transitoire affiche brievement sur le display (voir syncMediaPlayback
  // cote client) : la musique/le minuteur reprennent ensuite normalement, ce n'est
  // pas la fin de la question (contrairement a une bonne reponse, cf resolve-correct).
  round.lastResult = { team: wrongTeam, correct: false, points: 0, ts: Date.now() };
  if (config.excludeWrongTeamAfterCooldown && !round.excludedTeams.includes(wrongTeam)) {
    round.excludedTeams.push(wrongTeam);
  }
  const nextIdx = wrongIdx + 1;
  if (nextIdx < round.buzzes.length) {
    setActiveIndex(nextIdx);
  } else {
    reopenSingleAfterPodiumExhausted();
  }
}

// ---- Partie en cours (scenario charge, position, reponses qcm/direct) ----
let game = {
  scenario: null,   // { id, name, epreuves: [{id, name, response_type, default_points, category, questions}] }
  epreuveIndex: 0,
  questionIndex: 0,
  menuVisible: true,     // true = aucune epreuve active, on montre le menu de choix (display + control)
  epreuveStarted: false, // une epreuve est choisie (question 1 armee) mais pas encore demarree par l'animateur
  showMenuOnDisplay: true, // etat LIVE (bascule a la volee), initialise depuis le scenario au lancement
  playedEpreuveIds: [],  // epreuves du scenario en cours deja lancees au moins une fois
  mediaPlaying: true,     // intention de lecture audio/video de la question courante, pilotee UNIQUEMENT par le gestionnaire
  mediaSeekSeconds: 0,     // derniere position demandee par le gestionnaire (glissement de la barre de lecture)
  mediaSeekToken: 0,       // incremente a chaque demande de positionnement : permet aux clients de detecter une NOUVELLE demande (vs. rejouer la meme au prochain etat recu)
  answers: {},       // { teamName: { value, ts } }
  validations: {}     // { teamName: 'correct' | 'wrong' }
};

// Choisit une epreuve du scenario (question 1 armee, previsualisable cote
// gestionnaire) sans rien demarrer : voir le gestionnaire 'launch-epreuve' et
// 'start-epreuve'. Aussi utilise par le lancement automatique apres un vote.
function launchEpreuve(epreuveId) {
  if (!game.scenario) return false;
  const idx = game.scenario.epreuves.findIndex((e) => e.id === epreuveId);
  if (idx === -1) return false;
  clearVote();
  game.epreuveIndex = idx;
  game.questionIndex = 0;
  game.menuVisible = false;
  game.epreuveStarted = false;
  game.answers = {};
  game.validations = {};
  game.mediaPlaying = false; // rien ne doit jouer avant le clic explicite sur "Lancer l'epreuve"
  if (!game.playedEpreuveIds.includes(epreuveId)) game.playedEpreuveIds.push(epreuveId);
  if (!sessionPlayedEpreuveNames.includes(game.scenario.epreuves[idx].name)) {
    sessionPlayedEpreuveNames.push(game.scenario.epreuves[idx].name);
  }
  clearAnswerDeadlineTimer();
  clearReflectionTimer();
  round = freshRound(); // buzzers fermes tant que non demarre
  displayMessage = null;
  return true;
}

// ---- Vote facultatif de l'epreuve suivante ----
// Une seule consultation a la fois, uniquement tant que le menu des epreuves est
// affiche. Un vote par equipe (modifiable jusqu'a la cloture). Les scores ne sont
// envoyes qu'au gestionnaire tant que le vote est ouvert et non "en direct"
// (voir broadcastState). Rien n'est persiste en base.
let vote = null; // { status:'open'|'closed', options:[epreuveId], votes:{team:epreuveId}, startedAt, endsAt, live, autoLaunch, winnerId, tiedIds, drawn, noVotes, launchAt }
let voteTimer = null;
let voteLaunchTimer = null;

function clearVoteTimers() {
  if (voteTimer) { clearTimeout(voteTimer); voteTimer = null; }
  if (voteLaunchTimer) { clearTimeout(voteLaunchTimer); voteLaunchTimer = null; }
}
function clearVote() {
  clearVoteTimers();
  vote = null;
}
function shuffled(list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function voteTally() {
  const tally = {};
  vote.options.forEach((id) => { tally[id] = 0; });
  Object.values(vote.votes).forEach((id) => { if (id in tally) tally[id]++; });
  return tally;
}

function startVote(opts) {
  opts = opts || {};
  if (!game.scenario) return { ok: false, error: 'Aucun scénario lancé.' };
  if (!game.menuVisible) return { ok: false, error: 'Le vote se lance depuis le menu des épreuves.' };
  if (teams.length === 0) return { ok: false, error: "Aucune équipe n'a encore rejoint." };
  const all = game.scenario.epreuves;
  const requested = Array.isArray(opts.epreuveIds) ? opts.epreuveIds : null;
  let candidates = requested
    ? all.filter((e) => requested.includes(e.id))
    : all.filter((e) => !game.playedEpreuveIds.includes(e.id));
  const count = parseInt(opts.count, 10) || 0;
  if (count >= 2 && candidates.length > count) candidates = shuffled(candidates).slice(0, count);
  if (candidates.length < 2) return { ok: false, error: 'Il faut au moins 2 épreuves à proposer.' };
  const duration = Math.min(600, Math.max(0, parseInt(opts.duration, 10) || 0));
  clearVoteTimers();
  const now = Date.now();
  vote = {
    status: 'open',
    options: candidates.map((e) => e.id),
    votes: {},
    startedAt: now,
    endsAt: duration > 0 ? now + duration * 1000 : null,
    live: !!opts.live,
    autoLaunch: !!opts.autoLaunch,
    winnerId: null, tiedIds: [], drawn: false, noVotes: false, launchAt: null
  };
  // Le vote prend la main sur le display (QR, classement, message libre).
  qrVisible = false;
  scoreboardVisible = null;
  displayMessage = null;
  if (duration > 0) voteTimer = setTimeout(() => { closeVote(); broadcastState(); }, duration * 1000);
  return { ok: true };
}

function scheduleVoteAutoLaunch(delayMs) {
  if (voteLaunchTimer) { clearTimeout(voteLaunchTimer); voteLaunchTimer = null; }
  if (!vote || !vote.autoLaunch) { if (vote) vote.launchAt = null; return; }
  vote.launchAt = Date.now() + delayMs;
  voteLaunchTimer = setTimeout(() => {
    voteLaunchTimer = null;
    if (vote && vote.status === 'closed' && vote.winnerId != null) {
      launchEpreuve(vote.winnerId);
      broadcastState();
    }
  }, delayMs);
}

function closeVote() {
  if (!vote || vote.status !== 'open') return;
  clearVoteTimers();
  const tally = voteTally();
  const max = Math.max(0, ...Object.values(tally));
  let leaders = vote.options.filter((id) => tally[id] === max);
  if (max === 0) { vote.noVotes = true; leaders = vote.options.slice(); } // personne n'a vote : tirage parmi toutes les options
  vote.drawn = leaders.length > 1;
  vote.tiedIds = vote.drawn ? leaders : [];
  vote.winnerId = leaders[Math.floor(Math.random() * leaders.length)];
  vote.status = 'closed';
  vote.endsAt = null;
  // Si egalite, on laisse le temps a l'animation de tirage du display.
  scheduleVoteAutoLaunch(vote.drawn ? 8000 : 5000);
}

// Vue du vote envoyee aux clients. includeSecret=true pour le gestionnaire ; sinon
// les scores/choix par equipe ne sont reveles que si le vote est "en direct" ou clos.
function publicVote(includeSecret) {
  if (!vote) return null;
  const reveal = includeSecret || vote.live || vote.status === 'closed';
  return {
    status: vote.status,
    options: vote.options,
    startedAt: vote.startedAt,
    endsAt: vote.endsAt,
    live: vote.live,
    autoLaunch: vote.autoLaunch,
    votedTeams: Object.keys(vote.votes),
    totalTeams: teams.length,
    tally: reveal ? voteTally() : null,
    votes: reveal ? vote.votes : null,
    winnerId: vote.winnerId,
    tiedIds: vote.tiedIds,
    drawn: vote.drawn,
    noVotes: vote.noVotes,
    launchAt: vote.launchAt
  };
}

// Proposition automatique apres une epreuve, selon les reglages du scenario.
function maybeAutoVote() {
  const settings = game.scenario && game.scenario.vote_settings;
  if (!settings || !settings.auto || teams.length === 0) return;
  if (game.playedEpreuveIds.length === 0) return;
  startVote({ count: settings.count, duration: settings.duration, live: settings.live, autoLaunch: settings.autoLaunch });
}

function loadScenarioIntoMemory(scenarioId) {
  const scenario = getScenarioStmt.get(scenarioId);
  if (!scenario) return null;
  const links = listScenarioEpreuvesStmt.all(scenarioId);
  const epreuves = links.map((link) => ({
    id: link.epreuve_id,
    name: link.epreuve_name,
    response_type: link.response_type_override || link.epreuve_response_type,
    default_points: link.default_points_override || link.epreuve_default_points,
    category: link.epreuve_category,
    timer_enabled: !!link.epreuve_timer_enabled,
    timer_seconds: link.epreuve_timer_seconds,
    host_note: link.epreuve_host_note,
    questions: listQuestionsForEpreuveStmt.all(link.epreuve_id).map(parseQuestionRow)
  }));
  return { id: scenario.id, name: scenario.name, show_menu_on_display: !!scenario.show_menu_on_display, vote_settings: normalizeVoteSettings(scenario.vote_settings), epreuves };
}

function currentQuestionInfo() {
  if (!game.scenario || game.menuVisible) return null;
  const epreuve = game.scenario.epreuves[game.epreuveIndex];
  if (!epreuve) return null;
  const question = epreuve.questions[game.questionIndex];
  if (!question) return null;
  return {
    epreuveName: epreuve.name,
    responseType: epreuve.response_type,
    defaultPoints: epreuve.default_points,
    timerEnabled: epreuve.timer_enabled,
    timerSeconds: epreuve.timer_seconds,
    hostNote: epreuve.host_note,
    epreuveIndex: game.epreuveIndex,
    questionIndex: game.questionIndex,
    totalEpreuves: game.scenario.epreuves.length,
    totalQuestionsInEpreuve: epreuve.questions.length,
    question
  };
}

function openCurrentQuestion() {
  game.answers = {};
  game.validations = {};
  game.mediaPlaying = true; // nouvelle question : la piste audio/video demarre automatiquement
  game.mediaSeekSeconds = 0;
  game.mediaSeekToken++; // nouvelle piste : tout positionnement demande sur la precedente ne doit pas s'appliquer ici
  displayMessage = null; // une question prend le relais de tout message libre laisse sur le display
  clearAnswerDeadlineTimer();
  clearReflectionTimer();
  const info = currentQuestionInfo();
  if (info && info.responseType === 'buzzer') {
    round = freshRound();
    round.open = true;
    round.startedAt = Date.now();
    if (info.timerEnabled && info.timerSeconds > 0) {
      startReflectionTimer(info.timerSeconds * 1000);
    }
  } else {
    round = freshRound(); // non utilise pour qcm/direct, garde l'etat propre
  }
}

// Remet le jeu en mode "menu" : plus aucune question active, l'animateur
// (et le grand ecran) voient la liste des epreuves du scenario a choisir.
function showEpreuveMenu() {
  game.menuVisible = true;
  game.epreuveStarted = false;
  game.answers = {};
  game.validations = {};
  displayMessage = null; // le menu des epreuves prend le relais de tout message libre laisse sur le display
  clearAnswerDeadlineTimer();
  clearReflectionTimer();
  round = freshRound();
}

// Navigue entre les questions d'UNE MEME epreuve. Le passage d'une epreuve a
// l'autre se fait exclusivement via le menu (launch-epreuve) : le choix de
// l'ordre des epreuves appartient a l'animateur, pas a un enchainement lineaire.
function advanceQuestion(delta) {
  if (!game.scenario || game.menuVisible) return;
  const epreuve = game.scenario.epreuves[game.epreuveIndex];
  if (!epreuve) return;
  const questionIndex = game.questionIndex + delta;
  if (questionIndex < 0) return; // deja la premiere question de cette epreuve
  if (questionIndex >= epreuve.questions.length) {
    showEpreuveMenu(); // plus de question ici : retour au menu pour choisir la suite
    maybeAutoVote();
    return;
  }
  game.questionIndex = questionIndex;
  openCurrentQuestion();
}

function currentState(includeSecret) {
  return {
    teams, teamScores, teamSounds, config, round, qrVisible, scoreboardVisible, displayMessage,
    displayConnected: displayClientCount > 0,
    phoneClientCount,
    rehearsalMode,
    vote: publicVote(!!includeSecret),
    game: {
      hasScenario: !!game.scenario,
      scenarioName: game.scenario ? game.scenario.name : null,
      voteSettings: game.scenario ? game.scenario.vote_settings : null,
      showMenuOnDisplay: !!game.showMenuOnDisplay,
      menuVisible: game.menuVisible,
      epreuveStarted: game.epreuveStarted,
      epreuves: game.scenario ? game.scenario.epreuves.map((e) => ({
        id: e.id,
        name: e.name,
        category: e.category,
        responseType: e.response_type,
        defaultPoints: e.default_points,
        questionCount: e.questions.length
      })) : [],
      playedEpreuveIds: game.playedEpreuveIds,
      mediaPlaying: game.mediaPlaying,
      mediaSeekSeconds: game.mediaSeekSeconds,
      mediaSeekToken: game.mediaSeekToken,
      current: currentQuestionInfo(),
      answers: game.answers,
      validations: game.validations
    }
  };
}

function broadcastState() {
  if (!io) return; // pas encore attache a un serveur HTTP
  // Le gestionnaire voit toujours les scores du vote ; display et telephones ne
  // les recoivent que si le vote est "en direct" ou clos (voir publicVote).
  const full = currentState(true);
  const hideSecret = vote && vote.status === 'open' && !vote.live;
  const redacted = hideSecret ? currentState(false) : full;
  for (const [id, s] of io.sockets.sockets) {
    s.emit('state', socketRoles.get(id) === 'control' ? full : redacted);
  }
}

function registerSocketHandlers() {
io.on('connection', (socket) => {
  socket.emit('state', currentState());

  // Envoye par chaque ecran a la connexion pour s'identifier ('control', 'display' ou 'phone').
  socket.on('register-role', (role) => {
    const previous = socketRoles.get(socket.id);
    if (previous === 'display') displayClientCount--;
    if (previous === 'phone') phoneClientCount--;
    if (role === 'display') displayClientCount++;
    if (role === 'phone') phoneClientCount++;
    socketRoles.set(socket.id, role);
    broadcastState();
  });

  socket.on('disconnect', () => {
    const role = socketRoles.get(socket.id);
    if (role === 'display') displayClientCount--;
    if (role === 'phone') phoneClientCount--;
    socketRoles.delete(socket.id);
    broadcastState();
  });

  // Envoye par l'ecran gestionnaire pour afficher/masquer le QR code en grand sur le projo.
  socket.on('show-qr', () => { qrVisible = true; displayMessage = null; broadcastState(); });
  socket.on('hide-qr', () => { qrVisible = false; broadcastState(); });

  // Envoye par l'ecran gestionnaire pour afficher/masquer un classement sur le grand ecran
  // (partie en cours, ou top 10 toutes parties confondues avec les lignes deja calculees).
  socket.on('show-scoreboard', (payload) => {
    if (!payload || (payload.type !== 'current' && payload.type !== 'alltime')) return;
    scoreboardVisible = payload;
    displayMessage = null;
    broadcastState();
  });
  socket.on('hide-scoreboard', () => { scoreboardVisible = null; broadcastState(); });

  // Envoye par l'ecran gestionnaire pour afficher un message libre sur le display
  // (texte/image/video/compte a rebours, tous optionnels et combinables) : ecran
  // d'attente avant le debut du jeu, pause, etc.
  socket.on('show-display-message', (payload) => {
    if (!payload || typeof payload !== 'object') return;
    const seconds = Number(payload.countdownSeconds);
    displayMessage = {
      text: typeof payload.text === 'string' && payload.text.trim() ? payload.text.trim() : null,
      imageUrl: typeof payload.imageUrl === 'string' && payload.imageUrl ? payload.imageUrl : null,
      videoUrl: typeof payload.videoUrl === 'string' && payload.videoUrl ? payload.videoUrl : null,
      countdownSeconds: seconds > 0 ? seconds : null,
      countdownEndsAt: seconds > 0 ? Date.now() + seconds * 1000 : null
    };
    broadcastState();
  });
  socket.on('hide-display-message', () => { displayMessage = null; broadcastState(); });

  // Envoye par l'ecran animateur a chaque creation/suppression d'equipe ou changement de score/son.
  socket.on('sync-teams', (incomingTeams) => {
    if (!Array.isArray(incomingTeams)) return;
    const cleaned = incomingTeams.filter((t) => t && typeof t.name === 'string' && t.name.trim() !== '');
    const newNames = cleaned.map((t) => t.name);

    if (newNames.length === 0 && teams.length > 0) {
      persistFinishedSession();
    }
    if (newNames.length > 0 && teams.length === 0) {
      sessionStartedAt = Date.now();
      sessionPlayedEpreuveNames = [];
    }

    teams = newNames;
    teamScores = {};
    teamSounds = {};
    cleaned.forEach((t) => {
      teamScores[t.name] = Number(t.value) || 0;
      teamSounds[t.name] = typeof t.sound === 'string' ? t.sound : (teamSounds[t.name] || 'cloche');
    });

    round.buzzes = round.buzzes.filter((b) => teams.includes(b.team));
    round.excludedTeams = round.excludedTeams.filter((t) => teams.includes(t));
    if (round.activeTeam && !teams.includes(round.activeTeam)) {
      clearAnswerDeadlineTimer();
      round.activeIndex = null;
      round.activeTeam = null;
    }
    broadcastState();
  });

  // Envoye par un telephone joueur qui cree sa propre equipe (nom + son choisi).
  socket.on('create-team', ({ name, sound } = {}) => {
    if (typeof name !== 'string') return;
    const trimmed = name.trim();
    if (!trimmed) return;
    if (teams.includes(trimmed)) {
      socket.emit('create-team-rejected', { reason: 'Ce nom est deja pris.' });
      return;
    }
    if (teams.length === 0) { sessionStartedAt = Date.now(); sessionPlayedEpreuveNames = []; }
    teams.push(trimmed);
    teamScores[trimmed] = 0;
    teamSounds[trimmed] = typeof sound === 'string' ? sound : 'cloche';
    // Diffuser le nouvel etat AVANT la confirmation : le client doit deja voir
    // la nouvelle equipe dans latestState quand il traite 'create-team-accepted'
    // (sinon son render() la croit inexistante et annule la selection).
    broadcastState();
    socket.emit('create-team-accepted', { name: trimmed });
  });

  // Envoye par l'ecran animateur : verrouille tous les buzzers (plus personne ne peut buzzer).
  socket.on('lock-all', () => {
    clearAnswerDeadlineTimer();
    pauseReflectionTimer();
    round.open = false;
    broadcastState();
  });

  // Envoye par l'ecran animateur : reouvre le buzzer a TOUTES les equipes (remise a zero complete,
  // y compris le temps pour buzzer si l'epreuve en a un).
  socket.on('unlock-all', () => {
    if (game.scenario && !game.menuVisible && !game.epreuveStarted) return; // voir open-round
    clearAnswerDeadlineTimer();
    // Capturer le temps qu'il reste AVANT de reinitialiser le round : que le
    // minuteur soit en pause (round.reflectionRemainingMs) ou en train de
    // tourner (round.reflectionEndsAt, personne actif), il ne doit jamais
    // repartir de zero suite a un simple "Deverrouiller tout".
    const savedRemaining = round.reflectionRemainingMs != null
      ? round.reflectionRemainingMs
      : (round.reflectionEndsAt ? Math.max(0, round.reflectionEndsAt - Date.now()) : null);
    clearReflectionTimer();
    const startedAt = round.startedAt || Date.now();
    round = freshRound();
    round.open = true;
    round.startedAt = startedAt;
    if (savedRemaining != null) {
      round.reflectionRemainingMs = savedRemaining;
      resumeReflectionTimer();
    } else {
      const info = currentQuestionInfo();
      if (info && info.timerEnabled && info.timerSeconds > 0) {
        startReflectionTimer(info.timerSeconds * 1000);
      }
    }
    broadcastState();
  });

  // Envoye par l'ecran animateur : reouvre uniquement pour les equipes qui n'ont pas
  // encore repondu (les equipes deja exclues le restent).
  socket.on('unlock-remaining', () => {
    if (game.scenario && !game.menuVisible && !game.epreuveStarted) return; // voir open-round
    clearAnswerDeadlineTimer();
    round.open = true;
    round.buzzes = [];
    round.activeIndex = null;
    round.activeTeam = null;
    round.answerDeadlineAt = null;
    resumeReflectionTimer();
    broadcastState();
  });

  // Envoye par l'ecran animateur pour changer les reglages du buzzer.
  socket.on('set-config', (incomingConfig) => {
    if (!incomingConfig || typeof incomingConfig !== 'object') return;
    if (incomingConfig.buzzMode === 'single' || incomingConfig.buzzMode === 'podium3') {
      config.buzzMode = incomingConfig.buzzMode;
    }
    if (typeof incomingConfig.excludeWrongTeamAfterCooldown === 'boolean') {
      config.excludeWrongTeamAfterCooldown = incomingConfig.excludeWrongTeamAfterCooldown;
    }
    if (typeof incomingConfig.maxAnswerSeconds === 'number' && incomingConfig.maxAnswerSeconds >= 0) {
      config.maxAnswerSeconds = incomingConfig.maxAnswerSeconds;
    }
    if (typeof incomingConfig.buzzVolume === 'number' && incomingConfig.buzzVolume >= 0 && incomingConfig.buzzVolume <= 1) {
      config.buzzVolume = incomingConfig.buzzVolume;
    }
    broadcastState();
  });

  // Envoye par l'ecran animateur pour ouvrir une nouvelle manche de buzz (question de type buzzer,
  // hors scenario, ou pour relancer manuellement la question courante).
  socket.on('open-round', () => {
    // Une epreuve de scenario armee mais pas encore demarree ne doit pas pouvoir
    // etre ouverte par ce raccourci : ca passe par "Lancer l'epreuve" uniquement.
    if (game.scenario && !game.menuVisible && !game.epreuveStarted) return;
    clearAnswerDeadlineTimer();
    clearReflectionTimer();
    round = freshRound();
    round.open = true;
    round.startedAt = Date.now();
    const info = currentQuestionInfo();
    if (info && info.timerEnabled && info.timerSeconds > 0) {
      startReflectionTimer(info.timerSeconds * 1000);
    }
    broadcastState();
  });

  // Envoye par un telephone joueur (question de type buzzer).
  socket.on('buzz', (team) => {
    if (!round.open) return;
    if (typeof team !== 'string' || !teams.includes(team)) return;
    if (round.excludedTeams.includes(team)) return;
    if (round.buzzes.some((b) => b.team === team)) return; // deja buzze pour cette collecte
    if (round.buzzes.length >= capForMode()) return; // podium (ou buzzer unique) deja complet

    const ts = Date.now() - round.startedAt;
    round.buzzes.push({ team, ts });
    if (round.activeIndex === null) {
      setActiveIndex(round.buzzes.length - 1);
    }
    if (!sessionStats.fastestBuzz || ts < sessionStats.fastestBuzz.ms) {
      sessionStats.fastestBuzz = { team, ms: ts };
    }
    broadcastState();
  });

  // Envoye par l'ecran gestionnaire en cliquant sur une equipe de la file d'attente :
  // lui donne la parole immediatement, hors ordre d'arrivee (utile si l'animateur
  // veut passer directement a une equipe precise). Reutilise setActiveIndex, qui
  // gere deja la pause du minuteur de reflexion et le lancement du temps de parole
  // (round.answerDeadlineAt, affiche cote display) exactement comme un buzz normal.
  socket.on('select-active-buzz', (team) => {
    if (!round.open) return;
    if (typeof team !== 'string') return;
    if (round.excludedTeams.includes(team)) return; // equipe deja fautive pour cette question
    const idx = round.buzzes.findIndex((b) => b.team === team);
    if (idx === -1 || idx === round.activeIndex) return;
    setActiveIndex(idx);
    broadcastState();
  });

  // Envoye par le bouton "Annuler la derniere validation" quand l'action a
  // tort etait une mauvaise reponse : reintegre l'equipe dans la question en
  // cours (elle redevient eligible pour buzzer/repondre). Filet de securite
  // pour un clic accidentel sur "Mauvaise reponse" - ne touche volontairement
  // pas aux minuteurs/a la position dans la file, seulement a l'exclusion.
  socket.on('unexclude-team', (team) => {
    if (typeof team !== 'string') return;
    const idx = round.excludedTeams.indexOf(team);
    if (idx === -1) return;
    round.excludedTeams.splice(idx, 1);
    broadcastState();
  });

  // Envoye par l'ecran animateur : la reponse de l'equipe active (buzzer) etait bonne.
  // Les points sont geres cote animateur (localStorage, puis re-synchronises) ;
  // ici on cloture simplement la manche de buzz.
  // payload optionnel { points, team } : le montant de points est deja connu cote
  // gestionnaire au moment du clic (modale de points), autant l'annoncer au display
  // plutot que de le re-deviner cote serveur.
  socket.on('resolve-correct', ({ points, team } = {}) => {
    const resolvedTeam = typeof team === 'string' && team ? team : round.activeTeam;
    clearAnswerDeadlineTimer();
    clearReflectionTimer();
    round = freshRound();
    if (resolvedTeam) {
      round.lastResult = { team: resolvedTeam, correct: true, points: typeof points === 'number' ? points : null, ts: Date.now() };
      sessionStats.correctCounts[resolvedTeam] = (sessionStats.correctCounts[resolvedTeam] || 0) + 1;
    }
    // Bonne reponse : la question est terminee, pas de reprise de la musique/du minuteur.
    game.mediaPlaying = false;
    broadcastState();
  });

  // Envoye par l'ecran animateur : la reponse de l'equipe active (buzzer) etait mauvaise.
  socket.on('resolve-wrong', () => {
    handleWrong();
    broadcastState();
  });

  // --- Scenario / questions qcm-direct ---

  socket.on('launch-scenario', (scenarioId) => {
    const loaded = loadScenarioIntoMemory(scenarioId);
    if (!loaded) return;
    // Basculer sur un nouveau scenario avec des equipes deja en jeu archive
    // automatiquement la partie en cours dans l'historique (les equipes et
    // leurs scores continuent, mais c'est une nouvelle "partie" pour l'historique).
    if (teams.length > 0) {
      persistFinishedSession();
      sessionStartedAt = Date.now();
      resetSessionStats();
    }
    game.scenario = loaded;
    game.epreuveIndex = 0;
    game.questionIndex = 0;
    game.playedEpreuveIds = [];
    clearVote();
    game.showMenuOnDisplay = loaded.show_menu_on_display; // valeur par defaut du scenario, ajustable a la volee ensuite
    displayMessage = null; // le contenu du jeu prend le relais de l'ecran d'attente
    scoreboardVisible = null; // masque un eventuel classement de fin de partie encore affiche
    showEpreuveMenu();
    broadcastState();
  });

  // Envoye par l'ecran gestionnaire pour basculer a la volee l'affichage du
  // menu des epreuves sur le display (independamment du reglage par defaut
  // enregistre sur le scenario).
  socket.on('toggle-menu-on-display', (value) => {
    if (typeof value !== 'boolean') return;
    game.showMenuOnDisplay = value;
    broadcastState();
  });

  // Mode repetition : bascule a la volee (voir persistFinishedSession, qui
  // saute l'ecriture en base tant qu'il est actif). Pense a etre reactive
  // pour la vraie soiree - reste actif tant que le serveur tourne.
  socket.on('set-rehearsal-mode', (value) => {
    if (typeof value !== 'boolean') return;
    rehearsalMode = value;
    broadcastState();
  });

  // Envoye par l'ecran gestionnaire pour cloturer explicitement la partie : archive
  // dans l'historique, vide les equipes (nouvelle partie a venir) et affiche le
  // classement final sur le display avec le message de fin.
  socket.on('close-game', () => {
    if (teams.length === 0) return;
    const finalRanking = teams
      .map((t) => ({ team_name: t, score: teamScores[t] || 0 }))
      .sort((a, b) => b.score - a.score);
    // Recap enrichi au-dela du simple classement : buzzer le plus rapide de
    // la partie et equipe qui a le plus souvent eu bon (compteurs accumules
    // pendant la session, voir sessionStats / resetSessionStats).
    const statLines = [];
    if (sessionStats.fastestBuzz) {
      statLines.push('⚡ Buzzer le plus rapide : ' + sessionStats.fastestBuzz.team + ' (' + (sessionStats.fastestBuzz.ms / 1000).toFixed(2) + 's)');
    }
    const topCorrectEntry = Object.entries(sessionStats.correctCounts).sort((a, b) => b[1] - a[1])[0];
    if (topCorrectEntry) {
      statLines.push('🎯 Plus de bonnes réponses : ' + topCorrectEntry[0] + ' (' + topCorrectEntry[1] + ')');
    }
    persistFinishedSession();
    clearVote();
    teams = [];
    teamScores = {};
    teamSounds = {};
    displayMessage = null;
    scoreboardVisible = { type: 'closing', title: 'Le jeu est terminé', rows: finalRanking, statLines };
    resetSessionStats();
    broadcastState();
  });

  // Envoye par l'ecran gestionnaire pour revenir au menu de choix des epreuves
  // (ex. une fois une epreuve terminee, ou pour changer d'avis en cours de route).
  socket.on('show-epreuve-menu', () => {
    if (!game.scenario) return;
    const wasStarted = game.epreuveStarted;
    showEpreuveMenu();
    if (wasStarted) maybeAutoVote(); // retour au menu apres une epreuve jouee
    broadcastState();
  });

  // Envoye par l'ecran gestionnaire pour lancer une epreuve precise du scenario
  // (choisie dans le menu), dans n'importe quel ordre, jouee ou non.
  // Choisit l'epreuve (question 1 armee, previsualisable cote gestionnaire) mais
  // NE DEMARRE RIEN : ni round de buzz, ni minuteur, ni lecture audio/video. Ca
  // attend le clic explicite sur "Lancer l'epreuve" (voir start-epreuve) pour
  // eviter qu'une piste ne parte de facon impromptue des le choix de l'epreuve.
  socket.on('launch-epreuve', (epreuveId) => {
    if (launchEpreuve(epreuveId)) broadcastState();
  });

  // ---- Vote facultatif de l'epreuve suivante (voir startVote / closeVote) ----
  socket.on('start-vote', (opts, ack) => {
    const result = startVote(opts);
    if (result.ok) broadcastState();
    if (typeof ack === 'function') ack(result);
  });
  socket.on('cast-vote', ({ team, epreuveId } = {}, ack) => {
    const ok = !!vote && vote.status === 'open' && typeof team === 'string' && teams.includes(team) && vote.options.includes(epreuveId);
    if (ok) {
      vote.votes[team] = epreuveId;
      if (teams.every((t) => vote.votes[t] !== undefined)) closeVote(); // tout le monde a vote
      broadcastState();
    }
    if (typeof ack === 'function') ack({ ok });
  });
  socket.on('end-vote', () => { closeVote(); broadcastState(); });
  socket.on('cancel-vote', () => { clearVote(); broadcastState(); });
  // L'animateur tranche (egalite, ou simple envie de changer d'avis) apres cloture.
  socket.on('set-vote-winner', (epreuveId) => {
    if (!vote || vote.status !== 'closed' || !vote.options.includes(epreuveId)) return;
    vote.winnerId = epreuveId;
    vote.drawn = false;
    vote.tiedIds = [];
    scheduleVoteAutoLaunch(5000);
    broadcastState();
  });

  // Envoye par le bouton "Lancer l'epreuve" du gestionnaire : ouvre reellement la
  // premiere question (round de buzz, minuteur, lecture audio/video demarree).
  socket.on('start-epreuve', () => {
    if (!game.scenario || game.menuVisible || game.epreuveStarted) return;
    game.epreuveStarted = true;
    openCurrentQuestion();
    broadcastState();
  });

  socket.on('next-question', () => { advanceQuestion(1); broadcastState(); });
  socket.on('prev-question', () => { advanceQuestion(-1); broadcastState(); });

  // Envoye UNIQUEMENT par l'ecran gestionnaire (le display n'a aucun controle) pour
  // demarrer/mettre en pause la piste audio/video de la question courante ; diffuse
  // a tous les ecrans pour qu'ils restent synchronises (voir syncMediaPlayback cote client).
  socket.on('set-media-playing', (playing) => {
    if (typeof playing !== 'boolean') return;
    game.mediaPlaying = playing;
    // Le decompte pour buzzer (round.reflectionEndsAt) tourne pendant que la
    // question joue : le mettre en pause en meme temps que la piste (l'animateur
    // coupe le son pour discuter, par ex.) plutot que de le laisser decompter
    // dans le vide. A la reprise, on ne le relance que si aucune equipe n'est
    // deja active (sinon il est deja en pause pour cette raison-la, geree par
    // setActiveIndex/handleWrong - pas de resume premature pendant une reponse).
    if (playing) {
      if (!round.activeTeam) resumeReflectionTimer();
    } else {
      pauseReflectionTimer();
    }
    broadcastState();
  });

  // Envoye par l'ecran gestionnaire quand il fait glisser la barre de lecture
  // (evenement natif "seeked") : jusqu'ici seul l'etat lecture/pause etait
  // synchronise, pas la position, donc deplacer le curseur n'avait aucun effet
  // sur ce qui etait reellement diffuse. mediaSeekToken change a chaque appel
  // pour que les clients sachent qu'il s'agit d'une NOUVELLE demande (et non
  // le simple renvoi du dernier etat connu a chaque broadcastState()).
  socket.on('set-media-position', (seconds) => {
    if (typeof seconds !== 'number' || !isFinite(seconds) || seconds < 0) return;
    game.mediaSeekSeconds = seconds;
    game.mediaSeekToken++;
    broadcastState();
  });

  // Envoye par un telephone joueur pour une question qcm/direct : une seule reponse par equipe.
  socket.on('submit-answer', ({ team, value } = {}) => {
    const info = currentQuestionInfo();
    if (!info || info.responseType === 'buzzer' || !game.epreuveStarted) return;
    if (typeof team !== 'string' || !teams.includes(team)) return;
    if (game.answers[team]) return;
    game.answers[team] = { value, ts: Date.now() };
    broadcastState();
  });

  // Envoye par l'ecran animateur pour valider/refuser la reponse d'une equipe (qcm/direct) ;
  // applique les points par defaut de l'epreuve (ou l'override du scenario), sauf montant fourni.
  socket.on('validate-answer', ({ team, correct, points } = {}) => {
    const info = currentQuestionInfo();
    if (!info) return;
    if (typeof team !== 'string' || !teams.includes(team)) return;
    const awarded = correct ? (typeof points === 'number' ? points : info.defaultPoints) : 0;
    game.validations[team] = { status: correct ? 'correct' : 'wrong', points: awarded };
    if (correct) {
      teamScores[team] = (teamScores[team] || 0) + awarded;
    }
    broadcastState();
  });
});
}

function persistFinishedSession() {
  if (!sessionStartedAt || teams.length === 0) return;
  if (rehearsalMode) {
    // Mode repetition : la partie ne doit laisser aucune trace dans
    // l'historique (utile pour tester tout le deroule avant la vraie soiree
    // sans polluer les vraies statistiques).
    sessionStartedAt = null;
    sessionPlayedEpreuveNames = [];
    return;
  }
  const shareToken = crypto.randomUUID();
  const gameId = insertGame.run(sessionStartedAt, Date.now(), JSON.stringify(sessionPlayedEpreuveNames), shareToken).lastInsertRowid;
  teams.forEach((teamName) => {
    insertGameTeam.run(gameId, teamName, teamScores[teamName] || 0);
  });
  sessionStartedAt = null;
  sessionPlayedEpreuveNames = [];
}

// Socket.IO s'attache a un serveur HTTP, pas a une app Express. Deux modes :
// - autonome (node server.js) : serveur HTTP propre a l'app, chemin /socket.io ;
// - monte dans la passerelle node-gateway (apps/<nom>/) : la passerelle appelle
//   attachToServer() avec SON serveur HTTP et le prefixe de montage (ex. /quiz),
//   Socket.IO ecoute alors sur /quiz/socket.io. Voir README.md ("Passerelle").
function createIo(httpServer, mountPath) {
  const prefix = String(mountPath || '').replace(/\/+$/, '');
  io = new Server(httpServer, { cors: { origin: '*' }, path: prefix + '/socket.io' });
  registerSocketHandlers();
}

app.attachToServer = (httpServer, options) => {
  if (io) return; // deja attache
  createIo(httpServer, options && options.mountPath);
};
module.exports = app;

if (require.main === module) {
  createIo(server, '');
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Buzz server listening on port ${PORT}`);
  });
}
