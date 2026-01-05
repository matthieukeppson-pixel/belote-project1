import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import TableChat from "../components/TableChat";
import CardBackRow from "../components/CardBackRow";
import "../styles/Table.css";

import { createInitialGameState, dispatch } from "../game/beloteEngine";

export default function Table() {
  const navigate = useNavigate();

  const [game] = useState(() => {
    let g = createInitialGameState();

    g = {
      ...g,
      players: ["joueur1", "joueur2", "joueur3", "joueur4"]
    };

    g = dispatch(g, { type: "TABLE_READY" });
    g = dispatch(g, { type: "DISTRIBUTE_CARDS" });
    g = dispatch(g, { type: "DISTRIBUTE_CARDS" });
    g = dispatch(g, { type: "DISTRIBUTE_CARDS" });

    // =====================
    // TEST VISUEL ATOUT
    // =====================
    g.atout = "hearts";

    return g;
  });

  return (
    <div className="table-page">
      {/* ===================== */}
      {/* RETOUR SALON */}
      {/* ===================== */}
      <button
        className="table-back-btn"
        onClick={() => navigate("/salon")}
      >
        ← Retour au salon
      </button>

      <div className="table-layout">
        <div className="table-zone">
          <div className="table-board">
            {/* Fond de table */}
            <div className="table-image" />

            {/* ===================== */}
            {/* UI ANNONCE D’ATOUT */}
            {/* ===================== */}
            {(game.state === "ANNOUNCE_ATOUT_TOUR_1" ||
              game.state === "ANNOUNCE_ATOUT_TOUR_2") && (
              <div className="atout-panel">
                <div className="atout-title">Choisir l’atout ?</div>

                <div className="atout-actions">
                  <button className="atout-btn take">
                    Prendre ♥
                  </button>
                  <button className="atout-btn pass">
                    Passer
                  </button>
                </div>
              </div>
            )}

            {/* ===================== */}
            {/* CARTE D’ATOUT FIXE */}
            {/* ===================== */}
            {game.atout && (
              <div className="atout-card">
                <div className="atout-label">Atout</div>
                <div className="atout-value">♥</div>
              </div>
            )}

            {/* ===================== */}
            {/* AVATARS JOUEURS */}
            {/* ===================== */}
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

            {/* ===================== */}
            {/* CARTES ADVERSES */}
            {/* ===================== */}
            <CardBackRow count={game.hands["joueur2"]?.length} position="top" />
            <CardBackRow count={game.hands["joueur4"]?.length} position="left" />
            <CardBackRow count={game.hands["joueur3"]?.length} position="right" />

            {/* ===================== */}
            {/* MAIN JOUEUR LOCAL */}
            {/* ===================== */}
            {game.hands["joueur1"] && (
              <div className="player-bottom">
                {game.hands["joueur1"].map((card, index) => {
                  const total = game.hands["joueur1"].length;
                  const center = (total - 1) / 2;
                  const offset = index - center;

                  const rotation = offset * 4;
                  const curveY = Math.abs(offset) * 4;
                  const baseLift = -18;

                  return (
                    <div
                      key={index}
                      className="card"
                      style={{
                        transform: `translateY(${baseLift + curveY}px) rotate(${rotation}deg)`
                      }}
                    >
                      {card.value} {card.suit}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ===================== */}
            {/* AVATAR JOUEUR LOCAL */}
            {/* ===================== */}
            <div className="player-seat bottom">
              <img src="/avatar.png" alt="Avatar" className="player-avatar" />
              <div className="player-pseudo">joueur1</div>
            </div>
          </div>
        </div>

        {/* ===================== */}
        {/* TCHAT */}
        {/* ===================== */}
        <div className="table-chat-zone">
          <TableChat tableName="Belote entre amis" />
        </div>
      </div>
    </div>
  );
}








































































