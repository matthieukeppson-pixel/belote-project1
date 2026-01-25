import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import TableChat from "../components/TableChat";
import "../styles/Table.css";

import { createInitialGameState, dispatch, STATES } from "../game/beloteEngine";

// ⚠️ MODE TEST — BOTS ACTIFS
const IS_TEST_MODE = true;

// 🔒 Mapping UI joueur → slot (indépendant du moteur)
const SLOT_BY_PLAYER = {
  joueur2: "top",
  joueur3: "right",
  joueur1: "bottom",
  joueur4: "left",
};

// 🔒 Lecture passive du pli
function getPlayedCardForPlayer(game, playerId) {
  return game.pli.find(p => p.playerId === playerId)?.card || null;
}

export default function Table() {
  const navigate = useNavigate();

  // ============================================
  // STATE JEU
  // ============================================
  const [game, setGame] = useState(() => {
    let g = createInitialGameState();

    g = {
      ...g,
      players: ["joueur1", "joueur2", "joueur3", "joueur4"]
    };

    // ⚠️ ORDRE OBLIGATOIRE
    g = dispatch(g, { type: "TABLE_READY" });
    g = dispatch(g, { type: "DISTRIBUTE_CARDS" });
    g = dispatch(g, { type: "DISTRIBUTE_CARDS" });

    return g;
  });

  // ============================================
  // AUTO-PLAY (BOTS)
  // ============================================
  useEffect(() => {
    if (!IS_TEST_MODE) return;
    if (game.state !== STATES.PLI_EN_COURS) return;

    const activePlayer = game.players[game.currentPlayerIndex];
    if (activePlayer === "joueur1") return;

    const hand = game.hands[activePlayer];
    if (!hand || hand.length === 0) return;

    const timeout = setTimeout(() => {
      const card = hand[0];
      const cardKey = `${card.suit}:${String(card.value).toUpperCase()}`;
      setGame(g => dispatch(g, { type: "PLAY_CARD", cardKey }));
    }, 400);

    return () => clearTimeout(timeout);
  }, [game]);

  // ============================================
  // HANDLERS
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

            {/* CARTE ATOUT — TOUR 1 */}
            {game.state === STATES.ANNOUNCE_ATOUT_TOUR_1 && game.atoutPropose && (
              <div className="atout-preview">
                <div className="atout-card">
                  <div className="label">Atout proposé</div>
                  <div className="symbol">
                    {game.atoutPropose.value} {game.atoutPropose.suit}
                  </div>
                </div>
              </div>
            )}

            {/* PLI — CROIX (affichage déterministe) */}
            <div className="pli-cross">
              {Object.entries(SLOT_BY_PLAYER).map(([playerId, slot]) => {
                const card = getPlayedCardForPlayer(game, playerId);

                return (
                  <div key={slot} className={`pli-slot ${slot}`}>
                    {card && (
                      <div className="pli-card">
                        {card.value} {card.suit}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

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

            {/* MAIN JOUEUR — ÉVENTAIL CHEVAUCHÉ */}
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

            {/* PANNEAU ATOUT */}
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




























































































