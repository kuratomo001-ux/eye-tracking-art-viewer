import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GazeTracker } from "../lib/gazeTracker.js";
import { summarizeTrial, aggregate } from "../lib/accuracyMetrics.js";
import CalibrationScreen from "./CalibrationScreen.jsx";

// ウェブカメラ視線で「札サイズの領域」をどこまで識別できるかを測る検証モード。
// 数字読み取りクイズとして進める: 光った札を見る → その札に小さな数字が一瞬出る
// → キーで答える。数字が小さいのでその札を見ないと読めず、見るべき場所が
// 自然に決まる(正解の札が分かる)。答えが合った試行だけを集計に使うので、
// よそ見した試行も除ける。ゲームは視線に反応させない(反応させると、
// 被験者がずれを補正して見てしまい、精度が実際より良く出るため)。
const LAYOUTS = [
  { id: "large-3", cards: 3, width: 160, height: 220, gap: 60 },
  { id: "medium-5", cards: 5, width: 120, height: 170, gap: 30 },
  { id: "small-7", cards: 7, width: 90, height: 130, gap: 12 },
];
const ROWS = [
  { id: "upper", label: "上寄り", yRatio: 0.3 },
  { id: "lower", label: "下寄り", yRatio: 0.7 },
];

const CUE_MS = 1000; // 札が光ってから数字が出るまで(視線を移す時間)
const DIGIT_MS = 600; // 数字を表示する時間
const SKIP_MS = 500; // 光ってから最初のこの時間は、視線が移る途中なので集計から除く
const ANSWER_MAX_MS = 4000; // 答えを待つ上限
const FEEDBACK_MS = 500; // ○×の表示時間
// 大きすぎると周辺視野でも読めてしまい、札を見る必要がなくなる。
const DIGIT_FONT_PX = 14;

// 各条件(枚数x高さ)で、左端・中央・右端の3枚を1回ずつ使う。
function pickTargets(cards) {
  return [0, Math.floor((cards - 1) / 2), cards - 1];
}

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildTrials() {
  const trials = [];
  for (const layout of LAYOUTS) {
    for (const row of ROWS) {
      const blockId = `${layout.id}-${row.id}`;
      for (const targetIndex of shuffle(pickTargets(layout.cards))) {
        trials.push({
          blockId,
          layout,
          row,
          targetIndex,
          digit: 1 + Math.floor(Math.random() * 9),
        });
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
  const [stage, setStage] = useState("cue"); // cue | digit | answer | feedback
  const [feedback, setFeedback] = useState(null);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);
  const trials = useMemo(buildTrials, []);

  const trackerRef = useRef(null);
  if (!trackerRef.current) trackerRef.current = new GazeTracker();
  const cardRefs = useRef([]);
  const samplesRef = useRef([]);
  const collectingRef = useRef(false);
  const stageRef = useRef("cue");

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
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    let captured = null; // 数字の表示が終わった時点で確定する視線の集計
    let settled = false;

    samplesRef.current = [];
    const t0 = performance.now();
    collectingRef.current = true;
    stageRef.current = "cue";
    setStage("cue");
    setFeedback(null);

    // 答え(キー)が入る、または時間切れで1試行を締める。
    const settle = (answerKey) => {
      if (settled) return;
      settled = true;
      const correct = answerKey === String(trial.digit);
      stageRef.current = "feedback";
      setStage("feedback");
      setFeedback({ correct, digit: trial.digit });
      if (correct) setScore((s) => s + 1);
      setResults((prev) => [
        ...prev,
        { ...captured, digit: trial.digit, answerKey, correct, timedOut: answerKey == null },
      ]);
      later(() => {
        if (trialIndex + 1 < trials.length) setTrialIndex(trialIndex + 1);
        else setPhase("done");
      }, FEEDBACK_MS);
    };

    const onKeyDown = (event) => {
      if (stageRef.current !== "answer") return;
      if (/^[1-9]$/.test(event.key)) settle(event.key);
    };
    window.addEventListener("keydown", onKeyDown);

    later(() => {
      stageRef.current = "digit";
      setStage("digit");
    }, CUE_MS);

    later(() => {
      collectingRef.current = false;
      const rects = cardRefs.current.slice(0, trial.layout.cards).map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      });
      const samples = samplesRef.current.filter((s) => s.t - t0 >= SKIP_MS);
      captured = {
        blockId: trial.blockId,
        layoutId: trial.layout.id,
        rowId: trial.row.id,
        cards: trial.layout.cards,
        targetIndex: trial.targetIndex,
        rects,
        summary: summarizeTrial(samples, rects, trial.targetIndex),
        samples,
      };
      stageRef.current = "answer";
      setStage("answer");
      later(() => settle(null), ANSWER_MAX_MS);
    }, CUE_MS + DIGIT_MS);

    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("keydown", onKeyDown);
      collectingRef.current = false;
    };
  }, [phase, trialIndex, trials]);

  // 答えが合った試行だけを条件ごとに集計する。
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
          totalTrials: 0,
          valid: [],
        });
      }
      const b = map.get(r.blockId);
      b.totalTrials++;
      if (r.correct) b.valid.push(r.summary);
    }
    return [...map.values()].map((b) => ({ ...b, validTrials: b.valid.length, ...aggregate(b.valid) }));
  }, [results]);

  const download = () => {
    const payload = {
      meta: {
        date: new Date().toISOString(),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        cueMs: CUE_MS,
        digitMs: DIGIT_MS,
        skipMs: SKIP_MS,
        digitFontPx: DIGIT_FONT_PX,
        score,
      },
      blocks: blocks.map(({ valid, ...rest }) => rest),
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
    const highlighted = stage === "cue" || stage === "digit";

    let prompt = `光ったカードに出る数字を覚えてください（${trialIndex + 1} / ${trials.length}、正解 ${score}）`;
    if (stage === "answer") prompt = "数字は？ 1〜9のキーで答えてください";
    if (stage === "feedback") {
      prompt = feedback?.correct ? "○ 正解！" : `× 正解は ${feedback?.digit}`;
    }

    return (
      <div className="accuracy">
        <p className="accuracy__prompt">{prompt}</p>
        <div className="accuracy__row" style={{ top: `${row.yRatio * 100}%`, gap: layout.gap }}>
          {Array.from({ length: layout.cards }, (_, i) => {
            const isTarget = i === trial.targetIndex;
            return (
              <div
                key={`${trial.blockId}-${i}`}
                ref={(el) => (cardRefs.current[i] = el)}
                className={`accuracy-card${isTarget && highlighted ? " accuracy-card--target" : ""}`}
                style={{ width: layout.width, height: layout.height }}
              >
                {isTarget && stage === "digit" && (
                  <span className="accuracy-card__digit" style={{ fontSize: DIGIT_FONT_PX }}>
                    {trial.digit}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="accuracy">
      <div className="accuracy__panel">
        {phase === "intro" && (
          <>
            <h1>視線の精度検証（数字クイズ）</h1>
            <p>
              較正のあと、光ったカードに小さな数字が一瞬だけ出ます。見えた数字を1〜9のキーで答えてください（全{trials.length}問、約1分）。
              <br />
              数字は小さいので、光ったカードをしっかり見ないと読めません。映像は外部に送信されません。
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
            <p>
              クイズの正解は {score} / {trials.length}。答えが合った問題だけを集計しています。
              <br />
              「最近傍の札の正答率」が偶然水準を大きく上回る条件なら、その大きさの札は識別できます。
            </p>
            <table className="accuracy__table">
              <thead>
                <tr>
                  <th>札の枚数</th>
                  <th>札サイズ</th>
                  <th>高さ</th>
                  <th>有効な問題</th>
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
                    <td>
                      {b.validTrials}/{b.totalTrials}
                    </td>
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
