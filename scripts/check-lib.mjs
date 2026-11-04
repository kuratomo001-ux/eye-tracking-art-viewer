// 実験モードの計算(割り当て・視線の指標)を、答えが手で分かる例で確かめるスクリプト。
// 使い方: node scripts/check-lib.mjs  (依存なし。失敗すると例外で止まる)
import assert from "node:assert/strict";
import { buildPlan, FACTORS } from "../src/lib/experimentPlan.js";
import { dispersion, meanCenterDistance, pathLength, pxToDegrees } from "../src/lib/gazeMetrics.js";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≒ ${b}`);
const ARTS = ["bedroom", "wheat", "portrait"];

// ---- 割り当て: 3作品×3条件を3グループで回すと、どの絵もどの条件・どの順番も1回ずつ ----
for (const factor of ["color", "size"]) {
  const seenLevel = Object.fromEntries(ARTS.map((a) => [a, new Set()]));
  const seenPosition = Object.fromEntries(ARTS.map((a) => [a, new Set()]));
  for (let group = 0; group < 3; group++) {
    const plan = buildPlan({ factor, group, arts: ARTS });
    assert.equal(plan.length, 3);
    assert.deepEqual([...plan.map((t) => t.art)].sort(), [...ARTS].sort(), "1人が同じ絵を見るのは1回");
    for (const t of plan) {
      seenLevel[t.art].add(t.level);
      seenPosition[t.art].add(t.position);
    }
  }
  for (const art of ARTS) {
    assert.equal(seenLevel[art].size, 3, `${factor}: ${art} がすべての条件を見る`);
    assert.equal(seenPosition[art].size, 3, `${factor}: ${art} がすべての順番に来る`);
  }
}
// グループ0は基準の並び、グループ1は1つ回転。
assert.deepEqual(buildPlan({ factor: "color", group: 0, arts: ARTS }).map((t) => [t.art, t.level]), [
  ["bedroom", "color"], ["wheat", "muted"], ["portrait", "mono"],
]);
assert.deepEqual(buildPlan({ factor: "color", group: 1, arts: ARTS }).map((t) => [t.art, t.level]), [
  ["wheat", "mono"], ["portrait", "color"], ["bedroom", "muted"],
]);
// 変えない要因は既定の条件のまま。
assert.deepEqual(buildPlan({ factor: "color", group: 0, arts: ARTS })[1].condition, { color: "muted", size: "large", info: "original" });
// 条件が2つの要因(情報量): グループ全体では各絵が両方の条件を見る。
const infoLevels = Object.fromEntries(ARTS.map((a) => [a, new Set()]));
for (let group = 0; group < 2; group++) for (const t of buildPlan({ factor: "info", group, arts: ARTS })) infoLevels[t.art].add(t.level);
for (const art of ARTS) assert.equal(infoLevels[art].size, FACTORS.info.levels.length);
assert.throws(() => buildPlan({ factor: "nope", group: 0, arts: ARTS }));

// ---- 散らばり: (0,0)と(2,0)の重心は(1,0)で、どちらも距離1 ----
near(dispersion([{ x: 0, y: 0 }, { x: 2, y: 0 }]), 1);
assert.equal(dispersion([]), null);

// ---- 移動距離: 100msごとの平均。t=0→x0、100→30、250→30、400→70 で 30+0+40=70 ----
near(pathLength([{ t: 0, x: 0, y: 0 }, { t: 100, x: 30, y: 0 }, { t: 250, x: 30, y: 0 }, { t: 400, x: 70, y: 0 }]), 70);
// 同じ区切りの中の揺れは平均されて消える(x=-10と+10の平均は0)。
near(pathLength([{ t: 0, x: -10, y: 0 }, { t: 50, x: 10, y: 0 }, { t: 100, x: 40, y: 0 }]), 40);
assert.equal(pathLength([]), null);

// ---- 中心からの平均距離(作品の外は除く) ----
near(meanCenterDistance([{ u: 0.5, v: 0.5 }, { u: 1, v: 0.5 }, { u: 2, v: 2 }], 1), 0.25);
near(meanCenterDistance([{ u: 0.5, v: 1 }], 2), 0.25); // 縦は幅を1とした単位に直す
assert.equal(meanCenterDistance([{ u: -1, v: 0 }], 1), null);

// ---- 視角: 60cmの距離、幅30cm・1500pxの画面で150px = 3cm → 2*atan(3/120) ≒ 2.8645° ----
near(pxToDegrees(150, { distanceCm: 60, screenWidthCm: 30, screenWidthPx: 1500 }), 2.8645, 1e-3);
assert.equal(pxToDegrees(150, { distanceCm: 0, screenWidthCm: 30, screenWidthPx: 1500 }), null);
assert.equal(pxToDegrees(null, { distanceCm: 60, screenWidthCm: 30, screenWidthPx: 1500 }), null);

console.log("すべて一致");
