import { STATES } from "./beloteEngine";

// ============================================
// CARTES
// ============================================

const SUITS = ["hearts", "diamonds", "clubs", "spades"];
const VALUES = ["7", "8", "9", "J", "Q", "K", "10", "A"];

const ATTOUT_ORDER = ["J", "9", "A", "10", "K", "Q", "8", "7"];
const NORMAL_ORDER = ["A", "10", "K", "Q", "J", "9", "8", "7"];
const SEQUENCE_ORDER = ["7", "8", "9", "10", "J", "Q", "K", "A"];

const ANNOUNCE_TYPE_STRENGTH = {
  tierce: 1,
  cinquante: 2,
  cent: 3,
  carre: 4
};

const CARRE_POINTS = {
  J: 200,
  9: 150,
  A: 100,
  "10": 100,
  K: 100,
  Q: 100
};

// 🔑 clé canonique compatible avec Table.jsx (qui upper-case)
function cardKey(card) {
  if (!card) return "";
  return `${card.suit}:${String(card.value).toUpperCase()}`;
}
function normalizeValue(value) {
  return String(value).toUpperCase();
}

function getSequenceHighRankValue(value) {
  return SEQUENCE_ORDER.indexOf(normalizeValue(value));
}

function getAnnounceStrength(a) {
  return ANNOUNCE_TYPE_STRENGTH[a?.type] || 0;
}

function _isAnnounceTrump(announce, atout) {
  if (!announce || !announce.suit) return false;
  if (atout === "SA" || atout === "TA") return false;
  return announce.suit === atout;
}
function detectCarres(hand, playerId, atout, teams) {
  const byValue = {};

  for (const card of hand || []) {
    const value = normalizeValue(card.value);
    if (!byValue[value]) byValue[value] = [];
    byValue[value].push(card);
  }

  const team = teams?.nous?.includes(playerId) ? "nous" : "eux";
  const annonces = [];

  for (const value of Object.keys(byValue)) {
    if (byValue[value].length !== 4) continue;

    const points = CARRE_POINTS[value] || 0;
    if (!points) continue;

    annonces.push({
      type: "carre",
      label: "Carré",
      points,
      highRank: value,
      highRankValue: getSequenceHighRankValue(value),
      suit: null,
      cards: byValue[value],
      playerId,
      team,
      isTrump: false
    });
  }

  return annonces;
}
function pushSequenceAnnouncement(run, annonces, suit, playerId, atout, teams) {
  if (!Array.isArray(run) || run.length < 3) return;

  const length = run.length;
  const highCard = run[run.length - 1];
  const highRank = normalizeValue(highCard.value);
  const team = teams?.nous?.includes(playerId) ? "nous" : "eux";

  let type = null;
  let points = 0;

  if (length >= 5) {
    type = "cent";
    points = 100;
  } else if (length === 4) {
    type = "cinquante";
    points = 50;
  } else if (length === 3) {
    type = "tierce";
    points = 20;
  }

  if (!type) return;

  annonces.push({
    type,
    label: type === "cent" ? "Cent" : type === "cinquante" ? "Cinquante" : "Tierce",
    points,
    highRank,
    highRankValue: getSequenceHighRankValue(highRank),
    suit,
    cards: [...run],
    playerId,
    team,
    isTrump: atout !== "SA" && atout !== "TA" && suit === atout
  });
}

function detectSequences(hand, playerId, atout, teams) {
  const bySuit = {};

  for (const card of hand || []) {
    if (!bySuit[card.suit]) bySuit[card.suit] = [];
    bySuit[card.suit].push(card);
  }

  const annonces = [];

  for (const suit of Object.keys(bySuit)) {
    const cards = [...bySuit[suit]].sort(
      (a, b) => getSequenceHighRankValue(a.value) - getSequenceHighRankValue(b.value)
    );

    if (cards.length === 0) continue;

    let run = [cards[0]];

    for (let i = 1; i < cards.length; i++) {
      const prev = getSequenceHighRankValue(cards[i - 1].value);
      const curr = getSequenceHighRankValue(cards[i].value);

      if (curr === prev + 1) {
        run.push(cards[i]);
      } else {
        pushSequenceAnnouncement(run, annonces, suit, playerId, atout, teams);
        run = [cards[i]];
      }
    }

    pushSequenceAnnouncement(run, annonces, suit, playerId, atout, teams);
  }

  return annonces;
}
function cardsOverlap(a, b) {
  const aKeys = new Set((a?.cards || []).map(cardKey));
  return (b?.cards || []).some((c) => aKeys.has(cardKey(c)));
}

function selectAnnouncementsWithoutOverlap(allAnnouncements) {
  const sorted = [...allAnnouncements].sort((a, b) => {
    const typeDiff = getAnnounceStrength(b) - getAnnounceStrength(a);
    if (typeDiff !== 0) return typeDiff;

    const pointsDiff = (b.points || 0) - (a.points || 0);
    if (pointsDiff !== 0) return pointsDiff;

    return (b.highRankValue || 0) - (a.highRankValue || 0);
  });

  const selected = [];

  for (const ann of sorted) {
    const overlaps = selected.some((s) => cardsOverlap(s, ann));
    if (!overlaps) selected.push(ann);
  }

  return selected;
}

function detectModernAnnouncementsForPlayer(hand, playerId, atout, teams) {
  const carres = detectCarres(hand, playerId, atout, teams);
  const sequences = detectSequences(hand, playerId, atout, teams);
  return selectAnnouncementsWithoutOverlap([...carres, ...sequences]);
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
function buildModernAnnouncementsState(game, hands) {
  const detectedByPlayer = {};

  for (const playerId of game.players) {
    const hand = hands?.[playerId] || [];
    detectedByPlayer[playerId] = detectModernAnnouncementsForPlayer(
      hand,
      playerId,
      game.atout,
      game.teams
    );
  }

  return {
    detectedByPlayer,
    declaredByPlayer: {},
    validated: [],
    winningTeam: null,
    resolved: false
  };
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
const SA_POINTS = {
  A: 19,
  "10": 10,
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

  // ✅ SA standard (total 152 + 10 de der = 162)
  if (atoutSuit === "SA") {
    return SA_POINTS[value] ?? 0;
  }

  // (optionnel mais propre) TA = tout atout
  if (atoutSuit === "TA") {
    return ATOUT_POINTS[value] ?? 0;
  }

  const isAtout = atoutSuit && card.suit === atoutSuit;
  return (isAtout ? ATOUT_POINTS[value] : NORMAL_POINTS[value]) ?? 0;
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
  const valid = Array.isArray(pli) ? pli.filter(p => p && p.card) : [];
  if (valid.length === 0) return null;

  // ✅ TA : tout atout => gagnant DANS la couleur demandée, avec ordre atout
  if (atoutSuit === "TA") {
    const pool = valid.filter(p => p.card.suit === couleurDemandee);
    if (pool.length === 0) return valid[0].playerId;

    let best = pool[0];
    for (const p of pool.slice(1)) {
      if (rankValue(p.card.value, true) < rankValue(best.card.value, true)) best = p;
    }
    return best.playerId;
  }

  const atouts = atoutSuit ? valid.filter(p => p.card.suit === atoutSuit) : [];

  const pool =
    atouts.length > 0
      ? atouts.map(p => ({ ...p, _isAtout: true }))
      : valid
          .filter(p => p.card.suit === couleurDemandee)
          .map(p => ({ ...p, _isAtout: false }));

  if (pool.length === 0) return valid[0].playerId;

  let best = pool[0];
  for (const p of pool.slice(1)) {
    const pr = rankValue(p.card.value, p._isAtout);
    const br = rankValue(best.card.value, best._isAtout);
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
  state: "NONE",
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
  const playersCount = game.players.length;

  const preneurIndex = game.preneur;
  const preneurId =
    typeof preneurIndex === "number" ? game.players[preneurIndex] : null;

  if (!preneurId) return game;

  let index = (game.dealerIndex + 1) % playersCount;

  // ✅ CONTRÉE : tout le monde prend 3 (5->8)
  if (game.ruleset === "contree") {
    for (let i = 0; i < playersCount; i++) {
      const playerId = game.players[index];
      for (let k = 0; k < 3; k++) {
        hands[playerId] = [...hands[playerId], deck.shift()];
      }
      index = (index + 1) % playersCount;
    }

    const firstTrickIndex = (game.dealerIndex + 1) % playersCount;

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

  // ✅ MODERNE SA/TA : on remet la carte retournée dans le deck, et tout le monde prend 3
  if (game.ruleset === "moderne" && (game.atout === "SA" || game.atout === "TA")) {
    if (game.atoutPropose) {
      deck.unshift(game.atoutPropose);
    }

    for (let i = 0; i < playersCount; i++) {
      const playerId = game.players[index];
      for (let k = 0; k < 3; k++) {
        hands[playerId] = [...hands[playerId], deck.shift()];
      }
      index = (index + 1) % playersCount;
    }

    const firstPlayerIndex = (game.dealerIndex + 1) % playersCount;
    const modernAnnouncements = buildModernAnnouncementsState(game, hands);

    return {
      ...game,
      state: STATES.ANNONCES_MODERNE,
      deck,
      hands,
      pli: [],
      couleurDemandee: null,
      winnerIndex: null,
      atoutPropose: null,
      currentPlayerIndex: firstPlayerIndex,
      modernAnnouncements
    };
  }

  // ✅ CLASSIC : 2/3 + carte retournée au preneur (NE PAS remettre dans le deck)
  const turned = game.atoutPropose;

  for (let i = 0; i < playersCount; i++) {
    const playerId = game.players[index];
    const giveCount = playerId === preneurId ? 2 : 3;

    for (let k = 0; k < giveCount; k++) {
      hands[playerId] = [...hands[playerId], deck.shift()];
    }
    index = (index + 1) % playersCount;
  }

  if (turned) {
    hands[preneurId] = [...hands[preneurId], turned];
  }

  const firstTrickIndex = (game.dealerIndex + 1) % playersCount;

  if (game.ruleset === "moderne") {
    const modernAnnouncements = buildModernAnnouncementsState(game, hands);

    return {
      ...game,
      state: STATES.ANNONCES_MODERNE,
      deck,
      hands,
      pli: [],
      couleurDemandee: null,
      winnerIndex: null,
      atoutPropose: null,
      currentPlayerIndex: firstTrickIndex,
      modernAnnouncements
    };
  }

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
let dealIndex = (game.dealerIndex + 1) % 4;

for (let r = 0; r < count; r++) {
  for (let i = 0; i < game.players.length; i++) {
    const playerId = game.players[dealIndex];
    hands[playerId] = [...hands[playerId], deck.shift()];
    dealIndex = (dealIndex + 1) % 4;
  }
}

  if (game.state === STATES.DISTRIBUTION_3) {
    return { ...game, state: STATES.DISTRIBUTION_2, deck, hands };
  }

  if (game.state === STATES.DISTRIBUTION_2) {
    if (game.ruleset === "contree") {
      return {
        ...game,
        state: STATES.ENCHERES,
        deck,
        hands,
        bids: [],
        currentBid: null,
        passes: 0,
        passesAfterBid: 0,
        atoutPropose: null,
        atout: null,
        atoutChoisi: false,
        preneur: null,
        contratValeur: null,
        contratMultiplicateur: 1,
        currentPlayerIndex: (game.dealerIndex + 1) % game.players.length
      };
    }

    const atoutPropose = deck.shift();

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
  // CONTRÉE — CONTRE / SURCONTRE (V1)
  // ============================================
  if (event.type === "CONTRE") {
    if (game.ruleset !== "contree") return game;
    if (typeof game.preneur !== "number") return game;
    if ((game.contratMultiplicateur || 1) !== 1) return game;
    return { ...game, contratMultiplicateur: 2 };
  }

  if (event.type === "SURCONTRE") {
    if (game.ruleset !== "contree") return game;
    if (typeof game.preneur !== "number") return game;
    if ((game.contratMultiplicateur || 1) !== 2) return game;
    return { ...game, contratMultiplicateur: 4 };
  }

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

      // ✅ Moderne : SA / TA possible dès le Tour 1
      const chosen =
        game.ruleset === "moderne" && (event.suit === "SA" || event.suit === "TA")
          ? event.suit
          : game.atoutPropose.suit;

      const ng = {
        ...game,
        atout: chosen,
        atoutChoisi: true,
        preneur: game.currentPlayerIndex,
        contratMultiplicateur: 1,
        belote: { atout: null, joueur: null, state: "NONE" },
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
        contratMultiplicateur: 1,
        belote: { atout: null, joueur: null, state: "NONE" },
        state: STATES.DISTRIBUTION_3_FINAL
      };

      return handleDistribution(ng, { type: "DISTRIBUTE_CARDS" }, 3);
    }
  }

  return game;
}
function gameLikeTrumpCheck(announce, atout) {
  if (!announce || !announce.suit) return false;
  if (atout === "SA" || atout === "TA") return false;
  return announce.suit === atout;
}

function compareAnnouncements(a, b, atout) {
  if (!a && !b) return 0;
  if (a && !b) return 1;
  if (!a && b) return -1;

  const typeDiff = getAnnounceStrength(a) - getAnnounceStrength(b);
  if (typeDiff !== 0) return typeDiff > 0 ? 1 : -1;

  const highDiff = (a.highRankValue || 0) - (b.highRankValue || 0);
  if (highDiff !== 0) return highDiff > 0 ? 1 : -1;

  const aTrump = a?.suit && gameLikeTrumpCheck(a, atout);
  const bTrump = b?.suit && gameLikeTrumpCheck(b, atout);

  if (aTrump !== bTrump) return aTrump ? 1 : -1;

  return 0;
}

function getBestAnnouncement(announcements, atout) {
  if (!Array.isArray(announcements) || announcements.length === 0) return null;

  return announcements.reduce((best, current) => {
    if (!best) return current;
    return compareAnnouncements(current, best, atout) > 0 ? current : best;
  }, null);
}

function sumAnnouncementPoints(announcements) {
  return (announcements || []).reduce((sum, ann) => sum + (ann.points || 0), 0);
}

export function handleModernAnnouncements(game, event) {
  if (!event || game.state !== STATES.ANNONCES_MODERNE) return game;

  if (event.type !== "PASS_ANNOUNCEMENT" && event.type !== "DECLARE_ANNOUNCEMENT") {
    return game;
  }

  const playersCount = game.players.length;
  const currentPlayerId = game.players[game.currentPlayerIndex];

  const current = game.modernAnnouncements || {
    detectedByPlayer: {},
    declaredByPlayer: {},
    validated: [],
    winningTeam: null,
    resolved: false
  };

  const declaredByPlayer = { ...current.declaredByPlayer };

  if (event.type === "PASS_ANNOUNCEMENT") {
    declaredByPlayer[currentPlayerId] = null;
  }

  if (event.type === "DECLARE_ANNOUNCEMENT") {
    const detected = current.detectedByPlayer?.[currentPlayerId] || [];

    const chosen = detected.find((a) => {
      return (
        a.type === event.announcementType &&
        a.highRank === event.highRank &&
        (a.suit || null) === (event.suit || null)
      );
    });

    if (!chosen) return game;

    declaredByPlayer[currentPlayerId] = chosen;
  }

  const everyoneAnswered = game.players.every((playerId) =>
    Object.prototype.hasOwnProperty.call(declaredByPlayer, playerId)
  );

  if (!everyoneAnswered) {
    return {
      ...game,
      currentPlayerIndex: (game.currentPlayerIndex + 1) % playersCount,
      modernAnnouncements: {
        ...current,
        declaredByPlayer
      }
    };
  }

  const nousAnnouncements = game.players
    .filter((playerId) => game.teams.nous.includes(playerId))
    .map((playerId) => declaredByPlayer[playerId])
    .filter(Boolean);

  const euxAnnouncements = game.players
    .filter((playerId) => game.teams.eux.includes(playerId))
    .map((playerId) => declaredByPlayer[playerId])
    .filter(Boolean);

  const bestNous = getBestAnnouncement(nousAnnouncements, game.atout);
  const bestEux = getBestAnnouncement(euxAnnouncements, game.atout);

  const comparison = compareAnnouncements(bestNous, bestEux, game.atout);

  let winningTeam = null;
  let validated = [];

  if (comparison > 0) {
    winningTeam = "nous";
    validated = nousAnnouncements;
  } else if (comparison < 0) {
    winningTeam = "eux";
    validated = euxAnnouncements;
  } else {
    winningTeam = null;
    validated = [];
  }

  return {
    ...game,
    state: STATES.PLI_EN_COURS,
    currentPlayerIndex: (game.dealerIndex + 1) % playersCount,
    modernAnnouncements: {
      ...current,
      declaredByPlayer,
      validated,
      winningTeam,
      resolved: true
    }
  };
}

// ✅ ICI tu gardes les nouveaux helpers
function hasSuit(hand, suit) {
  return Array.isArray(hand) && hand.some((c) => c.suit === suit);
}



function isSameTeam(game, playerA, playerB) {
  const aNous = game.teams.nous.includes(playerA);
  const bNous = game.teams.nous.includes(playerB);
  return aNous === bNous;
}

function getBestTrumpPlay(pli, atout) {
  const trumps = (pli || []).filter((p) => p?.card?.suit === atout);
  if (trumps.length === 0) return null;

  return trumps.reduce((best, play) => {
    return rankValue(play.card.value, true) < rankValue(best.card.value, true)
      ? play
      : best;
  });
}

function hasHigherTrumpThan(hand, atout, referenceCard) {
  if (!referenceCard) return false;

  return hand.some(
    (c) =>
      c.suit === atout &&
      rankValue(c.value, true) < rankValue(referenceCard.value, true)
  );
}

function isLegalPlayCurrentRules(game, playerId, hand, playedCard) {
  if (!game || !playerId || !Array.isArray(hand) || !playedCard) return false;

  if (!Array.isArray(game.pli) || game.pli.length === 0) return true;

  const couleurDemandee = game.couleurDemandee;
  const atout = game.atout;
  const ruleset = game.ruleset || "classic";
  const isSAorTA = atout === "SA" || atout === "TA";

  const winnerIdActuel = getPliWinner(game.pli, couleurDemandee, atout);
  const partenaireEstMaitre =
    !!winnerIdActuel && isSameTeam(game, winnerIdActuel, playerId);

  const hasDemandedSuit = !!couleurDemandee && hasSuit(hand, couleurDemandee);

  // 1) Fournir la couleur demandée si on l'a
  if (hasDemandedSuit) {
    if (playedCard.suit !== couleurDemandee) return false;

    // Si la couleur demandée est l'atout, on garde l'obligation de monter si possible
    if (!isSAorTA && couleurDemandee === atout && !partenaireEstMaitre) {
      const bestTrumpPlay = getBestTrumpPlay(game.pli, atout);

      if (bestTrumpPlay) {
        const canOvertrump = hasHigherTrumpThan(hand, atout, bestTrumpPlay.card);
        const doesOvertrump =
          playedCard.suit === atout &&
          rankValue(playedCard.value, true) <
            rankValue(bestTrumpPlay.card.value, true);

        if (canOvertrump && !doesOvertrump) return false;
      }
    }

    return true;
  }

  // 2) SA / TA : si on n'a pas la couleur demandée, pas de coupe forcée
  if (isSAorTA) return true;

  const hasTrump = !!atout && hasSuit(hand, atout);

  // 3) Si le partenaire est maître, on garde ta règle actuelle :
  // on peut pisser, même si on a de l'atout
  if (partenaireEstMaitre) return true;

  // 4) Si on n'a pas d'atout, on peut jouer ce qu'on veut
  if (!hasTrump) return true;

  const bestTrumpPlay = getBestTrumpPlay(game.pli, atout);
  const trumpAlreadyPlayed = !!bestTrumpPlay;

  const canOvertrump =
    !!bestTrumpPlay && hasHigherTrumpThan(hand, atout, bestTrumpPlay.card);

  const doesOvertrump =
    !!bestTrumpPlay &&
    playedCard.suit === atout &&
    rankValue(playedCard.value, true) <
      rankValue(bestTrumpPlay.card.value, true);

  // CONTRÉE
  if (ruleset === "contree") {
    // Si personne n'a encore coupé : obligation de couper
    if (!trumpAlreadyPlayed) {
      return playedCard.suit === atout;
    }

    // Si un atout est déjà au pli :
    // - si on peut surcouper, on doit surcouper
    // - sinon on peut pisser / sous-couper / jouer autre chose
    if (canOvertrump) {
      return playedCard.suit === atout && doesOvertrump;
    }

    return true;
  }

  // CLASSIQUE / MODERNE (hors SA/TA)
  // Si on a de l'atout et que le partenaire n'est pas maître,
  // on doit jouer atout
  if (playedCard.suit !== atout) return false;

  // S'il y a déjà de l'atout et qu'on peut monter, on doit monter
  if (trumpAlreadyPlayed && canOvertrump && !doesOvertrump) {
    return false;
  }

  return true;
}

// ✅ puis ton handlePli continue normalement
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

if (!isLegalPlayCurrentRules(game, playerId, hand, playedCard)) {
  return game;
}


    // ============================================
    // Coup légal → on modifie l’état
    // ============================================
    const newHand = [...hand];
    newHand.splice(idx, 1);

    // détection belote (main AVANT le coup = hand)
   let belote = game.belote || { atout: null, joueur: null, state: "NONE" };

const val = String(playedCard.value).toUpperCase();
const isAtout = game.atout && playedCard.suit === game.atout;
const isKQ = val === "K" || val === "Q";

if (isAtout && isKQ) {
  const other = val === "K" ? "Q" : "K";

  // 1) Déclenchement "BELOTE" (première des deux)
  if (belote.state === "NONE") {
    const hadOtherBeforePlay = hand.some(
      (c) => c.suit === game.atout && String(c.value).toUpperCase() === other
    );

    if (hadOtherBeforePlay) {
      belote = { atout: game.atout, joueur: playerId, state: "BELOTE" };
    }
  }

  // 2) Déclenchement "REBELOTE" (deuxième carte, même joueur)
  else if (
    belote.state === "BELOTE" &&
    belote.atout === game.atout &&
    belote.joueur === playerId
  ) {
    belote = { ...belote, state: "REBELOTE" };
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

let scoreFinal = scoreManche;

if (isLastPli) {
  // ✅ équipe preneur / défense
  const preneurId = game.players[game.preneur];
  const preneurEquipe = game.teams.nous.includes(preneurId) ? "nous" : "eux";
  const autreEquipe = preneurEquipe === "nous" ? "eux" : "nous";

  // ✅ contrat / seuil
  const contrat =
    game.ruleset === "contree"
      ? (typeof game.contratValeur === "number" ? game.contratValeur : 80)
      : 82;

  const capotAnnonce = game.ruleset === "contree" && contrat === 500;
  const capotReussi = scoreManche[autreEquipe] === 0;

  // ✅ dix de der : ne pas ajouter si capot réussi
  if (!capotReussi) {
    if (game.teams.nous.includes(winnerId)) scoreManche.nous += 10;
    else if (game.teams.eux.includes(winnerId)) scoreManche.eux += 10;
  }

  const totalPlis = scoreManche.nous + scoreManche.eux;
  const mult =
    game.ruleset === "contree" ? (game.contratMultiplicateur || 1) : 1;

  const pointsPreneur = scoreManche[preneurEquipe];
  let chute = pointsPreneur < contrat;

  // base = plis
  let final = { nous: scoreManche.nous, eux: scoreManche.eux };

  if (game.ruleset === "contree") {
   if (capotAnnonce) {
  chute = !capotReussi;

  const capotScore = contrat * mult; // ✅ 500 * (1/2/4)

  if (!chute) {
    // ✅ Capot réussi : on ajoute le 10 de der ici (car ton code actuel ne le donne pas en capot réussi)
    final[preneurEquipe] = capotScore + 10;
    final[autreEquipe] = 0;
  } else {
    // ✅ Capot chuté : la défense prend les plis (incluant déjà le 10 de der) + contrat*mult
    final[preneurEquipe] = 0;
    final[autreEquipe] = totalPlis + capotScore;
  }
}
      if (!chute) {
        final[preneurEquipe] = scoreManche[preneurEquipe] + contrat * mult;
        final[autreEquipe] = scoreManche[autreEquipe];

        const contratNormal = contrat >= 80 && contrat <= 160;
        if (contratNormal && capotReussi) {
          final[preneurEquipe] = 250 + contrat;
          final[autreEquipe] = 0;
        }
      } else {
        final[preneurEquipe] = 0;
        final[autreEquipe] = totalPlis + contrat * mult;
      }
    }
 

  scoreFinal = final;
}
// ✅ Belote/Rebelote : +20 une seule fois (quand REBELOTE est atteint)
const beloteState = belote?.state ?? game.belote?.state;
const beloteJoueur = belote?.joueur ?? game.belote?.joueur;

if (isLastPli && beloteState === "REBELOTE" && beloteJoueur) {
  const team = game.teams.nous.includes(beloteJoueur) ? "nous" : "eux";
  scoreFinal = {
    ...scoreFinal,
    [team]: (scoreFinal?.[team] ?? 0) + 20,
  };
}
if (isLastPli && game.ruleset === "moderne") {
  const validated = game.modernAnnouncements?.validated || [];
  const announcePoints = sumAnnouncementPoints(validated);
  const winningTeam = game.modernAnnouncements?.winningTeam;

  if (announcePoints > 0 && (winningTeam === "nous" || winningTeam === "eux")) {
    scoreFinal = {
      ...scoreFinal,
      [winningTeam]: (scoreFinal?.[winningTeam] ?? 0) + announcePoints,
    };
  }
}
if (isLastPli) {
  finDeManche = {
    scoreFinal, // <-- contient déjà ton 10 de der si tu l’as ajouté à scoreManche
    contratValeur: game.contratValeur ?? null,
    contratMultiplicateur: game.contratMultiplicateur || 1,
    preneur: game.preneur ?? null,
    atout: game.atout ?? null,
  };
}
return {
  ...game,
  hands: { ...game.hands, [playerId]: newHand },
  pli: newPli,
  couleurDemandee,
  winnerIndex,
  scoreManche: scoreFinal,
  finDeManche,
  belote,
  state: isLastPli ? STATES.FIN_DE_MANCHE : STATES.PLI_TERMINE
};
} // ✅ ferme le if (game.state === STATES.PLI_EN_COURS && event.type === "PLAY_CARD")

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
} // ✅ fin de handlePli

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
export function handleBidding(game, event) {
  if (!event) return game;

  const playersCount = game.players.length;
  const nextIndex = (game.currentPlayerIndex + 1) % playersCount;

  const currentBid = game.currentBid || null;          // { value, suit, playerIndex }
  const passes = game.passes || 0;                      // passes AVANT toute annonce
  const passesAfterBid = game.passesAfterBid || 0;      // passes APRÈS une annonce

  // ============================================
  // PASS
  // ============================================
  if (event.type === "PASS") {
    // ✅ S'il y a déjà une annonce : 3 passes consécutifs => fin des enchères
    if (currentBid) {
      const newPassesAfterBid = passesAfterBid + 1;

      if (newPassesAfterBid >= 3) {
        // Fin des enchères : on applique la meilleure annonce
        const ng = {
          ...game,
          atout: currentBid.suit,
          atoutChoisi: true,
          preneur: currentBid.playerIndex,
          contratValeur: currentBid.value,
         contratMultiplicateur: game.contratMultiplicateur || 1,


          // nettoyage enchères
          passes: 0,
          passesAfterBid: 0,
          currentBid: null,

          state: STATES.DISTRIBUTION_3_FINAL
        };

        return handleDistribution(ng, { type: "DISTRIBUTE_CARDS" }, 3);
      }

      return {
        ...game,
        passesAfterBid: newPassesAfterBid,
        currentPlayerIndex: nextIndex
      };
    }

    // ✅ Sinon : aucune annonce encore → 4 passes => redistribution (donneur +1)
    const newPasses = passes + 1;

    if (newPasses >= playersCount) {
      const nextDealerIndex = (game.dealerIndex + 1) % playersCount;

      let g = {
        ...game,
        dealerIndex: nextDealerIndex,
        currentPlayerIndex: (nextDealerIndex + 1) % playersCount,

        // nettoyage enchères
        passes: 0,
        passesAfterBid: 0,
        currentBid: null
      };

      g = handleTableIdle(g, { type: "TABLE_READY" });
      g = handleDistribution(g, { type: "DISTRIBUTE_CARDS" }, 3);
      g = handleDistribution(g, { type: "DISTRIBUTE_CARDS" }, 2);

      return g;
    }

    return { ...game, passes: newPasses, currentPlayerIndex: nextIndex };
  }
// ============================================
// CONTRÉE — CONTRE / SURCONTRE (avec équipes)
// ============================================
if (event.type === "CONTRE") {
  if (game.ruleset !== "contree") return game;
  if (!currentBid) return game;

  const mult = game.contratMultiplicateur || 1;
  if (mult !== 1) return game;

  const preneurId = game.players[currentBid.playerIndex];
  const actorId = game.players[game.currentPlayerIndex];

  const preneurTeam = game.teams.nous.includes(preneurId) ? "nous" : "eux";
  const actorTeam = game.teams.nous.includes(actorId) ? "nous" : "eux";

  // ✅ Seule la défense peut contrer
  if (actorTeam === preneurTeam) return game;

  return {
    ...game,
    contratMultiplicateur: 2,
    passesAfterBid: 0,
    currentPlayerIndex: nextIndex
  };
}

if (event.type === "SURCONTRE") {
  if (game.ruleset !== "contree") return game;
  if (!currentBid) return game;

  const mult = game.contratMultiplicateur || 1;
  if (mult !== 2) return game;

  const preneurId = game.players[currentBid.playerIndex];
  const actorId = game.players[game.currentPlayerIndex];

  const preneurTeam = game.teams.nous.includes(preneurId) ? "nous" : "eux";
  const actorTeam = game.teams.nous.includes(actorId) ? "nous" : "eux";

  // ✅ Seule l'équipe du preneur peut surcontrer
  if (actorTeam !== preneurTeam) return game;

  return {
    ...game,
    contratMultiplicateur: 4,
    passesAfterBid: 0,
    currentPlayerIndex: nextIndex
  };
}

  // ============================================
  // BID
  // ============================================
  if (event.type === "BID") {
    if (!event.suit || typeof event.value !== "number") return game;

    // ✅ surenchère obligatoire si une annonce existe déjà
    if (currentBid && event.value <= currentBid.value) return game;

    return {
      ...game,
      currentBid: {
        value: event.value,
        suit: event.suit,
        playerIndex: game.currentPlayerIndex
      },
      // une annonce existe => on ne compte plus "passes" (avant annonce)
      passes: 0,
      // reset des passes après annonce
      passesAfterBid: 0,
      // tour suivant
      currentPlayerIndex: nextIndex
    };
  }

  // (CONTRE / SURCONTRE au palier suivant)
  return game;
}







