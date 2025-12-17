import { useState } from "react";
import { login, saveToken } from "../api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();

    const result = await login(email, password);

    if (result.error) {
      setMessage(result.error);
    } else {
      // Sauvegarde du token
      saveToken(result.token);

      // Sauvegarde du pseudo et de l’avatar pour le Salon
      localStorage.setItem("pseudo", result.user.username);
      localStorage.setItem("avatar", result.user.avatar_url);

      setMessage("Connexion réussie ! 🎉");

      // Redirection automatique vers le salon (si tu veux)
      window.location.href = "/salon";
    }
  }

  return (
    <div style={{ padding: 30 }}>
      <h1>Connexion</h1>

      <form onSubmit={handleSubmit}>
        <input
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        /><br/>

        <input
          placeholder="Mot de passe"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        /><br/>

        <button type="submit">Se connecter</button>
      </form>

      {message && <p>{message}</p>}
    </div>
  );
}



