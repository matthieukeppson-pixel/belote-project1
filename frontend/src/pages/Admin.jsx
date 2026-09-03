import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Admin.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4001";

async function apiRequest(path, options = {}) {
  const token = sessionStorage.getItem("token") || "";

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

  const currentRole = String(adminUser?.role || "player");
  const isAdmin = currentRole === "admin";
  const isModerator = currentRole === "moderator";

  const loadUsers = async (role = currentRole) => {
    const canManageRegistrations = String(role || "player") === "admin";

    const [pendingData, approvedData, bannedData] = await Promise.all([
      canManageRegistrations
        ? apiRequest("/api/admin/users?status=pending")
        : Promise.resolve({ users: [] }),
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
        const meData = await apiRequest("/api/admin/me");
        const role = String(meData.user?.role || "player");
        const canManageRegistrations = role === "admin";

        const [pendingData, approvedData, bannedData] = await Promise.all([
          canManageRegistrations
            ? apiRequest("/api/admin/users?status=pending")
            : Promise.resolve({ users: [] }),
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
      await loadUsers(currentRole);
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
      await loadUsers(currentRole);
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
          reason: isAdmin

            ? "Compte banni par Matt ou Véro."

            : "Compte banni par un modérateur.",
        }),
      });

      setMessageType("danger");
      setMessage(data.message || "Compte joueur banni.");
      await loadUsers(currentRole);
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
      await loadUsers(currentRole);
    } catch (err) {
      setError(err.message || "Débannissement impossible.");
    }
  };

  // SUPPRESSION DEFINITIVE COMPTE BANNI V1
  const deleteBannedUser = async (player) => {
    const pseudo = String(player?.pseudo || player?.username || "").trim();

    if (!pseudo) {
      setError("Pseudo joueur introuvable.");
      return;
    }

    const confirmed = window.confirm(
      `Supprimer définitivement le compte « ${pseudo} » ?\n\nLe pseudo et l'adresse e-mail seront libérés. Cette action est irréversible.`
    );

    if (!confirmed) return;

    const confirmation = window.prompt(
      `Saisissez exactement le pseudo « ${pseudo} » pour confirmer.`
    );

    if (confirmation === null) return;

    if (confirmation !== pseudo) {
      setMessage("");
      setError("Suppression annulée : le pseudo saisi ne correspond pas.");
      return;
    }

    setError("");
    setMessage("");

    try {
      const data = await apiRequest(`/api/admin/users/${player.id}/delete`, {
        method: "POST",
        body: JSON.stringify({ confirmation }),
      });

      setMessageType("danger");
      setMessage(data.message || "Compte joueur supprimé définitivement.");
      await loadUsers(currentRole);
    } catch (err) {
      setError(err.message || "Suppression définitive impossible.");
    }
  };

  const promoteModerator = async (userId) => {
    const confirmed = window.confirm("Mettre ce joueur modérateur ?");
    if (!confirmed) return;

    setError("");
    setMessage("");

    try {
      const data = await apiRequest(`/api/admin/users/${userId}/promote-moderator`, {
        method: "POST",
      });

      setMessageType("success");
      setMessage(data.message || "Joueur passe moderateur.");
      await loadUsers(currentRole);
    } catch (err) {
      setError(err.message || "Promotion moderateur impossible.");
    }
  };

  const demoteModerator = async (userId) => {
    const confirmed = window.confirm("Retirer le rôle modérateur à ce joueur ?");
    if (!confirmed) return;

    setError("");
    setMessage("");

    try {
      const data = await apiRequest(`/api/admin/users/${userId}/demote-moderator`, {
        method: "POST",
      });

      setMessageType("success");
      setMessage(data.message || "Role moderateur retire.");
      await loadUsers(currentRole);
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
        {isAdmin && section === "pending" && (
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
            {isAdmin &&
              (player.role === "moderator" ? (
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
              ))}

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
          <>
            <button
              type="button"
              className="admin-unban-btn"
              onClick={() => unbanUser(player.id)}
            >
              Débannir
            </button>

            {isAdmin && (
              <button
                type="button"
                className="admin-reject-btn"
                onClick={() => deleteBannedUser(player)}
              >
                Supprimer définitivement
              </button>
            )}
          </>
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
            <h1>{isModerator ? "Modération" : "Administration"}</h1>
            <p>
              {isModerator
                ? "Modération des joueurs Belote et Amis"
                : "Inscriptions, modération et contact Belote et Amis"}
            </p>
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
              Connecté {isModerator ? "modo" : "admin"} :{" "}
              <strong>{adminUser?.pseudo || adminUser?.username || "Admin"}</strong>
            </div>

            {message && (
              <div className={messageType === "danger" ? "admin-message admin-message-danger" : "admin-message"}>
                {message}
              </div>
            )}

            {isAdmin &&
              renderUsersSection("Demandes en attente", "Aucune demande en attente.", pendingUsers, "pending")}
            {renderUsersSection(
                "Joueurs validés",
                "Aucun joueur validé.",
                [...approvedUsers].sort((a, b) =>
                  String(a.pseudo || a.username || "")
                    .replace(/^[^\p{L}\p{N}]+/u, "")
                    .localeCompare(
                      String(b.pseudo || b.username || "")
                        .replace(/^[^\p{L}\p{N}]+/u, ""),
                      "fr",
                      { sensitivity: "base" }
                    )
                ),
                "approved"
              )}
            {renderUsersSection("Joueurs bannis", "Aucun joueur banni.", bannedUsers, "banned")}
          </>
        )}
      </div>
    </div>
  );
}
