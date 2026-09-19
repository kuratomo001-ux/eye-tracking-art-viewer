import { useCallback, useRef, useState } from "react";
import { useColorReveal } from "./hooks/useColorReveal.js";

const lineArtSrc = `${import.meta.env.BASE_URL}assets/artwork-lineart.svg`;
const colorSrc = `${import.meta.env.BASE_URL}assets/artwork-color.svg`;

export default function App() {
  const lineArtRef = useRef(null);
  const colorImgRef = useRef(null);
  const canvasRef = useRef(null);
  const [completed, setCompleted] = useState(false);

  const handleCompleted = useCallback(() => {
    setCompleted(true);
  }, []);

  const loggerRef = useColorReveal({
    lineArtRef,
    colorImgRef,
    canvasRef,
    onCompleted: handleCompleted,
  });

  return (
    <main className="viewer">
      <img ref={lineArtRef} className="viewer__lineart" src={lineArtSrc} alt="鑑賞対象の絵画(線画)" />
      <img ref={colorImgRef} className="viewer__colorSource" src={colorSrc} alt="" aria-hidden="true" />
      <canvas ref={canvasRef} className="viewer__mask" />

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
