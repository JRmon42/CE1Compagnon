/* CE1 Compagnon - logique de l'application (SPA) */
(function () {
  'use strict';

  const SESSION_MINUTES = 20;
  const EXO_COUNT = 18;

  // Bareme des smileys (par exercice et pour la note finale)
  const GRADES = {
    4: { smiley: '😄👑', label: 'Très bien', cls: 'grade-4' },
    3: { smiley: '🙂👑', label: 'Bien', cls: 'grade-3' },
    2: { smiley: '😐', label: 'Moyen', cls: 'grade-2' },
    1: { smiley: '😢', label: 'À revoir', cls: 'grade-1' },
  };

  const $ = (id) => document.getElementById(id);
  const state = {
    user: null,
    exos: [],
    idx: 0,
    results: [], // { grade, correct } par exercice
    startedAt: null,
    timerId: null,
    remaining: SESSION_MINUTES * 60,
    selectedChoice: null,
    hintUsed: false,
    calMonth: null, // Date (1er du mois affiche)
    history: [],
  };

  // ----------------------------------------------------------------------
  // Synthese vocale (voix francaise)
  // ----------------------------------------------------------------------
  // 1) Voix neuronale francaise generee par le serveur (Azure AI Speech) :
  //    meme voix francaise sur tous les appareils.
  // 2) Secours : voix francaise du navigateur (jamais la voix anglaise par defaut).
  const hasSynth = 'speechSynthesis' in window;
  const player = new Audio();
  player.preload = 'auto';
  const audioCache = new Map(); // texte -> URL du fichier audio
  let serverTts = false;
  let speakToken = 0;
  let frVoice = null;

  fetch('/api/tts/status')
    .then((r) => r.json())
    .then((s) => { serverTts = !!s.enabled; })
    .catch(() => { serverTts = false; });

  // Les tablettes (iPad) n'autorisent le son qu'apres un geste de l'utilisateur :
  // on "debloque" le lecteur audio au premier toucher avec un court silence.
  function silentWavUrl() {
    const n = 400;
    const buf = new ArrayBuffer(44 + n);
    const v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVEfmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    w(36, 'data'); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }
  function unlockAudio() {
    document.removeEventListener('pointerdown', unlockAudio, true);
    document.removeEventListener('keydown', unlockAudio, true);
    try {
      player.src = silentWavUrl();
      const p = player.play();
      if (p) p.catch(() => {});
    } catch (e) { /* ignore */ }
    if (hasSynth) {
      // Reveille aussi la synthese du navigateur (necessaire sur iOS)
      try { window.speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch (e) { /* ignore */ }
    }
  }
  document.addEventListener('pointerdown', unlockAudio, true);
  document.addEventListener('keydown', unlockAudio, true);

  // Choix de la meilleure voix francaise disponible dans le navigateur
  function pickFrenchVoice() {
    if (!hasSynth) return null;
    const voices = window.speechSynthesis.getVoices().filter((v) => /^fr\b|^fr[-_]/i.test(v.lang));
    if (!voices.length) return null;
    const score = (v) =>
      (/fr[-_]FR/i.test(v.lang) ? 10 : 0) +
      (/natural|neural|online|google|premium|enhanced|amélie|amelie|thomas|denise|audrey|aurélie/i.test(v.name) ? 5 : 0) +
      (v.localService ? 0 : 1);
    return voices.sort((a, b) => score(b) - score(a))[0];
  }
  function loadVoices() { frVoice = pickFrenchVoice(); }
  if (hasSynth) {
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
  }
  function waitForVoices(ms) {
    if (!hasSynth || frVoice || window.speechSynthesis.getVoices().length) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => { window.speechSynthesis.removeEventListener('voiceschanged', done); resolve(); };
      window.speechSynthesis.addEventListener('voiceschanged', done);
      setTimeout(done, ms);
    });
  }

  async function browserSpeak(text, token) {
    if (!hasSynth) return;
    await waitForVoices(1500);
    loadVoices();
    if (token !== speakToken) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'fr-FR';
      if (frVoice) u.voice = frVoice;
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
    } catch (e) {
      /* la synthese vocale peut etre indisponible */
    }
  }

  async function serverAudioUrl(text) {
    if (audioCache.has(text)) return audioCache.get(text);
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error('tts ' + res.status);
    const url = URL.createObjectURL(await res.blob());
    audioCache.set(text, url);
    if (audioCache.size > 150) {
      const first = audioCache.keys().next().value;
      URL.revokeObjectURL(audioCache.get(first));
      audioCache.delete(first);
    }
    return url;
  }

  async function speak(text) {
    text = String(text || '').trim();
    if (!text) return;
    stopSpeak();
    const token = ++speakToken;
    if (serverTts && state.user) {
      try {
        const url = await serverAudioUrl(text);
        if (token !== speakToken) return;
        player.src = url;
        await player.play();
        return;
      } catch (e) {
        if (token !== speakToken) return;
        /* on passe a la voix du navigateur */
      }
    }
    browserSpeak(text, token);
  }

  function stopSpeak() {
    speakToken++;
    try { player.pause(); } catch (e) { /* ignore */ }
    if (hasSynth) window.speechSynthesis.cancel();
  }

  // ----------------------------------------------------------------------
  // Navigation entre ecrans
  // ----------------------------------------------------------------------
  function show(screenId) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    $(screenId).classList.add('active');
  }

  // ----------------------------------------------------------------------
  // Authentification
  // ----------------------------------------------------------------------
  async function api(path, options) {
    const res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options));
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw Object.assign(new Error(err.error || 'Erreur'), { status: res.status, data: err });
    }
    return res.json();
  }

  function setError(id, msg) {
    const el = $(id);
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function enterApp(me) {
    state.user = me;
    $('home-name').textContent = me.displayName || me.login;
    $('admin-btn').hidden = me.role !== 'admin';
    show('screen-home');
  }

  async function showLogin() {
    state.user = null;
    let cfg = { allowSignup: true, firstAccountIsAdmin: false };
    try { cfg = await api('/api/config'); } catch (e) { /* valeurs par defaut */ }
    $('signup-first').hidden = !cfg.firstAccountIsAdmin;
    state.allowSignup = cfg.allowSignup;
    $('tab-signup').hidden = !cfg.allowSignup;
    $('signup-closed').hidden = !!cfg.allowSignup;
    // Premier lancement : on propose directement la creation du compte administrateur
    switchAuthTab(cfg.firstAccountIsAdmin ? 'signup' : 'login');
    show('screen-login');
  }

  function switchAuthTab(which) {
    const signup = which === 'signup' && state.allowSignup !== false;
    $('tab-login').classList.toggle('active', !signup);
    $('tab-signup').classList.toggle('active', signup);
    $('tab-login').setAttribute('aria-selected', String(!signup));
    $('tab-signup').setAttribute('aria-selected', String(signup));
    $('login-form').hidden = signup;
    $('signup-form').hidden = !signup;
    setError('login-error');
    setError('signup-error');
    (signup ? $('su-name') : $('login')).focus();
  }
  $('tab-login').addEventListener('click', () => switchAuthTab('login'));
  $('tab-signup').addEventListener('click', () => switchAuthTab('signup'));

  async function checkAuth() {
    try {
      enterApp(await api('/api/me'));
    } catch (e) {
      showLogin();
    }
  }

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    setError('login-error');
    try {
      const me = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ login: $('login').value, password: $('password').value }),
      });
      $('password').value = '';
      enterApp(me);
    } catch (e2) {
      setError('login-error', e2.message || 'Connexion impossible.');
    }
  });

  $('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    setError('signup-error');
    if ($('su-password').value !== $('su-password2').value) {
      setError('signup-error', 'Les deux mots de passe ne sont pas identiques.');
      return;
    }
    try {
      const me = await api('/api/signup', {
        method: 'POST',
        body: JSON.stringify({
          displayName: $('su-name').value,
          login: $('su-login').value,
          password: $('su-password').value,
        }),
      });
      ['su-name', 'su-login', 'su-password', 'su-password2'].forEach((id) => { $(id).value = ''; });
      enterApp(me);
    } catch (e2) {
      if (e2.data && e2.data.exists) {
        // Le compte existe deja : on bascule vers la connexion avec l'identifiant pre-rempli
        const login = $('su-login').value.trim().toLowerCase();
        switchAuthTab('login');
        $('login').value = login;
        $('password').focus();
        setError('login-error', e2.message);
      } else {
        setError('signup-error', e2.message || 'Création impossible.');
      }
    }
  });

  $('logout-btn').addEventListener('click', async () => {
    stopSpeak();
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    showLogin();
  });

  // ----------------------------------------------------------------------
  // Mot de passe personnel
  // ----------------------------------------------------------------------
  $('my-password-btn').addEventListener('click', () => {
    $('pw-form').reset();
    setError('pw-error');
    $('pw-dialog').showModal();
  });
  $('pw-cancel').addEventListener('click', () => $('pw-dialog').close());
  $('pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/me/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: $('pw-current').value, newPassword: $('pw-new').value }),
      });
      $('pw-dialog').close();
    } catch (e2) {
      setError('pw-error', e2.message);
    }
  });

  // ----------------------------------------------------------------------
  // Administration des utilisateurs
  // ----------------------------------------------------------------------
  const admin = { users: [], me: null, editing: null };

  $('admin-btn').addEventListener('click', openAdmin);
  $('admin-back-btn').addEventListener('click', () => show('screen-home'));

  async function openAdmin() {
    stopSpeak();
    await loadUsers();
    show('screen-admin');
  }

  function adminMessage(msg) {
    const el = $('admin-msg');
    el.textContent = msg || '';
    el.hidden = !msg;
    if (msg) setTimeout(() => { if (el.textContent === msg) el.hidden = true; }, 4000);
  }

  async function loadUsers() {
    try {
      const data = await api('/api/admin/users');
      admin.users = data.users;
      admin.me = data.me;
      $('allow-signup').checked = !!data.settings.allowSignup;
      renderUsers();
    } catch (e) {
      if (e.status === 401 || e.status === 403) return showLogin();
      adminMessage(e.message);
    }
  }

  function renderUsers() {
    const ul = $('user-list');
    ul.innerHTML = '';
    admin.users.forEach((u) => {
      const li = document.createElement('li');
      li.className = 'user-row';
      const grade = GRADES[Number(u.lastGrade)];
      const last = u.lastDate
        ? `Dernière séance : ${formatDate(u.lastDate)} · ${u.lastNote}/20 ${grade ? grade.smiley : ''}`
        : 'Aucune séance pour le moment';
      li.innerHTML = `
        <div class="user-main">
          <div class="user-name">${escapeHtml(u.displayName)}
            <span class="badge ${u.role === 'admin' ? 'badge-admin' : 'badge-eleve'}">${u.role === 'admin' ? 'Admin' : 'Élève'}</span>
            ${u.login === admin.me ? '<span class="badge badge-me">Moi</span>' : ''}
          </div>
          <div class="user-meta">@${escapeHtml(u.login)} · ${u.sessions} séance${u.sessions > 1 ? 's' : ''}</div>
          <div class="user-meta">${last}</div>
        </div>
        <div class="user-actions">
          <button class="btn btn-small btn-secondary" data-act="cal">📅 Calendrier</button>
          <button class="btn btn-small btn-secondary" data-act="edit">✏️ Modifier</button>
          ${u.login === admin.me ? '' : '<button class="btn btn-small btn-danger" data-act="del">🗑️ Supprimer</button>'}
        </div>`;
      li.querySelector('[data-act="cal"]').addEventListener('click', () => openUserCalendar(u));
      li.querySelector('[data-act="edit"]').addEventListener('click', () => openUserDialog(u));
      const del = li.querySelector('[data-act="del"]');
      if (del) del.addEventListener('click', () => deleteUser(u));
      ul.appendChild(li);
    });
  }

  $('allow-signup').addEventListener('change', async (e) => {
    try {
      await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ allowSignup: e.target.checked }) });
      adminMessage(e.target.checked ? 'Création de compte autorisée.' : 'Création de compte désactivée.');
    } catch (e2) {
      e.target.checked = !e.target.checked;
      adminMessage(e2.message);
    }
  });

  $('add-user-btn').addEventListener('click', () => openUserDialog(null));
  $('ud-cancel').addEventListener('click', () => $('user-dialog').close());

  function openUserDialog(u) {
    admin.editing = u;
    $('user-form').reset();
    setError('ud-error');
    $('ud-title').textContent = u ? `Modifier ${u.displayName}` : 'Ajouter un utilisateur';
    $('ud-name').value = u ? u.displayName : '';
    $('ud-login').value = u ? u.login : '';
    $('ud-login').disabled = !!u;
    $('ud-role').value = u ? u.role : 'eleve';
    $('ud-password-label').textContent = u ? 'Nouveau mot de passe' : 'Mot de passe';
    $('ud-password').required = !u;
    $('ud-password-hint').hidden = !u;
    $('user-dialog').showModal();
  }

  $('user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    setError('ud-error');
    const u = admin.editing;
    try {
      if (u) {
        const body = { displayName: $('ud-name').value, role: $('ud-role').value };
        if ($('ud-password').value) body.password = $('ud-password').value;
        await api(`/api/admin/users/${encodeURIComponent(u.login)}`, { method: 'PATCH', body: JSON.stringify(body) });
        adminMessage(`${body.displayName} a été modifié.`);
      } else {
        const body = {
          displayName: $('ud-name').value,
          login: $('ud-login').value,
          role: $('ud-role').value,
          password: $('ud-password').value,
        };
        await api('/api/admin/users', { method: 'POST', body: JSON.stringify(body) });
        adminMessage(`Compte « ${body.login.trim().toLowerCase()} » créé.`);
      }
      $('user-dialog').close();
      await loadUsers();
      // Si je me suis retire le role admin, on revient a l'accueil
      if (u && u.login === admin.me && $('ud-role').value !== 'admin') {
        state.user.role = 'eleve';
        enterApp(state.user);
      }
    } catch (e2) {
      setError('ud-error', e2.message);
    }
  });

  async function deleteUser(u) {
    if (!window.confirm(`Supprimer le compte « ${u.login} » (${u.displayName}) et tout son historique ? Cette action est définitive.`)) return;
    try {
      await api(`/api/admin/users/${encodeURIComponent(u.login)}`, { method: 'DELETE' });
      adminMessage(`Compte « ${u.login} » supprimé.`);
      await loadUsers();
    } catch (e) {
      adminMessage(e.message);
    }
  }

  async function openUserCalendar(u) {
    try {
      const data = await api(`/api/admin/users/${encodeURIComponent(u.login)}/history`);
      openCalendarWith(data.history, `📅 ${data.user.displayName}`, 'screen-admin');
    } catch (e) {
      adminMessage(e.message);
    }
  }

  function formatDate(iso) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  // ----------------------------------------------------------------------
  // Deroulement d'une seance
  // ----------------------------------------------------------------------
  $('start-btn').addEventListener('click', startSession);
  $('result-home-btn').addEventListener('click', () => {
    stopSpeak();
    show('screen-home');
  });

  function startSession() {
    state.exos = window.CE1Exercises.buildSession(EXO_COUNT);
    state.idx = 0;
    state.results = [];
    state.startedAt = new Date();
    state.remaining = SESSION_MINUTES * 60;
    $('exo-total').textContent = state.exos.length;
    startTimer();
    show('screen-exercise');
    renderExercise();
  }

  function startTimer() {
    stopTimer();
    updateTimerDisplay();
    state.timerId = setInterval(() => {
      state.remaining--;
      updateTimerDisplay();
      if (state.remaining <= 0) {
        stopTimer();
        finishSession();
      }
    }, 1000);
  }
  function stopTimer() {
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = null;
  }
  function updateTimerDisplay() {
    const m = Math.floor(Math.max(0, state.remaining) / 60);
    const s = Math.max(0, state.remaining) % 60;
    $('timer').textContent = `${m}:${String(s).padStart(2, '0')}`;
  }

  function renderExercise() {
    const exo = state.exos[state.idx];
    state.selectedChoice = null;
    state.hintUsed = false;

    $('exo-index').textContent = state.idx + 1;
    $('progress-fill').style.width = `${(state.idx / state.exos.length) * 100}%`;
    $('exo-subject').textContent = exo.subject;
    $('exo-instruction').textContent = exo.instruction;
    $('exo-question').textContent = exo.question;

    // reinitialise la zone de reponse
    $('feedback').hidden = true;
    $('answer-form').hidden = false;
    $('hint-box').hidden = true;
    $('hint-btn').disabled = false;
    const input = $('answer-input');
    const choicesEl = $('choices');

    if (exo.inputType === 'choice') {
      input.hidden = true;
      input.value = '';
      choicesEl.hidden = false;
      choicesEl.innerHTML = '';
      exo.choices.forEach((c) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'choice-btn';
        b.textContent = c;
        b.addEventListener('click', () => {
          state.selectedChoice = c;
          choicesEl.querySelectorAll('.choice-btn').forEach((x) => x.classList.remove('selected'));
          b.classList.add('selected');
        });
        choicesEl.appendChild(b);
      });
    } else {
      choicesEl.hidden = true;
      choicesEl.innerHTML = '';
      input.hidden = false;
      input.value = '';
      input.type = exo.inputType === 'number' ? 'text' : 'text';
      input.inputMode = exo.inputType === 'number' ? 'numeric' : 'text';
      setTimeout(() => input.focus(), 50);
    }

    // Lecture vocale automatique de la consigne
    speak(exo.speak || exo.question);
  }

  $('listen-btn').addEventListener('click', () => {
    const exo = state.exos[state.idx];
    speak(exo.speak || exo.question);
  });

  $('hint-btn').addEventListener('click', () => {
    const exo = state.exos[state.idx];
    state.hintUsed = true;
    const box = $('hint-box');
    box.textContent = '💡 ' + (exo.hint || 'Réfléchis bien !');
    box.hidden = false;
    speak(exo.hint || '');
  });

  $('answer-form').addEventListener('submit', (e) => {
    e.preventDefault();
    gradeCurrent();
  });

  function gradeCurrent() {
    const exo = state.exos[state.idx];
    const given = exo.inputType === 'choice' ? state.selectedChoice : $('answer-input').value;
    if (exo.inputType === 'choice' && !given) {
      speak('Choisis une réponse.');
      return;
    }
    if (exo.inputType !== 'choice' && String(given).trim() === '') {
      $('answer-input').focus();
      return;
    }

    const verdict = exo.accept(given); // 'ok' | 'close' | 'no'
    let grade;
    if (verdict === 'ok') grade = state.hintUsed ? 3 : 4;
    else if (verdict === 'close') grade = 2;
    else grade = 1;

    state.results.push({ grade, correct: verdict === 'ok', type: exo.type, subject: exo.subject });
    showFeedback(exo, grade, verdict, given);
  }

  function showFeedback(exo, grade, verdict, given) {
    $('answer-form').hidden = true;
    const g = GRADES[grade];

    $('feedback-smiley').textContent = g.smiley;
    const gradeEl = $('feedback-grade');
    gradeEl.textContent = g.label;
    gradeEl.className = 'feedback-grade ' + g.cls;

    const ansEl = $('feedback-answer');
    if (verdict === 'ok') {
      ansEl.innerHTML = `<span class="ok">✅ Bonne réponse !</span>`;
    } else {
      ansEl.innerHTML =
        `<span class="bad">Ta réponse : ${escapeHtml(String(given))}</span><br>` +
        `La bonne réponse est : <span class="ok">${escapeHtml(String(exo.answer))}</span>`;
    }

    $('feedback-explanation').textContent = exo.explanation;
    $('feedback').hidden = false;

    // Correction vocale en francais
    let spoken;
    if (verdict === 'ok') spoken = `${g.label} ! ${exo.explanation}`;
    else spoken = `Ce n'est pas tout à fait ça. ${exo.explanation}`;
    speak(spoken);
  }

  $('next-btn').addEventListener('click', () => {
    stopSpeak();
    state.idx++;
    if (state.idx >= state.exos.length) {
      finishSession();
    } else {
      renderExercise();
    }
  });

  // ----------------------------------------------------------------------
  // Fin de seance : note globale + sauvegarde
  // ----------------------------------------------------------------------
  async function finishSession() {
    stopTimer();
    stopSpeak();
    const done = state.results;
    const total = done.length;
    const scoreSum = done.reduce((s, r) => s + r.grade, 0);
    const scoreMax = total * 4;
    const percent = scoreMax > 0 ? Math.round((scoreSum / scoreMax) * 100) : 0;
    const note20 = Math.round((percent / 100) * 20);
    const grade = percent >= 90 ? 4 : percent >= 70 ? 3 : percent >= 50 ? 2 : 1;
    const counts = { 4: 0, 3: 0, 2: 0, 1: 0 };
    done.forEach((r) => { counts[r.grade]++; });

    const g = GRADES[grade];
    $('result-smiley').textContent = g.smiley;
    $('result-title').textContent = titleFor(grade);
    $('result-note').textContent = `${note20}/20`;
    const rg = $('result-grade');
    rg.textContent = g.label;
    rg.className = 'result-grade ' + g.cls;

    $('result-breakdown').innerHTML =
      `<div class="row"><span>Exercices réussis</span><strong>${done.filter((r) => r.correct).length} / ${total}</strong></div>` +
      `<div class="row"><span>😄👑 Très bien</span><strong>${counts[4]}</strong></div>` +
      `<div class="row"><span>🙂👑 Bien</span><strong>${counts[3]}</strong></div>` +
      `<div class="row"><span>😐 Moyen</span><strong>${counts[2]}</strong></div>` +
      `<div class="row"><span>😢 À revoir</span><strong>${counts[1]}</strong></div>`;

    show('screen-result');
    speak(`${titleFor(grade)} ! Ta note est de ${note20} sur 20. ${g.label}.`);

    const durationSec = Math.round((Date.now() - state.startedAt.getTime()) / 1000);
    const payload = {
      date: localDate(new Date()),
      startedAt: state.startedAt.toISOString(),
      durationSec,
      total,
      scoreSum,
      scoreMax,
      percent,
      grade: String(grade),
      note20,
      counts,
      details: done,
    };
    try {
      await api('/api/session', { method: 'POST', body: JSON.stringify(payload) });
    } catch (e) {
      /* on n'empeche pas l'affichage si la sauvegarde echoue */
    }
  }

  function titleFor(grade) {
    return grade === 4 ? 'Bravo, championne !' : grade === 3 ? 'Très bon travail !' : grade === 2 ? 'C\'est bien, continue !' : 'On réessaiera demain !';
  }

  // ----------------------------------------------------------------------
  // Calendrier
  // ----------------------------------------------------------------------
  $('show-calendar-btn').addEventListener('click', openCalendar);
  $('result-calendar-btn').addEventListener('click', openCalendar);
  $('calendar-back-btn').addEventListener('click', () => show(state.user ? state.calBack || 'screen-home' : 'screen-login'));
  $('cal-prev').addEventListener('click', () => { state.calMonth.setMonth(state.calMonth.getMonth() - 1); renderCalendar(); });
  $('cal-next').addEventListener('click', () => { state.calMonth.setMonth(state.calMonth.getMonth() + 1); renderCalendar(); });

  async function openCalendar() {
    stopSpeak();
    let history = [];
    try {
      history = await api('/api/history');
    } catch (e) {
      history = [];
    }
    openCalendarWith(history, '📅 Mon calendrier', 'screen-home');
  }

  function openCalendarWith(history, title, backScreen) {
    state.history = history;
    state.calOwn = backScreen === 'screen-home';
    state.calBack = backScreen;
    $('cal-title').textContent = title;
    const now = new Date();
    state.calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    renderCalendar();
    show('screen-calendar');
  }

  function renderCalendar() {
    const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const y = state.calMonth.getFullYear();
    const m = state.calMonth.getMonth();
    $('cal-month').textContent = `${monthNames[m]} ${y}`;

    const byDate = {};
    state.history.forEach((h) => { byDate[h.date] = h; });

    const grid = $('cal-grid');
    grid.innerHTML = '';

    // Lundi = premiere colonne
    const first = new Date(y, m, 1);
    let startDay = first.getDay(); // 0=dimanche
    startDay = startDay === 0 ? 6 : startDay - 1;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const todayStr = localDate(new Date());

    for (let i = 0; i < startDay; i++) {
      const c = document.createElement('div');
      c.className = 'cal-cell empty';
      grid.appendChild(c);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const c = document.createElement('div');
      c.className = 'cal-cell';
      if (dateStr === todayStr) c.classList.add('today');
      const rec = byDate[dateStr];
      const smiley = rec ? (GRADES[Number(rec.grade)] || {}).smiley || '' : '';
      c.innerHTML = `<span class="day-num">${d}</span><span class="day-smiley">${smiley}</span>`;
      if (rec) {
        c.title = `${rec.note20}/20`;
        const who = state.calOwn ? 'tu as eu' : 'note';
        c.addEventListener('click', () => speak(`Le ${d} ${monthNames[m]}, ${who} ${rec.note20} sur 20. ${(GRADES[Number(rec.grade)] || {}).label || ''}.`));
      }
      grid.appendChild(c);
    }
  }

  // ----------------------------------------------------------------------
  // Utilitaires
  // ----------------------------------------------------------------------
  function localDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Demarrage
  checkAuth();
})();
