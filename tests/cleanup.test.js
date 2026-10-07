// このファイルは、古い記録の削除 deleteOldEntries（保存時・定時実行の共通）のテストです。
// 本物の SQL を確かめるため、Node 標準の SQLite（メモリ上）に migrations/ の表を作って実行します（tests/db-helper.js）。
import test from "node:test";
import assert from "node:assert/strict";
import { deleteOldEntries } from "../src/lib/cleanup.js";
import { todayJST } from "../src/lib/date.js";
import { makeDb } from "./db-helper.js";

function addEntry(sqlite, memberId, date) {
  sqlite.prepare(
    "INSERT INTO members (id, name, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, 'x', 'x')"
  ).run(memberId, `人${memberId}`, memberId);
  sqlite.prepare(
    "INSERT INTO entries (member_id, board_date, am_status, pm_status) VALUES (?, ?, '社内', '社内')"
  ).run(memberId, date);
}

test("今日以外の日付の行だけが消え、今日の行は残る", async () => {
  const db = makeDb();
  addEntry(db.sqlite, 1, "2026-10-03");  // 昨日
  addEntry(db.sqlite, 2, "2026-10-04");  // 今日
  addEntry(db.sqlite, 3, "2026-10-05");  // 明日（今日以外なので消える）
  addEntry(db.sqlite, 4, "2026-09-01");  // ずっと前
  await deleteOldEntries(db, "2026-10-04");
  const left = db.sqlite.prepare("SELECT member_id, board_date FROM entries").all();
  assert.deepEqual(left.map((r) => ({ ...r })), [{ member_id: 2, board_date: "2026-10-04" }]);
});

test("名簿（members）は消えない", async () => {
  const db = makeDb();
  addEntry(db.sqlite, 1, "2026-10-03");
  await deleteOldEntries(db, "2026-10-04");
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM members").get().n, 1);
});

test("日本時間0:00の定時実行（世界標準時15:00）では、その日の日本時間の日付が『今日』になる", () => {
  // 2026-10-04 15:00 UTC ＝ 日本時間 2026-10-05 0:00 → 10/4 の行は消える側
  assert.equal(todayJST(new Date("2026-10-04T15:00:00Z")), "2026-10-05");
});
