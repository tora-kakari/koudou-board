// このファイルは、テスト用のデータベースを作る道具です（テストではありません）。
// Node 標準の SQLite（メモリ上）に migrations/ の表を作り、D1 と同じ呼び方（prepare → bind → run / first）ができる包みを返します。
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

export function makeDb() {
  const sqlite = new DatabaseSync(":memory:");
  const dir = new URL("../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(new URL(file, dir), "utf8"));
  }
  return {
    sqlite,
    prepare(sql) {
      const stmt = sqlite.prepare(sql.replace(/\?\d+/g, "?")); // ?1 → ?（各番号を1回ずつ、順番どおりに使う文だけ）
      return {
        bind: (...args) => ({
          run: async () => stmt.run(...args),
          first: async () => stmt.get(...args) ?? null,
        }),
      };
    },
  };
}
