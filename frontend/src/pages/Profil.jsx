import React from "react";
import "../styles/profil.css";

export default function Profil({ pseudo, avatar, setAvatar }) {
  
  // Lorsqu’un fichier est choisi → le stocker dans App.jsx
  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setAvatar(reader.result); // enregistre la photo encodée base64
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="profil-modal-bg">
      <div className="profil-modal">

        <h2>Mon profil</h2>

        {/* AVATAR DU JOUEUR */}
        <img
          src={avatar || "/avatar_default.png"} 
          alt="avatar"
          className="profil-avatar"
        />

        {/* PSEUDO */}
        <p>{pseudo}</p>

        {/* BOUTON UPLOAD PHOTO */}
        <label className="upload-btn">
          Changer ma photo
          <input type="file" accept="image/*" onChange={handleAvatarChange} />
        </label>

        {/* BOUTON FERMER */}
        <button
          className="close-btn"
          onClick={() => window.history.back()}
        >
          Fermer
        </button>

      </div>
    </div>
  );
}







