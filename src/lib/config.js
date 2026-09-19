// システム全体の調整パラメータ。
// 「透明化領域の大きさや速度は複数設定を試作して検討する」という
// 論文の方針に沿って、値をここに集約し差し替えやすくする。

export const config = {
  reveal: {
    radius: 80, // 視線位置周辺を透明化する円の半径(px)
    // canvasへの反映間隔(ミリ秒)。WebGazerの検出頻度そのままだと
    // 描画(destination-in合成)とrevealedRatio()のgetImageDataが
    // 高頻度に走り重いため、見た目の滑らかさを保てる範囲で間引く。
    updateIntervalMs: 50, // 約20回/秒
  },
  gaze: {
    // 単発の飛び値を先に除去する中央値フィルタの窓サイズ。
    medianWindow: 3,
    // 残りのジッターを滑らかにするOne Euro Filterのパラメータ。
    // minCutoffを下げるほど静止時の揺れが減り、betaを上げるほど
    // 速い視線移動への追従が良くなる(その分揺れが残りやすい)。
    oneEuro: {
      minCutoff: 0.3,
      beta: 0.01,
      dCutoff: 1.0,
    },
  },
};
