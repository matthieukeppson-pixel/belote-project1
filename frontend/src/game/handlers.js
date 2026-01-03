/* eslint-disable no-unused-vars */
// ============================================
// HANDLERS — BELOTE ENGINE (V1)
// handleTableIdle + handleDistribution implémentés
// ============================================

import { STATES } from "./beloteEngine";

// ============================================
// OUTILS CARTES (logique pure)
// ============================================

const SUITS = ["hearts", "diamonds", "clubs", "spades"];
const VALUES = ["7", "8", "9", "J", "Q", "K", "10", "A"];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ suit, value });
    }
  }
  return deck;
}

function shuffle(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ============================================
// TABLE_IDLE
// ============================================

export function handleTableIdle(game, event) {
  if (!event || event.type !== "TABLE_READY") return game;
  if (!Array.isArray(game.players) || game.players.length !== 4) return game;

  const dealerIndex = 0;
  const currentPlayerIndex = (dealerIndex + 1) % 4;

  return {
    ...game,
    state: STATES.DISTRIBUTION_3,
    dealerIndex,
    currentPlayerIndex,
    deck: [],
    hands: {},
    atout: null,
    preneur: null,
    pli: [],
    score: game.score ?? { equipeA: 0, equipeB: 0 }
  };
}

// ============================================
// DISTRIBUTION (3 / 2 / 3)
// ============================================

export function handleDistribution(game, event, count) {
  // On ne réagit qu'aux entrées d'état
  if (!event || event.type !== "DISTRIBUTE_CARDS") {
    return game;
  }

  // Création + mélange du paquet uniquement si nécessaire
  let deck = game.deck.length === 0
    ? shuffle(createDeck())
    : [...game.deck];

  const hands = { ...game.hands };

  // Initialisation des mains si besoin
  for (const player of game.players) {
    if (!hands[player]) {
      hands[player] = [];
    }
  }

  // Distribution circulaire à partir du joueur à gauche du donneur
  let index = (game.dealerIndex + 1) % 4;

  for (let round = 0; round < count; round++) {
    for (let i = 0; i < game.players.length; i++) {
      const playerId = game.players[index];
      hands[playerId] = [...hands[playerId], deck.shift()];
      index = (index + 1) % 4;
    }
  }

  // Détermination de l'état suivant
  let nextState = game.state;
  if (game.state === STATES.DISTRIBUTION_3) {
    nextState = STATES.DISTRIBUTION_2;
  } else if (game.state === STATES.DISTRIBUTION_2) {
    nextState = STATES.ANNOUNCE_ATOUT_TOUR_1;
  } else if (game.state === STATES.DISTRIBUTION_3_FINAL) {
    nextState = STATES.PLI_EN_COURS;
  }

  return {
    ...game,
    state: nextState,
    deck,
    hands
  };
}

// ============================================
// ANNONCE DE L’ATOUT (squelette)
// ============================================

export function handleAnnonce(game, event) {
  return game;
}

// ============================================
// JEU DES PLIS (squelette)
// ============================================

export function handlePli(game, event) {
  return game;
}

// ============================================
// FIN DE MANCHE (squelette)
// ============================================

export function handleFinDeManche(game, event) {
  return game;
}





