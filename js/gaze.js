// 視線推定モジュール
// WebGazer.js などの視線推定ライブラリと連携し、
// 画面上の視線座標(x, y)を取得してコールバックに渡す。

const Gaze = (() => {
  let onGazeCallback = null;

  function init(callback) {
    onGazeCallback = callback;

    // TODO: WebGazer.js の初期化とコールバック登録をここに実装する
    // 例:
    // webgazer.setGazeListener((data, elapsedTime) => {
    //   if (data == null) return;
    //   onGazeCallback({ x: data.x, y: data.y });
    // }).begin();
  }

  return { init };
})();
