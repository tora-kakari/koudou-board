# 行動予定ボードアプリ

## 基本情報（アプリ開発 共通ルールの項目）
- 何のアプリか：チームの当日の行動予定を共有するボード（Cloudflare Workers + D1 + 静的ファイル配信）
- 誰が使うか：note読者
- データの扱い：当日分のみ保存し、翌日0時に削除する（読者のデータを私が預かるかは、要確認）
- AI API：使わない
- 配布方法：ボタン導入、または手動（README に記載）
- 紹介するnote記事：なし（アプリ完成後に出稿予定）

## 現在の状態
- 開発中。未完成の機能がある
- SPEC.md、docs/、backup/ は、Git に入れない手元の資料

## このアプリ固有の約束
- .dev.vars と wrangler.mine.toml の中身は、読まない・表示しない・Git に入れない（wrangler.mine.toml には本物の database_id が入る）
- 本番への反映（npm run deploy、wrangler deploy、リモートDBの操作）は、Claude が手伝ってよい。ただし、実行の前に、何が変わるかを見せて、私の OK を待つ
