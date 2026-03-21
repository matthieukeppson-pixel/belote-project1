import React, { useEffect, useRef, useState } from "react";
import "../styles/TableChat.css";

const SIMPLE_EMOJIS = [
  { code: ":langue:", src: "/emojis/langue.png", alt: "langue" },
  { code: ":pouce:", src: "/emojis/pouce.png", alt: "pouce" },
  { code: ":coeur:", src: "/emojis/coeur.png", alt: "coeur" },
  { code: ":cool:", src: "/emojis/cool.png", alt: "cool" },
  { code: ":sourire:", src: "/emojis/sourire.png", alt: "sourire" },
  { code: ":reflexion:", src: "/emojis/reflexion.png", alt: "reflexion" },
];

const CUSTOM_CHAT_EMOJIS = {
  ":coeur:": "/emojis/coeur.png",
  ":cool:": "/emojis/cool.png",
  ":langue:": "/emojis/langue.png",
  ":pouce:": "/emojis/pouce.png",
  ":reflexion:": "/emojis/reflexion.png",
  ":sourire:": "/emojis/sourire.png",
};

function getCustomEmojiSrc(text) {
  const clean = String(text || "").trim().toLowerCase();
  return CUSTOM_CHAT_EMOJIS[clean] || null;
}

export default function TableChat({ messages = [], onSendMessage }) {
  const [newMessage, setNewMessage] = useState("");
  const messagesRef = useRef(null);

  const sendMessage = () => {
    const text = newMessage.trim();
    if (!text) return;

    onSendMessage?.(text);
    setNewMessage("");
  };

 const addEmoji = (code) => {
  setNewMessage((prev) => `${prev}${code}`);
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
        {messages.map((msg) => {
          const emojiSrc = getCustomEmojiSrc(msg.text);

          return msg.type === "system" ? (
            <div key={msg.id} className="tablechat-line system">
              {msg.text}
            </div>
          ) : (
            <div key={msg.id} className={`tablechat-line ${msg.from || "other"}`}>
              <span className="tablechat-author">{msg.author} :</span>{" "}
              {emojiSrc ? (
                <img
                  src={emojiSrc}
                  alt={String(msg.text || "").trim()}
                  className="tablechat-custom-emoji"
                />
              ) : (
                msg.text
              )}
            </div>
          );
        })}
      </div>

     <div className="tablechat-emojis">
  {SIMPLE_EMOJIS.map((emoji) => (
    <button
      key={emoji.code}
      type="button"
      className="tablechat-emoji-btn"
      onClick={() => addEmoji(emoji.code)}
      title={emoji.alt}
    >
      <img
        src={emoji.src}
        alt={emoji.alt}
        className="tablechat-emoji-btn-img"
      />
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







