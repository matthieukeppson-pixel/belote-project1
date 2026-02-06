import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import TableChat from "../components/TableChat";
import "../styles/Table.css";

import { createInitialGameState, dispatch, STATES } from "../game/beloteEngine";
import Partie from "../game/Partie";

// ============================================
// HELPERS ATTOUT — UI TABLE UNIQUEMENT
// ============================================

const ALL_SUITS = ["hearts", "diamonds", "clubs", "spades"];

function suitLabel(suit) {
  switch (suit) {
    case "hearts": return "♥";
    case "diamonds": return "♦";
    case "clubs": return "♣";
    case "spades": return "♠";
    default: return "";
  }
}

export default function Table() {
  const navigate = useNavigate();

  // ============================================
  // PARTIE (présente mais non pilotante)
  // ============================================
  const partieRef = useRef(null);
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
// FIN DE MANCHE — CALCUL PARTIE (UNE SEULE FOIS)
// ============================================
useEffect(() => {
  if (game.state !== STATES.FIN_DE_MANCHE) return;
  if (!partieRef.current) return;

  const next = partieRef.current.onFinDeManche({
    players: game.players,
    dealerIndex: game.dealerIndex,
    winnerIndex: game.winnerIndex,
    preneur: game.preneur,
    scoreManche: game.scoreManche,
    finDeManche: game.finDeManche,
  });

  finDeMancheRef.current = next;

  if (next?.scorePartie) {
    setScorePartie(next.scorePartie);
  }
// ⬇️⬇️⬇️ AJOUTE CETTE LIGNE ⬇️⬇️⬇️
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

    let g = createInitialGameState();

    g = {
      ...g,
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
// ⬇️⬇️⬇️ AJOUTE CETTE LIGNE ⬇️⬇️⬇️
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [game.state]);







  // ============================================
  // BOT AUTO
  // ============================================
  useEffect(() => {
    if (game.state !== STATES.PLI_EN_COURS) return;

    const activePlayer =
      game.players[game.currentPlayerIndex];

    if (activePlayer !== "joueur1") {
      const hand = game.hands[activePlayer];
      if (!hand || hand.length === 0) return;

      const card = hand[0];
      const cardKey = `${card.suit}:${String(card.value).toUpperCase()}`;

      const timer = setTimeout(() => {
        setGame(g => dispatch(g, { type: "PLAY_CARD", cardKey }));
      }, 600);

      return () => clearTimeout(timer);
    }
  }, [game]);

  // ============================================
  // FIN DE PLI
  // ============================================
  useEffect(() => {
    if (game.state !== STATES.PLI_TERMINE) return;

    const timer = setTimeout(() => {
      setGame(g => dispatch(g, { type: "NEXT_PLI" }));
    }, 800);

    return () => clearTimeout(timer);
  }, [game.state]);

  // ============================================
  // ACTIONS
  // ============================================
  function handleTakeAtout() {
    setGame(g => dispatch(g, { type: "TAKE_ATOUT" }));
  }

  function handlePass() {
    setGame(g => dispatch(g, { type: "PASS" }));
  }

  function handlePlayCard(card) {
    const cardKey = `${card.suit}:${String(card.value).toUpperCase()}`;
    setGame(g => dispatch(g, { type: "PLAY_CARD", cardKey }));
  }

  const activePlayer =
    game.players[game.currentPlayerIndex];
  const isMyTurn = activePlayer === "joueur1";

 const scoreUI = scorePartie;

  const shouldShowPli =
    !(game.state === STATES.FIN_DE_MANCHE && hideLastPli);

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className="table-page">
      <button className="table-back-btn" onClick={() => navigate("/salon")}>
        ← Retour au salon
      </button>

      <div className="table-layout">
        <div className="table-zone">
          <div className="table-board">
            <div className="table-image" />

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

            {shouldShowPli &&
              displayPli.map((play, index) =>
                play?.card ? (
                  <div key={index} className={`pli-card pli-${play.playerId}`}>
                    {play.card.value} {play.card.suit}
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
                {activePlayer === player && <div className="active-dot" />}
                <div className="player-pseudo">{player}</div>
              </div>
            ))}

            {game.hands["joueur1"] && (
              <div className="player-bottom">
                {game.hands["joueur1"].map((card, index) => {
                  const total = game.hands["joueur1"].length;
                  const center = (total - 1) / 2;
                  const offset = index - center;

                  return (
                    <div
                      key={`${card.suit}-${card.value}`}
                      className={`card ${!isMyTurn ? "disabled" : ""}`}
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
                      {card.value} {card.suit}
                    </div>
                  );
                })}
              </div>
            )}

            {game.state === STATES.ANNOUNCE_ATOUT_TOUR_1 && (
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

            {(game.state === STATES.ANNOUNCE_ATOUT_TOUR_1 ||
              game.state === STATES.ANNOUNCE_ATOUT_TOUR_2) &&
              game.atoutPropose && (
                <div className="atout-card">
                  <div className="label">Atout</div>
                  <div className="symbol">
                    {game.atoutPropose.value} {game.atoutPropose.suit}
                  </div>
                </div>
              )}

            {game.state === STATES.ANNOUNCE_ATOUT_TOUR_2 &&
              game.atoutPropose && (
                <div className="atout-panel">
                  <div className="atout-title">Choisir l’atout</div>
                  <div className="atout-actions">
                    {ALL_SUITS.filter(
                      suit => suit !== game.atoutPropose.suit
                    ).map(suit => (
                      <button
                        key={suit}
                        className="atout-btn take atout-suit-btn"
                        onClick={() =>
                          setGame(g =>
                            dispatch(g, { type: "TAKE_ATOUT", suit })
                          )
                        }
                      >
                        <span className={`atout-suit-symbol ${suit}`}>
                          {suitLabel(suit)}
                        </span>
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
          </div>
        </div>

        <div className="table-chat-zone">
          <TableChat tableName="Belote entre amis" />
        </div>
      </div>
    </div>
  );
}



































































































