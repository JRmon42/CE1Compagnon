# 👑 CE1 Compagnon

Petite application web d'entraînement du soir pour un·e élève de **CE1** (France).
Exercices de **français** et de **mathématiques**, en français, avec correction
**écrite et vocale**, des **smileys** d'encouragement et un **calendrier** des résultats.

Pensée pour être utilisée **chaque soir pendant ~20 minutes**, sur **ordinateur portable et tablette**,
et accédée en **HTTPS**.

## ✨ Fonctionnalités

- **Connexion** par identifiant + mot de passe.
- **Séance de ~20 minutes** : une série d'exercices variés (minuteur intégré).
- **Correction immédiate** après chaque réponse :
  - la bonne réponse est affichée,
  - une **explication écrite en français**,
  - la même explication **lue à voix haute** (synthèse vocale française du navigateur).
- **Smileys** par exercice :
  - 😄👑 Très bien (bonne réponse du premier coup)
  - 🙂👑 Bien (bonne réponse avec un indice)
  - 😐 Moyen (réponse presque juste)
  - 😢 À revoir (réponse à retravailler)
- **Note globale** de fin de séance (sur 20 + smiley).
- **Calendrier** qui historise le résultat de chaque soir.

Types d'exercices : additions, soustractions, comparaisons, compléments, doubles/moitiés,
numération (dizaines/unités), suites, multiplications simples, petits problèmes,
dictée de mots (lus à voix haute), pluriel, féminin, conjugaison au présent,
homophones (a/à, et/est, son/sont), ordre alphabétique, syllabes.

## 🚀 Lancer en local

```bash
npm install
npm start
# ouvrir http://localhost:3000
```

Compte par défaut (créé au premier démarrage) :
- identifiant : `eleve`
- mot de passe : `ce1`

Personnalisable via les variables d'environnement `DEFAULT_LOGIN`, `DEFAULT_PASSWORD`, `DEFAULT_NAME`.

## 🔧 Technique

- **Backend** : Node.js + Express (sessions, hash bcrypt des mots de passe).
- **Frontend** : HTML/CSS/JS (aucun build), synthèse vocale via l'API `speechSynthesis` du navigateur.
- **Données** : fichiers JSON dans `DATA_DIR` (par défaut `/home/data` sur Azure App Service, persistant).

### Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `PORT` | port HTTP | `3000` |
| `DATA_DIR` | dossier de stockage | `/home/data` (ou `./data`) |
| `DEFAULT_LOGIN` | identifiant du compte créé | `eleve` |
| `DEFAULT_PASSWORD` | mot de passe du compte créé | `ce1` |
| `DEFAULT_NAME` | prénom affiché | `Ma championne` |
| `SESSION_SECRET` | secret des cookies de session | à définir en production |

## ☁️ Déploiement Azure

Déployé sur **Azure App Service** (Linux, Node). Le HTTPS est fourni automatiquement
sur le domaine `*.azurewebsites.net`. Le dossier `/home` est persistant, donc les
comptes et l'historique sont conservés.
