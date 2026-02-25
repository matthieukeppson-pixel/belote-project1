import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import "../styles/salonjeu.css";
import Profil from "./Profil.jsx";

export default function SalonJeu({ user }) {
  const currentName = user?.pseudo || "Joueur";

  const [players, setPlayers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [showProfil, setShowProfil] = useState(false);

  // ✅ Tables (state) : chaque table a son mode
  const [tables, setTables] = useState([
    { id: 1, joueurs: 2, mode: "classic" },
    { id: 2, joueurs: 0, mode: "classic" },
    { id: 3, joueurs: 0, mode: "classic" },
  ]);

  const wsRef = useRef(null);
  const chatBoxRef = useRef(null);
  const navigate = useNavigate();

  // ==========================
  // MENU MODE (PORTAL) — vers le bas, jamais coupé
  // ==========================
  const [openMenu, setOpenMenu] = useState(null); // tableId ouvert ou null
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 160 });
  const triggerRefs = useRef({}); // refs des boutons "Belote ▾" par table

const modeText = (mode) => {
  switch (mode) {
    case "classic":
      return "Classique";
    case "contree":
      return "Contrée";
    case "moderne":
      return "Moderne";
    default:
      return "Classique";
  }
};

  function setTableMode(tableId, newMode) {
    setTables((prev) =>
      prev.map((t) => (t.id === tableId ? { ...t, mode: newMode } : t))
    );
    setOpenMenu(null);
  }

  function toggleModeMenu(tableId) {
    if (openMenu === tableId) {
      setOpenMenu(null);
      return;
    }

    const el = triggerRefs.current[tableId];
    if (!el) return;

    const r = el.getBoundingClientRect();
    setMenuPos({
      top: r.bottom + 6, // ✅ ouvre vers le bas
      left: r.left,
      width: Math.max(170, r.width),
    });

    setOpenMenu(tableId);
  }

  // Fermer le menu au clic dehors / scroll / resize
useEffect(() => {
  const onPointerDown = (e) => {
    // ✅ si clic sur un bouton trigger OU dans le menu portal => ne ferme pas
    if (e.target.closest(".table-mode-trigger")) return;
    if (e.target.closest(".table-mode-menu-portal")) return;

    setOpenMenu(null);
  };

  const onScrollOrResize = () => setOpenMenu(null);

  // capture = plus fiable que click en bubbling avec React
  document.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("scroll", onScrollOrResize, true);
  window.addEventListener("resize", onScrollOrResize);

  return () => {
    document.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("scroll", onScrollOrResize, true);
    window.removeEventListener("resize", onScrollOrResize);
  };
}, []);


  /* ===============================
     WEBSOCKET SALON
  ================================ */
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:4000");
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "join_salon",
          pseudo: currentName,
          avatar:
            localStorage.getItem("profile_photo_local") || "/avatar_blue.png",
        })
      );

      ws.send(JSON.stringify({ type: "get_players" }));
    };

    ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === "players") {
        setPlayers(
          (data.players || []).map((p) => ({
            name: p.name,
            avatar: p.avatar || "/avatar_blue.png",
          }))
        );
        return;
      }

      if (data.type === "message") {
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random()}`,
            user: data.user,
            text: data.text,
          },
        ]);
      }
    };

    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ===============================
     🔁 AVATAR → SYNCHRO IMMEDIATE
  ================================ */
  const handleAvatarChanged = (newAvatar) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // 1️⃣ Mise à jour locale
    setPlayers((prev) =>
      prev.map((p) => (p.name === currentName ? { ...p, avatar: newAvatar } : p))
    );

    // 2️⃣ Envoi backend
    ws.send(
      JSON.stringify({
        type: "update_avatar",
        pseudo: currentName,
        avatar: newAvatar,
      })
    );
  };

  /* ===============================
     ENVOI MESSAGE
  ================================ */
  const sendMessage = () => {
    const text = inputMessage.trim();
    if (!text) return;

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(
      JSON.stringify({
        type: "message",
        user: currentName,
        text,
      })
    );

    setInputMessage("");
  };

  /* ===============================
     CHAT TOUJOURS EN HAUT
  ================================ */
  useEffect(() => {
    if (!chatBoxRef.current) return;
    chatBoxRef.current.scrollTop = 0;
  }, [messages]);

  /* ===============================
     RENDER
  ================================ */
  return (
    <div className="salon-wrapper">
      <div className="salon-grid">
        {/* TABLES */}
        <div className="panel panel-side">
          <h2 className="panel-title">Tables</h2>

          <div className="tables-list">
            {tables.map((t) => (
              <div key={t.id} className="table-card">
                <div className="table-title">Table {t.id}</div>
                <div className="table-info">Joueurs : {t.joueurs} / 4</div>

                <div className="table-info">Statut : En attente</div>

                {/* ✅ Mode : sous le statut (Belote ▾ + menu) */}
                <div className="table-info mode">
                  <span className="table-mode-label">Mode{"\u00A0"}:</span>

                  <div className="table-mode-dropdown">
                    <button
                      type="button"
                      className="table-mode-trigger"
                      ref={(node) => (triggerRefs.current[t.id] = node)}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleModeMenu(t.id);
                      }}
                    >
                      Belote <span className="caret">▾</span>
                    </button>
                  </div>

                  <span className="table-mode-value">{modeText(t.mode)}</span>
                </div>

                <button
                  className="btn-join"
                  onClick={() => {
                    navigate(`/table/${t.id}`, { state: { mode: t.mode } });
                  }}
                >
                  Rejoindre
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* TCHAT */}
        <div className="panel panel-center">
          <h2 className="panel-title">Tchat</h2>

          <div className="chat-box" ref={chatBoxRef}>
            {messages.map((m) => (
              <div key={m.id} className="chat-message">
                <span className="chat-user">{m.user} :</span>
                <span className="chat-text">{m.text}</span>
              </div>
            ))}
          </div>

          <div className="chat-input-zone">
            <input
              className="chat-input"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Écrire un message..."
            />
            <button className="chat-send" onClick={sendMessage}>
              Envoyer
            </button>
          </div>
        </div>

        {/* JOUEURS */}
        <div className="panel panel-side">
          <h2 className="panel-title">Joueurs</h2>
          <div className="players-list">
            {players.map((p) => (
              <div key={p.name} className="player-card">
                <img
                  src={p.avatar}
                  className="player-avatar"
                  alt=""
                  onClick={() => p.name === currentName && setShowProfil(true)}
                  style={{
                    cursor: p.name === currentName ? "pointer" : "default",
                  }}
                />
                <div className="player-name">{p.name}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showProfil && (
        <Profil
          pseudo={currentName}
          onClose={() => setShowProfil(false)}
          onAvatarChanged={handleAvatarChanged}
        />
      )}

      {/* ✅ MENU PORTAL (vers le bas, jamais coupé par overflow) */}
      {openMenu !== null &&
        createPortal(
          <div
            className="table-mode-menu-portal"
            style={{
              top: `${menuPos.top}px`,
              left: `${menuPos.left}px`,
              width: `${menuPos.width}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" onClick={() => setTableMode(openMenu, "classic")}>
              Classique
            </button>
            <button type="button" onClick={() => setTableMode(openMenu, "contree")}>
              Contrée
            </button>
            <button onClick={() => navigate("/table", { state: { mode: "moderne" } })}>
  Moderne
</button>
          </div>,
          document.body
        )}
    </div>
  );
}























































































































































































































































































































































































































