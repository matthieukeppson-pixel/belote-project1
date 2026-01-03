/* eslint-disable no-unused-vars */
// ============================================
// HANDLERS — BELOTE ENGINE (V1)
// handleTableIdle implémenté
// autres handlers : squelettes volontaires
// ============================================

import { STATES } from "./beloteEngine";

// ============================================
// TABLE_IDLE
// ============================================

export function handleTableIdle(game, event) {
  // On ne réagit qu'à l'événement attendu
  if (!event || event.type !== "TABLE_READY") {
    return game;
  }

  // Sécurité : on démarre uniquement à 4 joueurs
  if (!Array.isArray(game.players) || game.players.length !== 4) {
    return game;
  }

  const dealerIndex = 0;
  const currentPlayerIndex = (dealerIndex + 1) % 4;

  return {
    ...game,
    state: STATES.DISTRIBUTION_3,

    dealerIndex,
    currentPlayerIndex,

    // Réinitialisation de la manche
    deck: [],
    hands: {},
    atout: null,
    preneur: null,
    pli: [],

    score: game.score ?? {
      equipeA: 0,
      equipeB: 0
    }
  };
}

// ============================================
// DISTRIBUTION (3 / 2 / 3)
// ============================================

export function handleDistribution(game, event, count) {
  // Logique à implémenter étape suivante
  return game;
}

// ============================================
// ANNONCE DE L’ATOUT
// ============================================

export function handleAnnonce(game, event) {
  // Logique à implémenter plus tard
  return game;
}

// ============================================
// JEU DES PLIS
// ============================================

export function handlePli(game, event) {
  // Logique à implémenter plus tard
  return game;
}

// ============================================
// FIN DE MANCHE
// ============================================

export function handleFinDeManche(game, event) {
  // Logique à implémenter plus tard
  return game;
}




