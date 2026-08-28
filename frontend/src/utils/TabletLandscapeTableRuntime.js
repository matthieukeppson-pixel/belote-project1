/*
 * TABLETTE PAYSAGE — MOTEUR DE DIMENSIONNEMENT TABLE
 *
 * Ce module ne modifie aucun composant React.
 * Il calcule uniquement trois variables CSS lorsque l'écran
 * correspond à une tablette tactile paysage.
 *
 * Ordinateur et téléphone n'utilisent jamais ces variables.
 */

const TABLET_LANDSCAPE_QUERY = [
  "(hover: none)",
  "(pointer: coarse)",
  "(orientation: landscape)",
  "(min-width: 900px)",
  "(max-width: 1500px)",
  "(min-height: 550px)",
  "(max-height: 1100px)",
  "(max-aspect-ratio: 9/5)",
].join(" and ");

const TABLE_REFERENCE_SIZE = 720;

function clearTabletTableVariables() {
  const root = document.documentElement;

  root.style.removeProperty("--bea-tablet-board-size");
  root.style.removeProperty("--bea-tablet-board-scale");
  root.style.removeProperty("--bea-tablet-chat-width");
  root.style.removeProperty("--bea-tablet-top-rail");
}

function updateTabletTableVariables() {
  const media = window.matchMedia(TABLET_LANDSCAPE_QUERY);

  if (!media.matches) {
    clearTabletTableVariables();
    return;
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  /*
   * Bande supérieure réservée aux commandes.
   * Elle empêche score / bots / mode de sortir du viewport.
   */
  const topRail = 84;

  const horizontalPadding = 16;
  const layoutGap = 10;
  const bottomPadding = 10;

  /*
   * Le tchat reste utilisable au doigt mais ne mange jamais
   * toute la largeur du plateau.
   */
  const chatWidth = Math.max(
    250,
    Math.min(330, viewportWidth * 0.28)
  );

  const availableByHeight =
    viewportHeight - topRail - bottomPadding;

  const availableByWidth =
    viewportWidth -
    horizontalPadding -
    layoutGap -
    chatWidth;

  /*
   * Taille visuelle du plateau :
   * - maximum confortable : 620 px
   * - descend naturellement avec la hauteur disponible
   * - aucun seuil brutal entre 600 et 599 px
   */
  const boardSize = Math.max(
    400,
    Math.min(
      620,
      availableByHeight,
      availableByWidth
    )
  );

  const boardScale =
    boardSize / TABLE_REFERENCE_SIZE;

  const root = document.documentElement;

  root.style.setProperty(
    "--bea-tablet-board-size",
    `${boardSize.toFixed(2)}px`
  );

  root.style.setProperty(
    "--bea-tablet-board-scale",
    boardScale.toFixed(6)
  );

  root.style.setProperty(
    "--bea-tablet-chat-width",
    `${chatWidth.toFixed(2)}px`
  );

  root.style.setProperty(
    "--bea-tablet-top-rail",
    `${topRail}px`
  );
}

let resizeFrame = null;

function scheduleTabletTableUpdate() {
  if (resizeFrame !== null) {
    cancelAnimationFrame(resizeFrame);
  }

  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = null;
    updateTabletTableVariables();
  });
}

if (typeof window !== "undefined") {
  updateTabletTableVariables();

  window.addEventListener(
    "resize",
    scheduleTabletTableUpdate,
    { passive: true }
  );

  window.addEventListener(
    "orientationchange",
    scheduleTabletTableUpdate,
    { passive: true }
  );
}
