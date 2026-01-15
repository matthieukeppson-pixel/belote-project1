import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import TableChat from "../components/TableChat";
import "../styles/Table.css";

import {
  createInitialGameState,
  dispatch,
  STATES
} from "../game/beloteEngine";

export default function Table() {
  const navigate = useNavigate();

  const [game, setGame] = useState(() => {
    let g = createInitialGameState();

    g = {
      ...g,
      players: ["joueur1", "joueur2", "joueur3", "joueur4"]
    };

    // ⚠️ ORDRE OBLIGATOIRE
    g = dispatch(g, { type: "TABLE_READY" });
    g = dispatch(g, { type: "DISTRIBUTE_CARDS" }); // 3 cartes
    g = dispatch(g, { type: "DISTRIBUTE_CARDS" }); // 2 cartes + carte retournée

    return g;
  });

  // =====================================================
  // 🔍 TRACEUR GLOBAL DE CLIC — DIAGNOSTIC
  // =====================================================
  useEffect(() => {
    function handleGlobalClick(e) {
      console.log("CLIC GLOBAL →", e.target);
    }

    document.addEventListener("click", handleGlobalClick);
    return () => {
      document.removeEventListener("click", handleGlobalClick);
    };
  }, []);

  useEffect(() => {
    console.log(
      "🔄 RENDER TABLE — STATE:",
      game.state,
      "MAIN joueur1 =",
      game.hands["joueur1"]?.map(c => `${c.suit}-${c.value}`)
    );
  }, [game]);

  // ===============================
  // ACTIONS UI (NETTOYÉES)
  // ===============================

  function handleTakeAtout() {
    setGame(g => dispatch(g, { type: "TAKE_ATOUT" }));
  }

  function handlePass() {
    setGame(g => dispatch(g, { type: "PASS" }));
  }

  function handlePlayCard(card) {
    const cardKey = `${card.suit}:${String(card.value).toUpperCase()}`;

    console.log(
      "REACT CLICK -> PLAY_CARD",
      { cardKey },
      "STATE:",
      game.state
    );

    setGame(g =>
      dispatch(g, {
        type: "PLAY_CARD",
        cardKey
      })
    );
  }

  const isMyTurn =
    game.players[game.currentPlayerIndex] === "joueur1";

  return (
    <div className="table-page">
      <button
        className="table-back-btn"
        onClick={() => navigate("/salon")}
      >
        ← Retour au salon
      </button>

      <div className="table-layout">
        <div className="table-zone">
          <div className="table-board">
            <div className="table-image" />

            {/* CARTE D’ATOUT PROPOSÉE */}
            {game.atoutPropose && (
              <div className="atout-card">
                <div className="label">Atout proposé</div>
                <div className="symbol">
                  {game.atoutPropose.value} {game.atoutPropose.suit}
                </div>
              </div>
            )}

            {/* AVATARS */}
            <div className="player-seat top">
              <img src="/avatar.png" alt="Avatar" className="player-avatar" />
              <div className="player-pseudo">joueur2</div>
            </div>

            <div className="player-seat left">
              <img src="/avatar.png" alt="Avatar" className="player-avatar" />
              <div className="player-pseudo">joueur4</div>
            </div>

            <div className="player-seat right">
              <img src="/avatar.png" alt="Avatar" className="player-avatar" />
              <div className="player-pseudo">joueur3</div>
            </div>

            <div className="player-seat bottom">
              <img src="/avatar.png" alt="Avatar" className="player-avatar" />
              <div className="player-pseudo">joueur1</div>
            </div>

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
                        transform: `translateY(${-18 + Math.abs(offset) * 4}px)
                          rotate(${offset * 4}deg)`
                      }}
                    >
                      {card.value} {card.suit}
                    </div>
                  );
                })}
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























































































