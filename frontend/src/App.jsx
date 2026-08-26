import React, { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import Accueil from "./pages/Accueil.jsx";
import SalonJeu from "./pages/Salonjeu.jsx";
import Table from "./pages/Table.jsx";
import LandscapeTabletGuard from "./components/LandscapeTabletGuard.jsx";
import Admin from "./pages/Admin.jsx";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4001";

function readSessionUser() {
  const storedUser = sessionStorage.getItem("user");

  if (!storedUser) return null;

  try {
    return JSON.parse(storedUser);
  } catch {
    sessionStorage.removeItem("user");
    return null;
  }
}

function clearAuthenticationSession() {
  sessionStorage.removeItem("token");
  sessionStorage.removeItem("user");
  sessionStorage.removeItem("pseudo");
}

function ProtectedRoute({ authStatus, children }) {
  const location = useLocation();

  if (authStatus === "checking") {
    return <div style={{ padding: 30 }}>Vérification de la connexion...</div>;
  }

  if (authStatus !== "authenticated") {
    return (
      <Navigate
        to="/"
        replace
        state={{ requestedPath: location.pathname }}
      />
    );
  }

  return children;
}

export default function App() {
  const [user, setUser] = useState(readSessionUser);
  const [authStatus, setAuthStatus] = useState(() =>
    sessionStorage.getItem("token") ? "checking" : "unauthenticated"
  );

  useEffect(() => {
    // Suppression des anciennes connexions persistantes.
    // La photo locale reste volontairement conservée.
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("pseudo");

    const token = String(sessionStorage.getItem("token") || "").trim();

    if (!token) {
      clearAuthenticationSession();
      setUser(null);
      setAuthStatus("unauthenticated");
      return undefined;
    }

    let cancelled = false;

    async function verifyAuthenticationSession() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.user) {
          throw new Error(data.error || "Session invalide");
        }

        if (cancelled) return;

        const verifiedUser = data.user;
        const pseudo =
          verifiedUser.username || verifiedUser.pseudo || "";

        sessionStorage.setItem(
          "user",
          JSON.stringify({ ...verifiedUser, pseudo })
        );
        sessionStorage.setItem("pseudo", pseudo);

        setUser({ ...verifiedUser, pseudo });
        setAuthStatus("authenticated");
      } catch {
        if (cancelled) return;

        clearAuthenticationSession();
        setUser(null);
        setAuthStatus("unauthenticated");
      }
    }

    verifyAuthenticationSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const setPseudo = (pseudo, fullUser = null) => {
    const nextUser = fullUser
      ? { ...fullUser, pseudo }
      : { ...(user || {}), pseudo };

    sessionStorage.setItem("user", JSON.stringify(nextUser));
    sessionStorage.setItem("pseudo", pseudo);

    setUser(nextUser);
    setAuthStatus("authenticated");
  };

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Accueil setPseudo={setPseudo} />} />

        <Route
          path="/salon"
          element={
            <ProtectedRoute authStatus={authStatus}>
              <LandscapeTabletGuard>
                <SalonJeu user={user} />
              </LandscapeTabletGuard>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute authStatus={authStatus}>
              <Admin />
            </ProtectedRoute>
          }
        />

        <Route
          path="/table"
          element={
            <ProtectedRoute authStatus={authStatus}>
              <LandscapeTabletGuard>
                <Table />
              </LandscapeTabletGuard>
            </ProtectedRoute>
          }
        />

        <Route
          path="/table/:id"
          element={
            <ProtectedRoute authStatus={authStatus}>
              <LandscapeTabletGuard>
                <Table />
              </LandscapeTabletGuard>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}
