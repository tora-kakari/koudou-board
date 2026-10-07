// このファイルは、ボード用のデータ整形（buildBoard）のテストです。
import test from "node:test";
import assert from "node:assert/strict";
import { buildBoard } from "../src/lib/board.js";

const members = [
  { id: 1, name: "青木", sort_order: 2, is_active: 1 },
  { id: 2, name: "石田", sort_order: 1, is_active: 1 },
  { id: 3, name: "上野", sort_order: 3, is_active: 0 }, // 無効
];
const row = (member_id, extra = {}) => ({
  member_id, board_date: "2026-10-04", am_status: "社内", pm_status: "社内",
  am_place: "", am_note: "", pm_place: "", pm_note: "", entered_by: member_id, ...extra,
});
const today = "2026-10-04";

test("名簿は有効な人だけを、表示順（sort_order）で返す", () => {
  const b = buildBoard({ members, entries: [], today });
  assert.deepEqual(b.members.map((m) => m.name), ["石田", "青木"]);
  assert.equal(b.date, today);
});

test("今日の行だけを返す（古い日付の行は出さない）", () => {
  const b = buildBoard({ members, entries: [row(1, { board_date: "2026-10-03" }), row(2)], today });
  assert.deepEqual(b.entries.map((e) => e.member_id), [2]);
});

test("未来の日付の行も出さない（今日と一致するものだけ）", () => {
  const b = buildBoard({ members, entries: [row(1, { board_date: "2026-10-05" })], today });
  assert.equal(b.entries.length, 0);
});

test("無効な人の行は出さない", () => {
  const b = buildBoard({ members, entries: [row(3)], today });
  assert.equal(b.entries.length, 0);
});

test("入力者名を付ける。入力者が無効になっていても名前を引く", () => {
  const b = buildBoard({ members, entries: [row(1, { entered_by: 3 })], today });
  assert.equal(b.entries[0].entered_by_name, "上野");
});

test("入力者が本人なら本人の名前、未設定なら空の名前と null", () => {
  const b = buildBoard({ members, entries: [row(1), row(2, { entered_by: null })], today });
  assert.equal(b.entries.find((e) => e.member_id === 1).entered_by_name, "青木");
  const unset = b.entries.find((e) => e.member_id === 2);
  assert.equal(unset.entered_by_name, "");
  assert.equal(unset.entered_by, null);
});

test("名簿が0人でもエラーにならず、空で返る", () => {
  const b = buildBoard({ members: [], entries: [], today });
  assert.deepEqual(b.members, []);
  assert.deepEqual(b.entries, []);
});
