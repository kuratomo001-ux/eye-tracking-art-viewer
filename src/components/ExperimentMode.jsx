import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GazeTracker } from "../lib/gazeTracker.js";
import { computeAttentionTimes, computeDwell, computeVisits, summarizeAttention } from "../lib/aoi.js";
import { dispersion, meanCenterDistance, pathLength, pxToDegrees } from "../lib/gazeMetrics.js";
import { buildPlan, COLOR_FILTER, FACTORS, SIZE_SCALE } from "../lib/experimentPlan.js";
import { AOIS_BY_ART } from "../data/aois.js";
import { artworkSources } from "../artworks.js";
import CalibrationScreen from "./CalibrationScreen.jsx";

// 実験モード: 絵の見せ方(色・画面サイズ・情報量のどれか1つ)を変えて、人物画・風景画・室内画を
// 順に見てもらい、視線(滞在時間・見る順番・散らばり・移動距離)を記録する。
// 条件(要因)ごとに別の実験として分けてあり、どの要因かは factor で固定する(App.jsxで?factor=から渡す)。
// 「条件を変えると視線は変わるか」を調べるための、仮説検証用の流れ。
// 割り当ての考え方は lib/experimentPlan.js を参照。
const SESSION_ARTS = ["bedroom", "wheat", "portrait"]; // 室内画・風景画・人物画
const DURATIONS_SEC = [30, 60];
const THRESHOLD_MS = 1000; // 「注目した」の既定。生のサンプルを保存するので、後から変えて集計し直せる
const MIN_VISIT_MS = 200;
const FIXATION_MS = 1500; // 作品を出す前に中央を見てもらい、毎回同じ位置から始める
const EXPERIENCES = ["なし", "少しある", "ある"];

const sec = (ms) => (ms / 1000).toFixed(1);
const pct = (v) => `${Math.round(v * 100)}%`;
const levelLabel = (factor, id) => FACTORS[factor].levels.find((l) => l.id === id).label;

export default function ExperimentMode({ factor }) {
  const factorInfo = FACTORS[factor];
  const [phase, setPhase] = useState("setup"); // setup | starting | unavailable | calibrating | ready | fixation | viewing | done
  const [form, setForm] = useState({
    participantId: "",
    group: 1,
    durationSec: 60,
    distanceCm: "",
    screenWidthCm: "",
    experience: EXPERIENCES[0],
  });
  const [trialIndex, setTrialIndex] = useState(0);
  const [results, setResults] = useState([]);
  const [aspects, setAspects] = useState({});

  const trackerRef = useRef(null);
  if (!trackerRef.current) trackerRef.current = new GazeTracker();
  const paintingRef = useRef(null);

  const sources = useMemo(() => Object.fromEntries(SESSION_ARTS.map((k) => [k, artworkSources(k)])), []);
  const plan = useMemo(
    () => buildPlan({ factor, group: form.group - 1, arts: SESSION_ARTS }),
    [factor, form.group],
  );
  const trial = plan[trialIndex];

  // 画像の縦横比は、読み込んでから分かる。表示サイズを決めるので、先に全部読んでおく。
  useEffect(() => {
    for (const key of SESSION_ARTS) {
      const img = new Image();
      img.onload = () => setAspects((a) => ({ ...a, [key]: img.naturalWidth / img.naturalHeight }));
      img.src = sources[key].colorSrc;
      new Image().src = sources[key].simpleSrc;
    }
  }, [sources]);

  useEffect(() => {
    const tracker = trackerRef.current;
    return () => tracker.stop();
  }, []);

  useEffect(() => {
    trackerRef.current.setGazeDotVisible(phase !== "fixation" && phase !== "viewing");
  }, [phase]);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const viewing = useMemo(
    () => ({
      distanceCm: Number(form.distanceCm) || null,
      screenWidthCm: Number(form.screenWidthCm) || null,
      screenWidthPx: window.screen.width,
    }),
    [form.distanceCm, form.screenWidthCm],
  );

  const handleStart = useCallback(async () => {
    setPhase("starting");
    const mode = await trackerRef.current.start();
    setPhase(mode === "webgazer" ? "calibrating" : "unavailable");
  }, []);
  const handleCalibrate = useCallback((x, y) => trackerRef.current.calibrate(x, y), []);
  const handleCalibrationComplete = useCallback(() => setPhase("ready"), []);

  // 表示サイズ: 画面に収まる最大サイズを「大」とし、その割合で縮小する。
  const aspect = trial ? aspects[trial.art] ?? 1 : 1;
  const fitWidth = Math.min(window.innerWidth * 0.96, window.innerHeight * 0.92 * aspect);
  const displayWidth = trial ? Math.round(fitWidth * SIZE_SCALE[trial.condition.size]) : 0;
  const displayHeight = Math.round(displayWidth / aspect);

  // 中央の十字を見せてから、作品を出す。
  useEffect(() => {
    if (phase !== "fixation") return;
    const timer = setTimeout(() => setPhase("viewing"), FIXATION_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "viewing") return;
    const tracker = trackerRef.current;
    const aois = AOIS_BY_ART[trial.art];
    const rect = paintingRef.current.getBoundingClientRect();
    const t0 = performance.now();
    const samples = [];

    const onGaze = (event) => {
      const { x, y, t } = event.detail;
      samples.push({ t: t - t0, x, y, u: (x - rect.left) / rect.width, v: (y - rect.top) / rect.height });
    };
    tracker.addEventListener("gaze", onGaze);

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      tracker.removeEventListener("gaze", onGaze);
      const inside = samples.filter((s) => s.u >= 0 && s.u <= 1 && s.v >= 0 && s.v <= 1);
      const dwell = computeDwell(samples, aois);
      const attendedAt = computeAttentionTimes(samples, aois, THRESHOLD_MS);
      const summary = summarizeAttention(dwell, aois, THRESHOLD_MS, attendedAt);
      const visits = computeVisits(samples, aois, { minVisitMs: MIN_VISIT_MS });
      const dispersionPx = dispersion(inside);
      const pathPx = pathLength(inside);
      setResults((rs) => [
        ...rs,
        {
          trial,
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          elapsedMs: performance.now() - t0,
          samples,
          summary,
          visits,
          outsideMs: dwell.outsideMs,
          metrics: {
            dispersionPx,
            dispersionDeg: pxToDegrees(dispersionPx, viewing),
            pathLengthPx: pathPx,
            pathLengthDeg: pxToDegrees(pathPx, viewing),
            meanCenterDistance: meanCenterDistance(samples, rect.width / rect.height),
          },
        },
      ]);
      const last = trialIndex + 1 >= plan.length;
      setTrialIndex(trialIndex + 1);
      setPhase(last ? "done" : "ready");
    };
    const timer = setTimeout(finish, form.durationSec * 1000);
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        clearTimeout(timer);
        finish();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      clearTimeout(timer);
      tracker.removeEventListener("gaze", onGaze);
      window.removeEventListener("keydown", onKeyDown);
    };
    // 鑑賞中に別の値が変わっても、記録を取り直さない(開始時の値で動かす)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const labelOf = (art, id) => (id === null ? "作品の外" : AOIS_BY_ART[art].find((a) => a.id === id).label);

  const download = () => {
    const payload = {
      meta: {
        date: new Date().toISOString(),
        participantId: form.participantId,
        group: form.group,
        factor,
        artExperience: form.experience,
        durationSec: form.durationSec,
        viewing,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        thresholdMs: THRESHOLD_MS,
        minVisitMs: MIN_VISIT_MS,
        fixationMs: FIXATION_MS,
        plan: plan.map((t) => ({ position: t.position, art: t.art, level: t.level })),
      },
      trials: results.map((r) => ({
        position: r.trial.position,
        art: r.trial.art,
        genre: sources[r.trial.art].genre,
        condition: r.trial.condition,
        display: {
          leftPx: Math.round(r.rect.left),
          topPx: Math.round(r.rect.top),
          widthPx: Math.round(r.rect.width),
          heightPx: Math.round(r.rect.height),
        },
        elapsedMs: Math.round(r.elapsedMs),
        sampleCount: r.samples.length,
        metrics: r.metrics,
        aois: r.summary.rows,
        visits: r.visits.map((v) => ({
          id: v.id,
          startMs: Math.round(v.startMs),
          endMs: Math.round(v.endMs),
          durationMs: Math.round(v.durationMs),
        })),
        outsideMs: r.outsideMs,
        samples: r.samples.map((s) => ({
          t: Math.round(s.t),
          x: Math.round(s.x),
          y: Math.round(s.y),
          u: Number(s.u.toFixed(4)),
          v: Number(s.v.toFixed(4)),
        })),
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `experiment-${form.participantId || "anon"}-${factor}-g${form.group}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const restart = () => {
    setResults([]);
    setTrialIndex(0);
    setPhase("setup");
  };

  if (phase === "calibrating") {
    return <CalibrationScreen onCalibrate={handleCalibrate} onComplete={handleCalibrationComplete} />;
  }

  if (phase === "fixation") {
    return (
      <div className="observe">
        <div className="experiment__fixation">+</div>
      </div>
    );
  }

  if (phase === "viewing") {
    const { condition } = trial;
    return (
      <div className="observe">
        <div className="observe__stage">
          <img
            ref={paintingRef}
            className="observe__painting"
            src={condition.info === "simple" ? sources[trial.art].simpleSrc : sources[trial.art].colorSrc}
            alt="鑑賞する作品"
            style={{ width: displayWidth, height: displayHeight, filter: COLOR_FILTER[condition.color] }}
          />
        </div>
        <div className="observe__progress" style={{ animationDuration: `${form.durationSec}s` }} />
      </div>
    );
  }

  return (
    <div className="observe">
      <div className="observe__panel">
        {phase === "setup" && (
          <>
            <h1>実験: {factorInfo.label}</h1>
            <p>{factorInfo.intro}</p>
            <p>
              3つの作品（室内画・風景画・人物画）を順に鑑賞します。1人が同じ作品を見るのは1回です。
              作品と条件の組み合わせは、グループ番号で決まります。
              <br />
              鑑賞中はEscキーで途中終了できます。映像は外部に送信されません。
            </p>
            <div className="observe__options">
              <fieldset>
                <legend>参加者</legend>
                <label className="observe__check">
                  ID:{" "}
                  <input
                    type="text"
                    placeholder="例: P01（氏名は入れない）"
                    value={form.participantId}
                    onChange={(e) => set("participantId")(e.target.value)}
                  />
                </label>
                <label className="observe__check">
                  グループ:{" "}
                  <select value={form.group} onChange={(e) => set("group")(Number(e.target.value))}>
                    {[1, 2, 3].map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="observe__check">
                  美術の経験:{" "}
                  <select value={form.experience} onChange={(e) => set("experience")(e.target.value)}>
                    {EXPERIENCES.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
              </fieldset>
              <fieldset>
                <legend>鑑賞時間（1作品）</legend>
                {DURATIONS_SEC.map((d) => (
                  <label key={d}>
                    <input
                      type="radio"
                      name="duration"
                      checked={form.durationSec === d}
                      onChange={() => set("durationSec")(d)}
                    />
                    {d}秒
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>見る距離と画面（視角に換算）{factorInfo.needsViewing ? "（必須）" : ""}</legend>
                <label className="observe__check">
                  画面までの距離（cm）:{" "}
                  <input type="number" min="0" value={form.distanceCm} onChange={(e) => set("distanceCm")(e.target.value)} />
                </label>
                <label className="observe__check">
                  画面の横幅（cm）:{" "}
                  <input
                    type="number"
                    min="0"
                    value={form.screenWidthCm}
                    onChange={(e) => set("screenWidthCm")(e.target.value)}
                  />
                </label>
              </fieldset>
            </div>
            <p className="observe__note">
              このグループの順番と条件:{" "}
              {plan
                .map((t) => `${t.position + 1}. ${sources[t.art].genre}（${levelLabel(factor, t.level)}）`)
                .join(" → ")}
            </p>
            <button onClick={handleStart} disabled={factorInfo.needsViewing && !(viewing.distanceCm && viewing.screenWidthCm)}>
              Webカメラを起動して開始
            </button>
          </>
        )}

        {phase === "starting" && <p>Webカメラを起動しています…</p>}

        {phase === "unavailable" && (
          <>
            <p>Webカメラを利用できませんでした。カメラの接続と権限設定を確認してください。</p>
            <button onClick={handleStart}>もう一度試す</button>
          </>
        )}

        {phase === "ready" && trial && (
          <>
            <h1>
              作品 {trialIndex + 1} / {plan.length}
            </h1>
            <p>
              準備ができたらボタンを押してください。中央の＋を見たあと、作品が表示されます。自由に鑑賞してください（{form.durationSec}秒）。
            </p>
            <div className="observe__actions">
              <button onClick={() => setPhase("fixation")}>表示する</button>
              <button onClick={() => setPhase("calibrating")}>較正をやり直す</button>
            </div>
          </>
        )}

        {phase === "done" && (
          <>
            <h1>終了</h1>
            <p>
              {results.length}作品の記録が取れました。JSONで保存してください。
            </p>
            <table className="observe__table">
              <thead>
                <tr>
                  <th>順</th>
                  <th>作品</th>
                  <th>条件</th>
                  <th>最も長く見た領域</th>
                  <th>注目した領域</th>
                  <th>散らばり</th>
                  <th>移動距離</th>
                  <th>サンプル</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const top = [...r.summary.rows].sort((a, b) => b.dwellMs - a.dwellMs)[0];
                  const deg = (px, d) => (d === null ? `${Math.round(px)}px` : `${d.toFixed(1)}°`);
                  return (
                    <tr key={r.trial.position}>
                      <td>{r.trial.position + 1}</td>
                      <td>
                        {sources[r.trial.art].title}（{sources[r.trial.art].genre}）
                      </td>
                      <td>{levelLabel(r.trial.factor, r.trial.level)}</td>
                      <td>{top.dwellMs > 0 ? `${top.label} ${pct(top.share)}` : "—"}</td>
                      <td>
                        {r.summary.attendedCount} / {r.summary.totalCount}
                      </td>
                      <td>
                        {r.metrics.dispersionPx === null ? "—" : deg(r.metrics.dispersionPx, r.metrics.dispersionDeg)}
                      </td>
                      <td>
                        {r.metrics.pathLengthPx === null ? "—" : deg(r.metrics.pathLengthPx, r.metrics.pathLengthDeg)}
                      </td>
                      <td>
                        {r.samples.length}（{(r.samples.length / (r.elapsedMs / 1000)).toFixed(1)}Hz）
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {results.map((r) => (
              <details key={r.trial.position}>
                <summary>
                  {sources[r.trial.art].title}の見た順番（領域の遷移）
                </summary>
                <p className="observe__note">
                  {r.visits.map((v) => `${labelOf(r.trial.art, v.id)}（${sec(v.startMs)}〜${sec(v.endMs)}秒）`).join(" → ") ||
                    "記録なし"}
                </p>
              </details>
            ))}
            <p className="observe__note">
              散らばり＝視線の重心からの距離。移動距離＝視線の動いた長さの合計。
              画面までの距離と画面の横幅を入れていれば度、入れていなければpxで表示します。
            </p>
            <div className="observe__actions">
              <button onClick={download}>結果をJSONで保存</button>
              <button onClick={restart}>最初から</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
