// 実験モードの「どの人に、どの絵を、どの条件で、どの順に見せるか」を決める純粋関数。
//
// 実験は条件(要因)ごとに別の実験として分けてある(?mode=experiment&factor=color|size|info)。
// 1つのセッションでは、1つの要因(色・画面サイズ・情報量のどれか)だけを変える。
// 同じ絵を何度も見ると慣れで視線が変わるので、1人が同じ絵を見るのは1回だけにし、
// 絵と条件の組み合わせをグループごとにずらす(ラテン方格)。
//   絵 i の条件 = (i + グループ) mod 条件の数
//   見せる順番 = 絵の並びをグループの数だけ回転
// 3作品×3条件なら、3グループで「どの絵もどの条件を1回ずつ」「どの絵もどの順番を1回ずつ」になる。
// 情報量のように条件が2つの要因では、1人の中では偏るが、グループ全体では各絵が両方の条件を見る。

export const FACTORS = {
  color: {
    label: "色",
    intro: "同じ絵を、カラー・彩度を下げた絵・モノクロのどれかで見せます。色の違いで、見る場所や順番が変わるかを調べます。",
    needsViewing: false,
    levels: [
      { id: "color", label: "カラー" },
      { id: "muted", label: "彩度を下げた" },
      { id: "mono", label: "モノクロ" },
    ],
  },
  size: {
    label: "画面サイズ",
    intro:
      "同じ絵を、大・中・小のどれかの大きさで見せます。大きさの違いで、見る場所や視線の動きが変わるかを調べます。" +
      "大きさは視角で比べるため、画面までの距離と画面の横幅の入力が必要です。",
    needsViewing: true,
    levels: [
      { id: "large", label: "大" },
      { id: "medium", label: "中" },
      { id: "small", label: "小" },
    ],
  },
  info: {
    label: "情報量",
    intro: "同じ絵を、元の絵か、細部を減らした絵のどちらかで見せます。描き込みの量の違いで、見る場所や順番が変わるかを調べます。",
    needsViewing: false,
    levels: [
      { id: "original", label: "元の絵" },
      { id: "simple", label: "細部を減らした絵" },
    ],
  },
};

// 要因を変えないときの既定の条件。
export const BASE_CONDITION = { color: "color", size: "large", info: "original" };

// 表示サイズ: 画面に収まる最大サイズを「大」とし、その割合で縮小する。
export const SIZE_SCALE = { small: 0.5, medium: 0.75, large: 1 };

// 色の条件をCSSのfilterにする。どちらも輝度を保ったまま彩度だけを変える
// (saturate/grayscale は輝度の係数を使う変換なので、色が無くなっても明るさの配置は変わらない)。
export const COLOR_FILTER = { color: "none", muted: "saturate(0.35)", mono: "grayscale(1)" };

// groupは0始まり。artsは作品のキーの配列(基準の並び)。
export function buildPlan({ factor, group, arts }) {
  const levels = FACTORS[factor]?.levels;
  if (!levels) throw new Error(`unknown factor: ${factor}`);
  const n = arts.length;
  const shift = ((group % n) + n) % n;
  const order = arts.map((_, position) => arts[(position + shift) % n]);
  return order.map((art, position) => {
    const artIndex = arts.indexOf(art);
    const level = levels[(artIndex + group) % levels.length];
    return { position, art, factor, level: level.id, condition: { ...BASE_CONDITION, [factor]: level.id } };
  });
}
