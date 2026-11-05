// 作品に領域(AOI)を重ねた図。注目した領域は緑、注目していない領域は赤で塗り、
// 注目した順に番号を付ける。観察モードと実験モードの結果画面で共通に使う。
// rows は summarizeAttention の rows(領域ごとの attended / order)、
// samples は { u, v }(作品の左上を原点にした0〜1の視線位置)。
const ATTENDED_FILL = "rgba(68, 187, 164, 0.4)";
const UNATTENDED_FILL = "rgba(233, 79, 55, 0.4)";

const centroid = (polygon) => {
  const n = polygon.length;
  return [polygon.reduce((s, p) => s + p[0], 0) / n, polygon.reduce((s, p) => s + p[1], 0) / n];
};

export default function AoiFigure({ src, filter, aois, rows, samples, aspect, width, showPoints }) {
  const height = width / aspect;
  return (
    <div className="observe__figure" style={{ width, height }}>
      <img src={src} width={width} height={height} alt="" style={{ filter }} />
      <svg className="observe__overlay" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* 判定は先に書いた領域が優先なので、優先される領域が上に見えるよう、後ろから描く */}
        {[...aois]
          .reverse()
          .filter((a) => !a.catchAll)
          .map((a) => (
            <polygon
              key={a.id}
              points={a.polygon.map(([u, v]) => `${u * width},${v * height}`).join(" ")}
              fill={rows.find((r) => r.id === a.id).attended ? ATTENDED_FILL : UNATTENDED_FILL}
              stroke="white"
              strokeWidth="1.5"
            />
          ))}
        {aois
          .filter((a) => !a.catchAll)
          .map((a) => {
            const row = rows.find((r) => r.id === a.id);
            const [cx, cy] = centroid(a.polygon);
            return (
              <text key={a.id} x={cx * width} y={cy * height} className="observe__label" textAnchor="middle">
                {row.order ? `${row.order}. ${a.label}` : a.label}
              </text>
            );
          })}
        {showPoints &&
          samples
            .filter((s) => s.u >= 0 && s.u <= 1 && s.v >= 0 && s.v <= 1)
            .map((s, i) => <circle key={i} cx={s.u * width} cy={s.v * height} r="2" fill="white" fillOpacity="0.7" />)}
      </svg>
    </div>
  );
}
