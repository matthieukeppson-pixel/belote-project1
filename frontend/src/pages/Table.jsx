import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";

import TableChat from "../components/TableChat";
import "../styles/Table.css";

import { createInitialGameState, dispatch, STATES } from "../game/beloteEngine";
import Partie from "../game/Partie";

// ============================================
// HELPERS ATTOUT — UI TABLE UNIQUEMENT
// ============================================

const ALL_SUITS = ["hearts", "diamonds", "clubs", "spades"];
const BID_VALUES = [80, 90, 100, 110, 120, 130, 140, 150, 160, 500];

function suitLabel(suit) {
  switch (suit) {
    case "hearts":
      return "♥";
    case "diamonds":
      return "♦";
    case "clubs":
      return "♣";
    case "spades":
      return "♠";
    default:
      return "";
  }
}


// ============================================
// UI — SYMBOLE ATOUT
// ============================================
function atoutSymbol(atout) {
  switch (atout) {
    case "hearts":
      return "♥";
    case "diamonds":
      return "♦";
    case "clubs":
      return "♣";
    case "spades":
      return "♠";
    case "SA":
      return "SA";
    case "TA":
      return "TA";
    default:
      return "";
  }
}

function cardImgSrc(card) {
  if (!card) return "";
  const suit = String(card.suit);
  const value = String(card.value).toUpperCase();
  return `/cards/${suit}/${value}.png`;
}

const SUIT_RANK = { hearts: 0, spades: 1, diamonds: 2, clubs: 3 };
const VALUE_RANK = { "7": 0, "8": 1, "9": 2, "10": 3, J: 4, Q: 5, K: 6, A: 7 };

function compareCards(a, b) {
  const sa = SUIT_RANK[a.suit] ?? 99;
  const sb = SUIT_RANK[b.suit] ?? 99;
  if (sa !== sb) return sa - sb;

  const va = VALUE_RANK[String(a.value).toUpperCase()] ?? 99;
  const vb = VALUE_RANK[String(b.value).toUpperCase()] ?? 99;
  return va - vb;
}
const RED_SUITS = ["hearts", "diamonds"];
const BLACK_SUITS = ["spades", "clubs"];

function sortCardsWithinSuit(cards) {
  return [...cards].sort(compareCards);
}

function sortHandForDisplay(cards) {
  const cleanCards = [...cards].filter(Boolean);

  const bySuit = {
    hearts: [],
    spades: [],
    diamonds: [],
    clubs: [],
  };

  for (const card of cleanCards) {
    if (bySuit[card.suit]) {
      bySuit[card.suit].push(card);
    }
  }

  Object.keys(bySuit).forEach((suit) => {
    bySuit[suit] = sortCardsWithinSuit(bySuit[suit]);
  });

  const redQueue = ["hearts", "diamonds"].filter((suit) => bySuit[suit].length > 0);
  const blackQueue = ["spades", "clubs"].filter((suit) => bySuit[suit].length > 0);

  const orderedSuits = [];

  const startWithRed = redQueue.length >= blackQueue.length;

  let useRed = startWithRed;

  while (redQueue.length > 0 || blackQueue.length > 0) {
    if (useRed) {
      if (redQueue.length > 0) {
        orderedSuits.push(redQueue.shift());
      } else if (blackQueue.length > 0) {
        orderedSuits.push(blackQueue.shift());
      }
    } else {
      if (blackQueue.length > 0) {
        orderedSuits.push(blackQueue.shift());
      } else if (redQueue.length > 0) {
        orderedSuits.push(redQueue.shift());
      }
    }

    useRed = !useRed;
  }

  return orderedSuits.flatMap((suit) => bySuit[suit]);
}
const TABLE_CHAT_EMOJIS = {
  ":coeur:": "/emojis/coeur.png",
  ":cool:": "/emojis/cool.png",
  ":langue:": "/emojis/langue.png",
  ":pouce:": "/emojis/pouce.png",
  ":reflexion:": "/emojis/reflexion.png",
  ":sourire:": "/emojis/sourire.png",
};
const LOCAL_PLAYER_ID = "joueur1";
const LEFT_PLAYER_ID = "joueur4";
const TOP_PLAYER_ID = "joueur2";
const RIGHT_PLAYER_ID = "joueur3";

const LOCAL_TABLE_PLAYERS = [
  LOCAL_PLAYER_ID,
  LEFT_PLAYER_ID,
  TOP_PLAYER_ID,
  RIGHT_PLAYER_ID,
];

const SEAT_INDEX_TO_LOGICAL_PLAYER = [
  TOP_PLAYER_ID,
  LEFT_PLAYER_ID,
  RIGHT_PLAYER_ID,
  LOCAL_PLAYER_ID,
];

const TABLE_POSITIONS = ["top", "left", "right", "bottom"];
const UNSEATED_POSITION_TO_SEAT_INDEX = {
  top: 0,
  left: 1,
  right: 2,
  bottom: 3,
};


function _getTableChatEmojiSrc(text) {
  const clean = String(text || "").trim().toLowerCase();
  return TABLE_CHAT_EMOJIS[clean] || null;
}
export default function Table() {

  const navigate = useNavigate();
  const location = useLocation();
  const mode = location.state?.mode || "classic";
const modeLabel =
  mode === "contree" ? "Contrée" :
  mode === "moderne" ? "Moderne" :
  "Classique";
  const { id } = useParams();
  const tableId = Number(id);

const pseudo =
  location.state?.pseudo ||
  localStorage.getItem("pseudo") ||
  JSON.parse(localStorage.getItem("user") || "{}").pseudo ||
  "Joueur";

const avatar =
  location.state?.avatar ||
  localStorage.getItem("profile_photo_local") ||
  "/avatar_blue.png";

const wsTableRef = useRef(null);
const systemTimersRef = useRef(new Map());
const previousBiddingStateRef = useRef(null);

const [_tableSnapshot, setTableSnapshot] = useState(null);
const [tableChatMessages, setTableChatMessages] = useState([]);

function sendTableMessage(text) {
  const clean = String(text || "").trim();
  if (!clean) return;

  const ws = wsTableRef.current;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  ws.send(
    JSON.stringify({
      type: "table_message",
      text: clean,
    })
  );
}
function _chooseSeat(seatIndex) {
  pushTemporarySystemMessage(`Clic sur place ${seatIndex + 1}`);

  const ws = wsTableRef.current;
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    pushTemporarySystemMessage("Connexion WS non ouverte");
    return;
  }

  ws.send(
    JSON.stringify({
      type: "choose_seat",
      tableId,
      seatIndex,
    })
  );

  pushTemporarySystemMessage(`Demande envoyée pour place ${seatIndex + 1}`);
}

function pushTemporarySystemMessage(text) {
  const id = `${Date.now()}-${Math.random()}`;

  setTableChatMessages((prev) => [
    ...prev,
    {
      id,
      type: "system",
      text,
    },
  ]);

  const timer = setTimeout(() => {
    setTableChatMessages((prev) => prev.filter((msg) => msg.id !== id));
    systemTimersRef.current.delete(id);
  }, 3000);

  systemTimersRef.current.set(id, timer);
}
const seatsInfo =
  Array.isArray(_tableSnapshot?.seatsInfo) && _tableSnapshot.seatsInfo.length > 0
    ? _tableSnapshot.seatsInfo
    : Array.isArray(_tableSnapshot?.seats)
      ? _tableSnapshot.seats.map((name) =>
          name
            ? {
                name,
                avatar: name === pseudo ? avatar : "/avatar.png",
              }
            : null
        )
      : [];

const mySeatIndex = seatsInfo.findIndex(
  (seat) => seat?.name === pseudo
);
const humanSeatIndices = seatsInfo.reduce((acc, seat, index) => {
  if (seat?.name && !seat?.isBot) acc.push(index);
  return acc;
}, []);

const primaryHumanSeatIndex = humanSeatIndices[0] ?? -1;
const isPrimaryTableDriver =
  mySeatIndex !== -1 && mySeatIndex === primaryHumanSeatIndex;

// POSITION DE RENDU LOCALE
// - bottom / left / top / right = vue du joueur local
// - ce n'est pas le siège réel serveur
// - le joueur local reste toujours affiché en bas
function seatIndexForPosition(position) {
  if (mySeatIndex === -1) {
    return UNSEATED_POSITION_TO_SEAT_INDEX[position] ?? null;
  }

  if (position === "bottom") return mySeatIndex;
  if (position === "left") return (mySeatIndex + 1) % 4;
  if (position === "top") return (mySeatIndex + 2) % 4;
  if (position === "right") return (mySeatIndex + 3) % 4;

  return null;
}

function displayedPlayerIdForSeatIndex(seatIndex) {
  if (seatIndex == null) return null;
  return SEAT_INDEX_TO_LOGICAL_PLAYER[seatIndex] || null;
}

function displayedPlayerIdForPosition(position) {
  return displayedPlayerIdForSeatIndex(seatIndexForPosition(position));
}
function seatInfoForLogicalPlayerId(playerId) {
  const seatIndex = seatsInfo.findIndex(
    (_seat, index) => displayedPlayerIdForSeatIndex(index) === playerId
  );
  if (seatIndex === -1) return null;
  return seatsInfo[seatIndex] || null;
}
function pliClassForPlayerId(playerId) {
  if (!playerId) return "";

  if (playerId === displayedPlayerIdForPosition("bottom")) return "pli-joueur1";
  if (playerId === displayedPlayerIdForPosition("top")) return "pli-joueur2";
  if (playerId === displayedPlayerIdForPosition("right")) return "pli-joueur3";
  if (playerId === displayedPlayerIdForPosition("left")) return "pli-joueur4";

  return "";
}
function seatForPosition(position) {
  const idx = seatIndexForPosition(position);
  if (idx == null) return null;
  return seatsInfo[idx] || null;
}

function seatAvatarForPosition(position) {
  const seat = seatForPosition(position);

  if (position === "bottom" && mySeatIndex !== -1) {
    return seat?.avatar || avatar;
  }

  return seat?.avatar || "/avatar.png";
}

function seatNameForPosition(position) {
  const seat = seatForPosition(position);

  if (position === "bottom" && mySeatIndex !== -1) {
    return seat?.name || pseudo;
  }

  return seat?.name || "Place libre";
}

function canChoosePosition(position) {
  const idx = seatIndexForPosition(position);
  if (idx == null) return false;
  if (idx === mySeatIndex) return false;

  const seat = seatForPosition(position);
  return !seat?.name || seat?.isBot;
}
useEffect(() => {
  if (!tableId) return;

  setTableChatMessages([]);

  let isCancelled = false;

  const ws = new WebSocket("ws://localhost:4000");
  wsTableRef.current = ws;

  ws.onopen = () => {
   if (isCancelled) {
  try {
    ws.close(1000, "cancelled");
  } catch (e) {
    if (import.meta.env.DEV) console.warn("WS cancelled close error", e);
  }
  return;
}

    ws.send(JSON.stringify({ type: "join_salon", pseudo, avatar }));
    ws.send(JSON.stringify({ type: "join_table", tableId }));
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === "tables" && Array.isArray(msg.tables)) {
        const found = msg.tables.find((t) => Number(t.id) === tableId) || null;
        setTableSnapshot(found);
        return;
      }

      if (msg.type === "table_game_action" && Number(msg.tableId) === Number(tableId)) {
        if (!msg.action || typeof msg.action.type !== "string") return;

        setGame((g) => dispatch(g, msg.action));
        return;
      }

      if (msg.type === "table_system" && Number(msg.tableId) === Number(tableId)) {
        pushTemporarySystemMessage(msg.text);
        return;
      }

      if (msg.type === "choose_seat_denied" && Number(msg.tableId) === Number(tableId)) {
        if (msg.reason === "SEAT_TAKEN") {
          pushTemporarySystemMessage("Cette place est déjà prise");
        } else if (msg.reason === "INVALID_SEAT") {
          pushTemporarySystemMessage("Place invalide");
        } else {
          pushTemporarySystemMessage("Impossible de choisir cette place");
        }
        return;
      }

      if (msg.type === "table_message" && Number(msg.tableId) === Number(tableId)) {
        setTableChatMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random()}`,
            type: "chat",
            author: msg.user,
            text: msg.text,
            from: msg.user === pseudo ? "me" : "other",
          },
        ]);
      }
    } catch (e) {
      if (import.meta.env.DEV) console.warn("WS message parse error", e);
    }
  };

  return () => {
    isCancelled = true;

    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;

    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, "cleanup");
      }
    } catch (e) {
      if (import.meta.env.DEV) console.warn("WS cleanup error", e);
    }

    if (wsTableRef.current === ws) wsTableRef.current = null;
  };
}, [tableId, pseudo, avatar]);

  const [bidValue, setBidValue] = useState(80);
  const [, setScoreDebug] = useState(null);

  // ============================================
  // PARTIE (présente mais non pilotante)
  // ============================================
  const partieRef = useRef(null);

  // 🔒 CADENAS : empêche de compter deux fois une fin de manche
  const finDeMancheCompteeRef = useRef(false);
  const finDeMancheRef = useRef(null);

  useEffect(() => {
    if (partieRef.current === null) {
      const targetScore = mode === "contree" ? 1500 : 500;

      partieRef.current = new Partie({
       players: [...LOCAL_TABLE_PLAYERS],
        targetScore,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================
  // GAME STATE
  // ============================================
const buildFreshLocalGame = useCallback((overrides = {}) => {
  let g = createInitialGameState();

  g = {
    ...g,
    ruleset: mode,
    contratMultiplicateur: 1,
    contratValeur: null,
    players: [...LOCAL_TABLE_PLAYERS],
    dealSeed: _tableSnapshot?.game?.hand?.dealSeed || null,
    ...overrides,
  };

  g = dispatch(g, { type: "TABLE_READY" });
  g = dispatch(g, { type: "DISTRIBUTE_CARDS" });
  g = dispatch(g, { type: "DISTRIBUTE_CARDS" });

  return g;
}, [mode, _tableSnapshot?.game?.hand?.dealSeed]);

const [game, setGame] = useState(() => buildFreshLocalGame());


const serverHand = _tableSnapshot?.game?.hand || null;

const localPhaseLabel = game?.state || "UNKNOWN";
const serverPhaseLabel = serverHand?.phase || "none";

const serverTurnSeatIndex =
  typeof serverHand?.currentTurnSeatIndex === "number"
    ? serverHand.currentTurnSeatIndex
    : null;

const serverTurnPlayerId = displayedPlayerIdForSeatIndex(serverTurnSeatIndex);
const serverTurnSeatInfo =
  serverTurnSeatIndex != null ? seatsInfo[serverTurnSeatIndex] || null : null;

const isServerTurnBot = !!serverTurnSeatInfo?.isBot;
const isServerBiddingPhase =
  game?.state === STATES.ENCHERES ||
  game?.state === STATES.ANNOUNCE_ATOUT_TOUR_1 ||
  game?.state === STATES.ANNOUNCE_ATOUT_TOUR_2 ||
  game?.state === STATES.ANNONCES_MODERNE;

const showServerBiddingHint =
  (mode === "classic" || mode === "moderne") && isServerBiddingPhase;

const sharedRoundId = serverHand?.roundId || "none";
const sharedDealSeed = serverHand?.dealSeed || "none";

useEffect(() => {
  if (!sharedDealSeed || sharedDealSeed === "none") return;
  if (game.dealSeed === sharedDealSeed) return;

  setDisplayPli([]);
  setHideLastPli(false);

  finDeMancheCompteeRef.current = false;
  finDeMancheRef.current = null;

  setGame((currentGame) => {
    if (currentGame.dealSeed === sharedDealSeed) return currentGame;

    return buildFreshLocalGame({
      dealSeed: sharedDealSeed,
    });
  });
}, [sharedDealSeed, game.dealSeed, buildFreshLocalGame]);
  // ============================================
  // UI STATES
  // ============================================
  const [displayPli, setDisplayPli] = useState([]);
  const [hideLastPli, setHideLastPli] = useState(false);
  const [beloteToast, setBeloteToast] = useState(null);

const [scorePartie, setScorePartie] = useState({ nous: 0, eux: 0 });
const [partieTerminee, setPartieTerminee] = useState(false);
const [visibleAnnouncement, setVisibleAnnouncement] = useState(null);
const [announcementFading, setAnnouncementFading] = useState(false);

  function handleNouvellePartie() {
    setDisplayPli([]);
    setHideLastPli(false);

    finDeMancheCompteeRef.current = false;
    finDeMancheRef.current = null;

    const targetScore = mode === "contree" ? 1500 : 500;
    partieRef.current = new Partie({
      players: game.players,
      targetScore,
    });

    setScorePartie({ nous: 0, eux: 0 });
    setPartieTerminee(false);

      setGame(buildFreshLocalGame());
  }

 useEffect(() => {
  if (mode !== "contree") return;
  if (!isServerBiddingPhase) return;
  if (game.state !== STATES.ENCHERES) return;
  if (game.currentBid) return;

  setBidValue(80);
}, [mode, isServerBiddingPhase, game.state, game.currentBid]);

  useEffect(() => {
    const s = game?.belote?.state;
    if (!s || s === "NONE") return;

    if (s === "BELOTE") {
      setBeloteToast({ text: `Belote ! (${game.belote.joueur})`, ts: Date.now() });
    } else if (s === "REBELOTE") {
      setBeloteToast({ text: `Rebelote ! (${game.belote.joueur})`, ts: Date.now() });
    }

    const t = setTimeout(() => setBeloteToast(null), 1200);
    return () => clearTimeout(t);
  }, [game?.belote?.state, game?.belote?.joueur]);

  // ============================================
  // AFFICHAGE DU PLI
  // ============================================
  useEffect(() => {
    if (game.pli.length > 0) {
      const showTimer = setTimeout(() => {
        setHideLastPli(false);
        setDisplayPli(game.pli);
      }, 0);

      return () => clearTimeout(showTimer);
    }

    if (game.pli.length === 0 && displayPli.length > 0) {
      const hideTimer = setTimeout(() => {
        setDisplayPli([]);
      }, 700);

      return () => clearTimeout(hideTimer);
    }
  }, [game.pli, displayPli]);

  // ============================================
  // FIN DE MANCHE — CALCUL PARTIE
  // ============================================
  useEffect(() => {
    if (game.state !== STATES.FIN_DE_MANCHE) return;
    if (!partieRef.current) return;

    if (finDeMancheCompteeRef.current) return;
    finDeMancheCompteeRef.current = true;

    if (!game.finDeManche) {
      console.warn("FIN_DE_MANCHE sans game.finDeManche -> abort (évite score faux)");
      return;
    }

    const finDeMancheSafe = {
      scoreFinal: game.scoreManche ?? { nous: 0, eux: 0 },
      contratValeur: game.contratValeur ?? null,
      contratMultiplicateur: game.contratMultiplicateur || 1,
      ruleset: game.ruleset ?? mode,
      preneur: game.preneur ?? null,
      atout: game.atout ?? null,
      ...game.finDeManche,
    };

   console.log("FIN MANCHE (finDeMancheSafe)", finDeMancheSafe);

   if (import.meta.env.DEV) {
  const sf = finDeMancheSafe.scoreFinal || { nous: 0, eux: 0 };
  const total = (sf.nous || 0) + (sf.eux || 0);

  const ruleset = finDeMancheSafe.ruleset;
  const atout = finDeMancheSafe.atout;

  const contrat = finDeMancheSafe.contratValeur || 0;
  const multLocal = finDeMancheSafe.contratMultiplicateur || 1;

  let ok = true;

  if (ruleset === "moderne") {
    const base = atout === "TA" ? 258 : 162;
    const announcePoints = (game.modernAnnouncements?.validated || []).reduce(
      (sum, ann) => sum + (ann?.points || 0),
      0
    );
    const beloteBonus = game?.belote?.state === "REBELOTE" ? 20 : 0;

    ok = total === base + announcePoints + beloteBonus;
  } else if (ruleset === "classic") {
    ok = total === 162 || total === 182;
  } else if (ruleset === "contree") {
    const base = 162 + contrat * multLocal;
    ok = total === base || total === base + 20;
  }

  if (!ok) {
    setScoreDebug(
      `⚠️ Score incohérent: total=${total} ruleset=${ruleset} atout=${atout} contrat=${contrat} mult=${multLocal}`
    );
  } else {
    setScoreDebug(null);
  }
}

    const next = partieRef.current.onFinDeManche({
      dealerIndex: game.dealerIndex,
      finDeManche: finDeMancheSafe,
    });

    finDeMancheRef.current = next;

    if (next?.scorePartie) setScorePartie(next.scorePartie);
    if (next?.partieTerminee) setPartieTerminee(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.state]);

  // ============================================
  // FIN DE MANCHE — VISUEL (dernier pli)
  // ============================================
  useEffect(() => {
    if (game.state !== STATES.FIN_DE_MANCHE) return;

    const timer = setTimeout(() => {
      setHideLastPli(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, [game.state]);

  // ============================================
  // RELANCE DE MANCHE (APRÈS VISUEL)
  // ============================================
  useEffect(() => {
    if (game.state !== STATES.FIN_DE_MANCHE) return;

    const timer = setTimeout(() => {
      const next = finDeMancheRef.current;
      if (!next || next.partieTerminee) return;

      setDisplayPli([]);
      setHideLastPli(false);

      finDeMancheCompteeRef.current = false;
      finDeMancheRef.current = null;

           setGame(
        buildFreshLocalGame({
          dealerIndex: next.dealerIndex,
          currentPlayerIndex: next.startingPlayerIndex,
        })
      );
    }, 1600);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.state]);

  // ============================================
  // FIN DE PLI
  // ============================================
  useEffect(() => {
    if (game.state !== STATES.PLI_TERMINE) return;

    const timer = setTimeout(() => {
      setDisplayPli([]);
      setHideLastPli(false);
      setGame((g) => dispatch(g, { type: "NEXT_PLI" }));
    }, 800);

    return () => clearTimeout(timer);
  }, [game.state]);

  // ============================================
  // ACTIONS
  // ============================================
const sendTableGameAction = useCallback((action) => {
  const ws = wsTableRef.current;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (!tableId) return;
  if (!sharedRoundId) return;

  ws.send(
    JSON.stringify({
      type: "table_game_action",
      tableId,
      roundId: sharedRoundId,
      action,
    })
  );
}, [tableId, sharedRoundId]);

function handleTakeAtout() {
  if (!isServerBiddingPhase) return;
  if (!isServerLocalTurn) return;
  sendTableGameAction({ type: "TAKE_ATOUT" });
}

function handlePass() {
  if (!isServerBiddingPhase) return;
  if (!isServerLocalTurn) return;
  sendTableGameAction({ type: "PASS" });
}

 function handlePassAnnouncement() {
  if (!isServerBiddingPhase) return;
  setGame((g) => dispatch(g, { type: "PASS_ANNOUNCEMENT" }));
}

  function handleDeclareAnnouncement(announcement) {
  if (!isServerBiddingPhase) return;
  if (!announcement) return;

  setGame((g) =>
    dispatch(g, {
      type: "DECLARE_ANNOUNCEMENT",
      announcementType: announcement.type,
      highRank: announcement.highRank,
      suit: announcement.suit || null,
    })
  );
}

 function handleContre() {
  if (!isServerBiddingPhase) return;
  setGame((g) => dispatch(g, { type: "CONTRE" }));
}

  function handleSurContre() {
  if (!isServerBiddingPhase) return;
  setGame((g) => dispatch(g, { type: "SURCONTRE" }));
}
function handleBidSuit(suit) {
  if (!isServerBiddingPhase) return;
  setGame((g) => dispatch(g, { type: "BID", value: bidValue, suit }));
}
function handleTakeAtoutSuit(suit) {
  if (!isServerBiddingPhase) return;
  if (!isLocalTurn) return;
  sendTableGameAction({ type: "TAKE_ATOUT", suit });
}
  function handlePlayCard(card) {
    const cardKey = `${card.suit}:${String(card.value).toUpperCase()}`;
    setGame((g) => dispatch(g, { type: "PLAY_CARD", cardKey }));
  }

const activePlayer = game.players[game.currentPlayerIndex];
const localDisplayedPlayerId = displayedPlayerIdForPosition("bottom");
const isLocalTurn = activePlayer === localDisplayedPlayerId;
const isServerLocalTurn =
  serverTurnSeatIndex != null
    ? mySeatIndex === serverTurnSeatIndex
    : isLocalTurn;
const activeSeatInfo = seatInfoForLogicalPlayerId(activePlayer);
const _isActiveBot = !!activeSeatInfo?.isBot;
const currentAnnouncements =
  game.modernAnnouncements?.detectedByPlayer?.[activePlayer] || [];


 const scoreUI = scorePartie;
const shouldShowPli = !(game.state === STATES.FIN_DE_MANCHE && hideLastPli);
const localHand =
  (localDisplayedPlayerId && game.hands[localDisplayedPlayerId]) || [];
const actorId = game.players[game.currentPlayerIndex];
const preneurId = game.currentBid ? game.players[game.currentBid.playerIndex] : null;

  const actorTeam = game.teams.nous.includes(actorId) ? "nous" : "eux";
  const preneurTeam = preneurId && game.teams.nous.includes(preneurId) ? "nous" : "eux";

const mult = game.contratMultiplicateur || 1;

const bestValidatedAnnouncement =
  mode === "moderne"
    ? (game.modernAnnouncements?.validated || [])[0] || null
    : null;

const showModernAnnouncementPanel =
  mode === "moderne" &&
  game.state === STATES.ANNONCES_MODERNE &&
  isServerBiddingPhase &&
  activePlayer === "joueur1" &&
  currentAnnouncements.length > 0;
useEffect(() => {
 if (mode !== "moderne") {
  setVisibleAnnouncement(null);
  setAnnouncementFading(false);
  return;
}

if (!isServerBiddingPhase) {
  setVisibleAnnouncement(null);
  setAnnouncementFading(false);
  return;
}

if (!bestValidatedAnnouncement) return;

  setVisibleAnnouncement(bestValidatedAnnouncement);
  setAnnouncementFading(false);

  const fadeTimer = setTimeout(() => {
    setAnnouncementFading(true);
  }, 1700);

  const hideTimer = setTimeout(() => {
    setVisibleAnnouncement(null);
    setAnnouncementFading(false);
  }, 2000);

  return () => {
    clearTimeout(fadeTimer);
    clearTimeout(hideTimer);
  };
}, [mode, isServerBiddingPhase, bestValidatedAnnouncement]);

useEffect(() => {
  if (mode !== "moderne") return;
   if (!isServerBiddingPhase) return;
  if (game.state !== STATES.ANNONCES_MODERNE) return;

  const timer = setTimeout(() => {
    setGame((g) => {
      if (g.state !== STATES.ANNONCES_MODERNE) return g;

      const active = g.players[g.currentPlayerIndex];
      const declaredByPlayer = g.modernAnnouncements?.declaredByPlayer || {};
      const alreadyAnswered = Object.prototype.hasOwnProperty.call(
        declaredByPlayer,
        active
      );

      if (alreadyAnswered) return g;

      const detected =
        g.modernAnnouncements?.detectedByPlayer?.[active] || [];

       if (active === LOCAL_PLAYER_ID) {
        if (detected.length > 0) return g;
        return dispatch(g, { type: "PASS_ANNOUNCEMENT" });
      }

      if (!import.meta.env.DEV) return g;

      const best = detected[0] || null;

      if (best) {
        return dispatch(g, {
          type: "DECLARE_ANNOUNCEMENT",
          announcementType: best.type,
          highRank: best.highRank,
          suit: best.suit || null,
        });
      }

      return dispatch(g, { type: "PASS_ANNOUNCEMENT" });
    });
  }, 350);

  return () => clearTimeout(timer);
}, [mode, isServerBiddingPhase, game.state, game.currentPlayerIndex, game.modernAnnouncements, game.atout]);
useEffect(() => {
  const previousState = previousBiddingStateRef.current;

  if (
    isPrimaryTableDriver &&
    previousState === STATES.ANNOUNCE_ATOUT_TOUR_2 &&
    game.state === STATES.ANNOUNCE_ATOUT_TOUR_1 &&
    sharedDealSeed === game.dealSeed
  ) {
    sendTableGameAction({ type: "RESET_ROUND" });
  }

  previousBiddingStateRef.current = game.state;
}, [
  game.state,
  game.dealSeed,
  sharedDealSeed,
  isPrimaryTableDriver,
  sendTableGameAction,
]);

useEffect(() => {
  if (!isPrimaryTableDriver) return;
  if (
    serverPhaseLabel !== STATES.ANNOUNCE_ATOUT_TOUR_1 &&
    serverPhaseLabel !== STATES.ANNOUNCE_ATOUT_TOUR_2
  ) return;
  if (!isServerTurnBot) return;

  const timer = setTimeout(() => {
    sendTableGameAction({ type: "PASS" });
  }, 500);

  return () => clearTimeout(timer);
}, [
  isPrimaryTableDriver,
  serverPhaseLabel,
  serverTurnSeatIndex,
  isServerTurnBot,
  sendTableGameAction,
]);

useEffect(() => {
  if (!import.meta.env.DEV) return;
  if (game.state !== STATES.PLI_EN_COURS) return;
  if (!localDisplayedPlayerId) return;
  if (activePlayer === localDisplayedPlayerId) return;
  if (visibleAnnouncement) return;

  const timer = setTimeout(() => {
    setGame((g) => {
      if (g.state !== STATES.PLI_EN_COURS) return g;

      const active = g.players[g.currentPlayerIndex];
      if (active === localDisplayedPlayerId) return g;

      const hand = g.hands[active];
      if (!hand || hand.length === 0) return g;

      for (const card of hand) {
        const cardKey = `${card.suit}:${String(card.value).toUpperCase()}`;
        const next = dispatch(g, { type: "PLAY_CARD", cardKey });

        if (next !== g) {
          sendTableGameAction({ type: "PLAY_CARD", cardKey });
          return g;
        }
      }

      return g;
    });
  }, 900);

  return () => clearTimeout(timer);
}, [
  game.state,
  activePlayer,
  game.players,
  game.currentPlayerIndex,
  visibleAnnouncement,
  localDisplayedPlayerId,
  sendTableGameAction,
]);

  

 function backToSalon() {
  const ws = wsTableRef.current;
  if (ws && ws.readyState === WebSocket.OPEN && tableId) {
    ws.send(JSON.stringify({ type: "leave_table", tableId }));
    ws.close(1000, "leave");
  }
  navigate("/salon");
}

  // ============================================
  // RENDER
  // ============================================
  return (
    <div
      className="table-page"
      data-mode={mode}
      data-state={game.state}
      style={{ position: "relative" }}
    >
      <button className="table-back-btn" onClick={backToSalon}>
        ← Retour au salon
      </button>
<div className="table-mode-pill">Mode : {modeLabel}</div>
<div
  style={{
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 30,
    background: "rgba(0,0,0,0.55)",
    color: "#fff",
    padding: "6px 10px",
    borderRadius: 10,
    fontWeight: 700,
  }}
>
  <div>Phase locale : {localPhaseLabel}</div>
  <div>Phase serveur : {serverPhaseLabel}</div>
  <div>Ma place : {mySeatIndex === -1 ? "none" : mySeatIndex + 1}</div>
  <div>Tour serveur : {serverTurnSeatIndex == null ? "none" : serverTurnSeatIndex + 1}</div>
  <div>Joueur serveur : {serverTurnPlayerId || "none"}</div>
  <div>Primary driver : {isPrimaryTableDriver ? "yes" : "no"}</div>
<div>Server turn bot : {isServerTurnBot ? "yes" : "no"}</div>
  <div>Top seat : {seatIndexForPosition("top") == null ? "none" : seatIndexForPosition("top") + 1}</div>
<div>Left seat : {seatIndexForPosition("left") == null ? "none" : seatIndexForPosition("left") + 1}</div>
<div>Right seat : {seatIndexForPosition("right") == null ? "none" : seatIndexForPosition("right") + 1}</div>
<div>Bottom seat : {seatIndexForPosition("bottom") == null ? "none" : seatIndexForPosition("bottom") + 1}</div>
  <div>Round : {sharedRoundId}</div>
  <div>Seed : {sharedDealSeed}</div>
</div>




      <div className="table-layout">
        <div className="table-zone">
          <div className="table-board">
            <div className="table-image" />

            {beloteToast && (
              <div
                style={{
                  position: "absolute",
                  top: 90,
                  right: 120,
                  zIndex: 9999,
                  padding: "8px 14px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.12)",
                  backdropFilter: "blur(6px)",
                  border: "1px solid rgba(255,255,255,0.22)",
                  color: "#fff",
                  fontWeight: 800,
                }}
              >
                {beloteToast.text}
              </div>
            )}

 {mode === "contree" &&
  game.state === STATES.ENCHERES &&
  isServerBiddingPhase && (
  <div
    className="atout-panel"
    style={{
      position: "absolute",
      left: "50%",
      bottom: 245,
      top: "auto",
      transform: "translateX(-50%)",
      width: 500,
      padding: "14px 18px 12px",
      background: "linear-gradient(180deg, #7a0b27 0%, #5f081e 100%)",
      backdropFilter: "none",
      border: "1px solid rgba(255,255,255,0.10)",
      boxShadow: "0 10px 22px rgba(0,0,0,0.16)",
    }}
  >
    <div className="atout-title" style={{ marginBottom: 8 }}>
      Enchères (Contrée)
    </div>

    {game.currentBid ? (
      <>
        <div
          style={{
            marginBottom: 10,
            textAlign: "center",
            fontWeight: 800,
          }}
        >
          Contrat actuel : {game.currentBid.value} {atoutSymbol(game.currentBid.suit)} · x
          {game.contratMultiplicateur || 1}
        </div>

        <div
          className="atout-actions"
          style={{ marginBottom: 10, justifyContent: "center", gap: 10 }}
        >
<button
  className="atout-btn take contree-btn"
  style={{
    background: mult >= 2 ? "#7c1f2d" : "#6f1620",
    border:
      mult >= 2
        ? "2px solid rgba(255,255,255,0.22)"
        : "1px solid rgba(255,255,255,0.08)",
    color: "#fff",
    boxShadow:
      mult >= 2
        ? "inset 0 0 0 1px rgba(255,255,255,0.06)"
        : "none",
    opacity:
      mult >= 2
        ? 1
        : (!game.currentBid || actorTeam === preneurTeam ? 0.55 : 1),
  }}
  onClick={handleContre}
 disabled={!isServerBiddingPhase || !game.currentBid || mult !== 1 || actorTeam === preneurTeam}
>
  Contrer
</button>

<button
  className="atout-btn take contree-btn"
  style={{
    background: mult >= 4 ? "#7c1f2d" : "#6f1620",
    border:
      mult >= 4
        ? "2px solid rgba(255,255,255,0.22)"
        : "1px solid rgba(255,255,255,0.08)",
    color: "#fff",
    boxShadow:
      mult >= 4
        ? "inset 0 0 0 1px rgba(255,255,255,0.06)"
        : "none",
    opacity:
      mult >= 4
        ? 1
        : (!game.currentBid || actorTeam !== preneurTeam ? 0.55 : 1),
  }}
  onClick={handleSurContre}
 disabled={!isServerBiddingPhase || !game.currentBid || mult !== 2 || actorTeam !== preneurTeam}
>
  Surcontrer
</button>
        </div>
      </>
    ) : null}

    <div
      className="atout-actions"
      style={{ gap: 8, flexWrap: "wrap", justifyContent: "center" }}
    >
      {BID_VALUES.map((v) => {
        const min = game.currentBid ? game.currentBid.value + 10 : 80;
        const disabled = v < min;

        return (
          <button
            key={v}
            className="atout-btn take"
            onClick={() => setBidValue(v)}
            disabled={disabled}
            style={{
              opacity: disabled ? 0.45 : 1,
              border:
                bidValue === v ? "2px solid rgba(255,255,255,0.9)" : undefined,
            }}
          >
            {v}
          </button>
        );
      })}
    </div>

    <div
      className="atout-actions"
      style={{ marginTop: 10, justifyContent: "center", gap: 10, flexWrap: "wrap" }}
    >
      {ALL_SUITS.map((suit) => (
<button
  key={suit}
  className="atout-btn take atout-suit-btn"
  onClick={() => handleBidSuit(suit)}
  disabled={!isServerBiddingPhase}
>
        
          <span className={`atout-suit-symbol ${suit}`}>{suitLabel(suit)}</span>
        </button>
      ))}

     <button
  className="atout-btn pass"
  onClick={handlePass}
  disabled={!isServerBiddingPhase}
>
  Passer
</button>
    </div>
  </div>
)}
            
{showModernAnnouncementPanel && (
  <div
    className="atout-panel modern-announcement-panel"
    style={{
      position: "absolute",
      left: "50%",
      bottom: 262,
      top: "auto",
      transform: "translateX(-50%)",
      width: 300,
      padding: "10px 14px",
      background: "rgba(72, 16, 28, 0.88)",
      backdropFilter: "blur(4px)",
      border: "1px solid rgba(255,255,255,0.10)",
      boxShadow: "0 8px 18px rgba(0,0,0,0.18)",
      borderRadius: 16,
      zIndex: 30,
    }}
  >
    <div
      className="atout-title"
      style={{
        marginBottom: 6,
        fontSize: 15,
        lineHeight: 1.1,
      }}
    >
      Annonce
    </div>

    <div
      className="atout-actions"
      style={{
        marginTop: 4,
        justifyContent: "center",
        gap: 10,
      }}
    >
     <button
  className="atout-btn take"
  style={{ minWidth: 96, padding: "8px 12px" }}
  onClick={() => handleDeclareAnnouncement(currentAnnouncements[0])}
  disabled={!isServerBiddingPhase}
>
  Annonce
</button>

     <button
  className="atout-btn pass"
  style={{ minWidth: 96, padding: "8px 12px" }}
  onClick={handlePassAnnouncement}
  disabled={!isServerBiddingPhase}
>
  Passer
</button>
    </div>
  </div>
)}

{mode === "moderne" && isServerBiddingPhase && visibleAnnouncement && (
  <div
style={{
  position: "absolute",
  top: 165,
  left: "50%",
  transform: `translateX(-50%) translateY(${announcementFading ? "-6px" : "0px"})`,
  zIndex: 40,
  pointerEvents: "none",
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-end",
  opacity: announcementFading ? 0 : 1,
  transition: "opacity 0.28s ease, transform 0.28s ease",
}}
  >
    {(visibleAnnouncement.cards || []).map((card, index) => {
      const total = visibleAnnouncement.cards.length;
      const center = (total - 1) / 2;
      const offset = index - center;

      return (
        <img
          key={`${card.suit}-${String(card.value).toUpperCase()}-${index}`}
          src={cardImgSrc(card)}
          alt={`${card.value} ${card.suit}`}
          className="card-img"
          draggable={false}
          style={{
            width: 76,
            height: "auto",
            marginLeft: index === 0 ? 0 : -14,
            transform: `translateY(${Math.abs(offset) * 4}px) rotate(${offset * 5}deg)`,
            boxShadow: "0 6px 14px rgba(0,0,0,0.35)",
            borderRadius: 8,
          }}
        />
      );
    })}
  </div>
)}

{scoreUI && (
              <div className="score-overlay score-pill">
                <span className="score-side">Nous</span>
                <div className="score-pill-box">
                  {scoreUI.nous}
                  <span className="score-sep">–</span>
                  {scoreUI.eux}
                </div>
                <span className="score-side">Eux</span>
              </div>
            )}

            {partieTerminee && (
              <button className="new-game-btn" onClick={handleNouvellePartie}>
                Nouvelle partie
              </button>
            )}

            {shouldShowPli &&
              displayPli.map((play, index) =>
                play?.card ? (
                  <div key={index} className={`pli-card ${pliClassForPlayerId(play.playerId)}`}>
                    <img
                      src={cardImgSrc(play.card)}
                      alt={`${play.card.value} ${play.card.suit}`}
                      className="card-img"
                      draggable={false}
                    />
                  </div>
                ) : null
              )}

{TABLE_POSITIONS.map((position) => {
  const player = displayedPlayerIdForPosition(position);
  const canChooseSeat = canChoosePosition(position);
  const displayedSeatIndex = seatIndexForPosition(position);
  const displayedSeat = seatForPosition(position);
  const displayedSeatAvatar = seatAvatarForPosition(position);
  const displayedSeatName = seatNameForPosition(position);
  const hasDisplayedSeat = !!displayedSeat?.name;
  const displayedHandCount = game.hands[player]?.length ?? 0;
  const visibleBackCards = Math.min(2, displayedHandCount);
  const backCardOverlapStep =
    position === "left" || position === "right" ? 6 : 10;
  const backCardInwardBase =
    position === "left" ? -14 : position === "right" ? 14 : 0;
  const isLocalDisplayedPlayer = position === "bottom";
 const isActiveDisplayedPlayer =
  serverTurnSeatIndex != null
    ? displayedSeatIndex === serverTurnSeatIndex
    : activePlayer === player;
  const isDisplayedTaker = game.atout && game.players[game.preneur] === player;

  return (
    <div
      key={player}
      className={`player-seat ${position} ${isActiveDisplayedPlayer ? "active" : ""}`}
      onClick={
        canChooseSeat
         ? () => _chooseSeat(displayedSeatIndex)
          : undefined
      }
      style={{
        cursor: canChooseSeat ? "pointer" : "default",
        opacity: hasDisplayedSeat ? 1 : 0.92,
      }}
    >
                
                  <img
                   src={displayedSeatAvatar}
                    alt={isLocalDisplayedPlayer ? pseudo || "Avatar" : "Avatar"}
                    className="player-avatar"
                  />

                  <div
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: position === "bottom" ? "100%" : "calc(100% + 6px)",
                      transform: "translateX(-50%)",
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: "rgba(40, 8, 18, 0.78)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 700,
                      lineHeight: 1,
                      whiteSpace: "nowrap",
                      pointerEvents: "none",
                      zIndex: 6,
                      boxShadow: "0 4px 10px rgba(0,0,0,0.18)",
                    }}
                  >
                   {displayedSeatName}
                  </div>

                 {!isLocalDisplayedPlayer && (
                    <div className={`back-cards back-cards-${position}`}>
<div className="back-stack">
  {Array.from({ length: visibleBackCards }).map((_, i) => (
    <img
      key={i}
      src="/card_back.png"
      alt="Dos"
      className="card-back"
      style={{
        transform: `translateX(${backCardInwardBase + i * backCardOverlapStep}px) rotate(${i * 2}deg)`,
      }}
      draggable={false}
    />
  ))}
</div>
                    </div>
                  )}

                 {isActiveDisplayedPlayer && <div className="active-dot" />}

                  {isDisplayedTaker && (
                    <div className={`atout-indicator ${position} ${game.atout}`}>
                      {atoutSymbol(game.atout)}
                    </div>
                  )}
                </div>
              );
            })}

               {localHand.length > 0 && (
  <div className="player-bottom">
    {sortHandForDisplay(localHand).map((card, index) => {
  const total = localHand.length;

      const center = (total - 1) / 2;
      const offset = index - center;

      return (
        <div
          key={`${card.suit}-${String(card.value).toUpperCase()}-${index}`}
          className={`card ${isLocalTurn ? "clickable" : "disabled"}`}
          onClick={isLocalTurn ? () => handlePlayCard(card) : undefined}
          style={{
            transform: `
              translateX(${offset * -28}px)
              translateY(${-8 + Math.abs(offset) * 2}px)
              rotate(${offset * 4}deg)
            `,
            transformOrigin: "bottom center",
            zIndex: 100 + index,
          }}
        >
          <img
            src={cardImgSrc(card)}
            alt={`${card.value} ${card.suit}`}
            className="card-img"
            draggable={false}
          />
        </div>
      );
    })}
  </div>
)}

            {(mode === "classic" || mode === "moderne") &&
  serverPhaseLabel === STATES.ANNOUNCE_ATOUT_TOUR_1 &&
    showServerBiddingHint && (
                <div className="atout-panel atout-panel--glass">
                  <div className="atout-title">Choisir l’atout</div>
                  <div className="atout-actions">
                    <button
  className="atout-btn take"
  onClick={handleTakeAtout}
  disabled={!isServerBiddingPhase}
>
  Prendre
</button>

                    {mode === "moderne" && (
                      <>
                        <button
                          className="atout-btn take"
                         onClick={() => handleTakeAtoutSuit("SA")}
                          title="Sans Atout"
                        >
                          SA
                        </button>
                        <button
                          className="atout-btn take"
                          onClick={() => handleTakeAtoutSuit("TA")}
                          title="Tout Atout"
                        >
                          TA
                        </button>
                      </>
                    )}

                    <button
  className="atout-btn pass"
  onClick={handlePass}
  disabled={!isServerBiddingPhase}
>
  Passer
</button>
                  </div>
                </div>
              )}

            {(mode === "classic" || mode === "moderne") &&
  (game.state === STATES.ANNOUNCE_ATOUT_TOUR_1 ||
    game.state === STATES.ANNOUNCE_ATOUT_TOUR_2) &&
  showServerBiddingHint &&
  game.atoutPropose && (
                <div className="atout-card">
                  <div className="label">Atout</div>
                  <img
                    src={cardImgSrc(game.atoutPropose)}
                    alt={`${game.atoutPropose.value} ${game.atoutPropose.suit}`}
                    className="card-img"
                    draggable={false}
                  />
                </div>
              )}

           {(mode === "classic" || mode === "moderne") &&
  serverPhaseLabel === STATES.ANNOUNCE_ATOUT_TOUR_2 &&
  showServerBiddingHint &&
  game.atoutPropose && (
                <div className="atout-panel atout-panel--glass atout-panel--tour2-wide">
                  <div className="atout-title">Choisir l’atout</div>

                  <div className="atout-actions atout-actions--tour2">
                    {ALL_SUITS.filter((suit) => suit !== game.atoutPropose.suit).map((suit) => (
                      <button
                        key={suit}
                        className="atout-btn take atout-suit-btn"
                        onClick={() => handleTakeAtoutSuit(suit)}
                      >
                        <span className={`atout-suit-symbol ${suit}`}>{suitLabel(suit)}</span>
                      </button>
                    ))}

                    {mode === "moderne" && (
  <>
    <button
      className="atout-btn take"
      onClick={() => handleTakeAtoutSuit("SA")}
      title="Sans Atout"
    >
      SA
    </button>
    <button
      className="atout-btn take"
      onClick={() => handleTakeAtoutSuit("TA")}
      title="Tout Atout"
    >
      TA
    </button>
  </>
)}

                    <button
  className="atout-btn pass atout-pass-inline"
  onClick={handlePass}
  disabled={!isServerBiddingPhase}
>
  Passer
</button>
                  </div>
                </div>
              )}
          </div>
        </div>

        <div className="table-chat-zone">
<TableChat
  currentUserName={pseudo || "Invité"}
  messages={tableChatMessages}
  onSendMessage={sendTableMessage}
/>
        </div>
      </div>
    </div>
  );
}