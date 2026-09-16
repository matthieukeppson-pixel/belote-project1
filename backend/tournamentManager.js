// tournamentManager.js
//
// Noyau metier des mini-tournois Belote et Amis.
//
// IMPORTANT : ce module est volontairement isole.
// Il ne cree aucune table de jeu, n'ouvre aucune base de donnees,
// ne modifie aucun score et n'est pas encore branche a server.js.

export const TOURNAMENT_MODES = Object.freeze([
  "classic",
  "moderne",
  "contree",
]);

export const TOURNAMENT_STATUS = Object.freeze({
  DRAFT: "draft",
  REGISTRATION_OPEN: "registration_open",
  REGISTRATION_CLOSED: "registration_closed",
  RUNNING: "running",
  FINISHED: "finished",
  CANCELLED: "cancelled",
});

export const TOURNAMENT_MATCH_STATUS = Object.freeze({
  PENDING: "pending",
  READY: "ready",
  PLAYING: "playing",
  FINISHED: "finished",
  FORFEIT: "forfeit",
});

function requireNonEmptyString(value, fieldName) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new Error(`${fieldName} est obligatoire`);
  }

  return normalized;
}

function requirePositiveInteger(value, fieldName) {
  const normalized = Number(value);

  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new Error(`${fieldName} doit etre un entier positif`);
  }

  return normalized;
}

export function normalizeTournamentMode(mode) {
  const normalized = String(mode ?? "").trim().toLowerCase();

  if (!TOURNAMENT_MODES.includes(normalized)) {
    throw new Error(`Mode de tournoi invalide : ${mode}`);
  }

  return normalized;
}

export function createTournamentTeam({
  id,
  player1,
  player2,
  name = "",
}) {
  const teamId = requireNonEmptyString(id, "team.id");
  const firstPlayer = requireNonEmptyString(player1, "team.player1");
  const secondPlayer = requireNonEmptyString(player2, "team.player2");

  if (firstPlayer === secondPlayer) {
    throw new Error("Une equipe doit contenir deux joueurs differents");
  }

  return Object.freeze({
    id: teamId,
    name: String(name || "").trim(),
    players: Object.freeze([firstPlayer, secondPlayer]),
  });
}

export function createTournamentDefinition({
  id,
  name,
  mode,
  startsAt = null,
  maxTeams = null,
}) {
  const tournamentId = requireNonEmptyString(id, "tournament.id");
  const tournamentName = requireNonEmptyString(name, "tournament.name");
  const tournamentMode = normalizeTournamentMode(mode);

  let normalizedMaxTeams = null;

  if (maxTeams != null) {
    normalizedMaxTeams = requirePositiveInteger(
      maxTeams,
      "tournament.maxTeams"
    );

    if (normalizedMaxTeams < 2) {
      throw new Error("Un tournoi doit accepter au moins deux equipes");
    }
  }

  return Object.freeze({
    id: tournamentId,
    name: tournamentName,
    mode: tournamentMode,
    startsAt: startsAt == null ? null : String(startsAt),
    maxTeams: normalizedMaxTeams,
    status: TOURNAMENT_STATUS.DRAFT,
  });
}

export function buildTournamentSeatAssignments(teamA, teamB) {
  if (!teamA?.players || teamA.players.length !== 2) {
    throw new Error("teamA doit contenir exactement deux joueurs");
  }

  if (!teamB?.players || teamB.players.length !== 2) {
    throw new Error("teamB doit contenir exactement deux joueurs");
  }

  const allPlayers = [...teamA.players, ...teamB.players];

  if (new Set(allPlayers).size !== 4) {
    throw new Error("Les quatre places du match doivent appartenir a quatre joueurs differents");
  }

  // Le moteur actuel forme les equipes avec les sieges 0+2 contre 1+3.
  return Object.freeze([
    teamA.players[0],
    teamB.players[0],
    teamA.players[1],
    teamB.players[1],
  ]);
}

export function createTournamentMatch({
  id,
  tournamentId,
  roundNumber,
  tableId = null,
  teamA,
  teamB,
}) {
  const matchId = requireNonEmptyString(id, "match.id");
  const normalizedTournamentId = requireNonEmptyString(
    tournamentId,
    "match.tournamentId"
  );

  const normalizedRoundNumber = requirePositiveInteger(
    roundNumber,
    "match.roundNumber"
  );

  if (!teamA?.id || !teamB?.id) {
    throw new Error("Deux equipes valides sont obligatoires");
  }

  if (teamA.id === teamB.id) {
    throw new Error("Une equipe ne peut pas jouer contre elle-meme");
  }

  const seatAssignments = buildTournamentSeatAssignments(teamA, teamB);

  return {
    id: matchId,
    tournamentId: normalizedTournamentId,
    roundNumber: normalizedRoundNumber,
    tableId:
      tableId == null
        ? null
        : requirePositiveInteger(tableId, "match.tableId"),
    teamAId: teamA.id,
    teamBId: teamB.id,
    seatAssignments,
    status: TOURNAMENT_MATCH_STATUS.PENDING,
    result: null,
  };
}

export function buildTournamentTableMeta(match) {
  if (!match?.id || !match?.tournamentId) {
    throw new Error("Match de tournoi invalide");
  }

  if (!Array.isArray(match.seatAssignments) || match.seatAssignments.length !== 4) {
    throw new Error("Attribution des sieges invalide");
  }

  return {
    tournamentId: match.tournamentId,
    matchId: match.id,
    roundNumber: match.roundNumber,
    tableId:
      match.tableId == null
        ? null
        : requirePositiveInteger(
            match.tableId,
            "match.tableId"
          ),
    allowedPlayers: [...match.seatAssignments],
    seatAssignments: [...match.seatAssignments],
  };
}

export function resultFromAuthoritativeHand(match, authoritativeHand) {
  if (!match?.teamAId || !match?.teamBId) {
    throw new Error("Match de tournoi invalide");
  }

  if (
    authoritativeHand?.phase !== "FIN_DE_PARTIE" ||
    authoritativeHand?.partieTerminee !== true
  ) {
    return null;
  }

  const winnerTeam = authoritativeHand.winnerTeam;

  if (winnerTeam !== "nous" && winnerTeam !== "eux") {
    throw new Error("FIN_DE_PARTIE sans equipe gagnante valide");
  }

  const scores = authoritativeHand.scores || {};
  const scoreNous = Number(scores.nous);
  const scoreEux = Number(scores.eux);

  if (
    !Number.isSafeInteger(scoreNous) ||
    scoreNous < 0 ||
    !Number.isSafeInteger(scoreEux) ||
    scoreEux < 0
  ) {
    throw new Error("Scores finaux invalides");
  }

  return Object.freeze({
    winnerSide: winnerTeam,
    winnerTeamId:
      winnerTeam === "nous" ? match.teamAId : match.teamBId,
    loserTeamId:
      winnerTeam === "nous" ? match.teamBId : match.teamAId,
    scoreNous,
    scoreEux,
  });
}
