import { STATES } from "./beloteEngine";
import { determineWinningCard } from "./rules/determineWinningCard";

// ============================================
// CARTES
// ============================================

const SUITS = ["hearts", "diamonds", "clubs", "spades"];
const VALUES = ["7", "8", "9", "J", "Q", "K", "10", "A"];

// 🔑 CLÉ CANONIQUE CARTE
function cardKey(card) {
  return `${card.suit}:${card.value}`;
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
    trickIndex: 1,
    atout: null,
    atoutPropose: null,
    atoutChoisi: false,
    preneur: null,
    pli: [],
    couleurDemandee: null,
    lastTrickWinner: null,
    plisGagnes: {
      A: 0,
      B: 0
    }
  };
}

// ============================================
// DISTRIBUTION
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

  if (game.state === STATES.DISTRIBUTION_3_FINAL) {
    const preneurIndex = game.preneur;
    const preneurId =
      typeof preneurIndex === "number" ? game.players[preneurIndex] : null;

    if (!preneurId) return game;

    const turned = game.atoutPropose;
    let index = (game.dealerIndex + 1) % 4;

    for (let i = 0; i < game.players.length; i++) {
      const playerId = game.players[index];
      const giveCount = playerId === preneurId ? 2 : 3;

      for (let k = 0; k < giveCount; k++) {
        hands[playerId] = [...hands[playerId], deck.shift()];
      }
      index = (index + 1) % 4;
    }

    if (turned) {
      hands[preneurId] = [...hands[preneurId], turned];
    }

    return {
      ...game,
      state: STATES.PLI_EN_COURS,
      deck,
      hands,
      pli: [],
      couleurDemandee: null,
      atoutPropose: null,
      currentPlayerIndex: (preneurIndex + 1) % 4
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
    const atoutPropose = deck.shift();
    return {
      ...game,
      state: STATES.ANNOUNCE_ATOUT_TOUR_1,
      deck,
      hands,
      atoutPropose
    };
  }

  return game;
}

// ============================================
// ANNONCE ATOUT
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
          atoutPropose: null,
          preneur: null,
          atoutChoisi: false
        };
      }
    }

    return { ...game, currentPlayerIndex: nextIndex };
  }

  if (event.type === "TAKE_ATOUT") {
    if (game.state === STATES.ANNOUNCE_ATOUT_TOUR_1) {
      const ng = {
        ...game,
        atout: game.atoutPropose.suit,
        atoutChoisi: true,
        preneur: game.currentPlayerIndex,
        state: STATES.DISTRIBUTION_3_FINAL
      };
      return handleDistribution(ng, { type: "DISTRIBUTE_CARDS" }, 3);
    }

    if (game.state === STATES.ANNOUNCE_ATOUT_TOUR_2) {
      if (!event.suit) return game;
      if (event.suit === game.atoutPropose.suit) return game;

      const ng = {
        ...game,
        atout: event.suit,
        atoutChoisi: true,
        preneur: game.currentPlayerIndex,
        state: STATES.DISTRIBUTION_3_FINAL
      };
      return handleDistribution(ng, { type: "DISTRIBUTE_CARDS" }, 3);
    }
  }

  return game;
}

// ============================================
// PLI
// ============================================

export function handlePli(game, event) {
  if (!event) return game;
  if (game.state !== STATES.PLI_EN_COURS) return game;
  if (event.type !== "PLAY_CARD") return game;

  const playerId = game.players[game.currentPlayerIndex];
  const hand = game.hands[playerId];

  if (game.pli.some(p => p.playerId === playerId)) return game;

  const idx = hand.findIndex(c => cardKey(c) === event.cardKey);
  if (idx === -1) return game;

  const newHand = [...hand];
  const [playedCard] = newHand.splice(idx, 1);

  const couleurDemandee =
    game.pli.length === 0 ? playedCard.suit : game.couleurDemandee;

  const newPli = [...game.pli, { playerId, card: playedCard }];
  const isComplete = newPli.length === game.players.length;

  // Pli non terminé
  if (!isComplete) {
    return {
      ...game,
      hands: { ...game.hands, [playerId]: newHand },
      pli: newPli,
      couleurDemandee,
      currentPlayerIndex:
        (game.currentPlayerIndex + 1) % game.players.length,
      state: STATES.PLI_EN_COURS
    };
  }

  // ============================
  // ATTRIBUTION DU PLI
  // ============================

  const winningPlay = determineWinningCard(
    newPli,
    game.atout,
    couleurDemandee
  );

  const winnerPlayerId = winningPlay.playerId;

  const team =
    winnerPlayerId === "joueur1" || winnerPlayerId === "joueur2"
      ? "A"
      : "B";

  const plisGagnes = {
    ...game.plisGagnes,
    [team]: game.plisGagnes[team] + 1
  };

  const winnerIndex = game.players.indexOf(winnerPlayerId);

  return {
    ...game,
    hands: { ...game.hands, [playerId]: newHand },
    pli: newPli,
    couleurDemandee: null,
    plisGagnes,
    lastTrickWinner: winnerPlayerId,

    // 🔒 ÉTAPE 3 — compteur de pli
    trickIndex: game.trickIndex + 1,

    currentPlayerIndex: winnerIndex,
    state: STATES.PLI_EN_COURS
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
    atoutChoisi: false
  };
}

// ============================================
// UTILITAIRES INTERNES
// ============================================

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

