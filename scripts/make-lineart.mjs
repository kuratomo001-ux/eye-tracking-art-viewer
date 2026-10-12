// 絵画画像から、同じ寸法・同じ構図のカラー版と線画版のペアを作る前処理スクリプト。
//
// 使い方(sharpは実行時にだけ必要なので、package.jsonには入れない):
//   npm install --no-save sharp
//   node scripts/make-lineart.mjs <元画像> <出力先> <名前> [幅=900] [しきい値=0.28] [ぼかし=0.8]
// 出力: <出力先>/<名前>-color.jpg と <出力先>/<名前>-lineart.png
//
// 線画はSobelフィルタで勾配の大きさ sqrt(gx^2+gy^2) を求め、最大値に対する
// 相対しきい値で二値化したもの(線=黒、背景=白)。sharpのconvolve()は結果を8bitに
// クランプして負の勾配を失うため、生ピクセルを取り出して手計算している。
// しきい値は低いほど線が増える。低すぎると筆致まで全部線になり線画だけで絵が
// 完成して見え(色彩を「発見する」効果が薄れる)、高すぎると輪郭が消える。

import sharp from "sharp";

const [source, outDir, name, widthArg, ratioArg, blurArg] = process.argv.slice(2);
if (!source || !outDir || !name) {
  console.error("usage: node scripts/make-lineart.mjs <source> <outDir> <name> [width] [ratio] [blur]");
  process.exit(1);
}

const width = Number(widthArg ?? 900);
const ratio = Number(ratioArg ?? 0.28);
const blur = Number(blurArg ?? 0.8);

const meta = await sharp(source).metadata();
const height = Math.round((width * meta.height) / meta.width);

await sharp(source)
  .resize(width, height)
  .jpeg({ quality: 88 })
  .toFile(`${outDir}/${name}-color.jpg`);

const { data, info } = await sharp(source)
  .resize(width, height)
  .grayscale()
  .blur(blur)
  .raw()
  .toBuffer({ resolveWithObject: true });

const w = info.width;
const h = info.height;
const at = (x, y) => data[Math.min(Math.max(y, 0), h - 1) * w + Math.min(Math.max(x, 0), w - 1)];

const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

const mags = new Float32Array(w * h);
let maxMag = 0;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    let sx = 0;
    let sy = 0;
    let k = 0;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const v = at(x + i, y + j);
        sx += gx[k] * v;
        sy += gy[k] * v;
        k++;
      }
    }
    const mag = Math.sqrt(sx * sx + sy * sy);
    mags[y * w + x] = mag;
    if (mag > maxMag) maxMag = mag;
  }
}

const out = new Uint8Array(w * h);
for (let i = 0; i < out.length; i++) {
  out[i] = mags[i] / maxMag > ratio ? 0 : 255;
}

await sharp(Buffer.from(out), { raw: { width: w, height: h, channels: 1 } })
  .png()
  .toFile(`${outDir}/${name}-lineart.png`);

console.log(`${name}: ${w}x${h}, ratio=${ratio}, blur=${blur}, maxMag=${maxMag.toFixed(1)}`);
