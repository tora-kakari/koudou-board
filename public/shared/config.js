// このファイルは、アプリの設定値（状態の選択肢・文字数の上限など）を1か所に集めたものです。
// 画面とサーバーの両方が読みます。設定を変えたいときは、ここだけを直します。
// 状態の名前などは、コードや画面の文言に直接書かず、必ずここから使います。

export const CONFIG = {
  TEAM_NAME: "行動予定ボード",
  AM_STATUSES: [ // 表示順。color は背景色、文字色は自動で読みやすい色
    { label: "社内", color: "#d9f2d9" },
    { label: "外出", color: "#fff2b3" },
    { label: "直行", color: "#d6e8ff" },
    { label: "休み", color: "#e0e0e0" },
  ],
  PM_STATUSES: [
    { label: "社内", color: "#d9f2d9" },
    { label: "外出", color: "#fff2b3" },
    { label: "直帰", color: "#ffd9e6" },
    { label: "休み", color: "#e0e0e0" },
  ],
  PM_FOLLOW: { "直行": "外出" },   // 午前→午後の自動選択の例外。書いてなければ同名を選ぶ
  PLACE_MAX: 40,                  // 行先の最大文字数
  NOTE_MAX: 200,                  // 備考の最大文字数
  NAME_MAX: 20,                   // 名簿の名前の最大文字数
  OFF_STATUS: "休み",             // これを選んだ側（午前／午後）は行先・備考の欄を隠す。文字列を直書きしない
  VIEW_SESSION_DAYS: 90,          // 合言葉を端末が覚える日数
  ADMIN_SESSION_HOURS: 24,        // 管理者ログインの有効時間
  REFRESH_SECONDS: 60,            // ボードの自動更新の間隔（秒）
};
