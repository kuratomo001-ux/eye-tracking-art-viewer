import { useCallback, useEffect, useRef } from "react";
import { GazeTracker } from "../lib/gazeTracker.js";
import { ColorRevealRenderer } from "../lib/colorRevealRenderer.js";
import { SessionLogger } from "../lib/sessionLogger.js";

// 線画<img>・陰影色彩の元画像<img>・重ねるcanvasのrefを受け取り、
// 視線推定・段階的な色彩表示・ロギングを配線する。
// Webカメラの起動はユーザー操作をトリガーにしたいため、
// 視線推定の開始(gaze.start())は自動実行せず startTracking() 経由で呼び出す。
// また、キャリブレーション完了までは視線イベントを受けても塗らないよう
// setPaintingEnabled(true) が呼ばれるまでゲートしておく。
export function useColorReveal({ lineArtRef, colorImgRef, canvasRef, onCompleted }) {
  const loggerRef = useRef(null);
  const gazeRef = useRef(null);
  const paintingEnabledRef = useRef(false);
  const sessionStartedRef = useRef(false);

  useEffect(() => {
    const lineArt = lineArtRef.current;
    const colorImg = colorImgRef.current;
    const canvas = canvasRef.current;
    if (!lineArt || !colorImg || !canvas) return;

    const renderer = new ColorRevealRenderer(canvas, colorImg);
    const gaze = new GazeTracker();
    const logger = new SessionLogger();
    loggerRef.current = logger;
    gazeRef.current = gaze;

    const setup = () => {
      renderer.resize(lineArt.clientWidth, lineArt.clientHeight);
    };

    const handleGaze = (event) => {
      if (!paintingEnabledRef.current) return;

      const { x, y, t } = event.detail;
      const rect = lineArt.getBoundingClientRect();
      const localX = x - rect.left;
      const localY = y - rect.top;

      renderer.reveal(localX, localY);
      logger.recordGaze(localX, localY, t);

      if (!logger.isCompleted() && renderer.revealedRatio() > 0.95) {
        logger.markCompleted();
        onCompleted?.(logger);
      }
    };

    const handleResize = () => {
      renderer.resize(lineArt.clientWidth, lineArt.clientHeight);
    };

    gaze.addEventListener("gaze", handleGaze);
    window.addEventListener("resize", handleResize);

    const bothReady = () => lineArt.complete && colorImg.complete;
    if (bothReady()) {
      setup();
    } else {
      lineArt.addEventListener("load", () => bothReady() && setup(), { once: true });
      colorImg.addEventListener("load", () => bothReady() && setup(), { once: true });
    }

    return () => {
      gaze.stop();
      gaze.removeEventListener("gaze", handleGaze);
      window.removeEventListener("resize", handleResize);
    };
  }, [lineArtRef, colorImgRef, canvasRef, onCompleted]);

  // Webカメラへのアクセスをここで初めて要求する。呼び出し元(ボタン等の
  // ユーザー操作)から呼ぶこと。実際に使われたモード("webgazer"|"unavailable")を返す。
  const startTracking = useCallback(() => gazeRef.current?.start(), []);

  // キャリブレーション画面から、クリックした点の座標を教師データとして渡す。
  const calibrate = useCallback((x, y) => gazeRef.current?.calibrate(x, y), []);

  // キャリブレーション完了後に呼ぶ。以降のgazeイベントで実際に塗り始める。
  const setPaintingEnabled = useCallback((enabled) => {
    paintingEnabledRef.current = enabled;
    if (enabled && !sessionStartedRef.current) {
      sessionStartedRef.current = true;
      loggerRef.current?.start();
    }
  }, []);

  return { loggerRef, startTracking, calibrate, setPaintingEnabled };
}
