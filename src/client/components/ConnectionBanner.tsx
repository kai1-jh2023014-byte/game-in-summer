export function ConnectionBanner({
  status,
}: {
  status: "connected" | "connecting" | "reconnecting" | "offline";
}) {
  if (status === "connected") return null;
  const text =
    status === "reconnecting"
      ? "🔄 再接続中..."
      : status === "connecting"
        ? "🎮 ゲームに接続中..."
        : "😢 接続が切れました  もう一度接続しています...";
  return <div className={`banner ${status}`}>{text}</div>;
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="toast">{message}</div>;
}
