import React, { useEffect, useRef, useState } from "react";
import "../styles/TableChat.css";

const SIMPLE_EMOJIS = ["😊", "😂", "😍", "👍", "❤️", "🎉"];

export default function TableChat({
  messages = [],
  onSendMessage,
}) {
  
  const [newMessage, setNewMessage] = useState("");

  const messagesRef = useRef(null);

 const sendMessage = () => {
  const text = newMessage.trim();
  if (!text) return;

  onSendMessage?.(text);
  setNewMessage("");
};

  const addEmoji = (emoji) => {
    setNewMessage((prev) => `${prev}${emoji}`);
  };

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="tablechat-container">
      <div className="tablechat-title">TCHAT</div>

      <div className="tablechat-messages" ref={messagesRef}>
       {messages.map((msg) =>
  msg.type === "system" ? (
    <div key={msg.id} className="tablechat-line system">
      {msg.text}
    </div>
  ) : (
    <div key={msg.id} className={`tablechat-line ${msg.from || "other"}`}>
      <span className="tablechat-author">{msg.author} :</span>{" "}
      {msg.text}
    </div>
  )
)}
      </div>

      <div className="tablechat-emojis">
        {SIMPLE_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="tablechat-emoji-btn"
            onClick={() => addEmoji(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>

      <div className="tablechat-inputzone">
        <input
          type="text"
          className="tablechat-input"
          placeholder="Écrire un message..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendMessage();
          }}
        />

        <button className="tablechat-button" onClick={sendMessage}>
          Envoyer
        </button>
      </div>
    </div>
  );
}







