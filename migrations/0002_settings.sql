-- このファイルは、アプリの内部設定を入れる表（settings）を作ります。
-- 今は、自動で作った SESSION_SECRET（ログイン状態の署名の元になる値）だけがここに入ります。
-- この表の中身は他人に見せないでください（README・チャット・メールに貼らない）。

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
