import { STATES } from "./beloteEngine";

// ============================================
// CARTES
// ============================================

const SUITS = ["hearts", "diamonds", "clubs", "spades"];
const VALUES = ["7", "8", "9", "J", "Q", "K", "10", "A"];

function cardKey(card) {
  return `${card.suit}:${card.value}`;
}

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
    atoutPropose: null,
    atoutChoisi: false,
    preneur: null,
    pli: [],
    couleurDemandee: null,
    annonceIndex: 0
  };
}

// ============================================
// DISTRIBUTION
// ============================================

export function handleDistribution(game, event, count) {
  if (!event || event.type !== "DISTRIBUTE_CARDS") return game;

  let deck = game.deck.length === 0 ? shuffle(createDeck()) : [...game.deck];

  const hands = { ...game.hands };
  for (const player of game.players) {
    if (!hands[player]) hands[player] = [];
  }

  if (game.state === STATES.DISTRIBUTION_3_FINAL) {
    const preneurId = game.players[game.preneur];
    let index = (game.dealerIndex + 1) % 4;

    for (let i = 0; i < game.players.length; i++) {
      const playerId = game.players[index];
      const giveCount = playerId === preneurId ? 2 : 3;

      for (let k = 0; k < giveCount; k++) {
        hands[playerId] = [...hands[playerId], deck.shift()];
      }
      index = (index + 1) % 4;
    }

    if (game.atoutPropose) {
      hands[preneurId] = [...hands[preneurId], game.atoutPropose];
    }

    return {
      ...game,
      state: STATES.PLI_EN_COURS,
      deck,
      hands,
      pli: [],
      couleurDemandee: null,
      atoutPropose: null,
      annonceIndex: 0
      // ⚠️ currentPlayerIndex volontairement NON touché
    };
  }

  let index = (game.dealerIndex + 1) % 4;
  for (let r = 0; r < count; r++) {
    for (let i = 0; i < game.players.length; i++) {
      const playerId = game.players[index];
      hands[playerId] = [...hands[playerId], deck.shift()];
      index = (index + 1) % 4;
    }
  }

  if (game.state === STATES.DISTRIBUTION_3) {
    return { ...game, state: STATES.DISTRIBUTION_2, deck, hands };
  }

  if (game.state === STATES.DISTRIBUTION_2) {
    return {
      ...game,
      state: STATES.ANNOUNCE_ATOUT_TOUR_1,
      deck,
      hands,
      atoutPropose: deck.shift(),
      annonceIndex: 0 // ✅ choix A : le tour d'annonce démarre ici
    };
  }

  return game;
}

// ============================================
// ANNONCE ATOUT — CORRECTION N°1 OK + FIN D'ANNONCE (CORRECTION N°2)
// ============================================

export function handleAnnonce(game, event) {
  if (!event) return game;

  const playersCount = game.players.length;
  const startIndex = (game.dealerIndex + 1) % playersCount;
  const nextPlayerIndex = (game.currentPlayerIndex + 1) % playersCount;

  const annonceIndex = typeof game.annonceIndex === "number" ? game.annonceIndex : 0;
  const nextAnnonceIndex = annonceIndex + 1;

  // =========================
  // PASS
  // =========================
  if (event.type === "PASS") {
    // Fin de tour : tout le monde a eu la parole
    if (nextAnnonceIndex >= playersCount) {
      // Fin Tour 1 -> Tour 2
      if (game.state === STATES.ANNOUNCE_ATOUT_TOUR_1) {
        return {
          ...game,
          state: STATES.ANNOUNCE_ATOUT_TOUR_2,
          currentPlayerIndex: startIndex,
          annonceIndex: 0
        };
      }

      // Fin Tour 2 -> Redistribution complète
      if (game.state === STATES.ANNOUNCE_ATOUT_TOUR_2) {
        return {
          ...game,
          state: STATES.DISTRIBUTION_3,
          deck: [],
          hands: {},
          atout: null,
          atoutPropose: null,
          preneur: null,
          atoutChoisi: false,
          pli: [],
          couleurDemandee: null,
          annonceIndex: 0
        };
      }
    }

    // Tour continue
    return {
      ...game,
      currentPlayerIndex: nextPlayerIndex,
      annonceIndex: nextAnnonceIndex
    };
  }

  // =========================
  // TAKE ATOUT (tour 1 / tour 2)
  // =========================
  if (event.type === "TAKE_ATOUT") {
    const preneurIndex = game.currentPlayerIndex;
    const premierJoueurPli = (preneurIndex + 1) % playersCount; // ✅ correction n°1 conservée

    // Tour 2: l'UI doit fournir la couleur choisie, différente de la retournée
    if (game.state === STATES.ANNOUNCE_ATOUT_TOUR_2) {
      if (!event.suit) return game;
      if (event.suit === game.atoutPropose?.suit) return game;
    }

    const ng = {
      ...game,
      atout: game.state === STATES.ANNOUNCE_ATOUT_TOUR_2 ? event.suit : game.atoutPropose.suit,
      atoutChoisi: true,
      preneur: preneurIndex,
      state: STATES.DISTRIBUTION_3_FINAL,
      annonceIndex: 0
    };

    const afterDistribution = handleDistribution(ng, { type: "DISTRIBUTE_CARDS" }, 3);

    return {
      ...afterDistribution,
      currentPlayerIndex: premierJoueurPli,
      annonceIndex: 0
    };
  }

  return game;
}

// ============================================
// PLI
// ============================================

export function handlePli(game, event) {
  if (!event || event.type !== "PLAY_CARD") return game;
  const playersCount = game.players.length;

  const playerId = game.players[game.currentPlayerIndex];
  if (game.pli.some(p => p.playerId === playerId)) return game;

  const hand = game.hands[playerId];
  const idx = hand.findIndex(c => cardKey(c) === event.cardKey);
  if (idx === -1) return game;

  const newHand = [...hand];
  const [playedCard] = newHand.splice(idx, 1);

  const couleurDemandee = game.pli.length === 0 ? playedCard.suit : game.couleurDemandee;

  const newPli = [...game.pli, { playerId, card: playedCard }];
  const isComplete = newPli.length === game.players.length;

  return {
    ...game,
    hands: { ...game.hands, [playerId]: newHand },
    pli: newPli,
    couleurDemandee,
    currentPlayerIndex: (game.currentPlayerIndex + 1) % playersCount,
    state: isComplete ? STATES.FIN_DE_MANCHE : STATES.PLI_EN_COURS
  };
}

// ============================================
// FIN DE MANCHE
// ============================================

export function handleFinDeManche(game) {
  return {
    ...game,
    state: STATES.TABLE_IDLE,
    deck: [],
    hands: {},
    pli: [],
    atout: null,
    atoutPropose: null,
    preneur: null,
    atoutChoisi: false,
    annonceIndex: 0
  };
}










