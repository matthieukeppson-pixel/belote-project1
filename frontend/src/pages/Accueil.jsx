import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Accueil.css";

export default function Accueil({ setPseudo }) {
  const [pseudoLocal, setPseudoLocal] = useState("");
  const navigate = useNavigate();

  const entrerSalon = () => {
    if (pseudoLocal.trim() === "") return;

    setPseudo(pseudoLocal);
    localStorage.setItem("pseudo", pseudoLocal);
    navigate("/salon");
  };

  return (
    <div className="accueil-root">
      <div className="accueil-content">

        <form
          className="accueil-form"
          onSubmit={(e) => {
            e.preventDefault();
            entrerSalon();
          }}
        >
          <input
            type="text"
            placeholder="Votre pseudo"
            value={pseudoLocal}
            onChange={(e) => setPseudoLocal(e.target.value)}
          />
          <button type="submit">Entrer</button>
        </form>

      </div>
    </div>
  );
}































































