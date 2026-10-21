// Migration ponctuelle : convertit le contenu fige de l'ancien deck reveal.js
// (ecrit a la main dans index.html) en epreuves/questions du nouveau systeme,
// reunies dans un scenario "Quiz d'origine".
//
// A executer UNE FOIS, avant de retirer le deck reveal.js d'index.html (ce
// script lit index.html tel qu'il existe encore a ce moment-la).
//
// Usage : node server/scripts/migrate-legacy-content.js

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const indexPath = path.join(__dirname, '..', '..', 'index.html');
const dbPath = path.join(__dirname, '..', 'data', 'quiz.db');

const html = fs.readFileSync(indexPath, 'utf-8');

// Points par defaut, repris du libelle du menu actuel ("Nom - N pts").
const DEFAULT_POINTS = {
  'Komençasapel': 30, 'Ilapasaimé': 40, 'Kelkouleurkecest': 20, 'Imagekiditout': 30,
  'Lekeldesmichels': 16, 'Kikiladit': 20, 'Dukançadate': 30, 'Kélélerapor': 25,
  'Vraipasvrai': 20, 'Tulententulavu': 15, 'Blablaremix': 30, 'Akikilabarbe': 20
};

// Ordre d'apparition dans le fichier (necessaire pour decouper les regions).
const NAMES_IN_ORDER = [
  'Komençasapel', 'Kelkouleurkecest', 'Lekeldesmichels', 'Dukançadate',
  'Vraipasvrai', 'Ilapasaimé', 'Blablaremix', 'Imagekiditout', 'Kikiladit',
  'Kélélerapor', 'Akikilabarbe', 'Tulententulavu'
];

// Epreuves purement textuelles (citations detournees), sans media.
const TEXT_ONLY = new Set(['Ilapasaimé', 'Blablaremix']);

function findRegion(name, nextName) {
  const startMarker = `id="${name}"`;
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) throw new Error('Introuvable dans index.html : ' + name);
  const endIdx = nextName ? html.indexOf(`id="${nextName}"`, startIdx) : html.indexOf('</div>\r\n\t\t\t\t\t</div>', startIdx);
  return html.slice(startIdx, endIdx === -1 ? undefined : endIdx);
}

function extractQuestions(name, region) {
  if (TEXT_ONLY.has(name)) {
    const matches = [...region.matchAll(/<div class="citation">([\s\S]*?)<\/div>/g)];
    return matches.map((m) => ({ text: m[1].trim(), images: [], audio_path: null, video_path: null }));
  }

  // Questions audio (un seul <video src="..."> par question).
  const videoMatches = [...region.matchAll(/<video[^>]*\bsrc="([^"]+)"/g)];
  if (videoMatches.length > 0) {
    return videoMatches.map((m) => ({ text: null, images: [], audio_path: m[1], video_path: null }));
  }

  // Questions image : chaque bloc "row question" + une ou plusieurs <img data-src="...">,
  // separes en decoupant sur chaque nouvelle consigne ("row question").
  const blocks = region.split('<div class="row question">').slice(1);
  if (blocks.length > 0) {
    return blocks.map((block) => {
      const textMatch = block.match(/<strong>\s*([\s\S]*?)\s*<\/strong>/);
      const images = [...block.matchAll(/data-src="([^"]+)"/g)].map((m) => m[1]);
      return { text: textMatch ? textMatch[1].trim() : null, images, audio_path: null, video_path: null };
    });
  }

  return [];
}

function categoryFor(questions) {
  return questions.some((q) => q.audio_path) ? 'musique' : 'cinema';
}

const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS epreuves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    response_type TEXT NOT NULL,
    category TEXT,
    default_points INTEGER NOT NULL DEFAULT 10
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
    FOREIGN KEY(epreuve_id) REFERENCES epreuves(id)
  );
  CREATE TABLE IF NOT EXISTS scenarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
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
`);

const insertEpreuve = db.prepare('INSERT INTO epreuves (name, response_type, category, default_points) VALUES (?, ?, ?, ?)');
const insertQuestion = db.prepare('INSERT INTO questions (epreuve_id, order_index, text, images, audio_path, video_path) VALUES (?, ?, ?, ?, ?, ?)');
const insertScenario = db.prepare('INSERT INTO scenarios (name) VALUES (?)');
const insertScenarioEpreuve = db.prepare('INSERT INTO scenario_epreuves (scenario_id, epreuve_id, order_index) VALUES (?, ?, ?)');

const scenarioId = insertScenario.run("Quiz d'origine").lastInsertRowid;

NAMES_IN_ORDER.forEach((name, i) => {
  const region = findRegion(name, NAMES_IN_ORDER[i + 1]);
  const questions = extractQuestions(name, region);
  if (questions.length === 0) {
    console.warn('!! Aucune question trouvee pour', name, '- verifier manuellement.');
  }
  const epreuveId = insertEpreuve.run(name, 'buzzer', categoryFor(questions), DEFAULT_POINTS[name] || 10).lastInsertRowid;
  questions.forEach((q, qi) => {
    insertQuestion.run(epreuveId, qi, q.text, JSON.stringify(q.images), q.audio_path, q.video_path);
  });
  insertScenarioEpreuve.run(scenarioId, epreuveId, i);
  console.log(name, '->', questions.length, 'question(s)');
});

console.log('\nMigration terminee. Scenario "Quiz d\'origine" cree avec', NAMES_IN_ORDER.length, 'epreuves.');
