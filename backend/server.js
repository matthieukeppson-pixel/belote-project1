import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";

/**
 * BACKEND
 * - HTTP: 4001
 * - WS:   4000
 *
 * * Client -> Server:
 *   - join_salon { pseudo, avatar }
 *   - message { text }
 *   - update_avatar { avatar }
 *   - get_players
 *
 *   - get_tables
 *   - set_table_mode { tableId, mode }    (autorisÃ© seulement si table vide)
 *   - join_table { tableId }
 *   - choose_seat { tableId, seatIndex }
 *   - leave_table { tableId? }            (si absent -> quitte n'importe quelle table)
 *   - create_table { mode }               (optionnel)
 *
 *  * Server -> Client:
 *   - players { players: [{ name, avatar }] }
 *   - tables  { tables: [{ id, mode, seats, count }] }
 *   - message { user, text }
 *   - system  { text }
 *   - joined_table { tableId, mode }      âœ… ACK join
 *   - join_table_denied { tableId, reason }
 *   - seat_chosen { tableId, seatIndex }
 *   - choose_seat_denied { tableId, reason }
 */

const HTTP_PORT = 4001;
const WS_PORT = 4000;

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/", (_req, res) => res.send("Backend HTTP OK"));

app.listen(HTTP_PORT, () => {
  console.log(`âœ… Backend HTTP actif sur http://localhost:${HTTP_PORT}`);
});

// ===============================
// WEBSOCKET (SALON)
// ===============================
const wsServer = http.createServer();
const wss = new WebSocketServer({ server: wsServer });

console.log(`âœ… WebSocket actif sur ws://localhost:${WS_PORT}`);

// pseudo -> { name, avatar, count }
const playersMap = new Map();

// tableId(number) -> { id, mode, seats: [pseudo|null, ...] }
const tablesMap = new Map();
let nextTableId = 1;
const BOT_PREFIX = "__bot__";

function isBotPseudo(pseudo) {
  return typeof pseudo === "string" && pseudo.startsWith(BOT_PREFIX);
}

function makeBotPseudo(tableId, seatIndex) {
  return `${BOT_PREFIX}table${tableId}_seat${seatIndex}`;
}

function makeBotName(tableId, seatIndex) {
  return `Bot ${tableId}-${seatIndex + 1}`;
}

function makeBotAvatar(seatIndex) {
  return "/avatar_red.png";
}

function buildBotSeat(tableId, seatIndex) {
  return makeBotPseudo(tableId, seatIndex);
}
function nextSeatIndex(seatIndex) {
  return (seatIndex + 1) % 4;
}

function seatTeamKey(seatIndex) {
  return seatIndex === 0 || seatIndex === 2 ? "nous" : "eux";
}

function getServerCardPointValue(card, atout) {
  if (!card) return 0;

  const value = String(card.value ?? card.rank ?? card.valeur ?? "").toUpperCase();
  const suit = card.suit ?? card.couleur ?? card.color ?? null;

  const trumpPoints = {
    J: 20,
    9: 14,
    A: 11,
    10: 10,
    K: 4,
    Q: 3,
    8: 0,
    7: 0,
  };

  const normalPoints = {
    A: 11,
    10: 10,
    K: 4,
    Q: 3,
    J: 2,
    9: 0,
    8: 0,
    7: 0,
  };

  const isTrump =
    atout === "TA" ? true : atout === "SA" || !atout ? false : suit === atout;

  return isTrump ? trumpPoints[value] || 0 : normalPoints[value] || 0;
}

function computeTrickPointsByTeam(hand, winnerSeatIndex) {
  const entries = Array.isArray(hand?.pli)
    ? hand.pli.filter((entry) => entry && entry.card)
    : [];

  const result = {
    nous: 0,
    eux: 0,
  };

  if (typeof winnerSeatIndex !== "number") return result;

  const winnerTeamKey = seatTeamKey(winnerSeatIndex);
  const trickPoints = entries.reduce(
    (total, entry) => total + getServerCardPointValue(entry.card, hand?.atout),
    0
  );

  result[winnerTeamKey] = trickPoints;

  return result;
}

function computeClassicContractScores(hand, scoreManche) {
  const takerTeam =
    typeof hand?.takerSeatIndex === "number" ? seatTeamKey(hand.takerSeatIndex) : null;

  if (!takerTeam) return scoreManche;

  const defenderTeam = takerTeam === "nous" ? "eux" : "nous";
  const takerPoints = scoreManche[takerTeam] || 0;
  const takerSucceeded = takerPoints >= 82;

  if (takerSucceeded) {
    return scoreManche;
  }

  return {
    [takerTeam]: 0,
    [defenderTeam]: 162,
  };
}

const SUITS = ["hearts", "diamonds", "clubs", "spades"];
const VALUES = ["7", "8", "9", "J", "Q", "K", "10", "A"];
const LOGICAL_PLAYER_BY_SEAT_INDEX = ["joueur2", "joueur4", "joueur3", "joueur1"];
function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ suit, value });
    }
  }
  return deck;
}

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }

  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function createSeededRandom(seedString) {
  const seedFactory = xmur3(String(seedString || ""));
  let a = seedFactory();

  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(deck, randomFn = Math.random) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function computeTurnedCardFromSeed(dealSeed, dealerSeatIndex) {
  const randomFn = createSeededRandom(dealSeed);
  const deck = shuffle(createDeck(), randomFn);

  // distribution 3 cartes à chaque siège
  for (let i = 0; i < 4; i++) {
    deck.shift();
    deck.shift();
    deck.shift();
  }

  // distribution 2 cartes à chaque siège
  for (let i = 0; i < 4; i++) {
    deck.shift();
    deck.shift();
  }

  return deck[0] || null;
}

function getInitialHandPhase(mode) {
  return mode === "contree" ? "ENCHERES" : "ANNOUNCE_ATOUT_TOUR_1";
}
function getHumanSeatCount(table) {
  if (!table) return 0;
  return table.seats.filter((pseudo) => pseudo && !isBotPseudo(pseudo)).length;
}

function syncBotsForTable(table) {
  if (!table) return;

  const humanCount = getHumanSeatCount(table);

  // aucun humain => table vide, pas de bots
  if (humanCount === 0) {
    table.seats = table.seats.map((pseudo) => (isBotPseudo(pseudo) ? null : pseudo));
    return;
  }

  // au moins un humain => on remplit les places libres avec des bots
  table.seats = table.seats.map((pseudo, seatIndex) => {
    if (pseudo) return pseudo;
    return buildBotSeat(table.id, seatIndex);
  });
}
function createEmptyHandState() {
  return {
    phase: "IDLE", // IDLE | ANNOUNCE_ATOUT_TOUR_1 | ANNOUNCE_ATOUT_TOUR_2 | ENCHERES | ANNONCES_MODERNE | PLI_EN_COURS | PLI_TERMINE | FIN_DE_MANCHE | FIN_DE_PARTIE
    roundNumber: 0,
    trickNumber: 0,

    roundId: null,
    createdAt: null,
    dealSeed: null,

    dealerSeatIndex: 0,
    currentTurnSeatIndex: null,

    atoutPropose: null,
    atout: null,
    currentBid: null,
    takerSeatIndex: null,

    contratValeur: null,
    contratMultiplicateur: 1,
    passes: 0,
    passesAfterBid: 0,

    hands: {
      joueur1: [],
      joueur2: [],
      joueur3: [],
      joueur4: [],
    },

    deck: [],

    pli: [],
    leadingSeatIndex: null,
    trickCards: [null, null, null, null],
    couleurDemandee: null,
    winnerIndex: null,

    scores: {
      nous: 0,
      eux: 0,
    },

    scoreManche: {
      nous: 0,
      eux: 0,
    },

    finDeManche: null,
    partieTerminee: false,
    winnerTeam: null,
    belote: {
      state: "NONE",
      joueur: null,
    },

    modernAnnouncements: {
      detectedByPlayer: {
        joueur1: [],
        joueur2: [],
        joueur3: [],
        joueur4: [],
      },
      declaredByPlayer: {},
      validated: [],
    },
  };
}
function createEmptyServerGame() {

  return {
    status: "WAITING_FOR_PLAYERS", // WAITING_FOR_PLAYERS | READY
    players: [],
    teams: {
      nous: [],
      eux: [],
    },
    dealerSeatIndex: 0,
    currentTurnSeatIndex: null,
    version: 0,
  };
}

function createTable(mode = "classic") {
  const id = nextTableId++;
  tablesMap.set(id, {
    id,
    mode,
    seats: [null, null, null, null],
    game: createEmptyServerGame(),
  });
  return tablesMap.get(id);
}

function ensureDefaultTables() {
  if (tablesMap.size > 0) return;
  createTable("classic");
  createTable("contree");
  createTable("moderne");
}

ensureDefaultTables();

function playersArray() {
  return Array.from(playersMap.values()).map((p) => ({
    name: p.name,
    avatar: p.avatar || "/avatar_blue.png",
  }));
}

function seatInfoFromPseudo(pseudo) {
  if (!pseudo) return null;

  if (isBotPseudo(pseudo)) {
    const match = pseudo.match(/table(\d+)_seat(\d+)/);
    const tableId = match ? Number(match[1]) : 0;
    const seatIndex = match ? Number(match[2]) : 0;

    return {
      name: makeBotName(tableId, seatIndex),
      avatar: makeBotAvatar(seatIndex),
      isBot: true,
      pseudo,
    };
  }

  const p = playersMap.get(pseudo);

  return {
    name: pseudo,
    avatar: p?.avatar || "/avatar_blue.png",
    isBot: false,
    pseudo,
  };
}

function tablesArray() {
  return Array.from(tablesMap.values()).map((t) => {
    const seats = t.seats.map((x) => x || null);
    const seatsInfo = seats.map((pseudo) => seatInfoFromPseudo(pseudo));
    const count = seats.filter((pseudo) => pseudo && !isBotPseudo(pseudo)).length;

    return {
      id: t.id,
      mode: t.mode,
      seats,
      seatsInfo,
      count,
game: {
  status: t.game?.status || "WAITING_FOR_PLAYERS",
  players: t.game?.players || [],
  teams: t.game?.teams || { nous: [], eux: [] },
  dealerSeatIndex:
    typeof t.game?.dealerSeatIndex === "number"
      ? t.game.dealerSeatIndex
      : 0,
  currentTurnSeatIndex:
    t.game?.currentTurnSeatIndex != null
      ? t.game.currentTurnSeatIndex
      : null,
  version: t.game?.version || 0,
  hand: t.game?.hand || createEmptyHandState(),
},
    };
  });
}

function broadcast(obj) {
  const payload = JSON.stringify(obj);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(payload);
  });
}

function broadcastPlayers() {
  broadcast({ type: "players", players: playersArray() });
}

function broadcastTables() {
  broadcast({ type: "tables", tables: tablesArray() });
}

function broadcastToTable(tableId, obj) {
  const payload = JSON.stringify(obj);

  wss.clients.forEach((client) => {
    if (client.readyState !== 1) return;
    if (Number(client.tableId) !== Number(tableId)) return;
    client.send(payload);
  });
}

function system(text) {
  broadcast({ type: "system", text });
}

function normalizeTableId(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

function findPlayerTable(pseudo) {
  for (const t of tablesMap.values()) {
    const idx = t.seats.findIndex((p) => p === pseudo);
    if (idx !== -1) return { table: t, seatIndex: idx };
  }
  return null;
}
function getSeatedPlayersInOrder(table) {
  if (!table) return [];
  return table.seats
    .map((pseudo, seatIndex) => ({ pseudo, seatIndex }))
    .filter((entry) => !!entry.pseudo);
}

function buildTeamsFromSeats(table) {
  if (!table) {
    return { nous: [], eux: [] };
  }

  return {
    nous: [table.seats[0], table.seats[2]].filter(Boolean),
    eux: [table.seats[1], table.seats[3]].filter(Boolean),
  };
}

function buildInitialAuthoritativeDealFromSeedSafe(dealSeed, dealerSeatIndex) {
  const randomFn = createSeededRandom(dealSeed);
  const deck = shuffle(createDeck(), randomFn);

  const hands = {
    joueur1: [],
    joueur2: [],
    joueur3: [],
    joueur4: [],
  };

  let seatIndex = nextSeatIndex(dealerSeatIndex);

  function dealCardsToSeat(count) {
    const playerId = LOGICAL_PLAYER_BY_SEAT_INDEX[seatIndex];

    for (let i = 0; i < count; i++) {
      const card = deck.shift();
      if (card) hands[playerId].push(card);
    }

    seatIndex = nextSeatIndex(seatIndex);
  }

  for (let i = 0; i < 4; i++) {
    dealCardsToSeat(3);
  }

  for (let i = 0; i < 4; i++) {
    dealCardsToSeat(2);
  }

  return {
    hands,
    deck,
    atoutPropose: deck[0] || null,
  };
}
function buildFreshAuthoritativeHand(table, dealerSeatIndex = 0) {
  const now = Date.now();
  const dealSeed = `${table.id}-${now}-${Math.random()}`;
  const initialDeal = buildInitialAuthoritativeDealFromSeedSafe(dealSeed, dealerSeatIndex);

  return {
    ...createEmptyHandState(),
    phase: getInitialHandPhase(table.mode),
    roundId: `table-${table.id}-round-${now}`,
    createdAt: now,
    dealSeed,
    dealerSeatIndex,
    currentTurnSeatIndex: nextSeatIndex(dealerSeatIndex),
    hands: initialDeal.hands,
    deck: initialDeal.deck,
    atoutPropose:
      table.mode === "contree"
        ? null
        : initialDeal.atoutPropose,
  };
}

function sameCardIdentity(a, b) {
  if (!a || !b) return false;

  return (
    a.suit === b.suit &&
    String(a.value ?? "").toUpperCase() === String(b.value ?? "").toUpperCase()
  );
}

function completeAuthoritativeDealToEightAfterTake(hand, takerSeatIndex, takeTurnedCard = true) {
  const nextHands = {
    joueur1: [...(hand.hands?.joueur1 || [])],
    joueur2: [...(hand.hands?.joueur2 || [])],
    joueur3: [...(hand.hands?.joueur3 || [])],
    joueur4: [...(hand.hands?.joueur4 || [])],
  };

  const nextDeck = Array.isArray(hand.deck) ? [...hand.deck] : [];
  const takerPlayerId = LOGICAL_PLAYER_BY_SEAT_INDEX[takerSeatIndex];

  if (takeTurnedCard && hand.atoutPropose && takerPlayerId) {
    const turnedCardIndex = nextDeck.findIndex((card) =>
      sameCardIdentity(card, hand.atoutPropose)
    );

    const [turnedCard] =
      turnedCardIndex >= 0
        ? nextDeck.splice(turnedCardIndex, 1)
        : [hand.atoutPropose];

    if (turnedCard && nextHands[takerPlayerId].length < 8) {
      nextHands[takerPlayerId].push(turnedCard);
    }
  }

  let safety = 0;

  while (
    safety < 32 &&
    nextDeck.length > 0 &&
    Object.values(nextHands).some((cards) => cards.length < 8)
  ) {
    for (let offset = 0; offset < 4; offset++) {
      const seatIndex = (nextSeatIndex(hand.dealerSeatIndex) + offset) % 4;
      const playerId = LOGICAL_PLAYER_BY_SEAT_INDEX[seatIndex];

      if (!playerId || nextHands[playerId].length >= 8) continue;

      const card = nextDeck.shift();
      if (card) nextHands[playerId].push(card);
    }

    safety++;
  }

  return {
    hands: nextHands,
    deck: nextDeck,
  };
}

function applyClassicOrModernBiddingAction(table, hand, actorSeatIndex, action) {
  const startSeatIndex = nextSeatIndex(hand.dealerSeatIndex);
  const nextTurnSeatIndex = nextSeatIndex(hand.currentTurnSeatIndex);

  if (
    hand.phase !== "ANNOUNCE_ATOUT_TOUR_1" &&
    hand.phase !== "ANNOUNCE_ATOUT_TOUR_2"
  ) {
    return hand;
  }

  if (action.type === "PASS") {
    const newPasses = (hand.passes || 0) + 1;

    if (hand.phase === "ANNOUNCE_ATOUT_TOUR_1") {
      if (newPasses >= 4) {
        return {
          ...hand,
          phase: "ANNOUNCE_ATOUT_TOUR_2",
          passes: 0,
          currentTurnSeatIndex: startSeatIndex,
        };
      }

      return {
        ...hand,
        passes: newPasses,
        currentTurnSeatIndex: nextTurnSeatIndex,
      };
    }

    if (hand.phase === "ANNOUNCE_ATOUT_TOUR_2") {
      if (newPasses >= 4) {
        const nextDealerSeatIndex = nextSeatIndex(hand.dealerSeatIndex);
        const nextHand = buildFreshAuthoritativeHand(table, nextDealerSeatIndex);
        nextHand.scores = hand.scores || { nous: 0, eux: 0 };
        return nextHand;
      }

      return {
        ...hand,
        passes: newPasses,
        currentTurnSeatIndex: nextTurnSeatIndex,
      };
    }

    return hand;
  }

  if (action.type === "TAKE_ATOUT") {
    if (hand.phase === "ANNOUNCE_ATOUT_TOUR_1") {
      const chosenSuit =
        table.mode === "moderne" && (action.suit === "SA" || action.suit === "TA")
          ? action.suit
          : hand.atoutPropose?.suit || null;

      if (!chosenSuit) return hand;

      const completedDeal = completeAuthoritativeDealToEightAfterTake(
        hand,
        actorSeatIndex,
        true
      );

      return {
        ...hand,
        phase: table.mode === "moderne" ? "ANNONCES_MODERNE" : "PLI_EN_COURS",
        atout: chosenSuit,
        takerSeatIndex: actorSeatIndex,
        contratMultiplicateur: 1,
        currentTurnSeatIndex: startSeatIndex,
        hands: completedDeal.hands,
        deck: completedDeal.deck,
        pli: [],
        trickCards: [null, null, null, null],
        couleurDemandee: null,
        winnerIndex: null,
        passes: 0,
        passesAfterBid: 0,
      };
    }

    if (hand.phase === "ANNOUNCE_ATOUT_TOUR_2") {
      if (!action.suit) return hand;
      if (hand.atoutPropose && action.suit === hand.atoutPropose.suit) return hand;

      const completedDeal = completeAuthoritativeDealToEightAfterTake(
        hand,
        actorSeatIndex,
        false
      );

      return {
        ...hand,
        phase: table.mode === "moderne" ? "ANNONCES_MODERNE" : "PLI_EN_COURS",
        atout: action.suit,
        takerSeatIndex: actorSeatIndex,
        contratMultiplicateur: 1,
        currentTurnSeatIndex: startSeatIndex,
        hands: completedDeal.hands,
        deck: completedDeal.deck,
        pli: [],
        trickCards: [null, null, null, null],
        couleurDemandee: null,
        winnerIndex: null,
        passes: 0,
        passesAfterBid: 0,
      };
    }

    return hand;
  }

  return hand;
}

function applyContreeBiddingAction(table, hand, actorSeatIndex, action) {
  if (hand.phase !== "ENCHERES") return hand;

  const nextTurnSeatIndex = nextSeatIndex(hand.currentTurnSeatIndex);
  const startSeatIndex = nextSeatIndex(hand.dealerSeatIndex);
  const currentBid = hand.currentBid || null;

  if (action.type === "PASS") {
    if (currentBid) {
      const newPassesAfterBid = (hand.passesAfterBid || 0) + 1;

      if (newPassesAfterBid >= 3) {
        return {
          ...hand,
          phase: "PLI_EN_COURS",
          atout: currentBid.suit,
          takerSeatIndex: currentBid.seatIndex,
          contratValeur: currentBid.value,
          currentTurnSeatIndex: startSeatIndex,
          passes: 0,
          passesAfterBid: 0,
        };
      }

      return {
        ...hand,
        passesAfterBid: newPassesAfterBid,
        currentTurnSeatIndex: nextTurnSeatIndex,
      };
    }

    const newPasses = (hand.passes || 0) + 1;

    if (newPasses >= 4) {
      const nextDealerSeatIndex = nextSeatIndex(hand.dealerSeatIndex);
      return buildFreshAuthoritativeHand(table, nextDealerSeatIndex);
    }

    return {
      ...hand,
      passes: newPasses,
      currentTurnSeatIndex: nextTurnSeatIndex,
    };
  }

  if (action.type === "BID") {
    if (!action.suit || typeof action.value !== "number") return hand;
    if (currentBid && action.value <= currentBid.value) return hand;

    return {
      ...hand,
      currentBid: {
        value: action.value,
        suit: action.suit,
        seatIndex: actorSeatIndex,
      },
      contratValeur: action.value,
      passes: 0,
      passesAfterBid: 0,
      currentTurnSeatIndex: nextTurnSeatIndex,
    };
  }

  if (action.type === "CONTRE") {
    if (!currentBid) return hand;
    if ((hand.contratMultiplicateur || 1) !== 1) return hand;

    const takerTeam = seatTeamKey(currentBid.seatIndex);
    const actorTeam = seatTeamKey(actorSeatIndex);

    if (actorTeam === takerTeam) return hand;

    return {
      ...hand,
      contratMultiplicateur: 2,
      passesAfterBid: 0,
      currentTurnSeatIndex: nextTurnSeatIndex,
    };
  }

  if (action.type === "SURCONTRE") {
    if (!currentBid) return hand;
    if ((hand.contratMultiplicateur || 1) !== 2) return hand;

    const takerTeam = seatTeamKey(currentBid.seatIndex);
    const actorTeam = seatTeamKey(actorSeatIndex);

    if (actorTeam !== takerTeam) return hand;

    return {
      ...hand,
      contratMultiplicateur: 4,
      passesAfterBid: 0,
      currentTurnSeatIndex: nextTurnSeatIndex,
    };
  }

  return hand;
}

function applyTableGameActionToHand(table, hand, actorSeatIndex, action) {
  if (
    hand.currentTurnSeatIndex == null ||
    actorSeatIndex !== hand.currentTurnSeatIndex
  ) {
    return hand;
  }

  if (table.mode === "contree") {
    return applyContreeBiddingAction(table, hand, actorSeatIndex, action);
  }

  return applyClassicOrModernBiddingAction(table, hand, actorSeatIndex, action);
}
function applyPlayCardToAuthoritativeHand(currentHand, actorSeatIndex, action) {
  const hand = {
    ...createEmptyHandState(),
    ...(currentHand || {}),
  };
  if (hand.phase !== "PLI_EN_COURS") return null;
  const activeSeatIndex = hand.currentTurnSeatIndex;
  if (activeSeatIndex != null && actorSeatIndex !== activeSeatIndex) return null;

  const playerId = LOGICAL_PLAYER_BY_SEAT_INDEX[actorSeatIndex];
  const playerHand = Array.isArray(hand.hands?.[playerId])
    ? hand.hands[playerId]
    : [];

  const cardKey = String(
    action.cardKey || action.card?.key || action.card?.cardKey || ""
  );

    if (!cardKey) return null;
  if (playerHand.length === 0) return null;

  const normalizeCardKey = (value) =>
    String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9]/g, "");

  const getCardSuit = (card) =>
    card?.suit ?? card?.couleur ?? card?.color ?? null;

  const getCardValue = (card) =>
    card?.value ?? card?.rank ?? card?.valeur ?? null;

  const buildCardKeyVariants = (card) => {
    const suit = getCardSuit(card) ?? "";
    const value = getCardValue(card) ?? "";
    const key = card?.key ?? card?.cardKey ?? "";

    return [
      key,
      `${suit}-${value}`,
      `${value}-${suit}`,
      `${suit}_${value}`,
      `${value}_${suit}`,
      `${suit}${value}`,
      `${value}${suit}`,
    ].map(normalizeCardKey);
  };

   const normalizedCardKey = normalizeCardKey(cardKey);
  const cardIndex = playerHand.findIndex((card) =>
    buildCardKeyVariants(card).includes(normalizedCardKey)
  );

  if (cardIndex === -1) return null;

   const playedCard = playerHand[cardIndex];

  const nextPlayerHand = [
    ...playerHand.slice(0, cardIndex),
    ...playerHand.slice(cardIndex + 1),
  ];

  const nextHands = {
    ...(hand.hands || {}),
    [playerId]: nextPlayerHand,
  };

    const currentTrickCards = Array.isArray(hand.trickCards)
    ? hand.trickCards.filter((entry) => entry && entry.card)
    : [];

  if (currentTrickCards.length >= 4) return null;

  const requestedSuit =
    hand.couleurDemandee ||
    getCardSuit(currentTrickCards[0]?.card) ||
    null;

  if (currentTrickCards.length > 0 && requestedSuit) {
    const hasRequestedSuit = playerHand.some(
      (card) => getCardSuit(card) === requestedSuit
    );

    const playedRequestedSuit = getCardSuit(playedCard) === requestedSuit;

    if (hasRequestedSuit && !playedRequestedSuit) return null;
  }

  const nextCouleurDemandee = requestedSuit || getCardSuit(playedCard);

  const currentPli = Array.isArray(hand.pli)
    ? hand.pli
    : [];

  const playedEntry = {
    seatIndex: actorSeatIndex,
    playerId,
    card: playedCard,
    cardKey,
  };

  const nextTrickCards = [...currentTrickCards, playedEntry];
  const nextPli = [...currentPli, playedEntry];

   const atout = hand.atout;

  const isTrump = (card) => {
    if (atout === "TA") return true;
    if (atout === "SA" || !atout) return false;
    return getCardSuit(card) === atout;
  };

  const trumpRank = {
    J: 8,
    9: 7,
    A: 6,
    10: 5,
    K: 4,
    Q: 3,
    8: 2,
    7: 1,
  };

  const normalRank = {
    A: 8,
    10: 7,
    K: 6,
    Q: 5,
    J: 4,
    9: 3,
    8: 2,
    7: 1,
  };

  const getRankValue = (card) => {
    const value = String(getCardValue(card) ?? "").toUpperCase();
    return isTrump(card) ? trumpRank[value] || 0 : normalRank[value] || 0;
  };

  const getBestTrickEntry = (bestEntry, candidateEntry) => {
    if (!bestEntry) return candidateEntry;

    const bestCard = bestEntry.card;
    const candidateCard = candidateEntry.card;

    const bestIsTrump = isTrump(bestCard);
    const candidateIsTrump = isTrump(candidateCard);

    if (candidateIsTrump && !bestIsTrump) return candidateEntry;
    if (!candidateIsTrump && bestIsTrump) return bestEntry;

    if (candidateIsTrump && bestIsTrump) {
      return getRankValue(candidateCard) > getRankValue(bestCard)
        ? candidateEntry
        : bestEntry;
    }

    const bestFollowsSuit = getCardSuit(bestCard) === nextCouleurDemandee;
    const candidateFollowsSuit =
      getCardSuit(candidateCard) === nextCouleurDemandee;

    if (candidateFollowsSuit && !bestFollowsSuit) return candidateEntry;
    if (!candidateFollowsSuit && bestFollowsSuit) return bestEntry;

    if (candidateFollowsSuit && bestFollowsSuit) {
      return getRankValue(candidateCard) > getRankValue(bestCard)
        ? candidateEntry
        : bestEntry;
    }

    return bestEntry;
  };
  if (
    currentTrickCards.length > 0 &&
    requestedSuit &&
    atout &&
    atout !== "SA" &&
    atout !== "TA"
  ) {
    const hasRequestedSuitForCut = playerHand.some(
      (card) => getCardSuit(card) === requestedSuit
    );
    const hasTrump = playerHand.some((card) => isTrump(card));
    const playedTrump = isTrump(playedCard);

    const currentBestEntry = currentTrickCards.reduce(getBestTrickEntry, null);
    const partnerIsWinning =
      currentBestEntry &&
      seatTeamKey(currentBestEntry.seatIndex) === seatTeamKey(actorSeatIndex);

    if (!hasRequestedSuitForCut && hasTrump && !partnerIsWinning && !playedTrump) {
      return null;
    }
  }

  if (
    currentTrickCards.length > 0 &&
    atout &&
    atout !== "SA" &&
    atout !== "TA" &&
    isTrump(playedCard)
  ) {
    const currentBestTrumpEntry = currentTrickCards
      .filter((entry) => entry?.card && isTrump(entry.card))
      .reduce((bestEntry, entry) => {
        if (!bestEntry) return entry;

        return getRankValue(entry.card) > getRankValue(bestEntry.card)
          ? entry
          : bestEntry;
      }, null);

    if (currentBestTrumpEntry) {
      const bestTrumpRank = getRankValue(currentBestTrumpEntry.card);
      const playedTrumpRank = getRankValue(playedCard);
      const hasHigherTrump = playerHand.some(
        (card) => isTrump(card) && getRankValue(card) > bestTrumpRank
      );

      if (hasHigherTrump && playedTrumpRank <= bestTrumpRank) return null;
    }
  }
  const trickIsComplete = nextTrickCards.length >= 4;

  const winnerSeatIndex = trickIsComplete
    ? nextTrickCards.reduce(getBestTrickEntry, null)?.seatIndex ?? actorSeatIndex
    : null;

      return {
    ...hand,
    phase: trickIsComplete ? "PLI_TERMINE" : "PLI_EN_COURS",
    hands: nextHands,
    pli: nextPli,
    trickCards: nextTrickCards,
    couleurDemandee: nextCouleurDemandee,
    winnerIndex: trickIsComplete ? winnerSeatIndex : hand.winnerIndex,
    currentTurnSeatIndex: trickIsComplete
      ? winnerSeatIndex
      : nextSeatIndex(actorSeatIndex),
  };
}
function buildFirstBotPlayCardAction(table) {
  const hand = {
    ...createEmptyHandState(),
    ...(table.game?.hand || {}),
  };

  if (hand.phase !== "PLI_EN_COURS") return null;

  const activeSeatIndex = hand.currentTurnSeatIndex;
  if (activeSeatIndex == null) return null;

  const activeSeatPseudo = table.seats?.[activeSeatIndex] || null;
  if (!isBotPseudo(activeSeatPseudo)) return null;

  const playerId = LOGICAL_PLAYER_BY_SEAT_INDEX[activeSeatIndex];
  const playerHand = Array.isArray(hand.hands?.[playerId])
    ? hand.hands[playerId]
    : [];

   const getBotCardSuit = (card) =>
    card?.suit ?? card?.couleur ?? card?.color ?? null;

  const currentTrickCards = Array.isArray(hand.trickCards)
    ? hand.trickCards.filter((entry) => entry && entry.card)
    : [];

  const requestedSuit =
    hand.couleurDemandee ||
    getBotCardSuit(currentTrickCards[0]?.card) ||
    null;

  const atout = hand.atout;

  const isBotTrump = (card) => {
    if (atout === "TA") return true;
    if (atout === "SA" || !atout) return false;
    return getBotCardSuit(card) === atout;
  };
  const getBotCardValue = (card) =>
    card?.value ?? card?.rank ?? card?.valeur ?? null;

  const botTrumpRank = {
    J: 8,
    9: 7,
    A: 6,
    10: 5,
    K: 4,
    Q: 3,
    8: 2,
    7: 1,
  };

  const getBotTrumpRankValue = (card) => {
    const value = String(getBotCardValue(card) ?? "").toUpperCase();
    return botTrumpRank[value] || 0;
  };
  const botNormalRank = {
    A: 8,
    10: 7,
    K: 6,
    Q: 5,
    J: 4,
    9: 3,
    8: 2,
    7: 1,
  };

  const getBotRankValue = (card) => {
    const value = String(getBotCardValue(card) ?? "").toUpperCase();
    return isBotTrump(card) ? getBotTrumpRankValue(card) : botNormalRank[value] || 0;
  };

  const getBotBestTrickEntry = (bestEntry, candidateEntry) => {
    if (!bestEntry) return candidateEntry;

    const bestCard = bestEntry.card;
    const candidateCard = candidateEntry.card;

    const bestIsTrump = isBotTrump(bestCard);
    const candidateIsTrump = isBotTrump(candidateCard);

    if (candidateIsTrump && !bestIsTrump) return candidateEntry;
    if (!candidateIsTrump && bestIsTrump) return bestEntry;

    if (candidateIsTrump && bestIsTrump) {
      return getBotRankValue(candidateCard) > getBotRankValue(bestCard)
        ? candidateEntry
        : bestEntry;
    }

    const bestFollowsSuit = getBotCardSuit(bestCard) === requestedSuit;
    const candidateFollowsSuit = getBotCardSuit(candidateCard) === requestedSuit;

    if (candidateFollowsSuit && !bestFollowsSuit) return candidateEntry;
    if (!candidateFollowsSuit && bestFollowsSuit) return bestEntry;

    if (candidateFollowsSuit && bestFollowsSuit) {
      return getBotRankValue(candidateCard) > getBotRankValue(bestCard)
        ? candidateEntry
        : bestEntry;
    }

    return bestEntry;
  };

  const currentBestEntry = currentTrickCards.reduce(getBotBestTrickEntry, null);
  const partnerIsWinning =
    currentBestEntry &&
    seatTeamKey(currentBestEntry.seatIndex) === seatTeamKey(activeSeatIndex);
  const currentBestTrumpRank =
    atout && atout !== "SA" && atout !== "TA"
      ? currentTrickCards
          .filter((entry) => entry?.card && isBotTrump(entry.card))
          .reduce(
            (bestRank, entry) =>
              Math.max(bestRank, getBotTrumpRankValue(entry.card)),
            0
          )
      : 0;

  const higherTrumpCard =
    atout && atout !== "SA" && atout !== "TA"
      ? playerHand
          .filter(
            (candidate) =>
              candidate &&
              isBotTrump(candidate) &&
              getBotTrumpRankValue(candidate) > currentBestTrumpRank
          )
          .sort(
            (a, b) =>
              getBotTrumpRankValue(a) - getBotTrumpRankValue(b)
          )[0] || null
      : null;

  const requestedSuitCard = requestedSuit
    ? requestedSuit === atout && higherTrumpCard
      ? higherTrumpCard
      : playerHand.find(
          (candidate) =>
            candidate && getBotCardSuit(candidate) === requestedSuit
        )
    : null;
  const nonTrumpDiscardCard =
    requestedSuit && !requestedSuitCard && partnerIsWinning
      ? playerHand.find((candidate) => candidate && !isBotTrump(candidate))
      : null;
  const trumpFallbackCard =
    requestedSuit && !requestedSuitCard
      ? higherTrumpCard ||
        playerHand.find((candidate) => candidate && isBotTrump(candidate))
      : null;

  const card =
    requestedSuitCard ||
    nonTrumpDiscardCard ||
    trumpFallbackCard ||
    playerHand.find(Boolean);

  if (!card) return null;

  const suit = card.suit ?? card.couleur ?? card.color ?? "";
  const value = card.value ?? card.rank ?? card.valeur ?? "";
  const cardKey = String(card.key || card.cardKey || `${suit}-${value}`);

  if (!cardKey) return null;

  return {
    type: "PLAY_CARD",
    cardKey,
  };
}

function playOneBotCardIfNeeded(table) {
  const action = buildFirstBotPlayCardAction(table);
  if (!action) return false;

  const hand = {
    ...createEmptyHandState(),
    ...(table.game?.hand || {}),
  };

  const actorSeatIndex = hand.currentTurnSeatIndex;
  if (actorSeatIndex == null) return false;

  const actorPseudo = table.seats?.[actorSeatIndex] || null;
  if (!isBotPseudo(actorPseudo)) return false;

  const nextHand = applyPlayCardToAuthoritativeHand(
    hand,
    actorSeatIndex,
    action
  );

  if (!nextHand) return false;

  table.game = {
    ...(table.game || createEmptyServerGame()),
    dealerSeatIndex:
      typeof nextHand.dealerSeatIndex === "number"
        ? nextHand.dealerSeatIndex
        : table.game?.dealerSeatIndex || 0,
    currentTurnSeatIndex:
      nextHand.currentTurnSeatIndex != null
        ? nextHand.currentTurnSeatIndex
        : null,
    hand: nextHand,
    version: (table.game?.version || 0) + 1,
  };

  broadcastToTable(table.id, {
    type: "table_game_action",
    tableId: table.id,
    roundId: String(nextHand.roundId || hand.roundId || ""),
    action,
    actor: actorPseudo,
  });

  broadcastTables();
  scheduleAdvanceCompletedTrick(table);
  return true;
}

function playBotCardsUntilHumanTurn(table, maxSteps = 4, delayMs = 600) {
  if (!table) return 0;
  if (table.botPlayTimer) return 0;

  const scheduledRoundId = table.game?.hand?.roundId || null;
  if (!scheduledRoundId) return 0;

  let playedCount = 0;

  const playNextBotCard = () => {
    table.botPlayTimer = null;

    const currentRoundId = table.game?.hand?.roundId || null;
    if (currentRoundId !== scheduledRoundId) return;

    if (playedCount >= maxSteps) return;

    const played = playOneBotCardIfNeeded(table);
    if (!played) return;

    playedCount++;

    if (playedCount >= maxSteps) return;

    const nextRoundId = table.game?.hand?.roundId || null;
    if (nextRoundId !== scheduledRoundId) return;

    const nextAction = buildFirstBotPlayCardAction(table);
    if (!nextAction) return;

    table.botPlayTimer = setTimeout(playNextBotCard, delayMs);
  };

  table.botPlayTimer = setTimeout(playNextBotCard, delayMs);

  return 0;
}

function getPlayedTrickEntriesFromHand(hand) {
  return Array.isArray(hand?.trickCards)
    ? hand.trickCards.filter((entry) => entry && entry.card)
    : [];
}
function scheduleStartNextHandAfterEnd(table, delayMs = 1000) {
  if (!table?.game?.hand) return false;

  const hand = {
    ...createEmptyHandState(),
    ...(table.game.hand || {}),
  };

  if (hand.phase !== "FIN_DE_MANCHE") return false;
  if (table.nextHandTimer) return false;

  const roundId = hand.roundId;
  const nextDealerSeatIndex = nextSeatIndex(hand.dealerSeatIndex);

  table.nextHandTimer = setTimeout(() => {
    table.nextHandTimer = null;

    const currentHand = {
      ...createEmptyHandState(),
      ...(table.game?.hand || {}),
    };

    if (currentHand.phase !== "FIN_DE_MANCHE") return;
    if (currentHand.roundId !== roundId) return;
    if (getSeatedPlayersInOrder(table).length < 4) return;

    const nextHand = buildFreshAuthoritativeHand(table, nextDealerSeatIndex);
    nextHand.scores = currentHand.scores || { nous: 0, eux: 0 };
    table.game = {
      ...(table.game || createEmptyServerGame()),
      dealerSeatIndex: nextHand.dealerSeatIndex,
      currentTurnSeatIndex: nextHand.currentTurnSeatIndex,
      hand: nextHand,
      version: (table.game?.version || 0) + 1,
    };

    broadcastTables();
  }, delayMs);

  return true;
}
function scheduleAdvanceCompletedTrick(table, delayMs = 1000) {
  if (!table?.game?.hand) return false;

  const hand = {
    ...createEmptyHandState(),
    ...(table.game.hand || {}),
  };

  if (hand.phase !== "PLI_TERMINE") return false;
  if (table.nextTrickTimer) return false;

  table.nextTrickTimer = setTimeout(() => {
    table.nextTrickTimer = null;

    const currentHand = {
      ...createEmptyHandState(),
      ...(table.game?.hand || {}),
    };

    if (currentHand.phase !== "PLI_TERMINE") return;

    const winnerSeatIndex =
      typeof currentHand.winnerIndex === "number"
        ? currentHand.winnerIndex
        : typeof currentHand.currentTurnSeatIndex === "number"
          ? currentHand.currentTurnSeatIndex
          : 0;

    const allHandsEmpty = Object.values(currentHand.hands || {}).every(
      (cards) => Array.isArray(cards) && cards.length === 0
    );
    const winnerTeamKey = seatTeamKey(winnerSeatIndex);
    const trickPointsByTeam = computeTrickPointsByTeam(currentHand, winnerSeatIndex);
    const dixDeDerBonus = allHandsEmpty ? 10 : 0;

    const nextScoreManche = {
      nous:
        (currentHand.scoreManche?.nous || 0) +
        trickPointsByTeam.nous +
        (winnerTeamKey === "nous" ? dixDeDerBonus : 0),
      eux:
        (currentHand.scoreManche?.eux || 0) +
        trickPointsByTeam.eux +
        (winnerTeamKey === "eux" ? dixDeDerBonus : 0),
    };
    const nextContractScores =
      allHandsEmpty && table.mode === "classic"
        ? computeClassicContractScores(currentHand, nextScoreManche)
        : nextScoreManche;

    const nextScores = allHandsEmpty
      ? {
          nous: (currentHand.scores?.nous || 0) + nextContractScores.nous,
          eux: (currentHand.scores?.eux || 0) + nextContractScores.eux,
        }
      : currentHand.scores;

    const targetScore = table.mode === "contree" ? 1500 : 500;
    const winnerTeam =
      allHandsEmpty && ((nextScores?.nous || 0) >= targetScore || (nextScores?.eux || 0) >= targetScore)
        ? (nextScores.nous || 0) >= (nextScores.eux || 0)
          ? "nous"
          : "eux"
        : null;
    const partieTerminee = !!winnerTeam;
    const nextHand = {
      ...currentHand,
      phase: partieTerminee
        ? "FIN_DE_PARTIE"
        : allHandsEmpty
          ? "FIN_DE_MANCHE"
          : "PLI_EN_COURS",
      scoreManche: nextScoreManche,
      scores: nextScores,
      partieTerminee,
      winnerTeam,
      trickNumber:
        typeof currentHand.trickNumber === "number"
          ? currentHand.trickNumber + 1
          : 1,
      leadingSeatIndex: winnerSeatIndex,
      currentTurnSeatIndex: allHandsEmpty ? null : winnerSeatIndex,
      pli: [],
      trickCards: [null, null, null, null],
      couleurDemandee: null,
      winnerIndex: null,
    };

    table.game = {
      ...(table.game || createEmptyServerGame()),
      dealerSeatIndex:
        typeof nextHand.dealerSeatIndex === "number"
          ? nextHand.dealerSeatIndex
          : table.game?.dealerSeatIndex || 0,
      currentTurnSeatIndex:
        nextHand.currentTurnSeatIndex != null
          ? nextHand.currentTurnSeatIndex
          : null,
      hand: nextHand,
      version: (table.game?.version || 0) + 1,
    };

    broadcastTables();

    if (partieTerminee) {
      return;
    }

    if (allHandsEmpty) {
      scheduleStartNextHandAfterEnd(table);
    } else {
      playBotCardsUntilHumanTurn(table);
    }
  }, delayMs);

  return true;
}

function refreshServerGameForTable(table) {
  if (!table) return;

  syncBotsForTable(table);

  const seated = getSeatedPlayersInOrder(table);
  const count = seated.length;

  if (count < 4) {
    table.game = {
      ...createEmptyServerGame(),
      dealerSeatIndex:
        typeof table.game?.dealerSeatIndex === "number"
          ? table.game.dealerSeatIndex
          : 0,
      version: (table.game?.version || 0) + 1,
    };
    return;
  }

  const dealerSeatIndex =
    typeof table.game?.dealerSeatIndex === "number"
      ? table.game.dealerSeatIndex
      : 0;

  const existingHand = {
    ...createEmptyHandState(),
    ...(table.game?.hand || {}),
  };

  let sharedHand;

  if (existingHand.roundId) {
    const safeDealSeed = existingHand.dealSeed || `${table.id}-${Date.now()}-${Math.random()}`;
    const safeDealerSeatIndex =
      typeof existingHand.dealerSeatIndex === "number"
        ? existingHand.dealerSeatIndex
        : dealerSeatIndex;

    sharedHand = {
      ...existingHand,
      createdAt: existingHand.createdAt || Date.now(),
      dealSeed: safeDealSeed,
      dealerSeatIndex: safeDealerSeatIndex,
      currentTurnSeatIndex:
        existingHand.currentTurnSeatIndex != null
          ? existingHand.currentTurnSeatIndex
          : nextSeatIndex(safeDealerSeatIndex),
      phase: existingHand.phase || getInitialHandPhase(table.mode),
      atoutPropose:
        existingHand.atoutPropose ||
        (table.mode === "contree"
          ? null
          : computeTurnedCardFromSeed(safeDealSeed, safeDealerSeatIndex)),
    };
  } else {
    sharedHand = buildFreshAuthoritativeHand(table, dealerSeatIndex);
  }

  table.game = {
    ...(table.game || createEmptyServerGame()),
    status: "READY",
    players: seated.map((entry) => entry.pseudo),
    teams: buildTeamsFromSeats(table),
    dealerSeatIndex: sharedHand.dealerSeatIndex,
    currentTurnSeatIndex:
      sharedHand.currentTurnSeatIndex != null
        ? sharedHand.currentTurnSeatIndex
        : null,
    version: (table.game?.version || 0) + 1,
    hand: sharedHand,
  };
}
function isPlayerInTable(tableId, pseudo) {
  const t = tablesMap.get(Number(tableId));
  if (!t) return false;
  return t.seats.some((p) => p === pseudo);
}
function removePlayerFromAnyTable(pseudo) {
  const found = findPlayerTable(pseudo);
  if (!found) return null;
  found.table.seats[found.seatIndex] = null;
  return found.table.id;
}

wss.on("connection", (ws) => {
  ws.pseudo = null;
  ws.tableId = null;

  // Ã©tat initial
  ws.send(JSON.stringify({ type: "players", players: playersArray() }));
  ws.send(JSON.stringify({ type: "tables", tables: tablesArray() }));

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // ===============================
    // JOIN SALON
    // ===============================
    if (msg.type === "join_salon") {
      const pseudo = String(msg.pseudo || "Joueur").trim() || "Joueur";
      ws.pseudo = pseudo;

      const avatar =
        String(msg.avatar || "/avatar_blue.png").trim() || "/avatar_blue.png";

      const existing = playersMap.get(pseudo);
      if (!existing) {
        playersMap.set(pseudo, { name: pseudo, avatar, count: 1 });
        system(`â­ Bienvenue ${pseudo} â­`);
      } else {
        existing.count += 1;
        // âœ… on ne touche PAS existing.avatar ici
      }

      broadcastPlayers();
      broadcastTables();
      return;
    }

    // tout le reste nÃ©cessite un pseudo
    const pseudo = String(ws.pseudo || "").trim();
    if (!pseudo) return;

    // ===============================
    // CHAT
    // ===============================
    if (msg.type === "message") {
      const text = String(msg.text || "").trim();
      if (!text) return;
      broadcast({ type: "message", user: pseudo, text });
      return;
    }

    if (msg.type === "table_message") {
  const text = String(msg.text || "").trim();
  if (!text) return;
  if (!ws.tableId) return;

  // ne pas faire confiance au seul ws.tableId
  if (!isPlayerInTable(ws.tableId, pseudo)) return;

  broadcastToTable(ws.tableId, {
    type: "table_message",
    tableId: ws.tableId,
    user: pseudo,
    text,
  });
  return;
}
if (msg.type === "table_game_action") {
  const tableId =
    msg.tableId != null
      ? normalizeTableId(msg.tableId)
      : normalizeTableId(ws.tableId);

  const t = tableId ? tablesMap.get(tableId) : null;
  if (!t) return;

  if (!isPlayerInTable(t.id, pseudo)) return;

  const roundId = String(msg.roundId || "");
  const expectedRoundId = String(t.game?.hand?.roundId || "");
  if (!roundId || roundId !== expectedRoundId) return;

  const action = msg.action;
  if (!action || typeof action !== "object" || typeof action.type !== "string") {
    return;
  }

  if (action.type === "RESET_ROUND") {
    const nextHand = buildFreshAuthoritativeHand(
      t,
      typeof t.game?.dealerSeatIndex === "number" ? t.game.dealerSeatIndex : 0
    );
 
    t.game = {
      ...(t.game || createEmptyServerGame()),
      dealerSeatIndex: nextHand.dealerSeatIndex,
      currentTurnSeatIndex: nextHand.currentTurnSeatIndex,
      hand: nextHand,
      version: (t.game?.version || 0) + 1,
    };

    broadcastTables();
    return;
  }

if (action.type === "PLAY_CARD") {
  const currentHand = {
    ...createEmptyHandState(),
    ...(t.game?.hand || {}),
  };

  const actorSeatIndex = t.seats.findIndex((seatPseudo) => seatPseudo === pseudo);
  if (actorSeatIndex === -1) return;

  const nextHand = applyPlayCardToAuthoritativeHand(
    currentHand,
    actorSeatIndex,
    action
  );

  if (!nextHand) return;

  t.game = {
    ...(t.game || createEmptyServerGame()),
    dealerSeatIndex: nextHand.dealerSeatIndex,
    currentTurnSeatIndex: nextHand.currentTurnSeatIndex,
    hand: nextHand,
    version: (t.game?.version || 0) + 1,
  };

  broadcastToTable(t.id, {
    type: "table_game_action",
    tableId: t.id,
    roundId,
    action,
    actor: pseudo,
  });

  broadcastTables();

  playBotCardsUntilHumanTurn(t);
  scheduleAdvanceCompletedTrick(t);
  return;
}

if (
  action.type === "PASS_ANNOUNCEMENT" ||
  action.type === "DECLARE_ANNOUNCEMENT"
) {
  broadcastToTable(t.id, {
    type: "table_game_action",
    tableId: t.id,
    roundId,
    action,
    actor: pseudo,
  });
  return;
}
  const currentHand = {
    ...createEmptyHandState(),
    ...(t.game?.hand || {}),
  };

  const actorSeatIndex = t.seats.findIndex((seatPseudo) => seatPseudo === pseudo);
  if (actorSeatIndex === -1) return;

  const activeSeatIndex = currentHand.currentTurnSeatIndex;
  const activeSeatPseudo =
    activeSeatIndex != null ? t.seats[activeSeatIndex] : null;

  let effectiveSeatIndex = actorSeatIndex;

  if (actorSeatIndex !== activeSeatIndex) {
    const actorIsHuman = !isBotPseudo(pseudo);
    const activeIsBot = isBotPseudo(activeSeatPseudo);
    const canProxyBotPass = actorIsHuman && activeIsBot && action.type === "PASS";

    if (!canProxyBotPass) return;

    effectiveSeatIndex = activeSeatIndex;
  }

  const nextHand = applyTableGameActionToHand(
    t,
    currentHand,
    effectiveSeatIndex,
    action
  );

  if (nextHand === currentHand) return;

  t.game = {
    ...(t.game || createEmptyServerGame()),
    dealerSeatIndex:
      typeof nextHand.dealerSeatIndex === "number"
        ? nextHand.dealerSeatIndex
        : (t.game?.dealerSeatIndex || 0),
    currentTurnSeatIndex:
      nextHand.currentTurnSeatIndex != null
        ? nextHand.currentTurnSeatIndex
        : null,
    hand: nextHand,
    version: (t.game?.version || 0) + 1,
  };

  broadcastTables();

  // on garde le rebroadcast pour ne pas casser le frontend actuel
    broadcastToTable(t.id, {
    type: "table_game_action",
    tableId: t.id,
    roundId,
    action,
    actor: pseudo,
  });

  broadcastTables();

  playBotCardsUntilHumanTurn(t);
  return;
}
    if (msg.type === "update_avatar") {
      const avatar = String(msg.avatar || "").trim();
      if (!avatar) return;

      const p = playersMap.get(pseudo);
      if (p) {
        p.avatar = avatar;
        broadcastPlayers();
        broadcastTables();
      }
      return;
    }

    if (msg.type === "get_players") {
      ws.send(JSON.stringify({ type: "players", players: playersArray() }));
      return;
    }

    // ===============================
    // TABLES
    // ===============================
    if (msg.type === "get_tables") {
      ws.send(JSON.stringify({ type: "tables", tables: tablesArray() }));
      return;
    }

    if (msg.type === "create_table") {
      const mode = String(msg.mode || "classic").trim() || "classic";
      const t = createTable(mode);
      system(`ðŸŸ¢ Table ${t.id} crÃ©Ã©e (${mode})`);
      broadcastTables();
      return;
    }

    if (msg.type === "set_table_mode") {
      const tableId = normalizeTableId(msg.tableId);
      const mode = String(msg.mode || "").trim();
      const t = tableId ? tablesMap.get(tableId) : null;
      if (!t) return;

      if (!["classic", "contree", "moderne"].includes(mode)) return;

      const count = t.seats.filter(Boolean).length;
      if (count > 0) {
        system(`â›” Mode non modifiable: table ${t.id} non vide (${count}/4)`);
        return;
      }

      t.mode = mode;
      system(`âš™ï¸ Table ${t.id} passe en mode ${mode}`);
      broadcastTables();
      return;
    }

if (msg.type === "join_table") {
  const tableId = normalizeTableId(msg.tableId);
  const t = tableId ? tablesMap.get(tableId) : null;
  if (!t) return;

  const prev = findPlayerTable(pseudo);
  const wasAlreadyInTargetTable =
    prev && Number(prev.table.id) === Number(t.id);

  // dÃ©jÃ  assis dans cette table : on rattache juste le socket
  if (wasAlreadyInTargetTable) {
  ws.tableId = t.id;
  refreshServerGameForTable(t);
  broadcastTables();

  ws.send(
    JSON.stringify({
      type: "joined_table",
      tableId: t.id,
      mode: t.mode,
    })
  );
  return;
}

  // place libre OU place occupÃ©e par un bot remplaÃ§able
  const freeIdx = t.seats.findIndex((s) => !s);
  const botIdx = t.seats.findIndex((s) => isBotPseudo(s));
  const targetIdx = freeIdx !== -1 ? freeIdx : botIdx;

  // vraiment pleine = 4 humains
  if (targetIdx === -1) {
    ws.send(
      JSON.stringify({
        type: "join_table_denied",
        tableId: t.id,
        reason: "FULL",
      })
    );
    return;
  }

  // s'il Ã©tait dans une autre table, on libÃ¨re proprement l'ancienne place
  let oldTableId = null;
  if (prev) {
    oldTableId = prev.table.id;
    prev.table.seats[prev.seatIndex] = null;
  }

  if (prev && Number(prev.table.id) !== Number(t.id)) {
    refreshServerGameForTable(prev.table);
  }

  const replacedBot = isBotPseudo(t.seats[targetIdx]) ? t.seats[targetIdx] : null;
  const shouldResetHandAfterReplacingBot =
    !!replacedBot &&
    [
      "ANNOUNCE_ATOUT_TOUR_1",
      "ANNOUNCE_ATOUT_TOUR_2",
      "ENCHERES",
      "ANNONCES_MODERNE",
    ].includes(t.game?.hand?.phase);

  // rattachement + installation dans la table
  ws.tableId = t.id;
  t.seats[targetIdx] = pseudo;
  refreshServerGameForTable(t);

  if (shouldResetHandAfterReplacingBot) {
    const nextHand = buildFreshAuthoritativeHand(
      t,
      typeof t.game?.dealerSeatIndex === "number" ? t.game.dealerSeatIndex : 0
    );

    t.game = {
      ...(t.game || createEmptyServerGame()),
      dealerSeatIndex: nextHand.dealerSeatIndex,
      currentTurnSeatIndex: nextHand.currentTurnSeatIndex,
      hand: nextHand,
      version: (t.game?.version || 0) + 1,
    };
  }

  broadcastTables();

  if (oldTableId && Number(oldTableId) !== Number(t.id)) {
    broadcastToTable(oldTableId, {
      type: "table_system",
      tableId: oldTableId,
      text: `${pseudo} a quittÃ© la table`,
    });
  }

  broadcastToTable(t.id, {
    type: "table_system",
    tableId: t.id,
    text: replacedBot
      ? `${pseudo} a remplacÃ© un bot Ã  la place ${targetIdx + 1}`
      : `${pseudo} a pris la place ${targetIdx + 1}`,
  });

  ws.send(
    JSON.stringify({
      type: "joined_table",
      tableId: t.id,
      mode: t.mode,
    })
  );

  return;
}


if (msg.type === "choose_seat") {
  const tableId =
    msg.tableId != null
      ? normalizeTableId(msg.tableId)
      : normalizeTableId(ws.tableId);

  const t = tableId ? tablesMap.get(tableId) : null;
  if (!t) return;

  const seatIndex = Number(msg.seatIndex);

  if (
    !Number.isInteger(seatIndex) ||
    seatIndex < 0 ||
    seatIndex >= t.seats.length
  ) {
    ws.send(
      JSON.stringify({
        type: "choose_seat_denied",
        tableId: t.id,
        reason: "INVALID_SEAT",
      })
    );
    return;
  }

  // sÃ©curitÃ© forte :
  // le joueur doit dÃ©jÃ  Ãªtre rÃ©ellement assis dans CETTE table
  const realSeat = findPlayerTable(pseudo);
  if (!realSeat || Number(realSeat.table.id) !== Number(t.id)) {
    ws.send(
      JSON.stringify({
        type: "choose_seat_denied",
        tableId: t.id,
        reason: "NOT_IN_TABLE",
      })
    );
    return;
  }

  ws.tableId = t.id;

  const currentSeatIndex = realSeat.seatIndex;
  const wasAlreadySeatedHere = currentSeatIndex !== -1;

  // clic sur sa propre place
  if (currentSeatIndex === seatIndex) {
    ws.send(
      JSON.stringify({
        type: "seat_chosen",
        tableId: t.id,
        seatIndex,
      })
    );
    return;
  }

  const targetSeat = t.seats[seatIndex];
  const targetIsBot = isBotPseudo(targetSeat);

  // place prise par un humain
  if (targetSeat && !targetIsBot) {
    ws.send(
      JSON.stringify({
        type: "choose_seat_denied",
        tableId: t.id,
        reason: "SEAT_TAKEN",
      })
    );
    return;
  }

  const targetCountBefore = t.seats.filter(Boolean).length;

  // dÃ©placement interne Ã  la mÃªme table
  t.seats[currentSeatIndex] = null;
  t.seats[seatIndex] = pseudo;
  refreshServerGameForTable(t);
  broadcastTables();

  ws.send(
    JSON.stringify({
      type: "seat_chosen",
      tableId: t.id,
      seatIndex,
    })
  );

  broadcastToTable(t.id, {
    type: "table_system",
    tableId: t.id,
    text: targetIsBot
      ? `${pseudo} a remplacÃ© un bot Ã  la place ${seatIndex + 1}`
      : `${pseudo} a pris la place ${seatIndex + 1}`,
  });

  const targetCountAfter = t.seats.filter(Boolean).length;

  if (
    !wasAlreadySeatedHere &&
    targetCountBefore === 3 &&
    targetCountAfter === 4
  ) {
    broadcastToTable(t.id, {
      type: "table_system",
      tableId: t.id,
      text: "Table complÃ¨te (4/4)",
    });
  }

  return;
}
    if (msg.type === "leave_table") {
      // si tableId absent -> quitte n'importe quelle table
      const tableId = msg.tableId != null ? normalizeTableId(msg.tableId) : null;

      if (tableId) {
        const t = tablesMap.get(tableId);
        if (!t) return;

        const idx = t.seats.findIndex((p) => p === pseudo);
        if (idx !== -1) {
          t.seats[idx] = null;
         refreshServerGameForTable(t);
          if (Number(ws.tableId) === Number(t.id)) {
            ws.tableId = null;
          }

          broadcastTables();

          broadcastToTable(t.id, {
            type: "table_system",
            tableId: t.id,
            text: `${pseudo} a quittÃ© la table`,
          });
        }
        return;
      }

      const left = removePlayerFromAnyTable(pseudo);
      if (left) {
        if (Number(ws.tableId) === Number(left)) {
          ws.tableId = null;
        }
       const leftTable = tablesMap.get(left);
if (leftTable) {
  refreshServerGameForTable(leftTable);
}
        broadcastTables();

        broadcastToTable(left, {
          type: "table_system",
          tableId: left,
          text: `${pseudo} a quittÃ© la table`,
        });
      }
      return;
    }
  });

  ws.on("close", () => {
    if (!ws.pseudo) return;

    const pseudo = ws.pseudo;
    const p = playersMap.get(pseudo);
    if (!p) return;

    p.count -= 1;

    // derniÃ¨re connexion du pseudo -> on le sort aussi des tables
    if (p.count <= 0) {
      playersMap.delete(pseudo);

      const leftTableId = removePlayerFromAnyTable(pseudo);
      const leftTable = tablesMap.get(leftTableId);
      if (leftTable) {
        refreshServerGameForTable(leftTable);
      }
      broadcastPlayers();
      broadcastTables();

      if (leftTableId) {
        broadcastToTable(leftTableId, {
          type: "table_system",
          tableId: leftTableId,
          text: `${pseudo} a quittÃ© la table`,
        });
      }

      system(`â­ Ã€ bientÃ´t ${pseudo} â­`);
      return;
    }

    broadcastPlayers();
  });
});

wsServer.listen(WS_PORT);
