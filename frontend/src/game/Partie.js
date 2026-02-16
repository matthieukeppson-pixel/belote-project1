// frontend/src/game/Partie.js

/**
 * Partie = arbitre global de la belote
 * - cumule les scores de manche VALIDÉS
 * - décide de la fin de partie (501)
 * - calcule donneur et premier joueur
 * - ne touche PAS au moteur de manche
 */
export default class Partie {
  constructor({ players }) {
    this.players = players;

    // 🔹 score cumulé de la partie
    this.scorePartie = {
      nous: 0,
      eux: 0,
    };

    this.partieTerminee = false;
    this.gagnant = null;
  }

  /**
   * Appelée UNE SEULE FOIS à chaque FIN_DE_MANCHE
   * ⚠️ Utilise EXCLUSIVEMENT finDeManche.scoreFinal
   */
  onFinDeManche({ dealerIndex, finDeManche }) {
    const playersCount = this.players.length;

    // Sécurité
    if (!finDeManche || !finDeManche.scoreFinal) {
      return null;
    }

    const { scoreFinal } = finDeManche;

    // ===============================
    // CUMUL DU SCORE DE PARTIE (RÉEL)
    // ===============================
    this.scorePartie.nous += scoreFinal.nous || 0;
    this.scorePartie.eux += scoreFinal.eux || 0;

    // ===============================
    // FIN DE PARTIE (501)
    // ===============================
    if (this.scorePartie.nous >= 501) {
      this.partieTerminee = true;
      this.gagnant = "nous";
    } else if (this.scorePartie.eux >= 501) {
      this.partieTerminee = true;
      this.gagnant = "eux";
    }

    // ===============================
    // ROTATION DU DONNEUR
    // ===============================
    const nextDealerIndex = (dealerIndex + 1) % playersCount;
    const startingPlayerIndex = (nextDealerIndex + 1) % playersCount;

    // ===============================
    // RÉSULTAT
    // ===============================
    return {
      scorePartie: { ...this.scorePartie },
      partieTerminee: this.partieTerminee,
      gagnant: this.gagnant,
      dealerIndex: nextDealerIndex,
      startingPlayerIndex,
    };
  }
}

