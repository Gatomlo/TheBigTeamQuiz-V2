// Prefixe de montage deduit de l'URL de la page : '' en autonome, '/quiz' derriere la passerelle.
const BASE_PATH = new URL('.', location.href).pathname.replace(/\/$/, '');
const socket = io({ path: BASE_PATH + '/socket.io' });
// Re-envoye a CHAQUE connexion (pas juste la premiere) : une reconnexion
// socket.io (coupure wifi momentanee) obtient un nouveau socket.id cote
// serveur, qui doit donc se re-annoncer comme "phone" a chaque fois pour
// rester compte dans phoneClientCount (indicateur de connexion cote gestionnaire).
socket.on('connect', () => {
  socket.emit('register-role', 'phone');
});

let myTeam = localStorage.getItem('buzzTeam') || null;
let latestState = {
  teams: [], teamScores: {}, teamSounds: {},
  config: { buzzMode: 'single', excludeWrongTeamAfterCooldown: true, maxAnswerSeconds: 0, buzzVolume: 1 },
  round: { open: false, activeTeam: null, excludedTeams: [], buzzes: [] },
  game: { hasScenario: false, current: null, answers: {}, validations: {} }
};
let iHoldTheFloor = false; // pour ne jouer le son de confirmation qu'une seule fois par buzz
let selectedCreateSound = null;

const joinChoice = document.getElementById('joinChoice');
const createForm = document.getElementById('createForm');
const joinList = document.getElementById('joinList');
const teamPicker = document.getElementById('teamPicker');
const teamListEl = document.getElementById('teamList');
const noTeamsMessage = document.getElementById('noTeamsMessage');
const newTeamNameInput = document.getElementById('newTeamNameInput');
const createSoundListEl = document.getElementById('createSoundList');
const createTeamError = document.getElementById('createTeamError');
const buzzScreen = document.getElementById('buzzScreen');
const currentTeamLabel = document.getElementById('currentTeamLabel');
const scoreButton = document.getElementById('scoreButton');
const buzzButton = document.getElementById('buzzButton');
const buzzStatus = document.getElementById('buzzStatus');
const changeTeamLink = document.getElementById('changeTeamLink');
const scoreboardOverlay = document.getElementById('scoreboardOverlay');
const scoreboardList = document.getElementById('scoreboardList');
const buzzerAnswerBlock = document.getElementById('buzzerAnswerBlock');
const qcmAnswerBlock = document.getElementById('qcmAnswerBlock');
const directAnswerBlock = document.getElementById('directAnswerBlock');
const qcmQuestionText = document.getElementById('qcmQuestionText');
const qcmOptionsList = document.getElementById('qcmOptionsList');
const qcmStatus = document.getElementById('qcmStatus');
const directQuestionText = document.getElementById('directQuestionText');
const directAnswerInput = document.getElementById('directAnswerInput');
const submitDirectAnswerButton = document.getElementById('submitDirectAnswerButton');
const directStatus = document.getElementById('directStatus');
const voteBlock = document.getElementById('voteBlock');
const voteLead = document.getElementById('voteLead');
const voteTimer = document.getElementById('voteTimer');
const voteOptionsList = document.getElementById('voteOptionsList');
const voteStatus = document.getElementById('voteStatus');
let lastVoteKey = null;      // pour ne reconstruire les boutons de vote qu'une fois par vote
let myVoteChoice = null;    // { startedAt, id } : mon dernier choix confirme par le serveur
let lastRenderedQuestionKey = null; // pour ne reconstruire les boutons qcm qu'une fois par question

// Sons synthetises (Web Audio API) : pas de fichier audio a heberger.
//
// Un seul oscillateur pur sonnait mince et se ressemblait beaucoup d'un son a
// l'autre. Pour des sons plus forts ET plus distincts sans fichiers audio :
// - chaque note peut empiler des "layers" (oscillateurs supplementaires sur
//   la meme duree, a une frequence relative et un gain relatif) : un accord
//   au lieu d'une note seule sonne nettement plus fort et plus riche, sans
//   pousser un seul oscillateur au-dela de ce qu'un haut-parleur de telephone
//   peut restituer proprement ;
// - une note peut glisser en frequence (to) pour les sons sirene/laser, bien
//   plus reconnaissables et percutants qu'une alternance de notes fixes ;
// - l'attaque est quasi instantanee (montee en 15ms) pour un rendu "punchy"
//   plutot qu'un fondu, ce qui se percoit comme plus fort a gain egal.
let audioCtx = null;
function playOscillator(frequency, freqTo, startOffsetMs, durationMs, type, peakGain) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const startTime = audioCtx.currentTime + startOffsetMs / 1000;
    const endTime = startTime + durationMs / 1000;
    const attackTime = Math.min(0.015, durationMs / 2000);
    const oscillator = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    oscillator.type = type || 'square';
    oscillator.frequency.setValueAtTime(frequency, startTime);
    if (freqTo) oscillator.frequency.exponentialRampToValueAtTime(freqTo, endTime);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peakGain), startTime + attackTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, endTime);
    oscillator.connect(gain);
    gain.connect(audioCtx.destination);
    oscillator.start(startTime);
    oscillator.stop(endTime);
  } catch (e) {
    // Web Audio indisponible (ancien navigateur) : on ignore silencieusement.
  }
}

// Une note : { freq, dur, type?, to?, layers? }. "layers" (optionnel) est une
// liste de { ratio, gain, type? } jouee en meme temps que la note principale,
// a frequence = freq * ratio (accordee harmoniquement : 2 = octave, 1.5 =
// quinte) et a un gain relatif au volume regle par l'animateur.
function playNote(note, startOffsetMs, volume, defaultType) {
  const peak = typeof volume === 'number' ? volume : 1;
  const type = note.type || defaultType;
  playOscillator(note.freq, note.to || null, startOffsetMs, note.dur, type, peak * 0.85);
  (note.layers || []).forEach((layer) => {
    playOscillator(note.freq * layer.ratio, note.to ? note.to * layer.ratio : null, startOffsetMs, note.dur, layer.type || type, peak * layer.gain);
  });
}

// Le son est choisi une fois, a la creation de l'equipe, et reste attache a
// celle-ci (modifiable ensuite uniquement depuis l'ecran gestionnaire). Les
// 10 sons sont volontairement varies en registre, forme d'onde et rythme
// (accords, glissandos, blips...) pour rester reconnaissables les uns des
// autres meme rejoues cote a cote.
const BUZZ_SOUNDS = {
  cloche: { label: '🔔 Cloche', type: 'sine', notes: [
    { freq: 1046, dur: 180, layers: [{ ratio: 2, gain: 0.35 }] },
    { freq: 784, dur: 380, layers: [{ ratio: 2, gain: 0.3 }] }
  ] },
  corne: { label: '📯 Corne', type: 'sawtooth', notes: [
    { freq: 196, dur: 550, layers: [{ ratio: 1.5, gain: 0.6 }, { ratio: 2, gain: 0.4 }] }
  ] },
  arcade: { label: '🎮 Arcade', type: 'square', notes: [
    { freq: 523, dur: 80, layers: [{ ratio: 2, gain: 0.4 }] },
    { freq: 659, dur: 80, layers: [{ ratio: 2, gain: 0.4 }] },
    { freq: 784, dur: 80, layers: [{ ratio: 2, gain: 0.4 }] },
    { freq: 1047, dur: 240, layers: [{ ratio: 2, gain: 0.5 }] }
  ] },
  alarme: { label: '🚨 Alarme', type: 'sawtooth', notes: [
    { freq: 500, to: 950, dur: 220, layers: [{ ratio: 2, gain: 0.35 }] },
    { freq: 950, to: 500, dur: 220, layers: [{ ratio: 2, gain: 0.35 }] },
    { freq: 500, to: 950, dur: 220, layers: [{ ratio: 2, gain: 0.35 }] }
  ] },
  laser: { label: '🔫 Laser', type: 'sawtooth', notes: [
    { freq: 2200, to: 180, dur: 260, layers: [{ ratio: 2, gain: 0.3 }] }
  ] },
  gong: { label: '🥁 Gong', type: 'triangle', notes: [
    { freq: 130, dur: 650, layers: [{ ratio: 2, gain: 0.5 }, { ratio: 3, gain: 0.3 }] }
  ] },
  trompette: { label: '🎺 Trompette', type: 'sawtooth', notes: [
    { freq: 392, dur: 140, layers: [{ ratio: 1.5, gain: 0.55 }] },
    { freq: 494, dur: 140, layers: [{ ratio: 1.5, gain: 0.55 }] },
    { freq: 587, dur: 340, layers: [{ ratio: 1.5, gain: 0.6 }, { ratio: 2, gain: 0.35 }] }
  ] },
  tada: { label: '🎉 Tada', type: 'square', notes: [
    { freq: 523, dur: 90, layers: [{ ratio: 1.5, gain: 0.4 }] },
    { freq: 659, dur: 90, layers: [{ ratio: 1.5, gain: 0.4 }] },
    { freq: 784, dur: 90, layers: [{ ratio: 1.5, gain: 0.4 }] },
    { freq: 1047, dur: 320, layers: [{ ratio: 1.5, gain: 0.5 }, { ratio: 2, gain: 0.4 }] }
  ] },
  robot: { label: '🤖 Robot', type: 'square', notes: [
    { freq: 300, dur: 90, layers: [{ ratio: 1.015, gain: 0.7 }] },
    { freq: 240, dur: 90, layers: [{ ratio: 1.015, gain: 0.7 }] },
    { freq: 180, dur: 90, layers: [{ ratio: 1.015, gain: 0.7 }] },
    { freq: 130, dur: 220, layers: [{ ratio: 1.015, gain: 0.7 }] }
  ] },
  ding: { label: '✨ Ding', type: 'triangle', notes: [
    { freq: 1568, dur: 120, layers: [{ ratio: 1.5, gain: 0.4 }] },
    { freq: 2093, dur: 280, layers: [{ ratio: 1.5, gain: 0.4 }] }
  ] }
};

function playBuzzSound(soundKey, volume) {
  const sound = BUZZ_SOUNDS[soundKey] || BUZZ_SOUNDS.cloche;
  let offset = 0;
  sound.notes.forEach((note) => {
    playNote(note, offset, volume, sound.type);
    offset += note.dur;
  });
}

function initCreateSoundPicker() {
  Object.keys(BUZZ_SOUNDS).forEach((key) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'soundChoiceButton';
    btn.textContent = BUZZ_SOUNDS[key].label;
    btn.addEventListener('click', () => {
      selectedCreateSound = key;
      document.querySelectorAll('#createSoundList .soundChoiceButton').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      playBuzzSound(key, latestState.config && latestState.config.buzzVolume);
    });
    createSoundListEl.appendChild(btn);
  });
  selectedCreateSound = Object.keys(BUZZ_SOUNDS)[0];
  createSoundListEl.firstChild.classList.add('selected');
}
initCreateSoundPicker();

socket.on('state', (state) => {
  const wasHoldingFloor = iHoldTheFloor;
  latestState = state;
  iHoldTheFloor = myTeam && state.round.activeTeam === myTeam;
  if (iHoldTheFloor && !wasHoldingFloor) {
    playBuzzSound((state.teamSounds && state.teamSounds[myTeam]) || 'cloche', state.config && state.config.buzzVolume);
    if (navigator.vibrate) navigator.vibrate([80, 40, 80]); // motif distinct : "vous avez la parole"
  }
  render();
});

socket.on('create-team-accepted', ({ name }) => {
  chooseTeam(name);
});

socket.on('create-team-rejected', ({ reason }) => {
  createTeamError.textContent = reason || "Impossible de creer cette equipe.";
  createTeamError.hidden = false;
});

// Un premier tap sur mobile doit debloquer l'audio (politique autoplay des navigateurs).
document.body.addEventListener('touchstart', () => {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
}, { once: true });

function showJoinChoice(){
  joinChoice.hidden = false;
  createForm.hidden = true;
  joinList.hidden = true;
  createTeamError.hidden = true;
}
function showCreateForm(){
  joinChoice.hidden = true;
  createForm.hidden = false;
  joinList.hidden = true;
  newTeamNameInput.value = '';
  createTeamError.hidden = true;
}
function showJoinList(){
  joinChoice.hidden = true;
  createForm.hidden = true;
  joinList.hidden = false;
  renderJoinList();
}

document.getElementById('showCreateFormButton').addEventListener('click', showCreateForm);
document.getElementById('showJoinListButton').addEventListener('click', showJoinList);
document.getElementById('backToChoiceFromCreate').addEventListener('click', (e) => { e.preventDefault(); showJoinChoice(); });
document.getElementById('backToChoiceFromList').addEventListener('click', (e) => { e.preventDefault(); showJoinChoice(); });

document.getElementById('confirmCreateTeamButton').addEventListener('click', () => {
  const name = newTeamNameInput.value.trim();
  if (!name) {
    createTeamError.textContent = 'Choisissez un nom d\'equipe.';
    createTeamError.hidden = false;
    return;
  }
  socket.emit('create-team', { name, sound: selectedCreateSound });
});

changeTeamLink.addEventListener('click', (e) => {
  e.preventDefault();
  myTeam = null;
  localStorage.removeItem('buzzTeam');
  render();
});

scoreButton.addEventListener('click', () => {
  renderScoreboard();
  scoreboardOverlay.hidden = false;
});

document.getElementById('closeScoreboardButton').addEventListener('click', () => {
  scoreboardOverlay.hidden = true;
});

// Buzz retenu localement si le reseau coupe au mauvais moment (voir plus
// bas) : envoye des que la connexion socket.io revient, plutot qu'un buzz
// perdu en silence sans que le joueur sache pourquoi son geste n'a rien fait.
let pendingBuzzTeam = null;

buzzButton.addEventListener('click', () => {
  if (!myTeam || buzzButton.disabled) return;
  // Petit retour haptique immediat au moment ou le joueur appuie, avant meme
  // la reponse du serveur : rend le geste plus satisfaisant (feutre sur les
  // navigateurs/appareils sans support de vibrate - .vibrate est absent en
  // silence sur iOS Safari, aucune erreur).
  if (navigator.vibrate) navigator.vibrate(60);
  if (socket.connected) {
    socket.emit('buzz', myTeam);
  } else {
    pendingBuzzTeam = myTeam;
    render();
  }
});

socket.on('connect', () => {
  // Fusionne avec le re-enregistrement du role phone (voir le handler
  // 'connect' tout en haut du fichier) : les deux doivent se rejouer a
  // chaque reconnexion.
  if (pendingBuzzTeam) {
    socket.emit('buzz', pendingBuzzTeam);
    pendingBuzzTeam = null;
  }
});

function chooseTeam(team) {
  myTeam = team;
  localStorage.setItem('buzzTeam', team);
  render();
}

function renderJoinList(){
  const { teams, teamScores } = latestState;
  teamListEl.innerHTML = '';
  noTeamsMessage.hidden = teams.length > 0;
  teams.forEach((team) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'teamChoiceButton';
    const score = (teamScores && teamScores[team]) || 0;
    btn.innerHTML = team + ' <span class="teamChoiceScore">(' + score + ' pts)</span>';
    btn.addEventListener('click', () => chooseTeam(team));
    teamListEl.appendChild(btn);
  });
}

function renderScoreboard(){
  const { teams, teamScores } = latestState;
  const rows = teams.map((name) => ({ name, score: (teamScores && teamScores[name]) || 0 }));
  rows.sort((a, b) => b.score - a.score);
  scoreboardList.innerHTML = '';
  if (!rows.length) {
    scoreboardList.innerHTML = '<p class="muted">Aucune equipe.</p>';
    return;
  }
  rows.forEach((row, index) => {
    const div = document.createElement('div');
    div.className = 'scoreboardRow' + (row.name === myTeam ? ' myTeamRow' : '');
    div.innerHTML = '<span>' + (index + 1) + '. ' + row.name + '</span><span>' + row.score + ' pts</span>';
    scoreboardList.appendChild(div);
  });
}

function render() {
  const { teams, teamScores, round, config } = latestState;
  const teamStillExists = myTeam && teams.includes(myTeam);

  if (!teamStillExists) {
    myTeam = null;
    teamPicker.hidden = false;
    buzzScreen.hidden = true;
    if (joinChoice.hidden && createForm.hidden && joinList.hidden) showJoinChoice();
    if (!joinList.hidden) renderJoinList();
    return;
  }

  teamPicker.hidden = true;
  buzzScreen.hidden = false;
  currentTeamLabel.textContent = myTeam;
  scoreButton.textContent = ((teamScores && teamScores[myTeam]) || 0) + ' points · voir le classement';
  if (!scoreboardOverlay.hidden) renderScoreboard();

  if (renderVoteBlock()) {
    buzzerAnswerBlock.hidden = true;
    qcmAnswerBlock.hidden = true;
    directAnswerBlock.hidden = true;
    return;
  }

  const game = latestState.game;
  const responseType = (game && game.current) ? game.current.responseType : 'buzzer';
  buzzerAnswerBlock.hidden = responseType !== 'buzzer';
  qcmAnswerBlock.hidden = responseType !== 'qcm';
  directAnswerBlock.hidden = responseType !== 'direct';

  if (responseType === 'qcm') {
    renderQcmBlock(game);
    return;
  }
  if (responseType === 'direct') {
    renderDirectBlock(game);
    return;
  }

  const isExcluded = round.excludedTeams.includes(myTeam);
  const isActive = round.activeTeam === myTeam;
  const someoneElseActive = round.activeTeam && round.activeTeam !== myTeam;
  const myQueueIndex = round.buzzes.findIndex((b) => b.team === myTeam);
  const alreadyInQueue = myQueueIndex !== -1;
  const cap = config.buzzMode === 'podium3' ? 3 : 1;
  const podiumFull = round.buzzes.length >= cap;

  if (pendingBuzzTeam === myTeam) {
    // Buzz retenu localement, pas encore parti (voir buzzButton "click" et
    // socket "connect" plus bas) : le serveur ne sait encore rien de ce buzz,
    // donc rien dans round ne le refleterait - etat dedie plutot que de
    // laisser croire que rien ne s'est passe.
    setButtonState('waiting', '📡 Pas de réseau, votre buzz sera envoyé dès la reconnexion...');
  } else if (!round.open) {
    setButtonState('waiting', "En attente que l'animateur lance le buzz...");
  } else if (isActive) {
    setButtonState('buzzed', 'Vous avez la parole !');
  } else if (isExcluded) {
    setButtonState('excluded', 'Vous ne pouvez plus buzzer sur cette question.');
  } else if (alreadyInQueue) {
    setButtonState('waiting', 'Vous avez buzzé, position ' + (myQueueIndex + 1) + '. Patientez...');
  } else if (podiumFull) {
    // Toutes les places du podium (ou l'unique buzzer en mode "single") sont
    // prises : verifie apres alreadyInQueue/isExcluded, pas avant, sinon ca
    // bloquerait aussi les equipes qui ont encore une place a prendre.
    setButtonState('waiting', cap > 1 ? 'Podium complet pour cette question.' : 'Une autre équipe a déjà buzzé.');
  } else if (someoneElseActive) {
    // Il reste de la place dans le podium : on peut buzzer pour prendre
    // position meme pendant qu'une autre equipe repond deja.
    setButtonState('ready', "L'équipe " + round.activeTeam + ' répond, mais vous pouvez encore buzzer !');
  } else {
    setButtonState('ready', '');
  }
}

// Vote facultatif de l'epreuve suivante (state.vote). Un vote par equipe, modifiable
// tant que le vote est ouvert. Les boutons ne sont reconstruits que quand le vote
// change (render() tourne chaque seconde : ne pas perdre un appui en cours).
function renderVoteBlock() {
  const vote = latestState.vote;
  if (!vote) {
    voteBlock.hidden = true;
    lastVoteKey = null;
    return false;
  }
  const epreuves = (latestState.game && latestState.game.epreuves) || [];
  const nameOf = (id) => (epreuves.find((e) => e.id === id) || { name: '?' }).name;
  const open = vote.status === 'open';
  const key = vote.startedAt + ':' + vote.options.join(',');
  if (key !== lastVoteKey) {
    if (lastVoteKey === null && navigator.vibrate) navigator.vibrate(200); // nouveau vote : petit signal
    lastVoteKey = key;
    voteOptionsList.innerHTML = '';
    vote.options.forEach((id) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'voteOptionButton';
      btn.dataset.id = String(id);
      btn.textContent = nameOf(id);
      btn.addEventListener('click', () => {
        const current = latestState.vote;
        if (!current || current.status !== 'open') return;
        socket.emit('cast-vote', { team: myTeam, epreuveId: id }, (res) => {
          if (res && res.ok) {
            myVoteChoice = { startedAt: current.startedAt, id };
            render();
          }
        });
      });
      voteOptionsList.appendChild(btn);
    });
  }
  const serverChoice = vote.votes && vote.votes[myTeam] !== undefined ? vote.votes[myTeam] : null;
  const localChoice = myVoteChoice && myVoteChoice.startedAt === vote.startedAt ? myVoteChoice.id : null;
  const choice = serverChoice !== null ? serverChoice : localChoice;
  const iVoted = vote.votedTeams.includes(myTeam);
  Array.from(voteOptionsList.children).forEach((btn) => {
    const id = vote.options.find((o) => String(o) === btn.dataset.id);
    btn.disabled = !open;
    btn.classList.toggle('selected', open && choice === id);
    btn.classList.toggle('winner', !open && vote.winnerId === id);
    btn.classList.toggle('loser', !open && vote.winnerId !== id);
  });
  voteBlock.hidden = false;
  voteLead.textContent = open ? 'Votez pour la prochaine épreuve !' : 'Prochaine épreuve :';
  if (open && vote.endsAt) {
    voteTimer.textContent = Math.max(0, Math.ceil((vote.endsAt - Date.now()) / 1000)) + ' s';
  } else {
    voteTimer.textContent = '';
  }
  if (open) {
    voteStatus.textContent = (iVoted ? 'Vote enregistré ✔ Vous pouvez encore le changer. ' : 'Touchez une épreuve pour voter. ') +
      '(' + vote.votedTeams.length + '/' + vote.totalTeams + ' équipes ont voté)';
  } else {
    voteStatus.textContent = vote.noVotes ? "Personne n'a voté : tirée au sort !" : (vote.drawn ? 'Égalité : tirée au sort !' : 'Le vote est terminé.');
  }
  return true;
}

function renderQcmBlock(game){
  const question = game.current.question;
  const questionKey = game.current.epreuveIndex + '-' + game.current.questionIndex;
  qcmQuestionText.textContent = question.text || '';

  const myAnswer = game.answers[myTeam];
  const myValidation = game.validations[myTeam];

  if (lastRenderedQuestionKey !== questionKey) {
    qcmOptionsList.innerHTML = '';
    (question.qcm_options || []).forEach((optionText, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'qcmOptionButton';
      btn.textContent = optionText;
      btn.addEventListener('click', () => {
        if (latestState.game.answers[myTeam]) return;
        socket.emit('submit-answer', { team: myTeam, value: index });
      });
      qcmOptionsList.appendChild(btn);
    });
    lastRenderedQuestionKey = questionKey;
  }

  Array.from(qcmOptionsList.children).forEach((btn, index) => {
    btn.disabled = !!myAnswer;
    btn.classList.toggle('selected', !!myAnswer && myAnswer.value === index && !myValidation);
    btn.classList.toggle('correctAnswer', !!myAnswer && myAnswer.value === index && !!myValidation && myValidation.status === 'correct');
    btn.classList.toggle('wrongAnswer', !!myAnswer && myAnswer.value === index && !!myValidation && myValidation.status === 'wrong');
  });

  if (!myAnswer) {
    qcmStatus.textContent = '';
  } else if (!myValidation) {
    qcmStatus.textContent = 'Réponse envoyée, en attente de validation...';
  } else if (myValidation.status === 'correct') {
    qcmStatus.textContent = 'Bonne réponse ! +' + myValidation.points + ' points';
  } else {
    qcmStatus.textContent = 'Mauvaise réponse.';
  }
}

function renderDirectBlock(game){
  const question = game.current.question;
  const questionKey = game.current.epreuveIndex + '-' + game.current.questionIndex;
  directQuestionText.textContent = question.text || '';

  const myAnswer = game.answers[myTeam];
  const myValidation = game.validations[myTeam];

  if (lastRenderedQuestionKey !== questionKey) {
    directAnswerInput.value = '';
    lastRenderedQuestionKey = questionKey;
  }

  directAnswerInput.disabled = !!myAnswer;
  submitDirectAnswerButton.disabled = !!myAnswer;

  if (!myAnswer) {
    directStatus.textContent = '';
  } else if (!myValidation) {
    directStatus.textContent = 'Réponse envoyée : "' + myAnswer.value + '", en attente de validation...';
  } else if (myValidation.status === 'correct') {
    directStatus.textContent = 'Bonne réponse ! +' + myValidation.points + ' points';
  } else {
    directStatus.textContent = 'Mauvaise réponse. Vous aviez répondu : "' + myAnswer.value + '"';
  }
}

submitDirectAnswerButton.addEventListener('click', () => {
  if (latestState.game.answers[myTeam]) return;
  const value = directAnswerInput.value.trim();
  if (!value) return;
  socket.emit('submit-answer', { team: myTeam, value });
});

function setButtonState(state, statusText) {
  buzzButton.disabled = state !== 'ready';
  buzzButton.className = 'buzzButton ' + state;
  buzzStatus.textContent = statusText;
}

// Recalcule l'affichage chaque seconde pour faire defiler le compte a rebours du cooldown.
setInterval(render, 1000);

render();

// ---- Plein ecran automatique (smartphone/tablette) ----
// Les navigateurs n'autorisent le plein ecran que sur un geste de l'utilisateur :
// des que la partie a demarre (un scenario est lance), le PREMIER appui ensuite
// (equipe, buzz, vote...) l'active. Preference memorisee (desactivable dans les
// reglages, par defaut activee) ; une seule tentative par chargement de page,
// pour ne pas reimposer le plein ecran a quelqu'un qui vient d'en sortir.
// iPhone (Safari) n'expose pas cette API : le reglage l'indique.
const FS_PREF_KEY = 'autoFullscreen';
const settingsButton = document.getElementById('settingsButton');
const settingsOverlay = document.getElementById('settingsOverlay');
const autoFullscreenInput = document.getElementById('autoFullscreenInput');
const autoFullscreenHint = document.getElementById('autoFullscreenHint');
const fsToast = document.getElementById('fsToast');
let fsAttempted = false;
let fsToastTimer = null;

function fsSupported() {
  const el = document.documentElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}
function fsActive() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}
function isTouchDevice() {
  return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}
function fsPreferred() {
  try { return localStorage.getItem(FS_PREF_KEY) !== '0'; } catch (e) { return true; }
}
function enterFullscreen() {
  const el = document.documentElement;
  const request = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!request) return Promise.resolve(false);
  try {
    return Promise.resolve(request.call(el)).then(() => true, () => false);
  } catch (e) {
    return Promise.resolve(false);
  }
}
function exitFullscreen() {
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  if (exit && fsActive()) { try { Promise.resolve(exit.call(document)).catch(() => {}); } catch (e) { /* ignore */ } }
}
function showFsToast() {
  fsToast.hidden = false;
  clearTimeout(fsToastTimer);
  fsToastTimer = setTimeout(() => { fsToast.hidden = true; }, 7000);
}

document.addEventListener('click', () => {
  if (fsAttempted || !fsPreferred() || !fsSupported() || !isTouchDevice() || fsActive()) return;
  if (!(latestState.game && latestState.game.hasScenario)) return; // la partie n'a pas encore demarre
  fsAttempted = true;
  enterFullscreen().then((ok) => { if (ok) showFsToast(); });
}, true);

settingsButton.addEventListener('click', () => {
  autoFullscreenInput.checked = fsPreferred();
  const supported = fsSupported();
  autoFullscreenInput.disabled = !supported;
  autoFullscreenHint.textContent = supported
    ? 'Activé dès que la partie démarre.'
    : "Indisponible sur cet appareil (sur iPhone, ajoutez la page à l'écran d'accueil).";
  settingsOverlay.hidden = false;
});
document.getElementById('closeSettingsButton').addEventListener('click', () => { settingsOverlay.hidden = true; });
autoFullscreenInput.addEventListener('change', () => {
  try { localStorage.setItem(FS_PREF_KEY, autoFullscreenInput.checked ? '1' : '0'); } catch (e) { /* ignore */ }
  if (autoFullscreenInput.checked) {
    // Le clic sur la case est un geste valide : on active tout de suite si la partie est lancee.
    if (latestState.game && latestState.game.hasScenario && !fsActive()) { fsAttempted = true; enterFullscreen(); }
    else fsAttempted = false;
  } else {
    exitFullscreen();
  }
});
