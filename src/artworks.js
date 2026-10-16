// 作品ごとに「線画」と「陰影・色彩」の画像を対で持つ。?art=starry のように切り替える。
// 指定が無い場合や不正な値のときは既定の作品になる。
const ARTWORKS = {
  bedroom: { lineArt: "assets/bedroom-lineart.png", color: "assets/bedroom-color.jpg" },
  starry: { lineArt: "assets/starry-lineart.png", color: "assets/starry-color.jpg" },
};
const DEFAULT_ARTWORK = "bedroom";

export function resolveArtwork() {
  const requested = new URLSearchParams(window.location.search).get("art");
  const key = Object.hasOwn(ARTWORKS, requested) ? requested : DEFAULT_ARTWORK;
  const artwork = ARTWORKS[key];
  return {
    key,
    lineArtSrc: `${import.meta.env.BASE_URL}${artwork.lineArt}`,
    colorSrc: `${import.meta.env.BASE_URL}${artwork.color}`,
  };
}
