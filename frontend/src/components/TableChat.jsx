import React, { useState, useEffect, useRef } from "react";
import "../styles/TableChat.css";

export default function TableChat() {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");

  const messagesRef = useRef(null);

  const sendMessage = () => {
    if (!newMessage.trim()) return;

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        text: newMessage,
        from: "me"
      }
    ]);

    setNewMessage("");
  };

  /* Auto-scroll vers le bas quand un message arrive */
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop =
        messagesRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="tablechat-container">
      <div
        className="tablechat-messages"
        ref={messagesRef}
      >
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
          placeholder="Écrire un message"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendMessage();
          }}
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






