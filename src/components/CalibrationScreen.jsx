import { useEffect, useRef, useState } from "react";

// 四隅+中央の5点。各点を一定時間(DWELL_MS)見つめてもらう間、
// クリック不要で自動的に「この座標を見ているはず」というデータを
// WebGazerへ渡し続ける(注視方式)。多くの市販アイトラッカーでも
// 採用されている標準的な較正手法。
const POINTS = [
  [10, 10], [90, 10],
  [50, 50],
  [10, 90], [90, 90],
];

const DWELL_MS = 2000;
const SAMPLE_INTERVAL_MS = 150;

const RING_RADIUS = 16;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export default function CalibrationScreen({ onCalibrate, onComplete }) {
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const onCalibrateRef = useRef(onCalibrate);
  const onCompleteRef = useRef(onComplete);
  onCalibrateRef.current = onCalibrate;
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const [xPct, yPct] = POINTS[index];
    // requestAnimationFrameのタイムスタンプはフレーム開始時刻であり、
    // ここで別途performance.now()を取ると前後関係が逆転し得る
    // (elapsedが負になりバグの元になる)ため、最初のtick自身から基準を取る。
    let start = null;
    let lastSampleT = 0;
    let raf;

    const tick = (now) => {
      if (start === null) start = now;
      const elapsed = now - start;

      if (elapsed >= DWELL_MS) {
        setProgress(1);
        if (index + 1 < POINTS.length) {
          setIndex(index + 1);
          setProgress(0);
        } else {
          onCompleteRef.current();
        }
        return;
      }

      setProgress(elapsed / DWELL_MS);

      if (now - lastSampleT >= SAMPLE_INTERVAL_MS) {
        lastSampleT = now;
        const px = (xPct / 100) * window.innerWidth;
        const py = (yPct / 100) * window.innerHeight;
        onCalibrateRef.current(px, py);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [index]);

  const [xPct, yPct] = POINTS[index];

  return (
    <div className="calibration">
      <p className="calibration__instructions">
        点を見つめ続けてください（{index + 1} / {POINTS.length}）
      </p>

      <div className="calibration__fixation-dot" style={{ left: `${xPct}%`, top: `${yPct}%` }}>
        <svg viewBox="0 0 36 36" className="calibration__fixation-ring">
          <circle cx="18" cy="18" r={RING_RADIUS} className="calibration__fixation-ring-bg" />
          <circle
            cx="18"
            cy="18"
            r={RING_RADIUS}
            className="calibration__fixation-ring-fill"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={(1 - progress) * RING_CIRCUMFERENCE}
          />
        </svg>
      </div>
    </div>
  );
}
