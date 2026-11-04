# eye-tracking-art-viewer

視線追跡による絵画鑑賞支援システム

Webカメラを用いた視線推定によって、線画として常時表示された作品に、視線を向けた領域から陰影・色彩が段階的に浮かび上がる絵画鑑賞支援システム。作品全体を一度に提示するのではなく、視線を向けた部分から徐々に色彩が現れる仕組みにより、作品を探索しながら鑑賞する新たな体験を提供することを目指す。

表示方式の検討経緯は [docs/policy.md](docs/policy.md)、開発の時系列は [docs/dev-log.md](docs/dev-log.md) を参照。

## 技術スタック

React + Vite。視線推定([WebGazer.js](https://webgazer.cs.brown.edu/))・表示レンダリング・ロギングはUIに依存しないプレーンなJSクラスとして実装し、Reactからはカスタムフック経由で利用する。視線検知のみで動作し、マウスでの代用は無い。

## 構成

- `src/App.jsx` — 画面コンポーネント
- `src/components/CalibrationScreen.jsx` — クリック方式のキャリブレーション画面
- `src/hooks/useColorReveal.js` — 視線推定・表示レンダリング・ロギングをReactのライフサイクルに配線するフック
- `src/lib/gazeTracker.js` — WebGazer.jsのラッパー。中央値フィルタ→One Euro Filterでジッターを平滑化
- `src/lib/colorRevealRenderer.js` — 線画の上に陰影・色彩レイヤーを視線に応じて重ねるcanvas描画処理
- `src/lib/sessionLogger.js` — 視線移動経路・表示完了時間の記録とJSON書き出し
- `src/lib/config.js` — 透明化半径・平滑化パラメータなどの調整項目
- `public/assets/` — 鑑賞対象の作品画像（線画版・カラー版）

## 使い方

```bash
npm install
npm run dev
```

`?mode=observe`を付けて開くと、作品を自由に鑑賞して視線を記録し、領域（窓・ベッド・床など）ごとの滞在時間、「注目したか」、見た順番を集計する観察モードになる（例: `.../eye-tracking-art-viewer/?mode=observe`）。表示サイズと鑑賞時間を選べる。領域の定義は`src/data/aois.js`にある（アルルの寝室は8領域、星月夜は9領域。`?art=`で作品を切り替える）。

`?mode=experiment`を付けて開くと、絵の見せ方（色・画面サイズ・情報量のどれか1つ）を変えて、室内画・風景画・人物画の3作品を順に鑑賞してもらい、視線を記録する実験モードになる（例: `.../eye-tracking-art-viewer/?mode=experiment`）。同じ絵を何度も見ると慣れで視線が変わるので、1人が同じ絵を見るのは1回にし、作品と条件の組み合わせをグループ番号（1〜3）でずらす。滞在時間・見た順番に加えて、領域に依らない視線の散らばり・移動距離も記録する。見る距離と画面の横幅を入れると、視角（度）に換算される。

`?mode=accuracy`を付けて開くと、Webカメラ視線で札サイズの領域をどこまで識別できるかを測る精度検証モードになる（例: `.../eye-tracking-art-viewer/?mode=accuracy`）。

作品は`public/assets/`に「線画」と「陰影・色彩」の画像を同じ構図・同じ寸法の対で置き、`src/artworks.js`の`ARTWORKS`に登録する。`?art=`で切り替える（例: `?art=starry`）。指定が無い場合や不正な値のときは既定の作品になる。

| `?art=` | 作品 | 出典 |
|---|---|---|
| `bedroom`（既定） | Van Gogh「アルルの寝室」第1作（1888年、ゴッホ美術館所蔵） | パブリックドメイン、Wikimedia Commons |
| `starry` | Van Gogh「星月夜」（1889年） | パブリックドメイン、Wikimedia Commons |
| `portrait` | Van Gogh「自画像」（1887年） | パブリックドメイン、Wikimedia Commons |
| `wheat` | Van Gogh「糸杉のある麦畑」（1889年） | パブリックドメイン、Wikimedia Commons |

実験モードで使うのは、`bedroom`（室内画）・`wheat`（風景画）・`portrait`（人物画）の3作品。`starry`は予備。

線画版は`scripts/make-lineart.mjs`で生成する（Sobelエッジ検出。使い方はスクリプトの冒頭に記載）。`sharp`は実行時だけ必要なので、`npm install --no-save sharp`で入れる。実験モードの「情報量」の条件（細部を減らした版）は`scripts/make-simplified.mjs`、領域の定義を目で確認する画像は`scripts/make-aoi-images.mjs`で作る。実験モードの割り当てと視線の指標の計算は、`node scripts/check-lib.mjs`で確認できる。

## 今後の実装予定

- キャリブレーション後の視線推定精度の実機検証
- 一括表示 vs 段階的表示の比較実験、鑑賞後アンケート画面
- 記録データ（視線経路・表示完了時間）の分析
