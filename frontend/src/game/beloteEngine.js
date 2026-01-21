// ============================================
// BELOTE ENGINE — MACHINE À ÉTATS (V1)
// ============================================

import {
  handleTableIdle,
  handleDistribution,
  handleAnnonce,
  handlePli,
  handleFinDeManche
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

  PLI_EN_COURS: "PLI_EN_COURS",

  // PLI V1
  PLI_TERMINE_LOGIQUE: "PLI_TERMINE_LOGIQUE",
  PLI_EN_LECTURE: "PLI_EN_LECTURE",
  PLI_RAMASSAGE: "PLI_RAMASSAGE",

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

  [STATES.PLI_EN_COURS]: ["PLAY_CARD"],

  // PLI V1 — transitions automatiques (pas d’event UI)
  [STATES.PLI_TERMINE_LOGIQUE]: [],
  [STATES.PLI_EN_LECTURE]: [],
  [STATES.PLI_RAMASSAGE]: [],

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

    atout: null,
    atoutPropose: null,
    atoutChoisi: false,
    preneur: null,

    currentPlayerIndex: 0,
    pli: [],

    score: {
      equipeA: 0,
      equipeB: 0
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
    // Action invalide pour cet état → ignorée
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

    case STATES.PLI_EN_COURS:
      return handlePli(game, event);

    case STATES.FIN_DE_MANCHE:
      return handleFinDeManche(game, event);

    default:
      return game;
  }
}




