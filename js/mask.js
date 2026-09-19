// マスク表示モジュール
// 作品全体を黒マスクで覆い、視線位置周辺を円形に透明化する。

const Mask = (() => {
  let canvas, ctx;
  const revealRadius = 80; // 透明化する円の半径(px)

  function init(canvasEl, width, height) {
    canvas = canvasEl;
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext("2d");

    fillMask();
  }

  function fillMask() {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function reveal(x, y) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, revealRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  return { init, reveal };
})();
