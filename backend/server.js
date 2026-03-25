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

function createTable(mode = "classic") {
  const id = nextTableId++;
  tablesMap.set(id, { id, mode, seats: [null, null, null, null] });
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

  const p = playersMap.get(pseudo);

  return {
    name: pseudo,
    avatar: p?.avatar || "/avatar_blue.png",
  };
}

function tablesArray() {
  return Array.from(tablesMap.values()).map((t) => {
    const seats = t.seats.map((x) => x || null);
    const seatsInfo = seats.map((pseudo) => seatInfoFromPseudo(pseudo));
    const count = seats.filter(Boolean).length;

    return {
      id: t.id,
      mode: t.mode,
      seats,
      seatsInfo,
      count,
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

      broadcastToTable(ws.tableId, {
        type: "table_message",
        tableId: ws.tableId,
        user: pseudo,
        text,
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

  // déjà assis sur cette table : on rattache juste le socket
  if (wasAlreadyInTargetTable) {
    ws.tableId = t.id;
    ws.send(
      JSON.stringify({
        type: "joined_table",
        tableId: t.id,
        mode: t.mode,
      })
    );
    return;
  }

  const freeIdx = t.seats.findIndex((s) => !s);

  // on garde le comportement actuel : impossible d'entrer si table pleine
  if (freeIdx === -1) {
    ws.send(
      JSON.stringify({
        type: "join_table_denied",
        tableId: t.id,
        reason: "FULL",
      })
    );
    return;
  }

  // si déjà assis dans une autre table -> on libère l'ancienne place
  if (prev) {
    prev.table.seats[prev.seatIndex] = null;
  }

  // IMPORTANT :
  // on rattache le joueur à la table mais on ne l'assoit pas encore
  ws.tableId = t.id;

  broadcastTables();

  broadcastToTable(t.id, {
    type: "table_system",
    tableId: t.id,
    text: `${pseudo} a rejoint la table`,
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
    msg.tableId != null ? normalizeTableId(msg.tableId) : normalizeTableId(ws.tableId);
  const t = tableId ? tablesMap.get(tableId) : null;
  if (!t) return;

  

  const seatIndex = Number(msg.seatIndex);

  if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= t.seats.length) {
    ws.send(
      JSON.stringify({
        type: "choose_seat_denied",
        tableId: t.id,
        reason: "INVALID_SEAT",
      })
    );
    return;
  }

  // sécurité : le socket doit être rattaché à cette table
  ws.tableId = t.id;

  const currentSeatIndex = t.seats.findIndex((p) => p === pseudo);
  const wasAlreadySeatedHere = currentSeatIndex !== -1;

  // si le joueur clique sur sa propre place, on ACK simplement
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

  // place déjà prise
if (t.seats[seatIndex]) {
 

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

  // si le joueur avait déjà une place dans cette table, on la libère
  if (currentSeatIndex !== -1) {
    t.seats[currentSeatIndex] = null;
  }

  // on pose le joueur sur la place choisie
  t.seats[seatIndex] = pseudo;

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
    text: `${pseudo} a pris la place ${seatIndex + 1}`,
  });

  const targetCountAfter = t.seats.filter(Boolean).length;

  // seulement si on passe réellement de 3 assis à 4 assis
  if (!wasAlreadySeatedHere && targetCountBefore === 3 && targetCountAfter === 4) {
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


























