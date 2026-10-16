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

`?mode=observe`を付けて開くと、作品を自由に鑑賞して視線を記録し、領域（窓・ベッド・床など）ごとの滞在時間と「注目したか」を集計する観察モードになる（例: `.../eye-tracking-art-viewer/?mode=observe`）。表示サイズと鑑賞時間を選べる。領域の定義は`src/data/aois.js`にある（現在はアルルの寝室のみ）。

`?mode=accuracy`を付けて開くと、Webカメラ視線で札サイズの領域をどこまで識別できるかを測る精度検証モードになる（例: `.../eye-tracking-art-viewer/?mode=accuracy`）。

作品は`public/assets/`に「線画」と「陰影・色彩」の画像を同じ構図・同じ寸法の対で置き、`src/artworks.js`の`ARTWORKS`に登録する。`?art=`で切り替える（例: `?art=starry`）。指定が無い場合や不正な値のときは既定の作品になる。

| `?art=` | 作品 | 出典 |
|---|---|---|
| `bedroom`（既定） | Van Gogh「アルルの寝室」第1作（1888年、ゴッホ美術館所蔵） | パブリックドメイン、Wikimedia Commons |
| `starry` | Van Gogh「星月夜」（1889年） | パブリックドメイン、Wikimedia Commons |

線画版は`scripts/make-lineart.mjs`で生成する（Sobelエッジ検出。使い方はスクリプトの冒頭に記載）。`sharp`は実行時だけ必要なので、`npm install --no-save sharp`で入れる。

## 今後の実装予定

- キャリブレーション後の視線推定精度の実機検証
- 一括表示 vs 段階的表示の比較実験、鑑賞後アンケート画面
- 記録データ（視線経路・表示完了時間）の分析
