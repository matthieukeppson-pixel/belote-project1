import React, { useEffect, useRef, useState } from "react";
import "../styles/SalonHostPanel.css";

export default function SalonHostPanel({
  allowed,
  open,
  players,
  messages,
  unreadCount,
  arrivalNotice,
  currentUserName,
  onToggle,
  onSendMessage,
  tabletAudioControl = null,
}) {
  const [draft, setDraft] = useState("");
  const messagesRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const container = messagesRef.current;
    if (!container) return;

    container.scrollTop = container.scrollHeight;
  }, [messages.length, open]);

  if (!allowed) return null;

  const send = (event) => {
    event.preventDefault();

    const text = draft.trim();
    if (!text) return;

    onSendMessage(text);
    setDraft("");
  };

  return (
    <aside className="salon-host">
      {arrivalNotice && (
        <div className="salon-host__arrival" role="status">
          {arrivalNotice}
        </div>
      )}

      <div className="salon-host__topline">
        {tabletAudioControl && (
          <div className="salon-host__tablet-audio">
            {tabletAudioControl}
          </div>
        )}

        <button
          type="button"
          className="salon-host__toggle"
          onClick={onToggle}
        >
          Salon <span>{players.length}</span>
          {unreadCount > 0 && (
            <strong>{unreadCount > 99 ? "99+" : unreadCount}</strong>
          )}
        </button>
      </div>

      {open && (
        <section className="salon-host__panel">
          <header>
            <span>Le salon · {players.length} présent(s)</span>
            <button type="button" onClick={onToggle}>×</button>
          </header>

          <div
            ref={messagesRef}
            className="salon-host__messages"
          >
            {messages.length === 0 ? (
              <p>Aucun message reçu depuis l’ouverture de la table.</p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.user === currentUserName
                      ? "salon-host__message is-mine"
                      : "salon-host__message"
                  }
                >
                  <b>{message.user}</b>
                  <span>{message.text}</span>
                </div>
              ))
            )}
          </div>

          <form onSubmit={send}>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Écrire dans le salon…"
              maxLength={500}
            />
            <button type="submit" disabled={!draft.trim()}>
              Envoyer
            </button>
          </form>
        </section>
      )}
    </aside>
  );
}
