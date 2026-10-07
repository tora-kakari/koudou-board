// このファイルは、入力チェック（validateEntry）と代理判定（isProxy）のテストです。
import test from "node:test";
import assert from "node:assert/strict";
import { validateEntry, isProxy } from "../src/lib/validate.js";
import { CONFIG } from "../public/shared/config.js";

// 名簿：1,2 は有効、3 は無効
const members = [
  { id: 1, is_active: 1 },
  { id: 2, is_active: 1 },
  { id: 3, is_active: 0 },
];

// 正しい入力のひな形（テストごとに一部だけ変える）
const base = {
  member_id: 1,
  am_status: "社内",
  pm_status: "社内",
  am_place: "",
  am_note: "",
  pm_place: "",
  pm_note: "",
  entered_by: 1,
};
const make = (change) => ({ ...base, ...change });
const OFF = CONFIG.OFF_STATUS;
const notOff = (list) => list.find((s) => s.label !== OFF).label;

// ---------- 代理判定 ----------

test("代理判定：本人入力は代理でない", () => {
  assert.equal(isProxy(1, 1), false);
});

test("代理判定：他人の入力は代理", () => {
  assert.equal(isProxy(2, 1), true);
});

test("代理判定：入力者未設定（null / undefined）は代理", () => {
  assert.equal(isProxy(null, 1), true);
  assert.equal(isProxy(undefined, 1), true);
});

// ---------- 入力チェック：正常 ----------

test("正しい入力は通る", () => {
  const r = validateEntry(make({ am_place: "本社", am_note: "14時に戻ります" }), members);
  assert.equal(r.ok, true);
  assert.equal(r.value.am_place, "本社");
  assert.equal(r.value.am_note, "14時に戻ります");
});

test("前後の空白は取り除かれる", () => {
  const r = validateEntry(make({ am_place: "  新宿方面 ", pm_note: "　戻ります\n" }), members);
  assert.equal(r.ok, true);
  assert.equal(r.value.am_place, "新宿方面");
  assert.equal(r.value.pm_note, "戻ります");
});

test("行先・備考が空（null / 未指定）でも通り、空文字になる", () => {
  const r = validateEntry(make({ am_place: null, pm_note: undefined }), members);
  assert.equal(r.ok, true);
  assert.equal(r.value.am_place, "");
  assert.equal(r.value.pm_note, "");
});

test("文字数がちょうど上限なら通る（行先40・備考200）", () => {
  const r = validateEntry(
    make({
      am_place: "あ".repeat(CONFIG.PLACE_MAX), pm_place: "あ".repeat(CONFIG.PLACE_MAX),
      am_note: "あ".repeat(CONFIG.NOTE_MAX), pm_note: "あ".repeat(CONFIG.NOTE_MAX),
    }),
    members
  );
  assert.equal(r.ok, true);
});

// ---------- 入力チェック：対象の人 ----------

test("member_id が空・数字でないと入力不正", () => {
  for (const bad of [undefined, null, "", "1", 1.5, NaN]) {
    const r = validateEntry(make({ member_id: bad }), members);
    assert.deepEqual(r, { ok: false, code: "validation" }, String(bad));
  }
});

test("無効な人・名簿にいない人は inactive", () => {
  assert.deepEqual(validateEntry(make({ member_id: 3 }), members), { ok: false, code: "inactive" });
  assert.deepEqual(validateEntry(make({ member_id: 99 }), members), { ok: false, code: "inactive" });
});

test("入力そのものがオブジェクトでないと入力不正", () => {
  assert.deepEqual(validateEntry(null, members), { ok: false, code: "validation" });
  assert.deepEqual(validateEntry("x", members), { ok: false, code: "validation" });
});

// ---------- 入力チェック：状態 ----------

test("選択肢にない状態は入力不正（午前・午後それぞれ）", () => {
  assert.equal(validateEntry(make({ am_status: "出張" }), members).code, "validation");
  assert.equal(validateEntry(make({ pm_status: "出張" }), members).code, "validation");
  assert.equal(validateEntry(make({ am_status: undefined }), members).code, "validation");
});

test("午前だけにある状態を午後に使うと入力不正（直行は午前のみ・直帰は午後のみ）", () => {
  const amOnly = CONFIG.AM_STATUSES.map((s) => s.label).find((l) => !CONFIG.PM_STATUSES.some((p) => p.label === l));
  const pmOnly = CONFIG.PM_STATUSES.map((s) => s.label).find((l) => !CONFIG.AM_STATUSES.some((a) => a.label === l));
  assert.equal(validateEntry(make({ pm_status: amOnly }), members).code, "validation");
  assert.equal(validateEntry(make({ am_status: pmOnly }), members).code, "validation");
});

// ---------- 入力チェック：文字数 ----------

test("行先が上限+1文字だと入力不正（午前・午後それぞれ）", () => {
  const over = "あ".repeat(CONFIG.PLACE_MAX + 1);
  assert.equal(validateEntry(make({ am_place: over }), members).code, "validation");
  assert.equal(validateEntry(make({ pm_place: over }), members).code, "validation");
});

test("備考が上限+1文字だと入力不正（午前・午後それぞれ）", () => {
  const over = "あ".repeat(CONFIG.NOTE_MAX + 1);
  assert.equal(validateEntry(make({ am_note: over }), members).code, "validation");
  assert.equal(validateEntry(make({ pm_note: over }), members).code, "validation");
});

test("空白を取ると上限に収まる場合は通る（取ってから数える）", () => {
  const r = validateEntry(make({ am_place: " " + "あ".repeat(CONFIG.PLACE_MAX) + " " }), members);
  assert.equal(r.ok, true);
});

test("行先・備考が文字列でないと入力不正", () => {
  assert.equal(validateEntry(make({ am_place: 123 }), members).code, "validation");
  assert.equal(validateEntry(make({ pm_note: ["a"] }), members).code, "validation");
});

// ---------- 入力チェック：入力者 ----------

test("入力者が空（null / undefined）なら未設定として通る", () => {
  assert.equal(validateEntry(make({ entered_by: null }), members).value.entered_by, null);
  assert.equal(validateEntry(make({ entered_by: undefined }), members).value.entered_by, null);
});

test("入力者が他の有効な人なら通る（代理入力）", () => {
  assert.equal(validateEntry(make({ entered_by: 2 }), members).value.entered_by, 2);
});

test("入力者が無効な人・名簿にいない人・数字でないと入力不正", () => {
  for (const bad of [3, 99, "1", 1.5]) {
    assert.deepEqual(validateEntry(make({ entered_by: bad }), members), { ok: false, code: "validation" }, String(bad));
  }
});

// ---------- 休みを選んだ側は行先・備考を空にする ----------

test("午前が休み：午前の行先・備考は空になり、午後は残る", () => {
  const r = validateEntry(
    make({ am_status: OFF, am_place: "本社", am_note: "通院", pm_place: "新宿", pm_note: "戻ります" }),
    members
  );
  assert.equal(r.ok, true);
  assert.equal(r.value.am_place, "");
  assert.equal(r.value.am_note, "");
  assert.equal(r.value.pm_place, "新宿");
  assert.equal(r.value.pm_note, "戻ります");
});

test("午後が休み：午後の行先・備考は空になり、午前は残る", () => {
  const r = validateEntry(
    make({ pm_status: OFF, am_place: "本社", am_note: "会議", pm_place: "新宿", pm_note: "通院" }),
    members
  );
  assert.equal(r.value.pm_place, "");
  assert.equal(r.value.pm_note, "");
  assert.equal(r.value.am_place, "本社");
  assert.equal(r.value.am_note, "会議");
});

test("両方休み：4つとも空になる（半休でない終日休み）", () => {
  const r = validateEntry(
    make({ am_status: OFF, pm_status: OFF, am_place: "a", am_note: "b", pm_place: "c", pm_note: "d" }),
    members
  );
  assert.deepEqual(
    [r.value.am_place, r.value.am_note, r.value.pm_place, r.value.pm_note],
    ["", "", "", ""]
  );
});

test("休みでない側は行先・備考がそのまま残る", () => {
  const r = validateEntry(
    make({ am_status: notOff(CONFIG.AM_STATUSES), pm_status: notOff(CONFIG.PM_STATUSES), am_place: "a", pm_note: "d" }),
    members
  );
  assert.equal(r.value.am_place, "a");
  assert.equal(r.value.pm_note, "d");
});
