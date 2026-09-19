// 直近N点の中央値を返すフィルタ。単発の飛び値(外れ値)を、
// 平均のようにその値を薄めて残すのではなく丸ごと除去できる。
// One Euro Filterの前段に置いて、荒れた入力の外れ値を先に取り除く。

export class MedianFilter {
  #window = [];
  #size;

  constructor(size = 3) {
    this.#size = size;
  }

  filter(value) {
    this.#window.push(value);
    if (this.#window.length > this.#size) {
      this.#window.shift();
    }
    const sorted = [...this.#window].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }
}
