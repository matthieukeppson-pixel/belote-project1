import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";

/**
 * ARCHITECTURE (clair et stable)
 * - HTTP: 4001 (optionnel)
 * - WS:  4000 (salon temps réel)
 * - Events WS:
 *   - join_salon { pseudo, avatar }
 *   - message    { text }
 *   - update_avatar { avatar }
 *   - server -> players { players: [{ name, avatar }] }
 *   - server -> message { user, text }
 *   - server -> system  { text }
 */

const HTTP_PORT = 4001;
const WS_PORT = 4000;

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/", (req, res) => res.send("Backend HTTP OK"));

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

/** Convertit la map en tableau sérialisable */
function playersArray() {
  return Array.from(playersMap.values()).map((p) => ({
    name: p.name,
    avatar: p.avatar || "/avatar_blue.png",
  }));
}

/** Broadcast à tous les clients */
function broadcast(payloadObj) {
  const payload = JSON.stringify(payloadObj);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(payload);
  });
}

function broadcastPlayers() {
  broadcast({ type: "players", players: playersArray() });
}

function system(text) {
  broadcast({ type: "system", text });
}

wss.on("connection", (ws) => {
  ws.pseudo = null;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // ----- JOIN SALON -----
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
        if (avatar) existing.avatar = avatar;
      }

      broadcastPlayers();
      return;
    }

    // ----- MESSAGE CHAT -----
    if (msg.type === "message") {
      const user =
        String(ws.pseudo || msg.user || "Joueur").trim() || "Joueur";
      const text = String(msg.text || "").trim();
      if (!text) return;

      broadcast({ type: "message", user, text });
      return;
    }

    // ----- UPDATE AVATAR -----
    if (msg.type === "update_avatar") {
      const pseudo = String(msg.pseudo || ws.pseudo || "").trim();
      const avatar = String(msg.avatar || "").trim();
      if (!pseudo || !avatar) return;

      const p = playersMap.get(pseudo);
      if (p) {
        p.avatar = avatar;
        broadcastPlayers();
      }
      return;
    }

    // ----- GET PLAYERS (optionnel) -----
    if (msg.type === "get_players") {
      ws.send(
        JSON.stringify({ type: "players", players: playersArray() })
      );
      return;
    }
  });

  ws.on("close", () => {
    if (!ws.pseudo) return;

    const p = playersMap.get(ws.pseudo);
    if (!p) return;

    p.count -= 1;

    if (p.count <= 0) {
      playersMap.delete(ws.pseudo);
      broadcastPlayers();
      system(`⭐ À bientôt ${ws.pseudo} ⭐`);
    } else {
      broadcastPlayers();
    }
  });
});

wsServer.listen(WS_PORT);


























