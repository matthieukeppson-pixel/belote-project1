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
  const [adminView, setAdminView] = useState("users");

  const [tournaments, setTournaments] = useState([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [tournamentTeams, setTournamentTeams] = useState([]);
  const [tournamentLoading, setTournamentLoading] = useState(false);
  const [tournamentError, setTournamentError] = useState("");

  const [tournamentName, setTournamentName] = useState("");
  const [tournamentMode, setTournamentMode] = useState("classic");

  const [teamName, setTeamName] = useState("");
  const [teamPlayer1, setTeamPlayer1] = useState("");
  const [teamPlayer2, setTeamPlayer2] = useState("");

  const [tournamentMatches, setTournamentMatches] = useState([]);

  const [matchRoundNumber, setMatchRoundNumber] = useState("1");
  const [matchTeamAId, setMatchTeamAId] = useState("");
  const [matchTeamBId, setMatchTeamBId] = useState("");
  const [matchScheduleError, setMatchScheduleError] = useState("");

  const tournamentAssignedPlayerKeys = new Set(
    tournamentTeams
      .flatMap((team) => [team.player1, team.player2])
      .map((pseudo) =>
        String(pseudo || "").trim().toLowerCase()
      )
      .filter(Boolean)
  );

  const availableTournamentPlayers = approvedUsers.filter((player) => {
    const pseudo = String(
      player.pseudo || player.username || ""
    ).trim();

    return (
      pseudo &&
      !tournamentAssignedPlayerKeys.has(
        pseudo.toLowerCase()
      )
    );
  });

  const normalizedMatchRoundNumber =
    Number(matchRoundNumber);

  const tournamentUsedTeamIdsForRound = new Set(
    tournamentMatches
      .filter(
        (match) =>
          Number(match.roundNumber) ===
          normalizedMatchRoundNumber
      )
      .flatMap(
        (match) => [
          match.teamAId,
          match.teamBId,
        ]
      )
      .map((teamId) =>
        String(teamId || "").trim()
      )
      .filter(Boolean)
  );

  const availableTournamentMatchTeams =
    tournamentTeams.filter(
      (team) =>
        !tournamentUsedTeamIdsForRound.has(
          String(team.id)
        )
    );

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

  const loadTournamentTeams = async (tournamentId) => {
    const normalizedId = String(tournamentId || "").trim();

    if (!normalizedId) {
      setTournamentTeams([]);
      return;
    }

    const data = await apiRequest(
      `/api/admin/tournaments/${encodeURIComponent(normalizedId)}/teams`
    );

    setTournamentTeams(
      Array.isArray(data.teams) ? data.teams : []
    );
  };

  const loadTournamentMatches = async (tournamentId) => {
    const normalizedId = String(tournamentId || "").trim();

    if (!normalizedId) {
      setTournamentMatches([]);
      return;
    }

    const data = await apiRequest(
      `/api/admin/tournaments/${encodeURIComponent(normalizedId)}/matches`
    );

    setTournamentMatches(
      Array.isArray(data.matches) ? data.matches : []
    );
  };

  const loadTournaments = async (preferredTournamentId = "") => {
    setTournamentLoading(true);
    setTournamentError("");

    try {
      const data = await apiRequest("/api/admin/tournaments");
      const items = Array.isArray(data.tournaments)
        ? data.tournaments
        : [];

      setTournaments(items);

      const preferred = String(preferredTournamentId || "").trim();
      const current = String(selectedTournamentId || "").trim();

      const nextId =
        items.find((item) => String(item.id) === preferred)?.id ||
        items.find((item) => String(item.id) === current)?.id ||
        items[0]?.id ||
        "";

      setSelectedTournamentId(nextId);

      if (nextId) {
        await Promise.all([
          loadTournamentTeams(nextId),
          loadTournamentMatches(nextId),
        ]);
      } else {
        setTournamentTeams([]);
        setTournamentMatches([]);
      }
    } catch (err) {
      setTournamentError(
        err.message || "Chargement des tournois impossible."
      );
    } finally {
      setTournamentLoading(false);
    }
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

  useEffect(() => {
    if (!isAdmin || adminView !== "tournaments") return;
    loadTournaments();
  }, [isAdmin, adminView]);

  const createTournament = async (event) => {
    event.preventDefault();

    const name = String(tournamentName || "").trim();

    if (!name) {
      setTournamentError("Le nom du tournoi est obligatoire.");
      return;
    }

    setTournamentLoading(true);
    setTournamentError("");
    setMessage("");

    try {
      const data = await apiRequest("/api/admin/tournaments", {
        method: "POST",
        body: JSON.stringify({
          name,
          mode: tournamentMode,
        }),
      });

      const createdId = String(data.tournament?.id || "").trim();

      setTournamentName("");
      setMessageType("success");
      setMessage(
        `Tournoi ${data.tournament?.name || name} cree.`
      );

      await loadTournaments(createdId);
    } catch (err) {
      setTournamentError(
        err.message || "Creation du tournoi impossible."
      );
      setTournamentLoading(false);
    }
  };

  const selectTournament = async (event) => {
    const tournamentId = String(event.target.value || "").trim();

    setSelectedTournamentId(tournamentId);
    setTournamentLoading(true);
    setTournamentError("");

    try {
      await Promise.all([
        loadTournamentTeams(tournamentId),
        loadTournamentMatches(tournamentId),
      ]);
    } catch (err) {
      setTournamentError(
        err.message || "Chargement du tournoi impossible."
      );
    } finally {
      setTournamentLoading(false);
    }
  };

  const addTournamentTeam = async (event) => {
    event.preventDefault();

    if (!selectedTournamentId) {
      setTournamentError("Selectionnez d'abord un tournoi.");
      return;
    }

    if (!teamPlayer1 || !teamPlayer2) {
      setTournamentError("Selectionnez deux joueurs.");
      return;
    }

    if (teamPlayer1 === teamPlayer2) {
      setTournamentError(
        "Une equipe doit contenir deux joueurs differents."
      );
      return;
    }

    setTournamentLoading(true);
    setTournamentError("");
    setMessage("");

    try {
      const data = await apiRequest(
        `/api/admin/tournaments/${encodeURIComponent(selectedTournamentId)}/teams`,
        {
          method: "POST",
          body: JSON.stringify({
            name: String(teamName || "").trim(),
            player1: teamPlayer1,
            player2: teamPlayer2,
          }),
        }
      );

      setTeamName("");
      setTeamPlayer1("");
      setTeamPlayer2("");

      setMessageType("success");
      setMessage(
        `Equipe ${data.team?.name || data.team?.id || ""} ajoutee au tournoi.`
      );

      await loadTournamentTeams(selectedTournamentId);
    } catch (err) {
      setTournamentError(
        err.message || "Ajout de l'equipe impossible."
      );
    } finally {
      setTournamentLoading(false);
    }
  };

  const scheduleTournamentMatch = async (event) => {
    event.preventDefault();
    setMatchScheduleError("");

    const roundNumber = Number(matchRoundNumber);

    if (!selectedTournamentId) {
      setMatchScheduleError("Selectionnez d'abord un tournoi.");
      return;
    }

    if (
      !Number.isInteger(roundNumber) ||
      roundNumber <= 0
    ) {
      setMatchScheduleError(
        "Le numero de tour doit etre un entier positif."
      );
      return;
    }

    if (!matchTeamAId || !matchTeamBId) {
      setMatchScheduleError("Selectionnez deux equipes.");
      return;
    }

    if (matchTeamAId === matchTeamBId) {
      setMatchScheduleError(
        "Une equipe ne peut pas jouer contre elle-meme."
      );
      return;
    }

    setTournamentLoading(true);
    setMatchScheduleError("");
    setMessage("");

    let createdMatchId = "";

    try {
      const scheduled = await apiRequest(
        `/api/admin/tournaments/${encodeURIComponent(selectedTournamentId)}/matches`,
        {
          method: "POST",
          body: JSON.stringify({
            roundNumber,
            teamAId: matchTeamAId,
            teamBId: matchTeamBId,
          }),
        }
      );

      createdMatchId = String(
        scheduled.match?.id || ""
      ).trim();

      if (!createdMatchId) {
        throw new Error(
          "Le match a ete cree sans identifiant."
        );
      }

      const opened = await apiRequest(
        `/api/admin/tournaments/${encodeURIComponent(selectedTournamentId)}/matches/${encodeURIComponent(createdMatchId)}/open`,
        {
          method: "POST",
          body: JSON.stringify({}),
        }
      );

      setMatchTeamAId("");
      setMatchTeamBId("");

      setMessageType("success");

      if (opened.alreadyOpen) {
        setMessage(
          `Table ${opened.tableId} deja ouverte.`
        );
      } else if (opened.restored) {
        setMessage(
          `Table ${opened.tableId} restauree.`
        );
      } else {
        setMessage(
          `Table ${opened.tableId} ouverte.`
        );
      }

      await loadTournamentMatches(
        selectedTournamentId
      );
    } catch (err) {
      if (createdMatchId) {
        setMatchScheduleError(
          `Match programme, mais ouverture impossible : ${
            err.message || "Erreur serveur"
          }`
        );

        try {
          await loadTournamentMatches(
            selectedTournamentId
          );
        } catch {
          // Le message principal reste celui de l'ouverture.
        }
      } else {
        setMatchScheduleError(
          err.message || "Ouverture de la table impossible."
        );
      }
    } finally {
      setTournamentLoading(false);
    }
  };

  const openTournamentMatch = async (match) => {
    setTournamentLoading(true);
    setTournamentError("");
    setMessage("");

    try {
      const data = await apiRequest(
        `/api/admin/tournaments/${encodeURIComponent(selectedTournamentId)}/matches/${encodeURIComponent(match.id)}/open`,
        {
          method: "POST",
          body: JSON.stringify({}),
        }
      );

      setMessageType("success");

      if (data.alreadyOpen) {
        setMessage(`Table ${data.tableId} deja ouverte.`);
      } else if (data.restored) {
        setMessage(`Table ${data.tableId} restauree.`);
      } else {
        setMessage(`Table ${data.tableId} ouverte.`);
      }

      await loadTournamentMatches(
        selectedTournamentId
      );
    } catch (err) {
      setTournamentError(
        err.message || "Ouverture de la table impossible."
      );
    } finally {
      setTournamentLoading(false);
    }
  };

  const closeTournamentMatch = async (match) => {
    const confirmed = window.confirm(
      "Fermer cette table de tournoi ?\n\nLa table doit etre completement vide."
    );

    if (!confirmed) return;

    setTournamentLoading(true);
    setTournamentError("");
    setMessage("");

    try {
      const data = await apiRequest(
        `/api/admin/tournaments/${encodeURIComponent(selectedTournamentId)}/matches/${encodeURIComponent(match.id)}/close`,
        {
          method: "POST",
          body: JSON.stringify({}),
        }
      );

      setMessageType("success");

      if (data.closed) {
        setMessage(`Table ${data.tableId} fermee.`);
      } else {
        setMessage("La table etait deja fermee.");
      }

      await loadTournamentMatches(
        selectedTournamentId
      );
    } catch (err) {
      setTournamentError(
        err.message || "Fermeture de la table impossible."
      );
    } finally {
      setTournamentLoading(false);
    }
  };

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

  const selectedTournament =
    tournaments.find(
      (item) => String(item.id) === String(selectedTournamentId)
    ) || null;

  const finishTournament = async () => {
    if (!selectedTournamentId) return;

    const confirmed = window.confirm(
      "Terminer ce tournoi ?\n\nToutes les tables doivent etre fermees. Le tournoi sera retire du poste de commande actif, mais son historique restera conserve."
    );

    if (!confirmed) return;

    setTournamentLoading(true);
    setTournamentError("");
    setMatchScheduleError("");
    setMessage("");

    try {
      const finishedTournamentId =
        String(selectedTournamentId);

      await apiRequest(
        `/api/admin/tournaments/${encodeURIComponent(finishedTournamentId)}/finish`,
        {
          method: "POST",
          body: JSON.stringify({}),
        }
      );

      setTeamName("");
      setTeamPlayer1("");
      setTeamPlayer2("");

      setMatchRoundNumber("1");
      setMatchTeamAId("");
      setMatchTeamBId("");
      setMatchScheduleError("");

      setMessageType("success");
      setMessage("Tournoi termine. Le poste de commande est pret pour le prochain tournoi.");

      await loadTournaments();
    } catch (err) {
      setTournamentError(
        err.message || "Fin du tournoi impossible."
      );
      setTournamentLoading(false);
    }
  };

  const tournamentModeLabel = (mode) => {
    if (mode === "classic") return "Classique";
    if (mode === "moderne") return "Moderne";
    if (mode === "contree") return "Contrée";
    return mode || "-";
  };


  const tournamentStatusLabel = (status) => {
    if (status === "draft") return "Pr\u00e9paration";
    if (status === "registration_open") return "Inscriptions ouvertes";
    if (status === "registration_closed") return "Inscriptions ferm\u00e9es";
    if (status === "running") return "En cours";
    if (status === "finished") return "Termin\u00e9";
    if (status === "cancelled") return "Annul\u00e9";
    return status || "-";
  };


  const tournamentMatchStatusLabel = (status) => {
    if (status === "pending") return "En attente";
    if (status === "ready") return "Table attribu\u00e9e";
    if (status === "playing") return "En cours";
    if (status === "finished") return "Termin\u00e9";
    if (status === "forfeit") return "Forfait";
    return status || "-";
  };

  const tournamentTeamLabel = (teamId) => {
    const team =
      tournamentTeams.find(
        (item) =>
          String(item.id) === String(teamId)
      ) || null;

    if (!team) return teamId || "-";

    const teamName =
      String(team.name || "").trim();

    if (teamName) {
      return teamName;
    }

    return (
      [team.player1, team.player2]
        .filter(Boolean)
        .join(" + ") ||
      team.id
    );
  };

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

          <div className="admin-header-actions">
            {isAdmin && (
              <div className="admin-tabs" role="tablist" aria-label="Administration">
                <button
                  type="button"
                  className={`admin-tab-btn ${adminView === "users" ? "active" : ""}`}
                  onClick={() => setAdminView("users")}
                >
                  Joueurs
                </button>

                <button
                  type="button"
                  className={`admin-tab-btn ${adminView === "tournaments" ? "active" : ""}`}
                  onClick={() => setAdminView("tournaments")}
                >
                  Tournois
                </button>
              </div>
            )}

            <button type="button" className="admin-back-btn" onClick={() => navigate("/salon")}>
              Retour au salon
            </button>
          </div>
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

            {(!isAdmin || adminView === "users") && (
              <>
                {isAdmin &&
                  renderUsersSection("Demandes en attente", "Aucune demande en attente.", pendingUsers, "pending")}
                {renderUsersSection("Joueurs valid\u00e9s", "Aucun joueur valid\u00e9.", approvedUsers, "approved")}
                {renderUsersSection("Joueurs bannis", "Aucun joueur banni.", bannedUsers, "banned")}
              </>
            )}

            {isAdmin && adminView === "tournaments" && (
              <section className="admin-section admin-tournaments-section">
                <h2>Tournois</h2>

                {tournamentError && (
                  <div className="admin-tournament-error">
                    {tournamentError}
                  </div>
                )}

                <div className="admin-tournament-layout">
                  <div className="admin-tournament-panel">
                    <h3>{"Cr\u00e9er un tournoi"}</h3>

                    <form
                      className="admin-tournament-form"
                      onSubmit={createTournament}
                    >
                      <label>
                        Nom du tournoi
                        <input
                          type="text"
                          value={tournamentName}
                          onChange={(event) =>
                            setTournamentName(event.target.value)
                          }
                          placeholder="Ex. Tournoi du vendredi"
                          disabled={tournamentLoading}
                        />
                      </label>

                      <label>
                        Mode
                        <select
                          value={tournamentMode}
                          onChange={(event) =>
                            setTournamentMode(event.target.value)
                          }
                          disabled={tournamentLoading}
                        >
                          <option value="classic">Classique</option>
                          <option value="moderne">Moderne</option>
                          <option value="contree">
                            {"Contr\u00e9e"}
                          </option>
                        </select>
                      </label>

                      <button
                        type="submit"
                        className="admin-tournament-primary-btn"
                        disabled={tournamentLoading}
                      >
                        {"Cr\u00e9er le tournoi"}
                      </button>
                    </form>
                  </div>

                  <div className="admin-tournament-panel">
                    <h3>Tournoi actif dans le poste de commande</h3>

                    {tournaments.length === 0 ? (
                      <div className="admin-empty">
                        Aucun tournoi pour le moment.
                      </div>
                    ) : (
                      <>
                        <label className="admin-tournament-select-label">
                          Choisir un tournoi
                          <select
                            value={selectedTournamentId}
                            onChange={selectTournament}
                            disabled={tournamentLoading}
                          >
                            {tournaments.map((tournament) => (
                              <option
                                key={tournament.id}
                                value={tournament.id}
                              >
                                {tournament.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        {selectedTournament && (
                          <div className="admin-tournament-summary">
                            <strong>{selectedTournament.name}</strong>
                            <span>
                              Mode :{" "}
                              {tournamentModeLabel(
                                selectedTournament.mode
                              )}
                            </span>
                            <span>
                              Statut :{" "}
                              {tournamentStatusLabel(
                                selectedTournament.status
                              )}
                            </span>
                            <span>
                              Equipes : {tournamentTeams.length}
                            </span>
                            <button
                              type="button"
                              className="admin-tournament-primary-btn"
                              onClick={finishTournament}
                              disabled={tournamentLoading}
                            >
                              Terminer le tournoi
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {selectedTournament && (
                  <div className="admin-tournament-teams">
                    <div className="admin-tournament-panel">
                      <h3>{"Former une \u00e9quipe"}</h3>

                      <form
                        className="admin-tournament-form"
                        onSubmit={addTournamentTeam}
                      >
                        <label>
                          Nom de l'equipe (facultatif)
                          <input
                            type="text"
                            value={teamName}
                            onChange={(event) =>
                              setTeamName(event.target.value)
                            }
                            placeholder="Ex. Les As"
                            disabled={tournamentLoading}
                          />
                        </label>

                        <label>
                          Joueur 1
                          <select
                            value={teamPlayer1}
                            onChange={(event) =>
                              setTeamPlayer1(event.target.value)
                            }
                            disabled={tournamentLoading}
                          >
                            <option value="">
                              Selectionner un joueur
                            </option>
                            {availableTournamentPlayers.map((player) => {
                              const pseudo =
                                player.pseudo || player.username || "";

                              return (
                                <option
                                  key={`team-1-${player.id}`}
                                  value={pseudo}
                                  disabled={pseudo === teamPlayer2}
                                >
                                  {pseudo}
                                </option>
                              );
                            })}
                          </select>
                        </label>

                        <label>
                          Joueur 2
                          <select
                            value={teamPlayer2}
                            onChange={(event) =>
                              setTeamPlayer2(event.target.value)
                            }
                            disabled={tournamentLoading}
                          >
                            <option value="">
                              Selectionner un joueur
                            </option>
                            {availableTournamentPlayers.map((player) => {
                              const pseudo =
                                player.pseudo || player.username || "";

                              return (
                                <option
                                  key={`team-2-${player.id}`}
                                  value={pseudo}
                                  disabled={pseudo === teamPlayer1}
                                >
                                  {pseudo}
                                </option>
                              );
                            })}
                          </select>
                        </label>

                        <button
                          type="submit"
                          className="admin-tournament-primary-btn"
                          disabled={
                            tournamentLoading ||
                            !teamPlayer1 ||
                            !teamPlayer2
                          }
                        >
                          Ajouter l'equipe
                        </button>
                      </form>
                    </div>

                    <div className="admin-tournament-panel">
                      <h3>{"Equipes du tournoi"}</h3>

                      {tournamentLoading ? (
                        <div className="admin-info">
                          Chargement...
                        </div>
                      ) : tournamentTeams.length === 0 ? (
                        <div className="admin-empty">
                          Aucune equipe formee.
                        </div>
                      ) : (
                        <div className="admin-tournament-team-list">
                          {tournamentTeams.map((team, index) => (
                            <div
                              key={team.id}
                              className="admin-tournament-team-row"
                            >
                              <div>
                                <strong>
                                  {team.name ||
                                    `Equipe ${index + 1}`}
                                </strong>
                              </div>
                              <div className="admin-tournament-team-players">
                                {team.player1 || "-"}
                                <span> + </span>
                                {team.player2 || "-"}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {selectedTournament && (
                  <div className="admin-tournament-matches">
                    <div className="admin-tournament-panel">
                      <h3>Ouvrir une table</h3>

                      <form
                        className="admin-tournament-form"
                        onSubmit={scheduleTournamentMatch}
                      >
                        <label>
                          {"Num\u00e9ro du tour"}
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={matchRoundNumber}
                            onChange={(event) => {
                              setMatchRoundNumber(
                                event.target.value
                              );
                              setMatchTeamAId("");
                              setMatchTeamBId("");
                              setMatchScheduleError("");
                            }}
                            disabled={tournamentLoading}
                          />
                        </label>

                        <label>
                          {"\u00c9quipe A"}
                          <select
                            value={matchTeamAId}
                            onChange={(event) =>
                              setMatchTeamAId(
                                event.target.value
                              )
                            }
                            disabled={tournamentLoading}
                          >
                            <option value="">
                              {"S\u00e9lectionner une \u00e9quipe"}
                            </option>

                            {availableTournamentMatchTeams.map((team) => (
                              <option
                                key={`match-a-${team.id}`}
                                value={team.id}
                                disabled={
                                  String(team.id) ===
                                  String(matchTeamBId)
                                }
                              >
                                {tournamentTeamLabel(team.id)}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label>
                          {"\u00c9quipe B"}
                          <select
                            value={matchTeamBId}
                            onChange={(event) =>
                              setMatchTeamBId(
                                event.target.value
                              )
                            }
                            disabled={tournamentLoading}
                          >
                            <option value="">
                              {"S\u00e9lectionner une \u00e9quipe"}
                            </option>

                            {availableTournamentMatchTeams.map((team) => (
                              <option
                                key={`match-b-${team.id}`}
                                value={team.id}
                                disabled={
                                  String(team.id) ===
                                  String(matchTeamAId)
                                }
                              >
                                {tournamentTeamLabel(team.id)}
                              </option>
                            ))}
                          </select>
                        </label>

                        <button
                          type="submit"
                          className="admin-tournament-primary-btn"
                          disabled={
                            tournamentLoading ||
                            availableTournamentMatchTeams.length < 2 ||
                            !matchTeamAId ||
                            !matchTeamBId
                          }
                        >
                          Ouvrir la table
                        </button>

                        {matchScheduleError && (
                          <div className="admin-tournament-error">
                            {matchScheduleError}
                          </div>
                        )}
                      </form>
                    </div>

                    <div className="admin-tournament-panel">
                      <h3>Matchs du tournoi</h3>

                      {tournamentLoading ? (
                        <div className="admin-info">
                          Chargement...
                        </div>
                      ) : tournamentMatches.length === 0 ? (
                        <div className="admin-empty">
                          {"Aucun match programm\u00e9."}
                        </div>
                      ) : (
                        <div className="admin-tournament-match-list">
                          {tournamentMatches.map((match) => (
                            <div
                              key={match.id}
                              className="admin-tournament-match-row"
                            >
                              <div className="admin-tournament-match-main">
                                <div className="admin-tournament-match-title">
                                  Tour {match.roundNumber} :{" "}
                                  {tournamentTeamLabel(
                                    match.teamAId
                                  )}{" "}
                                  contre{" "}
                                  {tournamentTeamLabel(
                                    match.teamBId
                                  )}
                                </div>

                                <div className="admin-tournament-match-meta">
                                  <span>
                                    {tournamentMatchStatusLabel(
                                      match.status
                                    )}
                                  </span>

                                  {match.tableId != null && (
                                    <span>
                                      Table {match.tableId}
                                    </span>
                                  )}

                                  {match.status === "finished" &&
                                    match.scoreNous != null &&
                                    match.scoreEux != null && (
                                      <span>
                                        Score :{" "}
                                        {match.scoreNous} -{" "}
                                        {match.scoreEux}
                                      </span>
                                    )}
                                </div>

                                {match.status === "finished" &&
                                  match.winnerTeamId && (
                                    <div className="admin-tournament-match-winner">
                                      Gagnant :{" "}
                                      {tournamentTeamLabel(
                                        match.winnerTeamId
                                      )}
                                    </div>
                                  )}
                              </div>

                              <div className="admin-tournament-match-actions">
                                {(match.status === "pending" ||
                                  match.status === "ready") && (
                                  <button
                                    type="button"
                                    className="admin-tournament-primary-btn"
                                    onClick={() =>
                                      openTournamentMatch(match)
                                    }
                                    disabled={tournamentLoading}
                                  >
                                    Ouvrir la table
                                  </button>
                                )}

                                {match.status === "ready" &&
                                  match.tableId != null && (
                                    <button
                                      type="button"
                                      className="admin-tournament-close-btn"
                                      onClick={() =>
                                        closeTournamentMatch(match)
                                      }
                                      disabled={tournamentLoading}
                                    >
                                      Fermer la table
                                    </button>
                                  )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
