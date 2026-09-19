import { useEffect, useRef } from "react";
import { GazeTracker } from "../lib/gazeTracker.js";
import { MaskRenderer } from "../lib/maskRenderer.js";
import { SessionLogger } from "../lib/sessionLogger.js";

// 画像要素とcanvas要素のrefを受け取り、視線推定・マスク描画・
// ロギングを配線する。UI側はrefを渡すだけでよく、canvas操作の
// 詳細を意識しなくてよいようにする。
export function useGazeMask({ artworkRef, canvasRef, onCompleted }) {
  const loggerRef = useRef(null);

  useEffect(() => {
    const artwork = artworkRef.current;
    const canvas = canvasRef.current;
    if (!artwork || !canvas) return;

    const mask = new MaskRenderer(canvas);
    const gaze = new GazeTracker();
    const logger = new SessionLogger();
    loggerRef.current = logger;

    const setup = () => {
      mask.resize(artwork.clientWidth, artwork.clientHeight);
      logger.start();
      gaze.start();
    };

    const handleGaze = (event) => {
      const { x, y, t } = event.detail;
      const rect = artwork.getBoundingClientRect();
      const localX = x - rect.left;
      const localY = y - rect.top;

      mask.reveal(localX, localY);
      logger.recordGaze(localX, localY, t);

      if (!logger.isCompleted() && mask.revealedRatio() > 0.95) {
        logger.markCompleted();
        onCompleted?.(logger);
      }
    };

    const handleResize = () => {
      mask.resize(artwork.clientWidth, artwork.clientHeight);
    };

    gaze.addEventListener("gaze", handleGaze);
    window.addEventListener("resize", handleResize);

    if (artwork.complete) {
      setup();
    } else {
      artwork.addEventListener("load", setup, { once: true });
    }

    return () => {
      gaze.stop();
      gaze.removeEventListener("gaze", handleGaze);
      window.removeEventListener("resize", handleResize);
      artwork.removeEventListener("load", setup);
    };
  }, [artworkRef, canvasRef, onCompleted]);

  return loggerRef;
}
