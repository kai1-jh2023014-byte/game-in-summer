import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { ClientState, Color, GameEvent, PlayExtras, SecretPayload, TeamId } from "../shared/types";
import { CardView } from "./components/CardView";
import { ConnectionBanner, Toast } from "./components/ConnectionBanner";
import { DebugPanel } from "./components/DebugPanel";
import { EventLog, HandPop, PlayFX } from "./components/PlayFX";
import { noticesFromEvents, pickFx, pickToast } from "./notices";
import { Demo } from "./screens/Demo";
import { Game } from "./screens/Game";
import { Home } from "./screens/Home";
import { Lobby } from "./screens/Lobby";
import { Results } from "./screens/Results";
import { createSocket } from "./socket";
import { playEventSounds, unlockAudio } from "./sounds";
import { getPlayerId, getSavedName, isMuted, saveName, setMuted, setSkipDemo, shouldSkipDemo } from "./storage";

type Conn = "connecting" | "connected" | "reconnecting" | "offline";

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
  const [demo, setDemo] = useState(false);
  const [intro, setIntro] = useState(() => !shouldSkipDemo());
  const [fx, setFx] = useState<{ title: string; hint: string } | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [handPop, setHandPop] = useState<string | null>(null);
  const lastCode = useRef<string | null>(null);
  const handCount = useRef(0);

  const showToast = useCallback((msg: string | null) => {
    if (!msg) return;
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2200);
  }, []);

  const emit = useCallback((event: string, payload?: unknown): Promise<{ ok: boolean }> => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      showToast("😢 サーバーに接続できていません。同じWi-Fiか、URLのポートを確認してください");
      return Promise.resolve({ ok: false });
    }
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        socket.off("room:state", onState);
        resolve({ ok });
      };
      const onState = () => finish(true);
      const timer = window.setTimeout(() => {
        showToast("応答がありません。ページを再読み込みしてください");
        finish(false);
      }, 6000);
      socket.once("room:state", onState);
      const args = payload === undefined ? [] : [payload];
      socket.emit(event, ...args, (ack?: { ok: boolean; error?: string }) => {
        if (ack && ack.ok === false) {
          showToast(ack.error ?? "うまくいきませんでした");
          finish(false);
          return;
        }
        if (event === "room:leave") finish(true);
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
      const prev = handCount.current;
      const nextCount = next.you.hand.length + (next.drawnCard ? 1 : 0);
      if (prev > 0 && next.status === "playing" && nextCount !== prev) {
        const delta = nextCount - prev;
        setHandPop(delta > 0 ? `📥 +${delta}  カードを${delta}枚引きました` : `✨ 残り${nextCount}枚！`);
        window.setTimeout(() => setHandPop(null), 1400);
      }
      handCount.current = nextCount;
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
        const notices = noticesFromEvents(events, cur);
        const toast = pickToast(notices);
        const burst = pickFx(notices);
        if (toast) showToast(toast);
        if (burst) {
          setFx(burst);
          window.setTimeout(() => setFx((now) => (now === burst ? null : now)), 2200);
        }
        const lines = notices.map((n) => n.log).filter(Boolean);
        if (lines.length) setLog((old) => [...lines, ...old].slice(0, 4));
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
    const result = await emit("room:create", { name: name.trim(), playerId: getPlayerId() });
    if (!result.ok) setBusy(null);
    else window.setTimeout(() => setBusy(null), 2000);
  }

  async function onJoin() {
    if (!name.trim()) return showToast("ニックネームを入力してください");
    if (!code.trim()) return showToast("ルームコードを入力してください");
    unlockAudio();
    setBusy("🚀 ルームに参加中...");
    lastCode.current = code.trim().toUpperCase();
    const result = await emit("room:join", {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      playerId: getPlayerId(),
    });
    if (!result.ok) setBusy(null);
    else window.setTimeout(() => setBusy(null), 2000);
  }

  async function onLeave() {
    lastCode.current = null;
    await emit("room:leave");
    setState(null);
  }

  const screen = demo
    ? "demo"
    : !state
      ? "home"
      : state.status === "lobby"
        ? "lobby"
        : state.status === "finished"
          ? "results"
          : "game";

  return (
    <div className="app" onPointerDown={unlockAudio}>
      <ConnectionBanner status={conn} />
      {screen === "demo" && (
        <Demo
          onDone={() => {
            setDemo(false);
            setIntro(false);
          }}
        />
      )}
      {screen === "home" && (
        <Home
          name={name}
          setName={setName}
          code={code}
          setCode={setCode}
          busy={busy}
          ready={conn === "connected"}
          intro={intro}
          onCreate={onCreate}
          onJoin={onJoin}
          onDemo={() => {
            setIntro(false);
            setDemo(true);
          }}
          onDismissIntro={(skipNext) => {
            setIntro(false);
            if (skipNext) setSkipDemo(true);
          }}
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
          onDemo={() => setDemo(true)}
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
      <PlayFX banner={fx} />
      <HandPop text={handPop} />
      {screen === "game" && <EventLog lines={log} />}
      <Toast message={toast} />
      <DebugPanel state={state} />
    </div>
  );
}
