/* CE1 Compagnon - Generateur d'exercices (francais et mathematiques niveau CE1)
 * Chaque exercice renvoie :
 *  { subject, type, instruction, question, speak, answer, accept(input), explanation,
 *    inputType, choices, hint }
 */
(function () {
  'use strict';

  function rnd(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function pick(arr) {
    return arr[rnd(0, arr.length - 1)];
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = rnd(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function norm(s) {
    return String(s == null ? '' : s)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }
  // Distance de Levenshtein (pour detecter une reponse "presque" juste)
  function lev(a, b) {
    a = norm(a);
    b = norm(b);
    const m = a.length,
      n = b.length;
    const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) d[i][0] = i;
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      }
    }
    return d[m][n];
  }

  function textMatch(answer) {
    const target = norm(answer);
    return function (input) {
      const v = norm(input);
      if (v === target) return 'ok';
      if (v.length > 0 && lev(v, target) <= 1) return 'close';
      return 'no';
    };
  }
  function numberMatch(answer) {
    const target = Number(answer);
    return function (input) {
      const v = Number(String(input).replace(',', '.'));
      if (!isFinite(v)) return 'no';
      if (v === target) return 'ok';
      if (Math.abs(v - target) === 1) return 'close';
      return 'no';
    };
  }
  function choiceMatch(answer) {
    const target = norm(answer);
    return function (input) {
      return norm(input) === target ? 'ok' : 'no';
    };
  }

  // -------------------------------------------------------------------------
  // MATHEMATIQUES
  // -------------------------------------------------------------------------
  function additionExo() {
    const a = rnd(11, 79);
    const b = rnd(6, 99 - a);
    const r = a + b;
    return {
      subject: 'Mathématiques',
      type: 'addition',
      instruction: 'Calcule cette addition.',
      question: `${a} + ${b} = ?`,
      speak: `Calcule ${a} plus ${b}.`,
      inputType: 'number',
      answer: r,
      accept: numberMatch(r),
      hint: `Ajoute d'abord les unités, puis les dizaines.`,
      explanation: `${a} + ${b} = ${r}. On additionne les unités puis les dizaines.`,
    };
  }

  function soustractionExo() {
    const a = rnd(25, 99);
    const b = rnd(3, a - 1);
    const r = a - b;
    return {
      subject: 'Mathématiques',
      type: 'soustraction',
      instruction: 'Calcule cette soustraction.',
      question: `${a} - ${b} = ?`,
      speak: `Calcule ${a} moins ${b}.`,
      inputType: 'number',
      answer: r,
      accept: numberMatch(r),
      hint: `Tu peux compter en avançant de ${b} jusqu'à ${a}.`,
      explanation: `${a} - ${b} = ${r}.`,
    };
  }

  function comparaisonExo() {
    const a = rnd(0, 99);
    const b = rnd(0, 99);
    const r = a > b ? '>' : a < b ? '<' : '=';
    return {
      subject: 'Mathématiques',
      type: 'comparaison',
      instruction: 'Compare les deux nombres avec le bon signe.',
      question: `${a} ... ${b}`,
      speak: `Compare ${a} et ${b}. Choisis plus grand que, plus petit que, ou égal.`,
      inputType: 'choice',
      choices: ['<', '>', '='],
      answer: r,
      accept: choiceMatch(r),
      hint: `Le signe ouvre sa bouche vers le plus grand nombre.`,
      explanation: `${a} ${r} ${b}. Le signe pointe vers le plus petit nombre.`,
    };
  }

  function complementExo() {
    const target = pick([10, 20, 100]);
    const a = target === 100 ? rnd(1, 9) * 10 : rnd(1, target - 1);
    const r = target - a;
    return {
      subject: 'Mathématiques',
      type: 'complement',
      instruction: `Combien faut-il ajouter pour aller jusqu'à ${target} ?`,
      question: `${a} + ? = ${target}`,
      speak: `Combien faut-il ajouter à ${a} pour arriver à ${target} ?`,
      inputType: 'number',
      answer: r,
      accept: numberMatch(r),
      hint: `Cherche ce qui manque à ${a} pour faire ${target}.`,
      explanation: `${a} + ${r} = ${target}. Il faut ajouter ${r}.`,
    };
  }

  function doubleMoitieExo() {
    if (rnd(0, 1) === 0) {
      const a = rnd(2, 25);
      const r = a * 2;
      return {
        subject: 'Mathématiques',
        type: 'double',
        instruction: 'Donne le double.',
        question: `Le double de ${a} = ?`,
        speak: `Quel est le double de ${a} ?`,
        inputType: 'number',
        answer: r,
        accept: numberMatch(r),
        hint: `Le double, c'est ${a} + ${a}.`,
        explanation: `Le double de ${a} est ${r}, car ${a} + ${a} = ${r}.`,
      };
    }
    const half = rnd(2, 25);
    const a = half * 2;
    return {
      subject: 'Mathématiques',
      type: 'moitie',
      instruction: 'Donne la moitié.',
      question: `La moitié de ${a} = ?`,
      speak: `Quelle est la moitié de ${a} ?`,
      inputType: 'number',
      answer: half,
      accept: numberMatch(half),
      hint: `Partage ${a} en deux parts égales.`,
      explanation: `La moitié de ${a} est ${half}, car ${half} + ${half} = ${a}.`,
    };
  }

  function numerationExo() {
    const n = rnd(11, 99);
    const d = Math.floor(n / 10);
    const u = n % 10;
    if (rnd(0, 1) === 0) {
      return {
        subject: 'Mathématiques',
        type: 'dizaines',
        instruction: 'Compte les dizaines.',
        question: `Combien y a-t-il de dizaines dans ${n} ?`,
        speak: `Combien y a-t-il de dizaines dans ${n} ?`,
        inputType: 'number',
        answer: d,
        accept: numberMatch(d),
        hint: `Regarde le chiffre des dizaines dans ${n}.`,
        explanation: `Dans ${n}, il y a ${d} dizaines et ${u} unités.`,
      };
    }
    return {
      subject: 'Mathématiques',
      type: 'unites',
      instruction: 'Compte les unités.',
      question: `Combien y a-t-il d'unités dans ${n} ?`,
      speak: `Combien y a-t-il d'unités dans ${n} ?`,
      inputType: 'number',
      answer: u,
      accept: numberMatch(u),
      hint: `Regarde le dernier chiffre de ${n}.`,
      explanation: `Dans ${n}, il y a ${d} dizaines et ${u} unités.`,
    };
  }

  function suiteExo() {
    const pas = pick([2, 5, 10]);
    const start = rnd(1, 8) * pas;
    const seq = [start, start + pas, start + 2 * pas];
    const r = start + 3 * pas;
    return {
      subject: 'Mathématiques',
      type: 'suite',
      instruction: `Continue la suite (de ${pas} en ${pas}).`,
      question: `${seq.join(', ')}, ?`,
      speak: `Continue la suite : ${seq.join(', ')}. Quel nombre vient ensuite ?`,
      inputType: 'number',
      answer: r,
      accept: numberMatch(r),
      hint: `On ajoute ${pas} à chaque fois.`,
      explanation: `On avance de ${pas} en ${pas} : après ${seq[2]} vient ${r}.`,
    };
  }

  function multiplicationExo() {
    const table = pick([2, 5, 10]);
    const b = rnd(1, 10);
    const r = table * b;
    return {
      subject: 'Mathématiques',
      type: 'multiplication',
      instruction: 'Calcule cette multiplication.',
      question: `${table} × ${b} = ?`,
      speak: `Calcule ${table} fois ${b}.`,
      inputType: 'number',
      answer: r,
      accept: numberMatch(r),
      hint: `${table} × ${b}, c'est ${b} fois le nombre ${table}.`,
      explanation: `${table} × ${b} = ${r}.`,
    };
  }

  function problemeExo() {
    const scenarios = [
      () => {
        const a = rnd(3, 9),
          b = rnd(2, 8);
        return {
          q: `Léa a ${a} billes. Son ami lui en donne ${b}. Combien de billes a-t-elle maintenant ?`,
          r: a + b,
          e: `${a} + ${b} = ${a + b}. Léa a maintenant ${a + b} billes.`,
        };
      },
      () => {
        const a = rnd(10, 20),
          b = rnd(2, 9);
        return {
          q: `Tom a ${a} bonbons. Il en mange ${b}. Combien lui en reste-t-il ?`,
          r: a - b,
          e: `${a} - ${b} = ${a - b}. Il lui reste ${a - b} bonbons.`,
        };
      },
      () => {
        const a = rnd(2, 6),
          b = rnd(2, 5);
        return {
          q: `Il y a ${a} boîtes avec ${b} gâteaux chacune. Combien de gâteaux en tout ?`,
          r: a * b,
          e: `${a} × ${b} = ${a * b}. Il y a ${a * b} gâteaux en tout.`,
        };
      },
    ];
    const s = pick(scenarios)();
    return {
      subject: 'Mathématiques',
      type: 'probleme',
      instruction: 'Lis le problème et écris le résultat (juste le nombre).',
      question: s.q,
      speak: s.q,
      inputType: 'number',
      answer: s.r,
      accept: numberMatch(s.r),
      hint: `Repère si on ajoute, on enlève ou on regroupe.`,
      explanation: s.e,
    };
  }

  // -------------------------------------------------------------------------
  // FRANCAIS
  // -------------------------------------------------------------------------
  const MOTS_DICTEE = [
    'maison', 'école', 'jardin', 'lapin', 'oiseau', 'chat', 'chien', 'fleur',
    'soleil', 'bateau', 'voiture', 'papa', 'maman', 'ami', 'livre', 'table',
    'chaise', 'pomme', 'orange', 'banane', 'cheval', 'poule', 'renard', 'forêt',
    'rivière', 'montagne', 'nuage', 'étoile', 'famille', 'copain',
  ];
  function dicteeExo() {
    const mot = pick(MOTS_DICTEE);
    return {
      subject: 'Français',
      type: 'dictee',
      instruction: 'Écoute bien le mot, puis écris-le correctement.',
      question: '🔊 Écoute le mot et écris-le.',
      speak: `Écris le mot : ${mot}. ${mot}.`,
      autoSpeak: true,
      inputType: 'text',
      answer: mot,
      accept: textMatch(mot),
      hint: `Le mot commence par la lettre « ${mot[0]} ».`,
      explanation: `Le mot était : « ${mot} ». Bravo si tu as bien mis toutes les lettres.`,
    };
  }

  const NOMS_PLURIEL = [
    'chat', 'chien', 'livre', 'ami', 'fleur', 'table', 'crayon', 'ballon',
    'lapin', 'oiseau', 'arbre', 'jardin',
  ];
  function plurielExo() {
    const mot = pick(NOMS_PLURIEL);
    const r = mot + 's';
    return {
      subject: 'Français',
      type: 'pluriel',
      instruction: 'Écris ce nom au pluriel.',
      question: `un ${mot} → des ...`,
      speak: `Écris au pluriel : des ${mot}.`,
      inputType: 'text',
      answer: r,
      accept: textMatch(r),
      hint: `Au pluriel, on ajoute souvent un « s ».`,
      explanation: `Au pluriel : « des ${r} ». On ajoute un « s » à la plupart des noms.`,
    };
  }

  const MOTS_FEMININ = [
    { m: 'chat', f: 'chatte' },
    { m: 'ami', f: 'amie' },
    { m: 'marchand', f: 'marchande' },
    { m: 'voisin', f: 'voisine' },
    { m: 'client', f: 'cliente' },
    { m: 'grand', f: 'grande' },
    { m: 'petit', f: 'petite' },
    { m: 'lapin', f: 'lapine' },
  ];
  function femininExo() {
    const w = pick(MOTS_FEMININ);
    return {
      subject: 'Français',
      type: 'feminin',
      instruction: 'Écris ce mot au féminin.',
      question: `masculin : ${w.m} → féminin : ...`,
      speak: `Écris au féminin le mot ${w.m}.`,
      inputType: 'text',
      answer: w.f,
      accept: textMatch(w.f),
      hint: `Au féminin, on ajoute souvent un « e ».`,
      explanation: `Le féminin de « ${w.m} » est « ${w.f} ».`,
    };
  }

  const VERBES = [
    { inf: 'chanter', je: 'chante', tu: 'chantes', il: 'chante', nous: 'chantons', vous: 'chantez', ils: 'chantent' },
    { inf: 'jouer', je: 'joue', tu: 'joues', il: 'joue', nous: 'jouons', vous: 'jouez', ils: 'jouent' },
    { inf: 'manger', je: 'mange', tu: 'manges', il: 'mange', nous: 'mangeons', vous: 'mangez', ils: 'mangent' },
    { inf: 'regarder', je: 'regarde', tu: 'regardes', il: 'regarde', nous: 'regardons', vous: 'regardez', ils: 'regardent' },
  ];
  const PRONOMS = [
    { p: 'je', k: 'je' },
    { p: 'tu', k: 'tu' },
    { p: 'il', k: 'il' },
    { p: 'nous', k: 'nous' },
    { p: 'vous', k: 'vous' },
    { p: 'ils', k: 'ils' },
  ];
  function conjugaisonExo() {
    const v = pick(VERBES);
    const pr = pick(PRONOMS);
    const r = v[pr.k];
    return {
      subject: 'Français',
      type: 'conjugaison',
      instruction: 'Conjugue le verbe au présent (écris seulement le verbe).',
      question: `${pr.p} (${v.inf}) → ...`,
      speak: `Conjugue le verbe ${v.inf} au présent avec ${pr.p}.`,
      inputType: 'text',
      answer: r,
      accept: textMatch(r),
      hint: `Pense à la terminaison du présent avec « ${pr.p} ».`,
      explanation: `Au présent : « ${pr.p} ${r} ».`,
    };
  }

  const HOMOPHONES = [
    {
      phrase: 'Le chat ... sur le toit.',
      choices: ['et', 'est'],
      answer: 'est',
      rule: `« est » vient du verbe être (on peut dire « était »).`,
    },
    {
      phrase: 'Papa ... maman sont là.',
      choices: ['et', 'est'],
      answer: 'et',
      rule: `« et » relie deux mots (on peut dire « et puis »).`,
    },
    {
      phrase: 'Je vais ... la maison.',
      choices: ['a', 'à'],
      answer: 'à',
      rule: `« à » avec accent indique le lieu ou la direction.`,
    },
    {
      phrase: 'Elle ... un beau vélo.',
      choices: ['a', 'à'],
      answer: 'a',
      rule: `« a » sans accent vient du verbe avoir (on peut dire « avait »).`,
    },
    {
      phrase: 'Les enfants ... contents.',
      choices: ['son', 'sont'],
      answer: 'sont',
      rule: `« sont » vient du verbe être (on peut dire « étaient »).`,
    },
    {
      phrase: 'Léo joue avec ... ballon.',
      choices: ['son', 'sont'],
      answer: 'son',
      rule: `« son » montre à qui c'est (son ballon = le ballon de Léo).`,
    },
  ];
  function homophoneExo() {
    const h = pick(HOMOPHONES);
    return {
      subject: 'Français',
      type: 'homophone',
      instruction: 'Choisis le bon petit mot pour compléter la phrase.',
      question: h.phrase,
      speak: `Complète la phrase : ${h.phrase.replace('...', 'quoi ?')}`,
      inputType: 'choice',
      choices: h.choices,
      answer: h.answer,
      accept: choiceMatch(h.answer),
      hint: h.rule,
      explanation: `Réponse : « ${h.answer} ». ${h.rule} → ${h.phrase.replace('...', h.answer)}`,
    };
  }

  function alphabetExo() {
    const lettres = 'abcdefghijklmnopqrstuvwxyz'.split('');
    const trois = shuffle(lettres).slice(0, 3);
    const r = trois.slice().sort()[0];
    return {
      subject: 'Français',
      type: 'alphabet',
      instruction: "Dans l'ordre alphabétique, quelle lettre vient en premier ?",
      question: trois.join(' , '),
      speak: `Quelle lettre vient en premier dans l'ordre alphabétique : ${trois.join(', ')} ?`,
      inputType: 'choice',
      choices: trois,
      answer: r,
      accept: choiceMatch(r),
      hint: `Récite l'alphabet : a, b, c, d ...`,
      explanation: `Dans l'ordre alphabétique, « ${r} » vient en premier.`,
    };
  }

  const SYLL = [
    { mot: 'chocolat', n: 3 },
    { mot: 'papillon', n: 3 },
    { mot: 'école', n: 3 },
    { mot: 'lapin', n: 2 },
    { mot: 'ballon', n: 2 },
    { mot: 'ordinateur', n: 4 },
    { mot: 'banane', n: 3 },
    { mot: 'chat', n: 1 },
    { mot: 'maison', n: 2 },
    { mot: 'tomate', n: 3 },
  ];
  function syllabeExo() {
    const s = pick(SYLL);
    return {
      subject: 'Français',
      type: 'syllabes',
      instruction: 'Combien de syllabes entends-tu dans ce mot ?',
      question: `Le mot : « ${s.mot} »`,
      speak: `Combien de syllabes dans le mot ${s.mot} ?`,
      inputType: 'number',
      answer: s.n,
      accept: numberMatch(s.n),
      hint: `Tape dans tes mains en disant le mot.`,
      explanation: `« ${s.mot} » a ${s.n} syllabe${s.n > 1 ? 's' : ''}.`,
    };
  }

  // -------------------------------------------------------------------------
  // Construction d'une session (environ 20 minutes)
  // -------------------------------------------------------------------------
  const MATHS = [
    additionExo, soustractionExo, comparaisonExo, complementExo,
    doubleMoitieExo, numerationExo, suiteExo, multiplicationExo, problemeExo,
  ];
  const FRANCAIS = [
    dicteeExo, plurielExo, femininExo, conjugaisonExo, homophoneExo,
    alphabetExo, syllabeExo,
  ];

  function buildSession(count) {
    count = count || 18;
    const list = [];
    let i = 0;
    while (list.length < count) {
      const gen = i % 2 === 0 ? pick(MATHS) : pick(FRANCAIS);
      const exo = gen();
      exo.id = 'exo-' + (list.length + 1);
      list.push(exo);
      i++;
    }
    return list;
  }

  window.CE1Exercises = { buildSession };
})();
