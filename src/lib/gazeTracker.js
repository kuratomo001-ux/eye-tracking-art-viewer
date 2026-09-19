// 視線推定モジュール。React等のUI層に依存しないプレーンなクラスとし、
// 視線推定ライブラリ(WebGazer.js)の詳細をここに閉じ込める。
// WebGazer.jsはWebカメラ映像をブラウザ内だけで処理し、外部へは送信しない。

import { config } from "./config.js";

const WEBGAZER_SCRIPT_SRC = "https://webgazer.cs.brown.edu/webgazer.js";

export class GazeTracker extends EventTarget {
  #history = [];
  #mode = null; // "webgazer" | "unavailable"

  get mode() {
    return this.#mode;
  }

  // 視線推定を開始する。WebGazer.jsの読み込み・Webカメラ起動を試みる。
  // マウス座標での代用は行わない(視線のみで動作させるため)。
  // 戻り値は "webgazer"(成功) または "unavailable"(カメラ無し・権限拒否・
  // スクリプト読み込み失敗など)。
  async start() {
    if (!window.webgazer) {
      await this.#loadWebgazerScript();
    }

    if (window.webgazer) {
      const ok = await this.#startWebGazer();
      this.#mode = ok ? "webgazer" : "unavailable";
    } else {
      this.#mode = "unavailable";
    }

    return this.#mode;
  }

  stop() {
    if (window.webgazer) {
      window.webgazer.end();
    }
  }

  #loadWebgazerScript() {
    return new Promise((resolve) => {
      const existing = document.querySelector(`script[src="${WEBGAZER_SCRIPT_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = WEBGAZER_SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => resolve(); // window.webgazerが無いままなのでunavailable扱いになる
      document.head.appendChild(script);
    });
  }

  async #startWebGazer() {
    const webgazer = window.webgazer;
    try {
      // TFFacemeshトラッカー(現行版で唯一選択可能)はMediaPipeのFaceMesh
      // アセットを別途取得する。デフォルトは相対パス"./mediapipe/face_mesh"
      // を見に行き自ホスト前提になっているため、CDN上のパスを明示する。
      webgazer.params.faceMeshSolutionPath = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh";

      await webgazer
        .setRegression("ridge")
        .setGazeListener((data) => {
          if (data == null) return;
          this.#emit(data.x, data.y);
        })
        .saveDataAcrossSessions(false)
        .begin();

      webgazer.showVideoPreview(true);
      webgazer.showPredictionPoints(true);
      webgazer.showFaceOverlay(false);
      webgazer.showFaceFeedbackBox(false);
      return true;
    } catch {
      // Webカメラ権限拒否・カメラ無しなどの場合はここに来る
      return false;
    }
  }

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
