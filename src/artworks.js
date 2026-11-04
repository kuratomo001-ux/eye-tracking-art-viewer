// 作品ごとに「線画」「陰影・色彩」「描き込みを減らした版」の画像を持つ。?art=starry のように切り替える。
// 指定が無い場合や不正な値のときは既定の作品になる。
// simple は実験モードの「情報量」の条件用(scripts/make-simplified.mjs で作る)。
export const ARTWORKS = {
  bedroom: {
    title: "アルルの寝室",
    genre: "室内画",
    lineArt: "assets/bedroom-lineart.png",
    color: "assets/bedroom-color.jpg",
    simple: "assets/bedroom-simple.jpg",
  },
  starry: {
    title: "星月夜",
    genre: "風景画",
    lineArt: "assets/starry-lineart.png",
    color: "assets/starry-color.jpg",
    simple: "assets/starry-simple.jpg",
  },
  portrait: {
    title: "自画像（1887）",
    genre: "人物画",
    lineArt: "assets/portrait-lineart.png",
    color: "assets/portrait-color.jpg",
    simple: "assets/portrait-simple.jpg",
  },
  wheat: {
    title: "糸杉のある麦畑",
    genre: "風景画",
    lineArt: "assets/wheat-lineart.png",
    color: "assets/wheat-color.jpg",
    simple: "assets/wheat-simple.jpg",
  },
};
const DEFAULT_ARTWORK = "bedroom";

const url = (path) => `${import.meta.env.BASE_URL}${path}`;

// 作品のキーから、画像のURLと表示名を引く。
export function artworkSources(key) {
  const artwork = ARTWORKS[key];
  return {
    key,
    title: artwork.title,
    genre: artwork.genre,
    lineArtSrc: url(artwork.lineArt),
    colorSrc: url(artwork.color),
    simpleSrc: url(artwork.simple),
  };
}

export function resolveArtwork() {
  const requested = new URLSearchParams(window.location.search).get("art");
  const key = Object.hasOwn(ARTWORKS, requested) ? requested : DEFAULT_ARTWORK;
  return artworkSources(key);
}
