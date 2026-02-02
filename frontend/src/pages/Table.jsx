import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import TableChat from "../components/TableChat";
import "../styles/Table.css";

import { createInitialGameState, dispatch, STATES } from "../game/beloteEngine";

// ============================================
// HELPERS ATTOUT — UI TABLE UNIQUEMENT
// ============================================

const ALL_SUITS = ["hearts", "diamonds", "clubs", "spades"];

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

export default function Table() {
  const navigate = useNavigate();

  // ============================================
  // GAME STATE
  // ============================================
  const [game, setGame] = useState(() => {
    let g = createInitialGameState();

    g = {
      ...g,
      players: ["joueur1", "joueur4", "joueur2", "joueur3"]
    };

    g = dispatch(g, { type: "TABLE_READY" });
    g = dispatch(g, { type: "DISTRIBUTE_CARDS" });
    g = dispatch(g, { type: "DISTRIBUTE_CARDS" });

    return g;
  });

  // ============================================
  // UI STATES (⚠️ TOUJOURS AVANT useEffect)
  // ============================================
  const [displayPli, setDisplayPli] = useState([]);
  const [hideLastPli, setHideLastPli] = useState(false);


  // ============================================
  // AFFICHAGE DU PLI (logique UI uniquement)
  // ============================================
  useEffect(() => {
    if (game.pli.length > 0) {
      const showTimer = setTimeout(() => {
        setHideLastPli(false);      // reset UI
        setDisplayPli(game.pli);   // afficher le pli
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
  // FIN DE MANCHE — MASQUAGE DU DERNIER PLI (DELAI)
  // ============================================
  useEffect(() => {
    if (game.state !== STATES.FIN_DE_MANCHE) return;

    const timer = setTimeout(() => {
      setHideLastPli(true);
    }, 800);

    return () => clearTimeout(timer);
  }, [game.state]);


  // ============================================
  // BOT AUTO
  // ============================================
  useEffect(() => {
    if (game.state !== STATES.PLI_EN_COURS) return;

    const activePlayer = game.players[game.currentPlayerIndex];

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
  // FIN DE PLI (passage au pli suivant)
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

  const activePlayer = game.players[game.currentPlayerIndex];
  const isMyTurn = activePlayer === "joueur1";

  // ============================================
  // SCORE UI
  // ============================================
  const scoreUI = game.scoreManche || game.score || null;
  const shouldShowPli = !(game.state === STATES.FIN_DE_MANCHE && hideLastPli);

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



            {/* PLI */}
            {shouldShowPli &&
              displayPli.map((play, index) => {
                if (!play || !play.card) return null;
                return (
                  <div key={index} className={`pli-card pli-${play.playerId}`}>
                    {play.card.value} {play.card.suit}
                  </div>
                );
              })}

            {/* AVATARS */}
            {[
              ["joueur2", "top"],
              ["joueur4", "left"],
              ["joueur3", "right"],
              ["joueur1", "bottom"]
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

            {/* MAIN JOUEUR */}
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
                        zIndex: 100 + index
                      }}
                    >
                      {card.value} {card.suit}
                    </div>
                  );
                })}
              </div>
            )}

            {/* PANNEAU ATTOUT — TOUR 1 */}
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
{/* CARTE D’ATOUT RETOURNÉE — visible pendant les annonces */}
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

            {/* PANNEAU ATTOUT — TOUR 2 */}
            {game.state === STATES.ANNOUNCE_ATOUT_TOUR_2 && game.atoutPropose && (
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


































































































