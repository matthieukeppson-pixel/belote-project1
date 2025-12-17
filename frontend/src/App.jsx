import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import Accueil from "./pages/Accueil.jsx";
import SalonJeu from "./pages/Salonjeu.jsx";
import Table from "./pages/Table.jsx";

export default function App() {
  const [pseudo, setPseudo] = useState(localStorage.getItem("pseudo") || "");

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Accueil setPseudo={setPseudo} />} />
        <Route path="/salon" element={<SalonJeu pseudo={pseudo} />} />

        {/* Table statique (étape 1) */}
        <Route path="/table" element={<Table />} />

        {/* Table dynamique (plus tard) */}
        <Route path="/table/:id" element={<Table />} />
      </Routes>
    </Router>
  );
}


























