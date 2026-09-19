// エントリーポイント
// 画像読み込み後にマスクを初期化し、視線推定の結果を
// マスクの透明化処理へ渡す。

window.addEventListener("load", () => {
  const artwork = document.getElementById("artwork");
  const maskCanvas = document.getElementById("mask");

  const setup = () => {
    Mask.init(maskCanvas, artwork.clientWidth, artwork.clientHeight);

    Gaze.init((gazePoint) => {
      const rect = artwork.getBoundingClientRect();
      const x = gazePoint.x - rect.left;
      const y = gazePoint.y - rect.top;
      Mask.reveal(x, y);
    });
  };

  if (artwork.complete) {
    setup();
  } else {
    artwork.addEventListener("load", setup);
  }
});
