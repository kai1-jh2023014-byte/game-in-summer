import type { ClientState } from "../../shared/types";

const MEDALS = ["🥇", "🥈", "🥉"];

export function Results({
  state,
  onAgain,
  onLobby,
}: {
  state: ClientState;
  onAgain: () => void;
  onLobby: () => void;
}) {
  const winner = state.players.find((p) => p.id === state.winnerId);
  const team = state.teams.find((t) => t.id === state.winningTeamId);
  const host = state.you.isHost;

  return (
    <main className="screen results">
      <div className="win-burst" />
      {state.teamMode && team ? (
        <>
          <p className="eyebrow">🏆 TEAM WIN</p>
          <h1>
            {team.emoji} {team.name} の勝ち！
          </h1>
          <section className="panel">
            {state.teams.map((t) => (
              <div key={t.id} className={`team-block ${t.id === team.id ? "winner" : ""}`}>
                <h3>
                  {t.emoji} {t.name}
                  {t.id === team.id ? " WIN" : ""}
                </h3>
                <p>
                  {state.players
                    .filter((p) => p.teamId === t.id)
                    .map((p) => p.name)
                    .join("、")}
                </p>
              </div>
            ))}
          </section>
        </>
      ) : (
        <>
          <p className="eyebrow">🏆 WINNER</p>
          <h1>{winner?.name ?? "???"}</h1>
        </>
      )}

      <section className="panel">
        <h2>ランキング</h2>
        <ol className="rank-list">
          {state.rankings.map((r) => (
            <li key={r.playerId}>
              <span>{MEDALS[r.place - 1] ?? `${r.place}th`}</span>
              <span>{r.name}</span>
              <span>{r.cardsLeft}枚</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="panel">
        <h2>通算勝利</h2>
        <ul className="player-list">
          {state.players
            .slice()
            .sort((a, b) => b.winCount - a.winCount)
            .map((p) => (
              <li key={p.id}>
                <span className="pname">{p.name}</span>
                <span className="wins">
                  Game {state.gameNumber} · 🏆 {p.winCount}
                </span>
              </li>
            ))}
        </ul>
      </section>

      {host ? (
        <div className="col">
          <button type="button" className="btn primary xl" onClick={onAgain}>
            もう一回！
          </button>
          <button type="button" className="btn ghost xl" onClick={onLobby}>
            ロビーへ戻る
          </button>
        </div>
      ) : (
        <p className="status-msg">ホストが次のゲームを選んでいます...</p>
      )}
    </main>
  );
}
