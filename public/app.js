// このファイルは、画面（①自分選択・②ボード・③入力）の表示と操作を担当します。
// データの出し入れと端末記憶は、必ず api.js を通します（ここにデモ用の分岐は書きません）。
// 画面の切り替えは、URLの # 以降（#input?m=人のID など）で行います。

import { CONFIG } from "./shared/config.js";
import * as api from "./api.js";

const app = document.getElementById("app");
let board = null;      // 最新のボード { date, members, entries }
let me = null;         // この端末の持ち主：null（未設定）／"none"（名簿にいない）／人のID
let timer = null;      // 自動更新のタイマー
let saving = false;    // 保存中（連打防止）
let form = null;       // 入力画面の選択状態 { memberId, am, pm, pmTouched }

// ---------- 小さな道具 ----------

// 画面に出す文字を安全にする（入力された文字が HTML として動かないように）
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// "2026-09-30" → "9/30(水)"
function dateLabel(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const week = "日月火水木金土"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}/${d}(${week})`;
}

// 状態を色つきの札にする。文字も必ず出す（色だけで区別しない）
function chip(statuses, label) {
  const s = statuses.find((x) => x.label === label);
  return `<span class="chip" style="background:${esc(s ? s.color : "#eee")}">${esc(label)}</span>`;
}

// ハッシュを変えて画面を切り替える（同じハッシュでも描き直す）
function go(hash) {
  const before = location.hash;
  location.hash = hash;
  if (location.hash === before) show();
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

// エラーの種類 → 画面に出す日本語
const ERROR_MESSAGES = {
  network: "送信できませんでした。電波の良い場所で、もう一度［保存する］を押してください",
  validation: "入力内容を確認してください",
  inactive: "この方は名簿から外れています。画面を更新します",
  server: "保存できませんでした。少し待ってからもう一度お試しください。続く場合は管理者へ",
};

// ---------- 画面の振り分け ----------

async function start() {
  me = api.getMe();
  try {
    board = await api.getBoard();
  } catch (err) {
    if (err.code === "unauthorized") return showLogin({ expired: false, keepScreen: false });
    showLoadError();
    return;
  }
  show();
}

// ---------- ①合言葉 ----------
// 合言葉の画面は #app とは別の場所に出す。keepScreen が true のときは #app を消さずに隠すだけなので、
// 入力途中の内容（③の入力欄など）が残り、合言葉を入れたあとにそのまま③へ戻れる。

let loginBox = null;

function showLogin({ expired, keepScreen }) {
  stopTimer();
  if (!keepScreen) app.innerHTML = "";
  app.hidden = true;
  if (loginBox) loginBox.remove();
  loginBox = document.createElement("div");
  loginBox.id = "login";
  loginBox.className = "login";
  loginBox.innerHTML = `
    <header class="bar"><h1>${esc(CONFIG.TEAM_NAME)}</h1></header>
    <form id="login-form">
      <p class="lead">${expired ? "もう一度合言葉を入れてください" : "合言葉を入力してください"}</p>
      <input id="login-pass" type="password" autocomplete="current-password" aria-label="合言葉">
      <p id="login-msg" class="msg" role="alert"></p>
      <button id="login-btn" class="btn primary big" type="submit">次へ</button>
    </form>`;
  app.after(loginBox);
  document.getElementById("login-pass").focus();
  document.getElementById("login-form").addEventListener("submit", (event) => {
    event.preventDefault();
    submitLogin(keepScreen);
  });
}

async function submitLogin(keepScreen) {
  const input = document.getElementById("login-pass");
  const btn = document.getElementById("login-btn");
  const msg = document.getElementById("login-msg");
  btn.disabled = true;
  btn.textContent = "確認中…";
  msg.textContent = "";
  try {
    await api.login(input.value); // 間違いのときはサーバーが1秒待ってから返す
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "次へ";
    msg.textContent = err.code === "wrong" ? "合言葉が違います"
      : err.code === "network" ? "送信できませんでした。電波の良い場所で、もう一度お試しください"
      : "確認できませんでした。少し待ってからもう一度お試しください。続く場合は管理者へ";
    if (err.code === "wrong") input.select();
    return;
  }
  if (!keepScreen) {
    try {
      board = await api.getBoard();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "次へ";
      msg.textContent = "読み込めませんでした。もう一度［次へ］を押してください";
      return;
    }
  }
  loginBox.remove();
  loginBox = null;
  app.hidden = false;
  if (keepScreen) {
    setMsg("合言葉を確認しました。もう一度［保存する］を押してください");
  } else {
    show();
  }
}

function show() {
  stopTimer();
  const hash = location.hash;
  if (me === null || hash === "#pick") return showPicker();
  if (hash.startsWith("#input")) {
    const id = Number(new URLSearchParams(hash.split("?")[1] || "").get("m"));
    const member = board.members.find((m) => m.id === id);
    if (member) return showInput(member);
  }
  showBoard();
}

function showLoadError() {
  stopTimer();
  app.innerHTML = `
    <p class="empty">読み込めませんでした。</p>
    <div class="center"><button class="btn primary" data-act="reload">再読み込み</button></div>`;
}

// ---------- ①自分選択 ----------

function showPicker() {
  const buttons = board.members
    .map((m) => `<button class="btn pick" data-act="choose" data-m="${m.id}">${esc(m.name)}</button>`)
    .join("");
  app.innerHTML = `
    <header class="bar"><h1>あなたは誰ですか？</h1></header>
    <p class="lead">（この端末で入力した記録に使います）</p>
    ${board.members.length === 0 ? '<p class="empty">名簿が空です。管理者が名簿を登録してください</p>' : ""}
    <div class="pick-list">${buttons}</div>
    <div class="pick-list">
      <button class="btn pick" data-act="choose" data-m="none">名簿にいない（入力者は記録されません）</button>
      ${me !== null ? '<button class="btn pick" data-act="back">戻る</button>' : ""}
    </div>`;
}

// ---------- ②ボード ----------

function showBoard() {
  const cards = board.members.map(cardHtml).join("");
  app.innerHTML = `
    <header class="bar">
      <h1>${esc(dateLabel(board.date))} の予定</h1>
      <div class="bar-btns">
        <button class="btn small" data-act="refresh">更新</button>
        <button class="btn small" data-act="menu" aria-label="メニュー">≡</button>
      </div>
    </header>
    <nav id="menu" class="menu" hidden>
      <button class="menu-item" data-act="pick">この端末の持ち主を変える</button>
      <a class="menu-item" href="/rules.html">ルール</a>
    </nav>
    ${board.members.length === 0 ? '<p class="empty">名簿が空です。管理者が名簿を登録してください</p>' : ""}
    <section>${cards}</section>
    <a class="rules-link" href="/rules.html">ご利用ルール</a>
    <div class="fixed-bar"><button class="btn primary big" data-act="mine">＋ 自分の予定を入れる</button></div>`;

  // 60秒ごと（画面が見えているときだけ）に最新化する
  timer = setInterval(() => {
    if (document.visibilityState === "visible") refresh();
  }, CONFIG.REFRESH_SECONDS * 1000);
}

function cardHtml(m) {
  const link = `href="#input?m=${m.id}"`;
  const e = board.entries.find((x) => x.member_id === m.id);
  if (!e) {
    return `<a class="card unentered" ${link}><span class="name">${esc(m.name)}</span><span>未入力</span></a>`;
  }
  return `<a class="card" ${link}>
    <div class="name">${esc(m.name)}</div>
    ${halfHtml("午前", CONFIG.AM_STATUSES, e.am_status, e.am_place, e.am_note)}
    ${halfHtml("午後", CONFIG.PM_STATUSES, e.pm_status, e.pm_place, e.pm_note)}
    ${proxyHtml(e)}
  </a>`;
}

// 午前または午後の1行。行先・備考が空なら状態だけを出す。休みを選んだ側は行先・備考を出さない
function halfHtml(label, statuses, status, place, note) {
  const off = status === CONFIG.OFF_STATUS;
  return `<div class="half">
    <span class="half-label">${label}</span>${chip(statuses, status)}
    ${!off && place ? `<span class="place">${esc(place)}</span>` : ""}
    ${!off && note ? `<div class="note">${esc(note)}</div>` : ""}
  </div>`;
}

// 代理かどうかは保存せず、入力者と対象者から判定する（入力者が空、または対象者と違えば代理）
function isProxy(e) {
  return e.entered_by === null || e.entered_by === undefined || e.entered_by !== e.member_id;
}

// 代理入力の表示：本人＝なし／入力者あり＝「代理：○○」／入力者未設定＝「代理入力（入力者未設定）」
function proxyHtml(e) {
  if (!isProxy(e)) return "";
  return e.entered_by_name
    ? `<div class="proxy">代理：${esc(e.entered_by_name)}</div>`
    : `<div class="proxy">代理入力（入力者未設定）</div>`;
}

async function refresh() {
  if (loginBox) return; // 合言葉の画面を出している間は、更新も画面の描き直しもしない
  try {
    board = await api.getBoard();
  } catch (err) {
    if (err.code === "unauthorized") return showLogin({ expired: true, keepScreen: false });
    showLoadError();
    return;
  }
  // 入力画面を開いているときは、入力中の内容を消さないよう描き直さない
  if (!location.hash.startsWith("#input") && location.hash !== "#pick") showBoard();
}

// ---------- ③入力 ----------

function showInput(member) {
  const e = board.entries.find((x) => x.member_id === member.id);
  // すでに入力があれば、その内容から始める（午後は手で選んだ扱い＝自動で変えない）
  form = { memberId: member.id, am: e ? e.am_status : null, pm: e ? e.pm_status : null, pmTouched: !!e };
  const isProxy = me !== member.id;

  app.innerHTML = `
    <header class="bar">
      <button class="btn small" data-act="back">← 戻る</button>
      <h1>${esc(member.name)}さんの ${esc(dateLabel(board.date))}</h1>
    </header>
    ${isProxy ? '<p class="proxy-note">※代理入力になります</p>' : ""}
    ${sectionHtml("am", "午前", CONFIG.AM_STATUSES, e)}
    ${sectionHtml("pm", "午後（午前に合わせて状態を自動選択）", CONFIG.PM_STATUSES, e)}
    <p id="msg" class="msg" role="alert"></p>
    <div class="fixed-bar"><button id="save" class="btn primary big" data-act="save">保存する</button></div>`;

  for (const key of ["am", "pm"]) {
    updateCount(`${key}-place`, CONFIG.PLACE_MAX);
    updateCount(`${key}-note`, CONFIG.NOTE_MAX);
  }
  updateStatusButtons();
}

function sectionHtml(key, title, statuses, e) {
  const buttons = statuses
    .map((s) => `<button type="button" class="btn status" data-act="status" data-half="${key}"
      data-v="${esc(s.label)}" style="--c:${esc(s.color)}" aria-pressed="false">${esc(s.label)}</button>`)
    .join("");
  return `<section class="sec">
    <h2>${title}</h2>
    <div class="status-row">${buttons}</div>
    <div id="${key}-detail">
      <label class="lbl" for="${key}-place">行先（任意）</label>
      <input id="${key}-place" type="text" maxlength="${CONFIG.PLACE_MAX}"
        placeholder="例：新宿方面、本社、〇〇ビル打合せ" value="${esc(e ? e[key + "_place"] : "")}">
      <div class="count" id="${key}-place-count"></div>
      <label class="lbl" for="${key}-note">備考（任意・自由記述）</label>
      <p class="warn">⚠ 個人宅の住所、鍵・暗証番号は書かないでください <a href="/rules.html">ルール</a></p>
      <textarea id="${key}-note" rows="3" maxlength="${CONFIG.NOTE_MAX}"
        placeholder="例：14時に戻ります／〇〇様と打合せ">${esc(e ? e[key + "_note"] : "")}</textarea>
      <div class="count" id="${key}-note-count"></div>
    </div>
  </section>`;
}

// 選ばれている状態のボタンを目立たせる（色に加えて、太い枠と ✓ も付ける）
function updateStatusButtons() {
  for (const btn of document.querySelectorAll('[data-act="status"]')) {
    const chosen = form[btn.dataset.half] === btn.dataset.v;
    btn.setAttribute("aria-pressed", chosen ? "true" : "false");
    btn.textContent = (chosen ? "✓ " : "") + btn.dataset.v;
  }
  // 休みを選んだ側は行先・備考の欄を隠す（中身も空にする。別の状態に戻したら空の欄が再表示される）
  for (const key of ["am", "pm"]) {
    const off = form[key] === CONFIG.OFF_STATUS;
    const detail = document.getElementById(`${key}-detail`);
    if (off && !detail.hidden) {
      for (const field of ["place", "note"]) {
        document.getElementById(`${key}-${field}`).value = "";
        updateCount(`${key}-${field}`, field === "place" ? CONFIG.PLACE_MAX : CONFIG.NOTE_MAX);
      }
    }
    detail.hidden = off;
  }
}

function updateCount(id, max) {
  const el = document.getElementById(id);
  document.getElementById(`${id}-count`).textContent = `あと${max - el.value.length}文字`;
}

// 午前を選んだときの午後の自動選択（config の PM_FOLLOW。なければ同じ名前）
function followStatus(amLabel) {
  const want = CONFIG.PM_FOLLOW[amLabel] ?? amLabel;
  return CONFIG.PM_STATUSES.some((s) => s.label === want) ? want : null;
}

function chooseStatus(half, label) {
  form[half] = label;
  if (half === "pm") {
    form.pmTouched = true; // 午後を手で押したら、その後は自動で変えない
  } else if (!form.pmTouched) {
    const follow = followStatus(label);
    if (follow) form.pm = follow;
  }
  updateStatusButtons();
}

function setMsg(text) {
  document.getElementById("msg").textContent = text;
}

async function save() {
  if (saving) return;
  if (!form.am || !form.pm) {
    setMsg("午前と午後の状態を選んでください");
    return;
  }
  const value = (id) => document.getElementById(id).value;
  const btn = document.getElementById("save");
  saving = true;
  btn.disabled = true;
  btn.textContent = "保存中…";
  setMsg("");
  try {
    board = await api.saveEntry({
      member_id: form.memberId,
      am_status: form.am,
      pm_status: form.pm,
      am_place: value("am-place"),
      am_note: value("am-note"),
      pm_place: value("pm-place"),
      pm_note: value("pm-note"),
      entered_by: typeof me === "number" ? me : null,
    });
  } catch (err) {
    saving = false;
    btn.disabled = false;
    btn.textContent = "保存する";
    // ログイン期限切れ：入力欄は消さずに隠し、合言葉のあと③へ戻す
    if (err.code === "unauthorized") return showLogin({ expired: true, keepScreen: true });
    setMsg(ERROR_MESSAGES[err.code] || ERROR_MESSAGES.server);
    if (err.code === "inactive") setTimeout(async () => { await refresh(); go("#"); }, 1500);
    return; // 入力内容は画面に残したまま
  }
  saving = false;
  setMsg("保存しました");
  setTimeout(() => go("#"), 2000); // 2秒見せてからボードへ
}

// ---------- 操作の受け付け（ボタン類をまとめて処理） ----------

app.addEventListener("click", (event) => {
  const el = event.target.closest("[data-act]");
  if (!el) return;
  switch (el.dataset.act) {
    case "reload": location.reload(); break;
    case "refresh": refresh(); break;
    case "menu": document.getElementById("menu").hidden = !document.getElementById("menu").hidden; break;
    case "pick": go("#pick"); break;
    case "back": go("#"); break;
    case "choose":
      me = el.dataset.m === "none" ? "none" : Number(el.dataset.m);
      api.setMe(me);
      go("#");
      break;
    case "mine":
      // 持ち主が名簿の人ならその人の入力画面へ。それ以外は自分選択へ
      if (typeof me === "number" && board.members.some((m) => m.id === me)) go(`#input?m=${me}`);
      else go("#pick");
      break;
    case "status": chooseStatus(el.dataset.half, el.dataset.v); break;
    case "save": save(); break;
  }
});

// 文字数の表示を更新する
app.addEventListener("input", (event) => {
  const id = event.target.id;
  if (id.endsWith("-place")) updateCount(id, CONFIG.PLACE_MAX);
  if (id.endsWith("-note")) updateCount(id, CONFIG.NOTE_MAX);
});

window.addEventListener("hashchange", () => { if (board && !loginBox) show(); });
// 画面に戻ってきたときも最新にする（0時をまたいだ場合も、ここで新しい日付になる）
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && board && !location.hash.startsWith("#input")) refresh();
});

start();
