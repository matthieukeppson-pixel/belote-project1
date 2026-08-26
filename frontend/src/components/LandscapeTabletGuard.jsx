import React from "react";
import "../styles/LandscapeTabletGuard.css";

export default function LandscapeTabletGuard({ children }) {
  return (
    <>
      {children}

      <div
        className="tablet-landscape-guard"
        role="status"
        aria-live="polite"
      >
        <div className="tablet-landscape-guard__card">
          <div
            className="tablet-landscape-guard__device"
            aria-hidden="true"
          />

          <div className="tablet-landscape-guard__title">
            Tournez votre tablette
          </div>

          <div className="tablet-landscape-guard__text">
            Pour jouer confortablement, utilisez votre tablette en mode paysage.
          </div>
        </div>
      </div>
    </>
  );
}
