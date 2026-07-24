import React, { useEffect, useRef, useState } from "react";
import PseudoDisplay from "./PseudoDisplay";

function roleClassFromRole(role) {
  if (role === "admin") return "role-admin";
  if (role === "moderator") return "role-moderator";
  return "";
}
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
  { code: ":clinoeil:", src: "/emojis/clinoeil.png", alt: "clinoeil" },
  { code: ":attention:", src: "/emojis/attention.png", alt: "attention" },
  { code: ":rougir:", src: "/emojis/rougir.png", alt: "rougir" },
  { code: ":parfait:", src: "/emojis/parfait.png", alt: "parfait" },
  { code: ":stress:", src: "/emojis/stress.png", alt: "stress" },

  { code: ":rire:", src: "/emojis/rire.png", alt: "rire" },
  { code: ":dodo:", src: "/emojis/dodo.png", alt: "dodo" },
  { code: ":colere:", src: "/emojis/colere.png", alt: "colere" },
  { code: ":glace:", src: "/emojis/glace.png", alt: "glace" },
  { code: ":bisou:", src: "/emojis/bisou.png", alt: "bisou" },

  // Emojis Vero
  { code: ":langue_rire:", src: "/emojis/langue_rire.png", alt: "langue rire" },
  { code: ":malade:", src: "/emojis/malade.png", alt: "malade" },
  { code: ":rose_rouge:", src: "/emojis/rose_rouge.png", alt: "rose rouge" },
  { code: ":dj:", src: "/emojis/dj.png", alt: "dj" },
  { code: ":rigolo:", src: "/emojis/rigolo.png", alt: "rigolo" },
  { code: ":cookie:", src: "/emojis/cookie.png", alt: "cookie" },
  { code: ":telephone:", src: "/emojis/telephone.png", alt: "telephone" },
  { code: ":bonbon:", src: "/emojis/bonbon.png", alt: "bonbon" },
  { code: ":ange_rire:", src: "/emojis/ange_rire.png", alt: "ange rire" },

  // Emojis Vero pack 2
  { code: ":chocolat_sourire:", src: "/emojis/chocolat_sourire.png", alt: "chocolat sourire" },
  { code: ":bieres:", src: "/emojis/bieres.png", alt: "bieres" },
  { code: ":sucette_or:", src: "/emojis/sucette_or.png", alt: "sucette or" },

  // Emojis Vero pack 3
  { code: ":fetard:", src: "/emojis/fetard.png", alt: "fêtard" },
  { code: ":anniversaire:", src: "/emojis/anniversaire.png", alt: "anniversaire" },

  // Emojis Vero pack 4
  { code: ":diable:", src: "/emojis/diable.png", alt: "diable" },
  { code: ":mdr:", src: "/emojis/mdr.png", alt: "mdr" },
  { code: ":furax:", src: "/emojis/furax.png", alt: "furax" },
  { code: ":heure:", src: "/emojis/heure.png", alt: "heure" },
  { code: ":jus_de_fruits:", src: "/emojis/jus_de_fruits.png", alt: "jus de fruits" },
  { code: ":pleure:", src: "/emojis/pleure.png", alt: "pleure" },
  { code: ":flute_champagne:", src: "/emojis/flute_champagne.png", alt: "flûte champagne" },
];

const CUSTOM_CHAT_EMOJIS = Object.fromEntries(
  SIMPLE_EMOJIS.map((emoji) => [emoji.code.toLowerCase(), emoji.src])
);

const CUSTOM_CHAT_EMOJI_REGEX = new RegExp(
  "(" + SIMPLE_EMOJIS.map((emoji) => emoji.code).join("|") + ")",
  "gi"
);

function renderCustomMessageContent(text) {
  const raw = String(text || "");

  const parts = raw.split(CUSTOM_CHAT_EMOJI_REGEX);

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

    return <span key={`text-${index}`}>{part}</span>;
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
  setIsEmojiPanelOpen(false);
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
    <div key={msg.id} className={`tablechat-line ${msg.from || "other"} ${roleClassFromRole(msg.role)}`}>
      <span className="tablechat-author">
        <PseudoDisplay
          name={msg.author}
          isAdmin={msg.role === "admin"}
          context="table-chat"
          suffix=":"
          textSuffix=" :"
        />
      </span>{" "}
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







