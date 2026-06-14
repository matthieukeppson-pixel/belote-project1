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
  const [approvedUsers, setApprovedUsers] = useState([]);
  const [bannedUsers, setBannedUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [error, setError] = useState("");

  const loadUsers = async () => {
    const [pendingData, approvedData, bannedData] = await Promise.all([
      apiRequest("/api/admin/users?status=pending"),
      apiRequest("/api/admin/users?status=approved"),
      apiRequest("/api/admin/users?status=banned"),
    ]);

    setPendingUsers(Array.isArray(pendingData.users) ? pendingData.users : []);
    setApprovedUsers(Array.isArray(approvedData.users) ? approvedData.users : []);
    setBannedUsers(Array.isArray(bannedData.users) ? bannedData.users : []);
  };

  useEffect(() => {
    let cancelled = false;

    async function loadAdmin() {
      setIsLoading(true);
      setError("");
      setMessage("");

      try {
        const [meData, pendingData, approvedData, bannedData] = await Promise.all([
          apiRequest("/api/admin/me"),
          apiRequest("/api/admin/users?status=pending"),
          apiRequest("/api/admin/users?status=approved"),
          apiRequest("/api/admin/users?status=banned"),
        ]);

        if (cancelled) return;

        setAdminUser(meData.user || null);
        setPendingUsers(Array.isArray(pendingData.users) ? pendingData.users : []);
        setApprovedUsers(Array.isArray(approvedData.users) ? approvedData.users : []);
        setBannedUsers(Array.isArray(bannedData.users) ? bannedData.users : []);
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

      setMessageType("success");
      setMessage(data.message || "Compte joueur validé.");
      await loadUsers();
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

      setMessageType("danger");
      setMessage(data.message || "Compte joueur désactivé.");
      await loadUsers();
    } catch (err) {
      setError(err.message || "Refus impossible.");
    }
  };

  const banUser = async (userId) => {
    const confirmed = window.confirm("Bannir ce joueur ?");
    if (!confirmed) return;

    setError("");
    setMessage("");

    try {
      const data = await apiRequest(`/api/admin/users/${userId}/ban`, {
        method: "POST",
        body: JSON.stringify({
          reason: "Compte banni par Matt ou Véro.",
        }),
      });

      setMessageType("danger");
      setMessage(data.message || "Compte joueur banni.");
      await loadUsers();
    } catch (err) {
      setError(err.message || "Bannissement impossible.");
    }
  };

  const unbanUser = async (userId) => {
    const confirmed = window.confirm("Débannir ce joueur ?");
    if (!confirmed) return;

    setError("");
    setMessage("");

    try {
      const data = await apiRequest(`/api/admin/users/${userId}/unban`, {
        method: "POST",
      });

      setMessageType("success");
      setMessage(data.message || "Compte joueur débanni.");
      await loadUsers();
    } catch (err) {
      setError(err.message || "Débannissement impossible.");
    }
  };

  const promoteModerator = async (userId) => {
    const confirmed = window.confirm("Mettre ce joueur moderateur ?");
    if (!confirmed) return;

    setError("");
    setMessage("");

    try {
      const data = await apiRequest(`/api/admin/users/${userId}/promote-moderator`, {
        method: "POST",
      });

      setMessageType("success");
      setMessage(data.message || "Joueur passe moderateur.");
      await loadUsers();
    } catch (err) {
      setError(err.message || "Promotion moderateur impossible.");
    }
  };

  const demoteModerator = async (userId) => {
    const confirmed = window.confirm("Retirer le role moderateur a ce joueur ?");
    if (!confirmed) return;

    setError("");
    setMessage("");

    try {
      const data = await apiRequest(`/api/admin/users/${userId}/demote-moderator`, {
        method: "POST",
      });

      setMessageType("success");
      setMessage(data.message || "Role moderateur retire.");
      await loadUsers();
    } catch (err) {
      setError(err.message || "Retrait moderateur impossible.");
    }
  };

  const renderUserRow = (player, section) => (
    <div key={`${section}-${player.id}`} className="admin-user-row">
      <div className="admin-user-main">
        <div className={`admin-user-pseudo ${player.role === "moderator" ? "role-moderator" : ""}`}>
  {player.pseudo || player.username}
</div>
        <div className="admin-user-email">{player.email}</div>
        {section === "banned" && player.ban_reason && (
          <div className="admin-user-extra">Motif : {player.ban_reason}</div>
        )}
      </div>

      <div className="admin-user-actions">
        {section === "pending" && (
          <>
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
          </>
        )}

        {section === "approved" && (
          <>
            {player.role === "moderator" ? (
              <button
                type="button"
                className="admin-demote-btn"
                onClick={() => demoteModerator(player.id)}
              >
                Retirer modo
              </button>
            ) : (
              <button
                type="button"
                className="admin-promote-btn"
                onClick={() => promoteModerator(player.id)}
              >
                Mettre modo
              </button>
            )}

            <button
              type="button"
              className="admin-ban-btn"
              onClick={() => banUser(player.id)}
            >
              Bannir
            </button>
          </>
        )}

        {section === "banned" && (
          <button type="button" className="admin-unban-btn" onClick={() => unbanUser(player.id)}>
            Débannir
          </button>
        )}
      </div>
    </div>
  );

  const renderUsersSection = (title, emptyText, users, section) => (
    <section className="admin-section">
      <h2>{title}</h2>

      {users.length === 0 ? (
        <div className="admin-empty">{emptyText}</div>
      ) : (
        <div className="admin-users-list">
          {users.map((player) => renderUserRow(player, section))}
        </div>
      )}
    </section>
  );

  return (
    <div className="admin-root">
      <div className="admin-card">
        <div className="admin-header">
          <div>
            <h1>Administration</h1>
            <p>Inscriptions, moderation et contact Belote et Amis</p>
            <div className="admin-contact-line">
              Contact officiel : <a href="mailto:Belote.et.Amis@gmx.fr">Belote.et.Amis@gmx.fr</a>
            </div>
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

            {message && (
              <div className={messageType === "danger" ? "admin-message admin-message-danger" : "admin-message"}>
                {message}
              </div>
            )}

            {renderUsersSection("Demandes en attente", "Aucune demande en attente.", pendingUsers, "pending")}
            {renderUsersSection("Joueurs validés", "Aucun joueur validé..", approvedUsers, "approved")}
            {renderUsersSection("Joueurs bannis", "Aucun joueur banni.", bannedUsers, "banned")}
          </>
        )}
      </div>
    </div>
  );
}
