import React, { useEffect, useRef, useState } from "react";
import "../styles/salonjeu.css";
import Profil from "./Profil.jsx";

const LOCAL_AVATAR_KEY = "profile_photo_local";

export default function SalonJeu({ user }) {
  const currentName = user?.pseudo || "Joueur";

  const [myAvatar, setMyAvatar] = useState(
    localStorage.getItem(LOCAL_AVATAR_KEY) || "/avatar_blue.png"
  );

  const [players, setPlayers] = useState([]);
  const [messages, setMessages] = useState([]); // chat uniquement
  const [systemMessages, setSystemMessages] = useState([]); // bannière en haut
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
     WEBSOCKET
  ================================ */
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:4000");
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "join_salon",
          pseudo: currentName,
          avatar: myAvatar,
        })
      );
    };

    ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      // ----- PLAYERS -----
      if (data.type === "players") {
        setPlayers(data.players || []);
        return;
      }

      // ----- CHAT MESSAGE -----
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

      // ----- SYSTEM MESSAGE (BANNIÈRE EN HAUT) -----
      if (data.type === "system") {
        const id = `${Date.now()}-${Math.random()}`;

        setSystemMessages((prev) => [
          ...prev,
          {
            id,
            text: data.text,
            fadeOut: false,
          },
        ]);

        // fade après 3 secondes
        setTimeout(() => {
          setSystemMessages((prev) =>
            prev.map((m) =>
              m.id === id ? { ...m, fadeOut: true } : m
            )
          );
        }, 3000);

        // suppression définitive après 4 secondes
        setTimeout(() => {
          setSystemMessages((prev) =>
            prev.filter((m) => m.id !== id)
          );
        }, 4000);

        return;
      }
    };

    ws.onerror = () => {
      console.warn("WebSocket erreur");
    };

    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ===============================
     AUTO-SCROLL CHAT
  ================================ */
  useEffect(() => {
    if (!chatBoxRef.current) return;
    chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
  }, [messages]);

  /* ===============================
     ENVOI MESSAGE
  ================================ */
  const sendMessage = () => {
    if (!inputMessage.trim()) return;

    wsRef.current?.send(
      JSON.stringify({
        type: "message",
        text: inputMessage,
      })
    );

    setInputMessage("");
  };

  /* ===============================
     AVATAR CHANGE
  ================================ */
  const handleAvatarChanged = (avatar) => {
    const newAvatar = avatar || "/avatar_blue.png";

    setMyAvatar(newAvatar);
    localStorage.setItem(LOCAL_AVATAR_KEY, newAvatar);

    wsRef.current?.send(
      JSON.stringify({
        type: "update_avatar",
        pseudo: currentName,
        avatar: newAvatar,
      })
    );
  };

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

          {/* ===== BANNIÈRE SYSTEME EN HAUT ===== */}
          {systemMessages.length > 0 && (
            <div className="system-banner">
              {systemMessages.map((m) => (
                <div
                  key={m.id}
                  className={`chat-message chat-system ${
                    m.fadeOut ? "fade-out" : ""
                  }`}
                >
                  <span className="chat-text">{m.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* ===== CHAT ===== */}
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
                <span className="status-dot online" />
                <img
                  src={p.avatar || "/avatar_blue.png"}
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

      {/* PROFIL */}
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


























































































































































































































































































































































































