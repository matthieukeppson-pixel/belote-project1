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
 *   - set_table_mode { tableId, mode }    (autorisé seulement si table vide)
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
 *   - joined_table { tableId, mode }      ✅ ACK join
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
  console.log(`✅ Backend HTTP actif sur http://localhost:${HTTP_PORT}`);
});

// ===============================
// WEBSOCKET (SALON)
// ===============================
const wsServer = http.createServer();
const wss = new WebSocketServer({ server: wsServer });

console.log(`✅ WebSocket actif sur ws://localhost:${WS_PORT}`);

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
    phase: "IDLE", // IDLE | DEALING | BIDDING | PLAYING | SCORING
    roundNumber: 0,
    trickNumber: 0,

    roundId: null,
    createdAt: null,
    dealSeed: null,

    trumpSuit: null,
    currentBid: null,
    takerSeatIndex: null,

    leadingSeatIndex: null,
    trickCards: [null, null, null, null],

    scores: {
      nous: 0,
      eux: 0,
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

function refreshServerGameForTable(table) {
  if (!table) return;
 syncBotsForTable(table);
  const seated = getSeatedPlayersInOrder(table);
  const count = seated.length;

  if (count < 4) {
    table.game = {
      ...createEmptyServerGame(),
      version: (table.game?.version || 0) + 1,
    };
    return;
  }
  const existingHand = {
    ...createEmptyHandState(),
    ...(table.game?.hand || {}),
  };

const now = Date.now();

const sharedHand = existingHand.roundId
  ? {
      ...existingHand,
      createdAt: existingHand.createdAt || now,
      dealSeed: existingHand.dealSeed || `${table.id}-${now}-${Math.random()}`,
    }
  : {
      ...existingHand,
      roundId: `table-${table.id}-round-${now}`,
      createdAt: now,
      dealSeed: `${table.id}-${now}-${Math.random()}`,
    };

table.game = {
  ...(table.game || createEmptyServerGame()),
  status: "READY",
  players: seated.map((entry) => entry.pseudo),
  teams: buildTeamsFromSeats(table),
  dealerSeatIndex:
    typeof table.game?.dealerSeatIndex === "number"
      ? table.game.dealerSeatIndex
      : 0,
  currentTurnSeatIndex:
    table.game?.currentTurnSeatIndex != null
      ? table.game.currentTurnSeatIndex
      : ((table.game?.dealerSeatIndex ?? 0) + 1) % 4,
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

  // état initial
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
        system(`⭐ Bienvenue ${pseudo} ⭐`);
      } else {
        existing.count += 1;
        // ✅ on ne touche PAS existing.avatar ici
      }

      broadcastPlayers();
      broadcastTables();
      return;
    }

    // tout le reste nécessite un pseudo
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
    const now = Date.now();

    t.game = {
      ...(t.game || createEmptyServerGame()),
      hand: {
        ...createEmptyHandState(),
        ...(t.game?.hand || {}),
        roundId: `table-${t.id}-round-${now}`,
        createdAt: now,
        dealSeed: `${t.id}-${now}-${Math.random()}`,
      },
    };

    broadcastTables();
    return;
  }

  broadcastToTable(t.id, {
    type: "table_game_action",
    tableId: t.id,
    roundId,
    action,
    actor: pseudo,
  });
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
      system(`🟢 Table ${t.id} créée (${mode})`);
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
        system(`⛔ Mode non modifiable: table ${t.id} non vide (${count}/4)`);
        return;
      }

      t.mode = mode;
      system(`⚙️ Table ${t.id} passe en mode ${mode}`);
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

  // déjà assis dans cette table : on rattache juste le socket
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

  // place libre OU place occupée par un bot remplaçable
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

  // s'il était dans une autre table, on libère proprement l'ancienne place
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
      text: `${pseudo} a quitté la table`,
    });
  }

  broadcastToTable(t.id, {
    type: "table_system",
    tableId: t.id,
    text: replacedBot
      ? `${pseudo} a remplacé un bot à la place ${targetIdx + 1}`
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

  // sécurité forte :
  // le joueur doit déjà être réellement assis dans CETTE table
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

  // déplacement interne à la même table
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
      ? `${pseudo} a remplacé un bot à la place ${seatIndex + 1}`
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
      text: "Table complète (4/4)",
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
            text: `${pseudo} a quitté la table`,
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
          text: `${pseudo} a quitté la table`,
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

    // dernière connexion du pseudo -> on le sort aussi des tables
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
          text: `${pseudo} a quitté la table`,
        });
      }

      system(`⭐ À bientôt ${pseudo} ⭐`);
      return;
    }

    broadcastPlayers();
  });
});

wsServer.listen(WS_PORT);


























