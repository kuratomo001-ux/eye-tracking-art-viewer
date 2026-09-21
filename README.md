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

`public/assets/artwork-lineart.png`（線画）と`artwork-color.jpg`（陰影・色彩）は同じ構図・同じ寸法で対にする必要がある。差し替える場合は`src/App.jsx`の`lineArtSrc`/`colorSrc`も変更する。

現在の作品はVan Gogh「星月夜」(1889年、パブリックドメイン、Wikimedia Commonsより)。線画版はNode.js + `sharp`によるSobelエッジ検出で生成した(生成スクリプトはリポジトリに含めていない一回限りの前処理)。

## 今後の実装予定

- キャリブレーション後の視線推定精度の実機検証
- 一括表示 vs 段階的表示の比較実験、鑑賞後アンケート画面
- 記録データ（視線経路・表示完了時間）の分析
