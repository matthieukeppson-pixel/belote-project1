import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/salonjeu.css";

export default function SalonJeu({ pseudo }) {
  const currentName =
    pseudo || localStorage.getItem("pseudo") || "Joueur";

  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [players, setPlayers] = useState([]);
  const [tables, setTables] = useState([]);
  const [inputMessage, setInputMessage] = useState("");

  const wsRef = useRef(null);
  const chatBoxRef = useRef(null);

  /* ===============================
     WEBSOCKET
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
            avatar: localStorage.getItem("avatar") || "/avatar_blue.png",
          })
        );

        ws.send(JSON.stringify({ type: "get_players" }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        /* ===== JOUEURS ===== */
        if (data.type === "players") {
          const normalizeAvatar = (avatar) => {
            if (!avatar) return "/avatar_blue.png";
            if (avatar.startsWith("/uploads/")) {
              return `http://localhost:4001${avatar}`;
            }
            return avatar;
          };

          setPlayers(
            (data.players || []).map((p) => ({
              name: p.name,
              avatar: normalizeAvatar(p.avatar),
              online: true,
            }))
          );
        }

        /* ===== MESSAGE NORMAL ===== */
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

        /* ===== MESSAGE SYSTÈME TEMPORAIRE ===== */
        if (data.type === "system") {
          const id = Date.now() + Math.random();

          setMessages((prev) => [
            ...prev,
            {
              id,
              text: data.text,
              transient: true,
            },
          ]);

          setTimeout(() => {
            setMessages((prev) =>
              prev.filter((m) => m.id !== id)
            );
          }, 3000);
        }

        /* ===== TABLES (POUR LA SUITE) ===== */
        if (data.type === "tables_update") {
          setTables(Array.isArray(data.tables) ? data.tables : []);
        }
      };

      ws.onerror = () => {
        console.warn("WebSocket indisponible");
      };
    } catch (e) {
      console.warn("WebSocket non initialisé", e);
    }

    return () => ws?.close();
  }, [currentName]);

  /* ===============================
     AUTO-SCROLL CHAT
  =============================== */
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop =
        chatBoxRef.current.scrollHeight;
    }
  }, [messages]);

  /* ===============================
     ACTIONS
  =============================== */
  const sendMessage = () => {
    if (!inputMessage.trim()) return;

    wsRef.current?.send(
      JSON.stringify({
        type: "message",
        user: currentName,
        text: inputMessage,
      })
    );

    setInputMessage("");
  };

  const handleJoinTable = (tableId) => {
    navigate(`/table/${tableId}`);
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

          <div className="tables-list">
            {tables.map((t) => {
              const seatCount =
                t.seats?.filter(Boolean).length || 0;

              return (
                <div key={t.id} className="table-card">
                  <h2 className="table-title">
                    Table {t.id}
                  </h2>
                  <p className="table-info">
                    👥 Joueurs : {seatCount} / 4
                  </p>
                  <p className="table-info">
                    🎮 En attente
                  </p>
                  <button
                    className="btn-join"
                    onClick={() =>
                      handleJoinTable(t.id)
                    }
                  >
                    Rejoindre
                  </button>
                </div>
              );
            })}
          </div>
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
                    <span className="chat-emoji">
                      ✨
                    </span>
                    <span className="chat-text">
                      {m.text}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="chat-user">
                      {m.user} :
                    </span>{" "}
                    <span className="chat-text">
                      {m.text}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="chat-input-zone">
            <input
              className="chat-input"
              value={inputMessage}
              onChange={(e) =>
                setInputMessage(e.target.value)
              }
              onKeyDown={(e) =>
                e.key === "Enter" && sendMessage()
              }
              placeholder="Écrire un message…"
            />
            <button
              className="chat-send"
              onClick={sendMessage}
            >
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
              >
                <span className="status-dot online" />
                <img
                  src={p.avatar}
                  className="player-avatar"
                  alt=""
                  aria-hidden="true"
                  onError={(e) => {
                    e.currentTarget.src =
                      "/avatar_blue.png";
                  }}
                />
                <div className="player-name">
                  {p.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
























































































































































































































































































































































