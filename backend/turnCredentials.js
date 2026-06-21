import { createHmac, randomBytes } from "crypto";
import { readFileSync } from "fs";

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function configurationError() {
  const error = new Error("TURN configuration unavailable");
  error.code = "TURN_CONFIG_UNAVAILABLE";
  return error;
}

function readSharedSecret() {
  const filePath = String(process.env.TURN_SHARED_SECRET_FILE || "").trim();

  if (!filePath) {
    throw configurationError();
  }

  try {
    const secret = readFileSync(filePath, "utf8").trim();

    if (!secret) {
      throw configurationError();
    }

    return secret;
  } catch (error) {
    if (error?.code === "TURN_CONFIG_UNAVAILABLE") {
      throw error;
    }

    throw configurationError();
  }
}

export function createTurnCredentials(userId) {
  const numericUserId = Number(userId);

  if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
    throw new Error("Invalid TURN user id");
  }

  const host = String(process.env.TURN_HOST || "turn.belote-et-amis.fr").trim();
  const port = positiveInteger(process.env.TURN_PORT, 3478);
  const ttlSeconds = positiveInteger(process.env.TURN_CREDENTIAL_TTL_SECONDS, 3600);

  if (!host) {
    throw configurationError();
  }

  const secret = readSharedSecret();
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username =
    String(expiresAt) +
    ":" +
    String(numericUserId) +
    ":" +
    randomBytes(8).toString("hex");

  const credential = createHmac("sha1", secret)
    .update(username)
    .digest("base64");

  return {
    expiresAt,
    iceServers: [
      {
        urls: ["stun:" + host + ":" + String(port)],
      },
      {
        urls: [
          "turn:" + host + ":" + String(port) + "?transport=udp",
          "turn:" + host + ":" + String(port) + "?transport=tcp",
        ],
        username,
        credential,
      },
    ],
  };
}
