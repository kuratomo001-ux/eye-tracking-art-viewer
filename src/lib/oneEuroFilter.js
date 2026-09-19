// One Euro Filter (Casiez et al., 2012)。
// 単純な移動平均と違い、動きが遅いときは強く平滑化してジッターを抑え、
// 動きが速いときは平滑化を弱めて追従の遅れを抑える適応型フィルタ。
// 視線推定のような荒れやすい入力を滑らかにするのに向いている。

function smoothingFactor(te, cutoff) {
  const r = 2 * Math.PI * cutoff * te;
  return r / (r + 1);
}

function exponentialSmoothing(a, x, xPrev) {
  return a * x + (1 - a) * xPrev;
}

export class OneEuroFilter {
  #minCutoff;
  #beta;
  #dCutoff;
  #xPrev = null;
  #dxPrev = 0;
  #tPrev = null;

  // minCutoff: 値が変化していないときの平滑化の強さ(小さいほど滑らか)
  // beta: 速く動いたときに平滑化をどれだけ弱めるか(大きいほど追従重視)
  // dCutoff: 変化速度自体を平滑化する強さ
  constructor({ minCutoff = 1.0, beta = 0.0, dCutoff = 1.0 } = {}) {
    this.#minCutoff = minCutoff;
    this.#beta = beta;
    this.#dCutoff = dCutoff;
  }

  // t: 経過時間(ミリ秒)、x: 生の値。フィルタ後の値を返す。
  filter(t, x) {
    if (this.#tPrev === null) {
      this.#tPrev = t;
      this.#xPrev = x;
      return x;
    }

    const te = Math.max((t - this.#tPrev) / 1000, 1e-3); // ミリ秒 -> 秒
    const aD = smoothingFactor(te, this.#dCutoff);
    const dx = (x - this.#xPrev) / te;
    const dxHat = exponentialSmoothing(aD, dx, this.#dxPrev);

    const cutoff = this.#minCutoff + this.#beta * Math.abs(dxHat);
    const a = smoothingFactor(te, cutoff);
    const xHat = exponentialSmoothing(a, x, this.#xPrev);

    this.#xPrev = xHat;
    this.#dxPrev = dxHat;
    this.#tPrev = t;

    return xHat;
  }
}
