import React, { useState } from "react";
import "../styles/Profil.css";

export default function Profil({ pseudo, onClose }) {
  // Avatar stocké localement (par navigateur)
  const [avatar, setAvatar] = useState(
    localStorage.getItem("avatar") || "/avatar_blue.png"
  );

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = reader.result;
      setAvatar(img);
      localStorage.setItem("avatar", img);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="profil-modal-bg">
      <div className="profil-modal">
        <h2>Mon profil</h2>

        <img
          src={avatar}
          alt="avatar"
          className="profil-avatar"
          onError={(e) => {
            e.currentTarget.src = "/avatar_blue.png";
          }}
        />

        <p className="profil-pseudo">{pseudo}</p>

        <label className="upload-btn">
          Changer ma photo
          <input
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
          />
        </label>

        <button className="close-btn" onClick={onClose}>
          Fermer
        </button>
      </div>
    </div>
  );
}








