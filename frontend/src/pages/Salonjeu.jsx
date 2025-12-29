import React, { useEffect, useRef, useState } from "react";
import "../styles/salonjeu.css";
import Profil from "./Profil.jsx";

export default function SalonJeu({ user }) {
  const currentName = user?.pseudo || "Joueur";

  const [players, setPlayers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [systemMessages, setSystemMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [showProfil, setShowProfil] = useState(false);

  const wsRef = useRef(null);
  const chatBoxRef = useRef(null);

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
            kind: "chat",
            user: data.user,
            text: data.text,
          },
        ]);
        return;
      }

      /* ===== MESSAGE SYSTÈME (BANDEAU) ===== */
      if (data.type === "system") {
        const id = `${Date.now()}-${Math.random()}`;

        setSystemMessages((prev) => [
          ...prev,
          { id, text: data.text, fadeOut: false },
        ]);

        setTimeout(() => {
          setSystemMessages((prev) =>
            prev.map((m) =>
              m.id === id ? { ...m, fadeOut: true } : m
            )
          );
        }, 3000);

        setTimeout(() => {
          setSystemMessages((prev) =>
            prev.filter((m) => m.id !== id)
          );
        }, 4000);

        return;
      }
    };

    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
     AVATAR → BACKEND
  ================================ */
  const handleAvatarChanged = (newAvatar) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(
      JSON.stringify({
        type: "update_avatar",
        pseudo: currentName,
        avatar: newAvatar,
      })
    );
  };

  /* ===============================
     AUTO-SCROLL
  ================================ */
  useEffect(() => {
    if (!chatBoxRef.current) return;
    chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
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
                <div className="table-info">
                  Joueurs : {t.joueurs} / 4
                </div>
                <div className="table-info">Statut : En attente</div>
                <button className="btn-join">Rejoindre</button>
              </div>
            ))}
          </div>
        </div>

        {/* TCHAT */}
        <div className="panel panel-center">
          <h2 className="panel-title">Tchat</h2>

          {/* BANDEAU SYSTÈME */}
          {systemMessages.length > 0 && (
            <div className="system-banner">
              {systemMessages.map((m) => (
                <div
                  key={m.id}
                  className={`chat-system ${
                    m.fadeOut ? "fade-out" : ""
                  }`}
                >
                  {m.text}
                </div>
              ))}
            </div>
          )}

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
              placeholder="Écrire un message…"
            />
            <button className="chat-send" onClick={sendMessage}>
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










































































































































































































































































































































































































