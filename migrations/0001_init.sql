-- このファイルは、データベースの表（members と entries）を作ります。
-- IF NOT EXISTS を付けているので、すでに表がある環境（今の本番など）で流しても壊れません。

-- 名簿。人は削除せず is_active を 0 にして「無効」にします
CREATE TABLE IF NOT EXISTS members (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,            -- 表示名。無効の人を含めて重複不可
  sort_order  INTEGER NOT NULL,                   -- 表示順（小さい順）
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),  -- 1=在籍 0=無効
  created_at  TEXT    NOT NULL,                   -- 作成日時（日本時間）
  updated_at  TEXT    NOT NULL                    -- 更新日時（日本時間）
);

-- 今日の予定。1人1行で、再入力すると上書きされます（入力時刻は保存しません）
-- 代理かどうかは保存せず、「entered_by が空、または member_id と違う」で表示のときに判定します
CREATE TABLE IF NOT EXISTS entries (
  member_id   INTEGER PRIMARY KEY REFERENCES members(id),  -- 誰の予定か（1人1行）
  board_date  TEXT    NOT NULL,                   -- どの日の予定か（YYYY-MM-DD・日本時間）
  am_status   TEXT    NOT NULL,                   -- 午前の状態
  pm_status   TEXT    NOT NULL,                   -- 午後の状態
  am_place    TEXT,                               -- 午前の行先（最大40文字）
  am_note     TEXT,                               -- 午前の備考（最大200文字）
  pm_place    TEXT,                               -- 午後の行先
  pm_note     TEXT,                               -- 午後の備考
  entered_by  INTEGER REFERENCES members(id)      -- 入力者。未設定なら空
);
