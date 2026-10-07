// このファイルは、古い記録の削除です。
// 「今日（today）以外の日付の行」を消します。保存のたびの保険と、毎日0時（日本時間）の定時実行の両方が、この関数を使います。

export function deleteOldEntries(db, today) {
  return db.prepare("DELETE FROM entries WHERE board_date <> ?1").bind(today).run();
}
