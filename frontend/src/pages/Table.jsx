import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import TableChat from "../components/TableChat";
import "../styles/Table.css";

import { createInitialGameState, dispatch, STATES } from "../game/beloteEngine";
import Partie from "../game/Partie";



// ============================================
// HELPERS ATTOUT — UI TABLE UNIQUEMENT
// ============================================

const ALL_SUITS = ["hearts", "diamonds", "clubs", "spades"];
const BID_VALUES = [80, 90, 100, 110, 120, 130, 140, 150, 160];
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
    default:
      return "";
  }
}

function cardImgSrc(card) {
  if (!card) return "";
  const suit = String(card.suit); // hearts/diamonds/clubs/spades
  const value = String(card.value).toUpperCase(); // 7..10,J,Q,K,A
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
const [bidValue, setBidValue] = useState(80);
  // ============================================
  // PARTIE (présente mais non pilotante)
  // ============================================
  const partieRef = useRef(null);

  // 🔒 CADENAS : empêche de compter deux fois une fin de manche
  const finDeMancheCompteeRef = useRef(false);
  const finDeMancheRef = useRef(null);

  useEffect(() => {
    if (partieRef.current === null) {
      partieRef.current = new Partie({
        players: ["joueur1", "joueur4", "joueur2", "joueur3"],
        startingPlayerIndex: 0,
      });
    }
  }, []);

  // ============================================
  // GAME STATE
  // ============================================
  const [game, setGame] = useState(() => {
    let g = createInitialGameState();

   g = {
  ...g,
  ruleset: mode,               // ✅ classic | contree | coinche
  contratMultiplicateur: 1,    // ✅ reset
  contratValeur: null,         // ✅ (ajoute ce champ dans createInitialGameState)
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

  // ✅ SCORE DE PARTIE (501)
  const [scorePartie, setScorePartie] = useState({ nous: 0, eux: 0 });

  // ✅ FIN DE PARTIE
  const [partieTerminee, setPartieTerminee] = useState(false);

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

   const next = partieRef.current.onFinDeManche({
  dealerIndex: game.dealerIndex,
  finDeManche: game.finDeManche,
  contratMultiplicateur: game.contratMultiplicateur || 1,
});


    finDeMancheRef.current = next;

    if (next?.scorePartie) {
      setScorePartie(next.scorePartie);
    }

    if (next?.partieTerminee) {
      setPartieTerminee(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.state]);

  function handleNouvellePartie() {
    // ✅ reset affichage du pli (empêche le flash des 4 cartes)
    setDisplayPli([]);
    setHideLastPli(false);

    // ✅ IMPORTANT : réarmer les verrous de fin de manche
    finDeMancheCompteeRef.current = false;
    finDeMancheRef.current = null;

    // reset arbitre
    partieRef.current = new Partie({
      players: game.players,
      startingPlayerIndex: 0,
    });

    // reset UI
    setScorePartie({ nous: 0, eux: 0 });
    setPartieTerminee(false);

    // reset moteur
    let g = createInitialGameState();

   g = {
  ...g,
  ruleset: mode,               // ✅ garder le même mode
  contratMultiplicateur: 1,    // ✅ reset
  contratValeur: null,         // ✅ reset
  players: game.players,
};


    g = dispatch(g, { type: "TABLE_READY" });
    g = dispatch(g, { type: "DISTRIBUTE_CARDS" });
    g = dispatch(g, { type: "DISTRIBUTE_CARDS" });

    setGame(g);
  }

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

      // 🔑 RÉARMEMENT DU VERROU POUR LA PROCHAINE MANCHE
      finDeMancheCompteeRef.current = false;
      finDeMancheRef.current = null; // optionnel mais propre

      let g = createInitialGameState();

     g = {
  ...g,
  ruleset: mode,               // ✅ garde contree / classic selon la table
  contratMultiplicateur: 1,    // ✅ reset
  contratValeur: null,         // ✅ reset
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

  const scoreUI = scorePartie;

  const shouldShowPli = !(game.state === STATES.FIN_DE_MANCHE && hideLastPli);
const actorId = game.players[game.currentPlayerIndex];
const preneurId = game.currentBid ? game.players[game.currentBid.playerIndex] : null;

const actorTeam = game.teams.nous.includes(actorId) ? "nous" : "eux";
const preneurTeam =
  preneurId && game.teams.nous.includes(preneurId) ? "nous" : "eux";

const mult = game.contratMultiplicateur || 1;
  // ============================================
  // BOUTON TEST — jouer pour le joueur actif
  // ============================================
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
console.log("MODE =", import.meta.env.MODE, "DEV =", import.meta.env.DEV);
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

{/* BOUTON TEST ULTRA SIMPLE */}
{import.meta.env.DEV ? (
  <button
    onClick={playForActivePlayer}
    style={{
      position: "absolute",
      top: 10,
      left: 10,
      padding: "10px 16px",
      background: "red",
      color: "white",
      fontSize: "16px",
      zIndex: 9999,
    }}
  >
    TEST JOUER
  </button>
) : null}



      <button className="table-back-btn" onClick={() => navigate("/salon")}>
        ← Retour au salon
      </button>
{import.meta.env.DEV && (
  <div style={{ position: "absolute", top: 60, left: 20, zIndex: 9999, color: "#fff", fontWeight: 800 }}>
    Mode: {mode}
  </div>
)}
{import.meta.env.DEV && (
  <div
    style={{
      position: "absolute",
      top: 10,
      left: 120, // pour ne pas gêner le bouton TEST
      zIndex: 9999,
      padding: "4px 8px",
      borderRadius: 8,
      background: "rgba(0,0,0,0.45)",
      color: "#fff",
      fontWeight: 800,
      fontSize: 12,
    }}
  >
    {mode} | {game.state}
  </div>
)}

      <div className="table-layout">
        <div className="table-zone">
          <div className="table-board">
            <div className="table-image" />
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

    {/* PALIERS 80..160 */}
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

    {/* COULEURS */}
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

    {/* PASS */}
    <div className="atout-actions" style={{ marginTop: 10 }}>
      <button className="atout-btn pass" onClick={handlePass}>
        Passer
      </button>
    </div>
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
                className={`player-seat ${position} ${
                  activePlayer === player ? "active" : ""
                }`}
              >
                <img src="/avatar.png" alt="Avatar" className="player-avatar" />

                {/* 🂠 Cartes cachées (dos) pour les autres joueurs */}
                {player !== "joueur1" && (
                  <div className={`back-cards back-cards-${position}`}>
                    {(() => {
                      const n = game.hands[player]?.length ?? 0;
                      const visible = Math.min(2, n);


                      return (
                        <>
                          <div className="back-stack">
                            {Array.from({ length: visible }).map((_, i) => (
                              <img
                                key={i}
                                src="/card_back.png"
                                alt="Dos"
                                className="card-back"
                                style={{
                                  transform: `translateX(${i * 10}px) rotate(${
                                    i * 2
                                  }deg)`,
                                }}
                                draggable={false}
                              />
                            ))}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {activePlayer === player && <div className="active-dot" />}

                <div className="player-pseudo">{player}</div>

                {/* 👇 ATOUT — ICI ET PAS AILLEURS */}
                {game.atout && game.players[game.preneur] === player && (
                  <div className={`atout-indicator ${position} ${game.atout}`}>
                    {atoutSymbol(game.atout)}
                  </div>
                )}
              </div>
            ))}

         {game.hands["joueur1"] && (
  <div className="player-bottom">
    {[...game.hands["joueur1"]].sort(compareCards).map((card, index) => {
      const total = game.hands["joueur1"].length;
      const center = (total - 1) / 2;
      const offset = index - center;

      return (
        <div
          key={`${card.suit}-${card.value}`}
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

         {mode === "classic" && game.state === STATES.ANNOUNCE_ATOUT_TOUR_1 && (
  <div className="atout-panel">
    <div className="atout-title">Choisir l’atout</div>
    <div className="atout-actions">
      <button className="atout-btn take" onClick={handleTakeAtout}>
        Prendre
      </button>
      <button className="atout-btn pass" onClick={handlePass}>
        Passer
      </button>
    </div>
  </div>
)}
{/* ✅ CARTE RETOURNÉE (ATOUT PROPOSÉ) */}
{mode === "classic" &&
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
{/* CLASSIC — Tour 2 : choisir l’atout */}
{mode === "classic" &&
  game.state === STATES.ANNOUNCE_ATOUT_TOUR_2 &&
  game.atoutPropose && (
    <div className="atout-panel atout-panel--glass atout-panel--tour2-wide">
      <div className="atout-title">Choisir l’atout</div>

      <div className="atout-actions atout-actions--tour2">
        {ALL_SUITS.filter((suit) => suit !== game.atoutPropose.suit).map(
          (suit) => (
            <button
              key={suit}
              className="atout-btn take atout-suit-btn"
              onClick={() =>
                setGame((g) => dispatch(g, { type: "TAKE_ATOUT", suit }))
              }
            >
              <span className={`atout-suit-symbol ${suit}`}>
                {suitLabel(suit)}
              </span>
            </button>
          )
        )}

        <button
          className="atout-btn pass atout-pass-inline"
          onClick={handlePass}
        >
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
  






































































































