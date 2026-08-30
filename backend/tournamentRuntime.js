// tournamentRuntime.js
//
// Point d'entree serveur pour les mini-tournois.
//
// Aucun stockage ni tournoi n'est initialise ici.
// Toutes les gardes restent inactives lorsque le feature flag est coupe.

export const TOURNAMENT_FEATURE_ENV =
  "BELOTE_TOURNAMENTS_ENABLED";

export function tournamentFeatureEnabled(
  env = process.env
) {
  return (
    String(
      env?.[TOURNAMENT_FEATURE_ENV] ?? ""
    ).trim() === "1"
  );
}

function normalizedSeatAssignments(table) {
  const assignments =
    table?.tournament?.seatAssignments;

  if (
    !Array.isArray(assignments) ||
    assignments.length !== 4
  ) {
    return null;
  }

  return assignments.map(
    (pseudo) => String(pseudo ?? "").trim()
  );
}

export function tournamentTableAccess(
  table,
  pseudo,
  enabled
) {
  if (!enabled || !table?.tournament) {
    return {
      managed: false,
      allowed: true,
      seatIndex: null,
      reason: null,
    };
  }

  const assignments =
    normalizedSeatAssignments(table);

  if (!assignments) {
    return {
      managed: true,
      allowed: false,
      seatIndex: null,
      reason: "TOURNAMENT_CONFIG_INVALID",
    };
  }

  const normalizedPseudo =
    String(pseudo ?? "").trim();

  const seatIndex =
    assignments.findIndex(
      (assignedPseudo) =>
        assignedPseudo === normalizedPseudo
    );

  if (!normalizedPseudo || seatIndex === -1) {
    return {
      managed: true,
      allowed: false,
      seatIndex: null,
      reason: "TOURNAMENT_NOT_ASSIGNED",
    };
  }

  return {
    managed: true,
    allowed: true,
    seatIndex,
    reason: null,
  };
}

export function publicTournamentTableMeta(
  table,
  enabled
) {
  if (!enabled || !table?.tournament) {
    return null;
  }

  const assignments =
    normalizedSeatAssignments(table);

  if (!assignments) {
    return null;
  }

  const tournamentId =
    String(
      table.tournament.tournamentId ?? ""
    ).trim();

  const matchId =
    String(
      table.tournament.matchId ?? ""
    ).trim();

  const roundNumber =
    Number(table.tournament.roundNumber);

  if (
    !tournamentId ||
    !matchId ||
    !Number.isInteger(roundNumber) ||
    roundNumber <= 0
  ) {
    return null;
  }

  return {
    tournamentId,
    matchId,
    roundNumber,
    seatAssignments: [...assignments],
  };
}
