// Languages (PT/EN) + user preferences persisted in the browser (localStorage)
const STORAGE_KEY = 'pitfall3d-settings';

const STRINGS = {
  pt: {
    'hud.score': 'PONTOS',
    'hud.time': 'TEMPO',
    'hud.lives': 'VIDAS',
    'hud.screen': 'TELA',
    'hud.treasures': 'TESOUROS',
    'hud.highScore': '🏆 RECORDE',
    'vine.grabbed': 'AGARRADO AO CIPÓ! [ESPAÇO/CLIQUE] PARA SOLTAR',
    'menu.subtitle': 'EDIÇÃO EM PRIMEIRA PESSOA (VOXEL RETRO)',
    'menu.rulesTitle': '★ CONTROLES ORIGINAIS DO ATARI 2600 ★',
    'menu.moveKeys': '[↑] / [↓] touch:',
    'menu.moveVal': 'Andar para FRENTE / TRÁS',
    'menu.actionKeys': '[ESPAÇO] / clique / botão circular:',
    'menu.actionVal': 'PULAR ou SOLTAR O CIPÓ',
    'menu.vineK': 'CIPÓ:',
    'menu.vineV': 'Pule para alcançar o cipó alto! Pressione [ESPAÇO] para soltar e cruzar abismos e crocodilos!',
    'menu.crocK': 'CROCODILOS:',
    'menu.crocV': 'Só pise nas costas quando a boca estiver FECHADA!',
    'menu.logsK': 'TRONCOS:',
    'menu.logsV': 'Pule sobre eles para não tropeçar; se cair de cara, pressione uma direção ou o botão de pulo para levantar!',
    'menu.tunnelK': 'SUBTERRÂNEO:',
    'menu.tunnelV': 'Entre a pé nos buracos com escada para descer pelo túnel contínuo! Buracos sem escada despencam direto. [ESPAÇO] sob a escada volta à superfície! Cuidado com o escorpião nos túneis sem escada!',
    'menu.treasuresK': 'TESOUROS:',
    'menu.treasuresV': 'Colete barras de ouro, prata, diamantes e sacos de dinheiro!',
    'menu.time': 'Você tem 20 minutos para explorar a selva e pontuar o máximo!',
    'menu.start': '▶ INICIAR EXPEDIÇÃO',
    'menu.options': '⚙ OPÇÕES',
    'menu.highScore': 'RECORDE:',
    'menu.optionsTitle': 'OPÇÕES',
    'menu.back': '◀ VOLTAR',
    'opt.language': 'IDIOMA / LANGUAGE',
    'opt.soundOn': 'SOM: LIGADO',
    'opt.soundOff': 'SOM: DESLIGADO',
    'opt.soundTitle': 'Alternar Som',
    'opt.crtOn': 'CRT: ON',
    'opt.crtOff': 'CRT: OFF',
    'opt.crtTitle': 'Alternar Filtro CRT',
    'opt.fullscreenOn': 'TELA CHEIA: ON',
    'opt.fullscreenOff': 'TELA CHEIA: OFF',
    'opt.fullscreenTitle': 'Alternar tela cheia (ideal no Xbox/Edge)',
    'opt.touchOn': 'TOUCH: ON',
    'opt.touchOff': 'TOUCH: OFF',
    'opt.touchTitle': 'Mostrar ou ocultar controles touch',
    'opt.helpOn': 'AJUDA NA TELA: LIGADA',
    'opt.helpOff': 'AJUDA NA TELA: DESLIGADA',
    'opt.helpTitle': 'Exibir ou ocultar mensagens de ajuda',
    'over.title': 'FIM DE JOGO',
    'over.defaultReason': 'Você perdeu todas as vidas na selva!',
    'over.score': 'PONTUAÇÃO FINAL:',
    'over.screens': 'TELAS PERCORRIDAS:',
    'over.treasures': 'TESOUROS RESGATADOS:',
    'over.highScore': 'RECORDE:',
    'over.newRecord': '★ NOVO RECORDE! ★',
    'over.retry': '🔄 TENTAR NOVAMENTE',
    'over.menu': '🏠 MENU INICIAL',
    'touch.fwd': 'Andar para frente',
    'touch.bwd': 'Andar para trás',
    'touch.act': 'Pular ou soltar o cipó',
    'touch.turn': 'Mudar o sentido da corrida',
    'hint.tripped': '💥 VOCÊ CAIU DE CARA! PRESSIONE UMA DIREÇÃO OU PULE PARA LEVANTAR',
    'hint.eyeSafe': '🐊 SOBRE AS COSTAS: 100% SEGURO! (A BOCA NÃO TE PEGA)',
    'hint.snout': '🐊 NO FOCINHO: AVANCE PARA AS COSTAS PARA FICAR SEGURO!',
    'hint.mouthOpen': '⚠️ BOCA ABERTA: NÃO PISE NO FOCINHO! PULE DIRETO NAS COSTAS!',
    'hint.mouthClosed': '🐊 BOCA FECHADA! PULE NAS COSTAS DO JACARÉ!',
    'hint.zipClosing': '🟢 FECHANDO DAS BORDAS PARA O MEIO: ACOMPANHE A ONDA!',
    'hint.zipOpening': '⚠️ AREIA ABRINDO EM ONDA! AGUARDE FECHAR!',
    'hint.zipOpen': '⚠️ AREIA MOVEDIÇA ABERTA! LONGA DEMAIS PARA PULAR - AGUARDE!',
    'hint.zipClosed': '⏳ AREIA MOVEDIÇA FECHADA: CORRA AGORA!',
    'hint.scorpion': '🦂 ESCORPIÃO VENENOSO À FRENTE! PULE PARA SUPERAR!',
    'hint.fallingLog': '🪵 TRONCOS CAINDO À FRENTE! ATENÇÃO À SINALIZAÇÃO NO CHÃO!',
    'death.lifeLost': 'Você perdeu uma vida!',
    'death.timeUp': 'Tempo esgotado!',
    'death.crocBite': 'O jacaré abriu a boca e mordeu você! (Fique sobre as COSTAS para ficar seguro)',
    'death.crocMouth': 'Mordido pela boca aberta do jacaré! (Fique sobre as COSTAS para ficar seguro)',
    'death.quicksand': 'A areia movediça se abriu sob seus pés!',
    'death.abyss': 'Você afundou no abismo / areia movediça!',
    'death.fire': 'Queimado pela fogueira!',
    'death.spikes': 'Espetado nos espinhos do poço!',
    'death.cave': 'Esmagado contra o teto da caverna!',
    'death.scorpion': 'Picado por um escorpião venenoso!',
    'death.snake': 'Mordido por uma cascavel!',
  },
  en: {
    'hud.score': 'SCORE',
    'hud.time': 'TIME',
    'hud.lives': 'LIVES',
    'hud.screen': 'SCREEN',
    'hud.treasures': 'TREASURES',
    'vine.grabbed': 'GRABBING THE VINE! [SPACE/CLICK] TO LET GO',
    'menu.subtitle': 'FIRST-PERSON EDITION (RETRO VOXEL)',
    'menu.rulesTitle': '★ ORIGINAL ATARI 2600 CONTROLS ★',
    'menu.moveKeys': '[↑] / [↓] or touch:',
    'menu.moveVal': 'Walk FORWARD / BACKWARD',
    'menu.actionKeys': '[SPACE] / click / round button:',
    'menu.actionVal': 'JUMP or LET GO OF THE VINE',
    'menu.vineK': 'VINE:',
    'menu.vineV': 'Jump to reach the high vine! Press [SPACE] to let go and cross pits and crocodiles!',
    'menu.crocK': 'CROCODILES:',
    'menu.crocV': 'Only step on their backs while the mouth is CLOSED!',
    'menu.logsK': 'LOGS:',
    'menu.logsV': 'Jump over them to avoid tripping; if you fall flat, press a direction or the jump button to get up!',
    'menu.tunnelK': 'UNDERGROUND:',
    'menu.tunnelV': 'Walk into ladder holes to go down into the endless tunnel! Holes without a ladder drop straight in. [SPACE] under the ladder climbs back up! Beware the scorpion in ladder-free tunnels!',
    'menu.treasuresK': 'TREASURES:',
    'menu.treasuresV': 'Collect gold bars, silver, diamonds and money bags!',
    'menu.time': 'You have 20 minutes to explore the jungle and score as much as possible!',
    'menu.start': '▶ START EXPEDITION',
    'menu.options': '⚙ OPTIONS',
    'menu.highScore': 'HIGH SCORE:',
    'menu.optionsTitle': 'OPTIONS',
    'menu.back': '◀ BACK',
    'opt.language': 'IDIOMA / LANGUAGE',
    'opt.soundOn': 'SOUND: ON',
    'opt.soundOff': 'SOUND: OFF',
    'opt.soundTitle': 'Toggle Sound',
    'opt.crtOn': 'CRT: ON',
    'opt.crtOff': 'CRT: OFF',
    'opt.crtTitle': 'Toggle CRT Filter',
    'opt.fullscreenOn': 'FULLSCREEN: ON',
    'opt.fullscreenOff': 'FULLSCREEN: OFF',
    'opt.fullscreenTitle': 'Toggle fullscreen (handy on Xbox/Edge)',
    'opt.touchOn': 'TOUCH: ON',
    'opt.touchOff': 'TOUCH: OFF',
    'opt.touchTitle': 'Show or hide touch controls',
    'opt.helpOn': 'ON-SCREEN HELP: ON',
    'opt.helpOff': 'ON-SCREEN HELP: OFF',
    'opt.helpTitle': 'Show or hide help messages',
    'over.title': 'GAME OVER',
    'over.defaultReason': 'You lost all your lives in the jungle!',
    'over.score': 'FINAL SCORE:',
    'over.screens': 'SCREENS CLEARED:',
    'over.treasures': 'TREASURES RESCUED:',
    'over.highScore': 'HIGH SCORE:',
    'over.newRecord': '★ NEW HIGH SCORE! ★',
    'over.retry': '🔄 TRY AGAIN',
    'over.menu': '🏠 MAIN MENU',
    'touch.fwd': 'Walk forward',
    'touch.bwd': 'Walk backward',
    'touch.act': 'Jump or let go of the vine',
    'touch.turn': 'Turn around',
    'hint.tripped': '💥 FACEPLANT! PRESS A DIRECTION OR JUMP TO GET UP',
    'hint.eyeSafe': '🐊 ON THE BACK: 100% SAFE! (THE MOUTH CAN’T GET YOU)',
    'hint.snout': '🐊 ON THE SNOUT: MOVE UP TO THE BACK TO BE SAFE!',
    'hint.mouthOpen': '⚠️ MOUTH OPEN: DON’T STEP ON THE SNOUT! JUMP STRAIGHT TO THE BACK!',
    'hint.mouthClosed': '🐊 MOUTH CLOSED! JUMP ON THE BACK!',
    'hint.zipClosing': '🟢 CLOSING FROM THE EDGES TO THE MIDDLE: RIDE THE WAVE!',
    'hint.zipOpening': '⚠️ SAND OPENING IN A WAVE! WAIT FOR IT TO CLOSE!',
    'hint.zipOpen': '⚠️ QUICKSAND OPEN! TOO LONG TO JUMP - WAIT!',
    'hint.zipClosed': '⏳ QUICKSAND CLOSED: RUN NOW!',
    'hint.scorpion': '🦂 VENOMOUS SCORPION AHEAD! JUMP OVER IT!',
    'hint.fallingLog': '🪵 FALLING LOGS AHEAD! WATCH THE GROUND MARKINGS!',
    'death.lifeLost': 'You lost a life!',
    'death.timeUp': 'Time’s up!',
    'death.crocBite': 'The crocodile snapped its mouth and bit you! (Stay on the BACK to be safe)',
    'death.crocMouth': 'Bitten by the open crocodile mouth! (Stay on the BACK to be safe)',
    'death.quicksand': 'The quicksand opened under your feet!',
    'death.abyss': 'You sank into the abyss / quicksand!',
    'death.fire': 'Burned by the campfire!',
    'death.spikes': 'Impaled on the pit spikes!',
    'death.cave': 'Smashed onto the cave ceiling!',
    'death.scorpion': 'Stung by a venomous scorpion!',
    'death.snake': 'Bitten by a rattlesnake!',
  },
};

let lang = 'pt';
let showHelp = false;
let highScore = 0;

try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const saved = JSON.parse(raw);
    if (saved.lang === 'pt' || saved.lang === 'en') lang = saved.lang;
    if (typeof saved.showHelp === 'boolean') showHelp = saved.showHelp;
    if (Number.isFinite(saved.highScore) && saved.highScore > 0) highScore = Math.floor(saved.highScore);
  }
} catch {
  // localStorage unavailable: fall back to defaults
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lang, showHelp, highScore }));
  } catch {
    // Silently ignore storage errors (private mode, quota exceeded, etc.)
  }
}

export function t(key) {
  return STRINGS[lang][key] ?? STRINGS.pt[key] ?? key;
}

export function getLanguage() {
  return lang;
}

export function setLanguage(next) {
  if (next !== 'pt' && next !== 'en') return;
  lang = next;
  persist();
  applyStaticTexts();
  document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
}

export function getShowHelp() {
  return showHelp;
}

export function setShowHelp(next) {
  showHelp = !!next;
  persist();
}

export function getHighScore() {
  return highScore;
}

// Records the score; returns true if it's a new high score
export function submitScore(score) {
  const value = Math.floor(score);
  if (value > highScore) {
    highScore = value;
    persist();
    return true;
  }
  return false;
}

// Applies data-i18n (text), data-i18n-aria (aria-label) and data-i18n-title (title)
export function applyStaticTexts() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
  });
}
