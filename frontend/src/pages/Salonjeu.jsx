import React, { useEffect, useRef, useState } from "react";
import "../styles/salonjeu.css";
import Profil from "./Profil.jsx";

const LOCAL_AVATAR_KEY = "profile_photo_local";

/**
 * RÈGLE SALON — ÉTAPE 1 (locale)
 * - Avatar par défaut : avatar_blue.png
 * - SI le joueur a choisi une photo :
 *   -> SON avatar dans le salon = photo locale
 * - Les autres joueurs restent en avatar bleu
 */

export default function SalonJeu({ user }) {
  const currentName = user?.pseudo || "Joueur";

  const [players, setPlayers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [showProfil, setShowProfil] = useState(false);

  const wsRef = useRef(null);
  const chatBoxRef = useRef(null);

  // Tables locales
  const tables = [
    { id: 1, joueurs: 2 },
    { id: 2, joueurs: 0 },
    { id: 3, joueurs: 0 },
  ];

  /* ===============================
     WEBSOCKET (ouverture unique)
  ================================ */
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:4000");
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "join_salon",
          pseudo: currentName,
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
            online: true,
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

      if (data.type === "system") {
        const id = `${Date.now()}-${Math.random()}`;

        setMessages((prev) => [
          ...prev,
          {
            id,
            kind: "system",
            text: data.text,
            fadeOut: false,
          },
        ]);

        setTimeout(() => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === id ? { ...m, fadeOut: true } : m
            )
          );
        }, 3000);
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
     RENDER
  ================================ */
  return (
    <div className="salon-wrapper">
      <div className="salon-grid">
        {/* ================= TABLES ================= */}
        <div className="panel panel-side">
          <h2 className="panel-title">Tables</h2>

          <div className="tables-list">
            {tables.map((table) => (
              <div key={table.id} className="table-card">
                <div className="table-title">Table {table.id}</div>
                <div className="table-info">
                  Joueurs : {table.joueurs} / 4
                </div>
                <div className="table-info">Statut : En attente</div>

                <button className="btn-join" type="button">
                  Rejoindre
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ================= TCHAT ================= */}
        <div className="panel panel-center">
          <h2 className="panel-title">Tchat</h2>

          <div className="chat-box" ref={chatBoxRef}>
            {messages.map((m) => {
              if (m.kind === "system") {
                return (
                  <div
                    key={m.id}
                    className={`chat-message chat-system ${
                      m.fadeOut ? "fade-out" : ""
                    }`}
                  >
                    <span className="chat-text">{m.text}</span>
                  </div>
                );
              }

              return (
                <div key={m.id} className="chat-message">
                  <span className="chat-user">{m.user} :</span>
                  <span className="chat-text">{m.text}</span>
                </div>
              );
            })}
          </div>

          <div className="chat-input-zone">
            <input
              className="chat-input"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Écrire un message…"
            />
            <button className="chat-send" onClick={sendMessage} type="button">
              Envoyer
            </button>
          </div>
        </div>

        {/* ================= JOUEURS ================= */}
        <div className="panel panel-side">
          <h2 className="panel-title">Joueurs</h2>

          <div className="players-list">
            {players.map((p) => (
              <div key={p.name} className="player-card">
                <span className="status-dot online" />
                <img
                  src={
                    p.name === currentName
                      ? localStorage.getItem(LOCAL_AVATAR_KEY) ||
                        "/avatar_blue.png"
                      : "/avatar_blue.png"
                  }
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

      {/* ================= PROFIL ================= */}
      {showProfil && (
        <Profil
          pseudo={currentName}
          onClose={() => setShowProfil(false)}
        />
      )}
    </div>
  );
}























































































































































































































































































































































































