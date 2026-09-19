# 開発ログ

## 2026-09-19

- WSL環境の動作確認、gitのユーザー設定、GitHub CLI (`gh`) のインストールとSSH鍵の生成・登録を行い、GitHubアカウント (`kuratomo001-ux`) と連携した。
- 卒論中間発表資料（PDF）を読み込み、研究概要（視線による段階的画像表示システム）を確認した。
- 素のHTML/CSS/JavaScriptでプロトタイプを作成し、`kuratomo001-ux/eye-tracking-art-viewer` としてGitHubにPublicリポジトリを作成・push。
- コード構成の相談を経て、React + Vite構成に移行。視線推定(`gazeTracker.js`)・マスク描画(`maskRenderer.js`)・ロギング(`sessionLogger.js`)をプレーンなJSクラスとして実装し、`useGazeMask` フックでReactに配線。
- Playwrightで開発サーバーをヘッドレスブラウザから操作し、マウス座標での動作（マスクの段階的透明化）を確認。Chromium実行に必要なシステムライブラリ(`libnspr4`等)が不足していたためユーザーに `apt-get install` を依頼し解決。
- READMEに含まれていた所属研究室名・氏名を、`git filter-branch` を用いてコミット履歴全体から削除し、GitHubへforce push。
- GitHub Actions + 公式Pagesアクションで自動デプロイを設定。`vite.config.js` の `base` とアセットパスをプロジェクトページのサブパスに合わせて修正。公開URL: `https://kuratomo001-ux.github.io/eye-tracking-art-viewer/`。

## 今後のTODO

- WebGazer.js等の視線推定ライブラリを `src/lib/gazeTracker.js` に統合する。
- キャリブレーションUIを実装する。
- 実際の鑑賞対象作品画像に差し替える（現状は仮のSVG画像）。
- 一括表示 vs 段階的表示の比較実験と、鑑賞後アンケート画面を実装する。
