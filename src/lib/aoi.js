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

// 領域ごとの行にまとめる。「注目した」= 累積滞在時間が閾値以上。
export function summarizeAttention(dwell, aois, thresholdMs) {
  const rows = aois.map((a) => {
    const ms = dwell.dwellMs[a.id];
    return {
      id: a.id,
      label: a.label,
      dwellMs: ms,
      share: dwell.totalMs > 0 ? ms / dwell.totalMs : 0,
      attended: ms >= thresholdMs,
    };
  });
  const attendedCount = rows.filter((r) => r.attended).length;
  return { rows, attendedCount, totalCount: rows.length, coverage: attendedCount / rows.length };
}
