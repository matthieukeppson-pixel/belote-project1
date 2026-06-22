import { randomBytes } from "node:crypto";

const DEFAULT_AUDIO_TICKET_TTL_MS = 60_000;

function requirePositiveInteger(value, label) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${label} invalide`);
  }

  return number;
}

function requireUsername(value) {
  const username = String(value || "").trim();

  if (!username) {
    throw new Error("Pseudo invalide");
  }

  return username;
}

function removeTicket(tickets, ticketBySubject, ticket) {
  const record = tickets.get(ticket);
  if (!record) return null;

  tickets.delete(ticket);

  if (ticketBySubject.get(record.subjectKey) === ticket) {
    ticketBySubject.delete(record.subjectKey);
  }

  return record;
}

export function createAudioTicketStore({
  now = () => Date.now(),
  createToken = () => randomBytes(32).toString("base64url"),
  ttlMs = DEFAULT_AUDIO_TICKET_TTL_MS,
} = {}) {
  const ticketTtlMs = requirePositiveInteger(ttlMs, "Duree ticket");
  const tickets = new Map();
  const ticketBySubject = new Map();

  function pruneExpired() {
    const currentTime = now();

    for (const [ticket, record] of tickets) {
      if (record.expiresAt <= currentTime) {
        removeTicket(tickets, ticketBySubject, ticket);
      }
    }
  }

  function issue({ userId, username, tableId }) {
    const normalizedUserId = requirePositiveInteger(userId, "Utilisateur");
    const normalizedUsername = requireUsername(username);
    const normalizedTableId = requirePositiveInteger(tableId, "Table");
    const subjectKey = `${normalizedUserId}:${normalizedTableId}`;

    pruneExpired();

    const previousTicket = ticketBySubject.get(subjectKey);
    if (previousTicket) {
      removeTicket(tickets, ticketBySubject, previousTicket);
    }

    let ticket = "";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = String(createToken() || "").trim();

      if (candidate && !tickets.has(candidate)) {
        ticket = candidate;
        break;
      }
    }

    if (!ticket) {
      throw new Error("Creation ticket impossible");
    }

    const issuedAt = now();
    const expiresAt = issuedAt + ticketTtlMs;

    tickets.set(ticket, {
      subjectKey,
      userId: normalizedUserId,
      username: normalizedUsername,
      tableId: normalizedTableId,
      expiresAt,
    });

    ticketBySubject.set(subjectKey, ticket);

    return { ticket, expiresAt };
  }

  function consume(rawTicket) {
    const ticket = String(rawTicket || "").trim();
    if (!ticket) return null;

    const record = removeTicket(tickets, ticketBySubject, ticket);
    if (!record || record.expiresAt <= now()) return null;

    return {
      userId: record.userId,
      username: record.username,
      tableId: record.tableId,
      expiresAt: record.expiresAt,
    };
  }

  return {
    issue,
    consume,
    pruneExpired,
  };
}
