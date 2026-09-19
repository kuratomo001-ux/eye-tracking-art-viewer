// 表示レンダラー。
// 線画レイヤーは常に表示したままにし(App.jsx側の<img>)、
// このクラスは「陰影・色彩レイヤー」をcanvas上に持ち、
// 視線が向いた領域だけ不透明にして重ねて見せる。
// docs/policy.md の「表示方式の見直し」で検討中の方式に対応する。

import { config } from "./config.js";

export class ColorRevealRenderer {
  #canvas;
  #ctx;
  #colorImg;
  #sourceCanvas; // 陰影・色彩レイヤーの元画像を保持
  #sourceCtx;
  #maskCanvas; // 視線で明らかになった領域(白)を蓄積する
  #maskCtx;

  constructor(canvas, colorImg) {
    this.#canvas = canvas;
    this.#ctx = canvas.getContext("2d");
    this.#colorImg = colorImg;
    this.#sourceCanvas = document.createElement("canvas");
    this.#sourceCtx = this.#sourceCanvas.getContext("2d");
    this.#maskCanvas = document.createElement("canvas");
    this.#maskCtx = this.#maskCanvas.getContext("2d");
  }

  resize(width, height) {
    for (const canvas of [this.#canvas, this.#sourceCanvas, this.#maskCanvas]) {
      canvas.width = width;
      canvas.height = height;
    }
    this.#sourceCtx.drawImage(this.#colorImg, 0, 0, width, height);
    this.#maskCtx.clearRect(0, 0, width, height);
    this.#render();
  }

  reveal(x, y, radius = config.reveal.radius) {
    this.#maskCtx.fillStyle = "white";
    this.#maskCtx.beginPath();
    this.#maskCtx.arc(x, y, radius, 0, Math.PI * 2);
    this.#maskCtx.fill();
    this.#render();
  }

  #render() {
    const { width, height } = this.#canvas;
    const ctx = this.#ctx;
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(this.#sourceCanvas, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(this.#maskCanvas, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }

  // 明らかになった割合(0〜1)。表示完了までの時間計測に使う。
  revealedRatio() {
    const { width, height } = this.#maskCanvas;
    const { data } = this.#maskCtx.getImageData(0, 0, width, height);
    let revealed = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) revealed++;
    }
    return revealed / (width * height);
  }
}
