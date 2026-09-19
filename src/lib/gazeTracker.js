// 視線推定モジュール。React等のUI層に依存しないプレーンなクラスとし、
// 視線推定ライブラリ(WebGazer.js等)の詳細をここに閉じ込める。

import { config } from "./config.js";

export class GazeTracker extends EventTarget {
  #history = [];

  // 視線推定を開始する。ライブラリ未導入の間はマウス座標で代用し、
  // 後で #startWebGazer に差し替えても呼び出し側のコードは変わらない。
  start() {
    if (window.webgazer) {
      this.#startWebGazer();
    } else {
      this.#startMouseFallback();
    }
  }

  stop() {
    if (window.webgazer) {
      window.webgazer.end();
    }
    window.removeEventListener("mousemove", this.#handleMouseMove);
  }

  #startWebGazer() {
    window.webgazer
      .setGazeListener((data) => {
        if (data == null) return;
        this.#emit(data.x, data.y);
      })
      .begin();
  }

  #startMouseFallback() {
    window.addEventListener("mousemove", this.#handleMouseMove);
  }

  #handleMouseMove = (event) => {
    this.#emit(event.clientX, event.clientY);
  };

  #emit(rawX, rawY) {
    const { x, y } = this.#smooth(rawX, rawY);
    this.dispatchEvent(new CustomEvent("gaze", { detail: { x, y, t: performance.now() } }));
  }

  #smooth(x, y) {
    this.#history.push({ x, y });
    if (this.#history.length > config.gaze.smoothingWindow) {
      this.#history.shift();
    }
    const n = this.#history.length;
    const sum = this.#history.reduce(
      (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
      { x: 0, y: 0 }
    );
    return { x: sum.x / n, y: sum.y / n };
  }
}
