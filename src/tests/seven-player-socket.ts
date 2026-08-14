import { createApp } from "../server/app.js";
import { io as ioc, type Socket } from "socket.io-client";
import { canPlay, isWild } from "../shared/deck.js";
import type { ClientState } from "../shared/types.js";

function fail(message: string): never {
  console.error("FAIL:", message);
  process.exit(1);
}

function wait<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${label}`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function connect(url: string): Promise<Socket> {
  const socket = ioc(url, {
    transports: ["polling"],
    upgrade: false,
    forceNew: true,
    reconnection: false,
    timeout: 4000,
  });
  return new Promise((resolve, reject) => {
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", reject);
  });
}

function ack(socket: Socket, event: string, payload?: unknown): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ack timeout: ${event}`)), 4000);
    const cb = (result: { ok: boolean; error?: string }) => {
      clearTimeout(timer);
      resolve(result);
    };
    if (payload === undefined) socket.emit(event, cb);
    else socket.emit(event, payload, cb);
  });
}

function nextState(socket: Socket): Promise<ClientState> {
  return new Promise((resolve) => socket.once("room:state", resolve));
}

async function main(): Promise<void> {
  const { httpServer, io } = createApp();
  await new Promise<void>((resolve, reject) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
    httpServer.on("error", reject);
  });
  const addr = httpServer.address();
  if (!addr || typeof addr === "string") fail("no port");
  const url = `http://127.0.0.1:${addr.port}`;
  console.log("7-player socket test →", url);

  const sockets: Socket[] = [];
  const states: Array<ClientState | undefined> = Array.from({ length: 7 });
  try {
    for (let i = 0; i < 7; i++) {
      sockets.push(await wait(connect(url), 5000, `connect ${i}`));
    }
    sockets.forEach((s, i) => s.on("room:state", (st: ClientState) => {
      states[i] = st;
    }));

    const createdWait = nextState(sockets[0]!);
    const createdAck = await ack(sockets[0]!, "room:create", { name: "Player 1", playerId: "p1" });
    if (!createdAck.ok) fail(createdAck.error ?? "create failed");
    const room = await wait(createdWait, 4000, "create state");
    if (room.code.length !== 4) fail("bad room code");

    for (let i = 1; i < 7; i++) {
      const waitState = nextState(sockets[i]!);
      const joined = await ack(sockets[i]!, "room:join", {
        code: room.code,
        name: `Player ${i + 1}`,
        playerId: `p${i + 1}`,
      });
      if (!joined.ok) fail(joined.error ?? `join ${i} failed`);
      await wait(waitState, 4000, `join ${i}`);
    }

    const deadline = Date.now() + 2000;
    while (states[0]?.playerCount !== 7 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20));
    }
    if (states[0]?.playerCount !== 7) fail(`expected 7 players, got ${states[0]?.playerCount}`);
    console.log("lobby: 7 players in", room.code);

    const started = Promise.all(sockets.map((s) => nextState(s)));
    const startAck = await ack(sockets[0]!, "game:start");
    if (!startAck.ok) fail(startAck.error ?? "start failed");
    await wait(started, 4000, "game start");

    const hands = states.map((st) => st!.you.hand.map((c) => c.id));
    for (let i = 0; i < 7; i++) {
      if (states[i]!.you.hand.length !== 7) fail(`player ${i + 1} hand size`);
      const serialized = JSON.stringify(states[i]);
      for (let j = 0; j < 7; j++) {
        if (i === j) continue;
        for (const id of hands[j]!) {
          if (serialized.includes(`"id":"${id}"`)) fail(`hand leak ${id} to player ${i + 1}`);
        }
      }
    }
    console.log("hands dealt, no leaks");

    const currentId = states[0]!.currentPlayerId!;
    const currentIndex = Number(currentId.replace("p", "")) - 1;
    const view = states[currentIndex]!;
    const playable = view.you.hand.filter(
      (c) => view.topCard && view.currentColor && canPlay(c, view.topCard, view.currentColor),
    );
    const waiter = Promise.all(sockets.map((s) => nextState(s)));
    if (playable[0]) {
      const card = playable[0];
      const played = await ack(sockets[currentIndex]!, "game:play", {
        cardId: card.id,
        color: isWild(card) ? "red" : undefined,
        sayUno: false,
      });
      if (!played.ok) fail(played.error ?? "play failed");
    } else {
      const drawn = await ack(sockets[currentIndex]!, "game:draw");
      if (!drawn.ok) fail(drawn.error ?? "draw failed");
    }
    await wait(waiter, 4000, "after move");
    if (states[0]!.status !== "playing" && states[0]!.status !== "finished") {
      fail("game broke after first move");
    }
    console.log("turn advanced, status", states[0]!.status);

    sockets[6]!.disconnect();
    const deadline2 = Date.now() + 2000;
    while (states[0]?.players.find((p) => p.id === "p7")?.connected !== false && Date.now() < deadline2) {
      await new Promise((r) => setTimeout(r, 20));
    }
    if (states[0]?.players.find((p) => p.id === "p7")?.connected !== false) {
      fail("disconnect was not broadcast");
    }
    if (states[0]!.status === "playing" || states[0]!.status === "finished") {
      console.log("disconnect did not destroy the room");
    } else {
      fail("room died after disconnect");
    }

    console.log("OK 7-player socket simulation");
  } finally {
    for (const s of sockets) s.close();
    io.close();
    httpServer.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
