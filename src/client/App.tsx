import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { ClientState, Color, GameEvent, PlayExtras, SecretPayload, TeamId } from "../shared/types";
import { RULE_INFO } from "../shared/party";
import { CardView } from "./components/CardView";
import { ConnectionBanner, Toast } from "./components/ConnectionBanner";
import { DebugPanel } from "./components/DebugPanel";
import { Game } from "./screens/Game";
import { Home } from "./screens/Home";
import { Lobby } from "./screens/Lobby";
import { Results } from "./screens/Results";
import { createSocket } from "./socket";
import { playEventSounds, unlockAudio } from "./sounds";
import { getPlayerId, getSavedName, isMuted, saveName, setMuted } from "./storage";

type Conn = "connecting" | "connected" | "reconnecting" | "offline";

function eventMessage(events: GameEvent[], state: ClientState | null): string | null {
  const last = events[events.length - 1];
  if (!last || !state) return null;
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? "誰か";
  switch (last.type) {
    case "play":
      return `${name(last.playerId)} がカードを出した！`;
    case "draw":
      return `${name(last.playerId)} が ${last.count} 枚引いた`;
    case "skip":
      return `${name(last.playerId)} はスキップ`;
    case "reverse":
      return "🔄 リバース！";
    case "uno":
      return `${name(last.playerId)} 「UNO!」`;
    case "caught":
      return `${name(last.byPlayerId)} が ${name(last.playerId)} のUNO忘れを指摘！`;
    case "win":
      return `🏆 ${name(last.playerId)} の勝ち！`;
    case "teamWin": {
      const t = state.teams.find((x) => x.id === last.teamId);
      return `🏆 ${t?.name ?? "チーム"} の勝ち！`;
    }
    case "gift":
      return `🎁 ${name(last.playerId)} → ${name(last.targetId)}`;
    case "exchange":
      return `🃏 ${name(last.playerId)} と ${name(last.targetId)} が手札交換！`;
    case "target":
      return `🎯 ${name(last.targetId)} が指名された`;
    case "rotate":
      return "🔄 手札が隣へ移動！";
    case "chaos":
      return "🌪️ 全員シャッフル！";
    case "bomb":
      return `💣 ${name(last.playerId)} にボム`;
    case "king":
      return `👑 次は ${name(last.targetId)}`;
    case "spy":
      return `🕵️ ${name(last.playerId)} が覗いた`;
    case "extraTurn":
      return `✨ ${name(last.playerId)} もう一度！`;
    case "rules":
      return last.rules.map((id) => `${RULE_INFO[id].emoji} ${RULE_INFO[id].title}`).join(" / ");
    case "host":
      return `${name(last.playerId)} がホストになりました`;
    default:
      return null;
  }
}

export function App() {
  const socketRef = useRef<Socket | null>(null);
  const [conn, setConn] = useState<Conn>("connecting");
  const [name, setName] = useState(getSavedName);
  const [code, setCode] = useState("");
  const [state, setState] = useState<ClientState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [muted, setMutedState] = useState(isMuted);
  const [secret, setSecret] = useState<SecretPayload | null>(null);
  const lastCode = useRef<string | null>(null);

  const showToast = useCallback((msg: string | null) => {
    if (!msg) return;
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2200);
  }, []);

  const emit = useCallback((event: string, payload?: unknown): Promise<void> => {
    const socket = socketRef.current;
    if (!socket) {
      showToast("😢 まだ接続できていません");
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const args = payload === undefined ? [] : [payload];
      const timer = window.setTimeout(() => resolve(), 8000);
      socket.emit(event, ...args, (ack?: { ok: boolean; error?: string }) => {
        window.clearTimeout(timer);
        if (ack && ack.ok === false) showToast(ack.error ?? "うまくいきませんでした");
        resolve();
      });
    });
  }, [showToast]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    if (room) setCode(room.toUpperCase());
  }, []);

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    const tryRejoin = () => {
      const room = lastCode.current;
      const n = getSavedName();
      if (room && n) {
        socket.emit("room:join", { code: room, name: n, playerId: getPlayerId() });
      }
    };

    socket.on("connect", () => {
      setConn("connected");
      setBusy(null);
      tryRejoin();
    });
    socket.on("disconnect", () => setConn("offline"));
    socket.io.on("reconnect_attempt", () => setConn("reconnecting"));
    socket.io.on("reconnect", () => {
      setConn("connected");
      tryRejoin();
    });
    socket.on("connect_error", () => setConn("reconnecting"));
    socket.on("room:state", (next: ClientState) => {
      setState(next);
      lastCode.current = next.code;
      setBusy(null);
    });
    socket.on("room:error", (msg: string) => showToast(msg));
    socket.on("game:secret", (payload: SecretPayload) => {
      setSecret(payload);
      window.setTimeout(() => setSecret((cur) => (cur === payload ? null : cur)), 3500);
    });
    socket.on("game:event", (events: GameEvent[]) => {
      playEventSounds(events);
      setState((cur) => {
        showToast(eventMessage(events, cur));
        return cur;
      });
    });

    return () => {
      socket.removeAllListeners();
      socket.close();
    };
  }, [showToast]);

  useEffect(() => {
    saveName(name);
  }, [name]);

  const shareUrl = useMemo(() => {
    if (!state) return window.location.origin;
    const url = new URL(window.location.origin);
    url.searchParams.set("room", state.code);
    if (import.meta.env.DEV) {
      url.port = window.location.port;
      url.host = window.location.host;
    }
    return url.toString();
  }, [state]);

  async function onCreate() {
    if (!name.trim()) return showToast("ニックネームを入力してください");
    unlockAudio();
    setBusy("🚀 ルームを作成中...");
    lastCode.current = null;
    await emit("room:create", { name: name.trim(), playerId: getPlayerId() });
  }

  async function onJoin() {
    if (!name.trim()) return showToast("ニックネームを入力してください");
    if (!code.trim()) return showToast("ルームコードを入力してください");
    unlockAudio();
    setBusy("🚀 ルームに参加中...");
    lastCode.current = code.trim().toUpperCase();
    await emit("room:join", { code: code.trim().toUpperCase(), name: name.trim(), playerId: getPlayerId() });
  }

  async function onLeave() {
    lastCode.current = null;
    await emit("room:leave");
    setState(null);
  }

  const screen = !state ? "home" : state.status === "lobby" ? "lobby" : state.status === "finished" ? "results" : "game";

  return (
    <div className="app" onPointerDown={unlockAudio}>
      <ConnectionBanner status={conn} />
      {screen === "home" && (
        <Home
          name={name}
          setName={setName}
          code={code}
          setCode={setCode}
          busy={busy}
          ready={conn === "connected"}
          onCreate={onCreate}
          onJoin={onJoin}
        />
      )}
      {screen === "lobby" && state && (
        <Lobby
          state={state}
          shareUrl={shareUrl}
          onStart={() => emit("game:start")}
          onLeave={onLeave}
          onTeamMode={(enabled) => emit("lobby:teamMode", { enabled })}
          onTeamCount={(count) => emit("lobby:teamCount", { count })}
          onRandom={() => emit("lobby:randomTeams")}
          onMove={(playerId, teamId: TeamId) => emit("lobby:moveTeam", { playerId, teamId })}
          onMode={(mode) => emit("lobby:mode", { mode })}
        />
      )}
      {screen === "game" && state && (
        <Game
          state={state}
          busy={!!busy}
          onPlay={(cardId, color?: Color, sayUno?: boolean, extras?: PlayExtras) =>
            emit("game:play", { cardId, color, sayUno, ...extras })
          }
          onDraw={() => emit("game:draw")}
          onKeep={() => emit("game:keep")}
          onUno={() => emit("game:uno")}
          onCatch={(targetId) => emit("game:catch", { targetId })}
        />
      )}
      {screen === "results" && state && (
        <Results
          state={state}
          onAgain={() => emit("game:again")}
          onLobby={() => emit("game:lobby")}
        />
      )}
      <button
        type="button"
        className="mute"
        onClick={() => {
          const next = !muted;
          setMuted(next);
          setMutedState(next);
        }}
        aria-label={muted ? "サウンドオン" : "サウンドオフ"}
      >
        {muted ? "🔇" : "🔊"}
      </button>
      {secret && (
        <div className="overlay spy-peek">
          <div className="overlay-card">
            <h2>🕵️ SPY</h2>
            <p className="hint">{secret.targetName} のカード</p>
            <div className="row" style={{ justifyContent: "center" }}>
              <CardView card={secret.card} large />
            </div>
            <button type="button" className="btn ghost" onClick={() => setSecret(null)}>とじる</button>
          </div>
        </div>
      )}
      <Toast message={toast} />
      <DebugPanel state={state} />
    </div>
  );
}
