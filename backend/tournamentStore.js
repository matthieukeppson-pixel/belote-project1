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

      CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_matches_unique_pairing_round
        ON tournament_matches(
          tournament_id,
          round_number,
          CASE
            WHEN team_a_id < team_b_id
              THEN team_a_id
            ELSE team_b_id
          END,
          CASE
            WHEN team_a_id < team_b_id
              THEN team_b_id
            ELSE team_a_id
          END
        );

      CREATE TRIGGER IF NOT EXISTS trg_tournament_matches_team_once_per_round
        BEFORE INSERT ON tournament_matches
        WHEN EXISTS (
          SELECT 1
          FROM tournament_matches AS existing_match
          WHERE
            existing_match.tournament_id =
              NEW.tournament_id
            AND existing_match.round_number =
              NEW.round_number
            AND (
              existing_match.team_a_id =
                NEW.team_a_id
              OR existing_match.team_b_id =
                NEW.team_a_id
              OR existing_match.team_a_id =
                NEW.team_b_id
              OR existing_match.team_b_id =
                NEW.team_b_id
            )
            AND NOT (
              (
                existing_match.team_a_id =
                  NEW.team_a_id
                AND existing_match.team_b_id =
                  NEW.team_b_id
              )
              OR
              (
                existing_match.team_a_id =
                  NEW.team_b_id
                AND existing_match.team_b_id =
                  NEW.team_a_id
              )
            )
        )
        BEGIN
          SELECT RAISE(
            ABORT,
            'Une equipe participe deja a un match de ce tour'
          );
        END;
    `
  );

  const tournamentMatchColumns =
    await all(
      db,
      "PRAGMA table_info(tournament_matches);"
    );

  if (
    !tournamentMatchColumns.some(
      (column) => String(column.name) === "mode"
    )
  ) {
    await run(
      db,
      `
        ALTER TABLE tournament_matches
        ADD COLUMN mode TEXT
          CHECK (
            mode IS NULL OR
            mode IN ('classic', 'moderne', 'contree')
          )
      `
    );
  }

  await run(
    db,
    `
      UPDATE tournament_matches
      SET mode = (
        SELECT tournaments.mode
        FROM tournaments
        WHERE tournaments.id =
          tournament_matches.tournament_id
      )
      WHERE mode IS NULL
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

    async listTournaments() {
      return all(
        db,
        `
          SELECT *
          FROM tournaments
          ORDER BY created_at DESC, id
        `
      );
    },

    async finishTournament(tournamentId) {
      const normalizedId =
        requireText(
          tournamentId,
          "tournament.id"
        );

      const current =
        await get(
          db,
          `
            SELECT *
            FROM tournaments
            WHERE id = ?
          `,
          [normalizedId]
        );

      if (!current) {
        return null;
      }

      if (current.status !== "finished") {
        await run(
          db,
          `
            UPDATE tournaments
            SET
              status = 'finished',
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
          [normalizedId]
        );
      }

      return get(
        db,
        `
          SELECT *
          FROM tournaments
          WHERE id = ?
        `,
        [normalizedId]
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

    async replaceTeamPlayer({
      tournamentId,
      teamId,
      playerSlot,
      pseudo,
    }) {
      const normalizedTournamentId =
        requireText(
          tournamentId,
          "team.tournamentId"
        );

      const normalizedTeamId =
        requireText(
          teamId,
          "team.id"
        );

      const normalizedPseudo =
        requireText(
          pseudo,
          "team.player"
        );

      const normalizedPlayerSlot =
        Number(playerSlot);

      if (![1, 2].includes(normalizedPlayerSlot)) {
        throw new Error(
          "team.playerSlot doit etre 1 ou 2"
        );
      }

      let write;

      try {
        write = await run(
          db,
          `
            UPDATE tournament_team_players
            SET pseudo = ?
            WHERE tournament_id = ?
              AND team_id = ?
              AND player_slot = ?
          `,
          [
            normalizedPseudo,
            normalizedTournamentId,
            normalizedTeamId,
            normalizedPlayerSlot,
          ]
        );
      } catch (err) {
        if (
          String(err?.message || "").includes(
            "UNIQUE constraint failed: tournament_team_players.tournament_id, tournament_team_players.pseudo"
          )
        ) {
          throw new Error(
            "Ce joueur appartient deja a une equipe de ce tournoi"
          );
        }

        throw err;
      }

      if (write.changes !== 1) {
        throw new Error(
          "Equipe ou joueur de tournoi introuvable"
        );
      }

      return this.getTeam(
        normalizedTeamId
      );
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

    async listTournamentTeams(tournamentId) {
      const parentId = requireText(
        tournamentId,
        "team.tournamentId"
      );

      const teams = await all(
        db,
        `
          SELECT *
          FROM tournament_teams
          WHERE tournament_id = ?
          ORDER BY id
        `,
        [parentId]
      );

      return Promise.all(
        teams.map(async (team) => {
          const players = await all(
            db,
            `
              SELECT player_slot, pseudo
              FROM tournament_team_players
              WHERE team_id = ?
              ORDER BY player_slot
            `,
            [team.id]
          );

          return {
            ...team,
            players,
          };
        })
      );
    },

    async createMatch({
      id,
      tournamentId,
      roundNumber,
      mode = null,
      tableId = null,
      teamAId,
      teamBId,
      status = "pending",
    }) {
      const normalizedId =
        requireText(
          id,
          "match.id"
        );

      const normalizedTournamentId =
        requireText(
          tournamentId,
          "match.tournamentId"
        );

      const normalizedTeamAId =
        requireText(
          teamAId,
          "match.teamAId"
        );

      const normalizedTeamBId =
        requireText(
          teamBId,
          "match.teamBId"
        );

      const normalizedMode =
        mode == null || String(mode).trim() === ""
          ? null
          : requireText(mode, "match.mode");

      if (
        normalizedMode != null &&
        !["classic", "moderne", "contree"].includes(
          normalizedMode
        )
      ) {
        throw new Error("match.mode invalide");
      }

      try {
        await run(
        db,
        `
          INSERT INTO tournament_matches (
            id,
            tournament_id,
            round_number,
            mode,
            table_id,
            team_a_id,
            team_b_id,
            status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          normalizedId,
          normalizedTournamentId,
          Number(roundNumber),
          normalizedMode,
          tableId == null ? null : Number(tableId),
          normalizedTeamAId,
          normalizedTeamBId,
          requireText(status, "match.status"),
        ]
        );
      } catch (err) {
        const message =
          String(err?.message || "");

        if (
          message.includes(
            "Une equipe participe deja a un match de ce tour"
          )
        ) {
          throw new Error(
            "Une equipe participe deja a un match de ce tour"
          );
        }

        if (
          message.includes(
            "UNIQUE constraint failed"
          )
        ) {
          const existingPairing =
            await get(
              db,
              `
                SELECT id
                FROM tournament_matches
                WHERE tournament_id = ?
                  AND round_number = ?
                  AND (
                    (
                      team_a_id = ?
                      AND team_b_id = ?
                    )
                    OR
                    (
                      team_a_id = ?
                      AND team_b_id = ?
                    )
                  )
                LIMIT 1
              `,
              [
                normalizedTournamentId,
                Number(roundNumber),
                normalizedTeamAId,
                normalizedTeamBId,
                normalizedTeamBId,
                normalizedTeamAId,
              ]
            );

          if (existingPairing) {
            throw new Error(
              "Ce match est deja programme pour ce tour"
            );
          }
        }

        throw err;
      }

      return get(
        db,
        "SELECT * FROM tournament_matches WHERE id = ?",
        [normalizedId]
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

    async releaseMatchTable({
      tournamentId,
      matchId,
    }) {
      const normalizedTournamentId = requireText(
        tournamentId,
        "match.tournamentId"
      );

      const normalizedMatchId = requireText(
        matchId,
        "match.id"
      );

      const currentMatch = await get(
        db,
        `
          SELECT *
          FROM tournament_matches
          WHERE id = ?
        `,
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
        currentMatch.table_id == null &&
        currentMatch.status === "pending"
      ) {
        return {
          released: false,
          reason: "ALREADY_RELEASED",
          match: currentMatch,
        };
      }

      if (currentMatch.status !== "ready") {
        throw new Error(
          `La table ne peut pas etre liberee depuis le statut ${currentMatch.status}`
        );
      }

      const write = await run(
        db,
        `
          UPDATE tournament_matches
          SET
            table_id = NULL,
            status = 'pending'
          WHERE id = ?
            AND tournament_id = ?
            AND status = 'ready'
            AND table_id IS NOT NULL
        `,
        [
          normalizedMatchId,
          normalizedTournamentId,
        ]
      );

      if (write.changes !== 1) {
        throw new Error(
          "La liberation de la table du match a echoue"
        );
      }

      return {
        released: true,
        reason: "RELEASED",
        match: await get(
          db,
          "SELECT * FROM tournament_matches WHERE id = ?",
          [normalizedMatchId]
        ),
      };
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
