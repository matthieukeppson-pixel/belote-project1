/* eslint-disable no-unused-vars */
// ============================================
// HANDLERS — BELOTE ENGINE (V1)
// ============================================

import { STATES } from "./beloteEngine";

// ============================================
// OUTILS CARTES (logique pure)
// ============================================

const SUITS = ["hearts", "diamonds", "clubs", "spades"];
const VALUES = ["7", "8", "9", "J", "Q", "K", "10", "A"];

const ATTOUT_ORDER = ["J", "9", "A", "10", "K", "Q", "8", "7"];
const NORMAL_ORDER = ["A", "10", "K", "Q", "J", "9", "8", "7"];

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

function cardRank(card, atout, couleurDemandee) {
  if (card.suit === atout) {
    return ATTOUT_ORDER.indexOf(card.value);
  }
  if (card.suit === couleurDemandee) {
    return NORMAL_ORDER.indexOf(card.value);
  }
  return Infinity;
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
    couleurDemandee: null,
    plisGagnes: {},
    score: game.score ?? { equipeA: 0, equipeB: 0 }
  };
}

// ============================================
// DISTRIBUTION (3 / 2 / 3)
// ============================================

export function handleDistribution(game, event, count) {
  if (!event || event.type !== "DISTRIBUTE_CARDS") return game;

  let deck =
    game.deck.length === 0
      ? shuffle(createDeck())
      : [...game.deck];

  const hands = { ...game.hands };

  for (const player of game.players) {
    if (!hands[player]) hands[player] = [];
  }

  let index = (game.dealerIndex + 1) % 4;

  for (let r = 0; r < count; r++) {
    for (let i = 0; i < game.players.length; i++) {
      const playerId = game.players[index];
      hands[playerId] = [...hands[playerId], deck.shift()];
      index = (index + 1) % 4;
    }
  }

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
// ANNONCE DE L’ATOUT
// ============================================

export function handleAnnonce(game, event) {
  if (!event) return game;

  const playersCount = game.players.length;
  const startIndex = (game.dealerIndex + 1) % playersCount;
  const nextIndex = (game.currentPlayerIndex + 1) % playersCount;

  if (event.type === "PASS") {
    if (nextIndex === startIndex) {
      if (game.state === STATES.ANNOUNCE_ATOUT_TOUR_1) {
        return {
          ...game,
          state: STATES.ANNOUNCE_ATOUT_TOUR_2,
          currentPlayerIndex: startIndex
        };
      }
      if (game.state === STATES.ANNOUNCE_ATOUT_TOUR_2) {
        return {
          ...game,
          state: STATES.DISTRIBUTION_3,
          deck: [],
          hands: {},
          atout: null,
          preneur: null
        };
      }
    }
    return { ...game, currentPlayerIndex: nextIndex };
  }

  if (event.type === "TAKE_ATOUT") {
  return {
    ...game,
    atout: event.suit,
    atoutChoisi: true,      // 👈 AJOUT ICI
    preneur: game.currentPlayerIndex,
    state: STATES.DISTRIBUTION_3_FINAL
  };
}


  return game;
}

// ============================================
// JEU DES PLIS
// ============================================

export function handlePli(game, event) {
  if (!event) return game;

  // ===============================
  // PLAY_CARD
  // ===============================
  if (event.type === "PLAY_CARD") {
    const playerId = game.players[game.currentPlayerIndex];
    const hand = game.hands[playerId];
    if (!hand) return game;

    const idx = hand.findIndex(
      (c) => c.suit === event.card.suit && c.value === event.card.value
    );
    if (idx === -1) return game;

    const newHand = [...hand];
    const [playedCard] = newHand.splice(idx, 1);

    const couleurDemandee =
      game.pli.length === 0
        ? playedCard.suit
        : game.couleurDemandee;

    const newPli = [...game.pli, { playerId, card: playedCard }];

    return {
      ...game,
      hands: { ...game.hands, [playerId]: newHand },
      pli: newPli,
      couleurDemandee,
      currentPlayerIndex:
        (game.currentPlayerIndex + 1) % game.players.length
    };
  }

  // ===============================
  // END_PLI
  // ===============================
  if (event.type === "END_PLI" && game.pli.length === 4) {
    let winner = game.pli[0];
    let bestRank = cardRank(
      winner.card,
      game.atout,
      game.couleurDemandee
    );

    for (let i = 1; i < game.pli.length; i++) {
      const entry = game.pli[i];
      const rank = cardRank(
        entry.card,
        game.atout,
        game.couleurDemandee
      );
      if (rank < bestRank) {
        bestRank = rank;
        winner = entry;
      }
    }

    const winnerIndex = game.players.indexOf(winner.playerId);

    const plisGagnes = {
      ...game.plisGagnes,
      [winner.playerId]: [
        ...(game.plisGagnes[winner.playerId] || []),
        game.pli
      ]
    };

    const allHandsEmpty = game.players.every(
      (playerId) => game.hands[playerId]?.length === 0
    );

    return {
      ...game,
      plisGagnes,
      pli: [],
      couleurDemandee: null,
      currentPlayerIndex: winnerIndex,
      state: allHandsEmpty ? STATES.FIN_DE_MANCHE : STATES.PLI_EN_COURS
    };
  }

  return game;
}

// ============================================
// FIN DE MANCHE
// ============================================

export function handleFinDeManche(game, event) {
  let plisEquipeA = 0;
  let plisEquipeB = 0;

  for (const playerId in game.plisGagnes) {
    const index = game.players.indexOf(playerId);
    const count = game.plisGagnes[playerId].length;
    if (index === 0 || index === 2) plisEquipeA += count;
    else plisEquipeB += count;
  }

  const gagnant =
    plisEquipeA === plisEquipeB
      ? null
      : plisEquipeA > plisEquipeB
        ? "equipeA"
        : "equipeB";

  const score = { ...game.score };
  if (gagnant) score[gagnant] += 1;

  return {
    ...game,
    state: STATES.TABLE_IDLE,
    score,
    deck: [],
    hands: {},
    pli: [],
    plisGagnes: {},
    couleurDemandee: null,
    atout: null,
    preneur: null
  };
}








