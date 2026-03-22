import React, { useEffect, useRef, useState } from "react";
import "../styles/TableChat.css";

const SIMPLE_EMOJIS = [
  { code: ":langue:", src: "/emojis/langue.png", alt: "langue" },
  { code: ":pouce:", src: "/emojis/pouce.png", alt: "pouce" },
  { code: ":coeur:", src: "/emojis/coeur.png", alt: "coeur" },
  { code: ":cool:", src: "/emojis/cool.png", alt: "cool" },
  { code: ":sourire:", src: "/emojis/sourire.png", alt: "sourire" },
  { code: ":reflexion:", src: "/emojis/reflexion.png", alt: "reflexion" },

  { code: ":cafe:", src: "/emojis/cafe.png", alt: "cafe" },
  { code: ":cadeau:", src: "/emojis/cadeau.png", alt: "cadeau" },
  { code: ":facepalm:", src: "/emojis/facepalm.png", alt: "facepalm" },
  { code: ":diable:", src: "/emojis/diable.png", alt: "diable" },
  { code: ":merci:", src: "/emojis/merci.png", alt: "merci" },
  { code: ":clinoeil:", src: "/emojis/clinoeil.png", alt: "clinoeil" },
  { code: ":attention:", src: "/emojis/attention.png", alt: "attention" },
  { code: ":rougir:", src: "/emojis/rougir.png", alt: "rougir" },
  { code: ":parfait:", src: "/emojis/parfait.png", alt: "parfait" },
  { code: ":stress:", src: "/emojis/stress.png", alt: "stress" },
];

const CUSTOM_CHAT_EMOJIS = {
  ":coeur:": "/emojis/coeur.png",
  ":cool:": "/emojis/cool.png",
  ":langue:": "/emojis/langue.png",
  ":pouce:": "/emojis/pouce.png",
  ":reflexion:": "/emojis/reflexion.png",
  ":sourire:": "/emojis/sourire.png",

  ":cafe:": "/emojis/cafe.png",
  ":cadeau:": "/emojis/cadeau.png",
  ":facepalm:": "/emojis/facepalm.png",
  ":diable:": "/emojis/diable.png",
  ":merci:": "/emojis/merci.png",
  ":clinoeil:": "/emojis/clinoeil.png",
  ":attention:": "/emojis/attention.png",
  ":rougir:": "/emojis/rougir.png",
  ":parfait:": "/emojis/parfait.png",
  ":stress:": "/emojis/stress.png",
};

function renderCustomMessageContent(text) {
  const raw = String(text || "");

 const parts = raw.split(
  /(:coeur:|:cool:|:langue:|:pouce:|:reflexion:|:sourire:|:cafe:|:cadeau:|:facepalm:|:diable:|:merci:|:clinoeil:|:attention:|:rougir:|:parfait:|:stress:)/gi
);

  return parts.map((part, index) => {
    const clean = String(part || "").trim().toLowerCase();
    const src = CUSTOM_CHAT_EMOJIS[clean];

    if (src) {
      return (
        <span key={`emoji-${index}`} className="tablechat-custom-emoji-wrap">
          <img
            src={src}
            alt={clean}
            className="tablechat-custom-emoji"
          />
        </span>
      );
    }

    return <React.Fragment key={`text-${index}`}>{part}</React.Fragment>;
  });
}

export default function TableChat({ messages = [], onSendMessage }) {

  const [newMessage, setNewMessage] = useState("");
  const [isEmojiPanelOpen, setIsEmojiPanelOpen] = useState(false);

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
      {messages.map((msg) =>
  msg.type === "system" ? (
    <div key={msg.id} className="tablechat-line system">
      {msg.text}
    </div>
  ) : (
    <div key={msg.id} className={`tablechat-line ${msg.from || "other"}`}>
      <span className="tablechat-author">{msg.author} :</span>{" "}
      {renderCustomMessageContent(msg.text)}
    </div>
  )
)}
      </div>

   {isEmojiPanelOpen && (
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
)}

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

  <button
    type="button"
    className="tablechat-emoji-toggle"
    onClick={() => setIsEmojiPanelOpen((prev) => !prev)}
    title="Ouvrir les emojis"
  >
    {isEmojiPanelOpen ? "✕" : "😊"}
  </button>

  <button className="tablechat-button" onClick={sendMessage}>
    Envoyer
  </button>
</div>
    </div>
  );
}







