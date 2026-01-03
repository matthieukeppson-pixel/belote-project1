import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import TableChat from "../components/TableChat";
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
      <button className="table-back-btn" onClick={() => navigate("/salon")}>
        ← Retour au salon
      </button>

      <div className="table-layout">
        <div className="table-zone">
          <div className="table-image" />

          {/* MAIN DU JOUEUR LOCAL (LECTURE SEULE) */}
          {game && game.hands && game.hands["joueur1"] && (
            <div className="player-hand">
              {game.hands["joueur1"].map((card, index) => (
                <div key={index} className="card">
                  {card.value} {card.suit}
                </div>
              ))}
            </div>
          )}

          {/* DEBUG TEMPORAIRE */}
          {game && (
            <pre
              style={{
                color: "white",
                fontSize: "12px",
                marginTop: "10px",
                maxHeight: "200px",
                overflow: "auto"
              }}
            >
              {JSON.stringify(game, null, 2)}
            </pre>
          )}
        </div>

        <div className="table-chat-zone">
          <TableChat tableName="Belote entre amis" />
        </div>
      </div>
    </div>
  );
}






























































