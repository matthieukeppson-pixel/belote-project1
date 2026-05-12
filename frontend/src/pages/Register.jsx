import React, { useState, useRef, useEffect } from "react";
import "../styles/salonjeu.css";

const SalonJeu = ({ pseudo }) => {
  const [messages, setMessages] = useState([]);
  const [players, setPlayers] = useState([]);
  const [inputMessage, setInputMessage] = useState("");

  const wsRef = useRef(null);
  const chatEndRef = useRef(null);

  // --------------------------------------------
  // 🔌 CONNEXION WEBSOCKET
  // --------------------------------------------
  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WS_URL || "ws://localhost:4000";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "join",
          pseudo: pseudo || "Joueur",
        })
      );
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      // 🔵 Liste des joueurs
      if (data.type === "players") {
        setPlayers(data.players.map((p) => ({ name: p, online: true })));
      }

      // 🔵 Joueur quitte
      if (data.type === "player_left") {
        setPlayers((prev) =>
          prev.map((pl) =>
            pl.name === data.pseudo ? { ...pl, online: false } : pl
          )
        );
      }

      // 🔵 Message normal
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

      // 🔵 Message système fade-out
      if (data.type === "system") {
        const msg = {
          id: Date.now() + Math.random(),
          system: true,
          text: data.text,
          fade: false,
        };

        setMessages((prev) => [...prev, msg]);

        setTimeout(() => {
          setMessages((prev) =>
            prev.map((m) => (m.id === msg.id ? { ...m, fade: true } : m))
          );
        }, 3000);

        setTimeout(() => {
          setMessages((prev) => prev.filter((m) => m.id !== msg.id));
        }, 4500);
      }
    };

    // --------------------------------------------
    // 🟥 Déconnexion automatique si fermeture onglet
    // --------------------------------------------
    const leaveOnClose = () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "leave",
            pseudo: pseudo || "Joueur",
          })
        );
      }
    };

    window.addEventListener("beforeunload", leaveOnClose);

    // Nettoyage
    return () => {
      leaveOnClose();
      ws.close();
      window.removeEventListener("beforeunload", leaveOnClose);
    };
  }, [pseudo]);

  // --------------------------------------------
  // 🔽 AUTO-SCROLL DU TCHAT
  // --------------------------------------------
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // --------------------------------------------
  // ✉️ ENVOI MESSAGE
  // --------------------------------------------
  const sendMessage = () => {
    if (!inputMessage.trim()) return;

    wsRef.current?.send(
      JSON.stringify({
        type: "message",
        user: pseudo || "Joueur",
        text: inputMessage,
      })
    );

    setInputMessage("");
  };

  // --------------------------------------------
  // TABLES (statique)
  // --------------------------------------------
  const tables = [
    { id: 1, joueurs: "2 / 4", statut: "En attente" },
    { id: 2, joueurs: "4 / 4", statut: "En cours" },
    { id: 3, joueurs: "1 / 4", statut: "En attente" },
  ];

  return (
    <div className="salon-wrapper">
      <div className="salon-grid">

        {/* -------------------------------------- */}
        {/* COLONNE TABLES */}
        {/* -------------------------------------- */}
        <div className="panel panel-side">
          <h1 className="panel-title">Tables</h1>

          <div className="tables-list">
            {tables.map((t) => (
              <div key={t.id} className="table-card">
                <h2 className="table-title">Table {t.id}</h2>
                <p className="table-info">👥 Joueurs : {t.joueurs}</p>
                <p className="table-info">🎮 Statut : {t.statut}</p>
                <button className="btn-join">Rejoindre</button>
              </div>
            ))}
          </div>
        </div>

        {/* -------------------------------------- */}
        {/* TCHAT */}
        {/* -------------------------------------- */}
        <div className="panel panel-center">
          <h1 className="panel-title">Tchat</h1>

          <div className="chat-box">
            {messages.map((m) =>
              m.system ? (
                <div
                  key={m.id}
                  className={`system-message ${m.fade ? "fade-out" : ""}`}
                >
                  ✨ {m.text} ✨
                </div>
              ) : (
                <div key={m.id} className="chat-message">
                  <span className="chat-user">{m.user} :</span>
                  <span className="chat-text">{m.text}</span>
                </div>
              )
            )}
            <div ref={chatEndRef}></div>
          </div>

          <div className="chat-input-zone">
            <input
              type="text"
              className="chat-input"
              placeholder="Écrire un message…"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />
            <button className="chat-send" onClick={sendMessage}>
              Envoyer
            </button>
          </div>
        </div>

        {/* -------------------------------------- */}
        {/* JOUEURS */}
        {/* -------------------------------------- */}
        <div className="panel panel-side">
          <h1 className="panel-title">Joueurs</h1>

          <div className="players-list">
            {players.map((p, i) => (
              <div key={i} className="player-card">
                <span
                  className={`status-dot ${p.online ? "online" : "offline"}`}
                ></span>
                <img src="/avatar.png" alt="avatar" className="player-avatar" />
                <span className="player-name">{p.name}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default SalonJeu;

