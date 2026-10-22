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
  (fs.existsSync('/home') && process.env.WEBSITE_SITE_NAME ? '/home/data' : path.join(__dirname, 'data'));

fs.mkdirSync(DATA_DIR, { recursive: true });

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
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
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

// ---------------------------------------------------------------------------
// Utilisateurs
//   role : "admin" (parent / enseignant) ou "eleve"
// ---------------------------------------------------------------------------
const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{1,29}$/;
const MIN_PASSWORD = 4;
const ROLES = ['admin', 'eleve'];

function getUsers() {
  const users = readJson(USERS_FILE, {});
  // Compatibilite : anciens comptes sans role => eleve
  Object.values(users).forEach((u) => {
    if (!ROLES.includes(u.role)) u.role = 'eleve';
  });
  return users;
}
function saveUsers(users) {
  writeJson(USERS_FILE, users);
}
function hasAdmin(users) {
  return Object.values(users).some((u) => u.role === 'admin');
}
function publicUser(u) {
  return { login: u.login, displayName: u.displayName, role: u.role, createdAt: u.createdAt || null };
}

function getSettings() {
  return Object.assign({ allowSignup: true }, readJson(SETTINGS_FILE, {}));
}

function validateNewUser(body, users) {
  const login = String(body.login || '').trim().toLowerCase();
  const password = String(body.password || '');
  const displayName = String(body.displayName || '').trim().slice(0, 40) || login;
  if (!LOGIN_RE.test(login)) {
    return { error: "L'identifiant doit faire 2 à 30 caractères : lettres minuscules, chiffres, point, tiret ou tiret bas." };
  }
  if (password.length < MIN_PASSWORD) {
    return { error: `Le mot de passe doit faire au moins ${MIN_PASSWORD} caractères.` };
  }
  if (users[login]) {
    return { error: 'Ce compte existe déjà. Connecte-toi avec ton mot de passe.', exists: true };
  }
  return { login, password, displayName };
}

function createUser(users, { login, password, displayName, role }) {
  users[login] = {
    login,
    displayName,
    role,
    passwordHash: bcrypt.hashSync(password, 10),
    createdAt: new Date().toISOString(),
  };
  saveUsers(users);
  return users[login];
}

// Compte cree au demarrage seulement si DEFAULT_LOGIN / DEFAULT_PASSWORD sont definis.
// ADMIN_LOGIN permet de promouvoir un compte existant en administrateur.
function bootstrapUsers() {
  const users = getUsers();
  let changed = false;
  if (process.env.DEFAULT_PASSWORD) {
    const login = (process.env.DEFAULT_LOGIN || 'eleve').toLowerCase();
    if (!users[login]) {
      users[login] = {
        login,
        displayName: process.env.DEFAULT_NAME || 'Ma championne',
        role: 'eleve',
        passwordHash: bcrypt.hashSync(process.env.DEFAULT_PASSWORD, 10),
        createdAt: new Date().toISOString(),
      };
      changed = true;
      console.log(`[init] Compte cree : ${login}`);
    }
  }
  const adminLogin = (process.env.ADMIN_LOGIN || '').toLowerCase();
  if (adminLogin && users[adminLogin] && users[adminLogin].role !== 'admin') {
    users[adminLogin].role = 'admin';
    changed = true;
    console.log(`[init] ${adminLogin} est maintenant administrateur`);
  }
  if (changed) saveUsers(users);
  if (!hasAdmin(users)) {
    console.log("[init] Aucun administrateur : le prochain compte cree sera administrateur.");
  }
}
bootstrapUsers();

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

function currentUser(req) {
  if (!req.session || !req.session.login) return null;
  return getUsers()[req.session.login] || null;
}

function requireAuth(req, res, next) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Non connecté' });
  req.user = u;
  return next();
}

function requireAdmin(req, res, next) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Non connecté' });
  if (u.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  req.user = u;
  return next();
}

// Limitation simple des tentatives (anti force brute)
const attempts = new Map();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;
function tooManyAttempts(req) {
  const a = attempts.get(req.ip);
  return a && a.count >= MAX_ATTEMPTS && Date.now() - a.first < WINDOW_MS;
}
function recordFailure(req) {
  const now = Date.now();
  const a = attempts.get(req.ip);
  if (!a || now - a.first > WINDOW_MS) attempts.set(req.ip, { count: 1, first: now });
  else a.count += 1;
}

// ---------------------------------------------------------------------------
// API d'authentification
// ---------------------------------------------------------------------------
app.get('/api/config', (req, res) => {
  const users = getUsers();
  res.json({ allowSignup: getSettings().allowSignup || !hasAdmin(users), firstAccountIsAdmin: !hasAdmin(users) });
});

app.post('/api/login', (req, res) => {
  if (tooManyAttempts(req)) {
    return res.status(429).json({ error: 'Trop de tentatives. Réessaie dans quelques minutes.' });
  }
  const login = String(req.body.login || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = getUsers()[login];
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    recordFailure(req);
    return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
  }
  attempts.delete(req.ip);
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Erreur de session.' });
    req.session.login = login;
    res.json(publicUser(user));
  });
});

app.post('/api/signup', (req, res) => {
  if (tooManyAttempts(req)) {
    return res.status(429).json({ error: 'Trop de tentatives. Réessaie dans quelques minutes.' });
  }
  const users = getUsers();
  const firstAdmin = !hasAdmin(users);
  if (!getSettings().allowSignup && !firstAdmin) {
    return res.status(403).json({ error: "La création de compte est désactivée. Demande à un adulte de créer ton compte." });
  }
  const v = validateNewUser(req.body || {}, users);
  if (v.error) {
    recordFailure(req);
    return res.status(v.exists ? 409 : 400).json({ error: v.error, exists: !!v.exists });
  }
  const user = createUser(users, { ...v, role: firstAdmin ? 'admin' : 'eleve' });
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Erreur de session.' });
    req.session.login = user.login;
    res.status(201).json(publicUser(user));
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json(publicUser(req.user));
});

app.post('/api/me/password', requireAuth, (req, res) => {
  const current = String(req.body.currentPassword || '');
  const next = String(req.body.newPassword || '');
  if (!bcrypt.compareSync(current, req.user.passwordHash)) {
    return res.status(400).json({ error: 'Mot de passe actuel incorrect.' });
  }
  if (next.length < MIN_PASSWORD) {
    return res.status(400).json({ error: `Le mot de passe doit faire au moins ${MIN_PASSWORD} caractères.` });
  }
  const users = getUsers();
  users[req.user.login].passwordHash = bcrypt.hashSync(next, 10);
  saveUsers(users);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Synthese vocale en francais (Azure AI Speech, voix neuronale)
//   SPEECH_KEY / SPEECH_REGION : ressource Azure Speech ; SPEECH_VOICE : voix utilisee.
//   Les fichiers audio sont mis en cache dans DATA_DIR/tts-cache.
// ---------------------------------------------------------------------------
const SPEECH_KEY = process.env.SPEECH_KEY || '';
const SPEECH_REGION = process.env.SPEECH_REGION || 'francecentral';
const SPEECH_VOICE = process.env.SPEECH_VOICE || 'fr-FR-DeniseNeural';
const TTS_CACHE_DIR = path.join(DATA_DIR, 'tts-cache');
fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });

function xmlEscape(s) {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

app.get('/api/tts/status', (req, res) => res.json({ enabled: !!SPEECH_KEY, voice: SPEECH_VOICE }));

app.post('/api/tts', requireAuth, async (req, res) => {
  if (!SPEECH_KEY) return res.status(503).json({ error: 'Synthèse vocale serveur non configurée.' });
  const text = String((req.body && req.body.text) || '').replace(/\s+/g, ' ').trim().slice(0, 800);
  if (!text) return res.status(400).json({ error: 'Texte vide.' });
  const hash = require('crypto').createHash('sha1').update(`${SPEECH_VOICE}|${text}`).digest('hex');
  const file = path.join(TTS_CACHE_DIR, `${hash}.mp3`);
  res.set('Cache-Control', 'private, max-age=86400');
  if (fs.existsSync(file)) return res.type('audio/mpeg').sendFile(file);
  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="fr-FR">` +
    `<voice name="${SPEECH_VOICE}"><prosody rate="-8%">${xmlEscape(text)}</prosody></voice></speak>`;
  try {
    const r = await fetch(`https://${SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': SPEECH_KEY,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'ce1-compagnon',
      },
      body: ssml,
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) {
      console.error(`[tts] erreur ${r.status}`);
      return res.status(502).json({ error: 'Synthèse vocale indisponible.' });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFile(file, buf, () => {});
    res.type('audio/mpeg').send(buf);
  } catch (e) {
    console.error('[tts]', e.message);
    res.status(502).json({ error: 'Synthèse vocale indisponible.' });
  }
});

// ---------------------------------------------------------------------------
// API des resultats (une session = un soir)
// ---------------------------------------------------------------------------
function resultsFileFor(login) {
  if (!/^[a-z0-9._-]+$/.test(login)) throw new Error('login invalide');
  return path.join(RESULTS_DIR, `${login}.json`);
}

app.get('/api/history', requireAuth, (req, res) => {
  res.json(readJson(resultsFileFor(req.user.login), []));
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
  const file = resultsFileFor(req.user.login);
  const all = readJson(file, []);
  // Une seule entree par jour : on garde la meilleure note du soir.
  const idx = all.findIndex((e) => e.date === entry.date);
  if (idx >= 0) {
    if (entry.percent >= all[idx].percent) all[idx] = entry;
  } else {
    all.push(entry);
  }
  all.sort((a, b) => (a.date < b.date ? -1 : 1));
  writeJson(file, all);
  res.json({ ok: true, entry });
});

// ---------------------------------------------------------------------------
// API d'administration des utilisateurs
// ---------------------------------------------------------------------------
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = getUsers();
  const list = Object.values(users)
    .map((u) => {
      const hist = readJson(resultsFileFor(u.login), []);
      const last = hist[hist.length - 1] || null;
      return {
        ...publicUser(u),
        sessions: hist.length,
        lastDate: last ? last.date : null,
        lastNote: last ? last.note20 : null,
        lastGrade: last ? last.grade : null,
      };
    })
    .sort((a, b) => (a.role === b.role ? a.displayName.localeCompare(b.displayName, 'fr') : a.role === 'admin' ? -1 : 1));
  res.json({ users: list, settings: getSettings(), me: req.user.login });
});

app.post('/api/admin/users', requireAdmin, (req, res) => {
  const users = getUsers();
  const v = validateNewUser(req.body || {}, users);
  if (v.error) return res.status(v.exists ? 409 : 400).json({ error: v.exists ? 'Cet identifiant est déjà utilisé.' : v.error });
  const role = ROLES.includes(req.body.role) ? req.body.role : 'eleve';
  const user = createUser(users, { ...v, role });
  res.status(201).json(publicUser(user));
});

app.patch('/api/admin/users/:login', requireAdmin, (req, res) => {
  const users = getUsers();
  const login = String(req.params.login).toLowerCase();
  const u = users[login];
  if (!u) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  const b = req.body || {};
  if (b.displayName !== undefined) {
    const name = String(b.displayName).trim().slice(0, 40);
    if (!name) return res.status(400).json({ error: 'Le prénom ne peut pas être vide.' });
    u.displayName = name;
  }
  if (b.role !== undefined) {
    if (!ROLES.includes(b.role)) return res.status(400).json({ error: 'Rôle invalide.' });
    if (u.role === 'admin' && b.role !== 'admin') {
      const admins = Object.values(users).filter((x) => x.role === 'admin');
      if (admins.length <= 1) return res.status(400).json({ error: 'Il faut garder au moins un administrateur.' });
    }
    u.role = b.role;
  }
  if (b.password !== undefined) {
    const p = String(b.password);
    if (p.length < MIN_PASSWORD) {
      return res.status(400).json({ error: `Le mot de passe doit faire au moins ${MIN_PASSWORD} caractères.` });
    }
    u.passwordHash = bcrypt.hashSync(p, 10);
  }
  saveUsers(users);
  res.json(publicUser(u));
});

app.delete('/api/admin/users/:login', requireAdmin, (req, res) => {
  const users = getUsers();
  const login = String(req.params.login).toLowerCase();
  if (!users[login]) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  if (login === req.user.login) return res.status(400).json({ error: 'Tu ne peux pas supprimer ton propre compte.' });
  if (users[login].role === 'admin' && Object.values(users).filter((x) => x.role === 'admin').length <= 1) {
    return res.status(400).json({ error: 'Il faut garder au moins un administrateur.' });
  }
  delete users[login];
  saveUsers(users);
  try {
    fs.unlinkSync(resultsFileFor(login));
  } catch (e) {
    /* pas d'historique */
  }
  res.json({ ok: true });
});

app.get('/api/admin/users/:login/history', requireAdmin, (req, res) => {
  const login = String(req.params.login).toLowerCase();
  const u = getUsers()[login];
  if (!u) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  res.json({ user: publicUser(u), history: readJson(resultsFileFor(login), []) });
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const s = getSettings();
  if (req.body.allowSignup !== undefined) s.allowSignup = !!req.body.allowSignup;
  writeJson(SETTINGS_FILE, s);
  res.json(s);
});

// ---------------------------------------------------------------------------
// Fichiers statiques + SPA
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Introuvable' }));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`CE1 Compagnon demarre sur le port ${PORT}`);
  console.log(`Donnees stockees dans : ${DATA_DIR}`);
});
