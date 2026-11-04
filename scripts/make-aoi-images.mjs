// 領域(AOI)の定義を目で確認するための画像を作るスクリプト。
//
// 使い方(sharpは実行時にだけ必要なので、package.jsonには入れない):
//   npm install --no-save sharp
//   node scripts/make-aoi-images.mjs <出力先> <作品キー> [フォント名]
// 日本語ラベルを描くには、フォント名(既定: Yu Gothic)のフォントがfontconfigから見える必要がある。
// 出力: <作品キー>-overview.png(全体図)、<作品キー>-area-NN-<id>.png(領域別)、<作品キー>-contact-sheet.png(一覧)
//
// 領域の判定は、集計と同じ classifyPoint を使う(重なった部分は先頭が勝つ)。
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { AOIS_BY_ART } from "../src/data/aois.js";
import { classifyPoint } from "../src/lib/aoi.js";

const OUT = process.argv[2];
const ART = process.argv[3];
const FONT = process.argv[4] ?? "Yu Gothic";
if (!OUT || !AOIS_BY_ART[ART]) {
  console.error(`使い方: node scripts/make-aoi-images.mjs <出力先> <作品キー: ${Object.keys(AOIS_BY_ART).join("|")}>`);
  process.exit(1);
}
const SRC = fileURLToPath(new URL(`../public/assets/${ART}-color.jpg`, import.meta.url));
const aois = AOIS_BY_ART[ART];

// 領域の表示色(並び順で割り当てる。受け皿の領域はグレー)
const PALETTE = ["#00bcd4", "#e91e63", "#ffc107", "#8bc34a", "#ff7043", "#ab47bc", "#3f6fd8", "#26a69a", "#f06292", "#c0ca33"];
const colorOf = (k) => (aois[k].catchAll ? "#9e9e9e" : PALETTE[k % PALETTE.length]);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// ---- 1. 画像を読み、ピクセルごとに領域を決める ----
const { data: rgb, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
const label = new Int8Array(W * H).fill(-1);
const idIndex = Object.fromEntries(aois.map((a, i) => [a.id, i]));
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const id = classifyPoint((x + 0.5) / W, (y + 0.5) / H, aois);
    label[y * W + x] = id === null ? -1 : idIndex[id];
  }
}

// ---- 2. 面積の割合 ----
const area = new Array(aois.length).fill(0);
for (const l of label) if (l >= 0) area[l]++;
const share = area.map((n) => n / (W * H));

// ---- 3. 領域の境界(隣と領域が違う画素) ----
const isBoundary = (x, y) => {
  const l = label[y * W + x];
  return (
    (x > 0 && label[y * W + x - 1] !== l) || (x < W - 1 && label[y * W + x + 1] !== l) ||
    (y > 0 && label[(y - 1) * W + x] !== l) || (y < H - 1 && label[(y + 1) * W + x] !== l)
  );
};

// ---- 4. ラベルを置く場所: 領域の中で境界から最も遠い点(2パスのチャンファー距離変換) ----
function labelSpot(k) {
  const INF = 1e9;
  const d = new Float32Array(W * H);
  for (let i = 0; i < d.length; i++) d[i] = label[i] === k ? INF : 0;
  const px = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : d[y * W + x]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (d[i] === 0) continue;
    d[i] = Math.min(d[i], px(x - 1, y) + 1, px(x, y - 1) + 1, px(x - 1, y - 1) + 1.4, px(x + 1, y - 1) + 1.4);
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x;
    if (d[i] === 0) continue;
    d[i] = Math.min(d[i], px(x + 1, y) + 1, px(x, y + 1) + 1, px(x + 1, y + 1) + 1.4, px(x - 1, y + 1) + 1.4);
  }
  let best = 0, bi = 0;
  for (let i = 0; i < d.length; i++) if (label[i] === k && d[i] > best) { best = d[i]; bi = i; }
  return [bi % W, Math.floor(bi / W)];
}
const spots = aois.map((_, k) => labelSpot(k));

// 中央揃えのラベルが画像の外にはみ出さないよう、文字幅を見積もって中心を内側に寄せる。
const estWidth = (text, size) => [...text].reduce((w, c) => w + (c.charCodeAt(0) > 255 ? size : size * 0.6), 0);
const clampItem = (item, w) => {
  if ((item.anchor ?? "middle") !== "middle") return item;
  const half = estWidth(item.text, item.size ?? 26) / 2 + 10;
  return { ...item, x: Math.min(Math.max(item.x, half), w - half) };
};
const textSvg = (w, h, items) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
  items
    .map((it) => clampItem(it, w))
    .map(({ x, y, text, size = 26, anchor = "middle", fill = "#fff", stroke = "#000" }) =>
      `<text x="${x}" y="${y}" font-family="${FONT}" font-weight="bold" font-size="${size}" text-anchor="${anchor}" fill="${fill}" stroke="${stroke}" stroke-width="${Math.max(3, size / 7)}" paint-order="stroke">${text}</text>`)
    .join("") +
  `</svg>`;
const fmt = (v) => `${(v * 100).toFixed(1)}%`;

// ---- 5. 領域別の個別画像: その領域だけカラー、他は暗いグレー、輪郭を領域の色で ----
const perArea = [];
for (let k = 0; k < aois.length; k++) {
  const out = Buffer.alloc(W * H * 3);
  const [r, g, b] = hex(colorOf(k));
  for (let i = 0; i < W * H; i++) {
    const o = i * 3;
    if (label[i] === k) {
      out[o] = rgb[o]; out[o + 1] = rgb[o + 1]; out[o + 2] = rgb[o + 2];
    } else {
      const gray = (rgb[o] * 0.3 + rgb[o + 1] * 0.59 + rgb[o + 2] * 0.11) * 0.28;
      out[o] = out[o + 1] = out[o + 2] = gray;
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (label[y * W + x] !== k || !isBoundary(x, y)) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const o = (yy * W + xx) * 3;
      out[o] = r; out[o + 1] = g; out[o + 2] = b;
    }
  }
  const cap = textSvg(W, H, [
    { x: 14, y: 40, text: aois[k].label, size: 34, anchor: "start" },
    { x: 14, y: 76, text: `画面の${fmt(share[k])}`, size: 22, anchor: "start" },
  ]);
  const file = `${OUT}/${ART}-area-${String(k + 1).padStart(2, "0")}-${aois[k].id}.png`;
  await sharp(out, { raw: { width: W, height: H, channels: 3 } }).composite([{ input: Buffer.from(cap) }]).png().toFile(file);
  perArea.push(file);
}

// ---- 6. 全体図: 領域ごとに色分け(半透明)＋境界＋ラベル＋面積の割合 ----
{
  const out = Buffer.from(rgb);
  for (let i = 0; i < W * H; i++) {
    const o = i * 3;
    const [r, g, b] = hex(colorOf(label[i]));
    const a = aois[label[i]].catchAll ? 0.18 : 0.38;
    out[o] = rgb[o] * (1 - a) + r * a;
    out[o + 1] = rgb[o + 1] * (1 - a) + g * a;
    out[o + 2] = rgb[o + 2] * (1 - a) + b * a;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (isBoundary(x, y)) {
      const o = (y * W + x) * 3;
      out[o] = out[o + 1] = out[o + 2] = 255;
    }
  }
  const items = aois.map((a, k) => ({ x: spots[k][0], y: spots[k][1] - 4, text: a.label, size: 28 }))
    .concat(aois.map((a, k) => ({ x: spots[k][0], y: spots[k][1] + 26, text: fmt(share[k]), size: 22 })));
  await sharp(out, { raw: { width: W, height: H, channels: 3 } })
    .composite([{ input: Buffer.from(textSvg(W, H, items)) }])
    .png()
    .toFile(`${OUT}/${ART}-overview.png`);
}

// ---- 7. 一覧表(4列)。各セルは個別画像を縮小して並べる ----
{
  const COLS = 4, ROWS = Math.ceil(aois.length / COLS), GAP = 10, CW = 450, CH = Math.round((CW * H) / W);
  const composites = [];
  for (let k = 0; k < aois.length; k++) {
    composites.push({
      input: await sharp(perArea[k]).resize(CW, CH).png().toBuffer(),
      left: GAP + (k % COLS) * (CW + GAP),
      top: GAP + Math.floor(k / COLS) * (CH + GAP),
    });
  }
  await sharp({ create: { width: COLS * CW + (COLS + 1) * GAP, height: ROWS * CH + (ROWS + 1) * GAP, channels: 3, background: "#111" } })
    .composite(composites)
    .png()
    .toFile(`${OUT}/${ART}-contact-sheet.png`);
}

console.log(`${ART}: 面積の割合(実効の領域。重なりは先頭が勝つ)`);
aois.forEach((a, k) => console.log(`  ${String(k + 1).padStart(2)}. ${a.label.padEnd(14, "　")} ${fmt(share[k]).padStart(6)}`));
console.log("  sum:", fmt(share.reduce((a, b) => a + b, 0)));
