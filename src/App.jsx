import { useCallback, useRef, useState } from "react";
import { useColorReveal } from "./hooks/useColorReveal.js";
import CalibrationScreen from "./components/CalibrationScreen.jsx";
import AccuracyTest from "./components/AccuracyTest.jsx";

// 作品ごとに「線画」と「陰影・色彩」の画像を対で持つ。?art=starry のように切り替える。
const ARTWORKS = {
  bedroom: { lineArt: "assets/bedroom-lineart.png", color: "assets/bedroom-color.jpg" },
  starry: { lineArt: "assets/starry-lineart.png", color: "assets/starry-color.jpg" },
};
const DEFAULT_ARTWORK = "bedroom";

function resolveArtwork() {
  const key = new URLSearchParams(window.location.search).get("art");
  const artwork = ARTWORKS[Object.hasOwn(ARTWORKS, key) ? key : DEFAULT_ARTWORK];
  return {
    lineArtSrc: `${import.meta.env.BASE_URL}${artwork.lineArt}`,
    colorSrc: `${import.meta.env.BASE_URL}${artwork.color}`,
  };
}

function ArtViewer() {
  const { lineArtSrc, colorSrc } = resolveArtwork();
  const lineArtRef = useRef(null);
  const colorImgRef = useRef(null);
  const canvasRef = useRef(null);
  const [completed, setCompleted] = useState(false);
  const [trackingMode, setTrackingMode] = useState(null); // null | "starting" | "webgazer" | "unavailable"
  const [calibrated, setCalibrated] = useState(false);

  const handleCompleted = useCallback(() => {
    setCompleted(true);
  }, []);

  const { loggerRef, startTracking, calibrate, setPaintingEnabled } = useColorReveal({
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

  const handleCalibrationComplete = useCallback(() => {
    setPaintingEnabled(true);
    setCalibrated(true);
  }, [setPaintingEnabled]);

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

      {trackingMode === "webgazer" && !calibrated && (
        <CalibrationScreen onCalibrate={calibrate} onComplete={handleCalibrationComplete} />
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

// ?mode=accuracy で視線の精度検証モードを開く。指定が無ければ絵画ビューアー。
export default function App() {
  const mode = new URLSearchParams(window.location.search).get("mode");
  return mode === "accuracy" ? <AccuracyTest /> : <ArtViewer />;
}
