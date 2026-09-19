import { useCallback, useRef, useState } from "react";
import { useColorReveal } from "./hooks/useColorReveal.js";

const lineArtSrc = `${import.meta.env.BASE_URL}assets/artwork-lineart.svg`;
const colorSrc = `${import.meta.env.BASE_URL}assets/artwork-color.svg`;

export default function App() {
  const lineArtRef = useRef(null);
  const colorImgRef = useRef(null);
  const canvasRef = useRef(null);
  const [completed, setCompleted] = useState(false);
  const [trackingMode, setTrackingMode] = useState(null); // null | "starting" | "webgazer" | "unavailable"

  const handleCompleted = useCallback(() => {
    setCompleted(true);
  }, []);

  const { loggerRef, startTracking } = useColorReveal({
    lineArtRef,
    colorImgRef,
    canvasRef,
    onCompleted: handleCompleted,
  });

  const handleStart = useCallback(async () => {
    setTrackingMode("starting");
    const mode = await startTracking();
    setTrackingMode(mode);
  }, [startTracking]);

  return (
    <main className="viewer">
      <img ref={lineArtRef} className="viewer__lineart" src={lineArtSrc} alt="鑑賞対象の絵画(線画)" />
      <img ref={colorImgRef} className="viewer__colorSource" src={colorSrc} alt="" aria-hidden="true" />
      <canvas ref={canvasRef} className="viewer__mask" />

      {trackingMode === null && (
        <div className="start-overlay">
          <p>
            Webカメラで視線を検知し、見た部分から色が浮かび上がります。
            <br />
            映像はブラウザ内でのみ処理され、外部には送信されません。
          </p>
          <button onClick={handleStart}>Webカメラで視線トラッキングを開始</button>
        </div>
      )}

      {trackingMode === "starting" && (
        <div className="start-overlay">
          <p>Webカメラを起動しています…</p>
        </div>
      )}

      {trackingMode === "unavailable" && (
        <div className="start-overlay">
          <p>
            Webカメラを利用できませんでした。
            <br />
            カメラが接続されているか、ブラウザの権限設定をご確認のうえ再度お試しください。
          </p>
          <button onClick={handleStart}>もう一度試す</button>
        </div>
      )}

      {completed && (
        <button
          style={{ position: "absolute", bottom: 20, right: 20 }}
          onClick={() => loggerRef.current?.download()}
        >
          鑑賞ログを保存
        </button>
      )}
    </main>
  );
}
