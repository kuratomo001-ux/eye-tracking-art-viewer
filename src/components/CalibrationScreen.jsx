import { useEffect, useRef, useState } from "react";

// 画面を3x3に分けたジグザグ経路(9点)。点が滑らかに移動する間、
// 一定間隔で「今この座標を見ているはず」という教師データを自動的に
// WebGazerへ渡す(スムーズパシュート較正)。クリック方式と違って
// ユーザーの操作が不要で、かつ経路上の連続した点をすべて学習データに
// できるため、少ないクリック数よりずっと多くのサンプルを集められる。
const WAYPOINTS = [
  [10, 10], [50, 10], [90, 10],
  [90, 50], [50, 50], [10, 50],
  [10, 90], [50, 90], [90, 90],
];

const SEGMENT_DURATION_MS = 1200;
const SAMPLE_INTERVAL_MS = 150;

export default function CalibrationScreen({ onCalibrate, onComplete }) {
  const [pos, setPos] = useState(WAYPOINTS[0]);
  const [progress, setProgress] = useState(0);
  const onCalibrateRef = useRef(onCalibrate);
  const onCompleteRef = useRef(onComplete);
  onCalibrateRef.current = onCalibrate;
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const totalSegments = WAYPOINTS.length - 1;
    const totalDuration = totalSegments * SEGMENT_DURATION_MS;
    // requestAnimationFrameが渡すタイムスタンプは「フレーム開始時刻」であり、
    // ここでperformance.now()を呼んだ時点より前になることがある(その場合
    // elapsedが負になり、WAYPOINTSの範囲外アクセスでクラッシュする)。
    // 最初のtick呼び出し自体から基準時刻を取ることで回避する。
    let start = null;
    let lastSampleT = 0;
    let raf;

    const tick = (now) => {
      if (start === null) start = now;
      const elapsed = now - start;

      if (elapsed >= totalDuration) {
        setPos(WAYPOINTS[WAYPOINTS.length - 1]);
        setProgress(1);
        onCompleteRef.current();
        return;
      }

      const segmentIndex = Math.min(
        Math.floor(elapsed / SEGMENT_DURATION_MS),
        totalSegments - 1
      );
      const segmentT = (elapsed - segmentIndex * SEGMENT_DURATION_MS) / SEGMENT_DURATION_MS;
      const [x0, y0] = WAYPOINTS[segmentIndex];
      const [x1, y1] = WAYPOINTS[segmentIndex + 1];
      const xPct = x0 + (x1 - x0) * segmentT;
      const yPct = y0 + (y1 - y0) * segmentT;

      setPos([xPct, yPct]);
      setProgress(elapsed / totalDuration);

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
  }, []);

  const [xPct, yPct] = pos;

  return (
    <div className="calibration">
      <p className="calibration__instructions">動く点を目で追いかけてください</p>

      <div className="calibration__pursuit-dot" style={{ left: `${xPct}%`, top: `${yPct}%` }} />

      <div className="calibration__progress-track">
        <div className="calibration__progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}
