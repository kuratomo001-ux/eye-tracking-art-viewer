import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GazeTracker } from "../lib/gazeTracker.js";
import { summarizeTrial, aggregate } from "../lib/accuracyMetrics.js";
import CalibrationScreen from "./CalibrationScreen.jsx";

// ウェブカメラ視線で「札サイズの領域」をどこまで識別できるかを測る検証モード。
// 札を模した矩形を、枚数・サイズ・画面上の高さを変えて並べ、光った札を
// 見つめてもらう。結果は「最も近い札を正しく当てられた割合」などで集計する。
const LAYOUTS = [
  { id: "large-3", cards: 3, width: 160, height: 220, gap: 60 },
  { id: "medium-5", cards: 5, width: 120, height: 170, gap: 30 },
  { id: "small-7", cards: 7, width: 90, height: 130, gap: 12 },
];
const ROWS = [
  { id: "upper", label: "上寄り", yRatio: 0.3 },
  { id: "lower", label: "下寄り", yRatio: 0.7 },
];
const DWELL_MS = 3000; // 1試行(1枚)ぶん見つめてもらう時間
const SKIP_MS = 1000; // 視線が札に移るまでの時間は集計から除く

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// レイアウト x 高さの組をブロックとし、ブロック内で見る札の順序をシャッフルする。
function buildTrials() {
  const trials = [];
  for (const layout of LAYOUTS) {
    for (const row of ROWS) {
      const blockId = `${layout.id}-${row.id}`;
      const order = shuffle(Array.from({ length: layout.cards }, (_, i) => i));
      for (const targetIndex of order) {
        trials.push({ blockId, layout, row, targetIndex });
      }
    }
  }
  return trials;
}

const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const px = (v) => (v == null ? "—" : `${Math.round(v)}px`);

export default function AccuracyTest() {
  const [phase, setPhase] = useState("intro"); // intro | starting | unavailable | calibrating | testing | done
  const [trialIndex, setTrialIndex] = useState(0);
  const [results, setResults] = useState([]);
  const trials = useMemo(buildTrials, []);

  const trackerRef = useRef(null);
  if (!trackerRef.current) trackerRef.current = new GazeTracker();
  const cardRefs = useRef([]);
  const samplesRef = useRef([]);
  const collectingRef = useRef(false);

  useEffect(() => {
    const tracker = trackerRef.current;
    const onGaze = (event) => {
      if (!collectingRef.current) return;
      const { x, y, t } = event.detail;
      samplesRef.current.push({ x, y, t });
    };
    tracker.addEventListener("gaze", onGaze);
    return () => {
      tracker.removeEventListener("gaze", onGaze);
      tracker.stop();
    };
  }, []);

  useEffect(() => {
    if (phase === "testing") trackerRef.current.setGazeDotVisible(false);
    if (phase === "done") trackerRef.current.setGazeDotVisible(true);
  }, [phase]);

  const handleStart = useCallback(async () => {
    setPhase("starting");
    const mode = await trackerRef.current.start();
    setPhase(mode === "webgazer" ? "calibrating" : "unavailable");
  }, []);

  const handleCalibrate = useCallback((x, y) => trackerRef.current.calibrate(x, y), []);
  const handleCalibrationComplete = useCallback(() => setPhase("testing"), []);

  useEffect(() => {
    if (phase !== "testing") return;
    const trial = trials[trialIndex];
    samplesRef.current = [];
    const startT = performance.now();
    collectingRef.current = true;

    const timer = setTimeout(() => {
      collectingRef.current = false;
      const rects = cardRefs.current.slice(0, trial.layout.cards).map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      });
      const samples = samplesRef.current.filter((s) => s.t - startT >= SKIP_MS);
      setResults((prev) => [
        ...prev,
        {
          blockId: trial.blockId,
          layoutId: trial.layout.id,
          rowId: trial.row.id,
          cards: trial.layout.cards,
          targetIndex: trial.targetIndex,
          rects,
          summary: summarizeTrial(samples, rects, trial.targetIndex),
          samples,
        },
      ]);
      if (trialIndex + 1 < trials.length) setTrialIndex(trialIndex + 1);
      else setPhase("done");
    }, DWELL_MS);

    return () => {
      clearTimeout(timer);
      collectingRef.current = false;
    };
  }, [phase, trialIndex, trials]);

  const blocks = useMemo(() => {
    const map = new Map();
    for (const r of results) {
      if (!map.has(r.blockId)) {
        const row = ROWS.find((x) => x.id === r.rowId);
        map.set(r.blockId, {
          blockId: r.blockId,
          layoutId: r.layoutId,
          rowId: r.rowId,
          rowLabel: row.label,
          cards: r.cards,
          cardWidthPx: Math.round(r.rects[0].width),
          cardHeightPx: Math.round(r.rects[0].height),
          chance: 1 / r.cards,
          summaries: [],
        });
      }
      map.get(r.blockId).summaries.push(r.summary);
    }
    return [...map.values()].map((b) => ({ ...b, ...aggregate(b.summaries) }));
  }, [results]);

  const download = () => {
    const payload = {
      meta: {
        date: new Date().toISOString(),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        dwellMs: DWELL_MS,
        skipMs: SKIP_MS,
      },
      blocks: blocks.map(({ summaries, ...rest }) => rest),
      trials: results,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `accuracy-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (phase === "calibrating") {
    return <CalibrationScreen onCalibrate={handleCalibrate} onComplete={handleCalibrationComplete} />;
  }

  if (phase === "testing") {
    const trial = trials[trialIndex];
    const { layout, row } = trial;
    return (
      <div className="accuracy">
        <p className="accuracy__prompt">
          光っているカードを見つめてください（{trialIndex + 1} / {trials.length}）
        </p>
        <div
          className="accuracy__row"
          style={{ top: `${row.yRatio * 100}%`, gap: layout.gap }}
        >
          {Array.from({ length: layout.cards }, (_, i) => (
            <div
              key={`${trial.blockId}-${i}`}
              ref={(el) => (cardRefs.current[i] = el)}
              className={`accuracy-card${i === trial.targetIndex ? " accuracy-card--target" : ""}`}
              style={{ width: layout.width, height: layout.height }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="accuracy">
      <div className="accuracy__panel">
        {phase === "intro" && (
          <>
            <h1>視線の精度検証</h1>
            <p>
              Webカメラの視線推定で、札ほどの大きさの領域をどこまで見分けられるかを測ります。
              <br />
              較正のあと、光ったカードを3秒ずつ見つめてください（所要約2分）。映像は外部に送信されません。
            </p>
            <button onClick={handleStart}>Webカメラを起動して開始</button>
          </>
        )}

        {phase === "starting" && <p>Webカメラを起動しています…</p>}

        {phase === "unavailable" && (
          <>
            <p>Webカメラを利用できませんでした。カメラの接続と権限設定を確認してください。</p>
            <button onClick={handleStart}>もう一度試す</button>
          </>
        )}

        {phase === "done" && (
          <>
            <h1>結果</h1>
            <p>「最近傍の札の正答率」が偶然水準を大きく上回る条件なら、その大きさの札は識別できます。</p>
            <table className="accuracy__table">
              <thead>
                <tr>
                  <th>札の枚数</th>
                  <th>札サイズ</th>
                  <th>高さ</th>
                  <th>最近傍の札の正答率</th>
                  <th>偶然水準</th>
                  <th>札内への的中率</th>
                  <th>平均誤差</th>
                </tr>
              </thead>
              <tbody>
                {blocks.map((b) => (
                  <tr key={b.blockId}>
                    <td>{b.cards}枚</td>
                    <td>
                      {b.cardWidthPx}x{b.cardHeightPx}px
                    </td>
                    <td>{b.rowLabel}</td>
                    <td>{pct(b.nearestAccuracy)}</td>
                    <td>{pct(b.chance)}</td>
                    <td>{pct(b.hitRate)}</td>
                    <td>{px(b.meanErrorPx)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={download}>結果をJSONで保存</button>
          </>
        )}
      </div>
    </div>
  );
}
