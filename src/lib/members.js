// このファイルは、名簿（管理画面）の入力チェックです。
// 名前は「空でない・上限以内・無効の人を含めて重複しない」。データベースには触りません（テストしやすくするため）。

import { CONFIG } from "../../public/shared/config.js";

// 重複の比べ方：全角半角のゆれ（ＡとAなど）は同じ名前とみなす
function key(name) {
  return name.normalize("NFKC");
}

// 名前のチェック。members は名簿の全員（無効を含む）：{ id, name }。selfId は変更中の本人（自分自身とは重複扱いにしない）
// 成功：{ ok: true, value（前後の空白を取った名前） }／失敗：{ ok: false, code }（"validation"＝空・長すぎ・文字でない／"duplicate"）
export function validateName(input, members, selfId = null) {
  if (typeof input !== "string") return { ok: false, code: "validation" };
  const name = input.trim();
  if (name === "" || name.length > CONFIG.NAME_MAX) return { ok: false, code: "validation" };
  if (members.some((m) => m.id !== selfId && key(m.name) === key(name))) return { ok: false, code: "duplicate" };
  return { ok: true, value: name };
}

// 名簿の追加（POST）の入力チェック。{ name } だけを受ける
export function validateNewMember(input, members) {
  if (typeof input !== "object" || input === null) return { ok: false, code: "validation" };
  return validateName(input.name, members);
}

// 名簿の変更（PATCH）の入力チェック。{ name?, sort_order?, is_active? } のうち、渡されたものだけ
// 成功：{ ok: true, value }（value には渡された項目だけが入る）
export function validateMemberPatch(input, members, id) {
  if (typeof input !== "object" || input === null) return { ok: false, code: "validation" };
  const value = {};
  if (input.name !== undefined) {
    const r = validateName(input.name, members, id);
    if (!r.ok) return r;
    value.name = r.value;
  }
  if (input.sort_order !== undefined) {
    if (!Number.isSafeInteger(input.sort_order) || input.sort_order < 0) return { ok: false, code: "validation" };
    value.sort_order = input.sort_order;
  }
  if (input.is_active !== undefined) {
    if (input.is_active !== 0 && input.is_active !== 1) return { ok: false, code: "validation" };
    value.is_active = input.is_active;
  }
  if (Object.keys(value).length === 0) return { ok: false, code: "validation" };
  return { ok: true, value };
}
