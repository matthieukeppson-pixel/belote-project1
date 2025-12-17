import React, { useState } from "react";
import "../styles/Chat.css";

// 🔹 Initialisation du pseudo UNE SEULE FOIS
function getInitialPseudo() {
  let savedPseudo = localStorage.getItem("pseudo");

  if (!savedPseudo) {
    savedPseudo = prompt("Choisis ton pseudo :");
    if (!savedPseudo || !savedPseudo.trim()) {
      savedPseudo = "Invité";
    }
    localStorage.setItem("pseudo", savedPseudo);
  }

  return savedPseudo;
}

export default function Chat() {
  const [pseudo] = useState(getInitialPseudo);

  const [messages, setMessages] = useState([
    { id: 1, text: "Bienvenue dans le salon ⭐", from: "system" },
    { id: 2, text: `➡️ Bienvenue ${getInitialPseudo()}`, from: "system" }
  ]);

  const [newMessage, setNewMessage] = useState("");

  const sendMessage = () => {
    if (!newMessage.trim()) return;

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        text: `${pseudo} : ${newMessage}`,
        from: "me"
      }
    ]);

    setNewMessage("");
  };

  return (
    <div className="salon-chat-container">
      <div className="salon-messages-area">
        {messages.map((msg) => (
          <div key={msg.id} className="salon-message-line">
            {msg.text}
          </div>
        ))}
      </div>

      <div className="salon-input-area">
        <input
          type="text"
          className="salon-chat-input"
          placeholder="Écrire un message..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />

        <button className="salon-send-button" onClick={sendMessage}>
          Envoyer
        </button>
      </div>
    </div>
  );
}










