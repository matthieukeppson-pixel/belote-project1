import React, { useState } from "react";
import "../styles/salonjeu.css";

export default function SalonJeu() {
  /* ===============================
     DONNÉES LOCALES STABLES
  ================================ */

  const [pseudo] = useState(
    localStorage.getItem("pseudo") || "Matt"
  );

  const [messages, setMessages] = useState([
    { user: "Système", text: "Bienvenue dans le salon 🎴" },
  ]);

  const [inputMessage, setInputMessage] = useState("");

  const [players] = useState([
    {
      id: 1,
      pseudo: "Matt",
      avatar: "/avatar_blue.png",
      online: true,
    },
    {
      id: 2,
      pseudo: "Véro",
      avatar: "/avatar_blue.png",
      online: true,
    },
  ]);

  const [tables] = useState([
    { id: 1, joueurs: 2 },
    { id: 2, joueurs: 0 },
    { id: 3, joueurs: 0 },
  ]);

  /* ===============================
     TCHAT LOCAL
  ================================ */

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;

    setMessages((prev) => [
      ...prev,
      { user: pseudo, text: inputMessage },
    ]);

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
          <div className="panel-title">Tables</div>

          <div className="tables-list">
            {tables.map((table) => (
              <div key={table.id} className="table-card">
                <div className="table-title">
                  Table {table.id}
                </div>
                <div className="table-info">
                  Joueurs : {table.joueurs} / 4
                </div>
                <div className="table-info">
                  Statut : En attente
                </div>

                <button className="btn-join">
                  Rejoindre
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ================= TCHAT ================= */}
        <div className="panel panel-center">
          <div className="panel-title">Tchat</div>

          <div className="chat-box">
            {messages.map((msg, index) => (
              <div key={index} className="chat-message">
                <span className="chat-user">
                  {msg.user} :
                </span>
                <span className="chat-text">
                  {msg.text}
                </span>
              </div>
            ))}
          </div>

          <div className="chat-input-zone">
            <input
              className="chat-input"
              type="text"
              placeholder="Écrire un message..."
              value={inputMessage}
              onChange={(e) =>
                setInputMessage(e.target.value)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSendMessage();
                }
              }}
            />
            <button
              className="chat-send"
              onClick={handleSendMessage}
            >
              Envoyer
            </button>
          </div>
        </div>

        {/* ================= JOUEURS ================= */}
        <div className="panel panel-side">
          <div className="panel-title">Joueurs</div>

          <div className="players-list">
            {players.map((player) => (
              <div
                key={player.id}
                className="player-card"
              >
                <div
                  className={`status-dot ${
                    player.online
                      ? "online"
                      : "offline"
                  }`}
                ></div>

                <img
                  src={player.avatar}
                  alt="avatar"
                  className="player-avatar"
                />

                <div className="player-name">
                  {player.pseudo}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}








































































































































































































































































































































































