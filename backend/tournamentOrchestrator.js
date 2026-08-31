import {
  buildTournamentTableMeta,
  createTournamentDefinition,
  createTournamentMatch,
  createTournamentTeam,
  resultFromAuthoritativeHand,
} from "./tournamentManager.js";

function requireStoreMethod(store, methodName) {
  if (!store || typeof store[methodName] !== "function") {
    throw new Error(
      `Tournament store invalide : methode ${methodName} absente`
    );
  }
}

function storedTeamToDomainTeam(storedTeam) {
  if (!storedTeam) {
    throw new Error("Equipe de tournoi introuvable");
  }

  const players = Array.isArray(storedTeam.players)
    ? [...storedTeam.players]
        .sort(
          (a, b) =>
            Number(a.player_slot) - Number(b.player_slot)
        )
        .map((entry) => String(entry.pseudo || "").trim())
        .filter(Boolean)
    : [];

  if (players.length !== 2) {
    throw new Error(
      `Equipe ${storedTeam.id} invalide : deux joueurs attendus`
    );
  }

  return createTournamentTeam({
    id: storedTeam.id,
    name: storedTeam.name || "",
    player1: players[0],
    player2: players[1],
  });
}

function findStoredMatch(matches, matchId) {
  return (
    (Array.isArray(matches) ? matches : []).find(
      (match) => String(match.id) === String(matchId)
    ) || null
  );
}

function sameStoredResult(match, result) {
  return (
    String(match?.winner_team_id || "") ===
      String(result?.winnerTeamId || "") &&
    Number(match?.score_nous) === Number(result?.scoreNous) &&
    Number(match?.score_eux) === Number(result?.scoreEux)
  );
}

export function createTournamentOrchestrator({ store }) {
  requireStoreMethod(store, "createTournament");
  requireStoreMethod(store, "getTournament");
  requireStoreMethod(store, "addTeam");
  requireStoreMethod(store, "getTeam");
  requireStoreMethod(store, "createMatch");
  requireStoreMethod(store, "assignMatchTable");
  requireStoreMethod(store, "recordMatchResult");
  requireStoreMethod(store, "listTournamentMatches");

  async function loadMatchContext({
    tournamentId,
    matchId,
  }) {
    const matches =
      await store.listTournamentMatches(tournamentId);

    const storedMatch = findStoredMatch(matches, matchId);

    if (!storedMatch) {
      throw new Error("Match de tournoi introuvable");
    }

    if (
      String(storedMatch.tournament_id) !==
      String(tournamentId)
    ) {
      throw new Error(
        "Le match n'appartient pas au tournoi demande"
      );
    }

    const storedTeamA =
      await store.getTeam(storedMatch.team_a_id);
    const storedTeamB =
      await store.getTeam(storedMatch.team_b_id);

    if (!storedTeamA || !storedTeamB) {
      throw new Error(
        "Une equipe du match est introuvable"
      );
    }

    if (
      String(storedTeamA.tournament_id) !==
        String(tournamentId) ||
      String(storedTeamB.tournament_id) !==
        String(tournamentId)
    ) {
      throw new Error(
        "Les equipes du match n'appartiennent pas au meme tournoi"
      );
    }

    const teamA = storedTeamToDomainTeam(storedTeamA);
    const teamB = storedTeamToDomainTeam(storedTeamB);

    const domainMatch = createTournamentMatch({
      id: storedMatch.id,
      tournamentId: storedMatch.tournament_id,
      roundNumber: storedMatch.round_number,
      tableId: storedMatch.table_id,
      teamA,
      teamB,
    });

    return {
      storedMatch,
      teamA,
      teamB,
      domainMatch,
    };
  }

  return {
    async createTournament(input) {
      const definition = createTournamentDefinition(input);

      return store.createTournament({
        id: definition.id,
        name: definition.name,
        mode: definition.mode,
        startsAt: definition.startsAt,
        maxTeams: definition.maxTeams,
        status: definition.status,
      });
    },

    async registerTeam({
      id,
      tournamentId,
      name = "",
      player1,
      player2,
    }) {
      const team = createTournamentTeam({
        id,
        name,
        player1,
        player2,
      });

      return store.addTeam({
        id: team.id,
        tournamentId,
        name: team.name,
        player1: team.players[0],
        player2: team.players[1],
      });
    },

    async scheduleMatch({
      id,
      tournamentId,
      roundNumber,
      tableId,
      teamAId,
      teamBId,
    }) {
      const storedTeamA = await store.getTeam(teamAId);
      const storedTeamB = await store.getTeam(teamBId);

      if (!storedTeamA || !storedTeamB) {
        throw new Error(
          "Deux equipes existantes sont obligatoires"
        );
      }

      if (
        String(storedTeamA.tournament_id) !==
          String(tournamentId) ||
        String(storedTeamB.tournament_id) !==
          String(tournamentId)
      ) {
        throw new Error(
          "Impossible de programmer des equipes provenant d'un autre tournoi"
        );
      }

      const teamA = storedTeamToDomainTeam(storedTeamA);
      const teamB = storedTeamToDomainTeam(storedTeamB);

      const match = createTournamentMatch({
        id,
        tournamentId,
        roundNumber,
        tableId,
        teamA,
        teamB,
      });

      const storedMatch = await store.createMatch({
        id: match.id,
        tournamentId: match.tournamentId,
        roundNumber: match.roundNumber,
        tableId: match.tableId,
        teamAId: match.teamAId,
        teamBId: match.teamBId,
        status: match.status,
      });

      return {
        match: storedMatch,
        tableMeta: buildTournamentTableMeta(match),
      };
    },

    async assignMatchTable({
      tournamentId,
      matchId,
      tableId,
    }) {
      const tournament =
        await store.getTournament(tournamentId);

      if (!tournament) {
        throw new Error("Tournoi introuvable");
      }

      const assignment =
        await store.assignMatchTable({
          tournamentId,
          matchId,
          tableId,
        });

      const { domainMatch } =
        await loadMatchContext({
          tournamentId,
          matchId,
        });

      return {
        assignment,
        tournament: {
          id: tournament.id,
          mode: tournament.mode,
        },
        tableMeta: buildTournamentTableMeta(
          domainMatch
        ),
      };
    },

    async getTableMeta({
      tournamentId,
      matchId,
    }) {
      const { domainMatch } =
        await loadMatchContext({
          tournamentId,
          matchId,
        });

      return buildTournamentTableMeta(domainMatch);
    },

    async recordAuthoritativeResult({
      tournamentId,
      matchId,
      authoritativeHand,
    }) {
      const {
        storedMatch,
        domainMatch,
      } = await loadMatchContext({
        tournamentId,
        matchId,
      });

      const result = resultFromAuthoritativeHand(
        domainMatch,
        authoritativeHand
      );

      if (!result) {
        return {
          recorded: false,
          reason: "NOT_FINISHED",
          match: storedMatch,
        };
      }

      if (storedMatch.status === "finished") {
        if (sameStoredResult(storedMatch, result)) {
          return {
            recorded: false,
            reason: "ALREADY_RECORDED",
            match: storedMatch,
          };
        }

        throw new Error(
          "Un resultat different est deja enregistre pour ce match"
        );
      }

      const writeResult =
        await store.recordMatchResult({
          matchId,
          winnerTeamId: result.winnerTeamId,
          scoreNous: result.scoreNous,
          scoreEux: result.scoreEux,
        });

      if (writeResult.reason === "ALREADY_RECORDED") {
        return {
          recorded: false,
          reason: "ALREADY_RECORDED",
          match: writeResult.match,
        };
      }

      if (writeResult.reason !== "RECORDED") {
        throw new Error(
          `Etat d'ecriture resultat tournoi inattendu: ${writeResult.reason}`
        );
      }

      return {
        recorded: true,
        reason: "RECORDED",
        match: writeResult.match,
        result,
      };
    },
  };
}
