// このファイルは、⑤管理画面（名簿の一覧・追加・名前の変更・表示順・在籍の切替）を担当します。
// データの出し入れは必ず api.js を通します。人の「削除」はありません（無効にするだけ）。

import { CONFIG } from "./shared/config.js";
import * as api from "./api.js";

const app = document.getElementById("app");
let members = [];     // 名簿の全員（無効を含む・表示順）
let busy = false;     // 通信中（連打防止）

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// エラーの種類 → 画面に出す日本語
const ERROR_MESSAGES = {
  network: "送信できませんでした。電波の良い場所で、もう一度お試しください",
  validation: `名前を確認してください（空欄にはできません。${CONFIG.NAME_MAX}文字までです）`,
  duplicate: "同じ名前の方がいます（名簿から外れた方を含む）。『青木（清）』のように区別できる名前にしてください",
  server: "保存できませんでした。少し待ってからもう一度お試しください。続く場合は管理者へ",
};

// ---------- 合言葉の画面 ----------

function showLogin(expired) {
  app.innerHTML = `
    <header class="bar"><h1>名簿の管理</h1></header>
    <form id="login-form">
      <p class="lead">${expired ? "もう一度、管理者用の合言葉を入れてください" : "管理者用の合言葉を入力してください"}</p>
      <input id="login-pass" type="password" autocomplete="current-password" aria-label="管理者用の合言葉">
      <p id="login-msg" class="msg" role="alert"></p>
      <button id="login-btn" class="btn primary big" type="submit">次へ</button>
    </form>`;
  document.getElementById("login-pass").focus();
  document.getElementById("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("login-pass");
    const btn = document.getElementById("login-btn");
    const msg = document.getElementById("login-msg");
    btn.disabled = true;
    btn.textContent = "確認中…";
    msg.textContent = "";
    try {
      await api.adminLogin(input.value); // 間違いのときはサーバーが1秒待ってから返す
      members = (await api.adminGetMembers()).members;
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "次へ";
      msg.textContent = err.code === "wrong" ? "合言葉が違います" : (ERROR_MESSAGES[err.code] || ERROR_MESSAGES.server);
      if (err.code === "wrong") input.select();
      return;
    }
    showList();
  });
}

// ---------- 名簿の画面 ----------

function rowHtml(m, i) {
  const last = members.length - 1;
  return `<li class="admin-row${m.is_active ? "" : " inactive"}" data-id="${m.id}">
    <div class="admin-state">${m.is_active ? "在籍" : "無効（ボードに出ません）"}</div>
    <input type="text" class="admin-name" maxlength="${CONFIG.NAME_MAX}" value="${esc(m.name)}" aria-label="名前">
    <div class="admin-btns">
      <button class="btn" data-act="rename">名前を保存</button>
      <button class="btn" data-act="up" aria-label="上へ" ${i === 0 ? "disabled" : ""}>↑ 上へ</button>
      <button class="btn" data-act="down" aria-label="下へ" ${i === last ? "disabled" : ""}>↓ 下へ</button>
      <button class="btn" data-act="toggle">${m.is_active ? "無効にする" : "在籍に戻す"}</button>
    </div>
  </li>`;
}

function showList() {
  app.innerHTML = `
    <header class="bar"><h1>名簿の管理</h1></header>
    <p class="lead">人の削除はできません。辞めた方は「無効にする」を押してください（ボードと自分選択に出なくなります）。</p>
    <section class="sec">
      <h2>追加</h2>
      <label class="lbl" for="new-name">名前</label>
      <input id="new-name" type="text" maxlength="${CONFIG.NAME_MAX}" placeholder="例：青木（清）">
      <button class="btn primary big" data-act="add">追加する</button>
    </section>
    <p id="msg" class="msg" role="alert"></p>
    <h2>名簿（表示順）</h2>
    ${members.length === 0 ? '<p class="empty">名簿が空です。上から追加してください</p>' : ""}
    <ul class="admin-list">${members.map(rowHtml).join("")}</ul>`;
}

function setMsg(text) {
  document.getElementById("msg").textContent = text;
}

// 画面の名簿だけを描き直す（追加欄と、他の行で書き換え中の名前は消さない）
function redrawList() {
  const edits = new Map(
    [...document.querySelectorAll(".admin-row")].map((row) => [row.dataset.id, row.querySelector(".admin-name").value])
  );
  document.querySelector(".admin-list").innerHTML = members.map(rowHtml).join("");
  for (const row of document.querySelectorAll(".admin-row")) {
    const typed = edits.get(row.dataset.id);
    if (typed !== undefined) row.querySelector(".admin-name").value = typed;
  }
}

// 通信を1つ実行する。失敗したら日本語を出し、期限切れ（401）なら合言葉の画面へ。成功なら true
async function run(task) {
  if (busy) return false;
  busy = true;
  setMsg("");
  try {
    await task();
    return true;
  } catch (err) {
    if (err.code === "unauthorized") showLogin(true);
    else setMsg(ERROR_MESSAGES[err.code] || ERROR_MESSAGES.server);
    return false;
  } finally {
    busy = false;
  }
}

// 並べ替え：新しい順番を作り、番号（1から連番）が今と違う人だけ保存する
async function move(id, delta) {
  const from = members.findIndex((m) => m.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= members.length) return;
  const next = members.slice();
  [next[from], next[to]] = [next[to], next[from]];
  await run(async () => {
    for (let i = 0; i < next.length; i++) {
      if (next[i].sort_order !== i + 1) {
        members = (await api.adminUpdateMember(next[i].id, { sort_order: i + 1 })).members;
      }
    }
    redrawList();
  });
}

app.addEventListener("click", async (event) => {
  const el = event.target.closest("[data-act]");
  if (!el) return;
  const row = el.closest(".admin-row");
  const id = row ? Number(row.dataset.id) : null;
  switch (el.dataset.act) {
    case "add": {
      const input = document.getElementById("new-name");
      const ok = await run(async () => {
        members = (await api.adminAddMember(input.value)).members;
      });
      if (ok) { redrawList(); input.value = ""; setMsg("追加しました"); } // 失敗のときは入力欄の内容を残す
      break;
    }
    case "rename": {
      const ok = await run(async () => {
        members = (await api.adminUpdateMember(id, { name: row.querySelector(".admin-name").value })).members;
      });
      if (ok) {
        // 保存した名前（前後の空白を取ったもの）で、この行の欄を更新する
        row.querySelector(".admin-name").value = members.find((m) => m.id === id).name;
        setMsg("名前を保存しました");
      }
      break;
    }
    case "up": await move(id, -1); break;
    case "down": await move(id, 1); break;
    case "toggle": {
      const m = members.find((x) => x.id === id);
      if (m.is_active && !confirm(`${m.name} さんを無効にします。ボードと自分選択に出なくなります。よろしいですか？`)) break;
      const ok = await run(async () => {
        members = (await api.adminUpdateMember(id, { is_active: m.is_active ? 0 : 1 })).members;
      });
      if (ok) { redrawList(); setMsg(m.is_active ? "在籍に戻しました" : "無効にしました"); }
      break;
    }
  }
});

// 起動：すでに管理者としてログインしていれば名簿を出し、401 なら合言葉の画面
(async () => {
  try {
    members = (await api.adminGetMembers()).members;
  } catch (err) {
    if (err.code === "unauthorized") return showLogin(false);
    app.innerHTML = `<p class="empty">読み込めませんでした。</p>
      <div class="center"><button class="btn primary" onclick="location.reload()">再読み込み</button></div>`;
    return;
  }
  showList();
})();
