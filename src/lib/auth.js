// このファイルは、合言葉の確認とログイン状態（クッキーの署名）を扱います。
// 署名の鍵は「SESSION_SECRET（未登録なら自動生成した値）＋ 合言葉」から作るので、合言葉を変えると以前のクッキーは全部無効になります。
// 閲覧用と管理者用は同じ仕組みで、クッキーの名前と期限だけが違います。
// Web Crypto だけを使うので、Cloudflare でも npm test（Node）でも同じコードが動きます。

import { CONFIG } from "../../public/shared/config.js";
import { getSessionSecret } from "./secret.js";

export const VIEW_COOKIE = "board_session";
export const ADMIN_COOKIE = "board_admin";

const enc = new TextEncoder();

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function hmacHex(secret, message) {
  return toHex(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(message)));
}

// 2つの文字列を、比較にかかる時間が一定になる方法で比べる。
// 先に両方を同じ長さ（32バイト）の値にしてから全バイトを見るので、長さや一致位置が時間に出ない。
export async function safeEqual(a, b) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const [x, y] = await Promise.all([hmacHex(salt, String(a)), hmacHex(salt, String(b))]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

// 署名の鍵：SESSION_SECRET と合言葉の両方から作る
function sessionKey(secret, passphrase) {
  return `${secret}:${passphrase}`;
}

// ログイン状態の文字列 "種類.期限(ミリ秒).署名" を作る。kind は "view" か "admin"
export async function signSession({ kind, secret, passphrase, nowMs, ttlMs }) {
  const exp = nowMs + ttlMs;
  const sig = await hmacHex(sessionKey(secret, passphrase), `${kind}.${exp}`);
  return `${kind}.${exp}.${sig}`;
}

// 正しい署名で、期限内で、種類が合っていれば true。改ざん・期限切れ・合言葉変更後の古いものは false
export async function verifySession({ token, kind, secret, passphrase, nowMs }) {
  if (typeof token !== "string" || !secret || !passphrase) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== kind) return false;
  const exp = Number(parts[1]);
  if (!Number.isSafeInteger(exp)) return false;
  const expected = await hmacHex(sessionKey(secret, passphrase), `${kind}.${exp}`);
  if (!(await safeEqual(parts[2], expected))) return false;
  return nowMs < exp;
}

// ---------- クッキー ----------

export function readCookie(header, name) {
  for (const part of (header || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

// HttpOnly（JavaScriptから読めない）・Secure（暗号化通信のみ）・SameSite=Lax
export function buildCookie(name, value, maxAgeSeconds) {
  return `${name}=${value}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export function clearCookie(name) {
  return buildCookie(name, "", 0);
}

// ---------- リクエスト単位の入口（worker.js が使う） ----------

const KINDS = {
  view: { cookie: VIEW_COOKIE, passphraseKey: "VIEW_PASSPHRASE", ttlMs: () => CONFIG.VIEW_SESSION_DAYS * 24 * 60 * 60 * 1000 },
  admin: { cookie: ADMIN_COOKIE, passphraseKey: "ADMIN_PASSPHRASE", ttlMs: () => CONFIG.ADMIN_SESSION_HOURS * 60 * 60 * 1000 },
};

// 合言葉が登録されていないときは、通さずに失敗させる（空の合言葉で入れてしまう事故を防ぐ）。
// SESSION_SECRET は環境変数を優先し、無ければ自動で作った値を使う（src/lib/secret.js）
async function secretsOf(env, kind) {
  const passphrase = env[KINDS[kind].passphraseKey];
  if (!passphrase) throw new Error("合言葉が登録されていません");
  const secret = await getSessionSecret(env);
  return { passphrase, secret };
}

// リクエストのクッキーが有効なログイン状態か
export async function isLoggedIn(request, env, kind = "view", nowMs = Date.now()) {
  const { passphrase, secret } = await secretsOf(env, kind);
  const token = readCookie(request.headers.get("cookie"), KINDS[kind].cookie);
  return verifySession({ token, kind, secret, passphrase, nowMs });
}

// 入力された合言葉が正しければ、Set-Cookie に入れる文字列を返す。違えば null
export async function tryLogin(input, env, kind = "view", nowMs = Date.now()) {
  const { passphrase, secret } = await secretsOf(env, kind);
  if (typeof input !== "string" || !(await safeEqual(input, passphrase))) return null;
  const ttlMs = KINDS[kind].ttlMs();
  const token = await signSession({ kind, secret, passphrase, nowMs, ttlMs });
  return buildCookie(KINDS[kind].cookie, token, Math.floor(ttlMs / 1000));
}

export function logoutCookie(kind = "view") {
  return clearCookie(KINDS[kind].cookie);
}
