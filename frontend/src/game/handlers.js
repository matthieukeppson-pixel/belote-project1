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

  const atouts = atoutSuit ? valid.filter(p => p.card.suit === atoutSuit) : [];

  const pool =
    atouts.length > 0
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

  const dealerIndex =
    typeof game.dealerIndex === "number" ? game.dealerIndex : 0;

  const currentPlayerIndex =
    typeof game.currentPlayerIndex === "number"
      ? game.currentPlayerIndex
      : (dealerIndex + 1) % game.players.length;

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

    belote: {
      atout: null,
      joueur: null,
      annoncee: false
    },

    pli: [],
    couleurDemandee: null,
    winnerIndex: null,
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
    game.deck && game.deck.length > 0 ? [...game.deck] : shuffle(createDeck());

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
    const firstTrickIndex = (game.dealerIndex + 1) % game.players.length;


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

    console.log(
      "[ANNONCES] dealerIndex =",
      game.dealerIndex,
      "premier à parler =",
      game.players[(game.dealerIndex + 1) % game.players.length]
    );

    return {
      ...game,
      state: STATES.ANNOUNCE_ATOUT_TOUR_1,
      deck,
      hands,
      atoutPropose,
      currentPlayerIndex: (game.dealerIndex + 1) % game.players.length
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

  // ============================================
  // PASS
  // ============================================
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
        const nextDealerIndex = (game.dealerIndex + 1) % playersCount;

        let g = {
          ...game,
          dealerIndex: nextDealerIndex,
          currentPlayerIndex: (nextDealerIndex + 1) % playersCount
        };

        g = handleTableIdle(g, { type: "TABLE_READY" });
        g = handleDistribution(g, { type: "DISTRIBUTE_CARDS" }, 3);
        g = handleDistribution(g, { type: "DISTRIBUTE_CARDS" }, 2);

        return g;
      }
    }

    return { ...game, currentPlayerIndex: nextIndex };
  }

  // ============================================
  // TAKE
  // ============================================
  if (event.type === "TAKE_ATOUT") {
    // Tour 1
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

    // Tour 2
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






export function handlePli(game, event) {
  if (!event) return game;

  // ============================================
  // 1) Jouer une carte
  // ============================================
  if (game.state === STATES.PLI_EN_COURS && event.type === "PLAY_CARD") {
    let winnerIndex = null;
    let finDeManche = null;
    const scoreManche = game.scoreManche
      ? { ...game.scoreManche }
      : { nous: 0, eux: 0 };

    const playerId = game.players[game.currentPlayerIndex];
    const hand = game.hands[playerId];
    if (!Array.isArray(hand)) return game;

    // sécurité : un joueur ne joue pas 2 fois dans le même pli
    if (game.pli.some(p => p.playerId === playerId)) return game;

    const idx = hand.findIndex(c => cardKey(c) === event.cardKey);
    if (idx === -1) return game;

    const playedCard = hand[idx];

// ============================================
// OBLIGATIONS DE JEU
// Règle choisie : si partenaire maître -> on peut pisser (pas obligé de couper)
// ============================================
const couleurDemandeeActuelle =
  game.pli.length === 0 ? null : game.couleurDemandee;

const hasSuit = (h, suit) => h.some(c => c.suit === suit);
const hasAtout = (h, atout) => h.some(c => c.suit === atout);

// ✅ Gagnant actuel du pli (pendant le pli)
const winnerIdActuel =
  game.pli.length > 0
    ? getPliWinner(game.pli, game.couleurDemandee, game.atout)
    : null;

// ✅ partenaire maître ?
const partenaireEstMaitre =
  !!winnerIdActuel &&
  (game.teams.nous.includes(winnerIdActuel) ===
    game.teams.nous.includes(playerId));

// 1) Fournir si on a la couleur
if (
  couleurDemandeeActuelle &&
  playedCard.suit !== couleurDemandeeActuelle &&
  hasSuit(hand, couleurDemandeeActuelle)
) {
  return game;
}

// 2) Couper si pas de couleur (SAUF si partenaire maître)
if (
  couleurDemandeeActuelle &&
  playedCard.suit !== couleurDemandeeActuelle &&
  !hasSuit(hand, couleurDemandeeActuelle) &&
  playedCard.suit !== game.atout &&
  hasAtout(hand, game.atout) &&
  !partenaireEstMaitre
) {
  return game;
}

// 3) Monter à l’atout si adversaire maître
if (playedCard.suit === game.atout && game.pli.length > 0 && !partenaireEstMaitre) {
  const atoutsDansPli = game.pli.filter(p => p.card && p.card.suit === game.atout);

  if (atoutsDansPli.length > 0) {
    const meilleurAtout = atoutsDansPli.reduce((best, p) =>
      rankValue(p.card.value, true) < rankValue(best.card.value, true) ? p : best
    );

    const peutMonter = hand.some(
      c =>
        c.suit === game.atout &&
        rankValue(c.value, true) < rankValue(meilleurAtout.card.value, true)
    );

    const monteAssez =
      rankValue(playedCard.value, true) <
      rankValue(meilleurAtout.card.value, true);

    if (peutMonter && !monteAssez) return game;
  }
}


    // ============================================
    // Coup légal → on modifie l’état
    // ============================================
    const newHand = [...hand];
    newHand.splice(idx, 1);

    // détection belote (main AVANT le coup = hand)
    let belote = game.belote;
    if (
      !belote?.annoncee &&
      game.atout &&
      playedCard.suit === game.atout &&
      (playedCard.value === "K" || playedCard.value === "Q")
    ) {
      const autreValeur = playedCard.value === "K" ? "Q" : "K";
      const avaitAutre = hand.some(
        c => c.suit === game.atout && c.value === autreValeur
      );

      if (avaitAutre) {
        belote = { atout: game.atout, joueur: playerId, annoncee: true };
      }
    }

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
        belote,
        currentPlayerIndex:
          (game.currentPlayerIndex + 1) % game.players.length
      };
    }

    // ============================================
    // pli terminé : gagnant + score
    // ============================================
    const winnerId = getPliWinner(newPli, couleurDemandee, game.atout);
    winnerIndex =
      winnerId != null ? game.players.indexOf(winnerId) : game.currentPlayerIndex;

    const pliPoints = getPliPoints(newPli, game.atout);

    if (game.teams.nous.includes(winnerId)) scoreManche.nous += pliPoints;
    else if (game.teams.eux.includes(winnerId)) scoreManche.eux += pliPoints;

    // dernier pli ?
    const handsAfterPlay = { ...game.hands, [playerId]: newHand };
    const isLastPli = Object.values(handsAfterPlay).every(
      h => Array.isArray(h) && h.length === 0
    );

    if (isLastPli) {
      // dix de der
      if (game.teams.nous.includes(winnerId)) scoreManche.nous += 10;
      else if (game.teams.eux.includes(winnerId)) scoreManche.eux += 10;

      // équipe preneur
      const preneurId = game.players[game.preneur];
      const preneurEquipe = game.teams.nous.includes(preneurId) ? "nous" : "eux";
      const autreEquipe = preneurEquipe === "nous" ? "eux" : "nous";

// belote +20
if (belote?.annoncee) {
  const equipeBelote = game.teams.nous.includes(belote.joueur) ? "nous" : "eux";
  scoreManche[equipeBelote] += 20;
}

const totalManche = scoreManche.nous + scoreManche.eux;
const seuil = 82;

const pointsPreneur = scoreManche[preneurEquipe];
const chute = pointsPreneur < seuil;

if (chute) {
  scoreManche[preneurEquipe] = 0;
  scoreManche[autreEquipe] = totalManche;
}


      finDeManche = {
        chute,
        preneurEquipe,
        seuil,
        scoreFinal: { ...scoreManche }
      };
    }

    return {
      ...game,
      hands: { ...game.hands, [playerId]: newHand },
      pli: newPli,
      couleurDemandee,
      winnerIndex,
      scoreManche,
      finDeManche,
      belote,
      state: isLastPli ? STATES.FIN_DE_MANCHE : STATES.PLI_TERMINE
    };
  }

  // ============================================
  // 2) Nettoyer le pli après délai UI
  // ============================================
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
// ============================================
// ANNONCE — TOUS PASSÉS
// ============================================

export function handleAnnounceAllPassed(game) {
  const nextDealerIndex =
    (game.dealerIndex + 1) % game.players.length;

  return {
    ...game,
    state: STATES.TABLE_IDLE,
    dealerIndex: nextDealerIndex
  };
}
