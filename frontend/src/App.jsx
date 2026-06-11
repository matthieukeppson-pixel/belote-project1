import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import Accueil from "./pages/Accueil.jsx";
import SalonJeu from "./pages/Salonjeu.jsx";
import Table from "./pages/Table.jsx";
import Admin from "./pages/Admin.jsx";

export default function App() {
  // État central utilisateur (pseudo + avatar_url)
  const [user, setUser] = useState(() => {
    // Nouveau stockage (prioritaire)
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        return JSON.parse(storedUser);
      } catch {
        // si JSON corrompu, on retombe sur l'ancien
      }
    }

    // Compatibilité ancienne (pseudo/ avatar séparés)
    const pseudo = localStorage.getItem("pseudo") || "";
    const avatar_url = null; // la source de vérité avatar = backend (on ne met pas d'URL absolue ici)
    return { pseudo, avatar_url };
  });

  // Setter central sécurisé
  const updateUser = (updates) => {
    setUser((prev) => {
      const next = { ...prev, ...updates };
      localStorage.setItem("user", JSON.stringify(next));
      return next;
    });
  };

  // ✅ Compatibilité: Accueil veut setPseudo(pseudo)
  const setPseudo = (pseudo, fullUser = null) => {
    if (fullUser) {
      updateUser({ ...fullUser, pseudo });
    } else {
      updateUser({ pseudo });
    }

    // On garde aussi l'ancien storage pour ne rien casser tant que tout n'est pas migré
    localStorage.setItem("pseudo", pseudo);
  };

  return (
    <Router>
      <Routes>
        {/* Accueil inchangé */}
        <Route path="/" element={<Accueil setPseudo={setPseudo} />} />

        {/* Salon moderne */}
        <Route path="/salon" element={<SalonJeu user={user} />} />

        {/* Administration */}
        <Route path="/admin" element={<Admin />} />

        {/* Table statique */}
        <Route path="/table" element={<Table />} />

        {/* Table dynamique */}
        <Route path="/table/:id" element={<Table />} />
      </Routes>
    </Router>
  );
}




























