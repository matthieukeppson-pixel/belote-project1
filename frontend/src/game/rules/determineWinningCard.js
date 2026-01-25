// ============================================
// DÉTERMINER LA CARTE GAGNANTE D’UN PLI
// ============================================

const ATTOUT_ORDER = ["J", "9", "A", "10", "K", "Q", "8", "7"];
const NORMAL_ORDER = ["A", "10", "K", "Q", "J", "9", "8", "7"];

export function determineWinningCard(pli, atout, couleurDemandee) {
  let winningPlay = null;

  for (const play of pli) {
    if (!winningPlay) {
      winningPlay = play;
      continue;
    }

    const current = play.card;
    const best = winningPlay.card;

    // Atout bat non-atout
    if (current.suit === atout && best.suit !== atout) {
      winningPlay = play;
      continue;
    }

    if (current.suit !== atout && best.suit === atout) {
      continue;
    }

    // Même couleur
    if (current.suit === best.suit) {
      const order =
        current.suit === atout ? ATTOUT_ORDER : NORMAL_ORDER;

      if (
        order.indexOf(current.value) <
        order.indexOf(best.value)
      ) {
        winningPlay = play;
      }
      continue;
    }

    // Couleur demandée bat hors couleur
    if (
      current.suit === couleurDemandee &&
      best.suit !== couleurDemandee
    ) {
      winningPlay = play;
    }
  }

  return winningPlay;
}
