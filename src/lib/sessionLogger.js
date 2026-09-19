// 評価実験用のロギングモジュール。
// 視線の移動経路と、作品全体が表示されるまでの時間を記録し、
// 実験後にJSONとして書き出せるようにする。

export class SessionLogger {
  #startTime = null;
  #gazePath = [];
  #completedAt = null;

  start() {
    this.#startTime = performance.now();
    this.#gazePath = [];
    this.#completedAt = null;
  }

  recordGaze(x, y, t) {
    this.#gazePath.push({ x, y, t: t - this.#startTime });
  }

  markCompleted() {
    if (this.#completedAt === null) {
      this.#completedAt = performance.now() - this.#startTime;
    }
  }

  isCompleted() {
    return this.#completedAt !== null;
  }

  toJSON() {
    return {
      durationToComplete: this.#completedAt,
      gazePath: this.#gazePath,
    };
  }

  download(filename = `session-${Date.now()}.json`) {
    const blob = new Blob([JSON.stringify(this.toJSON(), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
