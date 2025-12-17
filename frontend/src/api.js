// ================================================
// API VRAIE – connexion à ton backend NodeJS
// ================================================

const API_URL = "http://localhost:4000";

// Sauvegarder le token
export function saveToken(token) {
  localStorage.setItem("token", token);
}

// Login
export async function login(email, password) {
  try {
    const response = await fetch(`${API_URL}/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    return data; // contient { token, user }
  } catch {
    return { error: "Erreur réseau" };
  }
}



