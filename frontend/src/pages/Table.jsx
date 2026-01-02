import React from "react";
import { useNavigate } from "react-router-dom";
import TableChat from "../components/TableChat";
import "../styles/Table.css";

export default function Table() {
  const navigate = useNavigate();

  return (
    <div className="table-page">
      <button className="table-back-btn" onClick={() => navigate("/salon")}>
        ← Retour au salon
      </button>

      <div className="table-layout">
        <div className="table-zone">
          <div className="table-image" />
        </div>

        <div className="table-chat-zone">
          <TableChat tableName="Belote entre amis" />
        </div>
      </div>
    </div>
  );
}
























































