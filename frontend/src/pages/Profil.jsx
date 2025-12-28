import React, { useEffect, useState } from "react";
import "../styles/Profil.css";

const AVATAR_KEY = "avatar";

export default function Profil({ pseudo, onClose }) {
  const [preview, setPreview] = useState("/avatar_blue.png");
  const [loading, setLoading] = useState(false);

  // Charger l’avatar au démarrage
  useEffect(() => {
    const saved = localStorage.getItem(AVATAR_KEY);
    if (saved) setPreview(saved);
  }, []);

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSizeMb = 2;
    if (file.size > maxSizeMb * 1024 * 1024) {
      alert(`Image trop lourde (max ${maxSizeMb} Mo).`);
      return;
    }

    try {
      setLoading(true);

      const toBase64 = (f) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(f);
        });

      const dataUrl = await toBase64(file);

      // Effet immédiat
      setPreview(dataUrl);

      // ✅ Source de vérité unique
      localStorage.setItem(AVATAR_KEY, dataUrl);
    } catch (err) {
      console.error(err);
      alert("Erreur lors du chargement de la photo");
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
















