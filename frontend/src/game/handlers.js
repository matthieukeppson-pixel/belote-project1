import { STATES } from "./beloteEngine";

// ============================================
// CARTES
// ============================================

const SUITS = ["hearts", "diamonds", "clubs", "spades"];
const VALUES = ["7", "8", "9", "J", "Q", "K", "10", "A"];

const ATTOUT_ORDER = ["J", "9", "A", "10", "K", "Q", "8", "7"];
const NORMAL_ORDER = ["A", "10", "K", "Q", "J", "9", "8", "7"];

// 🔑 clé canonique compatible avec Table.jsx (qui upper-case)
function cardKey(card) {
  if (!card) return "";
  return `${card.suit}:${String(card.value).toUpperCase()}`;
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
// POINTS DES CARTES — BELOTE CLASSIQUE
// ============================================

const ATOUT_POINTS = {
  J: 20,
  9: 14,
  A: 11,
  10: 10,
  K: 4,
  Q: 3,
  8: 0,
  7: 0
};

const NORMAL_POINTS = {
  A: 11,
  10: 10,
  K: 4,
  Q: 3,
  J: 2,
  9: 0,
  8: 0,
  7: 0
};

export function getCardPoints(card, atoutSuit) {
  if (!card || !card.value || !card.suit) return 0;

  const value = String(card.value).toUpperCase();
  const isAtout = card.suit === atoutSuit;

  if (isAtout) {
    return ATOUT_POINTS[value] ?? 0;
  }

  return NORMAL_POINTS[value] ?? 0;
}
// ============================================
// POINTS D’UN PLI — SOMME DES CARTES
// ============================================

export function getPliPoints(pli, atoutSuit) {
  if (!Array.isArray(pli) || pli.length === 0) return 0;

  return pli.reduce((total, play) => {
    if (!play || !play.card) return total;

    return total + getCardPoints(play.card, atoutSuit);
  }, 0);
}

// ============================================
// GAGNANT DU PLI (V1) — atout + couleur demandée
// ============================================

function rankValue(value, isAtout) {
  const v = String(value).toUpperCase();
  const order = isAtout ? ATTOUT_ORDER : NORMAL_ORDER;
  return order.indexOf(v);
}

function getPliWinner(pli, couleurDemandee, atoutSuit) {
  // sécurités
  const valid = Array.isArray(pli) ? pli.filter(p => p && p.card) : [];
  if (valid.length === 0) return null;

  const atouts = atoutSuit
    ? valid.filter(p => p.card.suit === atoutSuit)
    : [];

  const pool = atouts.length > 0
    ? atouts.map(p => ({ ...p, _isAtout: true }))
    : valid
        .filter(p => p.card.suit === couleurDemandee)
        .map(p => ({ ...p, _isAtout: false }));

  if (pool.length === 0) {
    // fallback si couleurDemandee incohérente
    return valid[0].playerId;
  }

  let best = pool[0];
  for (const p of pool.slice(1)) {
    const pr = rankValue(p.card.value, p._isAtout);
    const br = rankValue(best.card.value, best._isAtout);
    // plus petit index = plus fort
    if (pr !== -1 && br !== -1 && pr < br) best = p;
  }
  return best.playerId;
}

// ============================================
// TABLE_IDLE
// ============================================

export function handleTableIdle(game, event) {
  if (!event || event.type !== "TABLE_READY") return game;

  const dealerIndex = 0;
  const currentPlayerIndex = (dealerIndex + 1) % 4; // joueur à gauche du donneur

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
    winnerIndex: null,

    // 🔹 score temporaire de la manche
    scoreManche: {
      nous: 0,
      eux: 0
    }
  };
}


// ============================================
// DISTRIBUTION
// ============================================

export function handleDistribution(game, event, count) {
  if (!event || event.type !== "DISTRIBUTE_CARDS") return game;

  // init deck si nécessaire
  let deck =
    game.deck && game.deck.length > 0
      ? [...game.deck]
      : shuffle(createDeck());

  const hands = { ...game.hands };
  for (const player of game.players) {
    if (!hands[player]) hands[player] = [];
  }

  // ----------------------------
  // DISTRIBUTION FINALE (après preneur)
  // ----------------------------
  if (game.state === STATES.DISTRIBUTION_3_FINAL) {
    const preneurIndex = game.preneur;
    const preneurId =
      typeof preneurIndex === "number" ? game.players[preneurIndex] : null;

    if (!preneurId) return game;

    const turned = game.atoutPropose; // carte retournée
    let index = (game.dealerIndex + 1) % 4;

    for (let i = 0; i < game.players.length; i++) {
      const playerId = game.players[index];
      const giveCount = playerId === preneurId ? 2 : 3;

      for (let k = 0; k < giveCount; k++) {
        hands[playerId] = [...hands[playerId], deck.shift()];
      }
      index = (index + 1) % 4;
    }

    // le preneur prend la carte retournée
    if (turned) {
      hands[preneurId] = [...hands[preneurId], turned];
    }

    // 1er pli : joueur à gauche du preneur
    const firstTrickIndex = (preneurIndex + 1) % 4;

    return {
      ...game,
      state: STATES.PLI_EN_COURS,
      deck,
      hands,
      pli: [],
      couleurDemandee: null,
      winnerIndex: null,
      atoutPropose: null,
      currentPlayerIndex: firstTrickIndex
    };
  }

  // ----------------------------
  // DISTRIBUTIONS NORMALES (3 puis 2)
  // ----------------------------
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
      atoutPropose,
      currentPlayerIndex: (game.dealerIndex + 1) % 4
    };
  }

  return { ...game, deck, hands };
}

// ============================================
// ANNONCE ATTOUT
// ============================================

export function handleAnnonce(game, event) {
  if (!event) return game;

  const playersCount = game.players.length;
  const startIndex = (game.dealerIndex + 1) % playersCount;
  const nextIndex = (game.currentPlayerIndex + 1) % playersCount;

  // PASS
  if (event.type === "PASS") {
    // boucle complète
    if (nextIndex === startIndex) {
      if (game.state === STATES.ANNOUNCE_ATOUT_TOUR_1) {
        return {
          ...game,
          state: STATES.ANNOUNCE_ATOUT_TOUR_2,
          currentPlayerIndex: startIndex
        };
      }

      if (game.state === STATES.ANNOUNCE_ATOUT_TOUR_2) {
        // tout le monde a passé au 2e tour => on relance une donne
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
          winnerIndex: null
        };
      }
    }
    return { ...game, currentPlayerIndex: nextIndex };
  }

  // TAKE
  if (event.type === "TAKE_ATOUT") {
    // Tour 1 : prendre la couleur de la carte retournée
    if (game.state === STATES.ANNOUNCE_ATOUT_TOUR_1) {
      if (!game.atoutPropose) return game;

      const ng = {
        ...game,
        atout: game.atoutPropose.suit,
        atoutChoisi: true,
        preneur: game.currentPlayerIndex,
        state: STATES.DISTRIBUTION_3_FINAL
      };
      return handleDistribution(ng, { type: "DISTRIBUTE_CARDS" }, 3);
    }

    // Tour 2 : event.suit obligatoire, différente de la carte retournée
    if (game.state === STATES.ANNOUNCE_ATOUT_TOUR_2) {
      if (!event.suit) return game;
      if (game.atoutPropose && event.suit === game.atoutPropose.suit) return game;

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
// PLI — FIN EN 2 TEMPS
// ============================================

export function handlePli(game, event) {
  if (!event) return game;

  // 1) Jouer une carte
  if (game.state === STATES.PLI_EN_COURS && event.type === "PLAY_CARD") {
    const playerId = game.players[game.currentPlayerIndex];
    const hand = game.hands[playerId];
    if (!Array.isArray(hand)) return game;

    // sécurité : un joueur ne joue pas 2 fois dans le même pli
    if (game.pli.some(p => p.playerId === playerId)) return game;

    const idx = hand.findIndex(c => cardKey(c) === event.cardKey);
    if (idx === -1) return game;

    const newHand = [...hand];
    const [playedCard] = newHand.splice(idx, 1);

    const couleurDemandee =
      game.pli.length === 0 ? playedCard.suit : game.couleurDemandee;

    const newPli = [...game.pli, { playerId, card: playedCard }];

    // pli pas terminé
    if (newPli.length < game.players.length) {
      return {
        ...game,
        hands: { ...game.hands, [playerId]: newHand },
        pli: newPli,
        couleurDemandee,
        currentPlayerIndex: (game.currentPlayerIndex + 1) % game.players.length
      };
    }

    // pli terminé : on calcule le gagnant mais on garde les 4 cartes visibles
    const winnerId = getPliWinner(newPli, couleurDemandee, game.atout);
    const winnerIndex =
      winnerId != null ? game.players.indexOf(winnerId) : game.currentPlayerIndex;

    return {
      ...game,
      hands: { ...game.hands, [playerId]: newHand },
      pli: newPli, // ✅ 4 cartes visibles
      couleurDemandee,
      winnerIndex,
      state: STATES.PLI_TERMINE
    };
  }

  // 2) Nettoyer le pli après délai UI
  if (game.state === STATES.PLI_TERMINE && event.type === "NEXT_PLI") {
    return {
      ...game,
      pli: [],
      couleurDemandee: null,
      currentPlayerIndex: game.winnerIndex,
      winnerIndex: null,
      state: STATES.PLI_EN_COURS
    };
  }

  return game;
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
    couleurDemandee: null,
    winnerIndex: null
  };
}



