import React, { useState, useRef, useEffect } from "react";
import Profil from "./Profil";
import "../styles/salonjeu.css";

export default function SalonJeu({ pseudo }) {
  const currentName = pseudo || localStorage.getItem("pseudo") || "Joueur";

  const [messages, setMessages] = useState([]);
  const [players, setPlayers] = useState([]);
  const [inputMessage, setInputMessage] = useState("");

  // PROFIL
  const [showProfil, setShowProfil] = useState(false);
  const [avatar, setAvatar] = useState(
    localStorage.getItem("avatar") || "/avatar_blue.png"
  );

  // avatar utilisé uniquement pour le join_salon
  const initialAvatarRef = useRef(avatar);

  const wsRef = useRef(null);
  const chatBoxRef = useRef(null);

  /* ===============================
     WEBSOCKET (OUVERTURE UNIQUE)
  =============================== */
  useEffect(() => {
    let ws;

    try {
      ws = new WebSocket("ws://localhost:4000");
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "join_salon",
            pseudo: currentName,
            avatar: initialAvatarRef.current,
          })
        );
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "players") {
          setPlayers(
            (data.players || []).map((p) => ({
              name: p.name,
              avatar: p.avatar || "/avatar_blue.png",
              online: true,
            }))
          );
        }

        if (data.type === "message") {
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now() + Math.random(),
              user: data.user,
              text: data.text,
            },
          ]);
        }

        if (data.type === "system") {
          const id = Date.now() + Math.random();

          setMessages((prev) => [
            ...prev,
            { id, text: data.text, transient: true },
          ]);

          setTimeout(() => {
            setMessages((prev) => prev.filter((m) => m.id !== id));
          }, 3000);
        }
      };
    } catch {
      console.warn("WebSocket indisponible");
    }

    return () => ws?.close();
  }, [currentName]);

  /* ===============================
     SYNC AVATAR LIVE (SÉCURISÉ)
  =============================== */
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    if (ws.readyState !== WebSocket.OPEN) return;
    if (!avatar) return;

    ws.send(
      JSON.stringify({
        type: "update_avatar",
        pseudo: currentName,
        avatar,
      })
    );
  }, [avatar, currentName]);

  /* ===============================
     AUTO-SCROLL CHAT
  =============================== */
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages]);

  /* ===============================
     ACTIONS
  =============================== */
  const sendMessage = () => {
    if (!inputMessage.trim()) return;

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(
      JSON.stringify({
        type: "message",
        user: currentName,
        text: inputMessage,
      })
    );

    setInputMessage("");
  };

  /* ===============================
     RENDER
  =============================== */
  return (
    <div className="salon-wrapper">
      <div className="salon-grid">
        {/* ================= TABLES ================= */}
        <div className="panel panel-side">
          <h1 className="panel-title">Tables</h1>
        </div>

        {/* ================= CHAT ================= */}
        <div className="panel panel-center">
          <h1 className="panel-title">Tchat</h1>

          <div className="chat-box" ref={chatBoxRef}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`chat-message ${
                  m.transient ? "chat-system" : ""
                }`}
              >
                {m.transient ? (
                  <>
                    <span className="chat-emoji">✨</span>
                    <span className="chat-text">{m.text}</span>
                  </>
                ) : (
                  <>
                    <span className="chat-user">{m.user} :</span>
                    <span className="chat-text">{m.text}</span>
                  </>
                )}
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

        {/* ================= JOUEURS ================= */}
        <div className="panel panel-side">
          <h1 className="panel-title">Joueurs</h1>

          <div className="players-list">
            {players.map((p) => (
              <div
                key={p.name}
                className="player-card"
                onClick={() => {
                  if (p.name === currentName) {
                    setShowProfil(true);
                  }
                }}
                style={{
                  cursor:
                    p.name === currentName ? "pointer" : "default",
                }}
              >
                <span className="status-dot online" />
                <img
                  src={p.avatar}
                  className="player-avatar"
                  alt=""
                  onError={(e) =>
                    (e.currentTarget.src = "/avatar_blue.png")
                  }
                />
                <div className="player-name">{p.name}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ================= PROFIL MODAL ================= */}
      {showProfil && (
        <Profil
          pseudo={currentName}
          avatar={avatar}
          setAvatar={(a) => {
            setAvatar(a);
            localStorage.setItem("avatar", a);
          }}
          onClose={() => setShowProfil(false)}
        />
      )}
    </div>
  );
}






































































































































































































































































































































































