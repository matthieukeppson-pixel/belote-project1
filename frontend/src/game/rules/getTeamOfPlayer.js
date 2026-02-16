// ============================================
// DÉTERMINER L’ÉQUIPE D’UN JOUEUR
// ============================================

export function getTeamOfPlayer(playerId) {
  if (playerId === "joueur1" || playerId === "joueur2") {
    return "A";
  }
  if (playerId === "joueur3" || playerId === "joueur4") {
    return "B";
  }
  throw new Error(`Joueur inconnu: ${playerId}`);
}
