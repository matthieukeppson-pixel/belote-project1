import React, { useEffect, useRef, useState } from "react";
import "../styles/salonjeu.css";

/**
 * ARCHITECTURE (clair)
 * - UI (tables) : local, stable
 * - WS : source de vérité pour
 *   - players (liste joueurs)
 *   - system (join/leave)
 *   - message (chat)
 *
 * IMPORTANT anti-doublon :
 * - on n’ajoute jamais un message "localement" au moment de l’envoi
 * - on attend le broadcast serveur (type: "message")
 */

export default function SalonJeu() {
  // identité stable
  const currentName = localStorage.getItem("pseudo") || "Joueur";

  const [avatar] = useState(
    localStorage.getItem("avatar") || "/avatar_blue.png"
  );

  const [players, setPlayers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");

  const wsRef = useRef(null);
  const chatBoxRef = useRef(null);

  // Tables locales (stables)
  const tables = [
    { id: 1, joueurs: 2 },
    { id: 2, joueurs: 0 },
    { id: 3, joueurs: 0 },
  ];

  /* ===============================
     MESSAGE BIENVENUE LOCAL
  ================================ */
  useEffect(() => {
    setMessages([
      {
        id: "welcome",
        kind: "system",
        text: `⭐ Bienvenue ${currentName} ⭐`,
      },
    ]);
  }, [currentName]);

  /* ===============================
     WEBSOCKET – ouverture unique
  ================================ */
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:4000");
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "join_salon",
          pseudo: currentName,
          avatar,
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
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random()}`,
            kind: "system",
            text: data.text,
          },
        ]);
      }
    };

    return () => {
      ws.close();
    };
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

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
                    style={{ textAlign: "center", margin: "12px 0" }}
                  >
                    <span style={{ color: "#ffffff", fontWeight: 600 }}>
                      ⭐ {m.text.replace(/⭐/g, "").trim()} ⭐
                    </span>
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
    </div>
  );
}



















































































































































































































































































































































































