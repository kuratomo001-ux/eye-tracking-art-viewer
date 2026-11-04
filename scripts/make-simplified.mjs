// 「情報量」の条件用に、描写の細かさを減らした版を作る前処理スクリプト。
//
// 使い方(sharpは実行時にだけ必要なので、package.jsonには入れない):
//   npm install --no-save sharp
//   node scripts/make-simplified.mjs <作品キー...> [--size=7]
// 出力: public/assets/<作品キー>-simple.jpg(同じ寸法のまま、細部を平滑化した版)
//
// メディアンフィルタで筆致のような細かい凹凸をならす。輪郭(大きな色の境目)は残るので、
// 単なるぼかしと違い「見えにくくなった」のではなく「描き込みが減った」絵になる。
// 情報量の代理として、元画像と簡略化後の「平均の勾配の大きさ(細かさ)」と
// 「JPEGのファイルサイズ(圧縮しにくさ)」を出す。論文には、この値を条件の定義として載せる。
import sharp from "sharp";
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const sizeArg = args.find((a) => a.startsWith("--size="));
const SIZE = sizeArg ? Number(sizeArg.split("=")[1]) : 7;
const keys = args.filter((a) => !a.startsWith("--"));
if (keys.length === 0) {
  console.error("使い方: node scripts/make-simplified.mjs <作品キー...> [--size=7]");
  process.exit(1);
}
const asset = (name) => fileURLToPath(new URL(`../public/assets/${name}`, import.meta.url));

// 輝度の勾配の大きさの平均(0〜255の画素値あたり)。細かい描写ほど大きい。
async function meanGradient(input) {
  const { data, info } = await sharp(input).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let sum = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx = data[y * w + x + 1] - data[y * w + x - 1];
      const gy = data[(y + 1) * w + x] - data[(y - 1) * w + x];
      sum += Math.hypot(gx, gy);
    }
  }
  return sum / ((w - 2) * (h - 2));
}

for (const key of keys) {
  const src = asset(`${key}-color.jpg`);
  const dst = asset(`${key}-simple.jpg`);
  await sharp(src).median(SIZE).jpeg({ quality: 88 }).toFile(dst);
  const [g0, g1] = [await meanGradient(src), await meanGradient(dst)];
  const [b0, b1] = [statSync(src).size, statSync(dst).size];
  console.log(
    `${key}: 細かさ ${g0.toFixed(1)} → ${g1.toFixed(1)}（${((g1 / g0) * 100).toFixed(0)}%）、` +
      `ファイルサイズ ${(b0 / 1024).toFixed(0)}KB → ${(b1 / 1024).toFixed(0)}KB（${((b1 / b0) * 100).toFixed(0)}%）`,
  );
}
