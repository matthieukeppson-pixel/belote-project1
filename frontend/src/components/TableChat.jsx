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

  { code: ":rire:", src: "/emojis/rire.png", alt: "rire" },
  { code: ":dodo:", src: "/emojis/dodo.png", alt: "dodo" },
  { code: ":fleur:", src: "/emojis/fleur.png", alt: "fleur" },
  { code: ":colere:", src: "/emojis/colere.png", alt: "colere" },
  { code: ":glace:", src: "/emojis/glace.png", alt: "glace" },
  { code: ":bisou:", src: "/emojis/bisou.png", alt: "bisou" },

  // Emojis Vero
  { code: ":langue_rire:", src: "/emojis/langue_rire.png", alt: "langue rire" },
  { code: ":anniversaire:", src: "/emojis/anniversaire.png", alt: "anniversaire" },
  { code: ":sucette:", src: "/emojis/sucette.png", alt: "sucette" },
  { code: ":bouquet:", src: "/emojis/bouquet.png", alt: "bouquet" },
  { code: ":cafe_croissant:", src: "/emojis/cafe_croissant.png", alt: "cafe croissant" },
  { code: ":singe_chut:", src: "/emojis/singe_chut.png", alt: "singe chut" },
  { code: ":malade:", src: "/emojis/malade.png", alt: "malade" },
  { code: ":rose_rouge:", src: "/emojis/rose_rouge.png", alt: "rose rouge" },
  { code: ":dj:", src: "/emojis/dj.png", alt: "dj" },
  { code: ":rigolo:", src: "/emojis/rigolo.png", alt: "rigolo" },
  { code: ":cookie:", src: "/emojis/cookie.png", alt: "cookie" },
  { code: ":telephone:", src: "/emojis/telephone.png", alt: "telephone" },
  { code: ":jus_orange:", src: "/emojis/jus_orange.png", alt: "jus orange" },
  { code: ":ange:", src: "/emojis/ange.png", alt: "ange" },
  { code: ":bonbon:", src: "/emojis/bonbon.png", alt: "bonbon" },
  { code: ":ange_rire:", src: "/emojis/ange_rire.png", alt: "ange rire" },
  { code: ":croissant:", src: "/emojis/croissant.png", alt: "croissant" },
  { code: ":barbecue:", src: "/emojis/barbecue.png", alt: "barbecue" },

  // Emojis Vero pack 2
  { code: ":merci_pancarte:", src: "/emojis/merci_pancarte.png", alt: "merci pancarte" },
  { code: ":chocolat_sourire:", src: "/emojis/chocolat_sourire.png", alt: "chocolat sourire" },
  { code: ":bieres:", src: "/emojis/bieres.png", alt: "bieres" },
  { code: ":musique_calme:", src: "/emojis/musique_calme.png", alt: "musique calme" },
  { code: ":micro:", src: "/emojis/micro.png", alt: "micro" },
  { code: ":glace_choco:", src: "/emojis/glace_choco.png", alt: "glace choco" },
  { code: ":fete:", src: "/emojis/fete.png", alt: "fete" },
  { code: ":sucette_or:", src: "/emojis/sucette_or.png", alt: "sucette or" },
  { code: ":malade_thermo:", src: "/emojis/malade_thermo.png", alt: "malade thermo" },
  { code: ":chocolat:", src: "/emojis/chocolat.png", alt: "chocolat" },
  { code: ":singe_cache:", src: "/emojis/singe_cache.png", alt: "singe cache" },
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







