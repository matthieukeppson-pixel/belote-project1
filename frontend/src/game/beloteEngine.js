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
  FIN_DE_MANCHE: "FIN_DE_MANCHE"
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
    atoutPropose: null,     // ✅ AJOUT
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


