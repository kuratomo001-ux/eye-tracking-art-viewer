// マスク表示モジュール。
// 作品全体を黒マスクで覆い、視線位置周辺を円形に透明化する。
// 透明化した領域は保持したままにする(論文の「一度表示された領域は
// 保持する」方針)。canvas操作はReactの再描画サイクルの外で行うため、
// Reactコンポーネントからはref経由のcanvas要素を渡すだけにする。

import { config } from "./config.js";

export class MaskRenderer {
  #ctx;
  #canvas;

  constructor(canvas) {
    this.#canvas = canvas;
    this.#ctx = canvas.getContext("2d");
  }

  resize(width, height) {
    this.#canvas.width = width;
    this.#canvas.height = height;
    this.reset();
  }

  reset() {
    const ctx = this.#ctx;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, this.#canvas.width, this.#canvas.height);
  }

  reveal(x, y, radius = config.reveal.radius) {
    const ctx = this.#ctx;
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // 透明化された割合(0〜1)。表示完了までの時間計測に使う。
  revealedRatio() {
    const { width, height } = this.#canvas;
    const { data } = this.#ctx.getImageData(0, 0, width, height);
    let transparent = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 0) transparent++;
    }
    return transparent / (width * height);
  }
}
