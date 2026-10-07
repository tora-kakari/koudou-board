// このファイルは、SESSION_SECRET（ログイン状態の署名の元になる値）を決めます。
// 環境変数に登録されていればそれを使い、無ければデータベースの settings 表から読みます。
// settings にも無ければ、乱数を1つ作って保存します（導入する人が乱数を作らなくて済むように）。

const KEY = "SESSION_SECRET";

// 同じ実行中は使い回す（データベースごとに覚える）
const cache = new WeakMap();

// 32バイトの乱数を16進数にした64文字
export function makeSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function readSaved(db) {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?1").bind(KEY).first();
  return row ? row.value : null;
}

// 返す値の優先順：①環境変数 ②settings 表 ③新しく作って settings に保存
export async function getSessionSecret(env) {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  const db = env.DB;
  if (!db) throw new Error("SESSION_SECRET もデータベースもありません");

  if (cache.has(db)) return cache.get(db);

  let value = await readSaved(db);
  if (!value) {
    // INSERT OR IGNORE：同時に2つの処理が来ても、先に入った1つだけが残る。保存後に読み直して、全員が同じ値を使う
    await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?1, ?2)").bind(KEY, makeSecret()).run();
    value = await readSaved(db);
  }
  if (!value) throw new Error("SESSION_SECRET を保存できませんでした");
  cache.set(db, value);
  return value;
}
