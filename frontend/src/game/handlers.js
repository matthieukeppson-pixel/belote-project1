import { STATES } from "./beloteEngine";

// ============================================
// CARTES
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
    plisGagnes: {}
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

  // ============================================
  // DISTRIBUTION FINALE BEL0TE (2 + retournée pour preneur, 3 pour les autres)
  // ============================================
  if (game.state === STATES.DISTRIBUTION_3_FINAL) {
    // preneur = index du joueur qui a pris (stocké comme index)
    const preneurIndex = game.preneur;
    const preneurId =
      typeof preneurIndex === "number" ? game.players[preneurIndex] : null;

    // sécurité : si preneur absent, on ne bouge pas
    if (!preneurId) return game;

    // Carte retournée (doit exister tant qu’on est en distribution finale)
    const turned = game.atoutPropose;

    // Le donneur distribue en commençant à sa droite
    let index = (game.dealerIndex + 1) % 4;

    // 3 cartes à tous sauf preneur (qui n’en reçoit que 2)
    for (let i = 0; i < game.players.length; i++) {
      const playerId = game.players[index];

      const giveCount = playerId === preneurId ? 2 : 3;

      for (let k = 0; k < giveCount; k++) {
        hands[playerId] = [...hands[playerId], deck.shift()];
      }

      index = (index + 1) % 4;
    }

    // Le preneur reçoit la carte retournée
    if (turned) {
      hands[preneurId] = [...hands[preneurId], turned];
    }

    return {
      ...game,
      state: STATES.PLI_EN_COURS,
      deck,
      hands,
      atoutPropose: null // elle a été donnée au preneur
    };
  }

  // ============================================
  // DISTRIBUTIONS CLASSIQUES (3 puis 2)
  // ============================================

  let index = (game.dealerIndex + 1) % 4;

  for (let r = 0; r < count; r++) {
    for (let i = 0; i < game.players.length; i++) {
      const playerId = game.players[index];
      hands[playerId] = [...hands[playerId], deck.shift()];
      index = (index + 1) % 4;
    }
  }

  // ---- TRANSITIONS ----

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
// ANNONCE ATTOUT
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
    // ===== TOUR 1 =====
    if (game.state === STATES.ANNOUNCE_ATOUT_TOUR_1) {
      const ng = {
        ...game,
        atout: game.atoutPropose.suit,
        atoutChoisi: true,
        preneur: game.currentPlayerIndex,
        state: STATES.DISTRIBUTION_3_FINAL
        // ⚠️ on garde atoutPropose ici, car elle doit être donnée au preneur
      };

      // 🔑 distribution finale automatique
      return handleDistribution(ng, { type: "DISTRIBUTE_CARDS" }, 3);
    }

    // ===== TOUR 2 =====
    if (game.state === STATES.ANNOUNCE_ATOUT_TOUR_2) {
      if (!event.suit) return game;
      if (event.suit === game.atoutPropose.suit) return game;

      const ng = {
        ...game,
        atout: event.suit,
        atoutChoisi: true,
        preneur: game.currentPlayerIndex,
        state: STATES.DISTRIBUTION_3_FINAL
        // ⚠️ on garde atoutPropose ici aussi
      };

      // 🔑 distribution finale automatique
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

  if (event.type === "PLAY_CARD") {
   const playerId = "joueur1";

    const hand = game.hands[playerId];

    const idx = hand.findIndex(
      (c) => c.suit === event.card.suit && c.value === event.card.value
    );
    if (idx === -1) return game;

    const newHand = [...hand];
    const [playedCard] = newHand.splice(idx, 1);

    const couleurDemandee =
      game.pli.length === 0 ? playedCard.suit : game.couleurDemandee;

    return {
      ...game,
      hands: { ...game.hands, [playerId]: newHand },
      pli: [...game.pli, { playerId, card: playedCard }],
      couleurDemandee,
      currentPlayerIndex: (game.currentPlayerIndex + 1) % 4
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
    atoutChoisi: false
  };
}














