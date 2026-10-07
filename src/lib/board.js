// このファイルは、ボード画面に返すデータ（名簿・今日の行・入力者名）を整える関数 buildBoard() です。
// データベースには触りません（読み出した行を受け取って整えるだけ）。最新1件の判定は不要です（1人1行のため）。
// 表示するのは board_date が today の行だけです（古い行が残っていても出しません）。

import { CONFIG } from "../../public/shared/config.js";

// members：名簿の全員（無効を含む）／entries：entries 表の行（日付は問わない）／today：todayJST() の値
// 返す：{ date, members（有効な人のみ・表示順）, entries（今日の分のみ・入力者名つき）, config }
export function buildBoard({ members, entries, today }) {
  const active = members
    .filter((m) => m.is_active === 1)
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    .map((m) => ({ id: m.id, name: m.name, sort_order: m.sort_order, is_active: m.is_active }));
  const activeIds = new Set(active.map((m) => m.id));

  const shown = [];
  for (const e of entries) {
    if (e.board_date !== today) continue;      // 今日の行だけ
    if (!activeIds.has(e.member_id)) continue; // 有効な人の分だけ（ボードの行は有効な人）
    const by = members.find((m) => m.id === e.entered_by); // 無効になった入力者の名前も引く
    shown.push({ ...e, entered_by: e.entered_by ?? null, entered_by_name: by ? by.name : "" });
  }

  return { date: today, members: active, entries: shown, config: CONFIG };
}
