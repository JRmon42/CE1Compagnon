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
  let frVoice = null;
  function loadVoices() {
    if (!('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();
    frVoice =
      voices.find((v) => /fr[-_]FR/i.test(v.lang)) ||
      voices.find((v) => /^fr/i.test(v.lang)) ||
      null;
  }
  if ('speechSynthesis' in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
  function speak(text) {
    if (!('speechSynthesis' in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'fr-FR';
      if (frVoice) u.voice = frVoice;
      u.rate = 0.95;
      u.pitch = 1.05;
      window.speechSynthesis.speak(u);
    } catch (e) {
      /* la synthese vocale peut etre indisponible */
    }
  }
  function stopSpeak() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
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
      throw Object.assign(new Error(err.error || 'Erreur'), { status: res.status });
    }
    return res.json();
  }

  async function checkAuth() {
    try {
      const me = await api('/api/me');
      state.user = me;
      $('home-name').textContent = me.displayName || me.login;
      show('screen-home');
    } catch (e) {
      show('screen-login');
    }
  }

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('login-error');
    err.hidden = true;
    try {
      const me = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ login: $('login').value, password: $('password').value }),
      });
      state.user = me;
      $('home-name').textContent = me.displayName || me.login;
      $('password').value = '';
      show('screen-home');
    } catch (e2) {
      err.textContent = e2.message || 'Connexion impossible.';
      err.hidden = false;
    }
  });

  $('logout-btn').addEventListener('click', async () => {
    stopSpeak();
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    state.user = null;
    show('screen-login');
  });

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
  $('calendar-back-btn').addEventListener('click', () => show(state.user ? 'screen-home' : 'screen-login'));
  $('cal-prev').addEventListener('click', () => { state.calMonth.setMonth(state.calMonth.getMonth() - 1); renderCalendar(); });
  $('cal-next').addEventListener('click', () => { state.calMonth.setMonth(state.calMonth.getMonth() + 1); renderCalendar(); });

  async function openCalendar() {
    stopSpeak();
    try {
      state.history = await api('/api/history');
    } catch (e) {
      state.history = [];
    }
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
        c.addEventListener('click', () => speak(`Le ${d} ${monthNames[m]}, tu as eu ${rec.note20} sur 20. ${(GRADES[Number(rec.grade)] || {}).label || ''}.`));
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
