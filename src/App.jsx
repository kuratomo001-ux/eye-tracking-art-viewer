import { useCallback, useRef, useState } from "react";
import { useGazeMask } from "./hooks/useGazeMask.js";

const artworkSrc = "/assets/artwork.svg";

export default function App() {
  const artworkRef = useRef(null);
  const canvasRef = useRef(null);
  const [completed, setCompleted] = useState(false);

  const handleCompleted = useCallback(() => {
    setCompleted(true);
  }, []);

  const loggerRef = useGazeMask({ artworkRef, canvasRef, onCompleted: handleCompleted });

  return (
    <main className="viewer">
      <img ref={artworkRef} className="viewer__artwork" src={artworkSrc} alt="鑑賞対象の絵画" />
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
