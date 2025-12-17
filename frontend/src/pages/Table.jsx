import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import "../styles/Table.css";

export default function Table() {
  const { id } = useParams();
  const socketRef = useRef(null);
  const [table, setTable] = useState(null);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:4000");
    socketRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "get_table",
          tableId: Number(id),
        })
      );
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "table_update") {
        setTable(msg.table);
      }
    };

    return () => ws.close();
  }, [id]);

  if (!table) return <div style={{ color: "white" }}>Chargement…</div>;

  const renderSeat = (seatData, label) => {
    if (!seatData) {
      return <span className="seat-label">{label}</span>;
    }

    return (
      <div className="seat-player">
        <img
          src={seatData.avatar || "/avatar.png"}
          alt="avatar"
          className="seat-avatar"
        />
        <span className="seat-name">{seatData.name}</span>
      </div>
    );
  };

  return (
    <div className="table-wrapper">
      <div className="table-center">
        <img src="/table_vero.png" alt="Table" className="table-image" />

        <div className="seat seat-north">
          {renderSeat(table.seats[0], "Nord")}
        </div>

        <div className="seat seat-east">
          {renderSeat(table.seats[1], "Est")}
        </div>

        <div className="seat seat-south">
          {renderSeat(table.seats[2], "Sud")}
        </div>

        <div className="seat seat-west">
          {renderSeat(table.seats[3], "Ouest")}
        </div>
      </div>
    </div>
  );
}



















































