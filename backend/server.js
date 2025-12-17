import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* ===============================
   HTTP (UPLOAD AVATAR)
=============================== */
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());

// Static uploads
const uploadsDir = path.join(__dirname, "uploads");
const avatarsDir = path.join(uploadsDir, "avatars");
if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });

app.use("/uploads", express.static(uploadsDir));

// Multer (upload avatar)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".png";
    const safeName = `avatar-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}${ext}`;
    cb(null, safeName);
  },
});
const upload = multer({ storage });

app.get("/", (req, res) => res.send("Backend Belote OK"));

app.post("/api/upload-avatar", upload.single("avatar"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier envoyé" });

    // URL accessible depuis le front
    const avatar_url = `/uploads/avatars/${req.file.filename}`;
    return res.json({ avatar_url });
  } catch (e) {
    return res.status(500).json({ error: "Erreur upload avatar" });
  }
});

const HTTP_PORT = 4001;
app.listen(HTTP_PORT, () => {
  console.log(`✅ Backend HTTP actif sur http://localhost:${HTTP_PORT}`);
});

/* ===============================
   WEBSOCKET (SALON)
=============================== */
const wss = new WebSocketServer({ port: 4000 });
console.log("✅ WebSocket actif sur ws://localhost:4000");

// pseudo -> { name, avatar, count }
const playersMap = new Map();

function playersArray() {
  return Array.from(playersMap.values()).map((p) => ({
    name: p.name,
    avatar: p.avatar,
  }));
}

function broadcast(payloadObj) {
  const payload = JSON.stringify(payloadObj);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(payload);
  });
}

function broadcastPlayers() {
  broadcast({ type: "players", players: playersArray() });
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
      const pseudo = (msg.pseudo || "Joueur").trim();
      ws.pseudo = pseudo;

      const avatar = (msg.avatar || "/avatar_blue.png").trim();

      const existing = playersMap.get(pseudo);
      if (!existing) {
        playersMap.set(pseudo, { name: pseudo, avatar, count: 1 });
      } else {
        existing.count += 1;
        // si le client a un avatar (localStorage) on le prend
        if (avatar) existing.avatar = avatar;
      }

      broadcastPlayers();

      broadcast({
        type: "system",
        text: `${pseudo} a rejoint le salon`,
      });

      return;
    }

    // ----- MESSAGE CHAT -----
    if (msg.type === "message") {
      const user = (msg.user || ws.pseudo || "Joueur").trim();
      const text = (msg.text || "").toString();
      if (!text.trim()) return;

      broadcast({
        type: "message",
        user,
        text,
      });
      return;
    }

    // ----- UPDATE AVATAR (SYNC) -----
    if (msg.type === "update_avatar") {
      const pseudo = (msg.pseudo || ws.pseudo || "").trim();
      const avatar = (msg.avatar || "").trim();
      if (!pseudo || !avatar) return;

      const p = playersMap.get(pseudo);
      if (p) {
        p.avatar = avatar;
        broadcastPlayers();
      }
      return;
    }

    // ----- REQUEST PLAYERS (OPTIONNEL) -----
    if (msg.type === "get_players") {
      ws.send(JSON.stringify({ type: "players", players: playersArray() }));
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
      broadcast({
        type: "system",
        text: `${ws.pseudo} a quitté le salon`,
      });
    } else {
      broadcastPlayers();
    }
  });
});



















