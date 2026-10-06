// 「どの札(AOI)を見ているか」を視線座標から判定できるかを評価する指標。
// rects は { left, top, right, bottom } を持つ矩形の配列(画面座標px)。

export function rectCenter(r) {
  return { x: r.left + (r.right - r.left) / 2, y: r.top + (r.bottom - r.top) / 2 };
}

function inside(r, p) {
  return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// 1試行ぶんのサンプルを集計する。
// hits: 目標の札の内側に入ったサンプル数
// nearestCorrect: 「中心が最も近い札」が目標の札だったサンプル数
// errors: 目標の札の中心からの距離(px)
export function summarizeTrial(samples, rects, targetIndex) {
  const centers = rects.map(rectCenter);
  const target = centers[targetIndex];
  let hits = 0;
  let nearestCorrect = 0;
  const errors = [];

  for (const p of samples) {
    if (inside(rects[targetIndex], p)) hits++;

    let nearest = 0;
    let nearestDist = Infinity;
    centers.forEach((c, i) => {
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = i;
      }
    });
    if (nearest === targetIndex) nearestCorrect++;

    errors.push(Math.hypot(p.x - target.x, p.y - target.y));
  }

  return { n: samples.length, hits, nearestCorrect, errors };
}

// 複数試行をまとめる。サンプルが1つも無ければ各値はnull。
export function aggregate(trialSummaries) {
  let n = 0;
  let hits = 0;
  let nearestCorrect = 0;
  const errors = [];

  for (const t of trialSummaries) {
    n += t.n;
    hits += t.hits;
    nearestCorrect += t.nearestCorrect;
    for (const e of t.errors) errors.push(e);
  }

  if (n === 0) {
    return { n: 0, hitRate: null, nearestAccuracy: null, meanErrorPx: null, medianErrorPx: null };
  }

  return {
    n,
    hitRate: hits / n,
    nearestAccuracy: nearestCorrect / n,
    meanErrorPx: errors.reduce((a, b) => a + b, 0) / n,
    medianErrorPx: median(errors),
  };
}
