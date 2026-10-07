// このファイルは、SESSION_SECRET の解決（src/lib/secret.js）のテストです。
// 環境変数があればそれを優先／無ければ初回に生成して settings に保存／2回目以降は同じ値。
import test from "node:test";
import assert from "node:assert/strict";
import { getSessionSecret, makeSecret } from "../src/lib/secret.js";
import { makeDb } from "./db-helper.js";

const saved = (db) => db.sqlite.prepare("SELECT key, value FROM settings").all().map((r) => ({ ...r }));

// 同じ中身のデータベースを、別の呼び出し（キャッシュを共有しない別の実行）のように包み直す
const another = (db) => ({ prepare: (sql) => db.prepare(sql) });

test("環境変数に SESSION_SECRET があれば、それをそのまま使い、データベースには書かない", async () => {
  const db = makeDb();
  assert.equal(await getSessionSecret({ SESSION_SECRET: "from-env-value", DB: db }), "from-env-value");
  assert.deepEqual(saved(db), []);
});

test("環境変数があれば、データベースに値が保存済みでも環境変数が優先される", async () => {
  const db = makeDb();
  const generated = await getSessionSecret({ DB: db });
  const fromEnv = await getSessionSecret({ SESSION_SECRET: "from-env-value", DB: db });
  assert.equal(fromEnv, "from-env-value");
  assert.notEqual(fromEnv, generated);
});

test("環境変数が無く、保存もまだなら、初回に生成して settings に1行だけ保存する", async () => {
  const db = makeDb();
  const value = await getSessionSecret({ DB: db });
  assert.deepEqual(saved(db), [{ key: "SESSION_SECRET", value }]);
});

test("2回目は同じ値を返す（別の実行からでも、保存した値を読む）", async () => {
  const db = makeDb();
  const first = await getSessionSecret({ DB: db });
  assert.equal(await getSessionSecret({ DB: another(db) }), first);
  assert.equal(await getSessionSecret({ DB: db }), first);
  assert.equal(saved(db).length, 1);
});

test("生成した値は64文字の16進数で、毎回ちがう乱数", async () => {
  const value = await getSessionSecret({ DB: makeDb() });
  assert.match(value, /^[0-9a-f]{64}$/);
  assert.notEqual(makeSecret(), makeSecret());
});

test("同時に呼ばれても、保存されるのは1つで、全員が同じ値を受け取る", async () => {
  const db = makeDb();
  const values = await Promise.all([0, 1, 2, 3].map(() => getSessionSecret({ DB: another(db) })));
  assert.equal(new Set(values).size, 1);
  assert.equal(saved(db).length, 1);
  assert.equal(saved(db)[0].value, values[0]);
});

test("すでに別の値が保存されていたら、上書きせず、保存済みの値を使う（INSERT OR IGNORE）", async () => {
  const db = makeDb();
  db.sqlite.prepare("INSERT INTO settings (key, value) VALUES ('SESSION_SECRET', 'already-saved')").run();
  assert.equal(await getSessionSecret({ DB: db }), "already-saved");
});

test("環境変数もデータベースも無ければエラーにする", async () => {
  await assert.rejects(() => getSessionSecret({}));
});
