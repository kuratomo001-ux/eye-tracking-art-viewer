import { FACTORS } from "../lib/experimentPlan.js";

// 実験は条件(要因)ごとに別の実験として分けてある。どれを行うかを選ぶ画面。
// リンク先は同じページのまま、?factor= だけを付ける。
export default function ExperimentMenu() {
  return (
    <div className="observe">
      <div className="observe__panel">
        <h1>実験を選ぶ</h1>
        <p>絵の見せ方を変える実験は、条件ごとに分かれています。行う実験を選んでください。</p>
        <ul className="experiment__menu">
          {Object.entries(FACTORS).map(([id, f]) => (
            <li key={id}>
              <a href={`?mode=experiment&factor=${id}`}>
                <strong>{f.label}の実験</strong>
              </a>
              <br />
              <span className="observe__note">条件: {f.levels.map((l) => l.label).join("・")}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
