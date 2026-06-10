import express from "express";
import cors from "cors";
import http from "http";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { WebSocketServer } from "ws";
import db from "./db.js";

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
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }

      resolve({
        lastID: this.lastID,
        changes: this.changes,
      });
    });
  });
}

function normalizeUsername(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(password), salt, 64).toString("hex");

  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const parts = String(storedHash || "").split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  const [, salt, expectedHash] = parts;
  const actual = Buffer.from(
    scryptSync(String(password), salt, 64).toString("hex"),
    "hex"
  );
  const expected = Buffer.from(expectedHash, "hex");

  if (actual.length !== expected.length) return false;

  return timingSafeEqual(actual, expected);
}

function publicUserFromDb(row) {
  if (!row) return null;

  return {
    id: row.id,
    username: row.username,
    pseudo: row.username,
    email: row.email,
    avatar_url: row.avatar_url || "/avatar_blue.png",
  };
}

app.post("/api/register", async (req, res) => {
  try {
    const username = normalizeUsername(req.body?.username || req.body?.pseudo);
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const avatarUrl =
      String(req.body?.avatar_url || req.body?.avatar || "/avatar_blue.png").trim() ||
      "/avatar_blue.png";

    if (!username) {
      return res.status(400).json({ error: "Pseudo obligatoire" });
    }

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Email invalide" });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "Le mot de passe doit contenir au moins 6 caractères",
      });
    }

    const existing = await dbGet(
      `
        SELECT id, username, email
        FROM users
        WHERE lower(username) = lower(?) OR lower(email) = lower(?)
        LIMIT 1
      `,
      [username, email]
    );

    if (existing) {
      return res.status(409).json({
        error: "Pseudo ou email déjà utilisé",
      });
    }

    const passwordHash = hashPassword(password);

    const result = await dbRun(
      `
        INSERT INTO users (
          username,
          email,
          password_hash,
          avatar_url,
          role,
          is_approved,
          is_banned
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [username, email, passwordHash, avatarUrl, "player", 0, 0]
    );

    const created = await dbGet(
      `
        SELECT id, username, email, avatar_url, role, is_approved, is_banned
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [result.lastID]
    );

    return res.status(201).json({
      user: publicUserFromDb(created),
      pendingApproval: true,
      message:
        "Votre demande d'inscription a bien été envoyée. Elle devra être validée par Matt ou Véro.",
    });
  } catch (err) {
    console.error("Erreur /api/register", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "Email et mot de passe obligatoires" });
    }

    const user = await dbGet(
      `
        SELECT id, username, email, password_hash, avatar_url
        FROM users
        WHERE lower(email) = lower(?)
        LIMIT 1
      `,
      [email]
    );

    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "Identifiants invalides" });
    }

    const token = randomBytes(32).toString("hex");

    return res.json({
      token,
      user: publicUserFromDb(user),
    });
  } catch (err) {
    console.error("Erreur /api/login", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});
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

const animationState = {
  mode: "playlist",
  hostPseudo: null,
  title: "Playlist en continu",
};

function animationStatePayload() {
  return {
    type: "animation_state",
    mode: animationState.mode,
    hostPseudo: animationState.hostPseudo,
    title: animationState.title,
  };
}

function isAnimationHost(pseudo) {
  const normalized = String(pseudo || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  return ["vero", "matt"].includes(normalized);
}

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
  return "/avatar.png";
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

  const noTrumpPoints = {
    A: 19,
    10: 10,
    K: 4,
    Q: 3,
    J: 2,
    9: 0,
    8: 0,
    7: 0,
  };

  if (atout === "SA") {
    return noTrumpPoints[value] || 0;
  }

  const isTrump = atout === "TA" ? true : !atout ? false : suit === atout;

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

function computeClassicCapotScores(tricksWon) {
  const nousTricks = Number(tricksWon?.nous || 0);
  const euxTricks = Number(tricksWon?.eux || 0);

  if (nousTricks === 8) {
    return {
      nous: 252,
      eux: 0,
    };
  }

  if (euxTricks === 8) {
    return {
      nous: 0,
      eux: 252,
    };
  }

  return null;
}

function computeContreeContractScores(hand, scoreManche, tricksWon) {
  const contractValue = Number(hand?.contratValeur || 0);
  const multiplier = Number(hand?.contratMultiplicateur || 1);
  const takerTeam =
    typeof hand?.takerSeatIndex === "number" ? seatTeamKey(hand.takerSeatIndex) : null;

  if (!takerTeam || !contractValue) return scoreManche;

  const defenderTeam = takerTeam === "nous" ? "eux" : "nous";
  const takerPoints = Number(scoreManche?.[takerTeam] || 0);
  const defenderPoints = Number(scoreManche?.[defenderTeam] || 0);
  const takerTricks = Number(tricksWon?.[takerTeam] || 0);

  if (contractValue === 500) {
    const capotSucceeded = takerTricks === 8;
    const capotScore = 500 * multiplier;

    return capotSucceeded
      ? {
          [takerTeam]: capotScore,
          [defenderTeam]: 0,
        }
      : {
          [takerTeam]: 0,
          [defenderTeam]: capotScore,
        };
  }

  const takerSucceeded = takerPoints >= contractValue;
  const contractBonus = contractValue * multiplier;

  return takerSucceeded
    ? {
        [takerTeam]: takerPoints + contractBonus,
        [defenderTeam]: defenderPoints,
      }
    : {
        [takerTeam]: 0,
        [defenderTeam]: 162 + contractBonus,
      };
}

function buildServerBeloteRebeloteEntry(playerId, suit) {
  return {
    state: "READY",
    joueur: playerId,
    suit,
    firstPlayedValue: null,
    secondPlayedValue: null,
  };
}

function computeClassicBeloteRebelote(hands, atout) {
  if (!hands || !atout || atout === "SA") {
    return {
      state: "NONE",
      joueur: null,
      suit: null,
    };
  }

  if (atout === "TA") {
    const entries = [];

    for (let seatIndex = 0; seatIndex < 4; seatIndex++) {
      const playerId = LOGICAL_PLAYER_BY_SEAT_INDEX[seatIndex];
      const cards = Array.isArray(hands[playerId]) ? hands[playerId] : [];

      for (const suit of SUITS) {
        const hasKing = cards.some(
          (card) =>
            (card.suit ?? card.couleur ?? card.color ?? null) === suit &&
            String(card.value ?? card.rank ?? card.valeur ?? "").toUpperCase() === "K"
        );

        const hasQueen = cards.some(
          (card) =>
            (card.suit ?? card.couleur ?? card.color ?? null) === suit &&
            String(card.value ?? card.rank ?? card.valeur ?? "").toUpperCase() === "Q"
        );

        if (hasKing && hasQueen) {
          entries.push(buildServerBeloteRebeloteEntry(playerId, suit));
        }
      }
    }

    return entries.length > 0
      ? {
          state: "READY",
          joueur: null,
          suit: null,
          entries,
        }
      : {
          state: "NONE",
          joueur: null,
          suit: null,
          entries: [],
        };
  }

  for (let seatIndex = 0; seatIndex < 4; seatIndex++) {
    const playerId = LOGICAL_PLAYER_BY_SEAT_INDEX[seatIndex];
    const cards = Array.isArray(hands[playerId]) ? hands[playerId] : [];

    const hasKingOfTrump = cards.some(
      (card) =>
        (card.suit ?? card.couleur ?? card.color ?? null) === atout &&
        String(card.value ?? card.rank ?? card.valeur ?? "").toUpperCase() === "K"
    );

    const hasQueenOfTrump = cards.some(
      (card) =>
        (card.suit ?? card.couleur ?? card.color ?? null) === atout &&
        String(card.value ?? card.rank ?? card.valeur ?? "").toUpperCase() === "Q"
    );

    if (hasKingOfTrump && hasQueenOfTrump) {
      return buildServerBeloteRebeloteEntry(playerId, atout);
    }
  }

  return {
    state: "NONE",
    joueur: null,
    suit: null,
  };
}

function updateClassicBeloteRebeloteOnPlay(belote, playerId, card, atout) {
  if (!belote || belote.state === "NONE") return belote;
  if (!card || !atout || atout === "SA") return belote;

  const cardSuit = card.suit ?? card.couleur ?? card.color ?? null;
  const cardValue = String(card.value ?? card.rank ?? card.valeur ?? "").toUpperCase();

  if (cardValue !== "K" && cardValue !== "Q") return belote;

  if (atout === "TA") {
    const entries = Array.isArray(belote.entries) ? belote.entries : [];
    const entryIndex = entries.findIndex(
      (entry) =>
        entry?.joueur === playerId &&
        entry?.suit === cardSuit &&
        entry?.state !== "REBELOTE"
    );

    if (entryIndex === -1) return belote;

    const entry = entries[entryIndex];

    if (entry.firstPlayedValue === cardValue || entry.secondPlayedValue === cardValue) {
      return belote;
    }

    const nextEntry = !entry.firstPlayedValue
      ? {
          ...entry,
          state: "BELOTE",
          firstPlayedValue: cardValue,
        }
      : {
          ...entry,
          state: "REBELOTE",
          secondPlayedValue: cardValue,
        };

    const nextEntries = entries.map((candidate, index) =>
      index === entryIndex ? nextEntry : candidate
    );

    return {
      ...belote,
      state: nextEntry.state,
      joueur: playerId,
      suit: cardSuit,
      firstPlayedValue: nextEntry.firstPlayedValue,
      secondPlayedValue: nextEntry.secondPlayedValue,
      entries: nextEntries,
    };
  }

  if (!belote.joueur || belote.joueur !== playerId) return belote;
  if (cardSuit !== atout) return belote;

  if (belote.firstPlayedValue === cardValue || belote.secondPlayedValue === cardValue) {
    return belote;
  }

  if (!belote.firstPlayedValue) {
    return {
      ...belote,
      state: "BELOTE",
      suit: cardSuit,
      firstPlayedValue: cardValue,
    };
  }

  return {
    ...belote,
    state: "REBELOTE",
    suit: cardSuit,
    secondPlayedValue: cardValue,
  };
}

const SUITS = ["hearts", "diamonds", "clubs", "spades"];
const VALUES = ["7", "8", "9", "J", "Q", "K", "10", "A"];
const LOGICAL_PLAYER_BY_SEAT_INDEX = ["joueur2", "joueur4", "joueur3", "joueur1"];

const SERVER_SEQUENCE_ORDER = ["7", "8", "9", "10", "J", "Q", "K", "A"];
const SERVER_ANNOUNCE_TYPE_STRENGTH = {
  tierce: 1,
  cinquante: 2,
  cent: 3,
  carre: 4,
};
const SERVER_CARRE_POINTS = {
  J: 200,
  9: 150,
  A: 100,
  "10": 100,
  K: 100,
  Q: 100,
};

function normalizeServerModernValue(value) {
  return String(value ?? "").toUpperCase();
}

function getServerSequenceHighRankValue(value) {
  return SERVER_SEQUENCE_ORDER.indexOf(normalizeServerModernValue(value));
}

function getServerAnnounceStrength(announcement) {
  return SERVER_ANNOUNCE_TYPE_STRENGTH[announcement?.type] || 0;
}

function getServerModernCardKey(card) {
  if (!card) return "";
  const suit = card.suit ?? card.couleur ?? card.color ?? "";
  const value = normalizeServerModernValue(card.value ?? card.rank ?? card.valeur ?? "");
  return `${suit}:${value}`;
}

function getServerModernPlayerTeam(playerId) {
  const seatIndex = LOGICAL_PLAYER_BY_SEAT_INDEX.indexOf(playerId);
  return seatTeamKey(seatIndex);
}

function detectServerModernCarres(hand, playerId) {
  const byValue = {};

  for (const card of hand || []) {
    const value = normalizeServerModernValue(card.value ?? card.rank ?? card.valeur ?? "");
    if (!byValue[value]) byValue[value] = [];
    byValue[value].push(card);
  }

  const annonces = [];
  const team = getServerModernPlayerTeam(playerId);

  for (const value of Object.keys(byValue)) {
    if (byValue[value].length !== 4) continue;

    const points = SERVER_CARRE_POINTS[value] || 0;
    if (!points) continue;

    annonces.push({
      type: "carre",
      label: "Carré",
      points,
      highRank: value,
      highRankValue: getServerSequenceHighRankValue(value),
      suit: null,
      cards: byValue[value],
      playerId,
      team,
      isTrump: false,
    });
  }

  return annonces;
}

function pushServerModernSequenceAnnouncement(run, annonces, suit, playerId, atout) {
  if (!Array.isArray(run) || run.length < 3) return;

  const length = run.length;
  const highCard = run[run.length - 1];
  const highRank = normalizeServerModernValue(
    highCard?.value ?? highCard?.rank ?? highCard?.valeur ?? ""
  );
  const team = getServerModernPlayerTeam(playerId);

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
    highRankValue: getServerSequenceHighRankValue(highRank),
    suit,
    cards: [...run],
    playerId,
    team,
    isTrump: atout !== "SA" && atout !== "TA" && suit === atout,
  });
}

function detectServerModernSequences(hand, playerId, atout) {
  const bySuit = {};

  for (const card of hand || []) {
    const suit = card.suit ?? card.couleur ?? card.color ?? null;
    if (!suit) continue;
    if (!bySuit[suit]) bySuit[suit] = [];
    bySuit[suit].push(card);
  }

  const annonces = [];

  for (const suit of Object.keys(bySuit)) {
    const cards = [...bySuit[suit]].sort((a, b) => {
      const av = getServerSequenceHighRankValue(a.value ?? a.rank ?? a.valeur ?? "");
      const bv = getServerSequenceHighRankValue(b.value ?? b.rank ?? b.valeur ?? "");
      return av - bv;
    });

    if (cards.length === 0) continue;

    let run = [cards[0]];

    for (let i = 1; i < cards.length; i++) {
      const prev = getServerSequenceHighRankValue(
        cards[i - 1].value ?? cards[i - 1].rank ?? cards[i - 1].valeur ?? ""
      );
      const curr = getServerSequenceHighRankValue(
        cards[i].value ?? cards[i].rank ?? cards[i].valeur ?? ""
      );

      if (curr === prev + 1) {
        run.push(cards[i]);
      } else {
        pushServerModernSequenceAnnouncement(run, annonces, suit, playerId, atout);
        run = [cards[i]];
      }
    }

    pushServerModernSequenceAnnouncement(run, annonces, suit, playerId, atout);
  }

  return annonces;
}

function serverModernCardsOverlap(a, b) {
  const aKeys = new Set((a?.cards || []).map(getServerModernCardKey));
  return (b?.cards || []).some((card) => aKeys.has(getServerModernCardKey(card)));
}

function selectServerModernAnnouncementsWithoutOverlap(allAnnouncements) {
  const sorted = [...allAnnouncements].sort((a, b) => {
    const typeDiff = getServerAnnounceStrength(b) - getServerAnnounceStrength(a);
    if (typeDiff !== 0) return typeDiff;

    const pointsDiff = (b.points || 0) - (a.points || 0);
    if (pointsDiff !== 0) return pointsDiff;

    return (b.highRankValue || 0) - (a.highRankValue || 0);
  });

  const selected = [];

  for (const announcement of sorted) {
    const overlaps = selected.some((selectedAnnouncement) =>
      serverModernCardsOverlap(selectedAnnouncement, announcement)
    );

    if (!overlaps) selected.push(announcement);
  }

  return selected;
}

function detectServerModernAnnouncementsForPlayer(hand, playerId, atout) {
  const carres = detectServerModernCarres(hand, playerId);
  const sequences = detectServerModernSequences(hand, playerId, atout);
  return selectServerModernAnnouncementsWithoutOverlap([...carres, ...sequences]);
}

function buildServerModernAnnouncementsState(hands, atout) {
  const detectedByPlayer = {
    joueur1: [],
    joueur2: [],
    joueur3: [],
    joueur4: [],
  };

  for (let seatIndex = 0; seatIndex < 4; seatIndex++) {
    const playerId = LOGICAL_PLAYER_BY_SEAT_INDEX[seatIndex];
    const playerHand = Array.isArray(hands?.[playerId]) ? hands[playerId] : [];

    detectedByPlayer[playerId] = detectServerModernAnnouncementsForPlayer(
      playerHand,
      playerId,
      atout
    );
  }

  return {
    detectedByPlayer,
    declaredByPlayer: {},
    validated: [],
    winningTeam: null,
    resolved: false,
  };
}
function isServerModernAnnouncementTrump(announcement, atout) {
  if (!announcement || !announcement.suit) return false;
  if (atout === "SA" || atout === "TA") return false;
  return announcement.suit === atout;
}

function compareServerModernAnnouncements(a, b, atout) {
  if (!a && !b) return 0;
  if (a && !b) return 1;
  if (!a && b) return -1;

  const typeDiff = getServerAnnounceStrength(a) - getServerAnnounceStrength(b);
  if (typeDiff !== 0) return typeDiff > 0 ? 1 : -1;

  const highDiff = (a.highRankValue || 0) - (b.highRankValue || 0);
  if (highDiff !== 0) return highDiff > 0 ? 1 : -1;

  const aTrump = isServerModernAnnouncementTrump(a, atout);
  const bTrump = isServerModernAnnouncementTrump(b, atout);

  if (aTrump !== bTrump) return aTrump ? 1 : -1;

  return 0;
}

function getBestServerModernAnnouncement(announcements, atout) {
  if (!Array.isArray(announcements) || announcements.length === 0) return null;

  return announcements.reduce((best, current) => {
    if (!best) return current;
    return compareServerModernAnnouncements(current, best, atout) > 0
      ? current
      : best;
  }, null);
}

function createServerModernAnnouncementsStateSnapshot(modernAnnouncements) {
  return {
    detectedByPlayer: {
      joueur1: [],
      joueur2: [],
      joueur3: [],
      joueur4: [],
      ...(modernAnnouncements?.detectedByPlayer || {}),
    },
    declaredByPlayer: {
      ...(modernAnnouncements?.declaredByPlayer || {}),
    },
    validated: Array.isArray(modernAnnouncements?.validated)
      ? [...modernAnnouncements.validated]
      : [],
    winningTeam: modernAnnouncements?.winningTeam || null,
    resolved: !!modernAnnouncements?.resolved,
  };
}

function findServerDeclaredModernAnnouncement(current, playerId, action) {
  const detected = current.detectedByPlayer?.[playerId] || [];

  return detected.find((announcement) => {
    return (
      announcement.type === action.announcementType &&
      announcement.highRank === action.highRank &&
      (announcement.suit || null) === (action.suit || null)
    );
  }) || null;
}

function applyServerModernAnnouncementAction(table, currentHand, actorSeatIndex, action) {
  const hand = {
    ...createEmptyHandState(),
    ...(currentHand || {}),
  };

  if (table?.mode !== "moderne" && table?.mode !== "contree") return null;
  if (hand.phase !== "ANNONCES_MODERNE") return null;

  if (
    action?.type !== "PASS_ANNOUNCEMENT" &&
    action?.type !== "DECLARE_ANNOUNCEMENT"
  ) {
    return null;
  }

  if (
    hand.currentTurnSeatIndex == null ||
    actorSeatIndex !== hand.currentTurnSeatIndex
  ) {
    return null;
  }

  const playerId = LOGICAL_PLAYER_BY_SEAT_INDEX[actorSeatIndex];
  if (!playerId) return null;

  const current = createServerModernAnnouncementsStateSnapshot(
    hand.modernAnnouncements
  );

  if (
    Object.prototype.hasOwnProperty.call(current.declaredByPlayer, playerId)
  ) {
    return null;
  }

  const declaredByPlayer = {
    ...current.declaredByPlayer,
  };

  if (action.type === "PASS_ANNOUNCEMENT") {
    declaredByPlayer[playerId] = null;
  }

  if (action.type === "DECLARE_ANNOUNCEMENT") {
    const chosen = findServerDeclaredModernAnnouncement(current, playerId, action);
    if (!chosen) return null;

    declaredByPlayer[playerId] = chosen;
  }

  const everyoneAnswered = LOGICAL_PLAYER_BY_SEAT_INDEX.every((logicalPlayerId) =>
    Object.prototype.hasOwnProperty.call(declaredByPlayer, logicalPlayerId)
  );

  if (!everyoneAnswered) {
    return {
      ...hand,
      currentTurnSeatIndex: nextSeatIndex(actorSeatIndex),
      modernAnnouncements: {
        ...current,
        declaredByPlayer,
      },
    };
  }

  const nousAnnouncements = LOGICAL_PLAYER_BY_SEAT_INDEX
    .filter((logicalPlayerId) => getServerModernPlayerTeam(logicalPlayerId) === "nous")
    .map((logicalPlayerId) => declaredByPlayer[logicalPlayerId])
    .filter(Boolean);

  const euxAnnouncements = LOGICAL_PLAYER_BY_SEAT_INDEX
    .filter((logicalPlayerId) => getServerModernPlayerTeam(logicalPlayerId) === "eux")
    .map((logicalPlayerId) => declaredByPlayer[logicalPlayerId])
    .filter(Boolean);

  const bestNous = getBestServerModernAnnouncement(nousAnnouncements, hand.atout);
  const bestEux = getBestServerModernAnnouncement(euxAnnouncements, hand.atout);
  const comparison = compareServerModernAnnouncements(bestNous, bestEux, hand.atout);

  let winningTeam = null;
  let validated = [];

  if (comparison > 0) {
    winningTeam = "nous";
    validated = nousAnnouncements;
  } else if (comparison < 0) {
    winningTeam = "eux";
    validated = euxAnnouncements;
  }

  return {
    ...hand,
    phase: "PLI_EN_COURS",
    currentTurnSeatIndex: nextSeatIndex(hand.dealerSeatIndex),
    modernAnnouncements: {
      ...current,
      declaredByPlayer,
      validated,
      winningTeam,
      resolved: true,
    },
  };
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

  // aucun humain => table vide, pas de bots, reset du mode bots
  if (humanCount === 0) {
    table.botsEnabled = false;
    table.seats = table.seats.map((pseudo) => (isBotPseudo(pseudo) ? null : pseudo));
    return;
  }

  const hand = table.game?.hand || null;
  const handStarted =
    table.game?.status === "READY" &&
    hand?.roundId &&
    hand?.phase &&
    hand.phase !== "IDLE";

  // Avant demarrage, les bots ne completent que si un humain les demande.
  // Apres demarrage, ils peuvent encore remplacer un humain deconnecte.
  if (!table.botsEnabled && !handStarted) {
    table.seats = table.seats.map((pseudo) => (isBotPseudo(pseudo) ? null : pseudo));
    return;
  }

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
    tricksWon: {
      nous: 0,
      eux: 0,
    },

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

const MAX_TABLES = 6;

function createTable(mode = "classic") {
  const id = nextTableId++;
  tablesMap.set(id, {
    id,
    mode,
    seats: [null, null, null, null],
    visitors: [],
    botsEnabled: false,
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
    const visitors = Array.isArray(t.visitors) ? t.visitors.filter(Boolean) : [];
    const visitorsInfo = visitors.map((pseudo) => seatInfoFromPseudo(pseudo));
    const count = seats.filter((pseudo) => pseudo && !isBotPseudo(pseudo)).length;

    return {
      id: t.id,
      mode: t.mode,
      seats,
      seatsInfo,
      visitors,
      visitorsInfo,
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

function broadcastAnimationState() {
  broadcast(animationStatePayload());
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
        belote:
          table.mode === "classic" || table.mode === "moderne"
            ? computeClassicBeloteRebelote(completedDeal.hands, chosenSuit)
            : hand.belote,
        contratMultiplicateur: 1,
        currentTurnSeatIndex: startSeatIndex,
        modernAnnouncements:
          table.mode === "moderne"
            ? buildServerModernAnnouncementsState(completedDeal.hands, chosenSuit)
            : hand.modernAnnouncements,
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
        belote:
          table.mode === "classic" || table.mode === "moderne"
            ? computeClassicBeloteRebelote(completedDeal.hands, action.suit)
            : hand.belote,
        contratMultiplicateur: 1,
        currentTurnSeatIndex: startSeatIndex,
        modernAnnouncements:
          table.mode === "moderne"
            ? buildServerModernAnnouncementsState(completedDeal.hands, action.suit)
            : hand.modernAnnouncements,
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
        // SERVER_CONTREE_COMPLETE_DEAL_AFTER_CONTRACT_MARKER
        const completedDeal = completeAuthoritativeDealToEightAfterTake(
          hand,
          currentBid.seatIndex,
          false
        );

        return {
          ...hand,
          phase: "ANNONCES_MODERNE",
          atout: currentBid.suit,
          takerSeatIndex: currentBid.seatIndex,
          contratValeur: currentBid.value,
          belote: computeClassicBeloteRebelote(completedDeal.hands, currentBid.suit),
          currentTurnSeatIndex: startSeatIndex,
          modernAnnouncements: buildServerModernAnnouncementsState(
            completedDeal.hands,
            currentBid.suit
          ),
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

      return {
        ...hand,
        passesAfterBid: newPassesAfterBid,
        currentTurnSeatIndex: nextTurnSeatIndex,
      };
    }

    const newPasses = (hand.passes || 0) + 1;

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

    if (atout === "TA") {
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
    }

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

  if (currentTrickCards.length > 0 && atout === "TA" && requestedSuit) {
    const hasRequestedSuitForTa = playerHand.some(
      (card) => getCardSuit(card) === requestedSuit
    );

    if (hasRequestedSuitForTa) {
      const currentBestRequestedSuitEntry = currentTrickCards
        .filter((entry) => entry?.card && getCardSuit(entry.card) === requestedSuit)
        .reduce((bestEntry, entry) => {
          if (!bestEntry) return entry;
          return getRankValue(entry.card) > getRankValue(bestEntry.card)
            ? entry
            : bestEntry;
        }, null);

      const currentBestRank = currentBestRequestedSuitEntry?.card
        ? getRankValue(currentBestRequestedSuitEntry.card)
        : 0;

      const hasHigherRequestedSuitCard = playerHand.some(
        (card) =>
          getCardSuit(card) === requestedSuit && getRankValue(card) > currentBestRank
      );

      if (hasHigherRequestedSuitCard && getRankValue(playedCard) <= currentBestRank) {
        return null;
      }
    }
  }

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

  const nextBelote = updateClassicBeloteRebeloteOnPlay(
    hand.belote,
    playerId,
    playedCard,
    hand.atout
  );

  return {
    ...hand,
    phase: trickIsComplete ? "PLI_TERMINE" : "PLI_EN_COURS",
    hands: nextHands,
    belote: nextBelote,
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

    if (atout === "TA") {
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
    }

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

  const taHigherRequestedSuitCard =
    atout === "TA" && requestedSuit && currentBestEntry
      ? playerHand
          .filter(
            (card) =>
              card &&
              getBotCardSuit(card) === requestedSuit &&
              getBotRankValue(card) > getBotRankValue(currentBestEntry.card)
          )
          .sort((a, b) => getBotRankValue(a) - getBotRankValue(b))[0] || null
      : null;
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
    taHigherRequestedSuitCard ||
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
    const nextTricksWon = {
      nous:
        (currentHand.tricksWon?.nous || 0) +
        (winnerTeamKey === "nous" ? 1 : 0),
      eux:
        (currentHand.tricksWon?.eux || 0) +
        (winnerTeamKey === "eux" ? 1 : 0),
    };

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
    const classicCapotScores =
      allHandsEmpty && table.mode === "classic"
        ? computeClassicCapotScores(nextTricksWon)
        : null;

    const nextContractScores =
      allHandsEmpty && table.mode === "classic"
        ? classicCapotScores || computeClassicContractScores(currentHand, nextScoreManche)
        : allHandsEmpty && table.mode === "contree"
          ? computeContreeContractScores(currentHand, nextScoreManche, nextTricksWon)
          : nextScoreManche;

    const beloteBonusesByTeam = {
      nous: 0,
      eux: 0,
    };

    if (
      allHandsEmpty &&
      (table.mode === "classic" || table.mode === "moderne" || table.mode === "contree") &&
      currentHand.atout !== "SA"
    ) {
      if (currentHand.atout === "TA") {
        for (const entry of currentHand.belote?.entries || []) {
          if (entry?.state !== "REBELOTE" || !entry?.joueur) continue;

          const team = seatTeamKey(
            LOGICAL_PLAYER_BY_SEAT_INDEX.indexOf(entry.joueur)
          );

          if (team === "nous" || team === "eux") {
            beloteBonusesByTeam[team] += 20;
          }
        }
      } else if (currentHand.belote?.state === "REBELOTE" && currentHand.belote?.joueur) {
        const team = seatTeamKey(
          LOGICAL_PLAYER_BY_SEAT_INDEX.indexOf(currentHand.belote.joueur)
        );

        if (team === "nous" || team === "eux") {
          beloteBonusesByTeam[team] += 20;
        }
      }
    }

    const nextScoreWithBelote =
      beloteBonusesByTeam.nous > 0 || beloteBonusesByTeam.eux > 0
        ? {
            nous: nextContractScores.nous + beloteBonusesByTeam.nous,
            eux: nextContractScores.eux + beloteBonusesByTeam.eux,
          }
        : nextContractScores;

    const modernAnnouncementWinningTeam =
      allHandsEmpty && (table.mode === "moderne" || table.mode === "contree")
        ? currentHand.modernAnnouncements?.winningTeam || null
        : null;

    const modernAnnouncementPoints =
      allHandsEmpty &&
      (table.mode === "moderne" || table.mode === "contree") &&
      (modernAnnouncementWinningTeam === "nous" || modernAnnouncementWinningTeam === "eux")
        ? (currentHand.modernAnnouncements?.validated || []).reduce(
            (total, announcement) => total + (announcement?.points || 0),
            0
          )
        : 0;

    const nextScoreWithModernAnnouncements =
      modernAnnouncementPoints > 0
        ? {
            nous:
              nextScoreWithBelote.nous +
              (modernAnnouncementWinningTeam === "nous" ? modernAnnouncementPoints : 0),
            eux:
              nextScoreWithBelote.eux +
              (modernAnnouncementWinningTeam === "eux" ? modernAnnouncementPoints : 0),
          }
        : nextScoreWithBelote;

    const nextScores = allHandsEmpty
      ? {
          nous:
            (currentHand.scores?.nous || 0) + nextScoreWithModernAnnouncements.nous,
          eux:
            (currentHand.scores?.eux || 0) + nextScoreWithModernAnnouncements.eux,
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
      scoreManche: allHandsEmpty ? nextScoreWithModernAnnouncements : nextScoreManche,
      tricksWon: nextTricksWon,
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
function resumeTableAfterSeatChange(table) {
  if (!table?.game?.hand) return;

  playBotCardsUntilHumanTurn(table);
  scheduleAdvanceCompletedTrick(table);
  scheduleStartNextHandAfterEnd(table);
}

function isPlayerInTable(tableId, pseudo) {
  const t = tablesMap.get(Number(tableId));
  if (!t) return false;
  return t.seats.some((p) => p === pseudo);
}

function isVisitorInTable(tableId, pseudo) {
  const t = tablesMap.get(Number(tableId));
  if (!t || !Array.isArray(t.visitors)) return false;
  return t.visitors.some((p) => p === pseudo);
}

function isTableParticipant(tableId, pseudo) {
  return isPlayerInTable(tableId, pseudo) || isVisitorInTable(tableId, pseudo);
}

function removeVisitorFromAnyTable(pseudo) {
  let leftTableId = null;

  for (const t of tablesMap.values()) {
    if (!Array.isArray(t.visitors)) {
      t.visitors = [];
      continue;
    }

    const before = t.visitors.length;
    t.visitors = t.visitors.filter((p) => p !== pseudo);

    if (t.visitors.length !== before) {
      leftTableId = t.id;
    }
  }

  return leftTableId;
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
  ws.tableRole = null;

  // Ã©tat initial
  ws.send(JSON.stringify({ type: "players", players: playersArray() }));
  ws.send(JSON.stringify({ type: "tables", tables: tablesArray() }));
  ws.send(JSON.stringify(animationStatePayload()));

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
    if (msg.type === "get_animation_state") {
      ws.send(JSON.stringify(animationStatePayload()));
      return;
    }

    if (msg.type === "start_live_animation") {
      if (!isAnimationHost(pseudo)) {
        ws.send(
          JSON.stringify({
            type: "animation_denied",
            reason: "NOT_ANIMATION_HOST",
          })
        );
        return;
      }

      animationState.mode = "live";
      animationState.hostPseudo = pseudo;
      animationState.title = `Direct DJ - ${pseudo}`;
      broadcastAnimationState();
      return;
    }

    if (msg.type === "stop_live_animation") {
      if (!isAnimationHost(pseudo)) {
        ws.send(
          JSON.stringify({
            type: "animation_denied",
            reason: "NOT_ANIMATION_HOST",
          })
        );
        return;
      }

      if (animationState.hostPseudo && animationState.hostPseudo !== pseudo) {
        ws.send(
          JSON.stringify({
            type: "animation_denied",
            reason: "NOT_CURRENT_HOST",
          })
        );
        return;
      }

      animationState.mode = "playlist";
      animationState.hostPseudo = null;
      animationState.title = "Playlist en continu";
      broadcastAnimationState();
      return;
    }

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
  // Un joueur assis ou un visiteur peut tchater sur la table.
  if (!isTableParticipant(ws.tableId, pseudo)) return;

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

    nextHand.scores =
      t.game?.hand?.phase === "FIN_DE_PARTIE"
        ? { nous: 0, eux: 0 }
        : t.game?.hand?.scores || { nous: 0, eux: 0 };

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
      dealerSeatIndex:
        typeof nextHand.dealerSeatIndex === "number"
          ? nextHand.dealerSeatIndex
          : t.game?.dealerSeatIndex || 0,
      currentTurnSeatIndex:
        nextHand.currentTurnSeatIndex != null
          ? nextHand.currentTurnSeatIndex
          : null,
      hand: nextHand,
      version: (t.game?.version || 0) + 1,
    };

    broadcastTables();

    playBotCardsUntilHumanTurn(t);
    scheduleAdvanceCompletedTrick(t);
    return;
  }

if (
  action.type === "PASS_ANNOUNCEMENT" ||
  action.type === "DECLARE_ANNOUNCEMENT"
) {
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
    const canProxyBotAnnouncement = actorIsHuman && activeIsBot;

    if (!canProxyBotAnnouncement) return;

    effectiveSeatIndex = activeSeatIndex;
  }

  const nextHand = applyServerModernAnnouncementAction(
    t,
    currentHand,
    effectiveSeatIndex,
    action
  );

  if (!nextHand) return;

  t.game = {
    ...(t.game || createEmptyServerGame()),
    dealerSeatIndex:
      typeof nextHand.dealerSeatIndex === "number"
        ? nextHand.dealerSeatIndex
        : t.game?.dealerSeatIndex || 0,
    currentTurnSeatIndex:
      nextHand.currentTurnSeatIndex != null
        ? nextHand.currentTurnSeatIndex
        : null,
    hand: nextHand,
    version: (t.game?.version || 0) + 1,
  };

  broadcastTables();


  if (nextHand.phase === "PLI_EN_COURS") {
    playBotCardsUntilHumanTurn(t);
  }

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
      if (tablesMap.size >= MAX_TABLES) {
        ws.send(
          JSON.stringify({
            type: "create_table_denied",
            reason: "Nombre maximum de tables atteint.",
            maxTables: MAX_TABLES,
          })
        );
        return;
      }

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

if (msg.type === "start_with_bots") {
  const tableId = normalizeTableId(msg.tableId);
  const t = tableId ? tablesMap.get(tableId) : null;
  if (!t) return;

  if (!isPlayerInTable(t.id, pseudo)) {
    return;
  }

  const humanCount = getHumanSeatCount(t);
  if (humanCount <= 0 || humanCount >= 4) {
    return;
  }

  t.botsEnabled = true;
  refreshServerGameForTable(t);
  broadcastTables();

  broadcastToTable(t.id, {
    type: "table_system",
    tableId: t.id,
    text: "D\u00E9marrage avec bots",
  });

  playBotCardsUntilHumanTurn(t);
  return;
}

if (msg.type === "watch_table") {
  const tableId = normalizeTableId(msg.tableId);
  const t = tableId ? tablesMap.get(tableId) : null;
  if (!t) return;

  removeVisitorFromAnyTable(pseudo);

  if (!Array.isArray(t.visitors)) {
    t.visitors = [];
  }

  if (!isPlayerInTable(t.id, pseudo) && !t.visitors.includes(pseudo)) {
    t.visitors.push(pseudo);
  }

  ws.tableId = t.id;
  ws.tableRole = "visitor";

  broadcastTables();

  broadcastToTable(t.id, {
    type: "table_system",
    tableId: t.id,
    text: `${pseudo} regarde la table`,
  });

  ws.send(
    JSON.stringify({
      type: "watching_table",
      tableId: t.id,
      mode: t.mode,
    })
  );

  return;
}

if (msg.type === "join_table") {
  const tableId = normalizeTableId(msg.tableId);
  const t = tableId ? tablesMap.get(tableId) : null;
  if (!t) return;

  removeVisitorFromAnyTable(pseudo);

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

  // rattachement + installation dans la table
  ws.tableId = t.id;
  t.seats[targetIdx] = pseudo;
  refreshServerGameForTable(t);
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
          resumeTableAfterSeatChange(t);
          if (Number(ws.tableId) === Number(t.id)) {
            ws.tableId = null;
            ws.tableRole = null;
          }

          broadcastTables();

          broadcastToTable(t.id, {
            type: "table_system",
            tableId: t.id,
            text: `${pseudo} a quitt\u00E9 la table`,
          });
        } else if (Array.isArray(t.visitors) && t.visitors.includes(pseudo)) {
          t.visitors = t.visitors.filter((p) => p !== pseudo);

          if (Number(ws.tableId) === Number(t.id)) {
            ws.tableId = null;
            ws.tableRole = null;
          }

          broadcastTables();

          broadcastToTable(t.id, {
            type: "table_system",
            tableId: t.id,
            text: `${pseudo} ne regarde plus la table`,
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
  resumeTableAfterSeatChange(leftTable);
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
      const leftVisitorTableId = removeVisitorFromAnyTable(pseudo);

      const leftTable = tablesMap.get(leftTableId);
      if (leftTable) {
        refreshServerGameForTable(leftTable);
        resumeTableAfterSeatChange(leftTable);
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

      if (leftVisitorTableId && Number(leftVisitorTableId) !== Number(leftTableId)) {
        broadcastToTable(leftVisitorTableId, {
          type: "table_system",
          tableId: leftVisitorTableId,
          text: `${pseudo} ne regarde plus la table`,
        });
      }

      system(`â­ Ã€ bientÃ´t ${pseudo} â­`);
      return;
    }

    broadcastPlayers();
  });
});

wsServer.listen(WS_PORT);
