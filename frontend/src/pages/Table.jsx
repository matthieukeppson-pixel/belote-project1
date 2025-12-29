import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import "../styles/table.css";

export default function Table() {
  const navigate = useNavigate();
  const { id } = useParams();

  return (
    <div className="table-wrapper">
      <button
        className="btn-back"
        onClick={() => navigate("/")}
      >
        ← Retour au salon
      </button>

      <div className="table-container">
        <h2>Table {id}</h2>
      </div>
    </div>
  );
}




















































