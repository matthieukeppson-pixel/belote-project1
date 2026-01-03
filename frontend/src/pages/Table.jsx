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
            {/* JOUEUR EN FACE */}
            {/* ===================== */}
            <CardBackRow
              count={game.hands["joueur2"]?.length}
              position="top"
            />

            {/* ===================== */}
            {/* JOUEUR À GAUCHE */}
            {/* ===================== */}
            <CardBackRow
              count={game.hands["joueur4"]?.length}
              position="left"
            />

            {/* ===================== */}
            {/* JOUEUR À DROITE */}
            {/* ===================== */}
            <CardBackRow
              count={game.hands["joueur3"]?.length}
              position="right"
            />

            {/* ===================== */}
            {/* JOUEUR LOCAL (BAS) */}
            {/* ===================== */}
            {game.hands["joueur1"] && (
              <div className="player-bottom">
                {game.hands["joueur1"].map((card, index) => (
                  <div key={index} className="card">
                    {card.value} {card.suit}
                  </div>
                ))}
              </div>
            )}
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

































































