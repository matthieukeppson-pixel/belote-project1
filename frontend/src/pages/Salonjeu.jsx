import React, { useEffect, useRef, useState } from "react";

function roleClassFromRole(role) {
  if (role === "admin") return "role-admin";
  if (role === "moderator") return "role-moderator";
  return "";
}
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import "../styles/salonjeu.css";
import Profil from "./Profil.jsx";

const SALON_EMOJIS = [
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
  { code: ":fleur:", src: "/emojis/fleur.png", alt: "fleur" },
  { code: ":colere:", src: "/emojis/colere.png", alt: "colere" },
  { code: ":glace:", src: "/emojis/glace.png", alt: "glace" },
  { code: ":bisou:", src: "/emojis/bisou.png", alt: "bisou" },

  // Emojis Vero
  { code: ":langue_rire:", src: "/emojis/langue_rire.png", alt: "langue rire" },
  { code: ":anniversaire:", src: "/emojis/anniversaire.png", alt: "anniversaire" },
  { code: ":bouquet:", src: "/emojis/bouquet.png", alt: "bouquet" },
  { code: ":malade:", src: "/emojis/malade.png", alt: "malade" },
  { code: ":rose_rouge:", src: "/emojis/rose_rouge.png", alt: "rose rouge" },
  { code: ":dj:", src: "/emojis/dj.png", alt: "dj" },
  { code: ":rigolo:", src: "/emojis/rigolo.png", alt: "rigolo" },
  { code: ":cookie:", src: "/emojis/cookie.png", alt: "cookie" },
  { code: ":telephone:", src: "/emojis/telephone.png", alt: "telephone" },
  { code: ":jus_orange:", src: "/emojis/jus_orange.png", alt: "jus orange" },
  { code: ":bonbon:", src: "/emojis/bonbon.png", alt: "bonbon" },
  { code: ":ange_rire:", src: "/emojis/ange_rire.png", alt: "ange rire" },

  // Emojis Vero pack 2
  { code: ":chocolat_sourire:", src: "/emojis/chocolat_sourire.png", alt: "chocolat sourire" },
  { code: ":bieres:", src: "/emojis/bieres.png", alt: "bieres" },
  { code: ":sucette_or:", src: "/emojis/sucette_or.png", alt: "sucette or" },
];

const SALON_CHAT_EMOJIS = Object.fromEntries(
  SALON_EMOJIS.map((emoji) => [emoji.code.toLowerCase(), emoji.src])
);

const SALON_CHAT_EMOJI_REGEX = new RegExp(
  "(" + SALON_EMOJIS.map((emoji) => emoji.code).join("|") + ")",
  "gi"
);

function renderSalonMessageContent(text) {
  const raw = String(text || "");
  const parts = raw.split(SALON_CHAT_EMOJI_REGEX);

  return parts.map((part, index) => {
    const clean = String(part || "").trim().toLowerCase();
    const src = SALON_CHAT_EMOJIS[clean];

    if (src) {
      return (
        <span key={`salon-emoji-${index}`} className="salon-chat-custom-emoji-wrap">
          <img
            src={src}
            alt={clean}
            className="salon-chat-custom-emoji"
          />
        </span>
      );
    }

    return <span key={`salon-text-${index}`}>{part}</span>;
  });
}


export default function SalonJeu({ user }) {
  const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
  const currentName =
    user?.pseudo ||
    user?.username ||
    localStorage.getItem("pseudo") ||
    storedUser.pseudo ||
    storedUser.username ||
    "Joueur";

  const [players, setPlayers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");

  const roleClassForUser = (name, explicitRole) => {
    const role =
      explicitRole ||
      players.find((player) => player.name === name)?.role ||
      "player";

    return roleClassFromRole(role);
  };
  const [isEmojiPanelOpen, setIsEmojiPanelOpen] = useState(false);
  const [showProfil, setShowProfil] = useState(false);
  const [isMusicListening, setIsMusicListening] = useState(false);
  const [musicVolume, setMusicVolume] = useState(50);
  const [isMusicMenuOpen, setIsMusicMenuOpen] = useState(false);
  const [animationState, setAnimationState] = useState({
    mode: "playlist",
    hostPseudo: null,
    title: "Playlist en continu",
  });

  // ✅ Tables viennent du serveur WS (plus de mock)
  // format attendu depuis serveur: { id, mode, seats, count }
  const [tables, setTables] = useState([]);

  const wsRef = useRef(null);
  const chatBoxRef = useRef(null);
  const musicAudioRef = useRef(null);
  const navigate = useNavigate();
  const playlistAudioUrl = import.meta.env.VITE_PLAYLIST_AUDIO_URL || "";
  const djStreamUrl = import.meta.env.VITE_DJ_STREAM_URL || "";
  const currentAudioUrl =
    animationState.mode === "live" ? djStreamUrl : playlistAudioUrl;
  const currentUserRole = String(user?.role || storedUser.role || "player");
  const isAdminUser = currentUserRole === "admin";
  const isModeratorUser = currentUserRole === "moderator";
  const isStaffUser = isAdminUser || isModeratorUser;

  useEffect(() => {
    const audio = musicAudioRef.current;
    if (!audio) return;

    audio.volume = Math.max(0, Math.min(1, musicVolume / 100));

    const shouldPlayAudio = isMusicListening && Boolean(currentAudioUrl);

    if (!shouldPlayAudio) {
      audio.pause();
      return;
    }

    audio.play().catch(() => {
      // Le navigateur peut bloquer la lecture automatique.
      // L'utilisateur pourra relancer avec le bouton Ecouter.
    });
  }, [currentAudioUrl, isMusicListening, musicVolume]);

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

  function createSalonTable() {
    sendWS({ type: "create_table", mode: "classic" });
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
    // évite double connexion (dev/refresh)
    if (wsRef.current) return;

    let cancelled = false;

    const wsUrl = import.meta.env.VITE_WS_URL || "ws://localhost:4000";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (cancelled) {
        ws.close(1000, "cleanup");
        return;
      }

      ws.send(
        JSON.stringify({
          type: "join_salon",
          pseudo: currentName,
          avatar: localStorage.getItem("profile_photo_local") || "/avatar_blue.png",
        })
      );

      // état initial
      ws.send(JSON.stringify({ type: "get_players" }));
      ws.send(JSON.stringify({ type: "get_tables" }));
    };

ws.onmessage = (event) => {
  let data;
  try {
    data = JSON.parse(event.data);
  } catch {
    return;
  }

  switch (data.type) {
    case "players":
      setPlayers(
        (data.players || []).map((p) => ({
          name: p.name,
          avatar: p.avatar || "/avatar_blue.png",
          role: p.role || "player",
        }))
      );
      return;

    case "tables":
      setTables(Array.isArray(data.tables) ? data.tables : []);
      return;

    case "animation_state":
      setAnimationState({
        mode: data.mode === "live" ? "live" : "playlist",
        hostPseudo: data.hostPseudo || null,
        title:
          data.title ||
          (data.mode === "live" ? "Direct DJ" : "Playlist en continu"),
      });
      return;

    case "joined_table":
      navigate(`/table/${data.tableId}`, {
        state: {
          mode: data.mode,
          pseudo: currentName,
          avatar: localStorage.getItem("profile_photo_local") || "/avatar_blue.png",
        },
      });
      return;

case "animation_denied":
  setMessages((prev) => [
    ...prev,
    {
      id: `${Date.now()}-${Math.random()}`,
      user: "Système",
      text: "Animation refusée : seuls Véro ou Matt peuvent prendre le direct.",
    },
  ]);
  return;

case "message":
  if (data.user === "Système") return;

  setMessages((prev) => [
    ...prev,
    {
      id: `${Date.now()}-${Math.random()}`,
      user: data.user,
      text: data.text,
      role: data.role,
    },
  ]);
  return;

case "system":
  return;

default:
  return;
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
  const addEmoji = (code) => {

    setInputMessage((prev) => {

      const clean = String(prev || "").trim();

      return clean ? `${clean} ${code}` : code;

    });

  };


  const sendMessage = () => {
    const text = inputMessage.trim();
    if (!text) return;

    sendWS({
      type: "message",
      user: currentName,
      text,
    });

    setInputMessage("");


    setIsEmojiPanelOpen(false);
  };

  const normalizeAnimationPseudo = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();

  const canUseAnimationLive = ["vero", "matt"].includes(
    normalizeAnimationPseudo(currentName)
  );

  const isCurrentAnimationHost =
    animationState.mode === "live" &&
    normalizeAnimationPseudo(animationState.hostPseudo) ===
      normalizeAnimationPseudo(currentName);

  const startLiveAnimation = () => {
    sendWS({ type: "start_live_animation" });
  };

  const stopLiveAnimation = () => {
    sendWS({ type: "stop_live_animation" });
  };

  /* ===============================
     CHAT TOUJOURS EN BAS
  ================================ */
  useEffect(() => {
    if (!chatBoxRef.current) return;
    chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
  }, [messages]);

  /* ===============================
     RENDER
  ================================ */
  return (
    <div className="salon-wrapper">
      {isStaffUser && (
        <button
          type="button"
          className="salon-admin-btn"
          onClick={() => navigate("/admin")}
          title={isAdminUser ? "Administration Matt/Véro" : "Modération"}
        >
          {isAdminUser ? "Administration" : "Modération"}
        </button>
      )}
      <div className="salon-music-controls" aria-label="Musique">
        <audio
          ref={musicAudioRef}
          src={currentAudioUrl}
          loop={animationState.mode === "playlist"}
          preload="none"
        />
        <button
          type="button"
          className="salon-animation-btn"
          title={animationState.title || "Musique"}
          onClick={() => setIsMusicMenuOpen((open) => !open)}
          aria-expanded={isMusicMenuOpen}
        >
          <><span className="animation-music-icon">{String.fromCodePoint(0x266A)}</span> Musique</>
        </button>
        {isMusicMenuOpen && (
          <div className="salon-music-menu" aria-label="Actions musique">
            <button
              type="button"
              className="salon-music-action-btn"
              onClick={() => setIsMusicListening(true)}
              aria-pressed={isMusicListening}
              title="Ecouter les animations"
            >
              {"\u00C9couter"}
            </button>
            <button
              type="button"
              className="salon-music-action-btn"
              onClick={() => setIsMusicListening(false)}
              aria-pressed={!isMusicListening}
              title="Couper les animations"
            >
              Couper
            </button>
            {canUseAnimationLive && (
              <button
                type="button"
                className="salon-music-action-btn"
                onClick={
                  isCurrentAnimationHost ? stopLiveAnimation : startLiveAnimation
                }
                title={
                  isCurrentAnimationHost
                    ? "Arrêter le direct DJ"
                    : "Prendre le direct DJ"
                }
              >
                {isCurrentAnimationHost ? "Arrêter le direct" : "Prendre le direct"}
              </button>
            )}
          </div>
        )}
        <div className="salon-music-volume-wrap" aria-label="Volume musique">
          <button
            type="button"
            className="salon-music-volume-btn"
            onClick={() => setMusicVolume((volume) => Math.max(0, volume - 10))}
            aria-label="Baisser le volume"
          >
            -
          </button>
          <input
            className="salon-music-volume-slider"
            type="range"
            min="0"
            max="100"
            value={musicVolume}
            onChange={(event) => setMusicVolume(Number(event.target.value))}
            aria-label="Volume musique"
          />
          <button
            type="button"
            className="salon-music-volume-btn"
            onClick={() => setMusicVolume((volume) => Math.min(100, volume + 10))}
            aria-label="Monter le volume"
          >
            +
          </button>
        </div>
      </div>

      <div className="salon-grid">
        {/* TABLES */}
        <div className="panel panel-side">
          <h2 className="panel-title">Tables</h2>

          {tables.length < 6 ? (
            <button
              type="button"
              className="btn-create-table"
              onClick={createSalonTable}
              title={"Cr\u00E9er une table"}
            >
              {"+ Cr\u00E9er une table"}
            </button>
          ) : (
            <div className="tables-ready-info">
              {tables.length + " tables disponibles"}
            </div>
          )}

          <div className="tables-list">
            {tables.map((t) => {
             const humanCount =
  typeof t.count === "number"
    ? t.count
    : Array.isArray(t.seatsInfo)
      ? t.seatsInfo.filter((seat) => seat?.name && !seat?.isBot).length
      : 0;

const isHumanFull = humanCount >= 4;
const isReadyWithBots =
  t.game?.status === "READY" && humanCount > 0 && humanCount < 4;

const statusText = isHumanFull
  ? "Complète"
  : isReadyWithBots
    ? "Jouable"
    : "En attente";

              return (
                <div key={t.id} className="table-card">
                  <div className="table-title">Table {t.id}</div>
                <div className="table-info">Joueurs : {humanCount} / 4</div>
<div className="table-info">Statut : {statusText}</div>
                  <div className="table-seated-players">
  {(t.seatsInfo || [])
    .filter((seat) => seat?.name)
    .map((seat) => (
      <div key={seat.name} className="table-seated-player">
        {seat.name}
      </div>
    ))}

  {(!t.seatsInfo || t.seatsInfo.filter((seat) => seat?.name).length === 0) && (
    <div className="table-seated-player empty">Aucun joueur</div>
  )}
</div>
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

                  <div className="table-card-actions">
                    <button
                      className="btn-join"
                      disabled={isHumanFull}
                      onClick={() => {
                        navigate(`/table/${t.id}`, { state: { mode: t.mode } });
                      }}
                    >
                      {isHumanFull ? "Table compl\u00E8te" : "Rejoindre"}
                    </button>

                    <button
                      className="btn-watch"
                      onClick={() => {
                        navigate(`/table/${t.id}`, {
                          state: { mode: t.mode, role: "visitor" },
                        });
                      }}
                    >
                      Regarder
                    </button>
                  </div>
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
              <div key={m.id} className={`chat-message ${roleClassForUser(m.user, m.role)}`}>
                <span className="chat-user">{m.user} :</span>
                <span className="chat-text">{renderSalonMessageContent(m.text)}</span>
              </div>
            ))}
          </div>

          {isEmojiPanelOpen && (


            <div className="salon-chat-emojis">


              {SALON_EMOJIS.map((emoji) => (


                <button


                  key={emoji.code}


                  type="button"


                  className="salon-chat-emoji-btn"


                  onClick={() => addEmoji(emoji.code)}


                  title={emoji.alt}


                >


                  <img


                    src={emoji.src}


                    alt={emoji.alt}


                    className="salon-chat-emoji-btn-img"


                  />


                </button>


              ))}


            </div>


          )}



          <div className="chat-input-zone">
            <input
              className="chat-input"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Écrire un message..."
            />
            <button

              type="button"

              className="chat-emoji-toggle"

              onClick={() => setIsEmojiPanelOpen((prev) => !prev)}

              title="Ouvrir les emojis"

            >

              {isEmojiPanelOpen ? "\u2715" : "\u{1F60A}"}

            </button>

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
                <div className={`player-name ${roleClassFromRole(p.role)}`}>
                  {p.name}
                </div>
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