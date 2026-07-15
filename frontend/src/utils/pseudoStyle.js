const VERO_PSEUDO_KEY = "v\u00e9ro";

function normalizePseudoKey(value) {
  return String(value ?? "")
    .trim()
    .normalize("NFC")
    .toLocaleLowerCase("fr-FR");
}

export function personalizedPseudoClass(pseudo, role) {
  const normalizedRole = String(role ?? "")
    .trim()
    .toLowerCase();

  return normalizedRole === "admin" &&
    normalizePseudoKey(pseudo) === VERO_PSEUDO_KEY
    ? "pseudo-vero-signature"
    : "";
}