// 視線の座標を「どの領域を見ていたか」に変換し、領域ごとの滞在時間と
// 「注目したか」を集計する純粋関数。座標は作品の左上を(0,0)・右下を(1,1)とした
// 正規化座標(u, v)。

// 多角形の内側かどうか(レイキャスティング法)。
export function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// 点が属する領域のid。作品の外ならnull。先頭から判定し、最初に当てはまったものを返す。
export function classifyPoint(u, v, aois) {
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  for (const aoi of aois) {
    if (pointInPolygon(u, v, aoi.polygon)) return aoi.id;
  }
  return null;
}

// samples: [{ t(ms), u, v }]。各サンプルの滞在時間は、次のサンプルまでの間隔
// (maxGapMsで頭打ち。視線が取れなかった長い空白を領域に計上しないため)。
// 戻り値: { dwellMs: {領域id: ms}, outsideMs, totalMs }
export function computeDwell(samples, aois, { maxGapMs = 200 } = {}) {
  const dwellMs = Object.fromEntries(aois.map((a) => [a.id, 0]));
  let outsideMs = 0;

  for (let i = 0; i < samples.length - 1; i++) {
    const dt = Math.min(samples[i + 1].t - samples[i].t, maxGapMs);
    if (dt <= 0) continue;
    const id = classifyPoint(samples[i].u, samples[i].v, aois);
    if (id === null) outsideMs += dt;
    else dwellMs[id] += dt;
  }

  const insideMs = Object.values(dwellMs).reduce((a, b) => a + b, 0);
  return { dwellMs, outsideMs, totalMs: insideMs + outsideMs };
}

// 領域ごとの「注目した時刻」(ms) = 累積滞在時間が初めて閾値に達した時刻。達しなければnull。
// 「最初に視線が入った順」は、領域の境界付近の揺れで入れ替わりやすいので、
// 「注目した」の判定と同じ基準(累積滞在が閾値に達した順)で順番を決める。
export function computeAttentionTimes(samples, aois, thresholdMs, { maxGapMs = 200 } = {}) {
  const cumulative = Object.fromEntries(aois.map((a) => [a.id, 0]));
  const attendedAtMs = Object.fromEntries(aois.map((a) => [a.id, null]));

  for (let i = 0; i < samples.length - 1; i++) {
    const dt = Math.min(samples[i + 1].t - samples[i].t, maxGapMs);
    if (dt <= 0) continue;
    const id = classifyPoint(samples[i].u, samples[i].v, aois);
    if (id === null) continue;
    cumulative[id] += dt;
    if (attendedAtMs[id] === null && cumulative[id] >= thresholdMs) {
      attendedAtMs[id] = samples[i].t + dt;
    }
  }
  return attendedAtMs;
}

// 視線の移動(領域の遷移)。連続して同じ領域にいた区間(訪問)にまとめる。
// minVisitMs未満の短い区間は、境界付近の揺れとみなして捨て、同じ領域が隣り合えば結合する。
// 作品の外にいた区間は id が null で入る。
export function computeVisits(samples, aois, { maxGapMs = 200, minVisitMs = 200 } = {}) {
  const runs = [];
  for (let i = 0; i < samples.length - 1; i++) {
    const dt = Math.min(samples[i + 1].t - samples[i].t, maxGapMs);
    if (dt <= 0) continue;
    const id = classifyPoint(samples[i].u, samples[i].v, aois);
    const last = runs[runs.length - 1];
    if (last && last.id === id) {
      last.endMs = samples[i].t + dt;
      last.durationMs += dt;
    } else {
      runs.push({ id, startMs: samples[i].t, endMs: samples[i].t + dt, durationMs: dt });
    }
  }

  const merged = [];
  for (const run of runs.filter((r) => r.durationMs >= minVisitMs)) {
    const last = merged[merged.length - 1];
    if (last && last.id === run.id) {
      last.endMs = run.endMs;
      last.durationMs += run.durationMs;
    } else {
      merged.push({ ...run });
    }
  }
  return merged;
}

// 領域ごとの行にまとめる。「注目した」= 累積滞在時間が0より大きく、閾値以上。
// attendedAtMs(computeAttentionTimesの結果)を渡すと、注目した順(order, 1始まり)も付く。
// 同じ時刻なら、aoisの並び順が先のものを先にする。
export function summarizeAttention(dwell, aois, thresholdMs, attendedAtMs = {}) {
  const rows = aois.map((a) => {
    const ms = dwell.dwellMs[a.id];
    return {
      id: a.id,
      label: a.label,
      dwellMs: ms,
      share: dwell.totalMs > 0 ? ms / dwell.totalMs : 0,
      attended: ms > 0 && ms >= thresholdMs,
      attendedAtMs: attendedAtMs[a.id] ?? null,
      order: null,
    };
  });

  rows
    .filter((r) => r.attended && r.attendedAtMs !== null)
    .sort((x, y) => x.attendedAtMs - y.attendedAtMs)
    .forEach((r, i) => {
      r.order = i + 1;
    });

  const attendedCount = rows.filter((r) => r.attended).length;
  return { rows, attendedCount, totalCount: rows.length, coverage: attendedCount / rows.length };
}
