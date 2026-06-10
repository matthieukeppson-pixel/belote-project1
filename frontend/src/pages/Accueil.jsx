import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Accueil.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4001";

async function postJson(path, payload) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Une erreur est survenue.");
  }

  return data;
}

export default function Accueil({ setPseudo }) {
  const navigate = useNavigate();

  const [authMode, setAuthMode] = useState(null);
  const [loginPseudo, setLoginPseudo] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPseudo, setRegisterPseudo] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openPanel = (mode) => {
    setAuthMode(mode);
    setMessage("");
    setError("");
  };

  const closePanel = () => {
    setAuthMode(null);
    setMessage("");
    setError("");
    setIsSubmitting(false);
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!loginPseudo.trim() || !loginPassword) {
      setError("Pseudo et mot de passe obligatoires.");
      return;
    }

    setIsSubmitting(true);

    try {
      const data = await postJson("/api/login", {
        username: loginPseudo,
        password: loginPassword,
      });

      const user = data.user;
      const pseudo = user?.username || user?.pseudo || "";

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("pseudo", pseudo);

      if (setPseudo) {
        setPseudo(pseudo);
      }

      navigate("/salon");
    } catch (err) {
      setError(err.message || "Connexion impossible.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!registerEmail.trim() || !registerPseudo.trim() || !registerPassword) {
      setError("Email, pseudo et mot de passe obligatoires.");
      return;
    }

    setIsSubmitting(true);

    try {
      const data = await postJson("/api/register", {
        email: registerEmail,
        username: registerPseudo,
        password: registerPassword,
        avatar_url: "/avatar_blue.png",
      });

      setRegisterEmail("");
      setRegisterPseudo("");
      setRegisterPassword("");
      setMessage(
        data.message ||
          "Votre demande d'inscription a bien été envoyée. Elle devra être validée par Matt ou Véro."
      );
    } catch (err) {
      setError(err.message || "Demande d'inscription impossible.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="accueil-root">
      <div className="accueil-content">
        <div className="accueil-entry-buttons">
          <button type="button" onClick={() => openPanel("login")}>
            Connexion
          </button>
          <button type="button" onClick={() => openPanel("register")}>
            Inscription
          </button>
        </div>

        {authMode && (
          <div className="accueil-auth-overlay" role="dialog" aria-modal="true">
            <div className="accueil-auth-card">
              <button
                type="button"
                className="accueil-auth-close"
                onClick={closePanel}
                aria-label="Fermer"
              >
                ×
              </button>

              {authMode === "login" ? (
                <form className="accueil-auth-form" onSubmit={handleLogin}>
                  <h2>Connexion</h2>

                  <label htmlFor="login-pseudo">Pseudo</label>
                  <input
                    id="login-pseudo"
                    type="text"
                    value={loginPseudo}
                    onChange={(event) => setLoginPseudo(event.target.value)}
                    autoComplete="nickname"
                  />

                  <label htmlFor="login-password">Mot de passe</label>
                  <input
                    id="login-password"
                    type="password"
                    value={loginPassword}
                    onChange={(event) => setLoginPassword(event.target.value)}
                    autoComplete="current-password"
                  />

                  <button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Connexion..." : "Connexion"}
                  </button>
                </form>
              ) : (
                <form className="accueil-auth-form" onSubmit={handleRegister}>
                  <h2>S'inscrire</h2>

                  <label htmlFor="register-email">E-mail</label>
                  <input
                    id="register-email"
                    type="email"
                    value={registerEmail}
                    onChange={(event) => setRegisterEmail(event.target.value)}
                    autoComplete="email"
                  />

                  <label htmlFor="register-pseudo">Pseudo</label>
                  <input
                    id="register-pseudo"
                    type="text"
                    value={registerPseudo}
                    onChange={(event) => setRegisterPseudo(event.target.value)}
                    autoComplete="nickname"
                  />

                  <label htmlFor="register-password">Mot de passe</label>
                  <input
                    id="register-password"
                    type="password"
                    value={registerPassword}
                    onChange={(event) => setRegisterPassword(event.target.value)}
                    autoComplete="new-password"
                  />

                  <button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Envoi..." : "Envoyer la demande"}
                  </button>
                </form>
              )}

              {message && <p className="accueil-auth-message">{message}</p>}
              {error && <p className="accueil-auth-error">{error}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}