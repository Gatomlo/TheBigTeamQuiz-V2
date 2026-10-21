# The Big Team Quiz

Outil de quiz en direct pour team building (Team Building du Phoenix) : l'animateur pilote, le projecteur affiche, les équipes buzzent depuis leur téléphone.

## Stack
- Front statique : `index.html` + `main.js` (jQuery) + `main.css` + Bootstrap 5.3 (CDN). Même page pour 2 écrans : gestionnaire (défaut) et display (`?mode=display`).
- Serveur : `server/` — Node ≥ 22.5, Express + Socket.IO + `node:sqlite` (`server/data/quiz.db`), upload médias via `multer`. Voir `server/README.md`.
- App joueur (téléphone) : `server/public/` (`index.html`, `buzz.js`, `buzz.css`), servie par le serveur Node.

## Architecture / fichiers clés
- `server/server.js` : état de jeu **faisant autorité** en mémoire, diffusé à chaque action par l'évènement socket `state` (`currentState()`). Le front ne fait que rendre cet état (`handleBuzzState` → fonctions `render*` dans `main.js`).
- `main.js` : `initAppMode()` ajoute `body.mode-control|mode-display`. Le CSS de l'interface gestionnaire est **borné à `body.mode-control`** (section « REFONTE ECRAN GESTIONNAIRE » en fin de `main.css`) ; l'écran display garde ses styles d'origine et masque `.sidebar/.bar/.sideCol/.joinCollect/.buzzerCollect`.
- Interface gestionnaire : barre latérale cuir (scénario, liste d'épreuves `#sidebarEpreuves`, outils), barre de fil d'Ariane, 3 colonnes (question / buzzer en direct / équipes + display + QR). Tous les IDs de `index.html` sont utilisés par `main.js` : ne pas les renommer.
- Thème clair/sombre automatique (`prefers-color-scheme`) ; palette marque : orange `#FF934F/#E0701F`, vert `#4B967D`, cuir `#2A1D15/#17100B`, parchemin `#F1E4C8/#1B1410` ; polices Amatic SC (titres) + Figtree.
- Ne jamais reconstruire de boutons dans les `setInterval` (250 ms / 1 s) : seulement des textes/attributs (voir `renderControlTimer`).

- Vote facultatif de l'épreuve suivante : état `vote` en mémoire serveur (`startVote/closeVote/publicVote`, évènements `start-vote`, `cast-vote`, `end-vote`, `cancel-vote`, `set-vote-winner`), un vote par équipe. `broadcastState()` envoie les scores du vote au gestionnaire seul tant que le vote est secret. Réglages par défaut par scénario dans `scenarios.vote_settings` (JSON : auto, count, duration, live, autoLaunch) ; vote automatique déclenché au retour au menu après une épreuve (`maybeAutoVote`). UI : `renderVoteControl` (panneau gestionnaire), `renderDisplayVote` (overlay display), `renderVoteBlock` dans `server/public/buzz.js` (téléphone).

- Plein écran automatique (smartphone/tablette, `pointer: coarse` uniquement ; pas sur le display) : activé au lancement du scénario (clic « Lancer » côté gestionnaire) ou au premier appui une fois la partie démarrée (téléphone, ou page rechargée en cours de partie), une tentative par chargement. Réglage `localStorage.autoFullscreen` ('0' = désactivé) : case dans la barre latérale (gestionnaire) ou ⚙ Réglages (téléphone). Indisponible sur iPhone Safari (API absente).

## Données
- SQLite (migrations additives via `ensureColumn` au démarrage du serveur) : épreuves, questions (médias dans `medias/`/uploads), scénarios, historique des parties. Mode répétition = partie non enregistrée.
- Les équipes/scores en cours vivent en mémoire serveur + `localStorage` du gestionnaire (autorité sur la liste d'équipes).

## Lancer / tester / déployer
- Prod : serveur Node port 3000, site statique port 8080 (ne pas toucher sans accord de l'utilisateur).
- Test : `cd server && PORT=3099 node server.js` + `npx http-server -p 8099 -c-1 .` puis `http://127.0.0.1:8099/index.html?buzz=http://127.0.0.1:3099` (display : ajouter `&mode=display`, téléphone : `http://127.0.0.1:3099/`). **La base `server/data/quiz.db` est la même qu'en prod** : nettoyer toute donnée de test, privilégier le mode répétition.
- Authentification gestionnaire : mot de passe (par défaut `quiz2024` tant qu'inchangé), mémorisée via `localStorage.managerAuthenticatedUntil`.

## Méthode de travail
- Réponses en français, concises. Tester par API/ligne de commande avant les captures d'écran.
- Pas d'accents dans `curl -d` inline (utiliser `--data-binary @fichier`).
- Le dépôt git a un index corrompu (« unknown index entry format ») : ne pas committer sans réparer.
