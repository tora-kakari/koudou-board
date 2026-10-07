// このファイルは、デモ用のダミーデータ（架空の名前7名と、今日の入力の例）です。
// デモ専用で、本番では使われません。入力者ありの代理・入力者未設定の代理・未入力を含みます。
// 日付は api.js が「今日」に合わせて付けます。1人1行です（代理かどうかは entered_by から判定します）。

export const DEMO_MEMBERS = [
  { id: 1, name: "青木", sort_order: 1, is_active: 1 },
  { id: 2, name: "石田", sort_order: 2, is_active: 1 },
  { id: 3, name: "上野", sort_order: 3, is_active: 1 },
  { id: 4, name: "江藤", sort_order: 4, is_active: 1 },
  { id: 5, name: "小川", sort_order: 5, is_active: 1 },
  { id: 6, name: "加藤", sort_order: 6, is_active: 1 },
  { id: 7, name: "木村", sort_order: 7, is_active: 1 },
];

export const DEMO_ENTRIES = [
  // 青木：本人が入力
  { member_id: 1, am_status: "外出", pm_status: "社内", am_place: "〇〇現場", am_note: "14時に戻ります", pm_place: "本社", pm_note: "", entered_by: 1 },
  // 石田：上野さんが代理で入力（入力者あり）
  { member_id: 2, am_status: "直行", pm_status: "社内", am_place: "新宿方面", am_note: "", pm_place: "", pm_note: "", entered_by: 3 },
  // 上野：本人が入力
  { member_id: 3, am_status: "社内", pm_status: "外出", am_place: "", am_note: "", pm_place: "本社", pm_note: "急ぎは携帯へ", entered_by: 3 },
  // 小川：入力者未設定の代理入力（午前は休み＝行先・備考なし）
  { member_id: 5, am_status: "休み", pm_status: "社内", am_place: "", am_note: "", pm_place: "", pm_note: "", entered_by: null },
  // 加藤：本人が入力
  { member_id: 6, am_status: "外出", pm_status: "直帰", am_place: "西方面", am_note: "", pm_place: "西方面", pm_note: "", entered_by: 6 },
  // 江藤・木村：入力なし（未入力の例）
];
