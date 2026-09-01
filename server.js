const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Stockage des donnees (persistant sur Azure App Service via /home/data)
// ---------------------------------------------------------------------------
const DATA_DIR =
  process.env.DATA_DIR ||
  (fs.existsSync('/home') ? '/home/data' : path.join(__dirname, 'data'));

fs.mkdirSync(DATA_DIR, { recursive: true });

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const RESULTS_DIR = path.join(DATA_DIR, 'results');
fs.mkdirSync(RESULTS_DIR, { recursive: true });

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// Cree un compte eleve par defaut au premier demarrage.
// Personnalisable via les variables d'environnement DEFAULT_LOGIN / DEFAULT_PASSWORD.
function seedDefaultUser() {
  let users = readJson(USERS_FILE, null);
  if (!users) users = {};
  const login = (process.env.DEFAULT_LOGIN || 'eleve').toLowerCase();
  if (!users[login]) {
    const pwd = process.env.DEFAULT_PASSWORD || 'ce1';
    users[login] = {
      login,
      displayName: process.env.DEFAULT_NAME || 'Ma championne',
      passwordHash: bcrypt.hashSync(pwd, 10),
      createdAt: new Date().toISOString(),
    };
    writeJson(USERS_FILE, users);
    console.log(`[seed] Compte cree : login="${login}" mot de passe="${pwd}"`);
  }
  return users;
}
seedDefaultUser();

function getUsers() {
  return readJson(USERS_FILE, {});
}

// ---------------------------------------------------------------------------
// Middlewares
// ---------------------------------------------------------------------------
app.set('trust proxy', 1); // derriere le proxy HTTPS d'Azure App Service
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'ce1-compagnon-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: 'auto', // cookie securise automatiquement en HTTPS
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

function requireAuth(req, res, next) {
  if (req.session && req.session.login) return next();
  return res.status(401).json({ error: 'Non connecte' });
}

// ---------------------------------------------------------------------------
// API d'authentification
// ---------------------------------------------------------------------------
app.post('/api/login', (req, res) => {
  const login = String(req.body.login || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const users = getUsers();
  const user = users[login];
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
  }
  req.session.login = login;
  res.json({ login: user.login, displayName: user.displayName });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session || !req.session.login) return res.status(401).json({ error: 'Non connecte' });
  const user = getUsers()[req.session.login];
  if (!user) return res.status(401).json({ error: 'Non connecte' });
  res.json({ login: user.login, displayName: user.displayName });
});

// ---------------------------------------------------------------------------
// API des resultats (une session = un soir)
// ---------------------------------------------------------------------------
function resultsFileFor(login) {
  return path.join(RESULTS_DIR, `${login}.json`);
}

app.get('/api/history', requireAuth, (req, res) => {
  const all = readJson(resultsFileFor(req.session.login), []);
  res.json(all);
});

app.post('/api/session', requireAuth, (req, res) => {
  const s = req.body || {};
  const entry = {
    date: (s.date || new Date().toISOString().slice(0, 10)),
    startedAt: s.startedAt || null,
    finishedAt: new Date().toISOString(),
    durationSec: Number(s.durationSec) || 0,
    total: Number(s.total) || 0,
    scoreSum: Number(s.scoreSum) || 0,
    scoreMax: Number(s.scoreMax) || 0,
    percent: Number(s.percent) || 0,
    grade: String(s.grade || ''),
    note20: Number(s.note20) || 0,
    counts: s.counts || {},
    details: Array.isArray(s.details) ? s.details.slice(0, 200) : [],
  };
  const all = readJson(resultsFileFor(req.session.login), []);
  // Une seule entree par jour : on garde la meilleure note du soir.
  const idx = all.findIndex((e) => e.date === entry.date);
  if (idx >= 0) {
    if (entry.percent >= all[idx].percent) all[idx] = entry;
  } else {
    all.push(entry);
  }
  all.sort((a, b) => (a.date < b.date ? -1 : 1));
  writeJson(resultsFileFor(req.session.login), all);
  res.json({ ok: true, entry });
});

// ---------------------------------------------------------------------------
// Fichiers statiques + SPA
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`CE1 Compagnon demarre sur le port ${PORT}`);
  console.log(`Donnees stockees dans : ${DATA_DIR}`);
});
