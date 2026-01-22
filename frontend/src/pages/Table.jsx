import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import TableChat from "../components/TableChat";
import "../styles/Table.css";

import { createInitialGameState, dispatch, STATES } from "../game/beloteEngine";

// ⚠️ MODE TEST TEMPORAIRE (à supprimer plus tard)
const IS_TEST_MODE = true;

export default function Table() {
  const navigate = useNavigate();

  const [game, setGame] = useState(() => {
    let g = createInitialGameState();

   g = {
  ...g,
  players: [
    "joueur1", // Sud  (Équipe A)
    "joueur3", // Est  (Équipe B)
    "joueur2", // Nord (Équipe A)
    "joueur4"  // Ouest (Équipe B)
  ]
};


    // ⚠️ ORDRE OBLIGATOIRE
    g = dispatch(g, { type: "TABLE_READY" });
    g = dispatch(g, { type: "DISTRIBUTE_CARDS" });
    g = dispatch(g, { type: "DISTRIBUTE_CARDS" });

    return g;
  });

  useEffect(() => {
    function handleGlobalClick(e) {
      console.log("CLIC GLOBAL →", e.target);
    }
    document.addEventListener("click", handleGlobalClick);
    return () => document.removeEventListener("click", handleGlobalClick);
  }, []);

  // ======================================================
  // AUTO-PLAY DE TEST (JOUEURS NON HUMAINS)
  // ======================================================
  useEffect(() => {
    if (!IS_TEST_MODE) return;
    if (game.state !== STATES.PLI_EN_COURS) return;

    const activePlayer = game.players[game.currentPlayerIndex];
    if (activePlayer === "joueur1") return;

    const hand = game.hands[activePlayer];
    if (!hand || hand.length === 0) return;

    const timeout = setTimeout(() => {
      const card = hand[0];
      const cardKey = `${card.suit}:${card.value}`;

      setGame(g =>
        dispatch(g, {
          type: "PLAY_CARD",
          cardKey
        })
      );
    }, 400);

    return () => clearTimeout(timeout);
  }, [game]);

  // ======================================================
  // DERNIER PLI — LECTURE UI (DÉRIVÉ, SANS setState)
  // ======================================================
  const lastPliUI = useMemo(() => {
    if (game.state !== STATES.PLI_EN_LECTURE) return null;
    if (!game.pli || game.pli.length !== 4) return null;

    return game.pli.map(p => ({
      suit: p.card.suit,
      value: p.card.value
    }));
  }, [game.state, game.pli]);

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

  return (
    <div className="table-page">
      <button className="table-back-btn" onClick={() => navigate("/salon")}>
        ← Retour au salon
      </button>

      <div className="table-layout">
        <div className="table-zone">
          <div className="table-board">
            <div className="table-image" />

            {/* PLI EN COURS (CENTRE) */}
{game.pli?.length > 0 && game.pli.length < 4 && (
  <div className="pli-zone">
    {game.pli.map((play, index) => (
      <div
        key={index}
        className={`pli-card from-${play.playerId}`}
      >
        {play.card.value} {play.card.suit}
      </div>
    ))}
  </div>
)}



            {/* DERNIER PLI (HAUT DROIT — LECTURE) */}
            {lastPliUI && (
              <div className="last-pli-zone">
                {lastPliUI.map((card, index) => (
                  <div key={index} className="last-pli-card">
                    {card.value} {card.suit}
                  </div>
                ))}
              </div>
            )}

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
                <img
                  src="/avatar.png"
                  alt="Avatar"
                  className="player-avatar"
                />
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
                      onClick={
                        isMyTurn ? () => handlePlayCard(card) : undefined
                      }
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

            {/* CARTE D’ATOUT */}
            {game.atoutPropose &&
              game.state === STATES.ANNOUNCE_ATOUT_TOUR_1 && (
                <div className="atout-card">
                  <div className="label">Atout</div>
                  <div className="symbol">
                    {game.atoutPropose.value} {game.atoutPropose.suit}
                  </div>
                </div>
              )}

            {/* PANNEAU ATTOUT */}
            {(game.state === STATES.ANNOUNCE_ATOUT_TOUR_1 ||
              game.state === STATES.ANNOUNCE_ATOUT_TOUR_2) && (
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
          </div>
        </div>

        <div className="table-chat-zone">
          <TableChat tableName="Belote entre amis" />
        </div>
      </div>
    </div>
  );
}































































































