// Meme liste que server/public/buzz.js (cote joueur) : le son est attache a
// l'equipe, choisi a sa creation (par le joueur ou par defaut ici), et
// modifiable ensuite depuis ce panneau de gestion.
const TEAM_SOUNDS = {
  cloche: '🔔 Cloche', corne: '📯 Corne', arcade: '🎮 Arcade', alarme: '🚨 Alarme',
  laser: '🔫 Laser', gong: '🥁 Gong', trompette: '🎺 Trompette', tada: '🎉 Tada',
  robot: '🤖 Robot', ding: '✨ Ding'
};

function getTeamSound(name){
  return localStorage.getItem('sound_'+name) || 'cloche';
}

// Meme moteur de synthese que server/public/buzz.js (cote joueur), duplique
// ici pour permettre au gestionnaire de tester un son au volume actuel sans
// avoir besoin d'un telephone (bouton "Tester" pres du reglage de volume).
let controlAudioCtx = null;
function controlPlayOscillator(frequency, freqTo, startOffsetMs, durationMs, type, peakGain){
  try {
    if(!controlAudioCtx) controlAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    var startTime = controlAudioCtx.currentTime + startOffsetMs / 1000;
    var endTime = startTime + durationMs / 1000;
    var attackTime = Math.min(0.015, durationMs / 2000);
    var oscillator = controlAudioCtx.createOscillator();
    var gain = controlAudioCtx.createGain();
    oscillator.type = type || 'square';
    oscillator.frequency.setValueAtTime(frequency, startTime);
    if(freqTo) oscillator.frequency.exponentialRampToValueAtTime(freqTo, endTime);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peakGain), startTime + attackTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, endTime);
    oscillator.connect(gain);
    gain.connect(controlAudioCtx.destination);
    oscillator.start(startTime);
    oscillator.stop(endTime);
  } catch(e) { /* Web Audio indisponible : on ignore silencieusement. */ }
}
function controlPlayNote(note, startOffsetMs, volume, defaultType){
  var peak = typeof volume === 'number' ? volume : 1;
  var type = note.type || defaultType;
  controlPlayOscillator(note.freq, note.to || null, startOffsetMs, note.dur, type, peak * 0.85);
  (note.layers || []).forEach(function(layer){
    controlPlayOscillator(note.freq * layer.ratio, note.to ? note.to * layer.ratio : null, startOffsetMs, note.dur, layer.type || type, peak * layer.gain);
  });
}
var CONTROL_BUZZ_SOUNDS = {
  cloche: { type: 'sine', notes: [
    { freq: 1046, dur: 180, layers: [{ ratio: 2, gain: 0.35 }] },
    { freq: 784, dur: 380, layers: [{ ratio: 2, gain: 0.3 }] }
  ] },
  corne: { type: 'sawtooth', notes: [
    { freq: 196, dur: 550, layers: [{ ratio: 1.5, gain: 0.6 }, { ratio: 2, gain: 0.4 }] }
  ] },
  arcade: { type: 'square', notes: [
    { freq: 523, dur: 80, layers: [{ ratio: 2, gain: 0.4 }] },
    { freq: 659, dur: 80, layers: [{ ratio: 2, gain: 0.4 }] },
    { freq: 784, dur: 80, layers: [{ ratio: 2, gain: 0.4 }] },
    { freq: 1047, dur: 240, layers: [{ ratio: 2, gain: 0.5 }] }
  ] },
  alarme: { type: 'sawtooth', notes: [
    { freq: 500, to: 950, dur: 220, layers: [{ ratio: 2, gain: 0.35 }] },
    { freq: 950, to: 500, dur: 220, layers: [{ ratio: 2, gain: 0.35 }] },
    { freq: 500, to: 950, dur: 220, layers: [{ ratio: 2, gain: 0.35 }] }
  ] },
  laser: { type: 'sawtooth', notes: [
    { freq: 2200, to: 180, dur: 260, layers: [{ ratio: 2, gain: 0.3 }] }
  ] },
  gong: { type: 'triangle', notes: [
    { freq: 130, dur: 650, layers: [{ ratio: 2, gain: 0.5 }, { ratio: 3, gain: 0.3 }] }
  ] },
  trompette: { type: 'sawtooth', notes: [
    { freq: 392, dur: 140, layers: [{ ratio: 1.5, gain: 0.55 }] },
    { freq: 494, dur: 140, layers: [{ ratio: 1.5, gain: 0.55 }] },
    { freq: 587, dur: 340, layers: [{ ratio: 1.5, gain: 0.6 }, { ratio: 2, gain: 0.35 }] }
  ] },
  tada: { type: 'square', notes: [
    { freq: 523, dur: 90, layers: [{ ratio: 1.5, gain: 0.4 }] },
    { freq: 659, dur: 90, layers: [{ ratio: 1.5, gain: 0.4 }] },
    { freq: 784, dur: 90, layers: [{ ratio: 1.5, gain: 0.4 }] },
    { freq: 1047, dur: 320, layers: [{ ratio: 1.5, gain: 0.5 }, { ratio: 2, gain: 0.4 }] }
  ] },
  robot: { type: 'square', notes: [
    { freq: 300, dur: 90, layers: [{ ratio: 1.015, gain: 0.7 }] },
    { freq: 240, dur: 90, layers: [{ ratio: 1.015, gain: 0.7 }] },
    { freq: 180, dur: 90, layers: [{ ratio: 1.015, gain: 0.7 }] },
    { freq: 130, dur: 220, layers: [{ ratio: 1.015, gain: 0.7 }] }
  ] },
  ding: { type: 'triangle', notes: [
    { freq: 1568, dur: 120, layers: [{ ratio: 1.5, gain: 0.4 }] },
    { freq: 2093, dur: 280, layers: [{ ratio: 1.5, gain: 0.4 }] }
  ] }
};
function controlPlayBuzzSound(soundKey, volume){
  var sound = CONTROL_BUZZ_SOUNDS[soundKey] || CONTROL_BUZZ_SOUNDS.cloche;
  var offset = 0;
  sound.notes.forEach(function(note){
    controlPlayNote(note, offset, volume, sound.type);
    offset += note.dur;
  });
}

// Notification non bloquante (remplace les alert() natifs, qui interrompent
// le flux de l'animateur en plein direct). type: 'info' (defaut), 'success', 'error'.
function showToast(message, type){
  var $toast = $('<div class="toastItem"></div>').text(message);
  if(type === 'error') $toast.addClass('toastError');
  if(type === 'success') $toast.addClass('toastSuccess');
  $('#toastContainer').append($toast);
  // requestAnimationFrame ne se declenche pas de facon fiable sur un onglet
  // en arriere-plan (throttle/suspendu par le navigateur) : le toast pouvait
  // ne jamais recevoir sa transition d'apparition. Forcer un reflow avant
  // d'ajouter la classe est la technique standard, independante du rendu.
  void $toast[0].offsetWidth;
  $toast.addClass('toastVisible');
  setTimeout(function(){
    $toast.removeClass('toastVisible');
    setTimeout(function(){ $toast.remove(); }, 250);
  }, 3500);
}

// Remplace les confirm() natifs (bloquants, hors charte visuelle) pour toute
// action destructive. .off('click') avant de rebrancher : sinon un appel
// precedent laisserait son ancien callback attache et onConfirm serait
// invoque plusieurs fois d'affilee au prochain confirmActionConfirmButton.
function confirmAction(message, onConfirm){
  $('#confirmActionMessage').text(message);
  $('#confirmActionConfirmButton').off('click').on('click', function(){
    $('#confirmActionModal').modal('hide');
    onConfirm();
  });
  $('#confirmActionModal').modal('show');
}

function setTeamSound(name, sound){
  localStorage.setItem('sound_'+name, sound);
}

function buildTeamRowHtml(rank, teamName, color, value){
  return '<div data-value='+value+' data-team="'+teamName+'" class="team" style="--c:'+color+'">'
    + '<i class="dot"></i>'
    + '<span class="teamNameCell">'+rank+'° '+teamName+'</span>'
    + '<span class="teamEditBtn" title="Modifier l\'équipe">✎</span>'
    + '<span class="pointBadge"><span class="badge text-bg-success">'+value+'</span></span>'
    + '</div>';
}

const appendButtonToAddTeam = document.getElementById("addTeam");
let actualValue
let actualTeam
let actualTeamId
let actualBadge
let numberOfTeam = 0;
let listOfPassedQuestions = []
let localStorageTeam = localStorage.getItem("sauvedListOfTeam");
if(localStorageTeam !== null){
  arrayLocalStorageTeam=localStorageTeam.split(',');
  arrayLocalStorageTeam.forEach(function(thisTeam, index) {
    var div = document.getElementById('listOfTeam');
    var teamName = thisTeam
    numberOfTeam = index+1;
    var actualValueFromStorage
    if(localStorage.getItem(teamName) !== null){ actualValueFromStorage=localStorage.getItem(teamName)}
    else{
      actualValueFromStorage=0
    }
    switch (index) {
    case 1:
      var color = "#EE5622";
      break;
    case 2:
      var color = "#549BA0";
      break;
    case 3:
      var color = "#F5AF00";
      break;
    case 4:
      var color = "#8F2D56";
      break;
    case 5:
      var color = "#537D3B";
      break;
    case 6:
      var color = "#927790";
      break;
    case 7:
      var color = "#9c7b54";
      break;
    case 0:
      var color = "#5991cf";
  }
  div.innerHTML += buildTeamRowHtml(numberOfTeam, teamName, color, actualValueFromStorage);
  });
};

if(localStorage.getItem("listOfPassedQuestions") !== null){
  listOfPassedQuestions=localStorage.getItem("listOfPassedQuestions").split(',');
  listOfPassedQuestions.forEach(function(thisQuestion, index) {
    console.log(thisQuestion)
    $("#"+thisQuestion).remove()
})
}

$( "#addTeam" ).on( "click", function(){
  if (numberOfTeam < 8){
    $('#addTeamModal').modal('show')
  }
});

const TEAM_COLORS = ["#5991cf","#EE5622","#549BA0","#F5AF00","#8F2D56","#537D3B","#927790","#9c7b54"];

function addTeamRowLocally(teamName, value, sound){
  numberOfTeam += 1;
  var div = document.getElementById('listOfTeam');
  var color = TEAM_COLORS[(numberOfTeam - 1) % TEAM_COLORS.length];
  div.innerHTML += buildTeamRowHtml(numberOfTeam, teamName, color, value || 0);
  setTeamSound(teamName, sound || 'cloche');
  if(value){ localStorage.setItem(teamName, value); }
}

$( "#addTeamButton" ).on( "click", function(){
  $('#addTeamModal').modal('hide')
  var teamName = $("#teamNameInput").val();
  addTeamRowLocally(teamName, 0, 'cloche');
  $("#teamNameInput").val('');
  persistTeamListToLocalStorage();
  syncTeamsToServer();
});

$(document).on('click','.team',  function(e){
  actualTeam = $(this)
  actualTeamId = $(this).data('team')
  actualValue = $(this).data('value')
  e.preventDefault();
  $('#addPointModal').modal('show')
});

let teamBeingRenamed = null;

$(document).on('click', '.teamEditBtn', function(e){
  e.stopPropagation(); // ne pas aussi ouvrir le modal de points
  teamBeingRenamed = $(this).closest('.team');
  var currentName = teamBeingRenamed.data('team');
  $('#renameTeamInput').val(currentName);
  var $soundSelect = $('#renameTeamSoundSelect');
  $soundSelect.html('');
  Object.keys(TEAM_SOUNDS).forEach(function(key){
    $soundSelect.append('<option value="'+key+'">'+TEAM_SOUNDS[key]+'</option>');
  });
  $soundSelect.val(getTeamSound(currentName));
  $('#renameTeamModal').modal('show');
});

$( "#renameTeamButton" ).on( "click", function(){
  var newName = $('#renameTeamInput').val().trim();
  var newSound = $('#renameTeamSoundSelect').val();
  if(!newName || !teamBeingRenamed) return;
  var oldName = teamBeingRenamed.data('team');
  var nameTaken = newName !== oldName && $('.team').filter(function(){ return $(this).data('team') === newName; }).length > 0;
  if(nameTaken){ showToast("Une équipe porte déjà ce nom.", 'error'); return; }

  if(newName !== oldName){
    var value = teamBeingRenamed.data('value');
    localStorage.removeItem(oldName);
    localStorage.setItem(newName, value);
    localStorage.removeItem('sound_'+oldName);

    teamBeingRenamed.attr('data-team', newName);
    teamBeingRenamed.data('team', newName); // jQuery met .data() en cache separement de l'attribut HTML
    var currentText = teamBeingRenamed.find('.teamNameCell').text();
    var rank = currentText.split('°')[0];
    teamBeingRenamed.find('.teamNameCell').text(rank + '° ' + newName);

    if(actualTeamId === oldName){ actualTeamId = newName; }
  }
  setTeamSound(newName, newSound);

  persistTeamListToLocalStorage();
  syncTeamsToServer();
  $('#renameTeamModal').modal('hide');
  teamBeingRenamed = null;
});

$( "#deleteTeamButton" ).on( "click", function(){
  if(!teamBeingRenamed) return;
  var name = teamBeingRenamed.data('team');
  var $team = teamBeingRenamed;
  confirmAction('Supprimer l\'équipe "' + name + '" ?', function(){
    localStorage.removeItem(name);
    localStorage.removeItem('sound_' + name);
    $team.remove();
    persistTeamListToLocalStorage();
    syncTeamsToServer();
    $('#renameTeamModal').modal('hide');
    teamBeingRenamed = null;
  });
});

$(".addPointButton").on("click",function(){
  var pointToAdd =$(this).data('point')
  actualValue += pointToAdd
  actualTeam.data("value",actualValue)
  $('#addPointModal').modal('hide')
  actualTeam.find(".badge").html(actualValue)
  localStorage.setItem(actualTeamId, actualValue);
  syncTeamsToServer();
  setLastValidation({ type: 'points', team: actualTeamId, points: pointToAdd });
  if(awardingForBuzz){
    awardingForBuzz = false;
    if(buzzSocket) buzzSocket.emit('resolve-correct', { points: pointToAdd, team: actualTeamId });
  }
})

$(".manualPointButton").on("click",function(){
  $(".manualPointModal").append('<div class="modal-footer"><input type="text" class="form-control" id="manualPointInput"><button type="button" id="addManualPointButton" class="addManualPointButton btn btn-success">Ajouter</button></div>')
})


$(".questionLink").on("click",function(){
  $(this).remove()
  listOfPassedQuestions.push($(this).attr('id'))
  localStorage.setItem('listOfPassedQuestions', listOfPassedQuestions);

})

// Le classement s'affiche sur le grand ecran (projo), pas ici : ce bouton
// est un simple interrupteur (re-cliquer le masque).
$( "#palmaresButton" ).on( "click", function(){
  if(!buzzSocket) return;
  var alreadyShown = lastBuzzState && lastBuzzState.scoreboardVisible && lastBuzzState.scoreboardVisible.type === 'current';
  buzzSocket.emit(alreadyShown ? 'hide-scoreboard' : 'show-scoreboard', { type: 'current' });
})

// ---- Buzzer (telephones des joueurs) ----
const BUZZ_SERVER_URL = window.BUZZ_SERVER_URL || "https://buzz.quiz.ranchduphoenix.be";
const APP_MODE = window.APP_MODE || 'control'; // 'control' (ecran gestionnaire) ou 'display' (grand ecran/projo)
let buzzSocket = null;
let awardingForBuzz = false; // true quand le modal de points a ete ouvert depuis "Bonne reponse"
// Derniere action de validation (points attribues ou mauvaise reponse), pour
// le bouton "Annuler la derniere validation" (filet de securite en cas de
// clic sur la mauvaise equipe en plein direct). Usage unique : efface des
// qu'on s'en sert, ou des qu'une nouvelle question s'ouvre (voir handleBuzzState).
let lastValidation = null;
let lastValidationQuestionKey = null;
function setLastValidation(entry){
  lastValidation = entry;
  $('#undoLastValidationButton').prop('hidden', !entry);
}
let previousActiveTeam = null; // pour ne declencher le son/modal qu'a l'apparition d'un nouveau buzz
let buzzConfig = {
  buzzMode: localStorage.getItem('buzzMode') === 'podium3' ? 'podium3' : 'single',
  excludeWrongTeamAfterCooldown: localStorage.getItem('buzzExcludeWrongTeam') !== 'false',
  maxAnswerSeconds: parseInt(localStorage.getItem('buzzMaxAnswerSeconds'), 10) || 0,
  autoOpenOnSlideChange: localStorage.getItem('buzzAutoOpenOnSlideChange') !== 'false',
  buzzVolume: 1 // 0 a 1, ecrase par state.config des la premiere reponse du serveur (voir handleBuzzState)
};

function getCurrentTeamsWithScores(){
  return $('.team').map(function(){
    var name = $(this).data('team');
    return { name: name, value: $(this).data('value'), sound: getTeamSound(name) };
  }).get();
}

function persistTeamListToLocalStorage(){
  var names = getCurrentTeamsWithScores().map(function(t){ return t.name; });
  localStorage.setItem('sauvedListOfTeam', names);
}

function syncTeamsToServer(){
  if(buzzSocket && buzzSocket.connected){
    buzzSocket.emit('sync-teams', getCurrentTeamsWithScores());
  }
}

// ---- Mode d'ecran : un seul fichier, plusieurs usages ----
// 'control' (par defaut) : ecran gestionnaire complet (equipes, points, buzzer, navigation).
// 'display' (?mode=display) : grand ecran/projo, lecture audio/video reelle, sans les
// boutons d'administration, avec une banniere scores + statut du buzz pour le public.
function initAppMode(){
  document.body.classList.add('mode-' + APP_MODE);
  // Le display n'est qu'un ecran d'information : aucune action n'y est jamais
  // possible (pas de barre de lecture native), tout se pilote depuis le
  // gestionnaire (voir syncMediaPlayback plus bas pour la lecture audio/video).
  $('#questionAudio, #questionVideo').prop('controls', APP_MODE === 'control');
  if(APP_MODE === 'control' && window.matchMedia){
    // Les composants Bootstrap (modales, formulaires, tableaux) suivent le theme
    // clair/sombre du systeme comme le reste de l'interface gestionnaire.
    var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    var applyBsTheme = function(){ document.documentElement.setAttribute('data-bs-theme', darkQuery.matches ? 'dark' : 'light'); };
    applyBsTheme();
    if(darkQuery.addEventListener) darkQuery.addEventListener('change', applyBsTheme);
  }
  if(APP_MODE === 'display'){
    $('.teamCollect').hide();
    $('.displayCollect').hide();
    $('.buzzerCollect').hide();
    $('#scenarioBar').hide();
    $('#questionNavButtons').hide();
    $('#slidePanel').removeClass('col-5').addClass('col-12');
    $('#displayBanner').prop('hidden', false);
    // Les navigateurs bloquent la lecture automatique avec du son tant que
    // cette page n'a pas eu au moins un clic de l'utilisateur : sans ca,
    // syncMediaPlayback() echoue silencieusement a chaque nouvelle question.
    $('#displayAudioUnlockOverlay').prop('hidden', false);
  }
}
initAppMode();

// Le gestionnaire ne coupe son propre son que si un ecran d'affichage separe
// est effectivement connecte (sinon on est en usage "un seul ecran" et le
// gestionnaire doit garder le son). Reactif : se remet a jour tout seul si
// l'ecran d'affichage se ferme/s'ouvre en cours de partie.
let lastKnownDisplayConnected = null;
function applyMediaOwnership(state){
  if(APP_MODE !== 'control') return;
  var displayConnected = !!state.displayConnected;
  if(displayConnected === lastKnownDisplayConnected) return;
  lastKnownDisplayConnected = displayConnected;
  $('video, audio').prop('muted', displayConnected);
}

// Cet ecran est-il celui qui doit reellement jouer le son (et donc etre mis
// en pause quand une equipe buzze) ? Oui si c'est l'affichage, ou si c'est le
// gestionnaire utilise seul (aucun ecran d'affichage connecte).
function isPrimaryMediaScreen(state){
  if(APP_MODE === 'display') return true;
  return APP_MODE === 'control' && !state.displayConnected;
}

var lastDisplayedTeamScores = {};
function renderDisplayBanner(state){
  if(APP_MODE !== 'display') return;
  var $scores = $('#displayTeamScores');
  $scores.html('');
  state.teams.forEach(function(name){
    var score = (state.teamScores && state.teamScores[name]) || 0;
    // Meme reconstruction complete de la liste a chaque appel (250ms) : ne
    // rejouer l'animation que si le score de CETTE equipe vient de changer,
    // sinon ca clignoterait en permanence pour rien.
    var justChanged = lastDisplayedTeamScores[name] !== undefined && lastDisplayedTeamScores[name] !== score;
    lastDisplayedTeamScores[name] = score;
    $scores.append('<span class="displayTeamChip' + (justChanged ? ' scoreBump' : '') + '">'+name+' : '+score+'</span>');
  });
  // Le compte a rebours du temps de reponse (quand une equipe a la parole) est
  // integre directement dans cette notification plutot que dans un cercle a
  // part, pour que ce soit sans ambiguite "le temps qu'il reste a CETTE equipe".
  var $status = $('#displayBuzzStatus');
  if(state.round.activeTeam){
    var statusText = state.round.activeTeam + ' a la parole !';
    if(state.round.answerDeadlineAt){
      var answerSecondsLeft = Math.max(0, Math.ceil((state.round.answerDeadlineAt - Date.now())/1000));
      statusText += ' (' + answerSecondsLeft + 's)';
    }
    $status.text(statusText).show();
  } else {
    $status.hide();
  }
  renderDisplayCountdown(state);
}

// Compte a rebours visuel : temps imparti pour buzzer sur cette epreuve
// (round.reflectionEndsAt, actif seulement si l'epreuve a un timer configure).
// Le temps de reponse d'une equipe active est lui integre a la notification
// "X a la parole" (voir renderDisplayBanner) plutot qu'ici.
// Rafraichi chaque seconde independamment des broadcasts serveur (voir le
// setInterval plus bas) pour un decompte fluide.
function renderDisplayCountdown(state){
  if(APP_MODE !== 'display') return;
  var $countdown = $('#displayCountdown');
  var $barWrap = $('#displayTopTimerBar');
  var $barFill = $('#displayTopTimerBarFill');
  var totalSeconds = (state.game && state.game.current && state.game.current.timerSeconds) || 0;
  function updateBar(secondsLeft){
    if(!totalSeconds){ $barWrap.prop('hidden', true); return; }
    var pct = Math.max(0, Math.min(100, (secondsLeft / totalSeconds) * 100));
    $barFill.css('width', pct + '%').toggleClass('timerBarUrgent', secondsLeft <= 3);
    $barWrap.prop('hidden', false);
  }
  if(state.round.activeTeam){
    $countdown.hide();
    $barWrap.prop('hidden', true);
  } else if(state.round.reflectionEndsAt){
    var secondsLeft = Math.max(0, Math.ceil((state.round.reflectionEndsAt - Date.now())/1000));
    $countdown.text(secondsLeft).toggleClass('urgent', secondsLeft <= 3).css('display', 'flex');
    updateBar(secondsLeft);
  } else if(state.round.reflectionRemainingMs != null){
    // En pause (une equipe repond) : on fige l'affichage sur le temps qu'il
    // restait plutot que de le faire disparaitre (il va reprendre, pas s'arreter).
    var frozenSecondsLeft = Math.ceil(state.round.reflectionRemainingMs/1000);
    $countdown.text(frozenSecondsLeft).toggleClass('urgent', frozenSecondsLeft <= 3).css('display', 'flex');
    updateBar(frozenSecondsLeft);
  } else {
    $countdown.hide();
    $barWrap.prop('hidden', true);
  }
}

// Bip synthetise (Web Audio API) : pas de fichier audio a heberger.
let hostAudioCtx = null;
function hostBeep(frequency, durationMs){
  try {
    if(!hostAudioCtx) hostAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    var oscillator = hostAudioCtx.createOscillator();
    var gain = hostAudioCtx.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.2, hostAudioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, hostAudioCtx.currentTime + durationMs/1000);
    oscillator.connect(gain);
    gain.connect(hostAudioCtx.destination);
    oscillator.start();
    oscillator.stop(hostAudioCtx.currentTime + durationMs/1000);
  } catch(e){ /* Web Audio indisponible : on ignore */ }
}

// Ligne de statut principale du buzz ("En attente d'un buzz...", "EquipeA
// repond...", etc.), reutilisee a la fois dans la colonne Buzzer (detail
// complet) et en gros dans l'encadre de la question (voir point 4 : visibilite
// pour l'animateur, qui suit surtout ce dernier pendant l'epreuve).
function buildBuzzStatusLine(state){
  if(state.round.activeTeam){
    var text = state.round.activeTeam + ' répond actuellement...';
    if(state.round.answerDeadlineAt){
      var answerSecondsLeft = Math.max(0, Math.ceil((state.round.answerDeadlineAt - Date.now())/1000));
      text += ' (' + answerSecondsLeft + 's)';
    }
    return text;
  } else if(!state.round.open){
    return 'Aucun buzz en cours. Cliquez sur "Lancer le buzz" pour ouvrir une manche.';
  }
  return 'En attente d\'un buzz...';
}

function renderQuestionBuzzStatus(state){
  var $panel = $('#questionBuzzStatus');
  if(!state.game || !state.game.current || state.game.current.responseType !== 'buzzer' || !state.game.epreuveStarted){
    $panel.prop('hidden', true);
    return;
  }
  var line = buildBuzzStatusLine(state);
  if(!state.round.activeTeam && state.round.reflectionEndsAt){
    var reflectionSecondsLeft = Math.max(0, Math.ceil((state.round.reflectionEndsAt - Date.now())/1000));
    line += ' (⏱ ' + reflectionSecondsLeft + 's avant verrouillage auto)';
  }
  $panel.text(line).prop('hidden', false);
}

// Information independante (jamais sur le display, uniquement pour
// l'animateur) : combien de buzzers restent verrouilles (equipes fautives
// exclues pour cette question) vs deverrouilles (peuvent encore buzzer).
// Volontairement separee de la notification "en attente / a la parole" ci-dessus.
function renderBuzzLockStatus(state){
  var $panel = $('#buzzLockStatus');
  if(!state.game || !state.game.current || state.game.current.responseType !== 'buzzer' || !state.game.epreuveStarted){
    $panel.prop('hidden', true);
    return;
  }
  var lockedCount = (state.round.excludedTeams || []).length;
  var unlockedCount = Math.max(0, state.teams.length - lockedCount);
  var html = '<div>🔒 ' + lockedCount + ' verrouillé' + (lockedCount !== 1 ? 's' : '') + '</div>'
    + '<div>🔓 ' + unlockedCount + ' déverrouillé' + (unlockedCount !== 1 ? 's' : '') + '</div>';
  if(state.round.excludedTeams && state.round.excludedTeams.length){
    html += '<div>(' + state.round.excludedTeams.join(', ') + ')</div>';
  }
  $panel.html(html).prop('hidden', false);
}

// File d'attente des buzz (ordre d'arrivee), affichee au niveau de la gestion
// de l'epreuve (a cote du statut general) et non plus dans la colonne Buzzer :
// c'est l'animateur qui suit la question qui a besoin de voir qui a buzze,
// pas la colonne de configuration/liens du buzzer. Volontairement une simple
// liste ordonnee (pas un podium 1er/2e/3e, qui n'a pas de sens ici : ce n'est
// pas un classement de score) et sans le temps de reponse (non pertinent pour
// l'animateur). Statut par equipe rendu explicite (icone + couleur) pour
// distinguer d'un coup d'oeil qui repond, qui attend son tour et qui a deja rate.
function renderBuzzResults(state){
  var $results = $('#buzzResults');
  // Jamais sur l'ecran d'affichage (projo) : cette file d'attente est un outil
  // de pilotage pour l'animateur, le public n'a pas a la voir. Idem pour
  // #activeTeamPanel, deja gate sur APP_MODE === 'control' plus bas.
  var queueLive = APP_MODE === 'control' && state.game && state.game.current && state.game.current.responseType === 'buzzer' && state.game.epreuveStarted;
  $('#queueEmpty').prop('hidden', !queueLive || state.round.buzzes.length > 0);
  if(APP_MODE !== 'control' || !state.game || !state.game.current || state.game.current.responseType !== 'buzzer' || !state.game.epreuveStarted || !state.round.buzzes.length){
    $results.html('').prop('hidden', true);
    return;
  }
  var $list = $('<div class="buzzQueueList"></div>');
  state.round.buzzes.forEach(function(b, index){
    var isSpeaking = index === state.round.activeIndex;
    var isWrong = state.round.excludedTeams.includes(b.team);
    var statusText = isSpeaking ? '🎤 À la parole' : (isWrong ? '❌ Mauvaise réponse' : '⏳ En attente');
    var $row = $('<div class="buzzQueueRow" data-team="'+b.team+'"></div>');
    if(isSpeaking) $row.addClass('isSpeaking');
    if(isWrong) $row.addClass('isWrong');
    $row.html(
      '<span class="buzzQueueRank">'+(index+1)+'</span>'+
      '<span class="buzzQueueName">'+b.team+'</span>'+
      '<span class="buzzQueueStatus">'+statusText+'</span>'
    );
    $list.append($row);
  });
  $results.html('').append($list).prop('hidden', false);
}

// A partir de 3 equipes/entrees, met en avant un podium (1re-2e-3e) avant de
// lister le reste normalement en dessous ; sinon liste plate classique.
function renderRankedList($list, rows){
  $list.html('');
  if(rows.length >= 3){
    var podium = rows.slice(0, 3);
    var rest = rows.slice(3);
    var $podiumRow = $('<div class="podiumRow"></div>');
    podium.forEach(function(row, i){
      var $block = $('<div class="podiumBlock podium-'+(i+1)+' podiumReveal"></div>');
      // Suspense : reveler la 3e place en premier, puis la 2e, puis la 1re
      // (ordre inverse du classement) plutot que tout d'un coup.
      $block.css('animation-delay', (2 - i) * 0.35 + 's');
      $block.html(
        '<div class="podiumRank">'+(i+1)+'</div>'+
        '<div class="podiumName">'+row.name+'</div>'+
        '<div class="podiumScore">'+row.score+' pts</div>'
      );
      $podiumRow.append($block);
    });
    $list.append($podiumRow);
    rest.forEach(function(row, i){
      $list.append('<div class="displayScoreboardRow">'+(i+4)+'. '+row.name+' <span>'+row.score+' pts'+(row.extra ? ' ('+row.extra+')' : '')+'</span></div>');
    });
  } else {
    rows.forEach(function(row, i){
      $list.append('<div class="displayScoreboardRow">'+(i+1)+'. '+row.name+' <span>'+row.score+' pts'+(row.extra ? ' ('+row.extra+')' : '')+'</span></div>');
    });
  }
}

function renderDisplayScoreboard(state){
  if(APP_MODE !== 'display') return;
  var visible = state.scoreboardVisible;
  if(!visible){
    $('#displayScoreboardOverlay').removeClass('visible');
    return;
  }
  var rows;
  if(visible.type === 'current'){
    $('#displayScoreboardTitle').text('Classement de la partie');
    rows = state.teams.map(function(name){
      return { name: name, score: (state.teamScores && state.teamScores[name]) || 0 };
    });
    rows.sort(function(a,b){ return b.score - a.score; });
  } else if(visible.type === 'closing'){
    // Classement final fige au moment de la cloture (les equipes sont deja
    // videes cote serveur), voir close-game.
    $('#displayScoreboardTitle').text(visible.title || 'Le jeu est terminé');
    rows = (visible.rows || []).map(function(row){ return { name: row.team_name, score: row.score }; });
  } else {
    $('#displayScoreboardTitle').text('Top 10 - toutes parties confondues');
    rows = (visible.rows || []).map(function(row){ return { name: row.team_name, score: row.score, extra: row.game_date }; });
  }
  renderRankedList($('#displayScoreboardList'), rows);
  // Petites stats en plus du classement pur, uniquement au recap final.
  var $stats = $('#displayScoreboardStats');
  if(visible.type === 'closing' && visible.statLines && visible.statLines.length){
    $stats.html(visible.statLines.map(function(line){ return '<div>' + line + '</div>'; }).join('')).prop('hidden', false);
  } else {
    $stats.prop('hidden', true);
  }
  $('#displayScoreboardOverlay').addClass('visible');
}

let displayQrRendered = false;
let displayIdleQrRendered = false;
function renderDisplayQr(state){
  if(APP_MODE !== 'display') return;
  if(state.qrVisible){
    if(!displayQrRendered){
      $('#displayQrCode').html('');
      new QRCode(document.getElementById('displayQrCode'), { text: BUZZ_SERVER_URL, width: 320, height: 320 });
      displayQrRendered = true;
    }
    $('#displayQrOverlay').addClass('visible');
  } else {
    $('#displayQrOverlay').removeClass('visible');
  }
}

// Une equipe creee depuis un telephone joueur doit apparaitre ici comme si
// l'animateur l'avait ajoutee lui-meme (nom + score + son editables ensuite).
// Reconcilie l'etat local (DOM + localStorage) avec le serveur : ajoute les
// equipes creees depuis un telephone, et applique les scores modifies cote
// serveur (validation d'une reponse qcm/direct) pour que ce gestionnaire ne
// les ecrase pas au prochain sync-teams avec une valeur locale perimee.
function reconcilePlayerCreatedTeams(state){
  if(APP_MODE !== 'control') return;
  // Le serveur a vide les equipes (ex. "Cloturer la partie") : la liste locale
  // doit suivre plutot que de laisser trainer des lignes d'une partie terminee.
  if(state.teams.length === 0 && $('.team').length > 0){
    $('.team').each(function(){
      var name = $(this).data('team');
      localStorage.removeItem(name);
      localStorage.removeItem('sound_' + name);
    });
    $('#listOfTeam').html('');
    numberOfTeam = 0;
    localStorage.removeItem('sauvedListOfTeam');
    return;
  }
  var existingNames = getCurrentTeamsWithScores().map(function(t){ return t.name; });
  state.teams.forEach(function(name){
    if(existingNames.indexOf(name) === -1){
      addTeamRowLocally(name, (state.teamScores && state.teamScores[name]) || 0, (state.teamSounds && state.teamSounds[name]) || 'cloche');
    }
  });
  $('.team').each(function(){
    var $row = $(this);
    var name = $row.data('team');
    var serverValue = state.teamScores && state.teamScores[name];
    if(typeof serverValue === 'number' && serverValue !== $row.data('value')){
      $row.data('value', serverValue);
      var $badge = $row.find('.badge').text(serverValue);
      // Petit coup d'oeil visuel quand un score change, plutot qu'un chiffre
      // qui change silencieusement (facile a manquer en plein direct).
      $badge.removeClass('scoreBump');
      void $badge[0].offsetWidth; // force le reflow pour rejouer l'animation meme si elle vient d'etre appliquee
      $badge.addClass('scoreBump');
      localStorage.setItem(name, serverValue);
      if(actualTeamId === name){ actualValue = serverValue; }
    }
  });
}

// Pilotage unique de la lecture audio/video : la seule source de verite est
// state.game.mediaPlaying (modifiee UNIQUEMENT depuis le gestionnaire, jamais
// depuis le display qui n'a aucun controle), combinee a une pause automatique
// tant qu'une equipe repond (state.round.activeTeam), et de la position
// (state.game.mediaSeekSeconds/mediaSeekToken) quand le gestionnaire deplace
// la barre de lecture.
//
// Seul l'ecran qui joue reellement le son (voir isPrimaryMediaScreen) est
// PILOTE programmatiquement (play/pause/positionnement). Sur l'autre ecran
// (typiquement le gestionnaire quand le display est connecte), on se contente
// de couper le son (.muted) : essayer EN PLUS d'y reproduire l'etat de lecture
// (pour que son propre lecteur "suive" visuellement) provoquait des
// evenements play/pause fantomes en cascade avec les ecouteurs ci-dessous
// (observe en test), qui coupaient le vrai son diffuse sans aucune action de
// l'animateur. Consequence acceptee : le lecteur du gestionnaire ne suit pas
// forcement la position reelle quand il n'est pas primaire, mais CHAQUE
// interaction manuelle qu'il y fait (jouer/pause/deplacer la barre) continue
// de piloter reellement ce qui est diffuse (c'est le point demande).
let mediaSuppressCount = 0; // supprime le renvoi d'un ordre recu du serveur qu'on vient d'appliquer nous-memes (evite un echo/boucle infinie)
function suppressMediaEventsBriefly(){
  mediaSuppressCount++;
  setTimeout(function(){
    mediaSuppressCount = Math.max(0, mediaSuppressCount - 1);
    // Un eventuel evenement fantome absorbe pendant la fenetre peut laisser
    // l'element dans un etat local qui ne correspond plus a l'intention reelle :
    // une fois la fenetre fermee, on revalide.
    if(mediaSuppressCount === 0 && lastBuzzState) syncMediaPlayback(lastBuzzState);
  }, 400);
}
// Distinct de mediaSuppressCount : quand l'ecran est primaire (donc pilote
// programmatiquement), un VRAI glisser de la barre de lecture par l'animateur
// peut lui aussi declencher un play/pause fantome en cours de route (meme
// constat que pour .muted) - on ignore ce bruit sans empecher la remontee du
// 'seeked' final, qui est le signal utile de ce geste (voir listeners plus bas).
let mediaSeekGestureSuppressCount = 0;
function suppressSeekGestureNoiseBriefly(){
  mediaSeekGestureSuppressCount++;
  setTimeout(function(){ mediaSeekGestureSuppressCount = Math.max(0, mediaSeekGestureSuppressCount - 1); }, 400);
}
let lastAppliedMediaSeekToken = null;
function syncMediaPlayback(state){
  var game = state.game;
  if(!game || !game.current || !game.epreuveStarted) return;
  var audible = isPrimaryMediaScreen(state);
  [document.getElementById('questionAudio'), document.getElementById('questionVideo')].forEach(function(el){
    if(!el || !el.src) return;
    el.muted = !audible;
  });
  // Meme quand cet ecran n'est pas celui qui joue le son (un display est connecte), on garde le
  // lecteur du gestionnaire en lecture COUPEE et synchronisee avec l'etat serveur : sa barre de
  // progression avance, et ses boutons pause / deplacement pilotent le display. Sans cela il restait
  // a l'arret et l'animateur ne pouvait ni mettre en pause ni deplacer la piste depuis le gestionnaire.
  var shouldPlay = !!game.mediaPlaying && !state.round.activeTeam;
  var isNewSeek = lastAppliedMediaSeekToken !== null && game.mediaSeekToken !== lastAppliedMediaSeekToken;
  lastAppliedMediaSeekToken = game.mediaSeekToken;
  [document.getElementById('questionAudio'), document.getElementById('questionVideo')].forEach(function(el){
    if(!el || !el.src) return;
    if(isNewSeek){ suppressMediaEventsBriefly(); el.currentTime = game.mediaSeekSeconds; }
    if(shouldPlay && el.paused){ suppressMediaEventsBriefly(); el.play().catch(function(){}); }
    else if(!shouldPlay && !el.paused){ suppressMediaEventsBriefly(); el.pause(); }
  });
}

// Le premier clic sur cet overlay fournit le "geste utilisateur" qu'exigent
// les navigateurs avant d'autoriser une lecture automatique avec du son ;
// sans lui, tous les appels a .play() de syncMediaPlayback echouent en silence.
// Plein ecran du projecteur (display uniquement) : le clic de l'overlay de deverrouillage du son
// l'active aussi ; ensuite touche F ou double-clic pour basculer (Echap pour sortir).
function displayToggleFullscreen(){
  if(!fsSupported()) return;
  if(fsActive()){
    var exit = document.exitFullscreen || document.webkitExitFullscreen;
    if(exit){ try { Promise.resolve(exit.call(document)).catch(function(){}); } catch(e){} }
  } else {
    fsEnter();
  }
}
if(APP_MODE === 'display'){
  $(document).on('keydown', function(e){
    if((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) displayToggleFullscreen();
  });
  $(document).on('dblclick', displayToggleFullscreen);
}

$( "#displayAudioUnlockOverlay" ).on( "click", function(){
  $(this).prop('hidden', true);
  if(APP_MODE === 'display' && !fsActive()) fsEnter();
  if(lastBuzzState) syncMediaPlayback(lastBuzzState);
});

// L'ecran qui joue le son signale au serveur que la piste joue REELLEMENT : le decompte pour buzzer
// (voir awaitingMediaStart cote serveur) demarre alors, aligne sur la musique et non sur l'ouverture
// de la question.
$('#questionAudio, #questionVideo').on('playing', function(){
  if(!buzzSocket || !lastBuzzState || !lastBuzzState.round || !lastBuzzState.round.awaitingMediaStart) return;
  if(!isPrimaryMediaScreen(lastBuzzState)) return;
  buzzSocket.emit('media-started');
});

// Cote gestionnaire uniquement : les controles natifs restent la facon de
// demarrer/mettre en pause la piste ET de se positionner dedans (barre de
// lecture), mais l'action doit se propager a tous les ecrans (notamment le
// display, qui n'a pas de controle propre) via le serveur.
if(APP_MODE === 'control'){
  $('#questionAudio, #questionVideo')
  // Deplacer la barre de lecture (glisser-deposer natif) peut lui aussi
  // provoquer un play/pause fantome en cours de route (meme constat que pour
  // le changement de .muted) : 'seeking' se declenche des le debut du
  // deplacement, qu'il soit fait par l'animateur ou programmatique - on
  // ignore juste le bruit play/pause qui peut suivre, sans toucher au
  // 'seeked' final (voir mediaSeekGestureSuppressCount plus haut).
  .on('seeking', function(){
    suppressSeekGestureNoiseBriefly();
  }).on('play', function(){
    if(mediaSuppressCount > 0 || mediaSeekGestureSuppressCount > 0 || !buzzSocket) return;
    buzzSocket.emit('set-media-playing', true);
    // Constate en test : demarrer la lecture d'un element COUPE (cas normal du
    // lecteur du gestionnaire quand il n'est pas l'ecran primaire) declenche
    // presque instantanement un 'pause' fantome de la part du navigateur, sans
    // aucune action de l'animateur - on l'absorbe pour ne pas re-couper aussitot
    // la vraie diffusion (voir isPrimaryMediaScreen/syncMediaPlayback plus haut).
    suppressMediaEventsBriefly();
  }).on('pause', function(){
    if(mediaSuppressCount > 0 || mediaSeekGestureSuppressCount > 0 || !buzzSocket) return;
    buzzSocket.emit('set-media-playing', false);
  }).on('seeked', function(){
    if(mediaSuppressCount > 0 || !buzzSocket) return;
    buzzSocket.emit('set-media-position', this.currentTime);
  });
}

// Banniere de resultat (succes/erreur) sur le display apres validation d'un
// buzz : detectee via l'horodatage du dernier resultat (round.lastResult.ts)
// pour ne se declencher qu'une fois par annonce, meme si l'etat est rediffuse
// plusieurs fois pendant l'affichage (auto-masquee apres quelques secondes).
let lastShownResultTs = null;
let resultBannerTimer = null;
function renderDisplayResultBanner(state){
  if(APP_MODE !== 'display') return;
  var result = state.round.lastResult;
  if(!result || result.ts === lastShownResultTs) return;
  lastShownResultTs = result.ts;
  var $banner = $('#displayResultBanner');
  var text = result.timeout
    ? '⏰ Trop tard !'
    : (result.correct
      ? '✅ Bonne réponse ' + result.team + (typeof result.points === 'number' ? ' ! +' + result.points + ' points' : ' !')
      : '❌ Mauvaise réponse ' + result.team);
  $banner.text(text).removeClass('success error').addClass(result.correct ? 'success' : 'error').addClass('visible');
  if(resultBannerTimer) clearTimeout(resultBannerTimer);
  resultBannerTimer = setTimeout(function(){ $banner.removeClass('visible'); }, 2500);
}

// Message libre pousse par l'animateur (voir showDisplayMessageButton) : affiche
// en overlay plein ecran sur le display uniquement (le gestionnaire garde sa
// propre vue pour continuer a piloter le jeu pendant que le message est visible).
let lastShownDisplayMessage = undefined;
function renderDisplayMessage(state){
  if(APP_MODE !== 'display') return;
  var msg = state.displayMessage;
  var $overlay = $('#displayMessageOverlay');
  if(!msg){
    $overlay.removeClass('visible');
    $('#displayMessageVideo')[0].pause();
    lastShownDisplayMessage = null;
    return;
  }
  $('#displayMessageText').text(msg.text || '');
  var $img = $('#displayMessageImage');
  if(msg.imageUrl){ $img.attr('src', msg.imageUrl).prop('hidden', false); } else { $img.prop('hidden', true); }
  var $video = $('#displayMessageVideo');
  if(msg.videoUrl){
    if($video.attr('src') !== msg.videoUrl){ $video.attr('src', msg.videoUrl); }
    $video.prop('hidden', false);
    if(msg !== lastShownDisplayMessage) $video[0].play().catch(function(){});
  } else {
    $video.prop('hidden', true);
  }
  $overlay.addClass('visible');
  lastShownDisplayMessage = msg;
}

function renderDisplayMessageCountdown(state){
  if(APP_MODE !== 'display') return;
  var msg = state.displayMessage;
  var $countdown = $('#displayMessageCountdown');
  if(msg && msg.countdownEndsAt){
    var secondsLeft = Math.max(0, Math.ceil((msg.countdownEndsAt - Date.now())/1000));
    $countdown.text(secondsLeft).toggleClass('urgent', secondsLeft <= 3).css('display', 'flex');
  } else {
    $countdown.hide();
  }
}

let lastBuzzState = null;

// Indicateur rapide de connexion (display branche ? des telephones sont-ils
// bien connectes ?), visible en permanence pres de la liste des equipes -
// utile pour reperer un souci reseau avant que ca devienne visible du public.
// Checklist de pre-lancement : affichee tant qu'aucun scenario n'est charge,
// pour reperer un souci (display pas branche, personne connecte, son jamais
// teste) avant de cliquer "Lancer" plutot que de le decouvrir une fois les
// joueurs deja en train d'attendre.
let soundTestedThisSession = false;
function renderPreflightChecklist(state){
  if(APP_MODE !== 'control') return;
  var $list = $('#preflightChecklist');
  var items = [
    { ok: !!state.displayConnected, okLabel: '✅ Display connecté', warnLabel: '⚠️ Display non connecté' },
    { ok: state.teams.length > 0, okLabel: '✅ ' + state.teams.length + ' équipe(s) rejointe(s)', warnLabel: '⚠️ Aucune équipe n\'a encore rejoint' },
    { ok: soundTestedThisSession, okLabel: '✅ Son de buzz testé', warnLabel: '⚠️ Pensez à tester le son (Réglages du buzzer)' }
  ];
  $list.html(items.map(function(item){
    return '<li class="' + (item.ok ? 'preflightOk' : 'preflightWarn') + '"><span class="preflightIcon"></span>' + (item.ok ? item.okLabel : item.warnLabel) + '</li>';
  }).join(''));
}

function renderConnectionStatus(state){
  if(APP_MODE !== 'control') return;
  var displayOk = !!state.displayConnected;
  var phoneCount = state.phoneClientCount || 0;
  $('#displayConnectionStatus').html(
    '<span class="connectionBadge ' + (displayOk ? 'connectionOk' : 'connectionKo') + '">' +
    (displayOk ? '🖥️ Display connecté' : '🖥️ Display non connecté') + '</span>'
  );
  $('#phoneConnectionStatus').html(
    '<span class="connectionBadge ' + (phoneCount > 0 ? 'connectionOk' : '') + '">📱 ' + phoneCount + ' téléphone' + (phoneCount !== 1 ? 's' : '') + ' connecté' + (phoneCount !== 1 ? 's' : '') + '</span>'
  );
}

// ---- Coque de l'ecran gestionnaire (barre laterale, fil d'Ariane, minuteur) ----
// Tout ceci est reserve a APP_MODE === 'control' : sur le display ces elements
// sont masques par le CSS et jamais alimentes.
function ic(name){ return '<svg class="i"><use href="#i-' + name + '"/></svg>'; }

function escapeHtml(text){
  return String(text == null ? '' : text).replace(/[&<>"']/g, function(c){
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function renderCrumb(state){
  if(APP_MODE !== 'control') return;
  var game = state.game;
  var title = 'Aucune épreuve en cours';
  var sub = (game && game.hasScenario) ? 'Choisissez une épreuve dans la barre latérale' : 'Choisissez un scénario puis une épreuve';
  if(game && game.hasScenario && game.current && !game.menuVisible){
    title = game.current.epreuveName;
    sub = 'Question ' + (game.current.questionIndex + 1) + '/' + game.current.totalQuestionsInEpreuve +
      ' · épreuve ' + (game.current.epreuveIndex + 1) + '/' + game.current.totalEpreuves +
      (game.epreuveStarted ? '' : ' · pas encore lancée');
  }
  $('#crumbT').text(title);
  $('#crumbS').text(sub);
  $('#sidebarScenarioName').text((game && game.scenarioName) || (game && game.hasScenario ? 'Scénario en cours' : 'Aucun scénario lancé'));
}

// Liste des epreuves du scenario dans la barre laterale (remplace l'ancien
// panneau "Epreuves du scenario" du centre). Reutilise .menuEpreuveRow pour le
// clic (voir le gestionnaire delegue plus bas). Reconstruite uniquement quand
// son contenu change, pour ne pas perdre le focus clavier a chaque broadcast.
var lastSidebarEpreuvesKey = '';
function renderSidebarEpreuves(state){
  if(APP_MODE !== 'control') return;
  var game = state.game;
  var $list = $('#sidebarEpreuves');
  var hasScenario = !!(game && game.hasScenario);
  var epreuves = hasScenario ? (game.epreuves || []) : [];
  var playedIds = hasScenario ? (game.playedEpreuveIds || []) : [];
  var currentIndex = (hasScenario && game.current && !game.menuVisible) ? game.current.epreuveIndex : -1;
  $('#controlMenuHint').prop('hidden', !(hasScenario && (game.menuVisible || !game.current)));
  var key = JSON.stringify([epreuves.map(function(e){ return [e.id, e.name, e.defaultPoints, e.category]; }), playedIds, currentIndex]);
  if(key === lastSidebarEpreuvesKey) return;
  lastSidebarEpreuvesKey = key;
  if(!epreuves.length){
    $list.html('<div class="sbl" style="padding-top:0">' + (hasScenario ? 'Aucune épreuve dans ce scénario.' : 'Lancez un scénario pour voir ses épreuves.') + '</div>');
    return;
  }
  var html = '';
  epreuves.forEach(function(ep, i){
    var isPlayed = playedIds.indexOf(ep.id) !== -1;
    var isCurrent = i === currentIndex;
    html += '<button type="button" class="ep menuEpreuveRow' + (isPlayed ? ' playedEpreuve' : '') + '" data-epreuve-id="' + escapeHtml(ep.id) + '"' +
      (isCurrent ? ' aria-current="true"' : '') + ' title="Lancer cette épreuve">' +
      '<span class="epn">' + (isPlayed ? ic('check') : (i + 1)) + '</span>' +
      '<span class="epname">' + escapeHtml(ep.name) + '</span>' +
      '<span class="pts">' + (ep.defaultPoints != null ? ep.defaultPoints + ' pts' : '') + '</span>' +
      '</button>';
  });
  $list.html(html);
}

// Anneau de temps du buzzer en direct : reflexion (avant verrouillage auto) ou
// temps de reponse de l'equipe a la parole. Ne reconstruit aucun bouton :
// uniquement des textes/attributs, car appele toutes les 250 ms.
var RING_LENGTH = 276.46;
function renderControlTimer(state){
  if(APP_MODE !== 'control') return;
  var game = state.game;
  var round = state.round || {};
  var $pr = $('#ctlRingPr');
  var num = '–', label = 'Aucune question en cours', fraction = 0, low = false;
  var buzzerLive = game && game.current && game.current.responseType === 'buzzer' && game.epreuveStarted;
  if(buzzerLive){
    var totalReflection = game.current.timerSeconds || 0;
    if(round.activeTeam){
      var maxAnswer = (buzzConfig && buzzConfig.maxAnswerSeconds) || 0;
      if(round.answerDeadlineAt && maxAnswer > 0){
        var left = Math.max(0, (round.answerDeadlineAt - Date.now()) / 1000);
        num = Math.ceil(left) + ' s';
        fraction = Math.min(1, left / maxAnswer);
        low = left <= 3;
        label = round.activeTeam + ' répond';
      } else {
        num = '●';
        label = round.activeTeam + ' répond';
        fraction = 1;
      }
    } else if(round.reflectionEndsAt && totalReflection > 0){
      var reflLeft = Math.max(0, (round.reflectionEndsAt - Date.now()) / 1000);
      num = Math.ceil(reflLeft) + ' s';
      fraction = Math.min(1, reflLeft / totalReflection);
      low = reflLeft <= 3;
      label = 'avant verrouillage auto';
    } else if(round.reflectionRemainingMs != null && totalReflection > 0){
      var frozen = round.reflectionRemainingMs / 1000;
      num = Math.ceil(frozen) + ' s';
      fraction = Math.min(1, frozen / totalReflection);
      label = round.awaitingMediaStart ? 'démarre avec la piste' : 'temps de réflexion en pause';
    } else if(round.open){
      num = '●';
      label = 'En attente d\'un buzz';
    } else {
      num = '–';
      label = 'Buzz fermé — lancez le buzz';
    }
  } else if(game && game.current){
    label = 'Cette question ne se joue pas au buzzer';
  }
  $pr.attr('stroke-dashoffset', (RING_LENGTH * (1 - fraction)).toFixed(2)).toggleClass('low', low);
  $('#ctlRingNum').text(num);
  $('#ctlRingLbl').text(label);
  var $timer = $('#activeTeamTimer');
  if(round.activeTeam && round.answerDeadlineAt){
    $timer.text('Temps restant : ' + Math.max(0, Math.ceil((round.answerDeadlineAt - Date.now()) / 1000)) + ' s').prop('hidden', false);
  } else {
    $timer.prop('hidden', true);
  }
}

function syncBuzzModeSeg(){
  $('.seg [data-bmode]').each(function(){
    $(this).attr('aria-pressed', String($(this).data('bmode') === buzzConfig.buzzMode));
  });
}

$(document).on('click', '.seg [data-bmode]', function(){
  if(APP_MODE !== 'control') return;
  var mode = $(this).data('bmode');
  $('input[name=buzzModeRadio][value=' + mode + ']').prop('checked', true);
  buzzConfig.buzzMode = mode;
  syncBuzzModeSeg();
  $('#saveBuzzConfigButton').trigger('click');
});

// ---- Vote facultatif de l'epreuve suivante ----
// Le serveur est seul maitre (state.vote, voir publicVote). Ici : panneau de suivi
// pour le gestionnaire, fenetre de lancement, et overlay plein ecran du display.
function voteEpreuveInfo(state, id){
  var list = (state.game && state.game.epreuves) || [];
  for(var i = 0; i < list.length; i++){ if(list[i].id === id) return list[i]; }
  return { id: id, name: '?', category: null };
}

function voteSecondsLeft(vote){
  return vote && vote.endsAt ? Math.max(0, Math.ceil((vote.endsAt - Date.now()) / 1000)) : null;
}

var lastVoteControlKey = '';
function renderVoteControl(state){
  if(APP_MODE !== 'control') return;
  var vote = state.vote;
  var game = state.game;
  var hasScenario = !!(game && game.hasScenario);
  $('#openVoteSetupButton').prop('hidden', !(hasScenario && game.menuVisible && !vote));
  var $panel = $('#votePanel');
  if(!vote){
    $panel.prop('hidden', true);
    lastVoteControlKey = '';
    return;
  }
  $panel.prop('hidden', false);
  $('#controlMenuHint').prop('hidden', true);
  var key = JSON.stringify([vote.status, vote.options, vote.tally, vote.votedTeams, vote.totalTeams, vote.winnerId, vote.drawn, vote.noVotes, vote.autoLaunch]);
  if(key !== lastVoteControlKey){
    lastVoteControlKey = key;
    var isOpen = vote.status === 'open';
    var totalVotes = 0;
    (vote.options || []).forEach(function(id){ totalVotes += (vote.tally && vote.tally[id]) || 0; });
    $('#voteTitle').text(isOpen ? 'Vote en cours : épreuve suivante' : 'Vote terminé');
    var progress = vote.votedTeams.length + ' / ' + vote.totalTeams + ' équipe' + (vote.totalTeams !== 1 ? 's' : '') + ' ont voté' +
      (isOpen && !vote.live ? ' · scores visibles par vous seul jusqu\'au résultat' : '');
    if(!isOpen && vote.noVotes) progress = 'Personne n\'a voté : épreuve tirée au sort.';
    else if(!isOpen && vote.drawn) progress = 'Égalité : épreuve tirée au sort parmi les ex æquo.';
    $('#voteProgress').text(progress);
    var optionsHtml = '';
    vote.options.forEach(function(id){
      var ep = voteEpreuveInfo(state, id);
      var count = (vote.tally && vote.tally[id]) || 0;
      var pct = totalVotes ? Math.round(count / totalVotes * 100) : 0;
      var voters = Object.keys(vote.votes || {}).filter(function(team){ return vote.votes[team] === id; });
      var isWinner = !isOpen && vote.winnerId === id;
      optionsHtml += '<div class="voteOpt' + (isWinner ? ' isWinner' : '') + '">' +
        '<div class="voteOptHead"><span class="voteOptName">' + categoryIcon(ep.category) + ' ' + escapeHtml(ep.name) + '</span>' +
        '<span class="voteOptCount">' + count + '</span>' +
        (!isOpen && !isWinner ? '<button type="button" class="reveal" data-vote-pick="' + escapeHtml(id) + '">Choisir</button>' : '') +
        (isWinner ? '<span class="voteOptCrown">' + ic('check') + 'Gagnante</span>' : '') + '</div>' +
        '<div class="voteBar"><i style="width:' + pct + '%"></i></div>' +
        (voters.length ? '<div class="voteVoters">' + voters.map(escapeHtml).join(', ') + '</div>' : '') +
        '</div>';
    });
    $('#voteOptions').html(optionsHtml);
    var winner = vote.winnerId != null ? voteEpreuveInfo(state, vote.winnerId) : null;
    $('#voteActions').html(isOpen
      ? '<button type="button" id="endVoteButton" class="btn btn-primary btn-sm">Clôturer le vote</button>' +
        '<button type="button" id="cancelVoteButton" class="btn btn-outline-secondary btn-sm">Annuler le vote</button>'
      : '<button type="button" id="launchVoteWinnerButton" class="btn btn-success btn-sm" data-epreuve-id="' + escapeHtml(vote.winnerId) + '">▶ Choisir « ' + escapeHtml(winner ? winner.name : '?') + ' »</button>' +
        '<button type="button" id="cancelVoteButton" class="btn btn-outline-secondary btn-sm">Annuler</button>');
  }
  renderVoteCountdown(state);
}

// Texte du compte a rebours : appele a chaque broadcast ET toutes les 250 ms
// (aucun bouton reconstruit ici, seulement du texte).
function renderVoteCountdown(state){
  var vote = state.vote;
  var text = '';
  if(vote){
    if(vote.status === 'open'){
      var left = voteSecondsLeft(vote);
      text = left === null ? 'Clôture manuelle' : '⏱ ' + left + ' s';
    } else if(vote.launchAt){
      text = 'Lancement dans ' + Math.max(0, Math.ceil((vote.launchAt - Date.now()) / 1000)) + ' s';
    }
  }
  if(APP_MODE === 'control') $('#voteCountdown').text(text);
}

$(document).on('click', '#endVoteButton', function(){ if(buzzSocket) buzzSocket.emit('end-vote'); });
$(document).on('click', '#cancelVoteButton', function(){ if(buzzSocket) buzzSocket.emit('cancel-vote'); });
$(document).on('click', '#launchVoteWinnerButton', function(){
  // Meme chemin que le clic sur une epreuve de la barre laterale (le serveur efface le vote).
  if(buzzSocket) buzzSocket.emit('launch-epreuve', $(this).data('epreuve-id'));
});
$(document).on('click', '[data-vote-pick]', function(){
  if(buzzSocket) buzzSocket.emit('set-vote-winner', $(this).data('vote-pick'));
});

function openVoteSetup(){
  if(APP_MODE !== 'control' || !lastBuzzState || !lastBuzzState.game) return;
  var game = lastBuzzState.game;
  var settings = game.voteSettings || {};
  var played = game.playedEpreuveIds || [];
  var html = '';
  (game.epreuves || []).forEach(function(ep){
    var isPlayed = played.indexOf(ep.id) !== -1;
    html += '<label class="voteSetupRow"><input type="checkbox" class="form-check-input" value="' + escapeHtml(ep.id) + '"' + (isPlayed ? '' : ' checked') + '> ' +
      categoryIcon(ep.category) + ' ' + escapeHtml(ep.name) + (isPlayed ? ' <span class="text-muted">(déjà jouée)</span>' : '') + '</label>';
  });
  $('#voteSetupEpreuves').html(html);
  $('#voteSetupCount').val(String(settings.count || 0));
  $('#voteSetupDuration').val(typeof settings.duration === 'number' ? settings.duration : 30);
  $('#voteSetupLive').prop('checked', !!settings.live);
  $('#voteSetupAutoLaunch').prop('checked', !!settings.autoLaunch);
  $('#voteSetupError').prop('hidden', true);
  $('#voteSetupModal').modal('show');
}
$('#openVoteSetupButton, #openVoteSetupHintButton').on('click', openVoteSetup);

$('#startVoteButton').on('click', function(){
  if(!buzzSocket) return;
  var ids = $('#voteSetupEpreuves input:checked').map(function(){ return $(this).val(); }).get();
  // Les ids du serveur sont numeriques : on repasse en nombre pour qu'ils correspondent.
  var numericIds = ids.map(function(v){ return isNaN(Number(v)) ? v : Number(v); });
  buzzSocket.emit('start-vote', {
    epreuveIds: numericIds,
    count: parseInt($('#voteSetupCount').val(), 10) || 0,
    duration: Math.max(0, parseInt($('#voteSetupDuration').val(), 10) || 0),
    live: $('#voteSetupLive').is(':checked'),
    autoLaunch: $('#voteSetupAutoLaunch').is(':checked')
  }, function(result){
    if(result && result.ok){ $('#voteSetupModal').modal('hide'); }
    else { $('#voteSetupError').text((result && result.error) || 'Impossible de lancer le vote.').prop('hidden', false); }
  });
});

// Overlay plein ecran du display : cartes d'epreuves, barres de votes (si
// visibles), compte a rebours, puis la gagnante. En cas d'egalite, courte
// animation de "tirage" cote client (le gagnant est deja fixe par le serveur).
var lastDisplayVoteKey = '';
var displayVoteDrawFor = null;
var displayVoteDrawStart = 0;
var VOTE_DRAW_MS = 2500;
function renderDisplayVote(state){
  if(APP_MODE !== 'display') return;
  var vote = state.vote;
  var $overlay = $('#displayVoteOverlay');
  if(!vote){
    $overlay.prop('hidden', true);
    lastDisplayVoteKey = '';
    return;
  }
  $overlay.prop('hidden', false);
  var isOpen = vote.status === 'open';
  if(!isOpen && vote.drawn && displayVoteDrawFor !== vote.startedAt){
    displayVoteDrawFor = vote.startedAt;
    displayVoteDrawStart = Date.now();
  }
  var drawing = !isOpen && vote.drawn && (Date.now() - displayVoteDrawStart) < VOTE_DRAW_MS;
  var key = JSON.stringify([vote.status, vote.options, vote.tally, vote.winnerId, vote.startedAt]);
  if(key !== lastDisplayVoteKey){
    lastDisplayVoteKey = key;
    var maxCount = 1;
    if(vote.tally){ vote.options.forEach(function(id){ maxCount = Math.max(maxCount, vote.tally[id] || 0); }); }
    var cards = '';
    vote.options.forEach(function(id){
      var ep = voteEpreuveInfo(state, id);
      var count = vote.tally ? (vote.tally[id] || 0) : null;
      cards += '<div class="voteCard" data-id="' + escapeHtml(id) + '">' +
        '<div class="voteCardIcon">' + categoryIcon(ep.category) + '</div>' +
        '<div class="voteCardName">' + escapeHtml(ep.name) + '</div>' +
        (count !== null ? '<div class="voteCardBar"><i style="width:' + Math.round(count / maxCount * 100) + '%"></i></div><div class="voteCardCount">' + count + '</div>' : '') +
        '</div>';
    });
    $('#displayVoteCards').html(cards);
  }
  // Etats legers (classes/textes) remis a jour a chaque appel, sans reconstruire les cartes.
  var tied = vote.tiedIds || [];
  var flashId = drawing && tied.length ? tied[Math.floor((Date.now() - displayVoteDrawStart) / 200) % tied.length] : null;
  $('#displayVoteCards .voteCard').each(function(){
    var id = $(this).data('id');
    $(this).toggleClass('flash', flashId !== null && id === flashId)
      .toggleClass('isWinner', !isOpen && !drawing && vote.winnerId === id)
      .toggleClass('dim', !isOpen && !drawing && vote.winnerId !== id);
  });
  $('#displayVoteTitle').text(isOpen ? 'Votez pour la prochaine épreuve !' : (drawing ? 'Égalité… tirage au sort !' : 'Prochaine épreuve :'));
  var footer = '';
  if(isOpen){
    footer = vote.votedTeams.length + ' / ' + vote.totalTeams + ' équipes ont voté' + (vote.live ? '' : ' · résultat à la fin du vote');
  } else if(!drawing){
    footer = vote.noVotes ? 'Personne n\'a voté : épreuve tirée au sort !' : (vote.drawn ? 'Égalité départagée au sort !' : '');
  }
  $('#displayVoteFooter').text(footer);
  var left = voteSecondsLeft(vote);
  $('#displayVoteCountdown').text(isOpen && left !== null ? left : '').toggleClass('urgent', isOpen && left !== null && left <= 5);
}

function handleBuzzState(state){
  lastBuzzState = state;
  // L'annulation ne doit valoir que pour la question sur laquelle elle vient
  // d'etre faite : des qu'on change de question, on efface le filet de securite
  // plutot que de risquer d'annuler une action qui ne concerne plus l'actuelle.
  if(APP_MODE === 'control' && state.game && state.game.current){
    var questionKey = state.game.current.epreuveIndex + '-' + state.game.current.questionIndex;
    if(lastValidationQuestionKey !== null && lastValidationQuestionKey !== questionKey){
      setLastValidation(null);
    }
    lastValidationQuestionKey = questionKey;
  }
  // Le serveur est seul maitre du reglage buzzer : on aligne l'UI (et le
  // buzzConfig local, pour le pre-remplissage) sur ce qu'il renvoie. Mais on
  // ne re-remplit le formulaire Reglages QUE si une valeur a reellement
  // change depuis la derniere fois : un broadcastState() part a chaque action
  // (buzz, equipe qui rejoint, etc.), bien plus souvent qu'un changement de
  // reglage - le re-remplir a chaque fois ecrasait le curseur de volume en
  // plein glissement (l'animateur le bougeait, un broadcast non lie arrivait,
  // le curseur revenait a l'ancienne valeur avant meme le clic sur Enregistrer).
  if(state.config){
    var buzzConfigChanged = buzzConfig.buzzMode !== state.config.buzzMode ||
      buzzConfig.excludeWrongTeamAfterCooldown !== state.config.excludeWrongTeamAfterCooldown ||
      buzzConfig.maxAnswerSeconds !== state.config.maxAnswerSeconds ||
      buzzConfig.buzzVolume !== state.config.buzzVolume;
    buzzConfig.buzzMode = state.config.buzzMode;
    buzzConfig.excludeWrongTeamAfterCooldown = state.config.excludeWrongTeamAfterCooldown;
    buzzConfig.maxAnswerSeconds = state.config.maxAnswerSeconds;
    buzzConfig.buzzVolume = state.config.buzzVolume;
    if(APP_MODE === 'control' && buzzConfigChanged) prefillBuzzSettingsUI();
  }
  $('#rehearsalBanner').prop('hidden', !state.rehearsalMode);
  if(APP_MODE === 'control') $('#rehearsalModeCheckbox').prop('checked', !!state.rehearsalMode);
  if(APP_MODE === 'control') renderPhoneMute(state);
  renderConnectionStatus(state);
  renderCrumb(state);
  renderSidebarEpreuves(state);
  renderVoteControl(state);
  renderDisplayVote(state);
  renderPreflightChecklist(state);
  renderBuzzResults(state);
  renderDisplayBanner(state);
  renderDisplayQr(state);
  renderDisplayScoreboard(state);
  renderDisplayMessage(state);
  renderDisplayResultBanner(state);
  applyMediaOwnership(state);
  reconcilePlayerCreatedTeams(state);

  var activeTeam = state.round.activeTeam;
  if(activeTeam && activeTeam !== previousActiveTeam){
    // Une equipe vient de prendre la parole (1er buzz ou promotion podium).
    if(APP_MODE === 'control'){
      // C'est ici (ecran gestionnaire) que l'animateur juge la reponse. Ce
      // panneau est integre dans l'encadre de la question (a cote du podium
      // des buzz) plutot qu'en modale plein ecran : une modale masquait le
      // podium juste en dessous, empechant de voir qui d'autre attendait.
      hostBeep(440, 400);
      $('#activeTeamName').text(activeTeam);
      $('#activeTeamPanel').prop('hidden', false);
    }
  } else if(!activeTeam && previousActiveTeam){
    // Plus personne a la parole (mauvaise reponse finale ou reponse correcte).
    if(APP_MODE === 'control'){
      $('#activeTeamPanel').prop('hidden', true);
    }
  }
  previousActiveTeam = activeTeam;
  renderQuestionContent(state);
  renderControlTimer(state);
  syncMediaPlayback(state);
}

// Rafraichit l'affichage chaque seconde pour faire defiler les decomptes textuels.
setInterval(function(){ if(lastBuzzState){ renderBuzzResults(lastBuzzState); renderQuestionBuzzStatus(lastBuzzState); renderBuzzLockStatus(lastBuzzState); } }, 1000);
setInterval(function(){ if(lastBuzzState){ renderDisplayBanner(lastBuzzState); renderDisplayMessageCountdown(lastBuzzState); renderControlTimer(lastBuzzState); renderVoteCountdown(lastBuzzState); renderDisplayVote(lastBuzzState); } }, 250);

function prefillBuzzSettingsUI(){
  $('#buzzLinkInput').val(BUZZ_SERVER_URL);
  $('input[name=buzzModeRadio][value='+buzzConfig.buzzMode+']').prop('checked', true);
  syncBuzzModeSeg();
  $('#excludeWrongTeamCheckbox').prop('checked', buzzConfig.excludeWrongTeamAfterCooldown);
  $('#maxAnswerSecondsInput').val(buzzConfig.maxAnswerSeconds);
  $('#autoOpenOnSlideChangeCheckbox').prop('checked', buzzConfig.autoOpenOnSlideChange);
  var volumePercent = Math.round((typeof buzzConfig.buzzVolume === 'number' ? buzzConfig.buzzVolume : 1) * 100);
  $('#buzzVolumeInput').val(volumePercent);
  $('#buzzVolumeValue').text(volumePercent);
}

function loadBuzzClient(){
  // La librairie client socket.io est chargee en local (socket.io.min.js), pas
  // depuis le serveur de buzz : un chargement de script cross-origin vers ce
  // serveur peut etre bloque par le navigateur/des extensions (constate en test).
  // BUZZ_SERVER_URL peut porter un prefixe (ex. https://hote/quiz derriere la passerelle
  // node-gateway) : sans ca, io() le prendrait pour un namespace. Origine + chemin explicite.
  var buzzUrl = new URL(BUZZ_SERVER_URL, location.href);
  buzzSocket = io(buzzUrl.origin, { path: buzzUrl.pathname.replace(/\/+$/, '') + '/socket.io' });
  buzzSocket.on('connect', function(){
    buzzSocket.emit('register-role', APP_MODE);
    // Seul l'ecran gestionnaire fait autorite sur la liste d'equipes :
    // l'ecran d'affichage ne doit jamais pousser sa propre reconstruction
    // (basee sur un localStorage potentiellement perime, ex. equipes creees
    // depuis un telephone) vers le serveur au risque d'ecraser l'etat reel.
    // Le reglage buzzer (mode single/podium, etc.), lui, ne doit PLUS etre
    // pousse automatiquement ici : si un second onglet/appareil gestionnaire
    // se connecte (ou se reconnecte) avec un buzzConfig local perime (valeurs
    // par defaut d'un navigateur/localStorage different), il ecrasait
    // silencieusement le reglage en cours cote serveur (bug constate : le
    // mode "Podium de 3" repassait a "single" des qu'un 2e client gestionnaire
    // se connectait). Le serveur reste seul maitre du reglage ; on se contente
    // de refleter sa valeur dans l'UI (voir handleBuzzState -> state.config).
    if(APP_MODE === 'control'){
      syncTeamsToServer();
    }
  });
  buzzSocket.on('connect_error', function(err){
    console.warn('Serveur de buzz injoignable : '+BUZZ_SERVER_URL, err.message);
  });
  buzzSocket.on('state', function(state){
    handleBuzzState(state);
  });
}
loadBuzzClient();

if(APP_MODE === 'control'){
  prefillBuzzSettingsUI();
  $('#buzzQrCode').html('');
  new QRCode(document.getElementById('buzzQrCode'), { text: BUZZ_SERVER_URL, width: 140, height: 140 });
}

$( "#saveBuzzConfigButton" ).on( "click", function(){
  buzzConfig.buzzMode = $('input[name=buzzModeRadio]:checked').val() || 'single';
  buzzConfig.excludeWrongTeamAfterCooldown = $('#excludeWrongTeamCheckbox').is(':checked');
  buzzConfig.maxAnswerSeconds = parseInt($('#maxAnswerSecondsInput').val(), 10) || 0;
  buzzConfig.autoOpenOnSlideChange = $('#autoOpenOnSlideChangeCheckbox').is(':checked');
  buzzConfig.buzzVolume = (parseInt($('#buzzVolumeInput').val(), 10) || 0) / 100;
  localStorage.setItem('buzzMode', buzzConfig.buzzMode);
  localStorage.setItem('buzzExcludeWrongTeam', buzzConfig.excludeWrongTeamAfterCooldown);
  localStorage.setItem('buzzMaxAnswerSeconds', buzzConfig.maxAnswerSeconds);
  localStorage.setItem('buzzAutoOpenOnSlideChange', buzzConfig.autoOpenOnSlideChange);
  if(buzzSocket) buzzSocket.emit('set-config', buzzConfig);
  showToast('Réglages enregistrés.', 'success');
});

// Met a jour le pourcentage affiche en glissant le curseur, avant meme
// d'enregistrer (retour visuel immediat).
$( "#buzzVolumeInput" ).on( "input", function(){
  $('#buzzVolumeValue').text($(this).val());
});

// Ecoute le son de buzz au volume actuellement regle sur le curseur (pas
// besoin d'enregistrer ni de sortir un telephone pour verifier le niveau).
$( "#testBuzzSoundButton" ).on( "click", function(){
  var volume = (parseInt($('#buzzVolumeInput').val(), 10) || 0) / 100;
  controlPlayBuzzSound('cloche', volume);
  soundTestedThisSession = true;
  if(lastBuzzState) renderPreflightChecklist(lastBuzzState);
});

$( "#openBuzzButton" ).on( "click", function(){
  if(buzzSocket) buzzSocket.emit('open-round');
});

$( "#lockAllButton" ).on( "click", function(){
  if(buzzSocket) buzzSocket.emit('lock-all');
});

$( "#unlockAllButton" ).on( "click", function(){
  if(buzzSocket) buzzSocket.emit('unlock-all');
});

$( "#unlockRemainingButton" ).on( "click", function(){
  if(buzzSocket) buzzSocket.emit('unlock-remaining');
});

$( "#undoLastValidationButton" ).on( "click", function(){
  if(!lastValidation) return;
  if(lastValidation.type === 'points'){
    // Retire les points qui viennent d'etre attribues (la meme mecanique que
    // leur attribution : score local + badge + localStorage + sync serveur).
    var $row = $('.team').filter(function(){ return $(this).data('team') === lastValidation.team; });
    if($row.length){
      var newValue = ($row.data('value') || 0) - lastValidation.points;
      $row.data('value', newValue);
      $row.find('.badge').text(newValue);
      localStorage.setItem(lastValidation.team, newValue);
      syncTeamsToServer();
    }
  } else if(lastValidation.type === 'wrong'){
    if(buzzSocket) buzzSocket.emit('unexclude-team', lastValidation.team);
  }
  showToast('Dernière validation annulée.', 'success');
  setLastValidation(null);
});

let qrShownOnDisplay = false;
$( "#toggleQrOnDisplayButton" ).on( "click", function(){
  qrShownOnDisplay = !qrShownOnDisplay;
  if(buzzSocket) buzzSocket.emit(qrShownOnDisplay ? 'show-qr' : 'hide-qr');
  $(this).text(qrShownOnDisplay ? 'Masquer QR' : 'Afficher QR');
});

$( "#openDisplayWindowButton" ).on( "click", function(){
  var url = location.origin + location.pathname + '?mode=display';
  window.open(url, 'quizDisplay', 'noopener');
});

// navigator.clipboard n'existe que dans un contexte "securise" (HTTPS, ou
// localhost) : sur http://10.0.0.98:... (LAN, pendant les tests avant le vrai
// deploiement HTTPS sur Infomaniak), y acceder levait une exception qui
// arretait le handler avant meme d'avoir copie quoi que ce soit - le bouton
// semblait ne rien faire. Repli sur document.execCommand('copy') (obsolete
// mais ne necessite pas de contexte securise) quand l'API moderne est absente.
function copyTextToClipboard(text){
  if(window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText){
    return navigator.clipboard.writeText(text);
  }
  return new Promise(function(resolve, reject){
    var $temp = $('<textarea readonly></textarea>').val(text).css({ position: 'fixed', top: '-9999px' }).appendTo('body');
    $temp[0].select();
    try {
      document.execCommand('copy');
      resolve();
    } catch(e){
      reject(e);
    } finally {
      $temp.remove();
    }
  });
}

$( "#copyBuzzLinkButton" ).on( "click", function(){
  copyTextToClipboard(BUZZ_SERVER_URL).catch(function(){ showToast('Impossible de copier le lien.', 'error'); });
});

// Cliquer une equipe de la file d'attente lui donne la parole (passe outre
// l'ordre d'arrivee) plutot que d'attribuer des points directement : c'est
// desormais #correctAnswerButton/#wrongAnswerButton (panneau "equipe a la
// parole") qui gerent l'attribution, une fois l'equipe choisie active.
$(document).on('click', '.buzzQueueRow', function(){
  if($(this).hasClass('isSpeaking') || $(this).hasClass('isWrong')) return;
  var teamName = $(this).data('team');
  if(buzzSocket) buzzSocket.emit('select-active-buzz', teamName);
});

// Miniatures cote gestionnaire (voir .questionImages img en mode-control dans
// main.css) : cliquer en ouvre une version pleine taille dans une modale,
// pour garder le reste du panneau (statut, file d'attente, validation)
// visible sans avoir a defiler.
$(document).on('click', '#questionImages img', function(){
  if(APP_MODE !== 'control') return;
  $('#imageLightboxImg').attr('src', $(this).attr('src'));
  $('#imageLightboxModal').modal('show');
});

$( "#correctAnswerButton" ).on( "click", function(){
  var teamName = $('#activeTeamName').text();
  $('#activeTeamPanel').prop('hidden', true);
  awardingForBuzz = true;
  $('.team').filter(function(){ return $(this).data('team') === teamName; }).trigger('click');
});

$( "#wrongAnswerButton" ).on( "click", function(){
  setLastValidation({ type: 'wrong', team: $('#activeTeamName').text() });
  // Ne pas cacher le panneau ici : si le podium promeut l'equipe suivante, il doit
  // rester visible avec le nom mis a jour (voir handleBuzzState). Il ne se cache
  // que si l'etat renvoye par le serveur indique qu'il n'y a plus d'equipe active.
  if(buzzSocket) buzzSocket.emit('resolve-wrong');
});

// Comme "Classement", le Top 10 toutes parties s'affiche sur le grand ecran.
$( "#allTimeLeaderboardButton" ).on( "click", function(){
  if(!buzzSocket) return;
  var alreadyShown = lastBuzzState && lastBuzzState.scoreboardVisible && lastBuzzState.scoreboardVisible.type === 'alltime';
  if(alreadyShown){
    buzzSocket.emit('hide-scoreboard');
    return;
  }
  fetch(BUZZ_SERVER_URL + '/api/leaderboard')
    .then(function(res){ return res.json(); })
    .then(function(rows){
      buzzSocket.emit('show-scoreboard', { type: 'alltime', rows: rows });
    })
    .catch(function(){
      showToast('Serveur de buzz injoignable.', 'error');
    });
});

// =====================================================================
// ---- Epreuves / scenarios : question en cours (gestionnaire + affichage) ----
// =====================================================================

// Affiche l'ecran d'attente (message + QR pour rejoindre) a la place du
// contenu de jeu : avant qu'un scenario ne soit choisi, ou (sur le display
// uniquement) tant que l'epreuve choisie n'a pas ete demarree par l'animateur,
// ou si le scenario reserve son menu au gestionnaire (voir point 3).
// subMessage optionnel : quand fourni, mainMessage devient un gros titre
// ("Préparez-vous !") et subMessage passe sur sa propre ligne, plus petite,
// plutot que d'entasser toute la phrase en un seul bloc.
function showIdleCard(mainMessage, subMessage, showQr){
  $('#epreuvesMenuPanel').prop('hidden', true);
  $('#questionContent').prop('hidden', true);
  $('#displayIdleCard').prop('hidden', false);
  $('#displayIdleMessage').text(mainMessage).toggleClass('headline', !!subMessage);
  $('#displayIdleSubMessage').text(subMessage || '').prop('hidden', !subMessage);
  // Le QR n'a de sens que tant qu'on peut encore rejoindre une equipe avant le
  // debut du jeu : une fois une epreuve choisie (armee), on ne le montre plus.
  $('#displayIdleQrCode').prop('hidden', !showQr);
  if(showQr && !displayIdleQrRendered){
    $('#displayIdleQrCode').html('');
    new QRCode(document.getElementById('displayIdleQrCode'), { text: BUZZ_SERVER_URL, width: 160, height: 160 });
    displayIdleQrRendered = true;
  }
}

var lastHostNoteKey = '';

function renderQuestionContent(state){
  var game = state.game;
  $('#showEpreuveMenuButton').prop('hidden', !(game && game.hasScenario));
  $('#toggleMenuOnDisplayButton').prop('hidden', !(game && game.hasScenario));
  if(game && game.hasScenario){
    // Icone oeil / oeil barre (via CSS) plutot qu'un changement de couleur,
    // plus lisible pour indiquer un etat visible/masque.
    $('#toggleMenuOnDisplayButton')
      .toggleClass('eyeOff', !game.showMenuOnDisplay)
      .attr('title', game.showMenuOnDisplay ? 'Menu des épreuves visible sur le display (cliquer pour masquer)' : 'Menu des épreuves masqué sur le display (cliquer pour afficher)');
  }

  // Un message libre pousse par l'animateur (voir renderDisplayMessage) prend
  // toujours le pas sur le contenu de jeu affiche sur le display.
  if(APP_MODE === 'display' && state.displayMessage){
    $('#displayIdleCard').prop('hidden', true);
    $('#epreuvesMenuPanel').prop('hidden', true);
    $('#questionContent').prop('hidden', true);
    return;
  }

  // Tant qu'aucun scenario n'est charge, le display invite les joueurs a
  // rejoindre une equipe et affiche le QR : ils ont encore le temps de le
  // faire (c'est le tout debut de la partie, pas juste une pause entre deux
  // epreuves — voir plus bas, ces deux cas ne doivent pas etre confondus).
  if(!game || !game.hasScenario){
    $('#noScenarioMessage').toggle(APP_MODE === 'control');
    if(APP_MODE === 'display'){
      showIdleCard('La partie va bientôt commencer.', 'Rejoignez une équipe !', true);
    } else {
      $('#epreuvesMenuPanel').prop('hidden', true);
      $('#questionContent').prop('hidden', true);
      $('#displayIdleCard').prop('hidden', true);
    }
    return;
  }
  $('#noScenarioMessage').hide();

  if(game.menuVisible || !game.current){
    // Un scenario est deja en cours (les equipes ont deja rejoint) : c'est une
    // pause entre deux epreuves, pas le debut de la partie. Pas de QR ici.
    if(APP_MODE === 'display' && !game.showMenuOnDisplay){
      showIdleCard('Une nouvelle épreuve va commencer...', null, false);
    } else {
      $('#displayIdleCard').prop('hidden', true);
      $('#questionContent').prop('hidden', true);
      $('#epreuvesMenuPanel').prop('hidden', false);
      renderEpreuvesMenu(state);
    }
    return;
  }

  // Epreuve choisie mais pas encore demarree (voir le bouton "Lancer l'epreuve") :
  // le gestionnaire peut previsualiser la question, le display doit rester neutre
  // pour ne rien devoiler tant que l'animateur n'a pas explicitement demarre.
  // Plus de QR ici : les equipes doivent deja avoir rejoint.
  if(APP_MODE === 'display' && !game.epreuveStarted){
    showIdleCard('Préparez-vous !', 'L\'épreuve "' + game.current.epreuveName + '" va commencer...', false);
    return;
  }
  $('#displayIdleCard').prop('hidden', true);
  $('#epreuvesMenuPanel').prop('hidden', true);
  $('#questionContent').prop('hidden', false);

  $('#startEpreuveButton').prop('hidden', game.epreuveStarted);
  $('#questionNavButtons').prop('hidden', !game.epreuveStarted);

  var q = game.current.question;
  $('#questionEpreuveName').text(game.current.epreuveName);
  // Notes reservees a l'animateur (consigne d'epreuve + reponse/anecdote de la
  // question) : jamais affichees sur le display, meme si elles transitent dans
  // le meme etat (voir renderAnswersReceived plus bas pour la meme logique).
  // Une ligne par note (Consigne, Reponse, Indice), toujours visibles : cet ecran n'est jamais
  // montre aux joueurs. Reconstruit seulement si le contenu change.
  var hostNoteRows = [];
  if(game.current.hostNote) hostNoteRows.push({ label: 'Consigne', text: game.current.hostNote });
  if(q.host_note) hostNoteRows.push({ label: 'Réponse', text: q.host_note });
  if(q.hint) hostNoteRows.push({ label: 'Indice / anecdote', text: q.hint });
  if(APP_MODE === 'control' && hostNoteRows.length){
    var noteQuestionKey = game.current.epreuveIndex + '-' + game.current.questionIndex;
    var noteKey = noteQuestionKey + '|' + JSON.stringify(hostNoteRows);
    if(noteKey !== lastHostNoteKey){
      lastHostNoteKey = noteKey;
      $('#questionHostNote').html(hostNoteRows.map(function(row){
        return '<div class="nrow"><label>' + row.label + '</label><span class="txt">' + escapeHtml(row.text) + '</span></div>';
      }).join(''));
    }
    $('#questionHostNote').prop('hidden', false);
  } else {
    lastHostNoteKey = '';
    $('#questionHostNote').prop('hidden', true);
  }
  // Pastilles de progression des questions de l'epreuve (gestionnaire seulement).
  if(APP_MODE === 'control'){
    var segsHtml = '';
    for(var s = 0; s < game.current.totalQuestionsInEpreuve; s++){
      segsHtml += '<i class="' + (s < game.current.questionIndex ? 'done' : (s === game.current.questionIndex ? 'cur' : '')) + '"></i>';
    }
    if($('#questionSegs').data('html') !== segsHtml){ $('#questionSegs').html(segsHtml).data('html', segsHtml); }
  }
  // Le numero d'epreuve/question et les fleches de navigation sont reserves
  // au gestionnaire : sur l'ecran d'affichage (projo), on ne montre que le
  // nom de l'epreuve, pas sa position dans le scenario.
  $('#questionPosition').text(
    APP_MODE === 'display'
      ? ''
      : 'Question ' + (game.current.questionIndex + 1) + '/' + game.current.totalQuestionsInEpreuve +
        ' — Épreuve ' + (game.current.epreuveIndex + 1) + '/' + game.current.totalEpreuves
  );
  $('#questionText').text(q.text || '');

  var $images = $('#questionImages');
  $images.html('');
  (q.images || []).forEach(function(src){
    $images.append($('<img>').attr('src', src));
  });

  var $audio = $('#questionAudio');
  var $video = $('#questionVideo');
  var $audioPlaceholder = $('#questionAudioPlaceholder');
  if(q.audio_path){
    if($audio.attr('src') !== q.audio_path) $audio.attr('src', q.audio_path);
    // Sur le display, jamais de piste visible ni de controle : juste un repere
    // neutre (numero de question) pendant que le son joue en arriere-plan.
    $audio.prop('hidden', APP_MODE === 'display');
    if(APP_MODE === 'display'){
      $audioPlaceholder.text('🎵 Question ' + (game.current.questionIndex + 1)).prop('hidden', false);
    } else {
      $audioPlaceholder.prop('hidden', true);
    }
  } else {
    // Vider la src (pas juste masquer) : sinon syncMediaPlayback() retrouve
    // encore l'ancienne piste chargee et la relance sur une question qui n'a
    // pourtant aucun son (bug : impossible ensuite de la couper).
    if($audio.attr('src')){ $audio[0].pause(); $audio.removeAttr('src'); $audio[0].load(); }
    $audio.prop('hidden', true);
    $audioPlaceholder.prop('hidden', true);
  }
  if(q.video_path){
    if($video.attr('src') !== q.video_path) $video.attr('src', q.video_path);
    $video.prop('hidden', false);
  } else {
    if($video.attr('src')){ $video[0].pause(); $video.removeAttr('src'); $video[0].load(); }
    $video.prop('hidden', true);
  }

  var isQcmOrDirect = game.current.responseType === 'qcm' || game.current.responseType === 'direct';
  $('#qcmDirectPanel').prop('hidden', !isQcmOrDirect);
  if(isQcmOrDirect){
    renderAnswersReceived(state);
  }
  renderQuestionBuzzStatus(state);
  renderBuzzLockStatus(state);
}

// Menu de choix d'epreuve : reproduit l'ancienne grille reveal.js qui laissait
// les joueurs/l'animateur choisir librement l'ordre des epreuves. Sur le
// display, on ne montre que celles pas encore jouees (pas d'influence sur ce
// qui va suivre) ; sur le gestionnaire, tout le scenario reste visible et
// cliquable pour pouvoir relancer une epreuve deja faite si besoin.
function renderEpreuvesMenu(state){
  var game = state.game;
  var $list = $('#epreuvesMenuList');
  $list.html('');
  var epreuves = game.epreuves || [];
  var playedIds = game.playedEpreuveIds || [];
  var shown = 0;
  epreuves.forEach(function(ep){
    var isPlayed = playedIds.indexOf(ep.id) !== -1;
    if(APP_MODE === 'display' && isPlayed) return;
    shown++;
    var $row = $('<div class="epreuveRow menuEpreuveRow"></div>').attr('data-epreuve-id', ep.id);
    if(isPlayed) $row.addClass('playedEpreuve');
    var questionCount = ep.questionCount || 0;
    $row.html(
      '<span class="menuEpreuveName">' + (isPlayed ? '✅ ' : '') + categoryIcon(ep.category) + ' ' + ep.name + '</span>' +
      '<span class="menuEpreuvePoints">' + questionCount + ' question' + (questionCount !== 1 ? 's' : '') + ' · ' + ep.defaultPoints + ' pts</span>'
    );
    $list.append($row);
  });
  if(shown === 0){
    $list.append('<p class="text-muted">' + (APP_MODE === 'display' ? 'Toutes les épreuves ont été jouées !' : 'Aucune épreuve dans ce scénario.') + '</p>');
  }
}

$(document).on('click', '.menuEpreuveRow', function(){
  if(APP_MODE !== 'control' || !buzzSocket) return;
  buzzSocket.emit('launch-epreuve', $(this).data('epreuve-id'));
});

$( "#showEpreuveMenuButton" ).on( "click", function(){
  if(buzzSocket) buzzSocket.emit('show-epreuve-menu');
});

$( "#toggleMenuOnDisplayButton" ).on( "click", function(){
  if(!buzzSocket || !lastBuzzState || !lastBuzzState.game) return;
  buzzSocket.emit('toggle-menu-on-display', !lastBuzzState.game.showMenuOnDisplay);
});

function renderAnswersReceived(state){
  var game = state.game;
  var $list = $('#answersReceivedList');
  $list.html('');
  var responseType = game.current.responseType;
  var qcmOptions = game.current.question.qcm_options;
  state.teams.forEach(function(name){
    var answer = game.answers[name];
    var validation = game.validations[name];
    var displayValue = '';
    if(answer){
      displayValue = (responseType === 'qcm' && qcmOptions) ? (qcmOptions[answer.value] != null ? qcmOptions[answer.value] : answer.value) : answer.value;
    }
    var statusHtml;
    if(APP_MODE === 'display'){
      var badge = !answer ? '⏳' : (!validation ? '⏳' : (validation.status === 'correct' ? '✅ +' + validation.points : '❌'));
      statusHtml = '<span class="answerStatusBadge">' + badge + '</span>';
    } else if(answer){
      statusHtml = '<button type="button" class="btn btn-sm btn-success validateAnswerBtn" data-team="' + name + '" data-correct="1"' + (validation ? ' disabled' : '') + '>✓</button> '
        + '<button type="button" class="btn btn-sm btn-danger validateAnswerBtn" data-team="' + name + '" data-correct="0"' + (validation ? ' disabled' : '') + '>✗</button>';
    } else {
      statusHtml = '<span class="text-muted">en attente</span>';
    }
    // Sur l'ecran d'affichage, ne jamais montrer la reponse elle-meme (meme
    // validee) pour ne pas influencer les equipes qui n'ont pas encore repondu.
    var valueHtml = (APP_MODE !== 'display' && answer) ? ('<span class="answerValue">' + displayValue + '</span>') : '';
    var rowClass = 'answerRow' + (validation && validation.status === 'correct' ? ' answerCorrect' : (validation && validation.status === 'wrong' ? ' answerWrong' : ''));
    $list.append('<div class="' + rowClass + '"><span class="answerTeamName">' + name + '</span>' + valueHtml + statusHtml + '</div>');
  });
}

$(document).on('click', '.validateAnswerBtn', function(){
  var team = $(this).data('team');
  var correct = $(this).data('correct') === 1;
  if(buzzSocket) buzzSocket.emit('validate-answer', { team: team, correct: correct });
});

function loadScenariosList(){
  fetch(BUZZ_SERVER_URL + '/api/scenarios').then(function(r){ return r.json(); }).then(function(scenarios){
    var $select = $('#scenarioSelect');
    var currentVal = $select.val();
    $select.html('');
    scenarios.forEach(function(s){
      $select.append('<option value="' + s.id + '">' + s.name + '</option>');
    });
    if(currentVal) $select.val(currentVal);
  });
}
if(APP_MODE === 'control') loadScenariosList();

$( "#launchScenarioButton" ).on( "click", function(){
  var id = parseInt($('#scenarioSelect').val(), 10);
  if(buzzSocket && id) buzzSocket.emit('launch-scenario', id);
  autoFullscreenOnGesture(true); // le clic sur "Lancer" est un geste valide pour le plein ecran
});

// ---- Plein ecran automatique (tablette/smartphone, ecran gestionnaire) ----
// Active au lancement du scenario (clic sur "Lancer"), ou au premier appui suivant
// si la page a ete rechargee en cours de partie. Reglage memorise dans la barre
// laterale (defaut : active). Une seule tentative par chargement de page.
var FS_PREF_KEY = 'autoFullscreen';
var fsAttempted = false;
function fsSupported(){ var el = document.documentElement; return !!(el.requestFullscreen || el.webkitRequestFullscreen); }
function fsActive(){ return !!(document.fullscreenElement || document.webkitFullscreenElement); }
function fsTouchDevice(){ return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); }
function fsPreferred(){ try { return localStorage.getItem(FS_PREF_KEY) !== '0'; } catch(e){ return true; } }
function fsEnter(){
  var el = document.documentElement;
  var request = el.requestFullscreen || el.webkitRequestFullscreen;
  if(!request) return Promise.resolve(false);
  try { return Promise.resolve(request.call(el)).then(function(){ return true; }, function(){ return false; }); }
  catch(e){ return Promise.resolve(false); }
}
function autoFullscreenOnGesture(gameStartingNow){
  if(APP_MODE !== 'control' || fsAttempted || !fsPreferred() || !fsSupported() || !fsTouchDevice() || fsActive()) return;
  var started = gameStartingNow || !!(lastBuzzState && lastBuzzState.game && lastBuzzState.game.hasScenario);
  if(!started) return;
  fsAttempted = true;
  fsEnter().then(function(ok){
    if(ok) showToast('Plein écran activé. Vous pouvez le désactiver avec « Plein écran automatique » dans la barre latérale.', 'success');
  });
}
// ---- Menu de l'ecran gestionnaire (a cote du nombre de telephones connectes) ----
// Ouvre/ferme le menu ; se ferme au clic ailleurs, sur Echap, et apres le choix d'une action
// (les interrupteurs "Mode repetition" / "Plein ecran" le laissent ouvert pour voir leur etat).
function setAppMenuOpen(open){
  $('#appMenu').prop('hidden', !open);
  $('#appMenuButton').attr('aria-expanded', String(open));
}
if(APP_MODE === 'control'){
  $('#appMenuButton').on('click', function(e){
    e.stopPropagation();
    var willOpen = $('#appMenu').prop('hidden');
    setAppMenuOpen(willOpen);
    if(willOpen) $('#appMenu .sact').filter(':visible').first().trigger('focus');
  });
  $(document).on('click', function(e){
    if($('#appMenu').prop('hidden')) return;
    var $target = $(e.target);
    if($target.closest('#appMenuButton').length) return;
    // clic sur une action (bouton) : on ferme ; clic sur un interrupteur ou dans le vide du menu : on laisse ouvert
    if($target.closest('#appMenu button.sact').length || !$target.closest('#appMenu').length) setAppMenuOpen(false);
  });
  $(document).on('keydown', function(e){
    if(e.key === 'Escape' && !$('#appMenu').prop('hidden')){
      setAppMenuOpen(false);
      $('#appMenuButton').trigger('focus');
    }
  });
}

if(APP_MODE === 'control'){
  document.addEventListener('click', function(){ autoFullscreenOnGesture(false); }, true);
  if(fsSupported() && fsTouchDevice()){
    $('#autoFullscreenRow').prop('hidden', false);
    $('#autoFullscreenCheckbox').prop('checked', fsPreferred()).on('change', function(){
      var on = $(this).is(':checked');
      try { localStorage.setItem(FS_PREF_KEY, on ? '1' : '0'); } catch(e){}
      if(on){
        fsAttempted = false;
        if(lastBuzzState && lastBuzzState.game && lastBuzzState.game.hasScenario && !fsActive()){ fsAttempted = true; fsEnter(); }
      } else {
        var exit = document.exitFullscreen || document.webkitExitFullscreen;
        if(exit && fsActive()){ try { Promise.resolve(exit.call(document)).catch(function(){}); } catch(e){} }
      }
    });
  }
}

$( "#closeGameButton" ).on( "click", function(){
  confirmAction('Clôturer la partie ? Le classement final sera enregistré dans l\'historique et affiché sur le display, puis les équipes seront effacées.', function(){
    if(buzzSocket) buzzSocket.emit('close-game');
  });
});

// Musique des telephones : coupure globale ou par equipe (boutons reconstruits seulement si la liste change).
var lastPhoneMuteSig = null;
function renderPhoneMute(state){
  var muted = state.phoneMutedTeams || [];
  $('#phoneMuteAllCheckbox').prop('checked', !!state.phoneMuteAll);
  var teams = state.teams || [];
  var sig = JSON.stringify([teams, muted, !!state.phoneMuteAll]);
  if(sig === lastPhoneMuteSig) return;
  lastPhoneMuteSig = sig;
  var $box = $('#phoneMuteTeams').empty();
  teams.forEach(function(name){
    var isMuted = muted.indexOf(name) !== -1;
    $('<button type="button" class="sact phoneMuteTeam"></button>')
      .attr('data-team', name).attr('aria-pressed', String(isMuted)).prop('disabled', !!state.phoneMuteAll)
      .text((isMuted ? '🔇 ' : '🔊 ') + name).appendTo($box);
  });
}
$('#phoneMuteAllCheckbox').on('change', function(){
  if(buzzSocket) buzzSocket.emit('set-phone-mute', { muted: $(this).is(':checked') });
});
$(document).on('click', '.phoneMuteTeam', function(e){
  e.stopPropagation(); // garde le menu ouvert
  var muted = $(this).attr('aria-pressed') !== 'true';
  if(buzzSocket) buzzSocket.emit('set-phone-mute', { team: $(this).attr('data-team'), muted: muted });
});

$( "#rehearsalModeCheckbox" ).on( "change", function(){
  var enabled = $(this).is(':checked');
  if(buzzSocket) buzzSocket.emit('set-rehearsal-mode', enabled);
  showToast(enabled ? 'Mode répétition activé : rien ne sera enregistré.' : 'Mode répétition désactivé.', enabled ? 'info' : 'success');
});
$( "#prevQuestionButton" ).on( "click", function(){ if(buzzSocket && APP_MODE === 'control') buzzSocket.emit('prev-question'); });
$( "#nextQuestionButton" ).on( "click", function(){ if(buzzSocket && APP_MODE === 'control') buzzSocket.emit('next-question'); });
$( "#startEpreuveButton" ).on( "click", function(){ if(buzzSocket && APP_MODE === 'control') buzzSocket.emit('start-epreuve'); });

// ---- Gerer les epreuves ----
let currentEpreuveId = null;
let currentEpreuves = [];
let currentQuestionId = null; // null = nouvelle question ; sinon id de la question en cours d'edition

function loadEpreuves(){
  return fetch(BUZZ_SERVER_URL + '/api/epreuves').then(function(r){ return r.json(); }).then(function(list){
    currentEpreuves = list;
    renderEpreuvesList();
    return list;
  });
}

// Icone visuelle associee a la categorie d'une epreuve, reutilisee dans la
// liste de gestion et dans le menu de choix des epreuves.
var CATEGORY_ICONS = { cinema: '🎬', musique: '🎵', culture_g: '🧠', culture_e: '🌍' };
function categoryIcon(category){
  return CATEGORY_ICONS[category] || '🎬';
}

function renderEpreuvesList(){
  var $list = $('#epreuvesList');
  $list.html('');
  var query = ($('#epreuveSearchInput').val() || '').trim().toLowerCase();
  var filtered = query
    ? currentEpreuves.filter(function(e){ return e.name.toLowerCase().indexOf(query) !== -1; })
    : currentEpreuves;
  if(!filtered.length){
    $list.append('<p class="text-muted small">Aucune épreuve ne correspond à « ' + query + ' ».</p>');
    return;
  }
  filtered.forEach(function(e){
    var timerLabel = e.timer_enabled ? (', ⏱' + e.timer_seconds + 's') : '';
    var questionCount = e.questions ? e.questions.length : 0;
    var $row = $('<div class="epreuveRow' + (e.id === currentEpreuveId ? ' active' : '') + '">' + categoryIcon(e.category) + ' ' + e.name + ' <span class="text-muted">(' + questionCount + ' question' + (questionCount !== 1 ? 's' : '') + ', ' + e.response_type + ', ' + e.default_points + ' pts' + timerLabel + ')</span></div>');
    $row.on('click', function(){ selectEpreuve(e.id); });
    $list.append($row);
  });
}

// Filtre en direct pendant la frappe (bibliotheque d'epreuves potentiellement
// longue avec le temps).
$( "#epreuveSearchInput" ).on( "input", function(){
  renderEpreuvesList();
});

function selectEpreuve(id){
  currentEpreuveId = id;
  var epreuve = currentEpreuves.find(function(e){ return e.id === id; });
  if(!epreuve) return;
  $('#epreuveForm').prop('hidden', false);
  $('#epreuveNameInput').val(epreuve.name);
  $('#epreuveResponseTypeInput').val(epreuve.response_type);
  $('#epreuveDefaultPointsInput').val(epreuve.default_points);
  var validCategory = CATEGORY_ICONS.hasOwnProperty(epreuve.category) ? epreuve.category : 'cinema';
  $('input[name=epreuveCategoryRadio]').prop('checked', false);
  $('input[name=epreuveCategoryRadio][value="' + validCategory + '"]').prop('checked', true);
  $('#epreuveTimerEnabledInput').prop('checked', !!epreuve.timer_enabled);
  $('#epreuveTimerSecondsInput').val(epreuve.timer_seconds || 30);
  $('#epreuveTimerSecondsBlock').prop('hidden', !epreuve.timer_enabled);
  $('#epreuveHostNoteInput').val(epreuve.host_note || '');
  $('#qcmOptionsBlock').prop('hidden', epreuve.response_type !== 'qcm');
  resetQuestionForm();
  renderQuestionsList(epreuve);
  renderEpreuvesList();
}

$( "#epreuveResponseTypeInput" ).on( "change", function(){
  $('#qcmOptionsBlock').prop('hidden', $(this).val() !== 'qcm');
});

$( "#epreuveTimerEnabledInput" ).on( "change", function(){
  $('#epreuveTimerSecondsBlock').prop('hidden', !$(this).is(':checked'));
});

$( "#newEpreuveButton" ).on( "click", function(){
  currentEpreuveId = null;
  $('#epreuveForm').prop('hidden', false);
  $('#epreuveNameInput').val('');
  $('#epreuveResponseTypeInput').val('buzzer');
  $('#epreuveDefaultPointsInput').val(10);
  $('input[name=epreuveCategoryRadio]').prop('checked', false);
  $('#epreuveCategoryCinema').prop('checked', true);
  $('#epreuveTimerEnabledInput').prop('checked', false);
  $('#epreuveTimerSecondsInput').val(30);
  $('#epreuveTimerSecondsBlock').prop('hidden', true);
  $('#epreuveHostNoteInput').val('');
  $('#qcmOptionsBlock').prop('hidden', true);
  $('#questionsList').html('<p class="text-muted">Enregistrez d\'abord l\'épreuve pour lui ajouter des questions.</p>');
  $('#questionForm').hide();
  renderEpreuvesList();
});

$( "#saveEpreuveButton" ).on( "click", function(){
  var payload = {
    name: $('#epreuveNameInput').val().trim(),
    response_type: $('#epreuveResponseTypeInput').val(),
    category: $('input[name=epreuveCategoryRadio]:checked').val() || 'cinema',
    default_points: parseInt($('#epreuveDefaultPointsInput').val(), 10) || 10,
    timer_enabled: $('#epreuveTimerEnabledInput').is(':checked'),
    timer_seconds: parseInt($('#epreuveTimerSecondsInput').val(), 10) || 30,
    host_note: $('#epreuveHostNoteInput').val().trim()
  };
  if(!payload.name){ showToast('Nom requis.', 'error'); return; }
  var request = currentEpreuveId
    ? fetch(BUZZ_SERVER_URL + '/api/epreuves/' + currentEpreuveId, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) })
    : fetch(BUZZ_SERVER_URL + '/api/epreuves', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  request.then(function(r){ return r.json(); }).then(function(res){
    if(res.id) currentEpreuveId = res.id;
    loadEpreuves().then(function(){ selectEpreuve(currentEpreuveId); });
    loadScenariosList();
  });
});

$( "#deleteEpreuveButton" ).on( "click", function(){
  if(!currentEpreuveId) return;
  confirmAction('Supprimer cette épreuve et toutes ses questions ?', function(){
    fetch(BUZZ_SERVER_URL + '/api/epreuves/' + currentEpreuveId, { method: 'DELETE' }).then(function(){
      currentEpreuveId = null;
      $('#epreuveForm').prop('hidden', true);
      loadEpreuves();
      loadScenariosList();
    });
  });
});

function renderQuestionsList(epreuve){
  var $list = $('#questionsList');
  $list.html('');
  epreuve.questions.forEach(function(q, i){
    var label = q.text ? q.text.slice(0, 40)
      : (q.audio_path ? '🎵 ' + q.audio_path.split('/').pop()
      : (q.video_path ? '🎬 ' + q.video_path.split('/').pop()
      : (q.images.length ? '🖼 ' + q.images.length + ' image(s)' : 'Question ' + (i + 1))));
    var $row = $('<div class="questionRow" draggable="true"' + (q.id === currentQuestionId ? ' style="background: rgba(0,140,149,0.15);"' : '') + '></div>').attr('data-question-id', q.id);
    $row.append('<span class="dragHandle" title="Glisser pour reordonner">⠿</span>');
    $row.append('<span>' + (i + 1) + '. ' + label + (q.host_note ? ' 📝' : '') + '</span>');
    $row.append($('<button type="button" class="btn btn-sm btn-outline-primary">✎</button>').on('click', function(){ editQuestion(q); }));
    $row.append($('<button type="button" class="btn btn-sm btn-outline-secondary">↑</button>').on('click', function(){ moveQuestion(q.id, 'up'); }));
    $row.append($('<button type="button" class="btn btn-sm btn-outline-secondary">↓</button>').on('click', function(){ moveQuestion(q.id, 'down'); }));
    $row.append($('<button type="button" class="btn btn-sm btn-outline-danger">✗</button>').on('click', function(){ deleteQuestion(q.id); }));
    $list.append($row);
  });
  $('#questionForm').show();
}

// Glisser-deposer pour reordonner les questions d'une epreuve (en plus des
// fleches monter/descendre) : reorganise localement puis envoie l'ordre final
// en un seul appel (voir /api/epreuves/:id/questions/reorder), plutot que de
// simuler une suite d'echanges avec le voisin comme le ferait /move.
var draggedQuestionId = null;
$('#questionsList')
  .on('dragstart', '.questionRow', function(){
    draggedQuestionId = parseInt($(this).attr('data-question-id'), 10);
    $(this).addClass('dragging');
  })
  .on('dragend', '.questionRow', function(){
    $(this).removeClass('dragging');
    $('#questionsList .questionRow').removeClass('dragOver');
  })
  .on('dragover', '.questionRow', function(e){
    e.preventDefault();
    $(this).addClass('dragOver');
  })
  .on('dragleave', '.questionRow', function(){
    $(this).removeClass('dragOver');
  })
  .on('drop', '.questionRow', function(e){
    e.preventDefault();
    var targetId = parseInt($(this).attr('data-question-id'), 10);
    if(draggedQuestionId === null || draggedQuestionId === targetId) return;
    var epreuve = currentEpreuves.find(function(ep){ return ep.id === currentEpreuveId; });
    if(!epreuve) return;
    var ids = epreuve.questions.map(function(q){ return q.id; });
    var fromIndex = ids.indexOf(draggedQuestionId);
    var toIndex = ids.indexOf(targetId);
    if(fromIndex === -1 || toIndex === -1) return;
    var moved = ids.splice(fromIndex, 1)[0];
    ids.splice(toIndex, 0, moved);
    draggedQuestionId = null;
    fetch(BUZZ_SERVER_URL + '/api/epreuves/' + currentEpreuveId + '/questions/reorder', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ orderedIds: ids })
    }).then(function(){ loadEpreuves().then(function(){ selectEpreuve(currentEpreuveId); }); });
  });

// Remet le formulaire de question en mode "nouvelle question" (utilise apres
// ajout, apres annulation d'une edition, ou en changeant d'epreuve).
function resetQuestionForm(){
  currentQuestionId = null;
  $('#questionFormTitle').text('Nouvelle question');
  $('#questionTextInput').val('');
  $('#questionImagesInput').val('');
  $('#questionAudioInput').val('');
  $('#questionVideoInput').val('');
  $('#questionImagesPreview').text('');
  $('#questionAudioCurrent').text('');
  $('#questionVideoCurrent').text('');
  $('#qcmOptionsInput').val('');
  $('#qcmCorrectIndexInput').val('');
  $('#questionHostNoteInput').val('');
  $('#questionHintInput').val('');
  $('#saveQuestionButton').text('Ajouter la question');
  $('#cancelEditQuestionButton').prop('hidden', true);
}

// Charge une question existante dans le formulaire pour correction (texte,
// options QCM, note animateur) ou remplacement d'un media ; les medias non
// touches sont conserves tels quels (voir saveQuestionButton plus bas).
function editQuestion(q){
  currentQuestionId = q.id;
  $('#questionFormTitle').text('Modifier la question');
  $('#questionTextInput').val(q.text || '');
  $('#questionImagesInput').val('');
  $('#questionAudioInput').val('');
  $('#questionVideoInput').val('');
  $('#questionImagesPreview').text(q.images.length ? q.images.length + ' image(s) actuelle(s) conservee(s) si aucun nouveau fichier choisi' : '');
  $('#questionAudioCurrent').text(q.audio_path ? 'Actuel : ' + q.audio_path.split('/').pop() : '');
  $('#questionVideoCurrent').text(q.video_path ? 'Actuel : ' + q.video_path.split('/').pop() : '');
  $('#qcmOptionsInput').val(q.qcm_options ? q.qcm_options.join('\n') : '');
  $('#qcmCorrectIndexInput').val(q.qcm_correct_index != null ? q.qcm_correct_index : '');
  $('#questionHostNoteInput').val(q.host_note || '');
  $('#questionHintInput').val(q.hint || '');
  $('#saveQuestionButton').text('Enregistrer les modifications');
  $('#cancelEditQuestionButton').prop('hidden', false);
  renderQuestionsList(currentEpreuves.find(function(e){ return e.id === currentEpreuveId; }));
}

$( "#cancelEditQuestionButton" ).on( "click", function(){
  var epreuve = currentEpreuves.find(function(e){ return e.id === currentEpreuveId; });
  resetQuestionForm();
  if(epreuve) renderQuestionsList(epreuve);
});

function moveQuestion(id, direction){
  fetch(BUZZ_SERVER_URL + '/api/questions/' + id + '/move', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ direction: direction }) })
    .then(function(){ loadEpreuves().then(function(){ selectEpreuve(currentEpreuveId); }); });
}
function deleteQuestion(id){
  confirmAction('Supprimer cette question ?', function(){
    fetch(BUZZ_SERVER_URL + '/api/questions/' + id, { method: 'DELETE' })
      .then(function(){ loadEpreuves().then(function(){ selectEpreuve(currentEpreuveId); }); });
  });
}

function uploadFile(file){
  var formData = new FormData();
  formData.append('file', file);
  return fetch(BUZZ_SERVER_URL + '/api/upload', { method: 'POST', body: formData })
    .then(function(r){ return r.json(); }).then(function(res){ return res.url; });
}

$( "#saveQuestionButton" ).on( "click", function(){
  if(!currentEpreuveId){ showToast('Enregistrez d\'abord l\'épreuve.', 'error'); return; }
  var text = $('#questionTextInput').val().trim();
  var imageFiles = $('#questionImagesInput')[0].files;
  var audioFile = $('#questionAudioInput')[0].files[0];
  var videoFile = $('#questionVideoInput')[0].files[0];
  var epreuve = currentEpreuves.find(function(e){ return e.id === currentEpreuveId; });
  var isQcm = epreuve && epreuve.response_type === 'qcm';
  // En edition, une question deja existante fournit les valeurs de repli pour
  // les medias non touches (aucun nouveau fichier choisi = on garde l'actuel).
  var existing = currentQuestionId ? epreuve.questions.find(function(q){ return q.id === currentQuestionId; }) : null;

  Promise.all([
    imageFiles.length ? Promise.all(Array.from(imageFiles).map(uploadFile)) : Promise.resolve(existing ? existing.images : []),
    audioFile ? uploadFile(audioFile) : Promise.resolve(existing ? existing.audio_path : null),
    videoFile ? uploadFile(videoFile) : Promise.resolve(existing ? existing.video_path : null)
  ]).then(function(results){
    var payload = { text: text, images: results[0], audio_path: results[1], video_path: results[2], host_note: $('#questionHostNoteInput').val().trim(), hint: $('#questionHintInput').val().trim() };
    if(isQcm){
      payload.qcm_options = $('#qcmOptionsInput').val().split('\n').map(function(s){ return s.trim(); }).filter(Boolean);
      payload.qcm_correct_index = parseInt($('#qcmCorrectIndexInput').val(), 10);
    }
    return currentQuestionId
      ? fetch(BUZZ_SERVER_URL + '/api/questions/' + currentQuestionId, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) })
      : fetch(BUZZ_SERVER_URL + '/api/epreuves/' + currentEpreuveId + '/questions', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  }).then(function(){
    resetQuestionForm();
    loadEpreuves().then(function(){ selectEpreuve(currentEpreuveId); });
  });
});

$( "#manageEpreuvesButton" ).on( "click", function(){
  loadEpreuves();
  $('#manageEpreuvesModal').modal('show');
});

// ---- Message libre sur le display (texte/image/video/compte a rebours) ----
$( "#openDisplayMessageModalButton" ).on( "click", function(){
  $('#displayMessageModal').modal('show');
});

$( "#showDisplayMessageButton" ).on( "click", function(){
  if(!buzzSocket) return;
  var imageFile = $('#displayMessageImageInput')[0].files[0];
  var videoFile = $('#displayMessageVideoInput')[0].files[0];
  Promise.all([
    imageFile ? uploadFile(imageFile) : Promise.resolve(null),
    videoFile ? uploadFile(videoFile) : Promise.resolve(null)
  ]).then(function(results){
    buzzSocket.emit('show-display-message', {
      text: $('#displayMessageTextInput').val(),
      imageUrl: results[0],
      videoUrl: results[1],
      countdownSeconds: parseInt($('#displayMessageCountdownInput').val(), 10) || null
    });
    $('#displayMessageModal').modal('hide');
  });
});

$( "#clearDisplayMessageButton" ).on( "click", function(){
  if(buzzSocket) buzzSocket.emit('hide-display-message');
  $('#displayMessageModal').modal('hide');
});

// ---- Historique des parties ----
function loadGameHistory(){
  fetch(BUZZ_SERVER_URL + '/api/games').then(function(r){ return r.json(); }).then(function(games){
    var $list = $('#gameHistoryList');
    $list.html('');
    if(!games.length){
      $list.append('<p class="text-muted">Aucune partie terminée pour le moment.</p>');
    }
    games.forEach(function(g){
      var date = new Date(g.ended_at).toLocaleString('fr-FR');
      var $row = $('<div class="gameHistoryRow"></div>');
      var teamsHtml = g.teams.map(function(t, i){ return (i + 1) + '. ' + t.team_name + ' (' + t.score + ' pts)'; }).join(' — ');
      var shareUrl = BUZZ_SERVER_URL + '/result.html?token=' + g.share_token;
      $row.html(
        '<h6>' + date + '</h6>' +
        '<div class="gameHistoryTeams">' + (teamsHtml || 'Aucune équipe') + '</div>' +
        '<div class="text-muted small">Épreuves : ' + (g.epreuves_played.join(', ') || 'aucune') + '</div>'
      );
      var $copyBtn = $('<button type="button" class="btn btn-sm btn-outline-secondary mt-2 me-2">Copier le lien de résultat</button>').on('click', function(){
        copyTextToClipboard(shareUrl).then(function(){
          $copyBtn.text('Copié !');
          setTimeout(function(){ $copyBtn.text('Copier le lien de résultat'); }, 1500);
        }).catch(function(){ showToast('Impossible de copier le lien.', 'error'); });
      });
      var $deleteBtn = $('<button type="button" class="btn btn-sm btn-outline-danger mt-2">Supprimer</button>').on('click', function(){
        confirmAction('Supprimer cette partie du ' + date + ' de l\'historique ? Cette action est irréversible.', function(){
          fetch(BUZZ_SERVER_URL + '/api/games/' + g.id, { method: 'DELETE' }).then(function(){ loadGameHistory(); });
        });
      });
      $row.append($copyBtn).append($deleteBtn);
      $list.append($row);
    });
  });
}

$( "#openGameHistoryModalButton" ).on( "click", function(){
  loadGameHistory();
  $('#gameHistoryModal').modal('show');
});

// ---- Gerer les scenarios ----
let currentScenarioId = null;
let currentScenarios = [];
let chosenEpreuvesForScenario = [];

function loadScenariosForModal(){
  return fetch(BUZZ_SERVER_URL + '/api/scenarios').then(function(r){ return r.json(); }).then(function(list){
    currentScenarios = list;
    renderScenariosList();
  });
}

function renderScenariosList(){
  var $list = $('#scenariosList');
  $list.html('');
  currentScenarios.forEach(function(s){
    var $row = $('<div class="epreuveRow' + (s.id === currentScenarioId ? ' active' : '') + '">' + s.name + ' <span class="text-muted">(' + s.epreuves.length + ' épreuves)</span></div>');
    $row.on('click', function(){ selectScenario(s.id); });
    $list.append($row);
  });
}

// Reglages par defaut du vote de l'epreuve suivante, propres au scenario
// (voir normalizeVoteSettings cote serveur).
function fillScenarioVoteForm(settings){
  settings = settings || {};
  $('#scenarioVoteAutoInput').prop('checked', !!settings.auto);
  $('#scenarioVoteCountInput').val(String(settings.count || 0));
  $('#scenarioVoteDurationInput').val(typeof settings.duration === 'number' ? settings.duration : 30);
  $('#scenarioVoteLiveInput').prop('checked', !!settings.live);
  $('#scenarioVoteAutoLaunchInput').prop('checked', !!settings.autoLaunch);
}

function readScenarioVoteForm(){
  return {
    auto: $('#scenarioVoteAutoInput').is(':checked'),
    count: parseInt($('#scenarioVoteCountInput').val(), 10) || 0,
    duration: Math.max(0, parseInt($('#scenarioVoteDurationInput').val(), 10) || 0),
    live: $('#scenarioVoteLiveInput').is(':checked'),
    autoLaunch: $('#scenarioVoteAutoLaunchInput').is(':checked')
  };
}

function selectScenario(id){
  currentScenarioId = id;
  var scenario = currentScenarios.find(function(s){ return s.id === id; });
  if(!scenario) return;
  $('#scenarioForm').prop('hidden', false);
  $('#scenarioNameInput').val(scenario.name);
  $('#scenarioShowMenuOnDisplayInput').prop('checked', scenario.show_menu_on_display !== 0);
  fillScenarioVoteForm(scenario.vote_settings);
  chosenEpreuvesForScenario = scenario.epreuves.map(function(se){
    return { epreuve_id: se.epreuve_id, name: se.epreuve_name, response_type_override: se.response_type_override, default_points_override: se.default_points_override };
  });
  renderScenarioEpreuvesLists();
  renderScenariosList();
}

$( "#newScenarioButton" ).on( "click", function(){
  currentScenarioId = null;
  $('#scenarioForm').prop('hidden', false);
  $('#scenarioNameInput').val('');
  $('#scenarioShowMenuOnDisplayInput').prop('checked', true);
  fillScenarioVoteForm(null);
  chosenEpreuvesForScenario = [];
  renderScenarioEpreuvesLists();
  renderScenariosList();
});

// Detail utile pour choisir une epreuve en connaissance de cause (point 1) :
// nombre de questions, type de reponse par defaut, points par defaut.
function epreuveDetailsLabel(epreuveId, typeOverride, pointsOverride){
  var epreuve = currentEpreuves.find(function(e){ return e.id === epreuveId; });
  if(!epreuve) return '';
  var questionCount = epreuve.questions ? epreuve.questions.length : 0;
  var type = typeOverride || epreuve.response_type;
  var points = (typeof pointsOverride === 'number' && pointsOverride) ? pointsOverride : epreuve.default_points;
  return questionCount + ' question' + (questionCount !== 1 ? 's' : '') + ' · ' + type + ' · ' + points + ' pts';
}

// Descriptif pour l'animateur (host_note de l'epreuve) : utile pour choisir en
// connaissance de cause quel type d'epreuve on ajoute a un scenario.
function epreuveHostNoteLine(epreuveId){
  var epreuve = currentEpreuves.find(function(e){ return e.id === epreuveId; });
  if(!epreuve || !epreuve.host_note) return '';
  return '<div class="text-muted small fst-italic">📋 ' + epreuve.host_note + '</div>';
}

function renderScenarioEpreuvesLists(){
  var $available = $('#availableEpreuvesList');
  $available.html('');
  var chosenIds = chosenEpreuvesForScenario.map(function(e){ return e.epreuve_id; });
  currentEpreuves.forEach(function(e){
    if(chosenIds.indexOf(e.id) !== -1) return;
    var $row = $('<div class="questionRow"><span>' + categoryIcon(e.category) + ' ' + e.name + ' <span class="text-muted small">(' + epreuveDetailsLabel(e.id) + ')</span>' + epreuveHostNoteLine(e.id) + '</span></div>');
    $row.append($('<button type="button" class="btn btn-sm btn-outline-primary">Ajouter →</button>').on('click', function(){
      chosenEpreuvesForScenario.push({ epreuve_id: e.id, name: e.name, response_type_override: null, default_points_override: null });
      renderScenarioEpreuvesLists();
    }));
    $available.append($row);
  });

  var $chosen = $('#chosenEpreuvesList');
  $chosen.html('');
  chosenEpreuvesForScenario.forEach(function(e, i){
    var $row = $('<div class="questionRow" draggable="true"></div>').attr('data-index', i);
    $row.append('<span class="dragHandle" title="Glisser pour reordonner">⠿</span>');
    $row.append('<span>' + (i + 1) + '. ' + e.name + ' <span class="text-muted small">(' + epreuveDetailsLabel(e.epreuve_id, e.response_type_override, e.default_points_override) + ')</span>' + epreuveHostNoteLine(e.epreuve_id) + '</span>');
    $row.append($('<button type="button" class="btn btn-sm btn-outline-secondary">↑</button>').on('click', function(){
      if(i > 0){ var tmp = chosenEpreuvesForScenario[i-1]; chosenEpreuvesForScenario[i-1] = chosenEpreuvesForScenario[i]; chosenEpreuvesForScenario[i] = tmp; renderScenarioEpreuvesLists(); }
    }));
    $row.append($('<button type="button" class="btn btn-sm btn-outline-secondary">↓</button>').on('click', function(){
      if(i < chosenEpreuvesForScenario.length - 1){ var tmp = chosenEpreuvesForScenario[i+1]; chosenEpreuvesForScenario[i+1] = chosenEpreuvesForScenario[i]; chosenEpreuvesForScenario[i] = tmp; renderScenarioEpreuvesLists(); }
    }));
    $row.append($('<button type="button" class="btn btn-sm btn-outline-danger">Retirer</button>').on('click', function(){
      chosenEpreuvesForScenario.splice(i, 1); renderScenarioEpreuvesLists();
    }));
    $chosen.append($row);
  });
}

// Glisser-deposer pour reordonner les epreuves choisies d'un scenario (en
// plus des fleches monter/descendre, gardees pour l'accessibilite/le tactile).
// Delegue sur le conteneur (les lignes sont recreees a chaque rendu) : pas
// besoin de re-attacher ces ecouteurs a chaque appel de renderScenarioEpreuvesLists.
var draggedEpreuveIndex = null;
$('#chosenEpreuvesList')
  .on('dragstart', '.questionRow', function(e){
    draggedEpreuveIndex = parseInt($(this).attr('data-index'), 10);
    $(this).addClass('dragging');
    e.originalEvent.dataTransfer.effectAllowed = 'move';
  })
  .on('dragend', '.questionRow', function(){
    $(this).removeClass('dragging');
    $('#chosenEpreuvesList .questionRow').removeClass('dragOver');
  })
  .on('dragover', '.questionRow', function(e){
    e.preventDefault(); // necessaire pour autoriser le drop
    $(this).addClass('dragOver');
  })
  .on('dragleave', '.questionRow', function(){
    $(this).removeClass('dragOver');
  })
  .on('drop', '.questionRow', function(e){
    e.preventDefault();
    var targetIndex = parseInt($(this).attr('data-index'), 10);
    if(draggedEpreuveIndex === null || draggedEpreuveIndex === targetIndex) return;
    var moved = chosenEpreuvesForScenario.splice(draggedEpreuveIndex, 1)[0];
    chosenEpreuvesForScenario.splice(targetIndex, 0, moved);
    draggedEpreuveIndex = null;
    renderScenarioEpreuvesLists();
  });

$( "#saveScenarioButton" ).on( "click", function(){
  var name = $('#scenarioNameInput').val().trim();
  if(!name){ showToast('Nom requis.', 'error'); return; }
  var payload = { name: name, show_menu_on_display: $('#scenarioShowMenuOnDisplayInput').is(':checked'), vote_settings: readScenarioVoteForm(), epreuves: chosenEpreuvesForScenario.map(function(e){
    return { epreuve_id: e.epreuve_id, response_type_override: e.response_type_override, default_points_override: e.default_points_override };
  }) };
  var request = currentScenarioId
    ? fetch(BUZZ_SERVER_URL + '/api/scenarios/' + currentScenarioId, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) })
    : fetch(BUZZ_SERVER_URL + '/api/scenarios', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  request.then(function(r){ return r.json(); }).then(function(res){
    if(res.id) currentScenarioId = res.id;
    loadScenariosForModal();
    loadScenariosList();
  });
});

$( "#deleteScenarioButton" ).on( "click", function(){
  if(!currentScenarioId) return;
  confirmAction('Supprimer ce scénario ?', function(){
    fetch(BUZZ_SERVER_URL + '/api/scenarios/' + currentScenarioId, { method: 'DELETE' }).then(function(){
      currentScenarioId = null;
      $('#scenarioForm').prop('hidden', true);
      loadScenariosForModal();
      loadScenariosList();
    });
  });
});

$( "#manageScenariosButton" ).on( "click", function(){
  Promise.all([loadEpreuves(), loadScenariosForModal()]).then(function(){
    $('#manageScenariosModal').modal('show');
  });
});

$( "#openHelpModalButton" ).on( "click", function(){
  $('#helpModal').modal('show');
});

// Porte d'entree mot de passe de l'ecran gestionnaire (voir index.html, qui
// l'affiche/masque immediatement au chargement selon localStorage). La
// verification passe par le serveur (POST /api/login) : le mot de passe n'est
// jamais present en clair dans le JS servi au navigateur. Le serveur limite
// aussi les tentatives (429 avec retryAfterSeconds au-dela de 5 echecs).
var MANAGER_SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12h : tient toute une soiree sans redemander, sans rester ouvert indefiniment
function attemptManagerLogin(){
  var password = $('#managerLoginPasswordInput').val();
  fetch(BUZZ_SERVER_URL + '/api/login', {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ password: password })
  }).then(function(r){
    return r.json().then(function(data){ return { status: r.status, data: data }; });
  }).then(function(result){
    if(result.status === 200){
      localStorage.setItem('managerAuthenticatedUntil', String(Date.now() + MANAGER_SESSION_DURATION_MS));
      $('#managerLoginGate').prop('hidden', true);
      $('#managerLoginError').prop('hidden', true);
      $('#managerLoginPasswordInput').val('');
    } else if(result.status === 429){
      var minutes = Math.ceil((result.data.retryAfterSeconds || 0) / 60);
      $('#managerLoginError').text('Trop de tentatives, réessayez dans ' + minutes + ' minute' + (minutes !== 1 ? 's' : '') + '.').prop('hidden', false);
    } else {
      $('#managerLoginError').text('Mot de passe incorrect.').prop('hidden', false);
    }
  }).catch(function(){
    showToast('Impossible de contacter le serveur.', 'error');
  });
}
if(APP_MODE === 'control'){
  $( "#managerLoginSubmitButton" ).on( "click", attemptManagerLogin );
  $( "#managerLoginPasswordInput" ).on( "keydown", function(e){
    if(e.key === 'Enter') attemptManagerLogin();
  });
}

$( "#managerLogoutButton" ).on( "click", function(){
  localStorage.removeItem('managerAuthenticatedUntil');
  location.reload();
});

$( "#openChangePasswordModalButton" ).on( "click", function(){
  $('#currentPasswordInput, #newPasswordInput, #confirmNewPasswordInput').val('');
  $('#changePasswordError').prop('hidden', true);
  $('#changePasswordModal').modal('show');
});

$( "#changePasswordSubmitButton" ).on( "click", function(){
  var currentPassword = $('#currentPasswordInput').val();
  var newPassword = $('#newPasswordInput').val();
  var confirmNewPassword = $('#confirmNewPasswordInput').val();
  var $error = $('#changePasswordError');
  if(newPassword.length < 4){
    $error.text('Le nouveau mot de passe doit faire au moins 4 caractères.').prop('hidden', false);
    return;
  }
  if(newPassword !== confirmNewPassword){
    $error.text('Les deux mots de passe ne correspondent pas.').prop('hidden', false);
    return;
  }
  fetch(BUZZ_SERVER_URL + '/api/change-password', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ currentPassword: currentPassword, newPassword: newPassword })
  }).then(function(r){
    return r.json().then(function(data){ return { status: r.status, data: data }; });
  }).then(function(result){
    if(result.status === 200){
      $('#changePasswordModal').modal('hide');
      showToast('Mot de passe changé avec succès.', 'success');
    } else if(result.status === 429){
      var minutes = Math.ceil((result.data.retryAfterSeconds || 0) / 60);
      $error.text('Trop de tentatives, réessayez dans ' + minutes + ' minute' + (minutes !== 1 ? 's' : '') + '.').prop('hidden', false);
    } else if(result.status === 401){
      $error.text('Mot de passe actuel incorrect.').prop('hidden', false);
    } else {
      $error.text('Mot de passe trop court.').prop('hidden', false);
    }
  }).catch(function(){
    showToast('Impossible de contacter le serveur.', 'error');
  });
});

// ---- Raccourcis clavier (gestionnaire uniquement) ----
// Plus rapide que la souris en plein direct pour les actions les plus
// frequentes du buzzer et de la navigation entre questions. Desactives des
// qu'un champ de saisie a le focus (pour ne pas interferer avec la frappe
// dans un formulaire), et quand une modale Bootstrap est ouverte (pour ne pas
// declencher une action de jeu en arriere-plan pendant l'edition d'une
// epreuve/d'un scenario).
$(document).on('keydown', function(e){
  if(APP_MODE !== 'control') return;
  var tag = (document.activeElement && document.activeElement.tagName) || '';
  if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (document.activeElement && document.activeElement.isContentEditable)) return;
  if($('.modal.show').length) return;
  switch(e.key){
    case ' ':
      e.preventDefault(); // evite de faire defiler la page
      $('#openBuzzButton').trigger('click');
      break;
    case 'l': case 'L':
      $('#lockAllButton').trigger('click');
      break;
    case 'u': case 'U':
      $('#unlockAllButton').trigger('click');
      break;
    case 'r': case 'R':
      $('#unlockRemainingButton').trigger('click');
      break;
    case 'ArrowRight':
      $('#nextQuestionButton').trigger('click');
      break;
    case '?':
      $('#helpModal').modal('show');
      break;
    case 'ArrowLeft':
      $('#prevQuestionButton').trigger('click');
      break;
    default:
      return;
  }
});
