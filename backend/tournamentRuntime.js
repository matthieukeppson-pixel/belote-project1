// tournamentRuntime.js
//
// Point d'entree serveur pour les mini-tournois.
//
// Ce fichier ne cree aucune base et ne demarre aucun tournoi.
// Le feature flag est volontairement DESACTIVE par defaut.

export const TOURNAMENT_FEATURE_ENV =
  "BELOTE_TOURNAMENTS_ENABLED";

export function tournamentFeatureEnabled(
  env = process.env
) {
  return (
    String(
      env?.[TOURNAMENT_FEATURE_ENV] ?? ""
    ).trim() === "1"
  );
}
