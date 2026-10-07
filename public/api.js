// このファイルは、画面とデータの間の窓口です。データの出し入れと「この端末の持ち主」の記憶は、必ずここを通ります。
// デモ（window.DEMO が true）はブラウザの中だけで動き、本物はサーバー（/api/）に送ります。
// デモと本物の切り替えは、このファイルの中だけで行います（画面側にデモ用の分岐は書かない）。

import { CONFIG } from "./shared/config.js";

const DEMO = window.DEMO === true;
// 端末記憶の名前。デモと本番で必ず分ける（本番の持ち主がデモで書き換わらないように）
const ME_KEY = DEMO ? "demo.me" : "board.me";
let memoryMe = null; // 端末の保存領域が使えないときの代わり（開いている間だけ有効）

// ---------- 端末の持ち主 ----------
// 戻り値：null（未設定）／"none"（名簿にいない）／人のID（数字）
export function getMe() {
  let v;
  try {
    v = localStorage.getItem(ME_KEY);
  } catch {
    v = memoryMe;
  }
  if (v === null || v === undefined) return null;
  if (v === "none") return "none";
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

export function setMe(value) {
  memoryMe = String(value);
  try {
    localStorage.setItem(ME_KEY, String(value));
  } catch {
    // 保存できなくても、開いている間は memoryMe で動く
  }
}

// ---------- データの出し入れ ----------
// 今日のボード { date, members[], entries[] } を返す（entries は1人1行）
export async function getBoard() {
  if (DEMO) return demoBoard(await demoState());
  return request("/api/board");
}

// 入力を保存して、保存後のボードを返す。失敗時は err.code を付けて投げる
// （code：network / validation / inactive / unauthorized / server）。getBoard も unauthorized を投げることがある
export async function saveEntry(input) {
  if (DEMO) return demoSave(await demoState(), input);
  return request("/api/entries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

// 合言葉でログインする。成功すれば何も返さず、失敗時は err.code を付けて投げる
// （code：wrong＝合言葉が違う／network／server）。デモは合言葉なしなので、何もせず成功する
export async function login(passphrase) {
  if (DEMO) return;
  await request("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ passphrase }),
  });
}

// ---------- 管理画面（admin.html）用。デモにはない ----------
// 管理者用の合言葉でログイン（失敗時の code は login と同じ）
export async function adminLogin(passphrase) {
  await request("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ passphrase }),
  });
}

const jsonOptions = (method, body) => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

// 名簿の全員（無効を含む）を表示順で返す。以下は、成功すれば更新後の名簿 { members } を返す
// 失敗時の code：unauthorized / validation / duplicate（名前の重複）/ network / server
export const adminGetMembers = () => request("/api/admin/members");
export const adminAddMember = (name) => request("/api/admin/members", jsonOptions("POST", { name }));
export const adminUpdateMember = (id, fields) => request(`/api/admin/members/${id}`, jsonOptions("PATCH", fields));

// ---------- 本物：サーバーに送る（日付は送らない。「今日」はサーバーが決める） ----------
async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(path, { ...options, cache: "no-store" });
  } catch {
    throw fail("network"); // 電波がない・通信失敗。自動再送はしない
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    // 中身がJSONでない場合は、下で server 扱いにする
  }
  if (!res.ok) {
    // サーバーが返す error（validation / inactive / wrong / unauthorized）はそのまま、それ以外は server
    // unauthorized＝ログインしていない・期限切れ（401）、wrong＝合言葉が違う
    const known = body && ["validation", "inactive", "wrong", "unauthorized", "duplicate"].includes(body.error);
    throw fail(known ? body.error : "server");
  }
  if (!body) throw fail("server");
  return body;
}

// ---------- デモの中身（ブラウザ内の変数だけで動く。再読み込みで初期状態に戻る） ----------
let demo = null;

// デモ用の「今日」（日本時間）。本物はサーバーが決める
function demoToday() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function demoState() {
  if (demo) return demo;
  const data = await import("./demo-data.js");
  const today = demoToday();
  demo = {
    members: data.DEMO_MEMBERS.map((m) => ({ ...m })),
    // 1人1行（member_id をキーにして上書きする。本番の entries 表と同じ形）
    entries: new Map(data.DEMO_ENTRIES.map((e) => [e.member_id, { ...e, board_date: today }])),
  };
  return demo;
}

// 今日の、有効な人と、今日の行を返す（日付が今日でない行は出さない）
function demoBoard(state) {
  const today = demoToday();
  const members = state.members
    .filter((m) => m.is_active === 1)
    .sort((a, b) => a.sort_order - b.sort_order);
  const entries = [];
  for (const m of members) {
    const e = state.entries.get(m.id);
    if (!e || e.board_date !== today) continue;
    const by = state.members.find((x) => x.id === e.entered_by); // 無効な人でも名前を引く
    entries.push({ ...e, entered_by_name: by ? by.name : "" });
  }
  return JSON.parse(JSON.stringify({ date: today, members, entries }));
}

function fail(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

function demoSave(state, input) {
  const member = state.members.find((m) => m.id === input.member_id);
  if (!member || member.is_active !== 1) throw fail("inactive");

  const clean = (v) => String(v ?? "").trim();
  const entry = {
    member_id: member.id,
    am_status: input.am_status,
    pm_status: input.pm_status,
    am_place: clean(input.am_place),
    am_note: clean(input.am_note),
    pm_place: clean(input.pm_place),
    pm_note: clean(input.pm_note),
    entered_by: input.entered_by ?? null,
  };

  const okAm = CONFIG.AM_STATUSES.some((s) => s.label === entry.am_status);
  const okPm = CONFIG.PM_STATUSES.some((s) => s.label === entry.pm_status);
  const okLen =
    entry.am_place.length <= CONFIG.PLACE_MAX && entry.pm_place.length <= CONFIG.PLACE_MAX &&
    entry.am_note.length <= CONFIG.NOTE_MAX && entry.pm_note.length <= CONFIG.NOTE_MAX;
  if (!okAm || !okPm || !okLen) throw fail("validation");

  if (entry.entered_by !== null) {
    const by = state.members.find((m) => m.id === entry.entered_by);
    if (!by || by.is_active !== 1) throw fail("validation");
  }

  // 休みを選んだ側の行先・備考は空にして保存する（画面で隠すだけに頼らない）
  if (entry.am_status === CONFIG.OFF_STATUS) { entry.am_place = ""; entry.am_note = ""; }
  if (entry.pm_status === CONFIG.OFF_STATUS) { entry.pm_place = ""; entry.pm_note = ""; }

  // 1人1行を上書きする（前の内容は消える）
  state.entries.set(member.id, { ...entry, board_date: demoToday() });
  return demoBoard(state);
}