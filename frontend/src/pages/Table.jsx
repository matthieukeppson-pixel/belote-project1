import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";

import TableChat from "../components/TableChat";
import "../styles/Table.css";

import { createInitialGameState, dispatch, STATES } from "../game/beloteEngine";
import Partie from "../game/Partie";

// ============================================
// HELPERS ATTOUT — UI TABLE UNIQUEMENT
// ============================================

const ALL_SUITS = ["hearts", "diamonds", "clubs", "spades"];
const BID_VALUES = [80, 90, 100, 110, 120, 130, 140, 150, 160, 500];

function suitLabel(suit) {
  switch (suit) {
    case "hearts":
      return "♥";
    case "diamonds":
      return "♦";
    case "clubs":
      return "♣";
    case "spades":
      return "♠";
    default:
      return "";
  }
}

// ============================================
// UI — SYMBOLE ATOUT
// ============================================
function atoutSymbol(atout) {
  switch (atout) {
    case "hearts":
      return "♥";
    case "diamonds":
      return "♦";
    case "clubs":
      return "♣";
    case "spades":
      return "♠";
    case "SA":
      return "SA";
    case "TA":
      return "TA";
    default:
      return "";
  }
}

function cardImgSrc(card) {
  if (!card) return "";
  const suit = String(card.suit);
  const value = String(card.value).toUpperCase();
  return `/cards/${suit}/${value}.png`;
}

const SUIT_RANK = { clubs: 0, diamonds: 1, spades: 2, hearts: 3 };
const VALUE_RANK = { "7": 0, "8": 1, "9": 2, J: 3, Q: 4, K: 5, "10": 6, A: 7 };

function compareCards(a, b) {
  const sa = SUIT_RANK[a.suit] ?? 99;
  const sb = SUIT_RANK[b.suit] ?? 99;
  if (sa !== sb) return sa - sb;

  const va = VALUE_RANK[String(a.value).toUpperCase()] ?? 99;
  const vb = VALUE_RANK[String(b.value).toUpperCase()] ?? 99;
  return va - vb;
}

export default function Table() {

  const navigate = useNavigate();
  const location = useLocation();
  const mode = location.state?.mode || "classic";

  const { id } = useParams();
  const tableId = Number(id);

  const pseudo = location.state?.pseudo || "joueur1";
  const avatar = location.state?.avatar || "/avatar_blue.png";

  const wsTableRef = useRef(null);

  useEffect(() => {
    if (!tableId) return;

    const ws = new WebSocket("ws://localhost:4000");
    wsTableRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join_salon", pseudo, avatar }));
      ws.send(JSON.stringify({ type: "join_table", tableId }));
    };

    return () => {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "leave_table", tableId }));
          ws.close(1000, "leave");
        } else {
          ws.close(1000, "leave");
        }
      } catch (e) {
        if (import.meta.env.DEV) console.warn("WS cleanup error", e);
      }

      if (wsTableRef.current === ws) wsTableRef.current = null;
    };
  }, [tableId, pseudo, avatar]);

  const [bidValue, setBidValue] = useState(80);
  const [scoreDebug, setScoreDebug] = useState(null);

  // ============================================
  // PARTIE (présente mais non pilotante)
  // ============================================
  const partieRef = useRef(null);

  // 🔒 CADENAS : empêche de compter deux fois une fin de manche
  const finDeMancheCompteeRef = useRef(false);
  const finDeMancheRef = useRef(null);

  useEffect(() => {
    if (partieRef.current === null) {
      const targetScore = mode === "contree" ? 1500 : 500;

      partieRef.current = new Partie({
        players: ["joueur1", "joueur4", "joueur2", "joueur3"],
        targetScore,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================
  // GAME STATE
  // ============================================
  const [game, setGame] = useState(() => {
    let g = createInitialGameState();

    g = {
      ...g,
      ruleset: mode,
      contratMultiplicateur: 1,
      contratValeur: null,
      players: ["joueur1", "joueur4", "joueur2", "joueur3"],
    };

    g = dispatch(g, { type: "TABLE_READY" });
    g = dispatch(g, { type: "DISTRIBUTE_CARDS" });
    g = dispatch(g, { type: "DISTRIBUTE_CARDS" });

    return g;
  });

  // ============================================
  // UI STATES
  // ============================================
  const [displayPli, setDisplayPli] = useState([]);
  const [hideLastPli, setHideLastPli] = useState(false);
  const [beloteToast, setBeloteToast] = useState(null);

const [scorePartie, setScorePartie] = useState({ nous: 0, eux: 0 });
const [partieTerminee, setPartieTerminee] = useState(false);
const [visibleAnnouncement, setVisibleAnnouncement] = useState(null);
const [announcementFading, setAnnouncementFading] = useState(false);

  function handleNouvellePartie() {
    setDisplayPli([]);
    setHideLastPli(false);

    finDeMancheCompteeRef.current = false;
    finDeMancheRef.current = null;

    const targetScore = mode === "contree" ? 1500 : 500;
    partieRef.current = new Partie({
      players: game.players,
      targetScore,
    });

    setScorePartie({ nous: 0, eux: 0 });
    setPartieTerminee(false);

    let g = createInitialGameState();
    g = {
      ...g,
      ruleset: mode,
      contratMultiplicateur: 1,
      contratValeur: null,
      players: game.players,
    };

    g = dispatch(g, { type: "TABLE_READY" });
    g = dispatch(g, { type: "DISTRIBUTE_CARDS" });
    g = dispatch(g, { type: "DISTRIBUTE_CARDS" });

    setGame(g);
  }

  useEffect(() => {
    if (mode !== "contree") return;
    if (game.state !== STATES.ENCHERES) return;
    if (game.currentBid) return;

    setBidValue(80);
  }, [mode, game.state, game.currentBid]);

  useEffect(() => {
    const s = game?.belote?.state;
    if (!s || s === "NONE") return;

    if (s === "BELOTE") {
      setBeloteToast({ text: `Belote ! (${game.belote.joueur})`, ts: Date.now() });
    } else if (s === "REBELOTE") {
      setBeloteToast({ text: `Rebelote ! (${game.belote.joueur})`, ts: Date.now() });
    }

    const t = setTimeout(() => setBeloteToast(null), 1200);
    return () => clearTimeout(t);
  }, [game?.belote?.state, game?.belote?.joueur]);

  // ============================================
  // AFFICHAGE DU PLI
  // ============================================
  useEffect(() => {
    if (game.pli.length > 0) {
      const showTimer = setTimeout(() => {
        setHideLastPli(false);
        setDisplayPli(game.pli);
      }, 0);

      return () => clearTimeout(showTimer);
    }

    if (game.pli.length === 0 && displayPli.length > 0) {
      const hideTimer = setTimeout(() => {
        setDisplayPli([]);
      }, 700);

      return () => clearTimeout(hideTimer);
    }
  }, [game.pli, displayPli]);

  // ============================================
  // FIN DE MANCHE — CALCUL PARTIE
  // ============================================
  useEffect(() => {
    if (game.state !== STATES.FIN_DE_MANCHE) return;
    if (!partieRef.current) return;

    if (finDeMancheCompteeRef.current) return;
    finDeMancheCompteeRef.current = true;

    if (!game.finDeManche) {
      console.warn("FIN_DE_MANCHE sans game.finDeManche -> abort (évite score faux)");
      return;
    }

    const finDeMancheSafe = {
      scoreFinal: game.scoreManche ?? { nous: 0, eux: 0 },
      contratValeur: game.contratValeur ?? null,
      contratMultiplicateur: game.contratMultiplicateur || 1,
      ruleset: game.ruleset ?? mode,
      preneur: game.preneur ?? null,
      atout: game.atout ?? null,
      ...game.finDeManche,
    };

   console.log("FIN MANCHE (finDeMancheSafe)", finDeMancheSafe);

   if (import.meta.env.DEV) {
  const sf = finDeMancheSafe.scoreFinal || { nous: 0, eux: 0 };
  const total = (sf.nous || 0) + (sf.eux || 0);

  const ruleset = finDeMancheSafe.ruleset;
  const atout = finDeMancheSafe.atout;

  const contrat = finDeMancheSafe.contratValeur || 0;
  const multLocal = finDeMancheSafe.contratMultiplicateur || 1;

  let ok = true;

  if (ruleset === "moderne") {
    const base = atout === "TA" ? 258 : 162;
    const announcePoints = (game.modernAnnouncements?.validated || []).reduce(
      (sum, ann) => sum + (ann?.points || 0),
      0
    );
    const beloteBonus = game?.belote?.state === "REBELOTE" ? 20 : 0;

    ok = total === base + announcePoints + beloteBonus;
  } else if (ruleset === "classic") {
    ok = total === 162 || total === 182;
  } else if (ruleset === "contree") {
    const base = 162 + contrat * multLocal;
    ok = total === base || total === base + 20;
  }

  if (!ok) {
    setScoreDebug(
      `⚠️ Score incohérent: total=${total} ruleset=${ruleset} atout=${atout} contrat=${contrat} mult=${multLocal}`
    );
  } else {
    setScoreDebug(null);
  }
}

    const next = partieRef.current.onFinDeManche({
      dealerIndex: game.dealerIndex,
      finDeManche: finDeMancheSafe,
    });

    finDeMancheRef.current = next;

    if (next?.scorePartie) setScorePartie(next.scorePartie);
    if (next?.partieTerminee) setPartieTerminee(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.state]);

  // ============================================
  // FIN DE MANCHE — VISUEL (dernier pli)
  // ============================================
  useEffect(() => {
    if (game.state !== STATES.FIN_DE_MANCHE) return;

    const timer = setTimeout(() => {
      setHideLastPli(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, [game.state]);

  // ============================================
  // RELANCE DE MANCHE (APRÈS VISUEL)
  // ============================================
  useEffect(() => {
    if (game.state !== STATES.FIN_DE_MANCHE) return;

    const timer = setTimeout(() => {
      const next = finDeMancheRef.current;
      if (!next || next.partieTerminee) return;

      setDisplayPli([]);
      setHideLastPli(false);

      finDeMancheCompteeRef.current = false;
      finDeMancheRef.current = null;

      let g = createInitialGameState();

      g = {
        ...g,
        ruleset: mode,
        contratMultiplicateur: 1,
        contratValeur: null,
        players: game.players,
        dealerIndex: next.dealerIndex,
        currentPlayerIndex: next.startingPlayerIndex,
      };

      g = dispatch(g, { type: "TABLE_READY" });
      g = dispatch(g, { type: "DISTRIBUTE_CARDS" });
      g = dispatch(g, { type: "DISTRIBUTE_CARDS" });

      setGame(g);
    }, 1600);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.state]);

  // ============================================
  // FIN DE PLI
  // ============================================
  useEffect(() => {
    if (game.state !== STATES.PLI_TERMINE) return;

    const timer = setTimeout(() => {
      setDisplayPli([]);
      setHideLastPli(false);
      setGame((g) => dispatch(g, { type: "NEXT_PLI" }));
    }, 800);

    return () => clearTimeout(timer);
  }, [game.state]);

  // ============================================
  // ACTIONS
  // ============================================
  function handleTakeAtout() {
    setGame((g) => dispatch(g, { type: "TAKE_ATOUT" }));
  }

  function handlePass() {
    setGame((g) => dispatch(g, { type: "PASS" }));
  }

  function handlePassAnnouncement() {
    setGame((g) => dispatch(g, { type: "PASS_ANNOUNCEMENT" }));
  }

  function handleDeclareAnnouncement(announcement) {
    if (!announcement) return;

    setGame((g) =>
      dispatch(g, {
        type: "DECLARE_ANNOUNCEMENT",
        announcementType: announcement.type,
        highRank: announcement.highRank,
        suit: announcement.suit || null,
      })
    );
  }

  function handleContre() {
    setGame((g) => dispatch(g, { type: "CONTRE" }));
  }

  function handleSurContre() {
    setGame((g) => dispatch(g, { type: "SURCONTRE" }));
  }

  function handlePlayCard(card) {
    const cardKey = `${card.suit}:${String(card.value).toUpperCase()}`;
    setGame((g) => dispatch(g, { type: "PLAY_CARD", cardKey }));
  }

  const activePlayer = game.players[game.currentPlayerIndex];
  const isMyTurn = activePlayer === "joueur1";
  const currentAnnouncements =
    game.modernAnnouncements?.detectedByPlayer?.[activePlayer] || [];
  const dealerId = game.players[game.dealerIndex];

  const scoreUI = scorePartie;
  const shouldShowPli = !(game.state === STATES.FIN_DE_MANCHE && hideLastPli);

  const actorId = game.players[game.currentPlayerIndex];
  const preneurId = game.currentBid ? game.players[game.currentBid.playerIndex] : null;

  const actorTeam = game.teams.nous.includes(actorId) ? "nous" : "eux";
  const preneurTeam = preneurId && game.teams.nous.includes(preneurId) ? "nous" : "eux";

const mult = game.contratMultiplicateur || 1;

const bestValidatedAnnouncement =
  mode === "moderne"
    ? (game.modernAnnouncements?.validated || [])[0] || null
    : null;

const showModernAnnouncementPanel =
  mode === "moderne" &&
  game.state === STATES.ANNONCES_MODERNE &&
  activePlayer === "joueur1" &&
  currentAnnouncements.length > 0;
useEffect(() => {
  if (mode !== "moderne") {
    setVisibleAnnouncement(null);
    setAnnouncementFading(false);
    return;
  }

  if (!bestValidatedAnnouncement) return;

  setVisibleAnnouncement(bestValidatedAnnouncement);
  setAnnouncementFading(false);

  const fadeTimer = setTimeout(() => {
    setAnnouncementFading(true);
  }, 1700);

  const hideTimer = setTimeout(() => {
    setVisibleAnnouncement(null);
    setAnnouncementFading(false);
  }, 2000);

  return () => {
    clearTimeout(fadeTimer);
    clearTimeout(hideTimer);
  };
}, [mode, bestValidatedAnnouncement]);
useEffect(() => {
  if (mode !== "moderne") return;
  if (game.state !== STATES.ANNONCES_MODERNE) return;

  const timer = setTimeout(() => {
    setGame((g) => {
      if (g.state !== STATES.ANNONCES_MODERNE) return g;

      const active = g.players[g.currentPlayerIndex];
      const declaredByPlayer = g.modernAnnouncements?.declaredByPlayer || {};
      const alreadyAnswered = Object.prototype.hasOwnProperty.call(
        declaredByPlayer,
        active
      );

      if (alreadyAnswered) return g;

      const detected =
        g.modernAnnouncements?.detectedByPlayer?.[active] || [];

      if (active === "joueur1") {
        if (detected.length > 0) return g;
        return dispatch(g, { type: "PASS_ANNOUNCEMENT" });
      }

      if (!import.meta.env.DEV) return g;

      const best = detected[0] || null;

      if (best) {
        return dispatch(g, {
          type: "DECLARE_ANNOUNCEMENT",
          announcementType: best.type,
          highRank: best.highRank,
          suit: best.suit || null,
        });
      }

      return dispatch(g, { type: "PASS_ANNOUNCEMENT" });
    });
  }, 350);

  return () => clearTimeout(timer);
}, [mode, game.state, game.currentPlayerIndex, game.modernAnnouncements, game.atout]);

useEffect(() => {
  if (!import.meta.env.DEV) return;
  if (game.state !== STATES.PLI_EN_COURS) return;
  if (activePlayer === "joueur1") return;
  if (visibleAnnouncement) return;

  const timer = setTimeout(() => {
    setGame((g) => {
      if (g.state !== STATES.PLI_EN_COURS) return g;

      const active = g.players[g.currentPlayerIndex];
      if (active === "joueur1") return g;

      const hand = g.hands[active];
      if (!hand || hand.length === 0) return g;

      for (const card of hand) {
        const cardKey = `${card.suit}:${String(card.value).toUpperCase()}`;
        const next = dispatch(g, { type: "PLAY_CARD", cardKey });

        if (next !== g) return next;
      }

      return g;
    });
  }, 900);

  return () => clearTimeout(timer);
}, [
  game.state,
  activePlayer,
  game.players,
  game.currentPlayerIndex,
  visibleAnnouncement,
]);

  function playForActivePlayer() {
    if (game.state !== STATES.PLI_EN_COURS) return;

    const active = game.players[game.currentPlayerIndex];
    const hand = game.hands[active];
    if (!hand || hand.length === 0) return;

    for (const card of hand) {
      const cardKey = `${card.suit}:${String(card.value).toUpperCase()}`;
      const next = dispatch(game, { type: "PLAY_CARD", cardKey });

      if (next !== game) {
        setGame(next);
        return;
      }
    }

    console.warn("Aucune carte jouable pour", active);
  }

  function backToSalon() {
    const ws = wsTableRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && tableId) {
      ws.send(JSON.stringify({ type: "leave_table", tableId }));
    }
    navigate("/salon");
  }

  // ============================================
  // RENDER
  // ============================================
  return (
    <div
      className="table-page"
      data-mode={mode}
      data-state={game.state}
      style={{ position: "relative" }}
    >
      <button className="table-back-btn" onClick={backToSalon}>
        ← Retour au salon
      </button>

{import.meta.env.DEV && (
  <div
    style={{
      position: "absolute",
      top: 10,
      right: 10,
      zIndex: 9999,
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "4px 8px",
      borderRadius: 10,
      background: "rgba(0,0,0,0.18)",
      backdropFilter: "blur(4px)",
      color: "rgba(255,255,255,0.88)",
      fontWeight: 600,
      fontSize: 11,
      border: "1px solid rgba(255,255,255,0.10)",
      maxWidth: 420,
      boxShadow: "0 4px 10px rgba(0,0,0,0.18)",
    }}
  >
    <button
      type="button"
      onClick={playForActivePlayer}
      style={{
        padding: "3px 7px",
        borderRadius: 8,
        background: "rgba(255,255,255,0.08)",
        color: "rgba(255,255,255,0.9)",
        border: "1px solid rgba(255,255,255,0.12)",
        cursor: "pointer",
        fontWeight: 700,
        fontSize: 11,
      }}
      title="DEV: joue une carte pour le joueur actif si possible"
    >
      ▶ Auto-play
    </button>

    <span style={{ opacity: 0.9 }}>{mode}</span>
    <span style={{ opacity: 0.65 }}>|</span>
    <span>{game.state}</span>

    {scoreDebug ? (
      <span
        style={{
          marginLeft: 6,
          paddingLeft: 6,
          borderLeft: "1px solid rgba(255,255,255,0.14)",
          color: "#ffd36a",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontSize: 10.5,
          opacity: 0.9,
        }}
        title={scoreDebug}
      >
        {scoreDebug}
      </span>
    ) : null}
  </div>
)}

      <div className="table-layout">
        <div className="table-zone">
          <div className="table-board">
            <div className="table-image" />

            {beloteToast && (
              <div
                style={{
                  position: "absolute",
                  top: 90,
                  right: 120,
                  zIndex: 9999,
                  padding: "8px 14px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.12)",
                  backdropFilter: "blur(6px)",
                  border: "1px solid rgba(255,255,255,0.22)",
                  color: "#fff",
                  fontWeight: 800,
                }}
              >
                {beloteToast.text}
              </div>
            )}

            {mode === "contree" && game.state === STATES.ENCHERES && (
              <div className="atout-panel contree-encheres-panel">
                <div className="atout-title">Enchères (Contrée)</div>

                <div style={{ fontWeight: 800, marginBottom: 8 }}>
                  Enchère actuelle :{" "}
                  {game.currentBid
                    ? `${game.currentBid.value} ${atoutSymbol(game.currentBid.suit)}`
                    : "Aucune"}
                </div>

                {game.currentBid ? (
                  <div className="contree-panel-inline">
                    <div className="contree-title">Contrat</div>

                    <div className="contree-row">
                      <span>Multiplicateur :</span>
                      <span>x{game.contratMultiplicateur || 1}</span>
                    </div>

                    <div className="contree-actions">
                      <button
                        className="contree-btn"
                        onClick={handleContre}
                        disabled={!game.currentBid || mult !== 1 || actorTeam === preneurTeam}
                      >
                        Contrer
                      </button>

                      <button
                        className="contree-btn"
                        onClick={handleSurContre}
                        disabled={!game.currentBid || mult !== 2 || actorTeam !== preneurTeam}
                      >
                        Surcontrer
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="atout-actions" style={{ gap: 8, flexWrap: "wrap" }}>
                  {BID_VALUES.map((v) => {
                    const min = game.currentBid ? game.currentBid.value + 10 : 80;
                    const disabled = v < min;

                    return (
                      <button
                        key={v}
                        className="atout-btn take"
                        onClick={() => setBidValue(v)}
                        disabled={disabled}
                        style={{
                          opacity: disabled ? 0.45 : 1,
                          border:
                            bidValue === v ? "2px solid rgba(255,255,255,0.9)" : undefined,
                        }}
                      >
                        {v}
                      </button>
                    );
                  })}
                </div>

                <div className="atout-actions" style={{ marginTop: 10 }}>
                  {ALL_SUITS.map((suit) => (
                    <button
                      key={suit}
                      className="atout-btn take atout-suit-btn"
                      onClick={() =>
                        setGame((g) => dispatch(g, { type: "BID", value: bidValue, suit }))
                      }
                    >
                      <span className={`atout-suit-symbol ${suit}`}>{suitLabel(suit)}</span>
                    </button>
                  ))}
                </div>

                <div className="atout-actions" style={{ marginTop: 10 }}>
                  <button className="atout-btn pass" onClick={handlePass}>
                    Passer
                  </button>
                </div>
              </div>
            )}

{showModernAnnouncementPanel && (
  <div className="atout-panel atout-panel--glass">
    <div className="atout-title">Annonce</div>

    <div
      className="atout-actions"
      style={{ marginTop: 10, justifyContent: "center", gap: 12 }}
    >
      <button
        className="atout-btn take"
        onClick={() => handleDeclareAnnouncement(currentAnnouncements[0])}
      >
        Annonce
      </button>

      <button className="atout-btn pass" onClick={handlePassAnnouncement}>
        Passer
      </button>
    </div>
  </div>
)}

{mode === "moderne" && visibleAnnouncement && (
  <div
style={{
  position: "absolute",
  top: 165,
  left: "50%",
  transform: `translateX(-50%) translateY(${announcementFading ? "-6px" : "0px"})`,
  zIndex: 40,
  pointerEvents: "none",
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-end",
  opacity: announcementFading ? 0 : 1,
  transition: "opacity 0.28s ease, transform 0.28s ease",
}}
  >
    {(visibleAnnouncement.cards || []).map((card, index) => {
      const total = visibleAnnouncement.cards.length;
      const center = (total - 1) / 2;
      const offset = index - center;

      return (
        <img
          key={`${card.suit}-${String(card.value).toUpperCase()}-${index}`}
          src={cardImgSrc(card)}
          alt={`${card.value} ${card.suit}`}
          className="card-img"
          draggable={false}
          style={{
            width: 76,
            height: "auto",
            marginLeft: index === 0 ? 0 : -14,
            transform: `translateY(${Math.abs(offset) * 4}px) rotate(${offset * 5}deg)`,
            boxShadow: "0 6px 14px rgba(0,0,0,0.35)",
            borderRadius: 8,
          }}
        />
      );
    })}
  </div>
)}

{scoreUI && (
              <div className="score-overlay score-pill">
                <span className="score-side">Nous</span>
                <div className="score-pill-box">
                  {scoreUI.nous}
                  <span className="score-sep">–</span>
                  {scoreUI.eux}
                </div>
                <span className="score-side">Eux</span>
              </div>
            )}

            {partieTerminee && (
              <button className="new-game-btn" onClick={handleNouvellePartie}>
                Nouvelle partie
              </button>
            )}

            {shouldShowPli &&
              displayPli.map((play, index) =>
                play?.card ? (
                  <div key={index} className={`pli-card pli-${play.playerId}`}>
                    <img
                      src={cardImgSrc(play.card)}
                      alt={`${play.card.value} ${play.card.suit}`}
                      className="card-img"
                      draggable={false}
                    />
                  </div>
                ) : null
              )}

            {[
              ["joueur2", "top"],
              ["joueur4", "left"],
              ["joueur3", "right"],
              ["joueur1", "bottom"],
            ].map(([player, position]) => (
              <div
                key={player}
                className={`player-seat ${position} ${activePlayer === player ? "active" : ""}`}
              >
                {player === dealerId && <div className="dealer-badge">D</div>}

                <img src="/avatar.png" alt="Avatar" className="player-avatar" />

                {player !== "joueur1" && (
                  <div className={`back-cards back-cards-${position}`}>
                    {(() => {
                      const n = game.hands[player]?.length ?? 0;
                      const visible = Math.min(2, n);

                      return (
                        <div className="back-stack">
                          {Array.from({ length: visible }).map((_, i) => (
                            <img
                              key={i}
                              src="/card_back.png"
                              alt="Dos"
                              className="card-back"
                              style={{
                                transform: `translateX(${i * 10}px) rotate(${i * 2}deg)`,
                              }}
                              draggable={false}
                            />
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {activePlayer === player && <div className="active-dot" />}

                <div className="player-pseudo">{player}</div>

                {game.atout && game.players[game.preneur] === player && (
                  <div className={`atout-indicator ${position} ${game.atout}`}>
                    {atoutSymbol(game.atout)}
                  </div>
                )}
              </div>
            ))}

            {game.hands["joueur1"] && (
              <div className="player-bottom">
                {[...(game.hands["joueur1"] || [])]
                  .filter(Boolean)
                  .sort(compareCards)
                  .map((card, index) => {
                    const total = game.hands["joueur1"].length;
                    const center = (total - 1) / 2;
                    const offset = index - center;

                    return (
                      <div
                        key={`${card.suit}-${String(card.value).toUpperCase()}-${index}`}
                        className={`card ${isMyTurn ? "clickable" : "disabled"}`}
                        onClick={isMyTurn ? () => handlePlayCard(card) : undefined}
                        style={{
                          transform: `
                            translateX(${offset * -28}px)
                            translateY(${-8 + Math.abs(offset) * 2}px)
                            rotate(${offset * 4}deg)
                          `,
                          transformOrigin: "bottom center",
                          zIndex: 100 + index,
                        }}
                      >
                        <img
                          src={cardImgSrc(card)}
                          alt={`${card.value} ${card.suit}`}
                          className="card-img"
                          draggable={false}
                        />
                      </div>
                    );
                  })}
              </div>
            )}

            {(mode === "classic" || mode === "moderne") &&
              game.state === STATES.ANNOUNCE_ATOUT_TOUR_1 && (
                <div className="atout-panel atout-panel--glass">
                  <div className="atout-title">Choisir l’atout</div>
                  <div className="atout-actions">
                    <button className="atout-btn take" onClick={handleTakeAtout}>
                      Prendre
                    </button>

                    {mode === "moderne" && (
                      <>
                        <button
                          className="atout-btn take"
                          onClick={() =>
                            setGame((g) => dispatch(g, { type: "TAKE_ATOUT", suit: "SA" }))
                          }
                          title="Sans Atout"
                        >
                          SA
                        </button>
                        <button
                          className="atout-btn take"
                          onClick={() =>
                            setGame((g) => dispatch(g, { type: "TAKE_ATOUT", suit: "TA" }))
                          }
                          title="Tout Atout"
                        >
                          TA
                        </button>
                      </>
                    )}

                    <button className="atout-btn pass" onClick={handlePass}>
                      Passer
                    </button>
                  </div>
                </div>
              )}

            {(mode === "classic" || mode === "moderne") &&
              (game.state === STATES.ANNOUNCE_ATOUT_TOUR_1 ||
                game.state === STATES.ANNOUNCE_ATOUT_TOUR_2) &&
              game.atoutPropose && (
                <div className="atout-card">
                  <div className="label">Atout</div>
                  <img
                    src={cardImgSrc(game.atoutPropose)}
                    alt={`${game.atoutPropose.value} ${game.atoutPropose.suit}`}
                    className="card-img"
                    draggable={false}
                  />
                </div>
              )}

            {(mode === "classic" || mode === "moderne") &&
              game.state === STATES.ANNOUNCE_ATOUT_TOUR_2 &&
              game.atoutPropose && (
                <div className="atout-panel atout-panel--glass atout-panel--tour2-wide">
                  <div className="atout-title">Choisir l’atout</div>

                  <div className="atout-actions atout-actions--tour2">
                    {ALL_SUITS.filter((suit) => suit !== game.atoutPropose.suit).map((suit) => (
                      <button
                        key={suit}
                        className="atout-btn take atout-suit-btn"
                        onClick={() => setGame((g) => dispatch(g, { type: "TAKE_ATOUT", suit }))}
                      >
                        <span className={`atout-suit-symbol ${suit}`}>{suitLabel(suit)}</span>
                      </button>
                    ))}

                    {mode === "moderne" && (
                      <>
                        <button
                          className="atout-btn take"
                          onClick={() =>
                            setGame((g) => dispatch(g, { type: "TAKE_ATOUT", suit: "SA" }))
                          }
                          title="Sans Atout"
                        >
                          SA
                        </button>
                        <button
                          className="atout-btn take"
                          onClick={() =>
                            setGame((g) => dispatch(g, { type: "TAKE_ATOUT", suit: "TA" }))
                          }
                          title="Tout Atout"
                        >
                          TA
                        </button>
                      </>
                    )}

                    <button className="atout-btn pass atout-pass-inline" onClick={handlePass}>
                      Passer
                    </button>
                  </div>
                </div>
              )}
          </div>
        </div>

        <div className="table-chat-zone">
          <TableChat tableName="Belote entre amis" />
        </div>
      </div>
    </div>
  );
}