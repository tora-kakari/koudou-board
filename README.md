<!-- このファイルは、手順書です（ボタンでの導入・手元での起動・手動での本番公開・合言葉・名簿・困ったとき・確認用SQL・実機チェック）。
     Windows の PowerShell で、このフォルダに移動してから実行する前提で書いています。 -->

# 行動予定ボード README

その日「誰がどこにいるか」をチームで共有する、当日専用の予定ボードです。スマホから数タップで予定を入れ、全員で見られます。

- 入るには合言葉が必要です（チーム用と、名簿を直す管理者用の2つ）。
- 画面に出るのは**今日の分だけ**で、翌日0時（日本時間）に削除されます。入力時刻や履歴は保存しません。
- 他の人の予定も入力できます（代理入力。入力者の名前が「代理：○○」と表示されます）。
- 「休み」を選んだ側（午前／午後）の行先・備考は保存も表示もされません。
- 無料の Cloudflare アカウントで動きます。

## ボタンで導入する

自分のパソコンに何も入れずに、ブラウザだけで導入できます。入力するのは**合言葉2つだけ**です。

> ※このボタン導入の動作（定時削除の登録・表の自動作成・workers.dev の登録）は、動作確認中です。うまくいかなければ、下の「手動で導入する」を使ってください。

1. **アカウントを2つ用意する**（どちらも無料）：[GitHub](https://github.com/signup)、[Cloudflare](https://dash.cloudflare.com/sign-up)。
2. **下のボタンを押す**（GitHub と Cloudflare をつなぐ画面が出たら、案内どおりに許可します）。

   [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/tora-kakari/koudou-board)

3. **入力欄は2つだけ**です。
   - `VIEW_PASSPHRASE`：チーム全員で使う合言葉（12文字以上）
   - `ADMIN_PASSPHRASE`：管理者だけの合言葉（12文字以上・上とは別の言葉）

   決め方は「3. 合言葉」を見てください。ほかの設定は自動で作られます。
4. **［公開］（デプロイ）を押す。** 終わると、あなた専用のアドレス（`https://…workers.dev`）が出ます。
5. **名簿を入れる**：アドレスの最後に `/admin.html` を付けて開き、管理者用の合言葉で入って、メンバーの名前を追加します（「4. 管理画面と名簿」）。
6. **メンバーに配る**：アドレスとチーム用の合言葉を伝えます。合言葉はチームの外に出さないでください。スマホで開いて合言葉を入れ、自分の名前を選べば使えます。

---

## 手動で導入する（技術者向け）

ここから先は、パソコンで手順を実行する人向けです。ボタン導入を使った人は読まなくて構いません。

## 目次（手動で導入する）

1. 手元で動かす
2. 本番公開の手順
3. 合言葉（決め方・変えるとき）
4. 管理画面と名簿
5. デモの公開
6. 困ったとき
7. 確認用 SQL と保存の考え方
8. 実機チェックリスト
9. 導入するときのひとこと
10. 配布時に書き換える箇所
11. テスト

## 1. 手元で動かす

最初の1回だけ：

```
node -v
npm install
Copy-Item .dev.vars.example .dev.vars
npm run db:init
```

- `node -v` で番号が出なければ <https://nodejs.org/ja> から「LTS」を入れ、PowerShell を開き直します。
- `.dev.vars` をメモ帳で開き、2つの `=` の右側（`VIEW_PASSPHRASE`・`ADMIN_PASSPHRASE`）に自分の合言葉を書きます（決め方は「3」）。`SESSION_SECRET` は書かなくて構いません（無ければアプリが自動で作ります）。このファイルは Git に載りません。中身は、画面・チャット・メールに貼らないでください。
- 書き換えたあとは、dev を止めて起動し直さないと反映されません。

起動：

```
npm run dev
```

`Ready on http://127.0.0.1:8787` と出たら、ブラウザで <http://localhost:8787> を開きます。止めるときは PowerShell で **Ctrl + C**。
手元のデータは自分のパソコンの `.wrangler` フォルダに入るだけで、本番には影響しません。表の定義は `migrations/` フォルダにあり、`npm run db:init` がそれを手元のデータベースに適用します（ダミー名簿も入ります）。

手元のデータベースを最初から作り直す（手元のデータだけが消えます）：

```
Remove-Item -Recurse -Force .wrangler\state
npm run db:init
```

手元で定時削除を試す：`npx wrangler dev --test-scheduled` で起動し、予定を1件保存。別の PowerShell で次を順に実行し、最後の SELECT が0件なら成功です。

```
npx wrangler d1 execute koudou-board --local --command "UPDATE entries SET board_date='2026-01-01';"
curl.exe "http://localhost:8787/cdn-cgi/handler/scheduled?cron=0+15+*+*+*"
npx wrangler d1 execute koudou-board --local --command "SELECT member_id, board_date FROM entries;"
```

## 2. 本番公開の手順

Cloudflare の無料アカウントを作り（<https://dash.cloudflare.com/sign-up>）、`npx wrangler login` でログインしておきます（確認は `npx wrangler whoami`）。
以下を**上から順に**行います。

**1. 本番のデータベースを作る**

```
npx wrangler d1 create koudou-board
```

`database_id = "…"` と出ます（`wrangler.toml` のデータベース名は `koudou-board`。別の名前にしたときだけ、`wrangler.toml` の `database_name` も合わせます）。保管地域を指定したいときは `--location apac`（アジア太平洋）などを付けます。設定ファイルへの追記を聞かれたら、次の手順で自分で書き換えるので「いいえ」で構いません。

**2. wrangler.toml の database_id を書き換える**

[wrangler.toml](wrangler.toml) の `database_id = "0000…"`（仮の値）を、1で出た値に書き換えて保存します。

**3. 秘密の値を登録する**（1つずつ実行。「Enter a secret value:」と聞かれたら入力して Enter。入力は画面に出ません）

```
npx wrangler secret put VIEW_PASSPHRASE
npx wrangler secret put ADMIN_PASSPHRASE
```

- 合言葉は「3」の決め方で。**手元の `.dev.vars` とは別の言葉**にします。
- `SESSION_SECRET`（ログイン状態の署名の元になる値）は**登録不要**です。無ければアプリが自動で作り、データベースに保存します。自分で決めたい場合だけ `npx wrangler secret put SESSION_SECRET` で登録します（登録した値が優先されます）。
- 登録の確認：`npx wrangler secret list` に**名前**が出ればOK（値は出ません）。

**4. 公開する**（表の作成も一緒に行われます）

```
npm run deploy
```

先に `migrations/` の表の定義が本番のデータベースに適用され（`wrangler d1 migrations apply DB --remote`。表がすでにあっても壊れません）、そのあとで公開されます。

最後に `https://koudou-board.（あなたの名前）.workers.dev` のようなアドレスが出ます。
（[wrangler.toml](wrangler.toml) の `preview_urls = false` は、バージョンごとの試し用アドレス（Preview URLs）を作らず、公開先を本番のアドレス1つに絞るための設定です。）

**5. 名簿を入れる**

本番のアドレスの最後に `/admin.html` を付けて開き、管理者用の合言葉で入って名前を追加します（「4」参照）。

**6. 動作確認**

- 本番のアドレスを開き、チームの合言葉を入れる → 自分を選ぶ → ボードが出る
- 「＋ 自分の予定を入れる」で保存 → ボードに出る
- 別のスマホやブラウザで、合言葉を入れずに `/api/board` を開くと「unauthorized」になる

## 3. 合言葉（決め方・変えるとき）

- チーム用と管理者用は**別の言葉**にします。どちらも**12文字以上**。
- 意味のある言葉を4つほどつなぐと覚えやすく長くなります（例：`ほうき-みどり-あさ-7わ`。例なのでそのまま使わないでください）。
- 社名・電話番号・誕生日など推測されやすいものは避けます。ファイルやメール本文には書かず、口頭か決まった連絡手段で伝えます。

変えるとき（退職・漏れたかもしれないとき）：

```
npx wrangler secret put VIEW_PASSPHRASE
```

すぐに反映されます（再公開は不要）。**全員の端末が合言葉の画面に戻る**ので、新しい合言葉を先に伝える準備をしてから行います。管理者用は `ADMIN_PASSPHRASE` で同じ操作です。
合言葉は変えずにログインだけ全員やり直しにしたいときは、自動で作られた値を消します（`SESSION_SECRET` を自分で登録している場合は、その値を変えます）：

```
npx wrangler d1 execute koudou-board --remote --command "DELETE FROM settings WHERE key='SESSION_SECRET';"
```

次のアクセスで新しい値が作られます。

## 4. 管理画面と名簿

`/admin.html`（スタッフ向けの画面にリンクはありません。管理者だけがブックマーク）。管理者用の合言葉で入ります（24時間有効）。

- **追加**：名前を入れて［追加する］。名簿の一番下に入り、すぐボードと自分選択に出ます。
- **名前の変更**：名前の欄を書き換えて［名前を保存］。
- **表示順**：［↑ 上へ］［↓ 下へ］。
- **辞めた・異動した人**：［無効にする］。戻すときは［在籍に戻す］。**削除はできません**（無効にすると、ボードにも選択肢にも出なくなります）。
- 名前の重複はできません（無効の人を含む）。「青木（清）」のように区別できる名前にします。名前は20文字までです。

## 5. デモの公開

デモはダミーデータだけ・サーバーなしです。本番とは別の名前（`koudou-board-demo`）で公開されます。

```
npm run deploy:demo
```

初回は workers.dev のサブドメイン登録を聞かれます（好きな英数字）。公開されたアドレスの**最後に `/demo` を付けて**スマホで開きます。

```
https://koudou-board-demo.（あなたの名前）.workers.dev/demo
```

手元で見るときは <http://localhost:8787/demo>（`npm run dev` 中）。内容はブラウザの中だけで、再読み込みで初期状態に戻ります。

## 6. 困ったとき

- **Safari で「あなたは誰ですか？」がまた出る**：iPhone の Safari は、しばらく開かないサイトの端末記憶を消すことがあります。もう一度自分を選べば直ります（データへの影響はありません）。ホーム画面に追加すると消えにくくなります。
- **合言葉を忘れた**：管理者が「3」の手順で新しい合言葉を登録し、全員に伝えます。
- **名簿に自分がいない**：管理者が管理画面で追加します。
- `npm run dev` で画面が開かない：8787 番を別のソフトが使っている可能性があります。dev を止めてやり直します。

## 7. 確認用 SQL と保存の考え方

保存するのは**今日の分だけ、1人1行**です。入れ直すと上書きされ、入力時刻は保存しません。今日以外の行は、保存のたびと毎日0時（日本時間）に削除されます。Cloudflare の復元機能（Time Travel）で、システムのバックアップに一定期間残る場合があります。

現在の状態を見る SQL（手元は `--local`、本番は `--remote`）：

```
npx wrangler d1 execute koudou-board --remote --command "SELECT m.name, e.board_date, e.am_status, e.pm_status, b.name AS 入力者 FROM entries e JOIN members m ON m.id = e.member_id LEFT JOIN members b ON b.id = e.entered_by;"
```

データの保管地域の確認：Cloudflare の管理画面で「Storage & databases」→「D1」→ `koudou-board` を開くか、次を実行します。

```
npx wrangler d1 info koudou-board
```

手元で試した予定を全部消す（名簿は消えません）：

```
npx wrangler d1 execute koudou-board --local --command "DELETE FROM entries;"
```

## 8. 実機チェックリスト

iPhone の Safari と Android の Chrome で確認します。

- [ ] 本人・終日同じ・文字なしで、3タップで保存できる
- [ ] 入力欄に触れても画面が勝手に拡大しない
- [ ] 片手の親指で「自分の予定を入れる」「保存する」に届く
- [ ] 機内モードで保存するとエラー文が出て、入力内容が残る。解除して再送できる
- [ ] 200文字の備考が画面からはみ出さない
- [ ] 20名でも、スクロールでボードが見やすい
- [ ] ホーム画面に追加して開ける
- [ ] 文字を大きくする設定でも崩れない

## 9. 導入するときのひとこと

- 合言葉はチームの外に出さない。
- 個人宅の住所や、鍵・暗証番号の情報は書かない。
- 入力は任意。使わない人には、従来の連絡手段を残す。
- 会社で使うなら、社内のルールに合わせる。
- データは翌日0時に消えるので、必要なら当日中に「7」の SQL で控える。

## 10. 配布時に書き換える箇所

- [ ] [wrangler.toml](wrangler.toml) の `name`（本番の名前）
- [ ] [wrangler.toml](wrangler.toml) の `database_id`（仮の値。自分の `d1 create` で出た値に。ボタン導入では自動）
- [ ] [wrangler.demo.toml](wrangler.demo.toml) の `name`（デモの公開先の名前）
- [ ] デモの公開先のアドレス（案内文に載せるもの）

## 11. テスト

```
npm test
```

「fail 0」と出れば全部通っています。
