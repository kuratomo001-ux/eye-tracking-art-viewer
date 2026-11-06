// 実験モード(?mode=experiment)で保存したJSONを複数まとめて読み込み、条件ごとの傾向を集計する。
//
// 使い方(依存パッケージは要らない。Node.jsだけで動く):
//   node scripts/analyze-experiments.mjs <JSONファイルかフォルダ...> [オプション]
//   例: node scripts/analyze-experiments.mjs data/ --out analysis
// オプション:
//   --out <フォルダ>       出力先(既定: analysis)。中身は report.html と、trials.csv / summary.csv / aoi-share.csv
//   --threshold <ms>       「注目した」とみなす累積滞在時間(既定: 1000)。生のサンプルから集計し直す
//   --min-rate <Hz>        視線の取得頻度がこれ未満の試行は除く(既定: 10)
//   --min-samples <個>     サンプルがこれ未満の試行は除く(既定: 100)
//   --max-outside <割合>   視線が作品の外にあった割合がこれを超える試行は除く(既定: 0.4)
//   --include-all          上の除外をしない
//
// 保存したJSONは参加者のデータなので、公開リポジトリにコミットしない(data/ と analysis/ は .gitignore 済み)。
//
// 1人は1つの絵を1つの条件でしか見ない(慣れの影響を避けるため)ので、同じ絵の条件の違いは
// 「別の人どうし」の比較になる。人数が少ないうちは、検定はせず、1人ずつの値を点で示して傾向を見る。
import fs from "node:fs";
import path from "node:path";
import { AOIS_BY_ART } from "../src/data/aois.js";
import { computeAttentionTimes, computeDwell, computeVisits, summarizeAttention } from "../src/lib/aoi.js";
import { FACTORS } from "../src/lib/experimentPlan.js";
import { ARTWORKS } from "../src/artworks.js";

// ---------- 引数 ----------
const opt = { out: "analysis", threshold: 1000, minRate: 10, minSamples: 100, maxOutside: 0.4, includeAll: false };
const inputs = [];
const args = process.argv.slice(2);
const usage = () => {
  const head = fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(0, 21);
  console.log(head.map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const num = () => {
    const v = Number(args[++i]);
    if (!Number.isFinite(v)) throw new Error(`${a} には数値を指定してください`);
    return v;
  };
  if (a === "--out") opt.out = args[++i];
  else if (a === "--threshold") opt.threshold = num();
  else if (a === "--min-rate") opt.minRate = num();
  else if (a === "--min-samples") opt.minSamples = num();
  else if (a === "--max-outside") opt.maxOutside = num();
  else if (a === "--include-all") opt.includeAll = true;
  else if (a === "--help" || a === "-h") {
    usage();
    process.exit(0);
  } else if (a.startsWith("--")) throw new Error(`知らないオプション: ${a}`);
  else inputs.push(a);
}
if (inputs.length === 0) {
  usage();
  process.exit(1);
}

// ---------- 読み込み ----------
const collect = (p) => {
  const st = fs.statSync(p);
  if (st.isDirectory()) return fs.readdirSync(p).sort().flatMap((n) => collect(path.join(p, n)));
  return p.endsWith(".json") ? [p] : [];
};
const files = inputs.flatMap(collect);
const skipped = [];
const sessions = [];
for (const file of files) {
  let j;
  try {
    j = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    skipped.push([file, "JSONとして読めない"]);
    continue;
  }
  if (!j?.meta?.factor || !Array.isArray(j.trials) || !FACTORS[j.meta.factor]) {
    skipped.push([file, "実験モードのJSONではない(観察モードや精度検証のJSONは対象外)"]);
    continue;
  }
  sessions.push({ file: path.basename(file), ...j });
}
if (sessions.length === 0) {
  console.error("読み込めた実験モードのJSONがありません。");
  for (const [f, why] of skipped) console.error(`  - ${f}: ${why}`);
  process.exit(1);
}

// ---------- 数値の道具 ----------
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const sd = (a) => {
  if (a.length < 2) return null;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};
const fmt = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? "—" : v.toFixed(d));
const pct = (v) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(0)}%`);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const levelOf = (factor, id) => FACTORS[factor].levels.find((l) => l.id === id);

// ---------- 試行ごとの行 ----------
// 角度に直せたデータだけなら度、そうでなければpxで集計する(混ぜると比べられないため)。
const allTrials = sessions.flatMap((s) => s.trials.map((t) => ({ s, t })));
const useDeg = allTrials.every(({ t }) => t.metrics?.dispersionDeg != null && t.metrics?.pathLengthDeg != null);
const unit = useDeg ? "度" : "px";

const rows = allTrials.map(({ s, t }) => {
  const factor = s.meta.factor;
  const aois = AOIS_BY_ART[t.art];
  const level = t.condition?.[factor];
  const elapsedS = t.elapsedMs / 1000;

  // 生のサンプルがあれば、同じ関数で集計し直す(閾値を変えられる)。無ければ保存された集計を使う。
  let regions, outsideShare, visits;
  if (t.samples?.length && aois) {
    const dwell = computeDwell(t.samples, aois);
    const sum = summarizeAttention(dwell, aois, opt.threshold, computeAttentionTimes(t.samples, aois, opt.threshold));
    regions = sum.rows;
    outsideShare = dwell.totalMs > 0 ? dwell.outsideMs / dwell.totalMs : null;
    visits = computeVisits(t.samples, aois);
  } else {
    regions = t.aois ?? [];
    const outMs = t.outsideMs ?? 0;
    const inMs = regions.reduce((a, r) => a + r.dwellMs, 0);
    outsideShare = inMs + outMs > 0 ? outMs / (inMs + outMs) : null;
    visits = t.visits ?? [];
  }
  const real = regions.filter((r) => !aois?.find((a) => a.id === r.id)?.catchAll);
  const attended = regions.filter((r) => r.attended);
  const first = regions.find((r) => r.order === 1);

  const row = {
    file: s.file,
    participant: s.meta.participantId || "(無記名)",
    group: s.meta.group,
    experience: s.meta.artExperience ?? "",
    factor,
    art: t.art,
    genre: t.genre ?? ARTWORKS[t.art]?.genre ?? "",
    position: t.position + 1,
    level,
    levelLabel: levelOf(factor, level)?.label ?? level,
    seconds: elapsedS,
    samples: t.sampleCount ?? t.samples?.length ?? 0,
    rateHz: elapsedS > 0 ? (t.sampleCount ?? t.samples?.length ?? 0) / elapsedS : null,
    outside: outsideShare,
    dispersion: useDeg ? t.metrics?.dispersionDeg : t.metrics?.dispersionPx,
    path: useDeg ? t.metrics?.pathLengthDeg : t.metrics?.pathLengthPx,
    // 作品の幅を1とした値。表示を小さくすると、同じ相対位置を見ていても度やpxの散らばり・移動距離は小さくなるので、
    // 画面サイズの比較では、こちらも見る。
    dispersionRel: t.metrics?.dispersionPx != null && t.display?.widthPx ? t.metrics.dispersionPx / t.display.widthPx : null,
    pathRel: t.metrics?.pathLengthPx != null && t.display?.widthPx ? t.metrics.pathLengthPx / t.display.widthPx : null,
    center: t.metrics?.meanCenterDistance ?? null,
    attendedCount: attended.length,
    regionCount: real.length || regions.length,
    coverage: regions.length ? attended.length / regions.length : null,
    firstAttended: first?.label ?? null,
    regions,
    visits,
  };
  // 除外の理由
  row.flags = [];
  if (row.rateHz === null || row.rateHz < opt.minRate) row.flags.push(`取得頻度が低い(${fmt(row.rateHz)}Hz)`);
  if (row.samples < opt.minSamples) row.flags.push(`サンプルが少ない(${row.samples}個)`);
  if (row.outside === null || row.outside > opt.maxOutside) row.flags.push(`作品の外が多い(${pct(row.outside)})`);
  if (row.dispersion == null) row.flags.push("指標が計算できていない");
  return row;
});

const used = opt.includeAll ? rows : rows.filter((r) => r.flags.length === 0);
const excluded = rows.filter((r) => !used.includes(r));

// ---------- 集計 ----------
const groupKey = (r) => `${r.factor}|${r.art}|${r.level}`;
const groups = new Map();
for (const r of used) {
  const k = groupKey(r);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
const metricDefs = [
  ["dispersion", `視線の散らばり（${unit}）`, 1],
  ["path", `視線の移動距離（${unit}）`, 1],
  ["center", "作品の中心からの平均距離（作品の幅=1）", 2],
  ["coverage", "注目した領域の割合（「その他」を含む）", 2],
  ["rateHz", "視線の取得頻度（Hz）", 1],
];
// 画面サイズの実験でだけ表に出す(他の実験では、同じ作品の表示の大きさが同じなので、度の値と比例するだけ)。
const relDefs = [
  ["dispersionRel", "視線の散らばり（作品の幅=1）", 2],
  ["pathRel", "視線の移動距離（作品の幅=1）", 2],
];
const defsFor = (factor) => (factor === "size" ? [...metricDefs, ...relDefs] : metricDefs);
const plotKeys = (factor) => (factor === "size" ? ["dispersion", "path", "dispersionRel", "pathRel", "center"] : ["dispersion", "path", "center"]);
const vals = (list, key) => list.map((r) => r[key]).filter((v) => v !== null && v !== undefined);

const factorsPresent = Object.keys(FACTORS).filter((f) => rows.some((r) => r.factor === f));
const artsOf = (f) => [...new Set(rows.filter((r) => r.factor === f).map((r) => r.art))];
const levelsOf = (f) => FACTORS[f].levels;

// 同じ絵の平均で割った相対値(1より大きいほど、その絵の平均より大きい)。絵ごとの違いを除いて、条件の傾向だけを見る。
function pooledRelative(factor, key) {
  const list = used.filter((r) => r.factor === factor && r[key] != null);
  const artMean = Object.fromEntries(artsOf(factor).map((a) => [a, mean(vals(list.filter((r) => r.art === a), key))]));
  return levelsOf(factor).map((l) => {
    const rel = list.filter((r) => r.level === l.id && artMean[r.art]).map((r) => r[key] / artMean[r.art]);
    return { level: l, n: rel.length, mean: mean(rel), sd: sd(rel) };
  });
}

// ---------- CSV ----------
const q = (v) => {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? String(Number.isInteger(v) ? v : Number(v.toFixed(4))) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (cols, data) => "﻿" + [cols.map((c) => c[0]).join(","), ...data.map((d) => cols.map((c) => q(c[1](d))).join(","))].join("\n") + "\n";

const trialsCsv = toCsv(
  [
    ["ファイル", (r) => r.file], ["参加者", (r) => r.participant], ["グループ", (r) => r.group], ["美術の経験", (r) => r.experience],
    ["要因", (r) => FACTORS[r.factor].label], ["作品", (r) => r.art], ["種類", (r) => r.genre], ["見た順", (r) => r.position],
    ["条件", (r) => r.levelLabel], ["鑑賞秒", (r) => r.seconds], ["サンプル数", (r) => r.samples], ["取得頻度Hz", (r) => r.rateHz],
    ["作品の外の割合", (r) => r.outside], [`散らばり(${unit})`, (r) => r.dispersion], [`移動距離(${unit})`, (r) => r.path],
    ["中心からの平均距離", (r) => r.center], ["散らばり(作品の幅=1)", (r) => r.dispersionRel], ["移動距離(作品の幅=1)", (r) => r.pathRel], ["注目した領域数", (r) => r.attendedCount], ["領域数", (r) => r.regionCount],
    ["最初に注目した領域", (r) => r.firstAttended], ["集計に使った", (r) => (used.includes(r) ? "はい" : "いいえ")],
    ["除外の理由", (r) => r.flags.join(" / ")],
  ],
  rows,
);

const summaryRows = [];
for (const f of factorsPresent) for (const a of artsOf(f)) for (const l of levelsOf(f)) {
  const g = groups.get(`${f}|${a}|${l.id}`) ?? [];
  summaryRows.push({ f, a, l, g });
}
const summaryCsv = toCsv(
  [
    ["要因", (x) => FACTORS[x.f].label], ["作品", (x) => x.a], ["条件", (x) => x.l.label], ["人数", (x) => x.g.length],
    ...[...metricDefs, ...relDefs].flatMap(([key, label]) => [[`${label} 平均`, (x) => mean(vals(x.g, key))], [`${label} SD`, (x) => sd(vals(x.g, key))]]),
  ],
  summaryRows,
);

const aoiLong = [];
for (const r of used) for (const g of r.regions) aoiLong.push({ r, g });
const aoiCsv = toCsv(
  [
    ["要因", (x) => FACTORS[x.r.factor].label], ["作品", (x) => x.r.art], ["条件", (x) => x.r.levelLabel], ["参加者", (x) => x.r.participant],
    ["領域", (x) => x.g.label], ["滞在ms", (x) => x.g.dwellMs], ["割合", (x) => x.g.share], ["注目した", (x) => (x.g.attended ? 1 : 0)],
    ["注目した順", (x) => x.g.order], ["注目した時刻ms", (x) => x.g.attendedAtMs],
  ],
  aoiLong,
);

// ---------- 図(SVG) ----------
const COLORS = ["#4e79a7", "#f28e2b", "#59a14f", "#b07aa1"];
const niceStep = (max) => {
  const raw = max / 4, p = 10 ** Math.floor(Math.log10(raw)), n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

// 1人ずつの値を点で、平均を横線で示す。clusters = 絵、series = 条件。
function dotPlot({ clusters, levels, unitLabel }) {
  const W = 720, H = 270, L = 58, R = 12, T = 34, B = 44;
  const all = clusters.flatMap((c) => c.series.flatMap((s) => s.values));
  if (all.length === 0) return '<p class="muted">この指標のデータがありません。</p>';
  const step = niceStep(Math.max(...all, 1e-9) * 1.1), top = Math.ceil((Math.max(...all) * 1.05) / step) * step || step;
  const y = (v) => T + (1 - v / top) * (H - T - B);
  const cw = (W - L - R) / clusters.length;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" xmlns="http://www.w3.org/2000/svg">`;
  for (let v = 0; v <= top + 1e-9; v += step) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" class="axis">${Number(v.toFixed(3))}</text>`;
  s += `<text x="12" y="${T - 14}" class="axis">${esc(unitLabel)}</text>`;
  clusters.forEach((c, i) => {
    const x0 = L + i * cw, slot = cw / (levels.length + 0.6);
    s += `<text x="${x0 + cw / 2}" y="${H - 8}" text-anchor="middle" class="label">${esc(c.label)}</text>`;
    c.series.forEach((ser, j) => {
      const cx = x0 + slot * (j + 0.8);
      ser.values.forEach((v, k) => (s += `<circle cx="${cx + ((k % 5) - 2) * 4}" cy="${y(v)}" r="3.6" fill="${COLORS[j]}" fill-opacity="0.75"/>`));
      if (ser.values.length) s += `<line x1="${cx - 15}" x2="${cx + 15}" y1="${y(mean(ser.values))}" y2="${y(mean(ser.values))}" stroke="${COLORS[j]}" stroke-width="3"/>`;
      s += `<text x="${cx}" y="${H - B + 14}" text-anchor="middle" class="axis">${esc(levels[j].label)}</text>`;
    });
  });
  return s + "</svg>";
}

// 領域ごとの滞在割合(平均)を、条件ごとの横棒で示す。
function shareBars(factor, art) {
  const aois = AOIS_BY_ART[art];
  const levels = levelsOf(factor);
  const data = levels.map((l) => groups.get(`${factor}|${art}|${l.id}`) ?? []);
  const meanShare = (list, id) => mean(list.map((r) => r.regions.find((g) => g.id === id)?.share ?? 0));
  const barH = 11, rowH = levels.length * (barH + 1) + 10, L = 150, W = 680, maxW = W - L - 60;
  const H = aois.length * rowH + 16;
  const maxV = Math.max(0.05, ...aois.flatMap((a) => data.map((d) => meanShare(d, a.id) ?? 0)));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" xmlns="http://www.w3.org/2000/svg">`;
  aois.forEach((a, i) => {
    const y0 = 8 + i * rowH;
    s += `<text x="${L - 8}" y="${y0 + (levels.length * (barH + 1)) / 2 + 4}" text-anchor="end" class="label">${esc(a.label)}</text>`;
    levels.forEach((l, j) => {
      const v = data[j].length ? meanShare(data[j], a.id) : null;
      const yy = y0 + j * (barH + 1);
      if (v === null) return;
      s += `<rect x="${L}" y="${yy}" width="${Math.max(0, (v / maxV) * maxW)}" height="${barH}" fill="${COLORS[j]}"/><text x="${L + (v / maxV) * maxW + 4}" y="${yy + barH - 2}" class="axis">${pct(v)}</text>`;
    });
  });
  return s + "</svg>";
}

const legend = (levels) => `<div class="legend">${levels.map((l, j) => `<span><i style="background:${COLORS[j]}"></i>${esc(l.label)}</span>`).join("")}</div>`;

// ---------- 表(HTML) ----------
const table = (head, body) => `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const meanSd = (list, key, d = 1) => {
  const v = vals(list, key);
  return v.length ? `${fmt(mean(v), d)}${v.length > 1 ? ` <span class="muted">±${fmt(sd(v), d)}</span>` : ""}` : "—";
};

let html = "";
const participants = new Set(rows.map((r) => `${r.participant}`));
html += `<section><h2>データの確認</h2>
<p>読み込んだファイル: ${sessions.length}個（${[...participants].length}人分の参加者ID）／試行: ${rows.length}／集計に使った試行: ${used.length}／除外: ${excluded.length}。「注目した」の閾値は${opt.threshold}ms。</p>
<p class="muted">除外の基準: 取得頻度${opt.minRate}Hz未満、サンプル${opt.minSamples}個未満、作品の外が${Math.round(opt.maxOutside * 100)}%超${opt.includeAll ? "（今回は --include-all で除外していない）" : ""}。視線の精度そのものは実験モードのJSONに入らないので、精度の悪い人はここでは見分けられない。精度検証モードの結果と合わせて確認すること。</p>`;
if (skipped.length) html += `<p class="warn">読み込まなかったファイル: ${skipped.map(([f, w]) => `${esc(path.basename(f))}（${esc(w)}）`).join("、")}</p>`;
if (excluded.length) html += table(["ファイル", "参加者", "作品", "条件", "除外の理由"], excluded.map((r) => [esc(r.file), esc(r.participant), esc(ARTWORKS[r.art]?.title ?? r.art), esc(r.levelLabel), esc(r.flags.join(" / "))]));
html += "</section>";

for (const f of factorsPresent) {
  const levels = levelsOf(f), arts = artsOf(f);
  html += `<section><h2>${esc(FACTORS[f].label)}の実験</h2>`;
  // 人数のバランス
  html += `<h3>人数（作品×条件）</h3>` + table(["作品", ...levels.map((l) => esc(l.label))], arts.map((a) => [`${esc(ARTWORKS[a]?.title ?? a)}（${esc(ARTWORKS[a]?.genre ?? "")}）`, ...levels.map((l) => String((groups.get(`${f}|${a}|${l.id}`) ?? []).length))]));
  html += `<p class="muted">どの組み合わせも同じ人数だと、比べやすい。少ない・偏る場合は、グループの割り当てを見直す。</p>`;
  // 指標の表と点の図
  const defs = defsFor(f);
  html += `<h3>視線の指標</h3>` + table(["作品", "条件", "人数", ...defs.map((m) => esc(m[1]))], arts.flatMap((a) => levels.map((l) => {
    const g = groups.get(`${f}|${a}|${l.id}`) ?? [];
    return [esc(ARTWORKS[a]?.title ?? a), esc(l.label), String(g.length), ...defs.map(([k, , d]) => (k === "coverage" ? (g.length ? pct(mean(vals(g, k))) : "—") : meanSd(g, k, d)))];
  })));
  html += `<p class="muted">平均 ±標準偏差（2人以上のとき）。</p>`;
  if (f === "size") html += `<p class="warn">注意: 表示を小さくすると、同じ場所を見ていても、度やpxで測った散らばり・移動距離は小さくなる。「小さいと視線の動きが少ない」が行動の違いなのかを見るには、「作品の幅=1」の値を見る。</p>`;
  for (const [key, label] of defs.filter((d) => plotKeys(f).includes(d[0]))) {
    html += `<h3>${esc(label)}</h3>${legend(levels)}` + dotPlot({
      levels, unitLabel: key === "center" || key.endsWith("Rel") ? "" : unit,
      clusters: arts.map((a) => ({ label: ARTWORKS[a]?.title ?? a, series: levels.map((l) => ({ values: vals(groups.get(`${f}|${a}|${l.id}`) ?? [], key) })) })),
    });
  }
  html += `<p class="muted">点＝1人ずつの値、横線＝平均。</p>`;
  // 絵ごとの違いを除いた傾向
  html += `<h3>絵ごとの違いを除いた傾向（同じ絵の平均に対する比）</h3>` + table(["指標", ...levels.map((l) => esc(l.label))], defs.filter((d) => plotKeys(f).includes(d[0])).map(([k, label]) => [esc(label), ...pooledRelative(f, k).map((x) => (x.n ? `${fmt(x.mean, 2)}（${x.n}件）` : "—"))]));
  html += `<p class="muted">1.0＝その絵の全員の平均。1より大きいほど、その条件で大きかった。</p>`;
  // 領域ごとの滞在と、見た順番
  for (const a of arts) {
    html += `<h3>${esc(ARTWORKS[a]?.title ?? a)}: 領域ごとの滞在割合（平均）</h3>${legend(levels)}${shareBars(f, a)}`;
    const aois = AOIS_BY_ART[a].filter((x) => !x.catchAll);
    html += `<h4>見た順番（注目した順）</h4>` + table(["領域", ...levels.flatMap((l) => [`${esc(l.label)}: 最初に注目した人数`, `${esc(l.label)}: 平均の順位`])], aois.map((ar) => [esc(ar.label), ...levels.flatMap((l) => {
      const g = groups.get(`${f}|${a}|${l.id}`) ?? [];
      const ords = g.map((r) => r.regions.find((x) => x.id === ar.id)?.order).filter((o) => o != null);
      return [g.length ? String(g.filter((r) => r.regions.find((x) => x.id === ar.id)?.order === 1).length) : "—", ords.length ? `${fmt(mean(ords), 1)}（${ords.length}人）` : "—"];
    })]));
  }
  html += "</section>";
}

const report = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>実験の集計</title><style>
body{font-family:"Yu Gothic","Hiragino Sans","Noto Sans CJK JP",sans-serif;max-width:860px;margin:24px auto;padding:0 16px;color:#222;line-height:1.7;background:#fff}
h1{font-size:22px}h2{font-size:18px;border-bottom:2px solid #888;padding-bottom:4px;margin-top:36px}h3{font-size:15px;margin:22px 0 6px}h4{font-size:14px;margin:14px 0 4px}
table{border-collapse:collapse;font-size:13px;margin:6px 0}th,td{border:1px solid #bbb;padding:4px 8px;text-align:left}th{background:#eee}
svg{width:100%;height:auto;max-width:720px;display:block}.grid{stroke:#ddd}.axis{font-size:11px;fill:#555}.label{font-size:12px;fill:#222}
.muted{color:#666;font-size:12.5px}.warn{color:#b00}.legend{font-size:12.5px;margin:4px 0}.legend span{margin-right:14px}.legend i{display:inline-block;width:11px;height:11px;margin-right:4px;vertical-align:-1px}
</style></head><body><h1>実験の集計</h1>
<p class="muted">作成: ${new Date().toLocaleString("ja-JP")}。人数が少ない間は検定をせず、1人ずつの値で傾向を見る。同じ絵の条件の違いは、別の人どうしの比較になる。</p>${html}</body></html>`;

// ---------- 出力 ----------
fs.mkdirSync(opt.out, { recursive: true });
fs.writeFileSync(path.join(opt.out, "report.html"), report);
fs.writeFileSync(path.join(opt.out, "trials.csv"), trialsCsv);
fs.writeFileSync(path.join(opt.out, "summary.csv"), summaryCsv);
fs.writeFileSync(path.join(opt.out, "aoi-share.csv"), aoiCsv);

console.log(`ファイル ${sessions.length}個 / 試行 ${rows.length} / 集計に使った ${used.length} / 除外 ${excluded.length}（閾値 ${opt.threshold}ms、単位 ${unit}）`);
for (const [f, why] of skipped) console.log(`  読み込まなかった: ${path.basename(f)}（${why}）`);
for (const r of excluded) console.log(`  除外: ${r.file} ${r.art} ${r.levelLabel} — ${r.flags.join(" / ")}`);
for (const f of factorsPresent) {
  console.log(`\n【${FACTORS[f].label}の実験】`);
  for (const a of artsOf(f)) for (const l of levelsOf(f)) {
    const g = groups.get(`${f}|${a}|${l.id}`) ?? [];
    console.log(`  ${(ARTWORKS[a]?.title ?? a).padEnd(10, "　")} ${l.label.padEnd(8, "　")} n=${g.length}  散らばり ${fmt(mean(vals(g, "dispersion")))}  移動 ${fmt(mean(vals(g, "path")))}  中心距離 ${fmt(mean(vals(g, "center")), 2)}  注目 ${pct(mean(vals(g, "coverage")))}`);
  }
}
console.log(`\n出力: ${path.resolve(opt.out)}/ （report.html, trials.csv, summary.csv, aoi-share.csv）`);
