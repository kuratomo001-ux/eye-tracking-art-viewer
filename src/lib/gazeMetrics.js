// 領域(AOI)の定義に依らない視線の指標。作品の種類が違うと領域の数や面積が違い、
// 「注目した領域の数」を作品の間で比べられないので、領域に依らない指標も出す。
// サンプルは { t, x, y }(ms、画面上のpx)。

// 視線の散らばり: 重心からの距離の二乗平均平方根(px)。小さいほど一か所に集中している。
export function dispersion(samples) {
  if (samples.length === 0) return null;
  const mx = samples.reduce((s, p) => s + p.x, 0) / samples.length;
  const my = samples.reduce((s, p) => s + p.y, 0) / samples.length;
  const v = samples.reduce((s, p) => s + (p.x - mx) ** 2 + (p.y - my) ** 2, 0) / samples.length;
  return Math.sqrt(v);
}

// 視線の移動距離(px): 時間をbinMsごとに区切って平均位置を求め、その間の距離を足す。
// ウェブカメラ視線は細かく揺れるので、サンプルをそのまま足すと揺れの分だけ長くなる。区切ることで抑える。
export function pathLength(samples, binMs = 100) {
  if (samples.length === 0) return null;
  const bins = new Map();
  for (const p of samples) {
    const k = Math.floor(p.t / binMs);
    const b = bins.get(k) ?? { x: 0, y: 0, n: 0 };
    b.x += p.x;
    b.y += p.y;
    b.n += 1;
    bins.set(k, b);
  }
  const pts = [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => [b.x / b.n, b.y / b.n]);
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return total;
}

// 作品の中心からの平均距離(作品の幅を1とした値)。u,vは作品の左上を原点にした0〜1の位置。
export function meanCenterDistance(samples, aspect) {
  const inside = samples.filter((s) => s.u >= 0 && s.u <= 1 && s.v >= 0 && s.v <= 1);
  if (inside.length === 0) return null;
  const sum = inside.reduce((acc, s) => acc + Math.hypot(s.u - 0.5, (s.v - 0.5) / aspect), 0);
  return sum / inside.length;
}

// 画面上の距離(px)を視角(度)に直す。viewing: { distanceCm, screenWidthCm, screenWidthPx }。
// 視聴距離や画面サイズが分からなければnull。小さな角度なので、画面の中央付近の近似で足りる。
export function pxToDegrees(px, viewing) {
  if (px === null || !viewing?.distanceCm || !viewing?.screenWidthCm || !viewing?.screenWidthPx) return null;
  const cm = (px / viewing.screenWidthPx) * viewing.screenWidthCm;
  return (2 * Math.atan(cm / (2 * viewing.distanceCm)) * 180) / Math.PI;
}
