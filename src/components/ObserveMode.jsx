import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GazeTracker } from "../lib/gazeTracker.js";
import { computeAttentionTimes, computeDwell, computeVisits, summarizeAttention } from "../lib/aoi.js";
import { AOIS_BY_ART } from "../data/aois.js";
import { resolveArtwork } from "../artworks.js";
import CalibrationScreen from "./CalibrationScreen.jsx";

// 観察モード: 作品を全体表示して自由に鑑賞してもらい、視線を記録して、
// 領域(AOI)ごとの滞在時間と「注目したか」を集計する。
// 「精度と視線の傾向を取得する」段階のためのモードで、作品の見え方を変えたり
// 気づきを促したりはしない。表示サイズを変えられるのは、視線の誤差が角度なので、
// 大きく表示するほど領域を判別しやすくなる(表示サイズが精度に効く)ため。
const SIZES = [
  { id: "small", label: "小", scale: 0.5 },
  { id: "medium", label: "中", scale: 0.75 },
  { id: "large", label: "大（画面いっぱい）", scale: 1 },
];
const DURATIONS_SEC = [30, 60, 120];
const DEFAULT_THRESHOLD_MS = 1000; // 「注目した」とみなす累積滞在時間の既定値(パイロットで決める)
const FIGURE_WIDTH = 640;
// これより短い滞在は、領域の境界付近の視線の揺れとみなして、遷移の列から除く。
const MIN_VISIT_MS = 200;

const ATTENDED_FILL = "rgba(68, 187, 164, 0.4)";
const UNATTENDED_FILL = "rgba(233, 79, 55, 0.4)";

const sec = (ms) => (ms / 1000).toFixed(1);
const pct = (v) => `${Math.round(v * 100)}%`;
const centroid = (polygon) => {
  const n = polygon.length;
  return [polygon.reduce((s, p) => s + p[0], 0) / n, polygon.reduce((s, p) => s + p[1], 0) / n];
};

export default function ObserveMode() {
  const { key: artKey, colorSrc } = useMemo(resolveArtwork, []);
  const aois = AOIS_BY_ART[artKey];

  const [phase, setPhase] = useState("intro"); // intro | starting | unavailable | calibrating | viewing | done
  const [sizeId, setSizeId] = useState("large");
  const [durationSec, setDurationSec] = useState(60);
  const [aspect, setAspect] = useState(900 / 714);
  const [result, setResult] = useState(null);
  const [thresholdMs, setThresholdMs] = useState(DEFAULT_THRESHOLD_MS);
  const [showPoints, setShowPoints] = useState(true);

  const trackerRef = useRef(null);
  if (!trackerRef.current) trackerRef.current = new GazeTracker();
  const paintingRef = useRef(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setAspect(img.naturalWidth / img.naturalHeight);
    img.src = colorSrc;
  }, [colorSrc]);

  useEffect(() => {
    const tracker = trackerRef.current;
    return () => tracker.stop();
  }, []);

  useEffect(() => {
    if (phase === "viewing") trackerRef.current.setGazeDotVisible(false);
    if (phase === "done") trackerRef.current.setGazeDotVisible(true);
  }, [phase]);

  const handleStart = useCallback(async () => {
    setPhase("starting");
    const mode = await trackerRef.current.start();
    setPhase(mode === "webgazer" ? "calibrating" : "unavailable");
  }, []);

  const handleCalibrate = useCallback((x, y) => trackerRef.current.calibrate(x, y), []);
  const handleCalibrationComplete = useCallback(() => setPhase("viewing"), []);

  // 表示サイズ: 画面に収まる最大サイズを「大」とし、その割合で縮小する。
  const scale = SIZES.find((s) => s.id === sizeId).scale;
  const fitWidth = Math.min(window.innerWidth * 0.96, window.innerHeight * 0.92 * aspect);
  const displayWidth = Math.round(fitWidth * scale);
  const displayHeight = Math.round(displayWidth / aspect);

  useEffect(() => {
    if (phase !== "viewing") return;
    const tracker = trackerRef.current;
    const rect = paintingRef.current.getBoundingClientRect();
    const t0 = performance.now();
    const samples = [];

    const onGaze = (event) => {
      const { x, y, t } = event.detail;
      samples.push({
        t: t - t0,
        x,
        y,
        u: (x - rect.left) / rect.width,
        v: (y - rect.top) / rect.height,
      });
    };
    tracker.addEventListener("gaze", onGaze);

    const finish = () => {
      tracker.removeEventListener("gaze", onGaze);
      setResult({
        samples,
        elapsedMs: performance.now() - t0,
        displayWidthPx: rect.width,
        displayHeightPx: rect.height,
        displayLeftPx: rect.left,
        displayTopPx: rect.top,
      });
      setPhase("done");
    };
    const timer = setTimeout(finish, durationSec * 1000);
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
  }, [phase, durationSec]);

  const dwell = useMemo(() => (result ? computeDwell(result.samples, aois) : null), [result, aois]);
  const summary = useMemo(() => {
    if (!dwell) return null;
    const attendedAt = computeAttentionTimes(result.samples, aois, thresholdMs);
    return summarizeAttention(dwell, aois, thresholdMs, attendedAt);
  }, [dwell, result, aois, thresholdMs]);
  const visits = useMemo(
    () => (result ? computeVisits(result.samples, aois, { minVisitMs: MIN_VISIT_MS }) : null),
    [result, aois],
  );
  const labelOf = (id) => (id === null ? "作品の外" : aois.find((a) => a.id === id).label);

  const download = () => {
    const payload = {
      meta: {
        date: new Date().toISOString(),
        art: artKey,
        displaySize: sizeId,
        displayWidthPx: Math.round(result.displayWidthPx),
        displayHeightPx: Math.round(result.displayHeightPx),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        durationSec,
        elapsedMs: Math.round(result.elapsedMs),
        sampleCount: result.samples.length,
        thresholdMs,
      },
      aois: summary.rows,
      visits: visits.map((v) => ({
        id: v.id,
        startMs: Math.round(v.startMs),
        endMs: Math.round(v.endMs),
        durationMs: Math.round(v.durationMs),
      })),
      minVisitMs: MIN_VISIT_MS,
      outsideMs: dwell.outsideMs,
      samples: result.samples.map((s) => ({
        t: Math.round(s.t),
        x: Math.round(s.x),
        y: Math.round(s.y),
        u: Number(s.u.toFixed(4)),
        v: Number(s.v.toFixed(4)),
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `observe-${artKey}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const retry = () => {
    setResult(null);
    setPhase("calibrating");
  };

  if (phase === "calibrating") {
    return <CalibrationScreen onCalibrate={handleCalibrate} onComplete={handleCalibrationComplete} />;
  }

  if (phase === "viewing") {
    return (
      <div className="observe">
        <div className="observe__stage">
          <img
            ref={paintingRef}
            className="observe__painting"
            src={colorSrc}
            alt="鑑賞する作品"
            style={{ width: displayWidth, height: displayHeight }}
          />
        </div>
        <div className="observe__progress" style={{ animationDuration: `${durationSec}s` }} />
      </div>
    );
  }

  return (
    <div className="observe">
      <div className="observe__panel">
        {phase === "intro" && (
          <>
            <h1>観察モード</h1>
            {!aois ? (
              <p>この作品（{artKey}）は領域が未定義です。`?mode=observe&amp;art=bedroom` で開いてください。</p>
            ) : (
              <>
                <p>
                  較正のあと、作品を自由に鑑賞してください。視線を記録し、領域ごとの滞在時間を集計します。
                  <br />
                  鑑賞中は、Escキーで途中終了できます。映像は外部に送信されません。
                </p>
                <div className="observe__options">
                  <fieldset>
                    <legend>表示サイズ</legend>
                    {SIZES.map((s) => (
                      <label key={s.id}>
                        <input
                          type="radio"
                          name="size"
                          checked={sizeId === s.id}
                          onChange={() => setSizeId(s.id)}
                        />
                        {s.label}
                      </label>
                    ))}
                  </fieldset>
                  <fieldset>
                    <legend>鑑賞時間</legend>
                    {DURATIONS_SEC.map((d) => (
                      <label key={d}>
                        <input
                          type="radio"
                          name="duration"
                          checked={durationSec === d}
                          onChange={() => setDurationSec(d)}
                        />
                        {d}秒
                      </label>
                    ))}
                  </fieldset>
                </div>
                <button onClick={handleStart}>Webカメラを起動して開始</button>
              </>
            )}
          </>
        )}

        {phase === "starting" && <p>Webカメラを起動しています…</p>}

        {phase === "unavailable" && (
          <>
            <p>Webカメラを利用できませんでした。カメラの接続と権限設定を確認してください。</p>
            <button onClick={handleStart}>もう一度試す</button>
          </>
        )}

        {phase === "done" && result && summary && (
          <>
            <h1>結果</h1>
            <p>
              記録した視線サンプル: {result.samples.length}（鑑賞 {sec(result.elapsedMs)}秒、平均{" "}
              {(result.samples.length / (result.elapsedMs / 1000)).toFixed(1)}Hz）。
              <br />
              「注目した」＝領域内の累積滞在時間が閾値以上。注目した領域: {summary.attendedCount} /{" "}
              {summary.totalCount}（網羅率 {pct(summary.coverage)}）
            </p>
            <div className="observe__results">
              <div>
                <div className="observe__figure" style={{ width: FIGURE_WIDTH, height: FIGURE_WIDTH / aspect }}>
                  <img src={colorSrc} width={FIGURE_WIDTH} height={FIGURE_WIDTH / aspect} alt="" />
                  <svg
                    className="observe__overlay"
                    width={FIGURE_WIDTH}
                    height={FIGURE_WIDTH / aspect}
                    viewBox={`0 0 ${FIGURE_WIDTH} ${FIGURE_WIDTH / aspect}`}
                  >
                    {aois
                      .filter((a) => a.id !== "otherWall")
                      .map((a) => {
                        const row = summary.rows.find((r) => r.id === a.id);
                        const [cx, cy] = centroid(a.polygon);
                        return (
                          <g key={a.id}>
                            <polygon
                              points={a.polygon
                                .map(([u, v]) => `${u * FIGURE_WIDTH},${(v * FIGURE_WIDTH) / aspect}`)
                                .join(" ")}
                              fill={row.attended ? ATTENDED_FILL : UNATTENDED_FILL}
                              stroke="white"
                              strokeWidth="1.5"
                            />
                            <text
                              x={cx * FIGURE_WIDTH}
                              y={(cy * FIGURE_WIDTH) / aspect}
                              className="observe__label"
                              textAnchor="middle"
                            >
                              {row.order ? `${row.order}. ${a.label}` : a.label}
                            </text>
                          </g>
                        );
                      })}
                    {showPoints &&
                      result.samples
                        .filter((s) => s.u >= 0 && s.u <= 1 && s.v >= 0 && s.v <= 1)
                        .map((s, i) => (
                          <circle
                            key={i}
                            cx={s.u * FIGURE_WIDTH}
                            cy={(s.v * FIGURE_WIDTH) / aspect}
                            r="2"
                            fill="white"
                            fillOpacity="0.7"
                          />
                        ))}
                  </svg>
                </div>
                <label className="observe__check">
                  <input type="checkbox" checked={showPoints} onChange={(e) => setShowPoints(e.target.checked)} />
                  視線の点を表示
                </label>
              </div>
              <div>
                <label className="observe__check">
                  閾値（ms）:{" "}
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={thresholdMs}
                    onChange={(e) => setThresholdMs(Math.max(0, Number(e.target.value) || 0))}
                  />
                </label>
                <table className="observe__table">
                  <thead>
                    <tr>
                      <th>領域</th>
                      <th>滞在</th>
                      <th>割合</th>
                      <th>注目</th>
                      <th>注目した順</th>
                      <th>注目した時刻</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.rows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.label}</td>
                        <td>{sec(r.dwellMs)}秒</td>
                        <td>{pct(r.share)}</td>
                        <td className={r.attended ? "observe__attended" : "observe__unattended"}>
                          {r.attended ? "○" : "×"}
                        </td>
                        <td>{r.order ?? "—"}</td>
                        <td>{r.attendedAtMs === null ? "—" : `${sec(r.attendedAtMs)}秒`}</td>
                      </tr>
                    ))}
                    <tr>
                      <td>作品の外</td>
                      <td>{sec(dwell.outsideMs)}秒</td>
                      <td>{dwell.totalMs > 0 ? pct(dwell.outsideMs / dwell.totalMs) : "—"}</td>
                      <td />
                      <td />
                      <td />
                    </tr>
                  </tbody>
                </table>
                <h2 className="observe__subheading">視線の移動（領域の遷移）</h2>
                <p className="observe__note">
                  同じ領域に続けて目を向けていた区間を1つにまとめています。{MIN_VISIT_MS}ms未満の短い滞在は、領域の境界付近の揺れとして除いています。
                </p>
                <ol className="observe__visits">
                  {visits.map((v, i) => (
                    <li key={i} className={v.id === null ? "observe__visit-outside" : undefined}>
                      {labelOf(v.id)}（{sec(v.startMs)}〜{sec(v.endMs)}秒）
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            <div className="observe__actions">
              <button onClick={download}>結果をJSONで保存</button>
              <button onClick={retry}>もう一度（較正から）</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
