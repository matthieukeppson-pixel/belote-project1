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

    console.log("GAME STATE:", g);
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
        {/* ===================== */}
        {/* ZONE TABLE */}
        {/* ===================== */}
        <div className="table-zone">
          <div className="table-board">
            {/* Fond de table */}
            <div className="table-image" />

            {/* ===================== */}
            {/* AVATARS JOUEURS (ADVERSES) */}
            {/* ===================== */}

            <div className="player-seat top">
              <img
                src="/avatar.png"
                alt="Avatar joueur"
                className="player-avatar"
              />
              <div className="player-pseudo">joueur2</div>
            </div>

            <div className="player-seat left">
              <img
                src="/avatar.png"
                alt="Avatar joueur"
                className="player-avatar"
              />
              <div className="player-pseudo">joueur4</div>
            </div>

            <div className="player-seat right">
              <img
                src="/avatar.png"
                alt="Avatar joueur"
                className="player-avatar"
              />
              <div className="player-pseudo">joueur3</div>
            </div>

            {/* ===================== */}
            {/* CARTES ADVERSES (LOGIQUE PRÉSENTE, UI MASQUÉE) */}
            {/* ===================== */}

            <CardBackRow
              count={game.hands["joueur2"]?.length}
              position="top"
            />

            <CardBackRow
              count={game.hands["joueur4"]?.length}
              position="left"
            />

            <CardBackRow
              count={game.hands["joueur3"]?.length}
              position="right"
            />

            {/* ===================== */}
            {/* JOUEUR LOCAL — MAIN EN ARC */}
            {/* ===================== */}
            {game.hands["joueur1"] && (
              <div className="player-bottom">
                {game.hands["joueur1"].map((card, index) => {
                  const total = game.hands["joueur1"].length; // belote = 8
                  const center = (total - 1) / 2;             // 3.5
                  const offset = index - center;

                  const rotation = offset * 4;                // arc léger
                  const curveY = Math.abs(offset) * 4;        // courbure
                  const baseLift = -18;                        // lift validé

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
            {/* AVATAR JOUEUR LOCAL (AU BON ENDROIT) */}
            {/* ===================== */}
            <div className="player-seat bottom">
              <img
                src="/avatar.png"
                alt="Avatar joueur"
                className="player-avatar"
              />
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





































































