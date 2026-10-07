// このファイルは、合言葉とログイン署名（src/lib/auth.js）のテストです。
import test from "node:test";
import assert from "node:assert/strict";
import { signSession, verifySession, safeEqual, readCookie, buildCookie, isLoggedIn, tryLogin } from "../src/lib/auth.js";
import { makeDb } from "./db-helper.js";

// テスト用のダミー値（本物の合言葉・秘密の値ではない）
const secret = "test-secret-0123456789abcdef";
const passphrase = "dummy-passphrase-A";
const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 9, 4, 0, 0, 0);

const sign = (over = {}) =>
  signSession({ kind: "view", secret, passphrase, nowMs: now, ttlMs: 90 * DAY, ...over });
const verify = (token, over = {}) =>
  verifySession({ token, kind: "view", secret, passphrase, nowMs: now, ...over });

test("正しい署名は通る", async () => {
  assert.equal(await verify(await sign()), true);
});

test("期限の直前は通り、期限ちょうど以降は拒否", async () => {
  const token = await sign();
  assert.equal(await verify(token, { nowMs: now + 90 * DAY - 1 }), true);
  assert.equal(await verify(token, { nowMs: now + 90 * DAY }), false);
  assert.equal(await verify(token, { nowMs: now + 91 * DAY }), false);
});

test("合言葉を変えたあとの古い署名は拒否", async () => {
  const token = await sign();
  assert.equal(await verify(token, { passphrase: "dummy-passphrase-B" }), false);
});

test("SESSION_SECRET を変えたあとの古い署名も拒否", async () => {
  const token = await sign();
  assert.equal(await verify(token, { secret: "another-secret" }), false);
});

test("改ざんは拒否（期限を延ばす・署名を書き換える・種類を変える・形が違う）", async () => {
  const [kind, exp, sig] = (await sign({ ttlMs: DAY })).split(".");
  assert.equal(await verify(`${kind}.${Number(exp) + 365 * DAY}.${sig}`), false); // 期限だけ延ばす
  assert.equal(await verify(`${kind}.${exp}.${sig.slice(0, -1)}${sig.endsWith("0") ? "1" : "0"}`), false); // 署名の1文字
  assert.equal(await verify(`admin.${exp}.${sig}`, { kind: "admin" }), false); // 種類を書き換える
  assert.equal(await verify(`${kind}.${exp}`), false);
  assert.equal(await verify(`${kind}.abc.${sig}`), false);
  assert.equal(await verify(""), false);
  assert.equal(await verify(null), false);
  assert.equal(await verify(undefined), false);
});

test("閲覧用の署名は管理者用としては通らない", async () => {
  const token = await sign();
  assert.equal(await verify(token, { kind: "admin" }), false);
});

test("秘密の値や合言葉が空のときは、何があっても拒否", async () => {
  const token = await signSession({ kind: "view", secret: "", passphrase: "", nowMs: now, ttlMs: DAY });
  assert.equal(await verify(token, { secret: "", passphrase: "" }), false);
});

test("safeEqual：同じなら true、違えば false（長さが違っても）", async () => {
  assert.equal(await safeEqual("abc", "abc"), true);
  assert.equal(await safeEqual("abc", "abd"), false);
  assert.equal(await safeEqual("abc", "abcd"), false);
  assert.equal(await safeEqual("", "a"), false);
});

test("クッキー：読み取りと、HttpOnly / Secure / SameSite=Lax / 期限", () => {
  assert.equal(readCookie("a=1; board_session=xyz; b=2", "board_session"), "xyz");
  assert.equal(readCookie("a=1", "board_session"), null);
  assert.equal(readCookie(null, "board_session"), null);
  const c = buildCookie("board_session", "xyz", 100);
  for (const part of ["HttpOnly", "Secure", "SameSite=Lax", "Max-Age=100", "Path=/"]) {
    assert.ok(c.includes(part), part);
  }
});

test("tryLogin / isLoggedIn：正しい合言葉でクッキーが出て、そのクッキーで通る。違う合言葉は null", async () => {
  const env = { VIEW_PASSPHRASE: passphrase, ADMIN_PASSPHRASE: "dummy-admin-pass", SESSION_SECRET: secret };
  assert.equal(await tryLogin("wrong-one", env, "view", now), null);
  assert.equal(await tryLogin(undefined, env, "view", now), null);
  const setCookie = await tryLogin(passphrase, env, "view", now);
  assert.ok(setCookie.includes("Max-Age=7776000")); // 90日
  const cookie = setCookie.split(";")[0];
  const req = (c) => new Request("https://example.test/api/board", { headers: c ? { cookie: c } : {} });
  assert.equal(await isLoggedIn(req(cookie), env, "view", now), true);
  assert.equal(await isLoggedIn(req(null), env, "view", now), false);
  assert.equal(await isLoggedIn(req(cookie), { ...env, VIEW_PASSPHRASE: "changed-passphrase" }, "view", now), false);
  assert.equal(await isLoggedIn(req(cookie), env, "view", now + 91 * DAY), false);
});

test("秘密の値が登録されていないときは、通さずにエラーにする", async () => {
  await assert.rejects(() => tryLogin("", { SESSION_SECRET: secret }));
  await assert.rejects(() => isLoggedIn(new Request("https://example.test/"), { VIEW_PASSPHRASE: passphrase }));
});

test("SESSION_SECRET が環境変数に無くても、自動生成した値でログインでき、同じ値で確認できる", async () => {
  const db = makeDb();
  const env = { VIEW_PASSPHRASE: passphrase, DB: db };
  const cookie = (await tryLogin(passphrase, env, "view", now)).split(";")[0];
  const req = new Request("https://example.test/api/board", { headers: { cookie } });
  assert.equal(await isLoggedIn(req, env, "view", now), true);
  assert.equal(await isLoggedIn(req, { ...env, VIEW_PASSPHRASE: "changed-passphrase" }, "view", now), false); // 合言葉を変えると無効
  // 環境変数で別の SESSION_SECRET を設定したら、以前のクッキーは無効（鍵が変わる）
  assert.equal(await isLoggedIn(req, { ...env, SESSION_SECRET: secret }, "view", now), false);
});
