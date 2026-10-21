# Serveur de buzz — The Big Team Quiz

Serveur Node (Express + Socket.IO) qui gere en temps reel :
- le buzzer des joueurs (choix d'equipe depuis un telephone, verrouillage, cooldown) ;
- le gestionnaire d'epreuves/scenarios (banque de questions avec medias
  uploades, types de reponse buzzer/qcm/reponse directe) ;
- l'historique des parties (SQLite, via le module natif `node:sqlite` —
  aucune dependance npm a compiler pour la base elle-meme).

Une seule dependance npm reelle : `multer`, pour l'upload de medias
(`POST /api/upload`).

## Prerequis

- Node.js **22.5 ou superieur** (le module `node:sqlite` n'existe pas avant).
  Verifier la version disponible dans le gestionnaire Node de l'hebergement
  Infomaniak avant de deployer.

## Installation

```bash
cd server
npm install
npm start
```

Le serveur ecoute sur le port defini par la variable d'environnement `PORT`
(3000 par defaut). Sur Infomaniak, le manager Node.js impose generalement son
propre port via `process.env.PORT` — ne pas le forcer en dur.

L'ecran gestionnaire est protege par un mot de passe unique, defini via la
variable d'environnement `MANAGER_PASSWORD` (`quiz2024` par defaut si non
definie — **a changer avant un vrai evenement**, sans quoi n'importe qui
connaissant ce defaut peut ouvrir l'ecran gestionnaire). Ce n'est pas une
authentification robuste (pas de compte, pas de protection sur les appels
Socket.IO/REST sous-jacents pour quelqu'un de technique) : ca suffit a
empecher un participant curieux de tomber sur l'interface d'administration,
pas plus.

## Deploiement (Infomaniak, app Node.js)

1. Creer une application Node.js dans le manager d'hebergement, avec pour
   racine ce dossier `server/` et pour fichier d'entree `server.js`.
2. Choisir une version de Node >= 22.5 dans le selecteur.
3. Assigner un (sous-)domaine a cette application, par exemple
   `buzz.quiz.ranchduphoenix.be`.
4. Laisser l'hebergeur executer `npm install` (ou le faire manuellement en
   SSH) puis demarrer l'application.
5. Dans le site principal (`index.html`, a la racine du depot, deploye comme
   avant sur l'hebergement statique/Apache), mettre a jour la constante :

   ```html
   <script>
     window.BUZZ_SERVER_URL = "https://buzz.quiz.ranchduphoenix.be";
   </script>
   ```

   avec l'URL reelle de l'application Node deployee.

## Derriere la passerelle node-gateway (optionnel)

`server.js` exporte l'app Express (`module.exports = app`) et une fonction `app.attachToServer(httpServer, { mountPath })`. La passerelle (https://github.com/Gatomlo/node-gateway, branche `feature/attach-socket` ou apres fusion) l'appelle avec son propre serveur HTTP : Socket.IO ecoute alors sur `<mountPath>/socket.io` (ex. `/quiz/socket.io`). Lance seul (`node server.js`), rien ne change.

1. Deposer ce dossier `server/` (avec `data/`) dans `apps/quiz/` de la passerelle (Node >= 22.5 requis pour `node:sqlite`).
2. Dans le site statique, regler `window.BUZZ_SERVER_URL = "https://<hote>/quiz"` (ou `?buzz=https://<hote>/quiz`). Le client prend le prefixe pour le chemin Socket.IO, pas pour un namespace.
3. La page joueur est servie sur `https://<hote>/quiz/`.

## Donnees

- L'etat de la partie en cours (equipes, scores, manche de buzz, position
  dans le scenario en cours) vit en memoire : redemarrer le serveur
  reinitialise la partie en cours. C'est voulu — c'est un outil de soiree,
  pas un service permanent.
- Les epreuves, questions et scenarios crees via "Gerer les epreuves"/"Gerer
  les scenarios" sont persistes dans `server/data/quiz.db` (SQLite) et
  survivent aux redemarrages.
- L'historique des parties terminees est persiste dans la meme base. Ce
  fichier est cree automatiquement au premier lancement et n'est pas commite
  (voir `.gitignore`). Pensez a le sauvegarder/copier si vous changez de
  serveur et voulez garder l'historique et vos epreuves/scenarios.
- Une partie est archivee automatiquement quand l'animateur clique sur
  "Effacer les equipes" alors que des equipes existaient (transition
  equipes -> aucune equipe).
- Les medias uploades pour les questions sont stockes dans
  `server/public/uploads/` (non commite non plus — a sauvegarder avec
  `data/` si vous changez de serveur).

## Migration du contenu d'origine

Le contenu fige d'origine (Komencasapel, etc.) a ete converti une fois pour
toutes en epreuves/scenario via `server/scripts/migrate-legacy-content.js`
(deja execute — le scenario "Quiz d'origine" est dans `data/quiz.db`). Ce
script n'a pas besoin d'etre relance ; il est conserve pour reference/tracabilite.

## Endpoints

- Page joueur (mobile) : `GET /` — choix ou creation d'equipe, puis buzzer/qcm/reponse directe selon la question en cours.
- `GET /api/leaderboard` — top 10 des scores toutes parties confondues.
- `GET/POST/PUT/DELETE /api/epreuves[/:id]`, `/api/epreuves/:id/questions`,
  `/api/questions/:id[/move]` — CRUD des epreuves et de leurs questions.
- `GET/POST/PUT/DELETE /api/scenarios[/:id]` — CRUD des scenarios (listes
  ordonnees d'epreuves avec overrides optionnels).
- `POST /api/upload` (multipart, champ `file`) — upload d'un media de
  question, retourne `{ url }`.
- Socket.IO (evenements) : `sync-teams`, `create-team`, `set-config`,
  `open-round`, `buzz`, `resolve-correct`, `resolve-wrong`, `lock-all`,
  `unlock-all`, `unlock-remaining`, `launch-scenario`, `next-question`,
  `prev-question`, `submit-answer`, `validate-answer`, `show-qr`/`hide-qr`,
  `show-scoreboard`/`hide-scoreboard`, `register-role` — tous diffuses via
  l'evenement `state`.
