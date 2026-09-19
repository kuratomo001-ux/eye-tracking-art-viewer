import { useEffect, useRef } from "react";
import { GazeTracker } from "../lib/gazeTracker.js";
import { ColorRevealRenderer } from "../lib/colorRevealRenderer.js";
import { SessionLogger } from "../lib/sessionLogger.js";

// 線画<img>・陰影色彩の元画像<img>・重ねるcanvasのrefを受け取り、
// 視線推定・段階的な色彩表示・ロギングを配線する。
export function useColorReveal({ lineArtRef, colorImgRef, canvasRef, onCompleted }) {
  const loggerRef = useRef(null);

  useEffect(() => {
    const lineArt = lineArtRef.current;
    const colorImg = colorImgRef.current;
    const canvas = canvasRef.current;
    if (!lineArt || !colorImg || !canvas) return;

    const renderer = new ColorRevealRenderer(canvas, colorImg);
    const gaze = new GazeTracker();
    const logger = new SessionLogger();
    loggerRef.current = logger;

    const setup = () => {
      renderer.resize(lineArt.clientWidth, lineArt.clientHeight);
      logger.start();
      gaze.start();
    };

    const handleGaze = (event) => {
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

  return loggerRef;
}
