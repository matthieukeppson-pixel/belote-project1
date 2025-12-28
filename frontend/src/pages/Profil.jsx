import React, { useState } from "react";
import "../styles/Profil.css";

const BACKEND_HTTP = "http://localhost:4000";

export default function Profil({ pseudo, avatar_url, setAvatarUrl, onClose }) {
  const [preview, setPreview] = useState(
    avatar_url ? `${BACKEND_HTTP}${avatar_url}` : "/avatar.png"
  );
  const [loading, setLoading] = useState(false);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append("avatar", file);

      const res = await fetch(`${BACKEND_HTTP}/api/upload-avatar`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: formData,
      });

      const data = await res.json();
      if (!data?.avatar_url) throw new Error("Upload avatar échoué");

      // 🔒 source de vérité = chemin relatif
      setAvatarUrl(data.avatar_url);

      // aperçu = conversion locale uniquement
      setPreview(`${BACKEND_HTTP}${data.avatar_url}`);
    } catch (err) {
      console.error(err);
      alert("Erreur lors du changement d’avatar");
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
            e.currentTarget.src = "/avatar.png";
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











