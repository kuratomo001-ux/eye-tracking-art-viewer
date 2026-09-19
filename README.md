# eye-tracking-art-viewer

視線追跡による絵画鑑賞支援システム

Webカメラを用いた視線推定によって、鑑賞者が注視した領域のみを段階的に表示する絵画鑑賞支援システム。作品全体を一度に提示するのではなく、視線を向けた部分から徐々に絵画が現れる仕組みにより、作品を探索しながら鑑賞する新たな体験を提供することを目指す。

## 技術スタック

React + Vite。視線推定・マスク描画・ロギングはUIに依存しないプレーンなJSクラスとして実装し、Reactからはカスタムフック経由で利用する。

## 構成

- `src/App.jsx` — 画面コンポーネント
- `src/hooks/useGazeMask.js` — 視線推定・マスク描画・ロギングをReactのライフサイクルに配線するフック
- `src/lib/gazeTracker.js` — 視線推定（WebGazer.js等との連携を想定。未導入時はマウス座標で代用）
- `src/lib/maskRenderer.js` — マスクの生成・透明化処理（canvas操作）
- `src/lib/sessionLogger.js` — 視線移動経路・表示完了時間の記録とJSON書き出し
- `src/lib/config.js` — 透明化半径などの調整パラメータ
- `public/assets/` — 鑑賞対象の作品画像など

## 使い方

```bash
npm install
npm run dev
```

`public/assets/artwork.svg` は仮画像。実際の鑑賞対象画像に差し替え、`src/App.jsx` の import 先を変更する。

## 今後の実装予定

- 視線推定ライブラリ（WebGazer.js等）の統合とキャリブレーションUI
- 透明化領域の大きさ・速度の調整機能
- 鑑賞後アンケート画面
- 記録データ（視線経路・表示完了時間）の分析
