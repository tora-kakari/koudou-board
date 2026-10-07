// このファイルは、保存する入力のチェックと、代理入力かどうかの判定をします。
// 「入力を受けて結果を返すだけ」の関数なので、データベースには触りません（テストしやすくするため）。
// 状態の選択肢・文字数の上限・休みの名前は、すべて config から使います。

import { CONFIG } from "../../public/shared/config.js";

// 代理かどうか。「入力者が空、または対象者と違う」なら代理（保存はせず、表示のときに判定する）
export function isProxy(enteredBy, memberId) {
  return enteredBy === null || enteredBy === undefined || enteredBy !== memberId;
}

// 数字として正しい人のID（整数）か
function isId(v) {
  return Number.isInteger(v);
}

// 文字列なら前後の空白を取って返す。空（null / undefined）は ""。文字列以外は null（＝不正）
function cleanText(v) {
  if (v === null || v === undefined) return "";
  if (typeof v !== "string") return null;
  return v.trim();
}

// 入力のチェック。members は名簿の全員（無効の人を含む）：{ id, is_active }
// 成功：{ ok: true, value }（value は保存する形。休みを選んだ側の行先・備考は空にしてある）
// 失敗：{ ok: false, code }（code は "validation"＝入力内容がおかしい／"inactive"＝対象の人が無効）
export function validateEntry(input, members) {
  if (typeof input !== "object" || input === null) return { ok: false, code: "validation" };

  // 対象の人：整数でなければ入力不正、名簿にいない／無効なら「名簿から外れている」
  if (!isId(input.member_id)) return { ok: false, code: "validation" };
  const member = members.find((m) => m.id === input.member_id);
  if (!member || member.is_active !== 1) return { ok: false, code: "inactive" };

  // 状態は、午前・午後それぞれ config の選択肢のどれか
  const amOk = CONFIG.AM_STATUSES.some((s) => s.label === input.am_status);
  const pmOk = CONFIG.PM_STATUSES.some((s) => s.label === input.pm_status);
  if (!amOk || !pmOk) return { ok: false, code: "validation" };

  // 行先・備考：前後の空白を取ってから文字数を数える
  const am_place = cleanText(input.am_place);
  const am_note = cleanText(input.am_note);
  const pm_place = cleanText(input.pm_place);
  const pm_note = cleanText(input.pm_note);
  if (am_place === null || am_note === null || pm_place === null || pm_note === null) {
    return { ok: false, code: "validation" };
  }
  if (am_place.length > CONFIG.PLACE_MAX || pm_place.length > CONFIG.PLACE_MAX ||
      am_note.length > CONFIG.NOTE_MAX || pm_note.length > CONFIG.NOTE_MAX) {
    return { ok: false, code: "validation" };
  }

  // 入力者：空（未設定）か、有効な人
  let entered_by = null;
  if (input.entered_by !== null && input.entered_by !== undefined) {
    if (!isId(input.entered_by)) return { ok: false, code: "validation" };
    const by = members.find((m) => m.id === input.entered_by);
    if (!by || by.is_active !== 1) return { ok: false, code: "validation" };
    entered_by = by.id;
  }

  const value = {
    member_id: member.id,
    am_status: input.am_status,
    pm_status: input.pm_status,
    am_place, am_note, pm_place, pm_note,
    entered_by,
  };

  // 休みを選んだ側の行先・備考は空にする（画面で隠すだけに頼らない）
  if (value.am_status === CONFIG.OFF_STATUS) { value.am_place = ""; value.am_note = ""; }
  if (value.pm_status === CONFIG.OFF_STATUS) { value.pm_place = ""; value.pm_note = ""; }

  return { ok: true, value };
}
