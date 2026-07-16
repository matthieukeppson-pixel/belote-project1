import React from "react";
import "../styles/PseudoDisplay.css";

function isVeroPseudo(name) {
  return (
    String(name ?? "")
      .trim()
      .toLocaleLowerCase("fr-FR") === "véro"
  );
}

export default function PseudoDisplay({
  name,
  isAdmin = false,
  context,
  suffix = "",
}) {
  const safeName = String(name ?? "");
  const useVeroImage = isAdmin && isVeroPseudo(safeName);

  return (
    <>
      {useVeroImage ? (
        <img
          src="/images/vero-pseudo.png"
          alt="Véro"
          className={`vero-pseudo-image vero-pseudo-image--${context}`}
          draggable="false"
        />
      ) : (
        safeName
      )}
      {suffix}
    </>
  );
}