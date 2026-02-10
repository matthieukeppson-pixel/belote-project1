// ============================================
// BELOTE ENGINE — MACHINE À ÉTATS (V1)
// ============================================

import {
  handleTableIdle,
  handleDistribution,
  handleAnnonce,
  handlePli,
  handleFinDeManche,
  handleAnnounceAllPassed   // 👈 AJOUT ICI
} from "./handlers";


// ============================================
// ÉTATS DU JEU
// ============================================

export const STATES = {
  TABLE_IDLE: "TABLE_IDLE",

  DISTRIBUTION_3: "DISTRIBUTION_3",
  DISTRIBUTION_2: "DISTRIBUTION_2",
  DISTRIBUTION_3_FINAL: "DISTRIBUTION_3_FINAL",

  ANNOUNCE_ATOUT_TOUR_1: "ANNOUNCE_ATOUT_TOUR_1",
  ANNOUNCE_ATOUT_TOUR_2: "ANNOUNCE_ATOUT_TOUR_2",
ANNOUNCE_ALL_PASSED: "ANNOUNCE_ALL_PASSED",

  PLI_EN_COURS: "PLI_EN_COURS",
  PLI_TERMINE: "PLI_TERMINE",   // 🆕 NOUVEL ÉTAT
  FIN_DE_MANCHE: "FIN_DE_MANCHE"
};

// ============================================
// GATE GLOBAL — ACTIONS AUTORISÉES PAR ÉTAT
// ============================================

const ALLOWED_EVENTS_BY_STATE = {
  [STATES.TABLE_IDLE]: ["TABLE_READY"],

  [STATES.DISTRIBUTION_3]: ["DISTRIBUTE_CARDS"],
  [STATES.DISTRIBUTION_2]: ["DISTRIBUTE_CARDS"],
  [STATES.DISTRIBUTION_3_FINAL]: ["DISTRIBUTE_CARDS"],

  [STATES.ANNOUNCE_ATOUT_TOUR_1]: ["TAKE_ATOUT", "PASS"],
  [STATES.ANNOUNCE_ATOUT_TOUR_2]: ["TAKE_ATOUT", "PASS"],
  [STATES.ANNOUNCE_ALL_PASSED]: ["AUTO"], // 👈 AJOUT ICI
  [STATES.PLI_EN_COURS]: ["PLAY_CARD"],

  [STATES.PLI_TERMINE]: ["NEXT_PLI"],  // 🆕 NETTOYAGE DU PLI

  [STATES.FIN_DE_MANCHE]: []
};

// ============================================
// ÉTAT INITIAL
// ============================================

export function createInitialGameState() {
  return {
    state: STATES.TABLE_IDLE,

    players: [],
    hands: {},
    deck: [],

    // 🔹 ÉQUIPES (RÈGLE FIGÉE)
    teams: {
      nous: ["joueur1", "joueur2"],
      eux: ["joueur3", "joueur4"]
    },

    atout: null,
    atoutPropose: null,
    atoutChoisi: false,
    preneur: null,
belote: {
  atout: null,
  joueur: null,
  annoncee: false
},

    currentPlayerIndex: 0,
    pli: [],
    winnerIndex: null,

    // 🔹 SCORE GLOBAL (sera utilisé plus tard)
    score: {
      nous: 0,
      eux: 0
    }
  };
}


// ============================================
// DISPATCH
// ============================================

export function dispatch(game, event) {
  // 🔒 GATE GLOBAL — REFUS DES ACTIONS HORS CONTEXTE
  if (!event || !event.type) return game;

  const allowed = ALLOWED_EVENTS_BY_STATE[game.state];

  if (!allowed || !allowed.includes(event.type)) {
    return game;
  }

  switch (game.state) {
    case STATES.TABLE_IDLE:
      return handleTableIdle(game, event);

    case STATES.DISTRIBUTION_3:
      return handleDistribution(game, event, 3);

    case STATES.DISTRIBUTION_2:
      return handleDistribution(game, event, 2);

    case STATES.DISTRIBUTION_3_FINAL:
      return handleDistribution(game, event, 3);

 case STATES.ANNOUNCE_ATOUT_TOUR_1:
case STATES.ANNOUNCE_ATOUT_TOUR_2:
  return handleAnnonce(game, event);

case STATES.ANNOUNCE_ALL_PASSED:          // 👈 AJOUT ICI
  return handleAnnounceAllPassed(game);  // 👈 AJOUT ICI

case STATES.PLI_EN_COURS:
case STATES.PLI_TERMINE:
  return handlePli(game, event);


    case STATES.FIN_DE_MANCHE:
      return handleFinDeManche(game, event);

    default:
      return game;
  }
}




