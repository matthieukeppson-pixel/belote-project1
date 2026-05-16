import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
const initialRouteMode = location.state?.mode || null;
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
const modernAnnouncementSentKeyRef = useRef(null);
const modernValidatedAnnouncementToastKeyRef = useRef(null);
const bestValidatedAnnouncementToastRef = useRef(null);
const serverBeloteToastKeyRef = useRef(null);
const serverBeloteToastTimerRef = useRef(null);
const [_tableSnapshot, setTableSnapshot] = useState(null);
const mode = _tableSnapshot?.mode || initialRouteMode || "classic";
const modeLabel =
  mode === "contree" ? "Contrée" :
  mode === "moderne" ? "Moderne" :
  "Classique";
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
const seatsInfo = useMemo(() => {
  if (
    Array.isArray(_tableSnapshot?.seatsInfo) &&
    _tableSnapshot.seatsInfo.length > 0
  ) {
    return _tableSnapshot.seatsInfo;
  }

  if (Array.isArray(_tableSnapshot?.seats)) {
    return _tableSnapshot.seats.map((name) =>
      name
        ? {
            name,
            avatar: name === pseudo ? avatar : "/avatar.png",
          }
        : null
    );
  }

  return [];
}, [_tableSnapshot, pseudo, avatar]);

const tableSeatPseudos = Array.isArray(_tableSnapshot?.seats)
  ? _tableSnapshot.seats
  : [];

const normalizePseudo = (value) =>
  String(value ?? "").trim();

const mySeatIndex = tableSeatPseudos.findIndex(
  (seatPseudo) => normalizePseudo(seatPseudo) === normalizePseudo(pseudo)
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

  const wsUrl = import.meta.env.VITE_WS_URL || "ws://localhost:4000";
    const ws = new WebSocket(wsUrl);
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
const hasServerHand = !!serverHand;

const localPhaseLabel = game?.state || "UNKNOWN";
const serverPhaseLabel = serverHand?.phase || "none";
const effectivePhaseLabel = serverHand ? serverPhaseLabel : localPhaseLabel;

const serverTurnSeatIndex =
  typeof serverHand?.currentTurnSeatIndex === "number"
    ? serverHand.currentTurnSeatIndex
    : null;
const serverTurnPlayerId = displayedPlayerIdForSeatIndex(serverTurnSeatIndex);
const authoritativeAtout = serverHand?.atout || game.atout || null;
const authoritativeAtoutPropose = serverHand?.atoutPropose || game.atoutPropose || null;

const authoritativeTakerSeatIndex =
  typeof serverHand?.takerSeatIndex === "number"
    ? serverHand.takerSeatIndex
    : null;

const authoritativeTakerPlayerId =
  authoritativeTakerSeatIndex != null
    ? displayedPlayerIdForSeatIndex(authoritativeTakerSeatIndex)
    : (game.preneur != null ? game.players[game.preneur] : null);
const serverTurnSeatInfo =
  serverTurnSeatIndex != null ? seatsInfo[serverTurnSeatIndex] || null : null;

const isServerTurnBot = !!serverTurnSeatInfo?.isBot;
const isServerBiddingPhase =
  effectivePhaseLabel === STATES.ENCHERES ||
  effectivePhaseLabel === STATES.ANNOUNCE_ATOUT_TOUR_1 ||
  effectivePhaseLabel === STATES.ANNOUNCE_ATOUT_TOUR_2 ||
  effectivePhaseLabel === STATES.ANNONCES_MODERNE;

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

  if (hasServerHand) return;

  setGame((currentGame) => {
    if (currentGame.dealSeed === sharedDealSeed) return currentGame;

    return buildFreshLocalGame({
      dealSeed: sharedDealSeed,
    });
  });
}, [sharedDealSeed, game.dealSeed, buildFreshLocalGame, hasServerHand]);
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
    if (hasServerHand) return;

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

const bidResetCurrentBid = serverHand?.currentBid || game.currentBid || null;
const bidResetMinimumValue = bidResetCurrentBid
  ? Number(bidResetCurrentBid.value || 0) + 10
  : 80;
const bidResetNextValue =
  BID_VALUES.find((value) => value >= bidResetMinimumValue) || 500;

 useEffect(() => {
  if (mode !== "contree") return;
  if (!isServerBiddingPhase) return;
  if (effectivePhaseLabel !== STATES.ENCHERES) return;

  if (!bidResetCurrentBid) {
    setBidValue(80);
    return;
  }

  setBidValue((current) =>
    current >= bidResetMinimumValue ? current : bidResetNextValue
  );
}, [
  mode,
  isServerBiddingPhase,
  effectivePhaseLabel,
  bidResetCurrentBid,
  bidResetMinimumValue,
  bidResetNextValue,
]);


  useEffect(() => {
    serverBeloteToastKeyRef.current = null;

    if (serverBeloteToastTimerRef.current) {
      clearTimeout(serverBeloteToastTimerRef.current);
      serverBeloteToastTimerRef.current = null;
    }

    setBeloteToast(null);
  }, [sharedRoundId]);

  useEffect(() => {
    const state = serverHand?.belote?.state;
    const playerId = serverHand?.belote?.joueur;

    if (mode !== "classic" && mode !== "moderne" && mode !== "contree") return;
    if (state !== "BELOTE" && state !== "REBELOTE") return;
    if (!playerId) return;

    const toastKey = `${sharedRoundId}:${state}:${playerId}:${serverHand?.belote?.suit || "none"}`;
    if (serverBeloteToastKeyRef.current === toastKey) return;

    serverBeloteToastKeyRef.current = toastKey;

    const playerSeatIndex = SEAT_INDEX_TO_LOGICAL_PLAYER.indexOf(playerId);
    const playerName =
      playerSeatIndex >= 0
        ? seatsInfo[playerSeatIndex]?.name || playerId
        : playerId;

    setBeloteToast({
      text: `${state === "BELOTE" ? "Belote" : "Rebelote"} ! (${playerName})`,
      ts: Date.now(),
    });

    if (serverBeloteToastTimerRef.current) {
      clearTimeout(serverBeloteToastTimerRef.current);
    }

    serverBeloteToastTimerRef.current = setTimeout(() => {
      setBeloteToast(null);
      serverBeloteToastTimerRef.current = null;
    }, 1400);
  }, [
    mode,
    serverHand?.belote?.state,
    serverHand?.belote?.joueur,
    serverHand?.belote?.suit,
    sharedRoundId,
    seatsInfo,
  ]);
  // ============================================
  // AFFICHAGE DU PLI
  // ============================================
  useEffect(() => {
    if (serverHand) return;

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
  }, [serverHand, game.pli, displayPli]);

  // ============================================
  // FIN DE MANCHE — CALCUL PARTIE
  // ============================================
  useEffect(() => {
    if (serverHand) return;
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
    const expectedTotal =
      contrat === 500 ? 500 * multLocal : 162 + contrat * multLocal;
    const contreeAnnouncementPoints = (game.modernAnnouncements?.validated || []).reduce(
      (sum, ann) => sum + (ann?.points || 0),
      0
    );
    ok =
      total === expectedTotal + contreeAnnouncementPoints ||
      total === expectedTotal + contreeAnnouncementPoints + 20;
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
  }, [serverHand, game.state]);

  // ============================================
  // FIN DE MANCHE — VISUEL (dernier pli)
  // ============================================
  useEffect(() => {
    if (effectivePhaseLabel !== STATES.FIN_DE_MANCHE) return;

    const timer = setTimeout(() => {
      setHideLastPli(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, [effectivePhaseLabel]);


  // ============================================
  // ACTIONS
  // ============================================
const sendTableGameAction = useCallback((action) => {
  const ws = wsTableRef.current;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (!tableId) return;
  if (!sharedRoundId || sharedRoundId === "none") return;

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
  if (!isServerLocalTurn) return;
  sendTableGameAction({ type: "PASS_ANNOUNCEMENT" });
}

function handleDeclareAnnouncement(announcement) {
  if (!isServerBiddingPhase) return;
  if (!isServerLocalTurn) return;
  if (!announcement) return;

  sendTableGameAction({
    type: "DECLARE_ANNOUNCEMENT",
    announcementType: announcement.type,
    highRank: announcement.highRank,
    suit: announcement.suit || null,
  });
}

function handleContre() {
  if (!isServerBiddingPhase) return;
  if (!isServerLocalTurn) return;
  sendTableGameAction({ type: "CONTRE" });
}

function handleSurContre() {
  if (!isServerBiddingPhase) return;
  if (!isServerLocalTurn) return;
  sendTableGameAction({ type: "SURCONTRE" });
}

function _handleBidSuit(suit) {
  if (!isServerBiddingPhase) return;
  if (!isServerLocalTurn) return;

  const minimumBidValue = authoritativeCurrentBid
    ? Number(authoritativeCurrentBid.value || 0) + 10
    : 80;

  if (bidValue < minimumBidValue) return;

  sendTableGameAction({ type: "BID", value: bidValue, suit });
}
function handleTakeAtoutSuit(suit) {
  if (!isServerBiddingPhase) return;
   if (!isServerLocalTurn) return;
  sendTableGameAction({ type: "TAKE_ATOUT", suit });
}
 function handlePlayCard(card) {
  if (!isServerLocalTurn) return;

  const cardKey = `${card.suit}:${String(card.value).toUpperCase()}`;
  sendTableGameAction({ type: "PLAY_CARD", cardKey });
}

const localActivePlayer = game.players[game.currentPlayerIndex] || null;
const serverActivePlayer = serverTurnPlayerId || null;

const isServerControlledTurn =
  !!serverHand &&
  (serverPhaseLabel === STATES.ANNOUNCE_ATOUT_TOUR_1 ||
    serverPhaseLabel === STATES.ANNOUNCE_ATOUT_TOUR_2 ||
    serverPhaseLabel === STATES.ANNONCES_MODERNE ||
    serverPhaseLabel === STATES.PLI_EN_COURS ||
    serverPhaseLabel === STATES.PLI_TERMINE ||
    serverPhaseLabel === STATES.FIN_DE_MANCHE ||
    serverPhaseLabel === "FIN_DE_PARTIE");

const activePlayer = isServerControlledTurn
  ? serverActivePlayer
  : localActivePlayer;

const localDisplayedPlayerId = displayedPlayerIdForPosition("bottom");
const isLocalTurn = activePlayer === localDisplayedPlayerId;
const isServerLocalTurn =
  serverTurnSeatIndex != null
    ? mySeatIndex === serverTurnSeatIndex
    : isLocalTurn;

const activeSeatInfo = seatInfoForLogicalPlayerId(activePlayer);
const _isActiveBot = !!activeSeatInfo?.isBot;

const effectiveModernAnnouncements =
  (mode === "moderne" || mode === "contree") && serverHand?.modernAnnouncements
    ? serverHand.modernAnnouncements
    : game.modernAnnouncements;

const currentAnnouncements =
  effectiveModernAnnouncements?.detectedByPlayer?.[localDisplayedPlayerId] || [];


const serverScores = serverHand?.scores || null;

const scoreUI = serverHand
  ? serverScores || { nous: 0, eux: 0 }
  : scorePartie;
const isServerGameOver =
  !!serverHand &&
  (serverHand?.partieTerminee || serverPhaseLabel === "FIN_DE_PARTIE");
const shouldShowNewGameButton = isServerGameOver || (!serverHand && partieTerminee);
const serverDisplayPli = Array.isArray(serverHand?.trickCards)
  ? serverHand.trickCards.filter((play) => play && play.card)
  : [];

const effectiveDisplayPli = serverHand ? serverDisplayPli : displayPli;

const shouldShowPli =
  effectiveDisplayPli.length > 0 &&
  !(effectivePhaseLabel === STATES.FIN_DE_MANCHE && hideLastPli);
const serverLocalHand =
  localDisplayedPlayerId &&
  Array.isArray(serverHand?.hands?.[localDisplayedPlayerId])
    ? serverHand.hands[localDisplayedPlayerId]
    : null;

const localHand =
  serverLocalHand ||
  (localDisplayedPlayerId && game.hands[localDisplayedPlayerId]) ||
  [];
const authoritativeCurrentBid = serverHand?.currentBid || game.currentBid || null;
const mult = serverHand?.contratMultiplicateur || game.contratMultiplicateur || 1;

const localSeatTeam =
  mySeatIndex === 0 || mySeatIndex === 2
    ? "nous"
    : mySeatIndex === 1 || mySeatIndex === 3
      ? "eux"
      : null;

const displayScoreUI =
  scoreUI && localSeatTeam === "eux"
    ? { nous: scoreUI.eux, eux: scoreUI.nous }
    : scoreUI;

const currentBidSeatIndex =
  typeof authoritativeCurrentBid?.seatIndex === "number"
    ? authoritativeCurrentBid.seatIndex
    : null;
const currentBidPlayerId =
  currentBidSeatIndex != null
    ? displayedPlayerIdForSeatIndex(currentBidSeatIndex)
    : typeof authoritativeCurrentBid?.playerIndex === "number"
      ? game.players[authoritativeCurrentBid.playerIndex]
      : null;
const currentBidTeam =
  currentBidSeatIndex === 0 || currentBidSeatIndex === 2
    ? "nous"
    : currentBidSeatIndex === 1 || currentBidSeatIndex === 3
      ? "eux"
      : currentBidPlayerId && game.teams.nous.includes(currentBidPlayerId)
        ? "nous"
        : currentBidPlayerId && game.teams.eux.includes(currentBidPlayerId)
          ? "eux"
          : null;

const canContre =
  !!authoritativeCurrentBid &&
  mult === 1 &&
  !!localSeatTeam &&
  !!currentBidTeam &&
  localSeatTeam !== currentBidTeam;
const canSurContre =
  !!authoritativeCurrentBid &&
  mult === 2 &&
  !!localSeatTeam &&
  !!currentBidTeam &&
  localSeatTeam === currentBidTeam;

const bestValidatedAnnouncement =
  mode === "moderne" || mode === "contree"
    ? (effectiveModernAnnouncements?.validated || [])[0] || null
    : null;
const validatedAnnouncementKey =
  bestValidatedAnnouncement
    ? [
        sharedRoundId,
        bestValidatedAnnouncement.playerId || "none",
        bestValidatedAnnouncement.type || "none",
        bestValidatedAnnouncement.highRank || "none",
        bestValidatedAnnouncement.suit || "none",
        bestValidatedAnnouncement.points || 0,
      ].join(":")
    : null;
  useEffect(() => {
  bestValidatedAnnouncementToastRef.current = bestValidatedAnnouncement;
}, [bestValidatedAnnouncement]);
const showModernAnnouncementPanel =
  (mode === "moderne" || mode === "contree") &&
  serverPhaseLabel === STATES.ANNONCES_MODERNE &&
  isServerLocalTurn &&
  currentAnnouncements.length > 0;

const primaryModernAnnouncement = currentAnnouncements[0] || null;

const visibleAnnouncementSeatIndex = visibleAnnouncement?.playerId
  ? SEAT_INDEX_TO_LOGICAL_PLAYER.indexOf(visibleAnnouncement.playerId)
  : -1;
const visibleAnnouncementPlayerName =
  visibleAnnouncementSeatIndex >= 0
    ? seatsInfo[visibleAnnouncementSeatIndex]?.name || visibleAnnouncement.playerId
    : visibleAnnouncement?.playerId || null;

useEffect(() => {
  if (mode !== "moderne" && mode !== "contree") {
    modernValidatedAnnouncementToastKeyRef.current = null;
    bestValidatedAnnouncementToastRef.current = null;
    setVisibleAnnouncement(null);
    setAnnouncementFading(false);
    return;
  }

  if (!validatedAnnouncementKey) return;

  if (modernValidatedAnnouncementToastKeyRef.current === validatedAnnouncementKey) {
    return;
  }

  const announcement = bestValidatedAnnouncementToastRef.current;
  if (!announcement) return;

  modernValidatedAnnouncementToastKeyRef.current = validatedAnnouncementKey;
  setVisibleAnnouncement(announcement);
  setAnnouncementFading(false);

  const fadeTimer = setTimeout(() => {
    setAnnouncementFading(true);
  }, 1700);

  const hideTimer = setTimeout(() => {
    setVisibleAnnouncement(null);
    setAnnouncementFading(false);
  }, 2200);

  return () => {
    clearTimeout(fadeTimer);
    clearTimeout(hideTimer);
  };
}, [mode, validatedAnnouncementKey]);

useEffect(() => {
  if (mode !== "moderne" && mode !== "contree") {
    modernAnnouncementSentKeyRef.current = null;
    return;
  }

  if (effectivePhaseLabel !== STATES.ANNONCES_MODERNE) {
    modernAnnouncementSentKeyRef.current = null;
    return;
  }

const active = activePlayer;
if (!active) return;

const declaredByPlayer = effectiveModernAnnouncements?.declaredByPlayer || {};
const alreadyAnswered = Object.prototype.hasOwnProperty.call(
  declaredByPlayer,
  active
);

if (alreadyAnswered) {
  modernAnnouncementSentKeyRef.current = null;
  return;
}

const detected =
  effectiveModernAnnouncements?.detectedByPlayer?.[active] || [];

const activeSeatIndex = SEAT_INDEX_TO_LOGICAL_PLAYER.findIndex(
  (playerId) => playerId === active
);

const activeSeatInfo =
  activeSeatIndex !== -1 ? seatsInfo[activeSeatIndex] || null : null;

const activeIsBot = !!activeSeatInfo?.isBot;
const turnKey = `${sharedRoundId}:${active}`;

  const timer = setTimeout(() => {
    if (modernAnnouncementSentKeyRef.current === turnKey) return;

    if (active === localDisplayedPlayerId) {
      if (detected.length > 0) return;

      modernAnnouncementSentKeyRef.current = turnKey;
      sendTableGameAction({ type: "PASS_ANNOUNCEMENT" });
      return;
    }

    if (!activeIsBot) return;
    if (!isPrimaryTableDriver) return;

    const best = detected[0] || null;
    modernAnnouncementSentKeyRef.current = turnKey;

    if (best) {
      sendTableGameAction({
        type: "DECLARE_ANNOUNCEMENT",
        announcementType: best.type,
        highRank: best.highRank,
        suit: best.suit || null,
      });
      return;
    }

    sendTableGameAction({ type: "PASS_ANNOUNCEMENT" });
  }, 350);

  return () => clearTimeout(timer);
}, [
  mode,
  effectivePhaseLabel,
  activePlayer,
  effectiveModernAnnouncements,
  seatsInfo,
  localDisplayedPlayerId,
  isPrimaryTableDriver,
  sharedRoundId,
  sendTableGameAction,
]);

useEffect(() => {
  if (serverHand) return;

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
  serverHand,
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
    serverPhaseLabel !== STATES.ANNOUNCE_ATOUT_TOUR_2 &&
    serverPhaseLabel !== STATES.ENCHERES
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


  

 function backToSalon() {
  const ws = wsTableRef.current;
  if (ws && ws.readyState === WebSocket.OPEN && tableId) {
    ws.send(JSON.stringify({ type: "leave_table", tableId }));
    ws.close(1000, "leave");
  }
  navigate("/salon");
}

function startWithBots() {
  const ws = wsTableRef.current;
  if (!ws || ws.readyState !== WebSocket.OPEN || !tableId) return;
  ws.send(JSON.stringify({ type: "start_with_bots", tableId }));
}

const canStartWithBots =
  mySeatIndex !== -1 &&
  humanSeatIndices.length > 0 &&
  humanSeatIndices.length < 4 &&
  _tableSnapshot?.game?.status !== "READY";

  // ============================================
  // RENDER
  // ============================================
  const showTableDebug = false;

  return (
    <div
      className="table-page"
      data-mode={mode}
      data-state={effectivePhaseLabel}
      style={{ position: "relative" }}
    >
      <button className="table-back-btn" onClick={backToSalon}>
        ← Retour au salon
      </button>
      <div className="table-mode-pill">Mode : {modeLabel}</div>

      {canStartWithBots && (
        <button
          type="button"
          className="start-with-bots-btn"
          onClick={startWithBots}
        >
          {"D\u00E9marrer avec bots"}
        </button>
      )}

      {showTableDebug && (
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
<div>Pseudo local : {pseudo}</div>
<div>Seats bruts : {JSON.stringify(tableSeatPseudos)}</div>
<div>Ma place : {mySeatIndex === -1 ? "none" : mySeatIndex + 1}</div>
<div>Tour serveur : {serverTurnSeatIndex == null ? "none" : serverTurnSeatIndex + 1}</div>
<div>Joueur serveur : {serverTurnPlayerId || "none"}</div>
<div>Donneur serveur : {typeof serverHand?.dealerSeatIndex === "number" ? serverHand.dealerSeatIndex + 1 : "none"}</div>
<div>Passes serveur : {typeof serverHand?.passes === "number" ? serverHand.passes : "none"}</div>
<div>Primary driver : {isPrimaryTableDriver ? "yes" : "no"}</div>
<div>Server turn bot : {isServerTurnBot ? "yes" : "no"}</div>
<div>Local active : {localActivePlayer || "none"}</div>
<div>Local active bot : {seatInfoForLogicalPlayerId(localActivePlayer)?.isBot ? "yes" : "no"}</div>

<div>Turn authority : {isServerControlledTurn ? "server" : "local"}</div>
<div>Effective active : {activePlayer || "none"}</div>
<div>Effective active name : {seatInfoForLogicalPlayerId(activePlayer)?.name || "none"}</div>
<div>Effective active bot : {seatInfoForLogicalPlayerId(activePlayer)?.isBot ? "yes" : "no"}</div>
<div>Top seat : {seatIndexForPosition("top") == null ? "none" : seatIndexForPosition("top") + 1}</div>
<div>Left seat : {seatIndexForPosition("left") == null ? "none" : seatIndexForPosition("left") + 1}</div>
<div>Right seat : {seatIndexForPosition("right") == null ? "none" : seatIndexForPosition("right") + 1}</div>
<div>Bottom seat : {seatIndexForPosition("bottom") == null ? "none" : seatIndexForPosition("bottom") + 1}</div>
          <div>Round : {sharedRoundId}</div>
          <div>Seed : {sharedDealSeed}</div>
        </div>
      )}

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
  effectivePhaseLabel === STATES.ENCHERES &&
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

    {authoritativeCurrentBid ? (
      <>
        <div
          className="contree-current-contract"
          style={{
            width: "fit-content",
            minWidth: 260,
            maxWidth: 360,
            margin: "0 auto 12px",
            padding: "8px 22px",
            textAlign: "center",
            whiteSpace: "nowrap",
            fontWeight: 900,
            fontSize: "1.08rem",
            color: "#fff7d1",
            background:
              "linear-gradient(180deg, rgba(255, 223, 120, 0.20), rgba(255, 176, 55, 0.10))",
            border: "1px solid rgba(255, 223, 120, 0.55)",
            borderRadius: 12,
            textShadow: "0 1px 2px rgba(0, 0, 0, 0.65)",
            boxShadow:
              "0 0 14px rgba(255, 211, 88, 0.20), inset 0 0 10px rgba(255, 255, 255, 0.06)",
          }}
        >
          Contrat actuel : {authoritativeCurrentBid.value} {atoutSymbol(authoritativeCurrentBid.suit)} · x
          {mult}
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
        : (canContre ? 1 : 0.55),
  }}
  onClick={handleContre}
 disabled={!isServerBiddingPhase || !canContre}
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
        : (canSurContre ? 1 : 0.55),
  }}
  onClick={handleSurContre}
 disabled={!isServerBiddingPhase || !canSurContre}
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
        const min = authoritativeCurrentBid ? authoritativeCurrentBid.value + 10 : 80;
        const disabled = !isServerLocalTurn || v < min;

        return (
          <button
            key={v}
            className="atout-btn take"
            onClick={() => {
              if (!isServerLocalTurn) return;
              setBidValue(v);
            }}
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
  onClick={() => _handleBidSuit(suit)}
  disabled={!isServerBiddingPhase || !isServerLocalTurn}
>

        
          <span className={`atout-suit-symbol ${suit}`}>{suitLabel(suit)}</span>
        </button>
      ))}

     <button
  className="atout-btn pass"
  onClick={handlePass}
  disabled={!isServerBiddingPhase || !isServerLocalTurn}
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
      {primaryModernAnnouncement
        ? `${primaryModernAnnouncement.label || "Annonce"} (${primaryModernAnnouncement.points || 0} pts)`
        : "Annonce"}
    </div>

    {primaryModernAnnouncement?.cards?.length > 0 && (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 4,
          marginBottom: 8,
          minHeight: 54,
        }}
      >
        {primaryModernAnnouncement.cards.map((card, index) => (
          <img
            key={`${card.suit}-${String(card.value).toUpperCase()}-${index}`}
            src={cardImgSrc(card)}
            alt={`${card.value} ${card.suit}`}
            className="card-img"
            draggable={false}
            style={{
              width: 42,
              height: "auto",
              marginLeft: index === 0 ? 0 : -10,
            }}
          />
        ))}
      </div>
    )}

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
        onClick={() => handleDeclareAnnouncement(primaryModernAnnouncement)}
        disabled={!isServerBiddingPhase || !isServerLocalTurn}
      >
        Annonce
      </button>

      <button
        className="atout-btn pass"
        style={{ minWidth: 96, padding: "8px 12px" }}
        onClick={handlePassAnnouncement}
        disabled={!isServerBiddingPhase || !isServerLocalTurn}
      >
        Passer
      </button>
    </div>
  </div>
)}

{(mode === "moderne" || mode === "contree") && visibleAnnouncement && (
  <div
    style={{
      position: "absolute",
      top: 138,
      right: 24,
      transform: `translateY(${announcementFading ? "-6px" : "0px"})`,
      zIndex: 40,
      pointerEvents: "none",
      opacity: announcementFading ? 0 : 1,
      transition: "opacity 0.28s ease, transform 0.28s ease",
    }}
  >
    <div
      style={{
        minWidth: 220,
        maxWidth: 320,
        padding: 0,
        background: "transparent",
        border: "none",
        boxShadow: "none",
        borderRadius: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
      }}
    >
      <div
        style={{
          fontSize: 15,
          fontWeight: 800,
          color: "#fff",
          lineHeight: 1.1,
          textAlign: "center",
          textShadow: "0 2px 5px rgba(0,0,0,0.75)",
        }}
      >
        {visibleAnnouncementPlayerName
          ? `${visibleAnnouncementPlayerName} - ${visibleAnnouncement.label || "Annonce"} (${visibleAnnouncement.points || 0} pts)`
          : `${visibleAnnouncement.label || "Annonce"} (${visibleAnnouncement.points || 0} pts)`}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: 58,
        }}
      >
        {(visibleAnnouncement.cards || []).map((card, index) => (
          <img
            key={`${card.suit}-${String(card.value).toUpperCase()}-${index}`}
            src={cardImgSrc(card)}
            alt={`${card.value} ${card.suit}`}
            className="card-img"
            draggable={false}
            style={{
              width: 52,
              height: "auto",
              marginLeft: index === 0 ? 0 : -10,
              boxShadow: "0 4px 10px rgba(0,0,0,0.28)",
              borderRadius: 6,
            }}
          />
        ))}
      </div>
    </div>
  </div>
)}

{displayScoreUI && (
              <div className="score-overlay score-pill">
                <span className="score-side">Nous</span>
                <div className="score-pill-box">
                  {displayScoreUI.nous}
                  <span className="score-sep">–</span>
                  {displayScoreUI.eux}
                </div>
                <span className="score-side">Eux</span>
              </div>
            )}

            {shouldShowNewGameButton && (
              <button
                className="new-game-btn"
                onClick={() => {
                  if (isServerGameOver) {
                    sendTableGameAction({ type: "RESET_ROUND" });
                    return;
                  }

                  handleNouvellePartie();
                }}
              >
                Nouvelle partie
              </button>
            )}

            {shouldShowPli &&
             effectiveDisplayPli.map((play, index) =>
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
  const serverDisplayedHand = Array.isArray(serverHand?.hands?.[player])
    ? serverHand.hands[player]
    : null;
  const displayedHandCount =
    serverDisplayedHand?.length ?? game.hands[player]?.length ?? 0;
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
  const isDisplayedTaker =
  !!authoritativeAtout && authoritativeTakerPlayerId === player;

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
                   <div className={`atout-indicator ${position} ${authoritativeAtout}`}>
  {atoutSymbol(authoritativeAtout)}
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
  className={`card ${isServerLocalTurn ? "clickable" : "disabled"}`}
  onClick={isServerLocalTurn ? () => handlePlayCard(card) : undefined}
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
  disabled={!isServerBiddingPhase || !isServerLocalTurn}
>
  Prendre
</button>

                    {mode === "moderne" && (
                      <>
                        <button
                          className="atout-btn take"
                         onClick={() => handleTakeAtoutSuit("SA")}
                          title="Sans Atout"
                          disabled={!isServerBiddingPhase || !isServerLocalTurn}
                        >
                          SA
                        </button>
                        <button
  className="atout-btn take"
  onClick={() => handleTakeAtoutSuit("TA")}
  title="Tout Atout"
  disabled={!isServerBiddingPhase || !isServerLocalTurn}
                        >
                          TA
                        </button>
                      </>
                    )}

                    <button
  className="atout-btn pass"
  onClick={handlePass}
  disabled={!isServerBiddingPhase || !isServerLocalTurn}
>
  Passer
</button>
                  </div>
                </div>
              )}

            {(mode === "classic" || mode === "moderne") &&
  (effectivePhaseLabel === STATES.ANNOUNCE_ATOUT_TOUR_1 ||
    effectivePhaseLabel === STATES.ANNOUNCE_ATOUT_TOUR_2) &&
  showServerBiddingHint &&
  authoritativeAtoutPropose && (
                <div className="atout-card">
                  <div className="label">Atout</div>
                  <img
                    src={cardImgSrc(authoritativeAtoutPropose)}
                    alt={`${authoritativeAtoutPropose.value} ${authoritativeAtoutPropose.suit}`}
                    className="card-img"
                    draggable={false}
                  />
                </div>
              )}

           {(mode === "classic" || mode === "moderne") &&
  serverPhaseLabel === STATES.ANNOUNCE_ATOUT_TOUR_2 &&
  showServerBiddingHint &&
  authoritativeAtoutPropose && (
                <div className="atout-panel atout-panel--glass atout-panel--tour2-wide">
                  <div className="atout-title">Choisir l’atout</div>

                  <div className="atout-actions atout-actions--tour2">
                    {ALL_SUITS.filter((suit) => suit !== authoritativeAtoutPropose.suit).map((suit) => (
                      <button
                        key={suit}
                        className="atout-btn take atout-suit-btn"
                        onClick={() => handleTakeAtoutSuit(suit)}
                        disabled={!isServerBiddingPhase || !isServerLocalTurn}
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
      disabled={!isServerBiddingPhase || !isServerLocalTurn}
    >
      SA
    </button>
    <button
      className="atout-btn take"
      onClick={() => handleTakeAtoutSuit("TA")}
      title="Tout Atout"
      disabled={!isServerBiddingPhase || !isServerLocalTurn}
    >
      TA
    </button>
  </>
)}

<button
  className="atout-btn pass atout-pass-inline"
  onClick={handlePass}
  disabled={!isServerBiddingPhase || !isServerLocalTurn}
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