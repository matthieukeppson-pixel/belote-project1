import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Admin.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4001";

async function apiRequest(path, options = {}) {
  const token = localStorage.getItem("token") || "";

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Erreur serveur");
  }

  return data;
}

export default function Admin() {
  const navigate = useNavigate();
  const [adminUser, setAdminUser] = useState(null);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadPendingUsers = async () => {
    const usersData = await apiRequest("/api/admin/users?status=pending");
    setPendingUsers(Array.isArray(usersData.users) ? usersData.users : []);
  };

  useEffect(() => {
    let cancelled = false;

    async function loadAdmin() {
      setIsLoading(true);
      setError("");
      setMessage("");

      try {
        const meData = await apiRequest("/api/admin/me");
        const usersData = await apiRequest("/api/admin/users?status=pending");

        if (cancelled) return;

        setAdminUser(meData.user || null);
        setPendingUsers(Array.isArray(usersData.users) ? usersData.users : []);
      } catch (err) {
        if (cancelled) return;
        setError(err.message || "Accès administration impossible.");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadAdmin();

    return () => {
      cancelled = true;
    };
  }, []);

  const approveUser = async (userId) => {
    setError("");
    setMessage("");

    try {
      const data = await apiRequest(`/api/admin/users/${userId}/approve`, {
        method: "POST",
      });

      setMessage(data.message || "Compte joueur validé.");
      await loadPendingUsers();
    } catch (err) {
      setError(err.message || "Validation impossible.");
    }
  };

  const rejectUser = async (userId) => {
    setError("");
    setMessage("");

    try {
      const data = await apiRequest(`/api/admin/users/${userId}/reject`, {
        method: "POST",
        body: JSON.stringify({
          reason: "Demande refusée par Matt ou Véro.",
        }),
      });

      setMessage(data.message || "Compte joueur désactivé.");
      await loadPendingUsers();
    } catch (err) {
      setError(err.message || "Refus impossible.");
    }
  };

  return (
    <div className="admin-root">
      <div className="admin-card">
        <div className="admin-header">
          <div>
            <h1>Administration</h1>
            <p>Demandes d'inscription Belote et Amis</p>
          </div>

          <button type="button" className="admin-back-btn" onClick={() => navigate("/salon")}>
            Retour au salon
          </button>
        </div>

        {isLoading && <div className="admin-info">Chargement...</div>}

        {!isLoading && error && (
          <div className="admin-error">
            {error}
            <div className="admin-error-actions">
              <button type="button" onClick={() => navigate("/")}>
                Retour accueil
              </button>
            </div>
          </div>
        )}

        {!isLoading && !error && (
          <>
            <div className="admin-user-line">
              Connecté admin : <strong>{adminUser?.pseudo || adminUser?.username || "Admin"}</strong>
            </div>

            {message && <div className="admin-message">{message}</div>}

            <section className="admin-section">
              <h2>Demandes en attente</h2>

              {pendingUsers.length === 0 ? (
                <div className="admin-empty">Aucune demande en attente.</div>
              ) : (
                <div className="admin-users-list">
                  {pendingUsers.map((player) => (
                    <div key={player.id} className="admin-user-row">
                      <div className="admin-user-main">
                        <div className="admin-user-pseudo">{player.pseudo || player.username}</div>
                        <div className="admin-user-email">{player.email}</div>
                      </div>

                      <div className="admin-user-actions">
                        <button
                          type="button"
                          className="admin-approve-btn"
                          onClick={() => approveUser(player.id)}
                        >
                          Valider
                        </button>
                        <button
                          type="button"
                          className="admin-reject-btn"
                          onClick={() => rejectUser(player.id)}
                        >
                          Refuser
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}