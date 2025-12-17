import React, { useState } from "react";
import "../styles/TableChat.css";

export default function TableChat({ tableName }) {
  const [messages, setMessages] = useState([
    { id: 1, text: `Bienvenue à la table ${tableName} ⭐`, from: "system" },
    { id: 2, text: "Le tchat table fonctionne ✔️", from: "system" }
  ]);

  const [newMessage, setNewMessage] = useState("");

  const sendMessage = () => {
    if (!newMessage.trim()) return;

    setMessages((prev) => [
      ...prev,
      { id: Date.now(), text: newMessage, from: "me" }
    ]);

    setNewMessage("");
  };

  return (
    <div className="tablechat-container">
      <div className="tablechat-messages">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`tablechat-line ${msg.from}`}
          >
            {msg.text}
          </div>
        ))}
      </div>

      <div className="tablechat-inputzone">
        <input
          type="text"
          className="tablechat-input"
          placeholder="Écrire un message..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
        />

        <button
          className="tablechat-button"
          onClick={sendMessage}
        >
          Envoyer
        </button>
      </div>
    </div>
  );
}




