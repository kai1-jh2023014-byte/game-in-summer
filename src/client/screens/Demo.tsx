import { useState } from "react";
import { CardView } from "../components/CardView";
import type { Card } from "../../shared/types";

const red7: Card = { id: "d1", type: "number", color: "red", value: 7 };
const blue7: Card = { id: "d2", type: "number", color: "blue", value: 7 };
const plus2: Card = { id: "d3", type: "draw2", color: "red" };
const skip: Card = { id: "d4", type: "skip", color: "yellow" };

const STEPS: { title: string; body: string; fx: string; hand: Card[]; top: Card }[] = [
  {
    title: "同じ色か同じ数字",
    body: "場のカードと、色か数字が同じカードを出します。カードをタップして選んでから「出す」を押します。",
    fx: "7",
    hand: [red7, blue7, skip],
    top: { id: "t", type: "number", color: "red", value: 3 },
  },
  {
    title: "出せないときは1枚引く",
    body: "出せるカードがなければ「カードを引く」。引いたカードが出せるならそのまま出せます。",
    fx: "📥 +1",
    hand: [blue7, skip],
    top: { id: "t2", type: "number", color: "green", value: 1 },
  },
  {
    title: "+2 は積み重ねられる",
    body: "次の人が +2 か +4 を出せば、引き枚数を押し返せます。出せなければ合計枚数を引きます。",
    fx: "💥 +2!",
    hand: [plus2, blue7],
    top: plus2,
  },
  {
    title: "UNO!",
    body: "残り1枚になったら UNO! を押します。言い忘れると、約3秒のあいだ他の人に指摘されます。",
    fx: "🔥 UNO!",
    hand: [red7],
    top: blue7,
  },
  {
    title: "指摘すると +1",
    body: "「UNO言ってない！」を押すと、相手はカードを1枚引きます。ちゃんと言っていれば無効です。",
    fx: "🚨 CAUGHT!",
    hand: [red7, blue7],
    top: blue7,
  },
  {
    title: "0枚で勝ち！",
    body: "手札を全部出せば勝ち。チーム戦なら、仲間の誰かが上がってもチームの勝ちです。",
    fx: "🏆 WIN!",
    hand: [],
    top: red7,
  },
];

export function Demo({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i]!;
  const last = i >= STEPS.length - 1;

  return (
    <main className="screen demo">
      <header className="topbar">
        <p className="eyebrow">DEMO PLAY</p>
        <button type="button" className="btn ghost" onClick={onDone}>
          デモを終了
        </button>
      </header>
      <div className="fx-burst demo-fx">{step.fx}</div>
      <section className="table">
        <div className="color-ring red">
          <CardView card={step.top} large />
        </div>
      </section>
      <section className="panel">
        <h2>{step.title}</h2>
        <p className="hint">{step.body}</p>
        <p className="status-msg">
          {i + 1} / {STEPS.length}
        </p>
      </section>
      <section className="hand-wrap">
        <div className="hand-label">YOUR HAND · {step.hand.length}枚</div>
        <div className="hand">
          {step.hand.map((c) => (
            <CardView key={c.id} card={c} playable />
          ))}
        </div>
      </section>
      <div className="row">
        <button
          type="button"
          className="btn ghost xl"
          onClick={() => setI((n) => Math.max(0, n - 1))}
          disabled={i === 0}
        >
          戻る
        </button>
        {last ? (
          <button type="button" className="btn primary xl" onClick={onDone}>
            遊んでみる
          </button>
        ) : (
          <button type="button" className="btn primary xl" onClick={() => setI((n) => n + 1)}>
            次へ
          </button>
        )}
      </div>
    </main>
  );
}
