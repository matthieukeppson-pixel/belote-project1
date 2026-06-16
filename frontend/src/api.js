// ================================================
// API HTTP — connexion au backend NodeJS
// HTTP backend : http://localhost:4001
// WebSocket    : ws://localhost:4000
// ================================================

const API_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4001";

async function postJson(path, body) {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        error: data?.error || "Erreur serveur",
      };
    }

    return data;
  } catch {
    return { error: "Erreur réseau" };
  }
}

// Sauvegarder le token
export function saveToken(token) {
  if (!token) return;
  localStorage.setItem("token", token);
}

// Sauvegarder l'utilisateur connecté sans casser l'ancien stockage pseudo/avatar
export function saveUserSession({ token, user }) {
  if (token) saveToken(token);

  if (user) {
    localStorage.setItem("user", JSON.stringify(user));

    if (user.username || user.pseudo) {
      localStorage.setItem("pseudo", user.username || user.pseudo);
    }

    if (user.avatar_url) {
      localStorage.setItem("avatar", user.avatar_url);
    }
  }
}

// Inscription : email privé, username = pseudo visible dans le jeu
export async function register(username, email, password, avatar_url = "/avatar_blue.png") {
  return postJson("/api/register", {
    username,
    email,
    password,
    avatar_url,
  });
}

// Connexion
export async function login(email, password) {
  return postJson("/api/login", {
    email,
    password,
  });
}
