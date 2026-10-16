// 作品内の「注目領域(AOI)」の定義。
// 座標は元画像(アルルの寝室は1280x1016)上のピクセルで書き、読み込み時に0〜1へ
// 正規化する。どんな表示サイズでも、表示位置からの相対座標で判定できるようにするため。
//
// 配列の先頭から順に判定し、最初に当てはまった領域を採用する(重なった部分は先頭が勝つ)。
// そのため、物体の領域を先に並べ、床と「その他」を最後に置く。
//
// 領域の粒度は、ウェブカメラ視線の誤差(約4°、約130〜160px)に合わせて粗く始めている。
// 壁の絵・鏡・タオルのような小物は誤差より小さいので、個別の領域にはしていない。

function fromPixels(width, height, points) {
  return points.map(([x, y]) => [x / width, y / height]);
}

const rect = (x0, y0, x1, y1) => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

const BEDROOM_SIZE = { width: 1280, height: 1016 };

const bedroomPixels = [
  { id: "window", label: "窓", points: rect(300, 0, 510, 292) },
  {
    id: "wallPictures",
    label: "壁の絵",
    points: [
      [548, 60],
      [700, 60],
      [790, 0],
      [1055, 0],
      [1100, 150],
      [1105, 275],
      [850, 275],
      [555, 205],
    ],
  },
  {
    id: "bed",
    label: "ベッド",
    points: [
      [585, 265],
      [860, 255],
      [865, 300],
      [1160, 288],
      [1192, 310],
      [1195, 800],
      [1130, 800],
      [1120, 745],
      [795, 760],
      [790, 850],
      [735, 850],
      [725, 720],
      [590, 505],
    ],
  },
  { id: "table", label: "机と小物", points: rect(195, 285, 447, 608) },
  { id: "chairFront", label: "椅子（手前）", points: rect(0, 378, 218, 868) },
  { id: "chairBack", label: "椅子（奥）", points: rect(450, 305, 582, 575) },
  {
    id: "floor",
    label: "床",
    points: [
      [190, 520],
      [455, 505],
      [590, 508],
      [735, 850],
      [795, 850],
      [800, 762],
      [1120, 748],
      [1135, 805],
      [1195, 805],
      [1280, 880],
      [1280, 1016],
      [0, 1016],
      [0, 868],
    ],
  },
  { id: "otherWall", label: "壁・ドア（その他）", points: rect(0, 0, 1280, 1016) },
];

export const BEDROOM_AOIS = bedroomPixels.map(({ id, label, points }) => ({
  id,
  label,
  polygon: fromPixels(BEDROOM_SIZE.width, BEDROOM_SIZE.height, points),
}));

// 作品のキー(?art=)ごとの領域定義。定義の無い作品は観察モードで集計できない。
export const AOIS_BY_ART = {
  bedroom: BEDROOM_AOIS,
};
