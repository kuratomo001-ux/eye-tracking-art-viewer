import { useState } from "react";

// 四隅+中央の5点。各点を見ながら規定回数クリックしてもらうことで、
// WebGazerの視線推定モデルに「この座標を見ているときの目の特徴」を教える。
// 9点x5回(45クリック)は手間が大きかったため簡略化した。
const POINTS = [
  [10, 10], [90, 10],
  [50, 50],
  [10, 90], [90, 90],
];

const CLICKS_PER_POINT = 3;

export default function CalibrationScreen({ onCalibrate, onComplete }) {
  const [counts, setCounts] = useState(() => POINTS.map(() => 0));

  const handleClick = (index, event) => {
    if (counts[index] >= CLICKS_PER_POINT) return;
    onCalibrate(event.clientX, event.clientY);
    setCounts((prev) => {
      const next = [...prev];
      next[index] += 1;
      return next;
    });
  };

  const allDone = counts.every((c) => c >= CLICKS_PER_POINT);

  return (
    <div className="calibration">
      <p className="calibration__instructions">
        各点を見つめながら、{CLICKS_PER_POINT}回クリックしてください。
      </p>

      {POINTS.map(([xPct, yPct], i) => {
        const done = counts[i] >= CLICKS_PER_POINT;
        return (
          <button
            key={i}
            type="button"
            className="calibration__dot"
            style={{ left: `${xPct}%`, top: `${yPct}%` }}
            disabled={done}
            onClick={(event) => handleClick(i, event)}
            aria-label={`キャリブレーション点 ${i + 1}`}
          >
            {done ? "✓" : CLICKS_PER_POINT - counts[i]}
          </button>
        );
      })}

      {allDone && (
        <button type="button" className="calibration__done" onClick={onComplete}>
          較正完了 → 鑑賞をはじめる
        </button>
      )}
    </div>
  );
}
