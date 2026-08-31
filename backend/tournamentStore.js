import sqlite3 from "sqlite3";
import path from "path";

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }

      resolve({
        lastID: this.lastID,
        changes: this.changes,
      });
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(row || null);
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(Array.isArray(rows) ? rows : []);
    });
  });
}

function exec(db, sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });
}

function closeDb(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });
}

function requireText(value, fieldName) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new Error(`${fieldName} est obligatoire`);
  }

  return normalized;
}

export async function openTournamentStore({
  dbPath,
} = {}) {
  const resolvedPath = path.resolve(
    dbPath ||
      process.env.BELOTE_TOURNAMENT_DB_PATH ||
      path.join(process.cwd(), "backend", "tournaments.db")
  );

  const db = await new Promise((resolve, reject) => {
    const instance = new sqlite3.Database(resolvedPath, (err) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(instance);
    });
  });

  await exec(db, "PRAGMA foreign_keys = ON;");

  await exec(
    db,
    `
      CREATE TABLE IF NOT EXISTS tournaments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('classic', 'moderne', 'contree')),
        starts_at TEXT,
        max_teams INTEGER CHECK (max_teams IS NULL OR max_teams >= 2),
        status TEXT NOT NULL DEFAULT 'draft'
          CHECK (
            status IN (
              'draft',
              'registration_open',
              'registration_closed',
              'running',
              'finished',
              'cancelled'
            )
          ),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tournament_teams (
        id TEXT PRIMARY KEY,
        tournament_id TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tournament_id)
          REFERENCES tournaments(id)
          ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tournament_team_players (
        tournament_id TEXT NOT NULL,
        team_id TEXT NOT NULL,
        player_slot INTEGER NOT NULL CHECK (player_slot IN (1, 2)),
        pseudo TEXT NOT NULL,
        PRIMARY KEY (team_id, player_slot),
        UNIQUE (tournament_id, pseudo),
        FOREIGN KEY (tournament_id)
          REFERENCES tournaments(id)
          ON DELETE CASCADE,
        FOREIGN KEY (team_id)
          REFERENCES tournament_teams(id)
          ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tournament_matches (
        id TEXT PRIMARY KEY,
        tournament_id TEXT NOT NULL,
        round_number INTEGER NOT NULL CHECK (round_number > 0),
        table_id INTEGER CHECK (table_id IS NULL OR table_id > 0),
        team_a_id TEXT NOT NULL,
        team_b_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (
            status IN (
              'pending',
              'ready',
              'playing',
              'finished',
              'forfeit'
            )
          ),
        winner_team_id TEXT
          CHECK (
            winner_team_id IS NULL OR
            winner_team_id = team_a_id OR
            winner_team_id = team_b_id
          ),
        score_nous INTEGER
          CHECK (
            score_nous IS NULL OR
            (typeof(score_nous) = 'integer' AND score_nous >= 0)
          ),
        score_eux INTEGER
          CHECK (
            score_eux IS NULL OR
            (typeof(score_eux) = 'integer' AND score_eux >= 0)
          ),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finished_at TEXT,
        CHECK (team_a_id <> team_b_id),
        CHECK (
          status <> 'finished' OR (
            winner_team_id IS NOT NULL AND
            score_nous IS NOT NULL AND
            score_eux IS NOT NULL AND
            finished_at IS NOT NULL
          )
        ),
        FOREIGN KEY (tournament_id)
          REFERENCES tournaments(id)
          ON DELETE CASCADE,
        FOREIGN KEY (team_a_id)
          REFERENCES tournament_teams(id),
        FOREIGN KEY (team_b_id)
          REFERENCES tournament_teams(id),
        FOREIGN KEY (winner_team_id)
          REFERENCES tournament_teams(id)
      );

      CREATE INDEX IF NOT EXISTS idx_tournament_teams_tournament
        ON tournament_teams(tournament_id);

      CREATE INDEX IF NOT EXISTS idx_tournament_players_tournament
        ON tournament_team_players(tournament_id);

      CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament_round
        ON tournament_matches(tournament_id, round_number);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_matches_active_table
        ON tournament_matches(table_id)
        WHERE table_id IS NOT NULL
          AND status IN ('ready', 'playing');
    `
  );

  return {
    dbPath: resolvedPath,

    async createTournament({
      id,
      name,
      mode,
      startsAt = null,
      maxTeams = null,
      status = "draft",
    }) {
      await run(
        db,
        `
          INSERT INTO tournaments (
            id,
            name,
            mode,
            starts_at,
            max_teams,
            status
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          requireText(id, "tournament.id"),
          requireText(name, "tournament.name"),
          requireText(mode, "tournament.mode"),
          startsAt == null ? null : String(startsAt),
          maxTeams == null ? null : Number(maxTeams),
          requireText(status, "tournament.status"),
        ]
      );

      return get(
        db,
        "SELECT * FROM tournaments WHERE id = ?",
        [id]
      );
    },

    async getTournament(tournamentId) {
      return get(
        db,
        `
          SELECT *
          FROM tournaments
          WHERE id = ?
        `,
        [requireText(tournamentId, "tournament.id")]
      );
    },

    async addTeam({
      id,
      tournamentId,
      name = "",
      player1,
      player2,
    }) {
      const teamId = requireText(id, "team.id");
      const parentId = requireText(
        tournamentId,
        "team.tournamentId"
      );
      const firstPlayer = requireText(
        player1,
        "team.player1"
      );
      const secondPlayer = requireText(
        player2,
        "team.player2"
      );

      if (firstPlayer === secondPlayer) {
        throw new Error(
          "Une equipe doit contenir deux joueurs differents"
        );
      }

      await exec(db, "BEGIN IMMEDIATE TRANSACTION;");

      try {
        await run(
          db,
          `
            INSERT INTO tournament_teams (
              id,
              tournament_id,
              name
            )
            VALUES (?, ?, ?)
          `,
          [teamId, parentId, String(name || "").trim()]
        );

        await run(
          db,
          `
            INSERT INTO tournament_team_players (
              tournament_id,
              team_id,
              player_slot,
              pseudo
            )
            VALUES (?, ?, 1, ?)
          `,
          [parentId, teamId, firstPlayer]
        );

        await run(
          db,
          `
            INSERT INTO tournament_team_players (
              tournament_id,
              team_id,
              player_slot,
              pseudo
            )
            VALUES (?, ?, 2, ?)
          `,
          [parentId, teamId, secondPlayer]
        );

        await exec(db, "COMMIT;");
      } catch (err) {
        await exec(db, "ROLLBACK;");
        throw err;
      }

      return this.getTeam(teamId);
    },

    async getTeam(teamId) {
      const team = await get(
        db,
        `
          SELECT *
          FROM tournament_teams
          WHERE id = ?
        `,
        [teamId]
      );

      if (!team) return null;

      const players = await all(
        db,
        `
          SELECT player_slot, pseudo
          FROM tournament_team_players
          WHERE team_id = ?
          ORDER BY player_slot
        `,
        [teamId]
      );

      return {
        ...team,
        players,
      };
    },

    async createMatch({
      id,
      tournamentId,
      roundNumber,
      tableId = null,
      teamAId,
      teamBId,
      status = "pending",
    }) {
      await run(
        db,
        `
          INSERT INTO tournament_matches (
            id,
            tournament_id,
            round_number,
            table_id,
            team_a_id,
            team_b_id,
            status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          requireText(id, "match.id"),
          requireText(
            tournamentId,
            "match.tournamentId"
          ),
          Number(roundNumber),
          tableId == null ? null : Number(tableId),
          requireText(teamAId, "match.teamAId"),
          requireText(teamBId, "match.teamBId"),
          requireText(status, "match.status"),
        ]
      );

      return get(
        db,
        "SELECT * FROM tournament_matches WHERE id = ?",
        [id]
      );
    },

    async assignMatchTable({
      tournamentId,
      matchId,
      tableId,
    }) {
      const normalizedTournamentId = requireText(
        tournamentId,
        "match.tournamentId"
      );
      const normalizedMatchId = requireText(
        matchId,
        "match.id"
      );
      const normalizedTableId = Number(tableId);

      if (
        !Number.isInteger(normalizedTableId) ||
        normalizedTableId <= 0
      ) {
        throw new Error(
          "match.tableId doit etre un entier positif"
        );
      }

      let write;

      try {
        write = await run(
          db,
          `
            UPDATE tournament_matches
            SET
              table_id = ?,
              status = 'ready'
            WHERE id = ?
              AND tournament_id = ?
              AND table_id IS NULL
              AND status = 'pending'
          `,
          [
            normalizedTableId,
            normalizedMatchId,
            normalizedTournamentId,
          ]
        );
      } catch (err) {
        if (
          String(err?.message || "").includes(
            "UNIQUE constraint failed: tournament_matches.table_id"
          )
        ) {
          throw new Error(
            "Cette table est deja affectee a un autre match actif"
          );
        }

        throw err;
      }

      if (write.changes === 1) {
        return {
          assigned: true,
          reason: "ASSIGNED",
          match: await get(
            db,
            "SELECT * FROM tournament_matches WHERE id = ?",
            [normalizedMatchId]
          ),
        };
      }

      if (write.changes !== 0) {
        throw new Error(
          "Nombre inattendu de lignes modifiees pour l'affectation de table"
        );
      }

      const currentMatch = await get(
        db,
        "SELECT * FROM tournament_matches WHERE id = ?",
        [normalizedMatchId]
      );

      if (!currentMatch) {
        throw new Error("Match de tournoi introuvable");
      }

      if (
        String(currentMatch.tournament_id) !==
        normalizedTournamentId
      ) {
        throw new Error(
          "Le match n'appartient pas au tournoi demande"
        );
      }

      if (
        Number(currentMatch.table_id) === normalizedTableId &&
        currentMatch.status === "ready"
      ) {
        return {
          assigned: false,
          reason: "ALREADY_ASSIGNED",
          match: currentMatch,
        };
      }

      if (currentMatch.table_id != null) {
        throw new Error(
          `Le match est deja affecte a la table ${currentMatch.table_id}`
        );
      }

      throw new Error(
        `Le match ne peut pas recevoir de table depuis le statut ${currentMatch.status}`
      );
    },

    async recordMatchResult({
      matchId,
      winnerTeamId,
      scoreNous,
      scoreEux,
    }) {
      const match = await get(
        db,
        `
          SELECT *
          FROM tournament_matches
          WHERE id = ?
        `,
        [matchId]
      );

      if (!match) {
        throw new Error("Match de tournoi introuvable");
      }

      if (
        winnerTeamId !== match.team_a_id &&
        winnerTeamId !== match.team_b_id
      ) {
        throw new Error(
          "Le gagnant doit appartenir au match"
        );
      }

      const normalizedScoreNous = Number(scoreNous);
      const normalizedScoreEux = Number(scoreEux);

      if (
        !Number.isSafeInteger(normalizedScoreNous) ||
        normalizedScoreNous < 0 ||
        !Number.isSafeInteger(normalizedScoreEux) ||
        normalizedScoreEux < 0
      ) {
        throw new Error("Scores finaux invalides");
      }

      const write = await run(
        db,
        `
          UPDATE tournament_matches
          SET
            status = 'finished',
            winner_team_id = ?,
            score_nous = ?,
            score_eux = ?,
            finished_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND status IN ('pending', 'ready', 'playing')
        `,
        [
          winnerTeamId,
          normalizedScoreNous,
          normalizedScoreEux,
          matchId,
        ]
      );

      if (write.changes === 1) {
        const finishedMatch = await get(
          db,
          "SELECT * FROM tournament_matches WHERE id = ?",
          [matchId]
        );

        return {
          recorded: true,
          reason: "RECORDED",
          match: finishedMatch,
        };
      }

      if (write.changes !== 0) {
        throw new Error(
          "Nombre inattendu de lignes modifiees pour le resultat tournoi"
        );
      }

      const currentMatch = await get(
        db,
        "SELECT * FROM tournament_matches WHERE id = ?",
        [matchId]
      );

      if (!currentMatch) {
        throw new Error("Match de tournoi introuvable apres ecriture");
      }

      if (currentMatch.status === "finished") {
        const sameResult =
          currentMatch.winner_team_id === winnerTeamId &&
          Number(currentMatch.score_nous) === normalizedScoreNous &&
          Number(currentMatch.score_eux) === normalizedScoreEux;

        if (sameResult) {
          return {
            recorded: false,
            reason: "ALREADY_RECORDED",
            match: currentMatch,
          };
        }

        throw new Error(
          "Un resultat different est deja enregistre pour ce match"
        );
      }

      throw new Error(
        `Le match ne peut pas etre finalise depuis le statut ${currentMatch.status}`
      );
    },

    async listTournamentMatches(tournamentId) {
      return all(
        db,
        `
          SELECT *
          FROM tournament_matches
          WHERE tournament_id = ?
          ORDER BY round_number, id
        `,
        [tournamentId]
      );
    },

    async close() {
      await closeDb(db);
    },
  };
}
