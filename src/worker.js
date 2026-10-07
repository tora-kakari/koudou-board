// このファイルは、サーバーの入口です。/api/login・/api/logout（合言葉）、/api/board（今日のボードを返す）、
// /api/entries（予定を保存する）を受け付けます。board と entries は合言葉でログインしていないと 401 です。
// /api/admin/*（名簿の管理）は管理者用の合言葉でログインしていないと 401 です。毎日0時（日本時間）の定時削除（scheduled）もここです。
// 画面のファイル（public）はここを通らず、Cloudflare がそのまま配信します。

import { todayJST, nowJST } from "./lib/date.js";
import { isLoggedIn, tryLogin, logoutCookie } from "./lib/auth.js";
import { deleteOldEntries } from "./lib/cleanup.js";
import { validateNewMember, validateMemberPatch } from "./lib/members.js";
import { validateEntry } from "./lib/validate.js";
import { buildBoard } from "./lib/board.js";

// JSON を返す。キャッシュはさせない（古いボードを最新と誤解させないため）
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

// 名簿（無効の人を含む全員）を読む
async function loadMembers(db) {
  const { results } = await db
    .prepare("SELECT id, name, sort_order, is_active FROM members")
    .all();
  return results;
}

// 今日のボードを組み立てる。「今日」は todayJST() だけで決める
async function loadBoard(db) {
  const today = todayJST();
  const members = await loadMembers(db);
  const { results } = await db
    .prepare("SELECT * FROM entries WHERE board_date = ?1")
    .bind(today)
    .all();
  return buildBoard({ members, entries: results, today });
}

// 保存：1人1行を上書きする
function upsertEntry(db, v, today) {
  return db
    .prepare(
      `INSERT INTO entries (member_id, board_date, am_status, pm_status, am_place, am_note, pm_place, pm_note, entered_by)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
       ON CONFLICT(member_id) DO UPDATE SET
         board_date = excluded.board_date, am_status = excluded.am_status, pm_status = excluded.pm_status,
         am_place = excluded.am_place, am_note = excluded.am_note, pm_place = excluded.pm_place,
         pm_note = excluded.pm_note, entered_by = excluded.entered_by`
    )
    .bind(v.member_id, today, v.am_status, v.pm_status, v.am_place, v.am_note, v.pm_place, v.pm_note, v.entered_by)
    .run();
}

// POST /api/login（kind="view"）・/api/admin/login（kind="admin"）：
// 合言葉が正しければクッキーを発行する。違えば1秒待ってから 401
async function handleLogin(request, env, kind) {
  let input = null;
  try {
    input = await request.json();
  } catch {
    // 中身が読めなければ、合言葉が違う扱いにする
  }
  const cookie = await tryLogin(input && input.passphrase, env, kind);
  if (!cookie) {
    await new Promise((resolve) => setTimeout(resolve, 1000)); // 総当たりを遅くする
    return json({ error: "wrong" }, 401);
  }
  const res = json({ ok: true });
  res.headers.append("set-cookie", cookie);
  return res;
}

// POST /api/logout：クッキーを消す
function handleLogout() {
  const res = json({ ok: true });
  res.headers.append("set-cookie", logoutCookie());
  return res;
}

// GET /api/board（ログイン確認あり。未ログインは 401）
async function handleBoard(env) {
  return json(await loadBoard(env.DB));
}

// POST /api/entries（ログイン確認あり。未ログインは 401）
async function handleSave(request, env) {
  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: "validation" }, 400);
  }

  const members = await loadMembers(env.DB);
  const checked = validateEntry(input, members);
  if (!checked.ok) {
    // validation＝入力内容がおかしい（400）／inactive＝対象の人が無効（422）
    return json({ error: checked.code }, checked.code === "inactive" ? 422 : 400);
  }

  const today = todayJST(); // 日付は端末から受け取らず、ここで決める
  await upsertEntry(env.DB, checked.value, today);

  // 今日以外の日付の行を削除。失敗しても保存は成功扱いにして、ログにだけ残す
  try {
    await deleteOldEntries(env.DB, today);
  } catch (err) {
    console.error("古い行の削除に失敗しました（保存は成功）:", err);
  }

  return json(await loadBoard(env.DB));
}

// ---------- 管理（名簿）。管理者用クッキーが必要（閲覧用クッキーでは入れない） ----------

async function loadAllMembers(db) {
  const { results } = await db
    .prepare("SELECT id, name, sort_order, is_active FROM members ORDER BY sort_order, id")
    .all();
  return results;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// 名前の重複は、チェックをすり抜けても表の UNIQUE 制限で止まる。その失敗も 409 にする
function isUniqueError(err) {
  return /UNIQUE/i.test(String(err && err.message));
}

function checkFailed(code) {
  return json({ error: code }, code === "duplicate" ? 409 : 400);
}

// GET /api/admin/members：名簿の全員（無効の人を含む）
async function handleAdminList(env) {
  return json({ members: await loadAllMembers(env.DB) });
}

// POST /api/admin/members：名簿に追加（表示順は最後）
async function handleAdminAdd(request, env) {
  const members = await loadAllMembers(env.DB);
  const checked = validateNewMember(await readJson(request), members);
  if (!checked.ok) return checkFailed(checked.code);

  const now = nowJST();
  const order = members.reduce((max, m) => Math.max(max, m.sort_order), 0) + 1;
  try {
    await env.DB
      .prepare("INSERT INTO members (name, sort_order, is_active, created_at, updated_at) VALUES (?1, ?2, 1, ?3, ?3)")
      .bind(checked.value, order, now)
      .run();
  } catch (err) {
    if (isUniqueError(err)) return checkFailed("duplicate");
    throw err;
  }
  return json({ members: await loadAllMembers(env.DB) });
}

// PATCH /api/admin/members/:id：名前・表示順・在籍の切替（削除はない）
async function handleAdminPatch(request, env, id) {
  const members = await loadAllMembers(env.DB);
  if (!members.some((m) => m.id === id)) return json({ error: "not_found" }, 404);
  const checked = validateMemberPatch(await readJson(request), members, id);
  if (!checked.ok) return checkFailed(checked.code);

  const v = checked.value;
  const sets = [];
  const values = [];
  for (const col of ["name", "sort_order", "is_active"]) {
    if (v[col] !== undefined) {
      values.push(v[col]);
      sets.push(`${col} = ?${values.length}`); // 列名は上の固定の3つだけ（入力値は bind で渡す）
    }
  }
  values.push(nowJST(), id);
  try {
    await env.DB
      .prepare(`UPDATE members SET ${sets.join(", ")}, updated_at = ?${values.length - 1} WHERE id = ?${values.length}`)
      .bind(...values)
      .run();
  } catch (err) {
    if (isUniqueError(err)) return checkFailed("duplicate");
    throw err;
  }
  return json({ members: await loadAllMembers(env.DB) });
}

// /api/admin/* の振り分け（login 以外は管理者クッキーの確認つき）
async function handleAdmin(request, env, pathname) {
  if (pathname === "/api/admin/login") {
    if (request.method !== "POST") return json({ error: "method" }, 405);
    return handleLogin(request, env, "admin");
  }
  const target = pathname === "/api/admin/members" ? "list" : pathname.match(/^\/api\/admin\/members\/(\d+)$/);
  if (!target) return json({ error: "not_found" }, 404);
  if (!(await isLoggedIn(request, env, "admin"))) return json({ error: "unauthorized" }, 401);
  if (target === "list") {
    if (request.method === "GET") return handleAdminList(env);
    if (request.method === "POST") return handleAdminAdd(request, env);
    return json({ error: "method" }, 405);
  }
  if (request.method !== "PATCH") return json({ error: "method" }, 405);
  return handleAdminPatch(request, env, Number(target[1]));
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    try {
      if (pathname === "/api/login") {
        if (request.method !== "POST") return json({ error: "method" }, 405);
        return await handleLogin(request, env, "view");
      }
      if (pathname.startsWith("/api/admin/")) return await handleAdmin(request, env, pathname);
      if (pathname === "/api/logout") {
        if (request.method !== "POST") return json({ error: "method" }, 405);
        return handleLogout();
      }
      if (pathname === "/api/board") {
        if (request.method !== "GET") return json({ error: "method" }, 405);
        if (!(await isLoggedIn(request, env))) return json({ error: "unauthorized" }, 401);
        return await handleBoard(env);
      }
      if (pathname === "/api/entries") {
        if (request.method !== "POST") return json({ error: "method" }, 405);
        if (!(await isLoggedIn(request, env))) return json({ error: "unauthorized" }, 401);
        return await handleSave(request, env);
      }
      return json({ error: "not_found" }, 404);
    } catch (err) {
      // データベースに接続できない等。詳細はログにだけ出し、画面には日本語の定型文を出させる
      console.error("サーバー内部の失敗:", err);
      return json({ error: "server" }, 500);
    }
  },

  // 毎日 日本時間0:00（世界標準時15:00。wrangler.toml の cron）に、今日以外の行を消す。失敗してもログに残すだけ
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      deleteOldEntries(env.DB, todayJST(new Date(event.scheduledTime))).catch((err) => {
        console.error("定時の古い行の削除に失敗しました:", err);
      })
    );
  },
};
