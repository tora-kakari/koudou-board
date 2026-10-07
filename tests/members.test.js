// このファイルは、名簿（管理画面）の入力チェック src/lib/members.js のテストです。
import test from "node:test";
import assert from "node:assert/strict";
import { validateName, validateNewMember, validateMemberPatch } from "../src/lib/members.js";
import { CONFIG } from "../public/shared/config.js";

const members = [
  { id: 1, name: "青木", sort_order: 1, is_active: 1 },
  { id: 2, name: "石田", sort_order: 2, is_active: 0 }, // 無効
];

test("正しい名前は前後の空白を取って通る", () => {
  assert.deepEqual(validateName("  上野 ", members), { ok: true, value: "上野" });
});

test("空・空白だけ・文字でないものは validation", () => {
  for (const v of ["", "   ", null, undefined, 5, {}]) {
    assert.deepEqual(validateName(v, members), { ok: false, code: "validation" });
  }
});

test("上限ちょうどは通り、1文字超えは validation", () => {
  assert.equal(validateName("あ".repeat(CONFIG.NAME_MAX), members).ok, true);
  assert.deepEqual(validateName("あ".repeat(CONFIG.NAME_MAX + 1), members), { ok: false, code: "validation" });
});

test("重複は duplicate（無効の人の名前・前後の空白・全角半角のゆれも同じ扱い）", () => {
  assert.deepEqual(validateName("青木", members), { ok: false, code: "duplicate" });
  assert.deepEqual(validateName("石田", members), { ok: false, code: "duplicate" }); // 無効の人
  assert.deepEqual(validateName(" 青木 ", members), { ok: false, code: "duplicate" });
  assert.deepEqual(validateName("Ａ", [{ id: 3, name: "A" }]), { ok: false, code: "duplicate" });
});

test("区別できる名前（青木（清））は通る", () => {
  assert.equal(validateName("青木（清）", members).ok, true);
});

test("自分自身の名前のままの変更は重複にならない", () => {
  assert.equal(validateName("青木", members, 1).ok, true);
  assert.deepEqual(validateName("青木", members, 2), { ok: false, code: "duplicate" });
});

test("追加：{ name } 以外の形は validation", () => {
  assert.deepEqual(validateNewMember({ name: "江藤" }, members), { ok: true, value: "江藤" });
  assert.deepEqual(validateNewMember(null, members), { ok: false, code: "validation" });
  assert.deepEqual(validateNewMember({}, members), { ok: false, code: "validation" });
});

test("変更：渡した項目だけが value に入る", () => {
  assert.deepEqual(validateMemberPatch({ is_active: 0 }, members, 1), { ok: true, value: { is_active: 0 } });
  assert.deepEqual(validateMemberPatch({ sort_order: 3 }, members, 1), { ok: true, value: { sort_order: 3 } });
  assert.deepEqual(validateMemberPatch({ name: " 新名 ", is_active: 1 }, members, 2), {
    ok: true, value: { name: "新名", is_active: 1 },
  });
});

test("変更：不正な値・空の指定は validation、重複は duplicate", () => {
  for (const bad of [null, {}, { sort_order: 1.5 }, { sort_order: -1 }, { sort_order: "2" }, { is_active: 2 }, { is_active: true }, { name: "" }]) {
    assert.deepEqual(validateMemberPatch(bad, members, 1), { ok: false, code: "validation" });
  }
  assert.deepEqual(validateMemberPatch({ name: "石田" }, members, 1), { ok: false, code: "duplicate" });
});
