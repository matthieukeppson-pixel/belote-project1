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
  textSuffix = suffix,
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
      {useVeroImage ? (
        <span className={`vero-pseudo-suffix vero-pseudo-suffix--${context}`}>
          {suffix}
        </span>
      ) : (
        textSuffix
      )}
    </>
  );
}