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

  // ✅ Tables viennent du serveur WS (plus de mock)
  // format attendu depuis serveur: { id, mode, seats, count }
  const [tables, setTables] = useState([]);

  const wsRef = useRef(null);
  const chatBoxRef = useRef(null);
  const navigate = useNavigate();

  // ==========================
  // MENU MODE (PORTAL)
  // ==========================
  const [openMenu, setOpenMenu] = useState(null); // tableId ouvert ou null
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 160 });
  const triggerRefs = useRef({}); // refs des boutons mode par table

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

  function sendWS(obj) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(obj));
  }

  function setTableMode(tableId, newMode) {
    // ✅ demande au serveur (source de vérité)
    sendWS({ type: "set_table_mode", tableId, mode: newMode });
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
      top: r.bottom + 6,
      left: r.left,
      width: Math.max(170, r.width),
    });

    setOpenMenu(tableId);
  }

  // Fermer menu au clic dehors / scroll / resize
  useEffect(() => {
    const onPointerDown = (e) => {
      if (e.target.closest(".table-mode-trigger")) return;
      if (e.target.closest(".table-mode-menu-portal")) return;
      setOpenMenu(null);
    };

    const onScrollOrResize = () => setOpenMenu(null);

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
    if (wsRef.current) return;

    let cancelled = false;

    const ws = new WebSocket("ws://localhost:4000");
    wsRef.current = ws;

    ws.onopen = () => {
      if (cancelled) {
        ws.close(1000, "cleanup");
        return;
      }

      sendWS({
        type: "join_salon",
        pseudo: currentName,
        avatar: localStorage.getItem("profile_photo_local") || "/avatar_blue.png",
      });

      // ✅ état initial
      sendWS({ type: "get_players" });
      sendWS({ type: "get_tables" });
    };

    ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === "joined_table") {
  navigate(`/table/${data.tableId}`, {
    state: {
      mode: data.mode,
      pseudo: currentName,
      avatar: localStorage.getItem("profile_photo_local") || "/avatar_blue.png",
    },
  });
  return;
}

      // ✅ NEW : tables venant du serveur
      if (data.type === "tables") {
        setTables(Array.isArray(data.tables) ? data.tables : []);
        return;
      }

      // message chat
      if (data.type === "message") {
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random()}`,
            user: data.user,
            text: data.text,
          },
        ]);
        return;
      }

      // système (optionnel) -> on l’affiche dans le chat
      if (data.type === "system") {
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random()}`,
            user: "Système",
            text: data.text,
          },
        ]);
      }
    };

    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null;
    };

    return () => {
      cancelled = true;
      if (wsRef.current === ws) wsRef.current = null;
      if (ws.readyState === WebSocket.OPEN) ws.close(1000, "cleanup");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ===============================
     🔁 AVATAR → SYNCHRO IMMEDIATE
  ================================ */
  const handleAvatarChanged = (newAvatar) => {
    // mise à jour locale
    setPlayers((prev) =>
      prev.map((p) => (p.name === currentName ? { ...p, avatar: newAvatar } : p))
    );

    // envoi backend
    sendWS({
      type: "update_avatar",
      pseudo: currentName,
      avatar: newAvatar,
    });
  };

  /* ===============================
     ENVOI MESSAGE
  ================================ */
  const sendMessage = () => {
    const text = inputMessage.trim();
    if (!text) return;

    sendWS({
      type: "message",
      user: currentName,
      text,
    });

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
            {tables.map((t) => {
              const count = t.count ?? (t.seats ? t.seats.filter(Boolean).length : 0);
              const isFull = count >= 4;

              return (
                <div key={t.id} className="table-card">
                  <div className="table-title">Table {t.id}</div>
                  <div className="table-info">Joueurs : {count} / 4</div>
                  <div className="table-info">Statut : {isFull ? "Complète" : "En attente"}</div>

                  {/* Mode */}
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
                        {modeText(t.mode)} <span className="caret">▾</span>
                      </button>
                    </div>
                  </div>

                  <button
                    className="btn-join"
                    disabled={isFull}
                    onClick={() => {
                      // ✅ informe le serveur
                      sendWS({ type: "join_table", tableId: t.id });

                      // ✅ navigation vers la table
                      navigate(`/table/${t.id}`, { state: { mode: t.mode } });
                    }}
                  >
                    {isFull ? "Table complète" : "Rejoindre"}
                  </button>
                </div>
              );
            })}
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

      {/* MENU PORTAL */}
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
            <button type="button" onClick={() => setTableMode(openMenu, "moderne")}>
              Moderne
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}























































































































































































































































































































































































































