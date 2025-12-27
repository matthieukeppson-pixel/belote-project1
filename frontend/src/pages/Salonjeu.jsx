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
  // identité stable (pas de prompt dans le render)
  const currentName = localStorage.getItem("pseudo") || "Joueur";

  const [avatar, setAvatar] = useState(
    localStorage.getItem("avatar") || "/avatar_blue.png"
  );

  const [players, setPlayers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");

  const wsRef = useRef(null);
  const chatBoxRef = useRef(null);

  // Tables locales (tu les synchroniseras plus tard)
  const tables = [
    { id: 1, joueurs: 2 },
    { id: 2, joueurs: 0 },
    { id: 3, joueurs: 0 },
  ];

  /* ===============================
     MESSAGE BIENVENUE (pur, ESLint OK)
  ================================ */
  useEffect(() => {
    setMessages([{ id: "welcome", kind: "system", text: "Bienvenue dans le salon 🎴" }]);
  }, []);

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
          avatar,
        })
      );
      // Optionnel : demande l'état des joueurs tout de suite
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
        // IMPORTANT : on ajoute uniquement ce que le serveur broadcast
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
        return;
      }
    };

    ws.onerror = () => {
      console.warn("WebSocket erreur");
    };

    return () => {
      ws.close();
    };
    // On fige volontairement l’ouverture WS pour éviter reconnections
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
     ENVOI MESSAGE (SANS DOUBLON)
  ================================ */
  const sendMessage = () => {
    const text = inputMessage.trim();
    if (!text) return;

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // NE PAS setMessages ici => sinon doublon chez l’expéditeur
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
     (Optionnel) update avatar via WS
  ================================ */
  const pushAvatarToServer = (nextAvatar) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(
      JSON.stringify({
        type: "update_avatar",
        pseudo: currentName,
        avatar: nextAvatar,
      })
    );
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
                <div className="table-info">Joueurs : {table.joueurs} / 4</div>
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
                  <div key={m.id} className="chat-message chat-system">
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
              <div
                key={p.name}
                className="player-card"
                style={{
                  cursor: p.name === currentName ? "pointer" : "default",
                }}
                onClick={() => {
                  // Exemple: si tu veux tester un update avatar sans profil
                  // uniquement sur soi
                  if (p.name === currentName) {
                    const next = avatar; // ici tu mettras un nouvel URL quand tu remettras le profil
                    setAvatar(next);
                    localStorage.setItem("avatar", next);
                    pushAvatarToServer(next);
                  }
                }}
              >
                <span className="status-dot online" />
                <img
                  src={p.avatar}
                  className="player-avatar"
                  alt=""
                  onError={(e) => (e.currentTarget.src = "/avatar_blue.png")}
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













































































































































































































































































































































































