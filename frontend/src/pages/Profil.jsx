import React, { useState } from "react";
import "../styles/Profil.css";

const STORAGE_KEY = "profile_photo_local";

export default function Profil({ pseudo, onClose }) {
  const [preview, setPreview] = useState(
    localStorage.getItem(STORAGE_KEY) || "/avatar_blue.png"
  );
  const [loading, setLoading] = useState(false);

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("Image trop lourde (max 2 Mo)");
      return;
    }

    setLoading(true);

    const reader = new FileReader();
    reader.onload = () => {
      setPreview(reader.result);
      localStorage.setItem(STORAGE_KEY, reader.result);
      setLoading(false);
    };
    reader.onerror = () => {
      alert("Erreur lors du chargement");
      setLoading(false);
    };

    reader.readAsDataURL(file);
  };

  return (
    <div className="profil-modal-bg">
      <div className="profil-modal">
        <h2>Mon profil</h2>

        <img
          src={preview}
          alt="photo"
          className="profil-avatar"
        />

        <p className="profil-pseudo">{pseudo}</p>

        <label className="upload-btn">
          {loading ? "Chargement..." : "Changer ma photo"}
          <input
            type="file"
            accept="image/*"
            onChange={handlePhotoChange}
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














