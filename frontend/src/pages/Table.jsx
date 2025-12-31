import React from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Table.css";

export default function Table() {
  const navigate = useNavigate();

  return (
    <div className="table-page">
      <button className="table-back-btn" onClick={() => navigate("/salon")}>
        ← Retour au salon
      </button>

      <div className="table-center">
        <div className="table-image" />
      </div>
    </div>
  );
}























































