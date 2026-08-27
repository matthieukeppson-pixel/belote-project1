import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import PseudoDisplay from "../components/PseudoDisplay";
import { useNavigate, useLocation, useParams } from "react-router-dom";

import TableChat from "../components/TableChat";
import SalonHostPanel from "../components/SalonHostPanel";
import "../styles/Table.css";
import "../styles/PhoneTable.css";

import { createInitialGameState, dispatch, STATES } from "../game/beloteEngine";
import Partie from "../game/Partie";
import { requestTableAudioCredentials } from "../api";

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
  right: 1,
  bottom: 2,
  left: 3,
};


function _getTableChatEmojiSrc(text) {
  const clean = String(text || "").trim().toLowerCase();
  return TABLE_CHAT_EMOJIS[clean] || null;
}
export default function Table() {

 const navigate = useNavigate();
const location = useLocation();
const initialRouteMode = location.state?.mode || null;
const tableRole = location.state?.role === "visitor" ? "visitor" : "player";
const { id } = useParams();
  const tableId = Number(id);

const storedUser = JSON.parse(sessionStorage.getItem("user") || "{}");

const pseudo =
  location.state?.pseudo ||
  sessionStorage.getItem("pseudo") ||
  storedUser.pseudo ||
  storedUser.username ||
  "Joueur";

const avatar =
  location.state?.avatar ||
  localStorage.getItem("profile_photo_local") ||
  "/avatar_blue.png";

const wsTableRef = useRef(null);
const lastTrickKeyRef = useRef("");
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
const [salonPanelAllowed, setSalonPanelAllowed] = useState(false);
const [salonPlayers, setSalonPlayers] = useState([]);
const [salonMessages, setSalonMessages] = useState([]);
const [salonPanelOpen, setSalonPanelOpen] = useState(false);
const [salonUnreadCount, setSalonUnreadCount] = useState(0);
const [salonArrivalNotice, setSalonArrivalNotice] = useState("");
const salonPanelAllowedRef = useRef(false);
const salonPanelOpenRef = useRef(false);
const salonArrivalTimerRef = useRef(null);
const [tableAudioState, setTableAudioState] = useState("off");
const [tableAudioError, setTableAudioError] = useState("");
const [tableAudioPeers, setTableAudioPeers] = useState([]);
const tableAudioPeerIdRef = useRef(null);
const tableAudioRequestIdRef = useRef(0);
const tableAudioActivationRef = useRef(false);
const tableAudioIceServersRef = useRef([]);
const tableAudioPeerIdsRef = useRef(new Set());
const tableRelayConnectionsRef = useRef(new Map());
const tableRemoteAudioTracksRef = useRef(new Map());
const tableRemoteAudioStreamsRef = useRef(new Map());
const tableRemoteAudioElementsRef = useRef(new Map());
const tableRelayNegotiationStateRef = useRef(new Map());
const tableRelayChannelsRef = useRef(new Map());
const tableRelayOpenPeerIdsRef = useRef(new Set());
const tableRelayPendingCandidatesRef = useRef(new Map());
const tableRelaySignalQueueRef = useRef(new Map());
const [tableRelayOpenPeerCount, setTableRelayOpenPeerCount] = useState(0);
const [tableRemoteAudioPlaybackPeers, setTableRemoteAudioPlaybackPeers] = useState([]);
const [tableMicroState, setTableMicroState] = useState("not_requested");
const [tableMicroError, setTableMicroError] = useState("");
const tableMicroStreamRef = useRef(null);
const tableMicroRequestIdRef = useRef(0);
const tableMicroActivationRef = useRef(false);

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
function sendSalonMessage(text) {
  const clean = String(text || "").trim();
  if (!clean) return;

  const ws = wsTableRef.current;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  ws.send(JSON.stringify({ type: "message", text: clean }));
}

function toggleSalonPanel() {
  setSalonPanelOpen((previous) => {
    const next = !previous;
    salonPanelOpenRef.current = next;

    if (next) setSalonUnreadCount(0);

    return next;
  });
}

const stopTableMicroStream = useCallback(() => {
  const stream = tableMicroStreamRef.current;
  tableMicroStreamRef.current = null;

  if (!stream) return;

  stream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch (error) {
      if (import.meta.env.DEV) console.warn("Micro cleanup error", error);
    }
  });
}, []);

const releaseTableMicro = useCallback(() => {
  tableMicroRequestIdRef.current += 1;
  tableMicroActivationRef.current = false;
  stopTableMicroStream();
}, [stopTableMicroStream]);

const resetTableMicroUi = useCallback(() => {
  releaseTableMicro();
  setTableMicroState("not_requested");
  setTableMicroError("");
}, [releaseTableMicro]);

const ensureTableRelayNegotiationState = useCallback((audioPeerId) => {
  const peerId = String(audioPeerId || "").trim();
  if (!peerId) return null;

  const existingState = tableRelayNegotiationStateRef.current.get(peerId);
  if (existingState) return existingState;

  const state = {
    makingOffer: false,
    ignoreOffer: false,
    isSettingRemoteAnswerPending: false,
  };

  tableRelayNegotiationStateRef.current.set(peerId, state);
  return state;
}, []);

const clearTableRelayNegotiationState = useCallback((audioPeerId) => {
  const peerId = String(audioPeerId || "").trim();
  if (!peerId) return;

  tableRelayNegotiationStateRef.current.delete(peerId);
}, []);

const clearTableRemoteAudioPlayback = useCallback((audioPeerId) => {
  const peerId = String(audioPeerId || "").trim();
  if (!peerId) return;

  const audioElement = tableRemoteAudioElementsRef.current.get(peerId);
  tableRemoteAudioElementsRef.current.delete(peerId);

  tableRemoteAudioStreamsRef.current.delete(peerId);

  setTableRemoteAudioPlaybackPeers((previous) =>
    previous.filter((entry) => entry.peerId !== peerId)
  );

  if (!audioElement) return;

  try {
    audioElement.pause();
  } catch (error) {
    if (import.meta.env.DEV) console.warn("Remote audio pause cleanup error", error);
  }

  try {
    audioElement.srcObject = null;
  } catch (error) {
    if (import.meta.env.DEV) console.warn("Remote audio source cleanup error", error);
  }
}, []);

const syncTableRemoteAudioPlayback = useCallback((audioPeerId, remoteTracks) => {
  const peerId = String(audioPeerId || "").trim();

  const tracks =
    remoteTracks instanceof Map
      ? [...remoteTracks.values()]
          .map((entry) => entry?.track)
          .filter(
            (track) =>
              track &&
              track.kind === "audio" &&
              track.readyState !== "ended"
          )
      : [];

  if (!peerId || tracks.length === 0 || typeof MediaStream !== "function") {
    clearTableRemoteAudioPlayback(peerId);
    return;
  }

  const stream = new MediaStream(tracks);

  tableRemoteAudioStreamsRef.current.set(peerId, stream);

  setTableRemoteAudioPlaybackPeers((previous) => {
    const nextEntry = { peerId, stream };
    const existingIndex = previous.findIndex(
      (entry) => entry.peerId === peerId
    );

    if (existingIndex === -1) {
      return [...previous, nextEntry];
    }

    return previous.map((entry) =>
      entry.peerId === peerId ? nextEntry : entry
    );
  });
}, [clearTableRemoteAudioPlayback]);

const attachTableRemoteAudioElement = useCallback((audioPeerId, stream, element) => {
  const peerId = String(audioPeerId || "").trim();
  if (!peerId) return;

  if (!element) {
    tableRemoteAudioElementsRef.current.delete(peerId);
    return;
  }

  tableRemoteAudioElementsRef.current.set(peerId, element);

  try {
    if (element.srcObject !== stream) {
      element.srcObject = stream;
    }
  } catch (error) {
    if (import.meta.env.DEV) console.warn("Remote audio element attach error", error);
  }
}, []);

const resumeTableRemoteAudioPlayback = useCallback(() => {
  tableRemoteAudioPlaybackPeers.forEach(({ peerId, stream }) => {
    const audioElement = tableRemoteAudioElementsRef.current.get(peerId);

    if (!audioElement || !stream) return;

    try {
      if (audioElement.srcObject !== stream) {
        audioElement.srcObject = stream;
      }

      const playback = audioElement.play();

      if (playback && typeof playback.catch === "function") {
        playback.catch((error) => {
          if (import.meta.env.DEV) {
            console.warn("Remote audio playback awaiting browser permission", error);
          }
        });
      }
    } catch (error) {
      if (import.meta.env.DEV) console.warn("Remote audio playback error", error);
    }
  });
}, [tableRemoteAudioPlaybackPeers]);

useEffect(() => {
  resumeTableRemoteAudioPlayback();
}, [resumeTableRemoteAudioPlayback]);

const clearTableRemoteAudioTracks = useCallback((audioPeerId) => {
  const peerId = String(audioPeerId || "").trim();
  if (!peerId) return;

  const remoteTracks = tableRemoteAudioTracksRef.current.get(peerId);
  tableRemoteAudioTracksRef.current.delete(peerId);
  clearTableRemoteAudioPlayback(peerId);

  if (!remoteTracks) return;

  remoteTracks.forEach(({ track, onEnded }) => {
    try {
      track.removeEventListener("ended", onEnded);
    } catch (error) {
      if (import.meta.env.DEV) console.warn("Remote audio track cleanup error", error);
    }
  });
}, [clearTableRemoteAudioPlayback]);

const registerTableRemoteAudioTrack = useCallback((audioPeerId, connection, track) => {
  const peerId = String(audioPeerId || "").trim();

  if (
    !peerId ||
    !connection ||
    !track ||
    track.kind !== "audio" ||
    tableRelayConnectionsRef.current.get(peerId) !== connection
  ) {
    return;
  }

  const remoteTracks = tableRemoteAudioTracksRef.current.get(peerId) || new Map();
  const previousEntry = remoteTracks.get(track.id);

  if (previousEntry?.track === track) return;

  if (previousEntry) {
    try {
      previousEntry.track.removeEventListener("ended", previousEntry.onEnded);
    } catch (error) {
      if (import.meta.env.DEV) console.warn("Remote audio track replacement cleanup error", error);
    }
  }

  const onEnded = () => {
    const currentTracks = tableRemoteAudioTracksRef.current.get(peerId);
    const currentEntry = currentTracks?.get(track.id);

    if (!currentEntry || currentEntry.track !== track) return;

    try {
      track.removeEventListener("ended", onEnded);
    } catch (error) {
      if (import.meta.env.DEV) console.warn("Remote audio track ended cleanup error", error);
    }

    currentTracks.delete(track.id);

    if (currentTracks.size === 0) {
      tableRemoteAudioTracksRef.current.delete(peerId);
    }

    syncTableRemoteAudioPlayback(peerId, currentTracks);
  };

  remoteTracks.set(track.id, { track, onEnded });
  tableRemoteAudioTracksRef.current.set(peerId, remoteTracks);
  syncTableRemoteAudioPlayback(peerId, remoteTracks);

  try {
    track.addEventListener("ended", onEnded, { once: true });
  } catch (error) {
    if (import.meta.env.DEV) console.warn("Remote audio track listener error", error);
  }
}, [syncTableRemoteAudioPlayback]);

const closeTableRelayConnection = useCallback((audioPeerId) => {
  const peerId = String(audioPeerId || "").trim();
  if (!peerId) return;

  clearTableRemoteAudioTracks(peerId);
  clearTableRelayNegotiationState(peerId);

  tableRelayOpenPeerIdsRef.current.delete(peerId);
  setTableRelayOpenPeerCount(tableRelayOpenPeerIdsRef.current.size);

  tableRelayPendingCandidatesRef.current.delete(peerId);
  tableRelaySignalQueueRef.current.delete(peerId);

  const channel = tableRelayChannelsRef.current.get(peerId);
  tableRelayChannelsRef.current.delete(peerId);

  if (channel) {
    try {
      channel.close();
    } catch (error) {
      if (import.meta.env.DEV) console.warn("Relay channel cleanup error", error);
    }
  }

  const connection = tableRelayConnectionsRef.current.get(peerId);
  tableRelayConnectionsRef.current.delete(peerId);

  if (connection) {
    try {
      connection.close();
    } catch (error) {
      if (import.meta.env.DEV) console.warn("Relay connection cleanup error", error);
    }
  }
}, [clearTableRemoteAudioTracks, clearTableRelayNegotiationState]);

const closeAllTableRelayConnections = useCallback(() => {
  const peerIds = new Set([
    ...tableRelayChannelsRef.current.keys(),
    ...tableRelayConnectionsRef.current.keys(),
    ...tableRemoteAudioTracksRef.current.keys(),
    ...tableRemoteAudioStreamsRef.current.keys(),
    ...tableRemoteAudioElementsRef.current.keys(),
    ...tableRelayNegotiationStateRef.current.keys(),
    ...tableRelayOpenPeerIdsRef.current.keys(),
    ...tableRelayPendingCandidatesRef.current.keys(),
    ...tableRelaySignalQueueRef.current.keys(),
  ]);

  peerIds.forEach((peerId) => closeTableRelayConnection(peerId));
  tableRelayChannelsRef.current.clear();
  tableRelayConnectionsRef.current.clear();
  tableRemoteAudioTracksRef.current.clear();
  tableRemoteAudioStreamsRef.current.clear();
  tableRemoteAudioElementsRef.current.clear();
  tableRelayNegotiationStateRef.current.clear();
  setTableRemoteAudioPlaybackPeers([]);
  tableRelayOpenPeerIdsRef.current.clear();
  tableRelayPendingCandidatesRef.current.clear();
  tableRelaySignalQueueRef.current.clear();
  setTableRelayOpenPeerCount(0);
}, [closeTableRelayConnection]);

const resetTableRelayState = useCallback(() => {
  closeAllTableRelayConnections();
  tableAudioIceServersRef.current = [];
  tableAudioPeerIdsRef.current.clear();
}, [closeAllTableRelayConnections]);
const sendTableRelaySignal = useCallback((toAudioPeerId, signal) => {
  const peerId = String(toAudioPeerId || "").trim();
  const ws = wsTableRef.current;

  if (!peerId || !ws || ws.readyState !== WebSocket.OPEN) return false;

  try {
    ws.send(
      JSON.stringify({
        type: "audio_signal",
        toAudioPeerId: peerId,
        signal,
      })
    );
    return true;
  } catch (error) {
    if (import.meta.env.DEV) console.warn("Relay signal send error", error);
    return false;
  }
}, []);

const attachTableRelayChannel = useCallback((audioPeerId, channel) => {
  const peerId = String(audioPeerId || "").trim();
  if (!peerId || !channel) return;

  const previousChannel = tableRelayChannelsRef.current.get(peerId);

  if (previousChannel && previousChannel !== channel) {
    tableRelayOpenPeerIdsRef.current.delete(peerId);
    setTableRelayOpenPeerCount(tableRelayOpenPeerIdsRef.current.size);

    try {
      previousChannel.close();
    } catch (error) {
      if (import.meta.env.DEV) console.warn("Relay previous channel cleanup error", error);
    }
  }

  tableRelayChannelsRef.current.set(peerId, channel);

  const markChannelOpen = () => {
    if (tableRelayChannelsRef.current.get(peerId) !== channel) return;

    tableRelayOpenPeerIdsRef.current.add(peerId);
    setTableRelayOpenPeerCount(tableRelayOpenPeerIdsRef.current.size);
  };

  const markChannelClosed = () => {
    if (tableRelayChannelsRef.current.get(peerId) !== channel) return;

    tableRelayChannelsRef.current.delete(peerId);
    tableRelayOpenPeerIdsRef.current.delete(peerId);
    setTableRelayOpenPeerCount(tableRelayOpenPeerIdsRef.current.size);
  };

  channel.onopen = markChannelOpen;
  channel.onclose = markChannelClosed;

  channel.onerror = () => {
    if (import.meta.env.DEV) console.warn("Relay data channel error", peerId);
  };

  if (channel.readyState === "open") markChannelOpen();
}, []);

const createTableRelayConnection = useCallback((audioPeerId, initiator = false) => {
  const peerId = String(audioPeerId || "").trim();

  if (!peerId) return null;

  const existingConnection = tableRelayConnectionsRef.current.get(peerId);
  if (existingConnection) return existingConnection;

  const iceServers = tableAudioIceServersRef.current;

  if (
    typeof RTCPeerConnection !== "function" ||
    !Array.isArray(iceServers) ||
    iceServers.length === 0
  ) {
    return null;
  }

  let connection;

  try {
    connection = new RTCPeerConnection({
      iceServers,
      iceTransportPolicy: "relay",
    });

    if (initiator) {
      const localMicroStream = tableMicroStreamRef.current;
      const localMicroTrack =
        localMicroStream?.getAudioTracks?.().find(
          (track) =>
            track &&
            track.kind === "audio" &&
            track.readyState === "live"
        ) || null;

      connection.addTransceiver(localMicroTrack || "audio", {
        direction: "sendrecv",
      });
    }
  } catch (error) {
    if (import.meta.env.DEV) console.warn("Relay connection creation error", error);
    return null;
  }

  tableRelayConnectionsRef.current.set(peerId, connection);
  ensureTableRelayNegotiationState(peerId);

  connection.ontrack = (event) => {
    registerTableRemoteAudioTrack(peerId, connection, event?.track);
  };

  const closeIfCurrent = () => {
    if (tableRelayConnectionsRef.current.get(peerId) === connection) {
      closeTableRelayConnection(peerId);
    }
  };

  connection.onicecandidate = (event) => {
    if (!event.candidate) return;

    const candidate =
      typeof event.candidate.toJSON === "function"
        ? event.candidate.toJSON()
        : {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            usernameFragment: event.candidate.usernameFragment,
          };

    if (!candidate || typeof candidate.candidate !== "string") return;

    sendTableRelaySignal(peerId, {
      type: "candidate",
      data: { candidate },
    });
  };

  connection.ondatachannel = (event) => {
    attachTableRelayChannel(peerId, event.channel);
  };

  connection.onconnectionstatechange = () => {
    if (connection.connectionState === "failed" || connection.connectionState === "closed") {
      closeIfCurrent();
    }
  };

  if (initiator) {
    try {
      const channel = connection.createDataChannel("belote-relay-probe", { ordered: true });
      attachTableRelayChannel(peerId, channel);
    } catch (error) {
      if (import.meta.env.DEV) console.warn("Relay data channel creation error", error);
      closeIfCurrent();
      return null;
    }
  }

  return connection;
}, [
  attachTableRelayChannel,
  closeTableRelayConnection,
  ensureTableRelayNegotiationState,
  registerTableRemoteAudioTrack,
  sendTableRelaySignal,
]);

const flushTableRelayCandidates = useCallback(async (audioPeerId, connection) => {
  const peerId = String(audioPeerId || "").trim();
  if (!peerId || !connection) return;

  const pendingCandidates = tableRelayPendingCandidatesRef.current.get(peerId) || [];
  tableRelayPendingCandidatesRef.current.delete(peerId);

  for (const candidate of pendingCandidates) {
    if (tableRelayConnectionsRef.current.get(peerId) !== connection) return;

    try {
      await connection.addIceCandidate(candidate);
    } catch (error) {
      if (import.meta.env.DEV) console.warn("Relay pending candidate error", error);
    }
  }
}, []);

const handleTableRelaySignal = useCallback(async (fromAudioPeerId, signal) => {
  const peerId = String(fromAudioPeerId || "").trim();
  const localPeerId = String(tableAudioPeerIdRef.current || "").trim();

  if (
    !peerId ||
    !localPeerId ||
    peerId === localPeerId ||
    !tableAudioPeerIdsRef.current.has(peerId)
  ) {
    return;
  }

  const signalType = String(signal?.type || "");
  const data = signal?.data;

  if (!data || typeof data !== "object" || Array.isArray(data)) return;

  if (signalType === "candidate") {
    const candidate = data.candidate;

    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return;

    const negotiationState = ensureTableRelayNegotiationState(peerId);

    if (!negotiationState || negotiationState.ignoreOffer) return;

    const connection = tableRelayConnectionsRef.current.get(peerId);

    if (!connection || !connection.remoteDescription) {
      const pendingCandidates = tableRelayPendingCandidatesRef.current.get(peerId) || [];

      if (pendingCandidates.length < 64) {
        pendingCandidates.push(candidate);
        tableRelayPendingCandidatesRef.current.set(peerId, pendingCandidates);
      }

      return;
    }

    try {
      await connection.addIceCandidate(candidate);
    } catch (error) {
      if (!negotiationState.ignoreOffer && import.meta.env.DEV) {
        console.warn("Relay candidate error", error);
      }
    }

    return;
  }

  if (signalType !== "offer" && signalType !== "answer") return;

  const description = data.description;

  if (
    !description ||
    typeof description !== "object" ||
    Array.isArray(description) ||
    description.type !== signalType ||
    typeof description.sdp !== "string" ||
    !description.sdp
  ) {
    return;
  }

  let connection = tableRelayConnectionsRef.current.get(peerId);

  if (!connection && signalType === "offer") {
    connection = createTableRelayConnection(peerId, false);
  }

  if (!connection) return;

  const negotiationState = ensureTableRelayNegotiationState(peerId);

  if (!negotiationState) return;

  const isPolite = localPeerId > peerId;

  if (signalType === "offer") {
    if (
      connection.remoteDescription?.type === "offer" &&
      connection.remoteDescription?.sdp === description.sdp
    ) {
      return;
    }

    const readyForOffer =
      !negotiationState.makingOffer &&
      (connection.signalingState === "stable" ||
        negotiationState.isSettingRemoteAnswerPending);

    const offerCollision = !readyForOffer;

    negotiationState.ignoreOffer = !isPolite && offerCollision;

    if (negotiationState.ignoreOffer) {
      tableRelayPendingCandidatesRef.current.delete(peerId);
      return;
    }

    try {
      await connection.setRemoteDescription(description);
      await flushTableRelayCandidates(peerId, connection);

      const localMicroStream = tableMicroStreamRef.current;
      const localMicroTrack =
        localMicroStream?.getAudioTracks?.().find(
          (track) =>
            track &&
            track.kind === "audio" &&
            track.readyState === "live"
        ) || null;

      if (localMicroTrack) {
        const audioTransceiver = connection
          .getTransceivers()
          .find(
            (transceiver) =>
              transceiver &&
              transceiver.sender &&
              transceiver.receiver?.track?.kind === "audio"
          );

        if (!audioTransceiver) {
          throw new Error("RELAY_INCOMING_MIC_LINK_NOT_READY");
        }

        await audioTransceiver.sender.replaceTrack(localMicroTrack);
        audioTransceiver.direction = "sendrecv";
      }

      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);

      const localDescription = connection.localDescription;

      if (
        !localDescription ||
        localDescription.type !== "answer" ||
        typeof localDescription.sdp !== "string" ||
        !sendTableRelaySignal(peerId, {
          type: "answer",
          data: {
            description: {
              type: localDescription.type,
              sdp: localDescription.sdp,
            },
          },
        })
      ) {
        if (tableRelayConnectionsRef.current.get(peerId) === connection) {
          closeTableRelayConnection(peerId);
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) console.warn("Relay offer handling error", error);

      if (tableRelayConnectionsRef.current.get(peerId) === connection) {
        closeTableRelayConnection(peerId);
      }
    }

    return;
  }

  if (connection.signalingState !== "have-local-offer") return;

  negotiationState.ignoreOffer = false;
  negotiationState.isSettingRemoteAnswerPending = true;

  try {
    await connection.setRemoteDescription(description);
    await flushTableRelayCandidates(peerId, connection);
  } catch (error) {
    if (import.meta.env.DEV) console.warn("Relay answer handling error", error);

    if (tableRelayConnectionsRef.current.get(peerId) === connection) {
      closeTableRelayConnection(peerId);
    }
  } finally {
    negotiationState.isSettingRemoteAnswerPending = false;
  }
}, [
  closeTableRelayConnection,
  createTableRelayConnection,
  ensureTableRelayNegotiationState,
  flushTableRelayCandidates,
  sendTableRelaySignal,
]);

const queueTableRelaySignal = useCallback((fromAudioPeerId, signal) => {
  const peerId = String(fromAudioPeerId || "").trim();
  if (!peerId) return;

  const previous = tableRelaySignalQueueRef.current.get(peerId) || Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => handleTableRelaySignal(peerId, signal))
    .catch((error) => {
      if (import.meta.env.DEV) console.warn("Relay signal queue error", error);
    });

  tableRelaySignalQueueRef.current.set(peerId, next);

  void next.then(() => {
    if (tableRelaySignalQueueRef.current.get(peerId) === next) {
      tableRelaySignalQueueRef.current.delete(peerId);
    }
  });
}, [handleTableRelaySignal]);

const startTableRelayConnection = useCallback((audioPeerId) => {
  const peerId = String(audioPeerId || "").trim();
  const localPeerId = String(tableAudioPeerIdRef.current || "").trim();

  if (
    !peerId ||
    !localPeerId ||
    localPeerId >= peerId ||
    !tableAudioPeerIdsRef.current.has(peerId) ||
    tableRelayConnectionsRef.current.has(peerId)
  ) {
    return;
  }

  const connection = createTableRelayConnection(peerId, true);
  if (!connection) return;

  const negotiationState = ensureTableRelayNegotiationState(peerId);
  if (!negotiationState) {
    closeTableRelayConnection(peerId);
    return;
  }

  void (async () => {
    try {
      negotiationState.makingOffer = true;

      const offer = await connection.createOffer();

      if (tableRelayConnectionsRef.current.get(peerId) !== connection) return;

      await connection.setLocalDescription(offer);

      const localDescription = connection.localDescription;

      if (
        !localDescription ||
        localDescription.type !== "offer" ||
        typeof localDescription.sdp !== "string" ||
        !sendTableRelaySignal(peerId, {
          type: "offer",
          data: {
            description: {
              type: localDescription.type,
              sdp: localDescription.sdp,
            },
          },
        })
      ) {
        if (tableRelayConnectionsRef.current.get(peerId) === connection) {
          closeTableRelayConnection(peerId);
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) console.warn("Relay offer creation error", error);

      if (tableRelayConnectionsRef.current.get(peerId) === connection) {
        closeTableRelayConnection(peerId);
      }
    } finally {
      negotiationState.makingOffer = false;
    }
  })();
}, [
  closeTableRelayConnection,
  createTableRelayConnection,
  ensureTableRelayNegotiationState,
  sendTableRelaySignal,
]);

const linkMutedTableMicroToRelayConnections = useCallback(async (stream) => {
  const localTrack =
    stream?.getAudioTracks?.().find(
      (track) =>
        track &&
        track.kind === "audio" &&
        track.readyState === "live"
    ) || null;

  if (!localTrack) {
    throw new Error("NO_AUDIO_TRACK");
  }

  localTrack.enabled = false;

  const targets = [];

  for (const [peerId, connection] of tableRelayConnectionsRef.current.entries()) {
    if (!tableAudioPeerIdsRef.current.has(peerId)) continue;

    if (!connection || connection.signalingState !== "stable") {
      throw new Error("RELAY_MIC_LINK_NOT_READY");
    }

    const negotiationState = ensureTableRelayNegotiationState(peerId);

    if (
      !negotiationState ||
      negotiationState.makingOffer ||
      negotiationState.ignoreOffer ||
      negotiationState.isSettingRemoteAnswerPending
    ) {
      throw new Error("RELAY_MIC_LINK_NOT_READY");
    }

    const audioTransceiver = connection
      .getTransceivers()
      .find(
        (transceiver) =>
          transceiver &&
          transceiver.sender &&
          transceiver.receiver?.track?.kind === "audio"
      );

    if (!audioTransceiver) {
      throw new Error("RELAY_MIC_LINK_NOT_READY");
    }

    targets.push({ peerId, connection, audioTransceiver });
  }

  try {
    for (const { peerId, connection, audioTransceiver } of targets) {
      if (tableRelayConnectionsRef.current.get(peerId) !== connection) {
        throw new Error("RELAY_MIC_LINK_NOT_READY");
      }

      await audioTransceiver.sender.replaceTrack(localTrack);
    }
  } catch (error) {
    targets.forEach(({ peerId, connection }) => {
      if (tableRelayConnectionsRef.current.get(peerId) === connection) {
        closeTableRelayConnection(peerId);
      }
    });

    throw error;
  }

  return targets.length;
}, [
  closeTableRelayConnection,
  ensureTableRelayNegotiationState,
]);

function toggleTableMicroTransmission() {
  if (
    tableAudioState !== "ready" ||
    tableMicroActivationRef.current ||
    tableMicroState === "requesting"
  ) {
    return;
  }

  const stream = tableMicroStreamRef.current;
  const track =
    stream?.getAudioTracks?.().find(
      (candidate) =>
        candidate &&
        candidate.kind === "audio" &&
        candidate.readyState === "live"
    ) || null;

  if (!track) {
    setTableMicroState("error");
    setTableMicroError(
      "Le microphone n’est plus disponible. Autorisez-le de nouveau."
    );
    return;
  }

  const shouldTransmit = !track.enabled;

  track.enabled = shouldTransmit;

  setTableMicroState(shouldTransmit ? "active" : "muted");
  setTableMicroError("");

  void resumeTableRemoteAudioPlayback();
}

async function requestMutedTableMicro() {
  if (
    tableAudioState !== "ready" ||
    tableMicroActivationRef.current ||
    tableMicroState === "requesting" ||
    tableMicroState === "muted" ||
    tableMicroState === "active"
  ) {
    return;
  }

  const mediaDevices = typeof navigator === "undefined" ? null : navigator.mediaDevices;

  if (!mediaDevices || typeof mediaDevices.getUserMedia !== "function") {
    setTableMicroState("error");
    setTableMicroError("Ce navigateur ne peut pas utiliser le microphone.");
    return;
  }

  const requestId = tableMicroRequestIdRef.current + 1;
  tableMicroRequestIdRef.current = requestId;
  tableMicroActivationRef.current = true;
  setTableMicroState("requesting");
  setTableMicroError("");

  let stream = null;

  try {
    stream = await mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });

    const audioTracks = stream.getAudioTracks();

    if (audioTracks.length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("NO_AUDIO_TRACK");
    }

    audioTracks.forEach((track) => {
      track.enabled = false;
    });

    if (tableMicroRequestIdRef.current !== requestId) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    await linkMutedTableMicroToRelayConnections(stream);

    if (tableMicroRequestIdRef.current !== requestId) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    stopTableMicroStream();
    tableMicroStreamRef.current = stream;
    tableMicroActivationRef.current = false;
    setTableMicroState("muted");
    setTableMicroError("");
    void resumeTableRemoteAudioPlayback();
  } catch (error) {
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (cleanupError) {
          if (import.meta.env.DEV) {
            console.warn("Micro relay cleanup error", cleanupError);
          }
        }
      });
    }

    if (tableMicroRequestIdRef.current !== requestId) return;

    tableMicroActivationRef.current = false;
    setTableMicroState("error");

    const errorName = String(error?.name || "");
    const errorMessage = String(error?.message || "");

    if (errorName === "NotAllowedError" || errorName === "SecurityError") {
      setTableMicroError("Autorisation du microphone refus\u00e9e par le navigateur.");
    } else if (errorName === "NotFoundError" || errorMessage === "NO_AUDIO_TRACK") {
      setTableMicroError("Aucun microphone disponible sur cet appareil.");
    } else {
      setTableMicroError("Impossible de pr\u00e9parer le microphone.");
    }
  }
}
async function prepareTableAudio() {
  if (
    tableAudioActivationRef.current ||
    tableAudioState === "requesting" ||
    tableAudioState === "authorizing" ||
    tableAudioState === "ready"
  ) {
    return;
  }

  resetTableRelayState();
  resetTableMicroUi();

  const requestId = tableAudioRequestIdRef.current + 1;
  tableAudioRequestIdRef.current = requestId;
  tableAudioActivationRef.current = true;
  setTableAudioState("requesting");
  setTableAudioError("");
  setTableAudioPeers([]);
  tableAudioPeerIdRef.current = null;

  const credentials = await requestTableAudioCredentials(tableId);

  if (tableAudioRequestIdRef.current !== requestId) return;

  const audioTicket = String(credentials?.audioTicket || "").trim();
  const iceServers = Array.isArray(credentials?.iceServers)
    ? credentials.iceServers
    : [];

  if (credentials?.error) {
    tableAudioActivationRef.current = false;
    setTableAudioState("error");
    setTableAudioError(String(credentials.error));
    return;
  }

  if (
    Number(credentials?.tableId) !== Number(tableId) ||
    !audioTicket ||
    iceServers.length === 0
  ) {
    tableAudioActivationRef.current = false;
    setTableAudioState("error");
    setTableAudioError("Configuration audio relay invalide.");
    return;
  }

  tableAudioIceServersRef.current = iceServers;

  const ws = wsTableRef.current;

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    tableAudioActivationRef.current = false;
    setTableAudioState("error");
    setTableAudioError("Connexion \u00e0 la table indisponible.");
    return;
  }

  const mediaDevices = typeof navigator === "undefined" ? null : navigator.mediaDevices;

  if (!mediaDevices || typeof mediaDevices.getUserMedia !== "function") {
    tableAudioActivationRef.current = false;
    setTableAudioState("error");
    setTableAudioError("Ce navigateur ne peut pas utiliser le microphone.");
    setTableMicroState("error");
    setTableMicroError("Ce navigateur ne peut pas utiliser le microphone.");
    return;
  }

  let stream = null;

  try {
    setTableMicroState("requesting");
    setTableMicroError("");

    stream = await mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });

    const audioTracks = stream.getAudioTracks();

    if (audioTracks.length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
      throw new Error("NO_AUDIO_TRACK");
    }

    audioTracks.forEach((track) => {
      track.enabled = false;
    });

    if (tableAudioRequestIdRef.current !== requestId) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    tableMicroStreamRef.current = stream;
    setTableMicroState("muted");
    setTableMicroError("");

    try {
      ws.send(JSON.stringify({ type: "audio_auth", ticket: audioTicket }));
    } catch {
      throw new Error("AUDIO_AUTH_SEND_FAILED");
    }

    setTableAudioState("authorizing");
  } catch (error) {
    if (tableMicroStreamRef.current === stream) {
      releaseTableMicro();
    } else if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (cleanupError) {
          if (import.meta.env.DEV) {
            console.warn("Micro preparation cleanup error", cleanupError);
          }
        }
      });
    }

    if (tableAudioRequestIdRef.current !== requestId) return;

    tableAudioActivationRef.current = false;
    setTableAudioState("error");

    const errorName = String(error?.name || "");
    const errorMessage = String(error?.message || "");

    let message = "Impossible de préparer le microphone.";

    if (errorName === "NotAllowedError" || errorName === "SecurityError") {
      message = "Autorisation du microphone refusée par le navigateur.";
    } else if (errorName === "NotFoundError" || errorMessage === "NO_AUDIO_TRACK") {
      message = "Aucun microphone disponible sur cet appareil.";
    } else if (errorMessage === "AUDIO_AUTH_SEND_FAILED") {
      message = "Envoi de l'autorisation audio impossible.";
    }

    setTableAudioError(message);
    setTableMicroState("error");
    setTableMicroError(message);
  }
}
function _chooseSeat(seatIndex) {
  pushTemporarySystemMessage(`Clic sur place ${seatIndex + 1}`);

  const ws = wsTableRef.current;
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    pushTemporarySystemMessage("Connexion WS non ouverte");
    return;
  }

  if (tableRole === "visitor") {
    pushTemporarySystemMessage("Mode visiteur : vous regardez la table");
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

const viewSeatIndex = tableRole === "visitor" ? -1 : mySeatIndex;
const humanSeatIndices = seatsInfo.reduce((acc, seat, index) => {
  if (seat?.name && !seat?.isBot) acc.push(index);
  return acc;
}, []);

const primaryHumanSeatIndex = humanSeatIndices[0] ?? -1;
const isPrimaryTableDriver =
  tableRole !== "visitor" &&
  mySeatIndex !== -1 &&
  mySeatIndex === primaryHumanSeatIndex;

// POSITION DE RENDU LOCALE
// - bottom / left / top / right = vue du joueur local
// - ce n'est pas le siège réel serveur
// - le joueur local reste toujours affiché en bas
function seatIndexForPosition(position) {
  if (viewSeatIndex === -1) {
    return UNSEATED_POSITION_TO_SEAT_INDEX[position] ?? null;
  }

  if (position === "bottom") return viewSeatIndex;
  if (position === "left") return (viewSeatIndex + 1) % 4;
  if (position === "top") return (viewSeatIndex + 2) % 4;
  if (position === "right") return (viewSeatIndex + 3) % 4;

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

  if (position === "bottom" && viewSeatIndex !== -1) {
    return seat?.avatar || avatar;
  }

  return seat?.avatar || "/avatar.png";
}

function seatNameForPosition(position) {
  const seat = seatForPosition(position);

  if (position === "bottom" && viewSeatIndex !== -1) {
    return seat?.name || pseudo;
  }

  return seat?.name || "Place libre";
}

function canChoosePosition(position) {
  if (tableRole === "visitor") return false;

  const idx = seatIndexForPosition(position);
  if (idx == null) return false;
  if (idx === mySeatIndex) return false;

  const seat = seatForPosition(position);
  return !seat?.name || seat?.isBot;
}
useEffect(() => {
  if (!tableId) return;

  salonPanelAllowedRef.current = false;
  setSalonPanelAllowed(false);
  salonPanelOpenRef.current = false;
  setSalonPanelOpen(false);

  setTableChatMessages([]);
  resetTableRelayState();
  resetTableMicroUi();
  tableAudioRequestIdRef.current += 1;
  tableAudioActivationRef.current = false;
  tableAudioPeerIdRef.current = null;
  setTableAudioState("off");
  setTableAudioError("");
  setTableAudioPeers([]);

  let isCancelled = false;
  let tableJoinSent = false;

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

    ws.send(
      JSON.stringify({
        type: "join_salon",
        pseudo,
        avatar,
        token: sessionStorage.getItem("token") || "",
      })
    );
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === "salon_host_access") {
        if (!tableJoinSent && ws.readyState === WebSocket.OPEN) {
          tableJoinSent = true;
          ws.send(
            JSON.stringify({
              type: tableRole === "visitor" ? "watch_table" : "join_table",
              tableId,
            })
          );
        }

        return;
      }

      if (
        msg.type === "joined_table" &&
        Number(msg.tableId) === Number(tableId)
      ) {
        salonPanelAllowedRef.current = true;
        setSalonPanelAllowed(true);

        return;
      }

      if (
        msg.type === "watching_table" &&
        Number(msg.tableId) === Number(tableId)
      ) {
        salonPanelAllowedRef.current = false;
        setSalonPanelAllowed(false);
        salonPanelOpenRef.current = false;
        setSalonPanelOpen(false);

        return;
      }

      if (msg.type === "players" && Array.isArray(msg.players)) {
        setSalonPlayers(
          msg.players.filter((player) => player?.name)
        );
        return;
      }

      if (msg.type === "salon_guest_arrived") {
        if (!salonPanelAllowedRef.current) return;

        const guest = String(msg.pseudo || "").trim();
        if (!guest || guest === pseudo) return;

        setSalonArrivalNotice(
          `${guest} vient d’entrer dans le salon`
        );

        if (!salonPanelOpenRef.current) {
          setSalonUnreadCount((count) => count + 1);
        }

        if (salonArrivalTimerRef.current) {
          clearTimeout(salonArrivalTimerRef.current);
        }

        salonArrivalTimerRef.current = setTimeout(() => {
          setSalonArrivalNotice("");
          salonArrivalTimerRef.current = null;
        }, 6000);

        return;
      }

      if (msg.type === "message") {
        if (!salonPanelAllowedRef.current) return;
        if (msg.user === "Système") return;

        const author = String(msg.user || "").trim();
        const messageText = String(msg.text || "").trim();

        if (!author || !messageText) return;

        setSalonMessages((messages) =>
          [
            ...messages,
            {
              id: `${Date.now()}-${Math.random()}`,
              user: author,
              text: messageText,
            },
          ].slice(-100)
        );

        if (
          !salonPanelOpenRef.current &&
          author !== pseudo
        ) {
          setSalonUnreadCount((count) => count + 1);
        }

        return;
      }

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

      if (msg.type === "animation_denied") {
        pushTemporarySystemMessage("Animation refusée : seuls Véro ou Matt peuvent prendre le direct.");
        return;
      }

      if (msg.type === "audio_auth_ok" && Number(msg.tableId) === Number(tableId)) {
        const audioPeerId = String(msg.audioPeerId || "").trim();

        if (!audioPeerId) {
          tableAudioActivationRef.current = false;
          setTableAudioState("error");
          setTableAudioError("Identification audio invalide.");
          return;
        }

        const peers = Array.isArray(msg.peers)
          ? Array.from(
              new Set(
                msg.peers
                  .map((peer) => String(peer?.audioPeerId || "").trim())
                  .filter(Boolean)
              )
            )
          : [];

        closeAllTableRelayConnections();
        tableAudioPeerIdsRef.current = new Set(peers);
        tableAudioActivationRef.current = false;
        tableAudioPeerIdRef.current = audioPeerId;
        setTableAudioPeers(peers);
        setTableAudioState("ready");
        setTableAudioError("");

        peers.forEach((peerId) => startTableRelayConnection(peerId));
        return;
      }

      if (msg.type === "audio_auth_denied") {
        resetTableRelayState();
        releaseTableMicro();
        setTableMicroState("not_requested");
        setTableMicroError("");
        tableAudioActivationRef.current = false;
        tableAudioPeerIdRef.current = null;
        setTableAudioPeers([]);
        setTableAudioState("error");
        setTableAudioError(
          msg.reason === "NOT_TABLE_PARTICIPANT"
            ? "Vous n\u2019\u00eates plus pr\u00e9sent dans cette table."
            : "Autorisation audio refus\u00e9e."
        );
        return;
      }

      if (msg.type === "audio_peer_joined" && Number(msg.tableId) === Number(tableId)) {
        const audioPeerId = String(msg.audioPeerId || "").trim();

        if (audioPeerId && audioPeerId !== tableAudioPeerIdRef.current) {
          tableAudioPeerIdsRef.current.add(audioPeerId);

          setTableAudioPeers((previousPeers) =>
            previousPeers.includes(audioPeerId)
              ? previousPeers
              : [...previousPeers, audioPeerId]
          );

          startTableRelayConnection(audioPeerId);
        }

        return;
      }

      if (msg.type === "audio_peer_left" && Number(msg.tableId) === Number(tableId)) {
        const audioPeerId = String(msg.audioPeerId || "").trim();

        if (audioPeerId) {
          tableAudioPeerIdsRef.current.delete(audioPeerId);
          closeTableRelayConnection(audioPeerId);

          setTableAudioPeers((previousPeers) =>
            previousPeers.filter((peerId) => peerId !== audioPeerId)
          );
        }

        return;
      }
      if (msg.type === "audio_signal" && Number(msg.tableId) === Number(tableId)) {
        const fromAudioPeerId = String(msg.fromAudioPeerId || "").trim();

        if (
          fromAudioPeerId &&
          fromAudioPeerId !== tableAudioPeerIdRef.current &&
          !tableAudioPeerIdsRef.current.has(fromAudioPeerId)
        ) {
          tableAudioPeerIdsRef.current.add(fromAudioPeerId);

          setTableAudioPeers((previousPeers) =>
            previousPeers.includes(fromAudioPeerId)
              ? previousPeers
              : [...previousPeers, fromAudioPeerId]
          );
        }

        if (fromAudioPeerId) {
          queueTableRelaySignal(fromAudioPeerId, msg.signal);
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
            role: msg.role || "player",
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
    tableAudioRequestIdRef.current += 1;
    tableAudioActivationRef.current = false;
    tableAudioPeerIdRef.current = null;
    resetTableRelayState();
    releaseTableMicro();

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
}, [tableId, pseudo, avatar, tableRole, resetTableMicroUi, releaseTableMicro, resetTableRelayState, closeAllTableRelayConnections, closeTableRelayConnection, queueTableRelaySignal, startTableRelayConnection]);

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
      const targetScore =
        mode === "contree" ? 1500 : mode === "classic" ? 1000 : 1500;

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
  setLastTrickPli([]);
  setShowLastTrick(false);
  lastTrickKeyRef.current = "";

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
  const [lastTrickPli, setLastTrickPli] = useState([]);
  const [showLastTrick, setShowLastTrick] = useState(false);
  const [beloteToast, setBeloteToast] = useState(null);

const [scorePartie, setScorePartie] = useState({ nous: 0, eux: 0 });
const [partieTerminee, setPartieTerminee] = useState(false);
const [visibleAnnouncement, setVisibleAnnouncement] = useState(null);
const [announcementFading, setAnnouncementFading] = useState(false);

  function handleNouvellePartie() {
    if (hasServerHand) return;

    setDisplayPli([]);
    setHideLastPli(false);
    setLastTrickPli([]);
    setShowLastTrick(false);
    lastTrickKeyRef.current = "";

    finDeMancheCompteeRef.current = false;
    finDeMancheRef.current = null;

    const targetScore =
      mode === "contree" ? 1500 : mode === "classic" ? 1000 : 1500;
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
const displayedPli = effectiveDisplayPli;

const shouldShowPli =
  displayedPli.length > 0 &&
  !(effectivePhaseLabel === STATES.FIN_DE_MANCHE && hideLastPli);
const canShowLastTrickButton = lastTrickPli.length > 0;
const canShowLastTrickPanel = showLastTrick && lastTrickPli.length > 0;

useEffect(() => {
  if (!serverHand) return;
  if (effectivePhaseLabel !== STATES.PLI_TERMINE) return;

  const completedPli = Array.isArray(serverHand.trickCards)
    ? serverHand.trickCards.filter((play) => play && play.card)
    : [];

  if (completedPli.length !== 4) return;

  const completedPliKey = `${sharedRoundId}:${completedPli
    .map(
      (play) =>
        `${play.playerId || ""}:${play.card?.suit || ""}:${String(
          play.card?.value || ""
        ).toUpperCase()}`
    )
    .join("|")}`;

  if (lastTrickKeyRef.current === completedPliKey) return;

  lastTrickKeyRef.current = completedPliKey;
  setLastTrickPli(completedPli);
  setShowLastTrick(false);
}, [serverHand, effectivePhaseLabel, sharedRoundId]);

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
  }, 4200);

  const hideTimer = setTimeout(() => {
    setVisibleAnnouncement(null);
    setAnnouncementFading(false);
  }, 5000);

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

// En Moderne et Contrée, les annonces des bots sont pilotées par le serveur.
if (activeIsBot) return;

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
  tableRole !== "visitor" &&
  mySeatIndex !== -1 &&
  humanSeatIndices.length > 0 &&
  humanSeatIndices.length < 4 &&
  _tableSnapshot?.game?.status !== "READY";

  // ============================================
  // RENDER
  // ============================================
  const canUseTableMicro =
    tableRole === "visitor" ||
    mySeatIndex !== -1;
  const tableAudioIsConnecting =
    tableAudioState === "requesting" || tableAudioState === "authorizing";
  const tableAudioIsReady = tableAudioState === "ready";
  const tableRelayOpenPeerDisplayCount = Math.min(
    tableRelayOpenPeerCount,
    tableAudioPeers.length
  );
  const tableRelayStatusLabel =
    tableAudioIsReady && tableAudioPeers.length > 0
      ? ` ? Relais ${tableRelayOpenPeerDisplayCount}/${tableAudioPeers.length}`
      : "";
  const tableRelayStatusTitle =
    tableAudioPeers.length > 0
      ? `Relais : ${tableRelayOpenPeerDisplayCount}/${tableAudioPeers.length} liaison(s) de donn?es ouverte(s).`
      : "Aucun autre participant audio d?tect?.";
  const tableRemoteAudioPlaybackPeerDisplayCount = Math.min(
    tableRemoteAudioPlaybackPeers.length,
    tableAudioPeers.length
  );
  const tableRemoteAudioStatusLabel =
    tableAudioIsReady && tableRemoteAudioPlaybackPeerDisplayCount > 0
      ? ` - ?coute ${tableRemoteAudioPlaybackPeerDisplayCount}/${tableAudioPeers.length}`
      : "";
  const tableRemoteAudioStatusTitle =
    tableRemoteAudioPlaybackPeerDisplayCount > 0
      ? `?coute audio distante : ${tableRemoteAudioPlaybackPeerDisplayCount}/${tableAudioPeers.length} piste(s) re?ue(s).`
      : "";

  const tableMicroIsRequesting = tableMicroState === "requesting";
  const tableMicroIsMuted = tableMicroState === "muted";
  const tableMicroIsActive = tableMicroState === "active";
  const tableMicroButtonIsBusy =
    tableAudioIsConnecting || tableMicroIsRequesting;
  const tableMicroButtonDisabled = tableMicroButtonIsBusy;
  const tableMicroClickHandler = !tableAudioIsReady
    ? prepareTableAudio
    : tableMicroIsMuted || tableMicroIsActive
      ? toggleTableMicroTransmission
      : requestMutedTableMicro;
  const tableMicroLabel =
    tableAudioState === "requesting"
      ? " Connexion audio..."
      : tableAudioState === "authorizing"
        ? " Validation audio..."
        : tableAudioState === "error"
          ? " Audio indisponible"
          : !tableAudioIsReady
            ? " Pr\u00e9parer l\u2019audio"
            : tableMicroIsRequesting
              ? " Autorisation micro..."
              : tableMicroIsActive
                ? " Micro activé"
                : tableMicroIsMuted
                  ? " Micro pr\u00eat (coup\u00e9)"
                : tableMicroState === "error"
                  ? " R\u00e9essayer le micro"
                  : " Autoriser le micro";
  const tableMicroTitle =
    tableAudioIsConnecting
      ? "Pr\u00e9paration de la session audio en cours."
      : tableAudioState === "error"
        ? tableAudioError || "Activation audio indisponible."
        : !tableAudioIsReady
          ? "Pr\u00e9pare la session audio. Aucun microphone navigateur n\u2019est activ\u00e9."
          : tableMicroIsRequesting
            ? `Le navigateur attend votre choix pour le microphone. ${tableAudioPeers.length} pair(s) audio d\u00e9tect\u00e9(s).`
            : tableMicroIsActive
              ? `Micro activé. ${tableAudioPeers.length} pair(s) audio détecté(s) ; votre voix est envoyée.`
              : tableMicroIsMuted
                ? `Micro autoris\u00e9 mais coup\u00e9. ${tableAudioPeers.length} pair(s) audio d\u00e9tect\u00e9(s) ; aucun son n\u2019est envoy\u00e9.`
              : tableMicroState === "error"
                ? tableMicroError || "Activation du microphone indisponible."
                : `Audio pr\u00eat avec ${tableAudioPeers.length} pair(s) d\u00e9tect\u00e9(s). Demande l\u2019autorisation du navigateur ; le microphone sera coup\u00e9 imm\u00e9diatement.`;
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

      {canShowLastTrickButton && (
        <>
          <button
            type="button"
            className={`last-trick-btn${showLastTrick ? " active" : ""}`}
            onClick={() => setShowLastTrick((visible) => !visible)}
            title="Revoir le dernier pli"
          >
            {showLastTrick ? "Masquer" : "Dernier pli"}
          </button>

          {canShowLastTrickPanel && (
            <div className="last-trick-mini-table" aria-label="Dernier pli">
              {lastTrickPli.map((play, index) =>
                play?.card ? (
                  <div
                    key={`${play.playerId || "player"}-${play.card.suit}-${play.card.value}-${index}`}
                    className={`last-trick-mini-card ${pliClassForPlayerId(play.playerId)}`}
                  >
                    <img
                      src={cardImgSrc(play.card)}
                      alt={`${play.card.value} ${play.card.suit}`}
                      className="last-trick-mini-img"
                      draggable={false}
                    />
                  </div>
                ) : null
              )}
            </div>
          )}
        </>
      )}

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
            {tableRemoteAudioPlaybackPeers.map(({ peerId, stream }) => (
              <audio
                key={`table-remote-audio-${peerId}`}
                autoPlay
                playsInline
                aria-hidden="true"
                ref={(element) =>
                  attachTableRemoteAudioElement(peerId, stream, element)
                }
                style={{ display: "none" }}
              />
            ))}
            {canUseTableMicro && (
              <button
                type="button"
                className={`table-micro-btn${tableAudioIsReady ? " active" : ""}`}
                onClick={tableMicroClickHandler}
                disabled={tableMicroButtonDisabled}
                aria-busy={tableMicroButtonIsBusy}
                aria-pressed={tableMicroIsActive}
                title={tableAudioIsReady ? `${tableMicroTitle} ${tableRelayStatusTitle} ${tableRemoteAudioStatusTitle}` : tableMicroTitle}
              >
                <span aria-hidden="true">{"\u{1F399}"}</span>
                {tableMicroLabel}
              </button>
            )}
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

 {tableRole !== "visitor" &&
  mode === "contree" &&
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
          {authoritativeCurrentBid.value} {atoutSymbol(authoritativeCurrentBid.suit)} ×{mult} — {seatsInfo[currentBidSeatIndex]?.name || tableSeatPseudos[currentBidSeatIndex]}
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
            
{tableRole !== "visitor" && showModernAnnouncementPanel && (
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
             displayedPli.map((play, index) =>
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
  let displayedSeatRoleClass = "";
  if (displayedSeat?.role === "admin") {
    displayedSeatRoleClass = "role-admin";
  } else if (displayedSeat?.role === "moderator") {
    displayedSeatRoleClass = "role-moderator";
  }

  const isDisplayedSeatVeroAdmin =
    displayedSeat?.role === "admin" &&
    String(displayedSeatName ?? "")
      .trim()
      .toLocaleLowerCase("fr-FR") === "véro";

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
  const isLocalDisplayedPlayer = tableRole !== "visitor" && position === "bottom";
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
                    alt={isLocalDisplayedPlayer ? pseudo || "Avatar" : displayedSeatName || "Avatar"}
                    className="player-avatar"
                  />

                  <div
                    className={[
                      "player-pseudo",
                      displayedSeatRoleClass,
                      isDisplayedSeatVeroAdmin ? "player-pseudo--vero" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <PseudoDisplay
                      name={displayedSeatName}
                      isAdmin={displayedSeat?.role === "admin"}
                      context="table-seat"
                    />
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

               {tableRole !== "visitor" && localHand.length > 0 && (
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

            {tableRole !== "visitor" &&
  (mode === "classic" || mode === "moderne") &&
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

           {tableRole !== "visitor" &&
  (mode === "classic" || mode === "moderne") &&
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

        <SalonHostPanel
          allowed={salonPanelAllowed}
          open={salonPanelOpen}
          players={salonPlayers}
          messages={salonMessages}
          unreadCount={salonUnreadCount}
          arrivalNotice={salonArrivalNotice}
          currentUserName={pseudo}
          onToggle={toggleSalonPanel}
          onSendMessage={sendSalonMessage}
          tabletAudioControl={
            canUseTableMicro ? (
              <button
                type="button"
                className={`salon-host__tablet-audio-btn${tableAudioIsReady ? " active" : ""}`}
                onClick={tableMicroClickHandler}
                disabled={tableMicroButtonDisabled}
                aria-busy={tableMicroButtonIsBusy}
                aria-pressed={tableMicroIsActive}
                title={
                  tableAudioIsReady
                    ? `${tableMicroTitle} ${tableRelayStatusTitle} ${tableRemoteAudioStatusTitle}`
                    : tableMicroTitle
                }
              >
                <span aria-hidden="true">{"\u{1F399}"}</span>
                {tableMicroLabel}
              </button>
            ) : null
          }
        />

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