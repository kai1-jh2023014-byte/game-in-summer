import type { ClientState, GameMode, TeamId } from "../../shared/types";

export function Lobby({
  state,
  onStart,
  onLeave,
  onTeamMode,
  onTeamCount,
  onRandom,
  onMove,
  onMode,
  shareUrl,
}: {
  state: ClientState;
  onStart: () => void;
  onLeave: () => void;
  onTeamMode: (enabled: boolean) => void;
  onTeamCount: (n: number) => void;
  onRandom: () => void;
  onMove: (playerId: string, teamId: TeamId) => void;
  onMode: (mode: GameMode) => void;
  shareUrl: string;
}) {
  const host = state.you.isHost;
  const canStart = state.playerCount >= 2;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(state.code);
    } catch {
      /* ignore */
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      /* ignore */
    }
  }

  return (
    <main className="screen lobby">
      <header className="topbar">
        <div>
          <p className="eyebrow">🎴 NANAIRO</p>
          <h1>Room {state.code}</h1>
        </div>
        <button type="button" className="btn ghost" onClick={onLeave}>
          退出
        </button>
      </header>

      <section className="code-share">
        <button type="button" className="code-big" onClick={copyCode} aria-label="コードをコピー">
          {state.code}
        </button>
        <p>このコードを家族に共有</p>
        <div className="row">
          <button type="button" className="btn secondary" onClick={copyCode}>
            コードをコピー
          </button>
          <button type="button" className="btn secondary" onClick={copyLink}>
            リンクをコピー
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Players</h2>
          <span>
            {state.playerCount} / {state.maxPlayers}
          </span>
        </div>
        <ul className="player-list">
          {state.players.map((p) => (
            <li key={p.id} className={p.connected ? "" : "offline"}>
              <span className="dot" data-on={p.connected} />
              <span className="pname">
                {p.isHost ? "👑 " : ""}
                {p.name}
                {p.id === state.you.id ? " (あなた)" : ""}
              </span>
              {p.winCount > 0 && <span className="wins">🏆{p.winCount}</span>}
              {state.teamMode && p.teamId && (
                <span className="team-pill" data-team={p.teamId}>
                  {state.teams.find((t) => t.id === p.teamId)?.emoji}{" "}
                  {state.teams.find((t) => t.id === p.teamId)?.name}
                </span>
              )}
              {host && state.teamMode && (
                <select
                  className="team-select"
                  value={p.teamId ?? ""}
                  onChange={(e) => onMove(p.id, e.target.value as TeamId)}
                >
                  {state.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.emoji} {t.name}
                    </option>
                  ))}
                </select>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>ゲームモード</h2>
        <div className="row">
          <button
            type="button"
            className={`btn ${state.mode !== "party" ? "primary" : "ghost"}`}
            onClick={() => onMode("classic")}
            disabled={!host}
          >
            クラシック
          </button>
          <button
            type="button"
            className={`btn ${state.mode === "party" ? "primary" : "ghost"}`}
            onClick={() => onMode("party")}
            disabled={!host}
          >
            パーティ
          </button>
        </div>
        <p className="hint">
          {state.mode === "party"
            ? "特殊カードと、試合ごとの「今日のルール」が入ります。"
            : "いつものシンプルなルールです。"}
        </p>
      </section>

      <section className="panel">
        <h2>チーム設定</h2>
        <div className="row">
          <button
            type="button"
            className={`btn ${!state.teamMode ? "primary" : "ghost"}`}
            onClick={() => onTeamMode(false)}
            disabled={!host}
          >
            個人戦
          </button>
          <button
            type="button"
            className={`btn ${state.teamMode ? "primary" : "ghost"}`}
            onClick={() => onTeamMode(true)}
            disabled={!host}
          >
            チーム戦
          </button>
        </div>
        {state.teamMode && (
          <>
            <p className="hint">チーム数</p>
            <div className="row">
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`btn ${state.teamCount === n ? "primary" : "ghost"}`}
                  onClick={() => onTeamCount(n)}
                  disabled={!host}
                >
                  {n}チーム
                </button>
              ))}
            </div>
            <button type="button" className="btn secondary xl" onClick={onRandom} disabled={!host}>
              🎲 ランダムチーム
            </button>
            {state.teams.map((t) => (
              <div key={t.id} className="team-block">
                <h3>
                  {t.emoji} {t.name}
                </h3>
                <p>
                  {state.players
                    .filter((p) => p.teamId === t.id)
                    .map((p) => p.name)
                    .join("、") || "（まだ誰もいません）"}
                </p>
              </div>
            ))}
          </>
        )}
        {!host && <p className="hint">設定はホストだけが変更できます</p>}
      </section>

      <button type="button" className="btn primary xl start" onClick={onStart} disabled={!host || !canStart}>
        {host ? (canStart ? "ゲーム開始" : "2人以上で開始できます") : "ホストの開始を待っています"}
      </button>
    </main>
  );
}
