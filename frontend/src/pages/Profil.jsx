import React, { useState } from "react";
import "../styles/Profil.css";

const BACKEND_HTTP = "http://localhost:4001";

export default function Profil({ pseudo, avatar, setAvatar, onClose }) {
  const [preview, setPreview] = useState(avatar || "/avatar_blue.png");
  const [loading, setLoading] = useState(false);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Aperçu immédiat
    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append("avatar", file);

      const res = await fetch(`${BACKEND_HTTP}/api/upload-avatar`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!data?.avatar_url) throw new Error("Upload avatar échoué");

      // ✅ URL ABSOLUE pour que 5173 puisse charger le fichier servi par 4001
      const absoluteUrl = `${BACKEND_HTTP}${data.avatar_url}`;

      setAvatar(absoluteUrl);
      localStorage.setItem("avatar", absoluteUrl);
      setPreview(absoluteUrl);
    } catch (err) {
      console.error(err);
      alert("Erreur lors du changement d’avatar");
      setPreview(avatar || "/avatar_blue.png");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="profil-modal-bg">
      <div className="profil-modal">
        <h2>Mon profil</h2>

        <img
          src={preview}
          alt="avatar"
          className="profil-avatar"
          onError={(e) => {
            e.currentTarget.src = "/avatar_blue.png";
          }}
        />

        <p className="profil-pseudo">{pseudo}</p>

        <label className="upload-btn">
          {loading ? "Upload..." : "Changer ma photo"}
          <input
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            disabled={loading}
          />
        </label>

        <button className="close-btn" onClick={onClose} disabled={loading}>
          Fermer
        </button>
      </div>
    </div>
  );
}










