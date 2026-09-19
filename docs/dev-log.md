# 開発ログ

## 2026-09-19

- WSL環境の動作確認、gitのユーザー設定、GitHub CLI (`gh`) のインストールとSSH鍵の生成・登録を行い、GitHubアカウント (`kuratomo001-ux`) と連携した。
- 卒論中間発表資料（PDF）を読み込み、研究概要（視線による段階的画像表示システム）を確認した。
- 素のHTML/CSS/JavaScriptでプロトタイプを作成し、`kuratomo001-ux/eye-tracking-art-viewer` としてGitHubにPublicリポジトリを作成・push。
- コード構成の相談を経て、React + Vite構成に移行。視線推定(`gazeTracker.js`)・マスク描画(`maskRenderer.js`)・ロギング(`sessionLogger.js`)をプレーンなJSクラスとして実装し、`useGazeMask` フックでReactに配線。
- Playwrightで開発サーバーをヘッドレスブラウザから操作し、マウス座標での動作（マスクの段階的透明化）を確認。Chromium実行に必要なシステムライブラリ(`libnspr4`等)が不足していたためユーザーに `apt-get install` を依頼し解決。
- READMEに含まれていた所属研究室名・氏名を、`git filter-branch` を用いてコミット履歴全体から削除し、GitHubへforce push。
- GitHub Actions + 公式Pagesアクションで自動デプロイを設定。`vite.config.js` の `base` とアセットパスをプロジェクトページのサブパスに合わせて修正。公開URL: `https://kuratomo001-ux.github.io/eye-tracking-art-viewer/`。
- 指導教員とのメールでのディスカッション内容をもとに、`docs/policy.md` の表示方式を見直し。当初の「全面マスク→視線で局所表示」案の課題（最初の視線位置も以降の移動もランダムになりがち）と、現在検討中の代替案（線画は常時表示し、視線で陰影・色彩を段階的に追加）を記録した。まだ確定仕様ではなく、コードへの反映は保留。
- 指導教員との次回ディスカッションのたたき台として、上記の代替案を実際に動くプロトタイプにした。`src/lib/maskRenderer.js`（黒マスク方式）を`src/lib/colorRevealRenderer.js`に置き換え、線画レイヤーを常時表示する`<img>`＋陰影色彩レイヤーをcanvas上で視線に応じて`destination-in`合成する構成にした。テスト用の線画・カラー画像(`public/assets/artwork-lineart.svg`/`artwork-color.svg`)も新規作成。Playwrightで動作確認済み。**まだ研究デザインとして確定したものではなく、会話のネタとして作った試作品。**
- `src/lib/gazeTracker.js`にWebGazer.js（`https://webgazer.cs.brown.edu/webgazer.js`、映像はブラウザ内処理のみで外部送信されない）を実際に統合。Webカメラへのアクセスはユーザーがボタンを押した時だけ要求するようにした(`useColorReveal.js`の`startTracking`、`App.jsx`のスタートオーバーレイ)。実装中、現行版WebGazerのTFFacemeshトラッカーがMediaPipeアセットを自ホスト前提の相対パス(`./mediapipe/face_mesh`)で取得しようとして404する問題に当たり、`webgazer.params.faceMeshSolutionPath`をCDN(`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh`)に向けて解決した。PlaywrightのフェイクWebカメラ機能(`--use-fake-device-for-media-stream`)で権限許可からトラッキング開始までの一連の流れを確認済み（実顔画像ではないため視線座標自体の精度は未検証）。
- ユーザーの要望により、マウス座標で代用するフォールバックを完全に削除。視線検知のみで動作する仕様とし、Webカメラが使えない場合は代用動作せず再試行画面を表示するようにした。
- 「視線がマウスに引っ張られる」という指摘を受け原因を調査。WebGazer.jsは`begin()`時にデフォルトで`click`/`mousemove`を「その位置を見ていた」教師データとして常時オンライン学習(リッジ回帰の再学習)に使う仕組みがあり、これが原因だった。`webgazer.removeMouseEventListeners()`を呼んで無効化した。ただしこれによりWebGazer側の較正データが一切無い状態になるため、キャリブレーション未実装の現状では推定精度はかなり粗いと見込まれる（TODO参照）。

## 今後のTODO

- 上記プロトタイプを指導教員に見せ、研究デザイン（情報提示順序を制御するか視線に委ねるか、対象作品の種類など）を詰める。
- 実際に人の顔でWebGazer.jsの視線推定精度を確認する（今回はPlaywrightのフェイクカメラでの起動確認のみ）。
- キャリブレーションUIを実装する（WebGazerは初期状態では精度が粗いため、クリックなどによる較正フローが必要になりそう）。
- 実際の鑑賞対象作品画像に差し替える（現状は仮のSVG画像。線画・カラー版を対で用意する必要あり）。
- 一括表示 vs 段階的表示の比較実験と、鑑賞後アンケート画面を実装する。
