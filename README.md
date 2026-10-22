# 👑 CE1 Compagnon

Petite application web d'entraînement du soir pour un·e élève de **CE1** (France).
Exercices de **français** et de **mathématiques**, en français, avec correction
**écrite et vocale**, des **smileys** d'encouragement et un **calendrier** des résultats.

Pensée pour être utilisée **chaque soir pendant ~20 minutes**, sur **ordinateur portable et tablette**,
et accédée en **HTTPS**.

## ✨ Fonctionnalités

- **Connexion** par identifiant + mot de passe, ou **création de compte** depuis la page d'accueil
  (si l'identifiant existe déjà, l'application propose de se connecter).
- **Rôles** : *administrateur* (parent / enseignant) et *élève*.
- **Gestion des utilisateurs** (administrateurs) : ajouter, renommer, changer le rôle,
  réinitialiser le mot de passe, supprimer un compte, voir le calendrier de chaque élève,
  et ouvrir ou fermer la création de compte publique.
- Chaque utilisateur peut **changer son mot de passe**.
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

Au premier lancement, ouvrir l'onglet **Créer un compte** : tant qu'aucun administrateur
n'existe, **le premier compte créé devient administrateur**. Il peut ensuite créer les comptes
des élèves depuis **👥 Gérer les utilisateurs**, et fermer la création de compte publique.

Optionnel : `DEFAULT_LOGIN` / `DEFAULT_PASSWORD` / `DEFAULT_NAME` créent un compte élève au
démarrage, et `ADMIN_LOGIN` promeut un compte existant en administrateur.

## 🔧 Technique

- **Backend** : Node.js + Express (sessions, hash bcrypt des mots de passe).
- **Frontend** : HTML/CSS/JS (aucun build), synthèse vocale via l'API `speechSynthesis` du navigateur.
- **Données** : fichiers JSON dans `DATA_DIR` (par défaut `/home/data` sur Azure App Service, persistant ;
  `./data` en local) : `users.json`, `settings.json`, `results/<identifiant>.json`.

### Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `PORT` | port HTTP | `3000` |
| `DATA_DIR` | dossier de stockage | `/home/data` (ou `./data`) |
| `DEFAULT_PASSWORD` | si défini, crée un compte élève au démarrage | — |
| `DEFAULT_LOGIN` | identifiant de ce compte | `eleve` |
| `DEFAULT_NAME` | prénom affiché | `Ma championne` |
| `ADMIN_LOGIN` | promeut ce compte existant en administrateur au démarrage | — |
| `SESSION_SECRET` | secret des cookies de session | à définir en production |

## ☁️ Déploiement Azure

Déployé sur **Azure App Service** (Linux, Node). Le HTTPS est fourni automatiquement
sur le domaine `*.azurewebsites.net`. Le dossier `/home` est persistant, donc les
comptes et l'historique sont conservés.

```bash
# Déploiement (les dépendances sont incluses dans le zip)
npm ci --omit=dev
zip -qr app.zip . -x '.git/*' 'data/*'
az webapp deploy -g rg-ce1compagnon -n ce1compagnon-hpc --src-path app.zip --type zip
```
