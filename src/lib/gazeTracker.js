// 視線推定モジュール。React等のUI層に依存しないプレーンなクラスとし、
// 視線推定ライブラリ(WebGazer.js)の詳細をここに閉じ込める。
// WebGazer.jsはWebカメラ映像をブラウザ内だけで処理し、外部へは送信しない。

import { config } from "./config.js";
import { OneEuroFilter } from "./oneEuroFilter.js";
import { MedianFilter } from "./medianFilter.js";

const WEBGAZER_SCRIPT_SRC = "https://webgazer.cs.brown.edu/webgazer.js";

export class GazeTracker extends EventTarget {
  #mode = null; // "webgazer" | "unavailable"
  // 単発の飛び値を中央値フィルタで先に除去してから、One Euro Filterで
  // 残りのジッターを滑らかにする2段構成。
  #medianX = new MedianFilter(config.gaze.medianWindow);
  #medianY = new MedianFilter(config.gaze.medianWindow);
  #filterX = new OneEuroFilter(config.gaze.oneEuro);
  #filterY = new OneEuroFilter(config.gaze.oneEuro);

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

  // キャリブレーション用。「(x, y)を見ていた」という教師データを
  // 明示的に1件追加する。mousemoveの自動学習は無効化してあるため、
  // 意図した点だけを正しく学習させるにはこの方法で行う。
  calibrate(x, y) {
    window.webgazer?.recordScreenPosition(x, y, "click");
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

      // Webカメラの取得解像度を上げる(デフォルトはideal 640x480)。
      // 顔・瞳の特徴をより高精細に取得でき、精度向上が期待できる。
      // カメラが対応していない場合はブラウザ側で可能な範囲に丸められる。
      webgazer.params.camConstraints = {
        video: {
          width: { min: 640, ideal: 1920, max: 1920 },
          height: { min: 480, ideal: 1080, max: 1080 },
          facingMode: "user",
        },
      };

      await webgazer
        // weightedRidgeは直近のデータを重視するため、注視方式の
        // キャリブレーション(1点あたり多数のサンプルが時間的に連続する)
        // だと最後に見た点にモデルが引っ張られてしまう。全サンプルを
        // 均等に扱うridgeに戻す。
        .setRegression("ridge")
        .setGazeListener((data) => {
          if (data == null) return;
          this.#emit(data.x, data.y);
        })
        .saveDataAcrossSessions(false)
        .begin();

      // WebGazerはデフォルトでclick/mousemoveを「その位置を見ていた」
      // 教師データとして常時学習に使う(オンライン較正)。これにより
      // 推定結果がマウス位置に引っ張られてしまうため無効化する。
      webgazer.removeMouseEventListeners();

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
    const t = performance.now();
    const x = this.#filterX.filter(t, this.#medianX.filter(rawX));
    const y = this.#filterY.filter(t, this.#medianY.filter(rawY));
    this.dispatchEvent(new CustomEvent("gaze", { detail: { x, y, t } }));
  }
}
