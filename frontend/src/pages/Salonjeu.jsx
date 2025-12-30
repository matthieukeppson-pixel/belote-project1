import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/salonjeu.css";
import Profil from "./Profil.jsx";

export default function SalonJeu({ user }) {
  const currentName = user?.pseudo || "Joueur";

  const [players, setPlayers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [showProfil, setShowProfil] = useState(false);

  const wsRef = useRef(null);
  const chatBoxRef = useRef(null);
  const navigate = useNavigate();

  const tables = [
    { id: 1, joueurs: 2 },
    { id: 2, joueurs: 0 },
    { id: 3, joueurs: 0 },
  ];

  /* ===============================
     WEBSOCKET SALON
  ================================ */
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:4000");
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "join_salon",
          pseudo: currentName,
          avatar:
            localStorage.getItem("profile_photo_local") ||
            "/avatar_blue.png",
        })
      );

      ws.send(JSON.stringify({ type: "get_players" }));
    };

    ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === "players") {
        setPlayers(
          (data.players || []).map((p) => ({
            name: p.name,
            avatar: p.avatar || "/avatar_blue.png",
          }))
        );
        return;
      }

      if (data.type === "message") {
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random()}`,
            user: data.user,
            text: data.text,
          },
        ]);
      }
    };

    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ===============================
     🔁 AVATAR → SYNCHRO IMMEDIATE
  ================================ */
  const handleAvatarChanged = (newAvatar) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // 1️⃣ Mise à jour immédiate LOCALE (toi)
    setPlayers((prev) =>
      prev.map((p) =>
        p.name === currentName ? { ...p, avatar: newAvatar } : p
      )
    );

    // 2️⃣ Envoi au backend (autres joueurs)
    ws.send(
      JSON.stringify({
        type: "update_avatar",
        pseudo: currentName,
        avatar: newAvatar,
      })
    );
  };

  /* ===============================
     ENVOI MESSAGE
  ================================ */
  const sendMessage = () => {
    const text = inputMessage.trim();
    if (!text) return;

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(
      JSON.stringify({
        type: "message",
        user: currentName,
        text,
      })
    );

    setInputMessage("");
  };

  /* ===============================
     CHAT TOUJOURS EN HAUT
  ================================ */
  useEffect(() => {
    if (!chatBoxRef.current) return;
    chatBoxRef.current.scrollTop = 0;
  }, [messages]);

  /* ===============================
     RENDER
  ================================ */
  return (
    <div className="salon-wrapper">
      <div className="salon-grid">

        {/* TABLES */}
        <div className="panel panel-side">
          <h2 className="panel-title">Tables</h2>
          <div className="tables-list">
            {tables.map((t) => (
              <div key={t.id} className="table-card">
                <div className="table-title">Table {t.id}</div>
                <div className="table-info">Joueurs : {t.joueurs} / 4</div>
                <div className="table-info">Statut : En attente</div>
                <button
                  className="btn-join"
                  onClick={() => navigate(`/table/${t.id}`)}
                >
                  Rejoindre
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* TCHAT */}
        <div className="panel panel-center">
          <h2 className="panel-title">Tchat</h2>

          <div className="chat-box" ref={chatBoxRef}>
            {messages.map((m) => (
              <div key={m.id} className="chat-message">
                <span className="chat-user">{m.user} :</span>
                <span className="chat-text">{m.text}</span>
              </div>
            ))}
          </div>

          <div className="chat-input-zone">
            <input
              className="chat-input"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Écrire un message..."
            />
            <button className="btn-send" onClick={sendMessage}>
              Envoyer
            </button>
          </div>
        </div>

        {/* JOUEURS */}
        <div className="panel panel-side">
          <h2 className="panel-title">Joueurs</h2>
          <div className="players-list">
            {players.map((p) => (
              <div key={p.name} className="player-card">
                <img
                  src={p.avatar}
                  className="player-avatar"
                  alt=""
                  onClick={() =>
                    p.name === currentName && setShowProfil(true)
                  }
                  style={{
                    cursor:
                      p.name === currentName ? "pointer" : "default",
                  }}
                />
                <div className="player-name">{p.name}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showProfil && (
        <Profil
          pseudo={currentName}
          onClose={() => setShowProfil(false)}
          onAvatarChanged={handleAvatarChanged}
        />
      )}
    </div>
  );
}

















































































































































































































































































































































































































