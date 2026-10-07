// このファイルは、「今日」を日本時間で決める関数 todayJST() だけを持ちます。
// サーバーのどの処理も「今日」はここで決めます（端末から日付は受け取りません）。
// 引数 now はテスト用です。普段は渡さず、現在時刻が使われます。

const JST_OFFSET_MS = 9 * 60 * 60 * 1000; // 日本時間は世界標準時より9時間進んでいる

// 日本時間の今の日時を "2026-10-04T09:00:00+09:00" の形で返す（名簿の作成・更新日時に使う）
export function nowJST(now = new Date()) {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 19) + "+09:00";
}

// 日本時間の今日を "YYYY-MM-DD" で返す（日の切り替わりは日本時間 0:00）
export function todayJST(now = new Date()) {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}
