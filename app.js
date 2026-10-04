/* =========================================================
   平成会勝ち馬投票システム - app.js
   ========================================================= */

/* ---- 設定エリア ---- */
// 出走者リストの初期値（フォールバック用）。
// 通常は管理画面の「出走者の編集」から変更してください。そちらで保存した内容が
// Firestore（config/horses）に保存され、ここより優先して使われます。
const DEFAULT_HORSES = [
  "1 やまだ", "2 すずき", "3 さとう", "4 たなか",
  "5 いとう", "6 わたなべ", "7 なかむら", "8 こばやし",
  "9 かとう", "10 よしだ", "11 やまもと", "12 さいとう",
  "13 まつもと", "14 いのうえ", "15 きむら", "16 はやし"
];
let HORSES = DEFAULT_HORSES.slice();
const UNIT_PRICE = 250; // 1口の金額（円）
/* ---- ここまで ---- */

// 管理画面で保存された出走者リストをFirestoreから読み込む。
// 失敗した場合や未設定の場合は DEFAULT_HORSES のまま動作する。
async function loadHorses() {
  try {
    const snap = await db.collection("config").doc("horses").get();
    if (snap.exists) {
      const data = snap.data();
      if (Array.isArray(data.list) && data.list.length > 0) {
        HORSES = data.list;
      }
    }
  } catch (err) {
    console.error("failed to load horses config, using default list", err);
  }
}

const state = {
  name: "",
  docId: "",
  picks: [],       // { first, second, third }
  uid: null,
  submitted: false,
};

/* ---------- ユーティリティ ---------- */
function $(id) { return document.getElementById(id); }

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
  $(id).classList.add("active");
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.remove("show"), 2400);
}

function fmtYen(n) {
  return "¥" + new Intl.NumberFormat("ja-JP").format(Math.round(n));
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

// 名前をFirestoreのドキュメントIDとして使える形に正規化（前後の空白・全角スペース除去程度の軽い正規化）
function sanitizeName(name) {
  return String(name || "").trim().replace(/\s+/g, "");
}

/* ---------- 出走者セレクトボックスの生成 ---------- */
function buildHorseSelect(selectEl) {
  selectEl.innerHTML =
    `<option value="">選択してください</option>` +
    HORSES.map((h) => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join("");
}

function initSelects() {
  [$("selFirst"), $("selSecond"), $("selThird")].forEach(buildHorseSelect);
}

/* ---------- 買い目の追加・表示 ---------- */
function addPick() {
  const first = $("selFirst").value;
  const second = $("selSecond").value;
  const third = $("selThird").value;

  if (!first || !second || !third) {
    toast("1着・2着・3着すべて選択してください");
    return;
  }
  if (first === second || first === third || second === third) {
    toast("同じ馬を複数の着順に選ぶことはできません");
    return;
  }

  state.picks.push({ first, second, third });
  $("selFirst").value = "";
  $("selSecond").value = "";
  $("selThird").value = "";
  renderPickList();
  toast("買い目を追加しました");
}

function removePick(index) {
  state.picks.splice(index, 1);
  renderPickList();
}

function renderPickList() {
  const wrap = $("pickListWrap");
  if (!state.picks.length) {
    wrap.innerHTML = `<div class="empty">まだ買い目がありません</div>`;
  } else {
    wrap.innerHTML = state.picks
      .map(
        (p, i) => `
      <div class="pick-row">
        <div class="path">${escapeHtml(p.first)}<span class="arrow">→</span>${escapeHtml(p.second)}<span class="arrow">→</span>${escapeHtml(p.third)}</div>
        <button class="remove" onclick="removePick(${i})" aria-label="削除">×</button>
      </div>`
      )
      .join("");
  }
  const count = state.picks.length;
  const total = count * UNIT_PRICE;
  $("pickCount").textContent = count;
  $("pickTotal").textContent = fmtYen(total);
  $("toConfirmBtn").disabled = count === 0;
}

/* ---------- 確認画面 ---------- */
function goToConfirm() {
  if (!state.picks.length) return;
  $("confirmName").textContent = state.name;
  $("confirmList").innerHTML = state.picks
    .map(
      (p, i) => `
    <div class="confirm-row">
      <span class="num">${i + 1}</span>
      <span style="flex:1;">${escapeHtml(p.first)} → ${escapeHtml(p.second)} → ${escapeHtml(p.third)}</span>
      <span>${fmtYen(UNIT_PRICE)}</span>
    </div>`
    )
    .join("");
  $("confirmTotal").textContent = fmtYen(state.picks.length * UNIT_PRICE);
  showScreen("screen-confirm");
}

/* ---------- 投票確定（Firestore書き込み） ---------- */
async function submitVote() {
  if (!state.picks.length) return;
  const btn = $("confirmSubmitBtn");
  btn.disabled = true;
  btn.textContent = "送信中…";

  try {
    const docRef = db.collection("votes").doc(state.docId);
    const totalAmount = state.picks.length * UNIT_PRICE;

    await docRef.set({
      name: state.name,
      uid: state.uid,
      picks: state.picks,
      count: state.picks.length,
      totalAmount: totalAmount,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    state.submitted = true;
    localStorage.setItem("heiseikaiVoterName", state.name);
    showScreen("screen-done");
  } catch (err) {
    console.error(err);
    if (err && err.code === "permission-denied") {
      toast("この名前はすでに投票済みのため送信できませんでした");
      await loadMyVote(state.docId, true);
    } else {
      toast("送信に失敗しました。通信環境をご確認のうえもう一度お試しください");
    }
  } finally {
    btn.disabled = false;
    btn.textContent = "投票を確定する";
  }
}

/* ---------- マイページ（自分の投票内容） ---------- */
async function loadMyVote(docId, showAlreadyScreenOnFound) {
  try {
    const snap = await db.collection("votes").doc(docId).get();
    if (!snap.exists) return false;
    const data = snap.data();
    renderMyVote(data);
    if (showAlreadyScreenOnFound) {
      $("alreadyName").textContent = data.name;
      showScreen("screen-already");
    }
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

function renderMyVote(data) {
  $("myPageName").textContent = data.name;
  const list = $("myVoteList");
  list.innerHTML = (data.picks || [])
    .map(
      (p, i) => `
    <div class="my-vote-row">
      <span>${i + 1}. ${escapeHtml(p.first)} → ${escapeHtml(p.second)} → ${escapeHtml(p.third)}</span>
      <span>${fmtYen(UNIT_PRICE)}</span>
    </div>`
    )
    .join("") || `<div class="empty">投票データがありません</div>`;
  $("myVoteCount").textContent = data.count || 0;
  $("myVoteTotal").textContent = fmtYen(data.totalAmount || 0);
}

/* ---------- 名前入力 ---------- */
async function handleNameSubmit() {
  const raw = $("nameInput").value;
  const name = raw.trim();
  if (!name) {
    toast("お名前を入力してください");
    return;
  }
  const docId = sanitizeName(name);
  if (!docId) {
    toast("お名前を入力してください");
    return;
  }

  state.name = name;
  state.docId = docId;

  const btn = $("nameSubmitBtn");
  btn.disabled = true;
  btn.textContent = "確認中…";
  try {
    const snap = await db.collection("votes").doc(docId).get();
    if (snap.exists) {
      const data = snap.data();
      renderMyVote(data);
      $("alreadyName").textContent = data.name;
      showScreen("screen-already");
    } else {
      showScreen("screen-vote");
    }
  } catch (err) {
    console.error(err);
    toast("通信エラーが発生しました。もう一度お試しください");
  } finally {
    btn.disabled = false;
    btn.textContent = "投票画面へ進む";
  }
}

/* ---------- 初期化 ---------- */
function bindEvents() {
  $("nameSubmitBtn").addEventListener("click", handleNameSubmit);
  $("nameInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleNameSubmit();
  });
  $("addPickBtn").addEventListener("click", addPick);
  $("toConfirmBtn").addEventListener("click", goToConfirm);
  $("confirmBackBtn").addEventListener("click", () => showScreen("screen-vote"));
  $("confirmSubmitBtn").addEventListener("click", submitVote);
  $("showMyVoteBtn").addEventListener("click", () => showScreen("screen-mypage"));
  $("showMyVoteFromAlreadyBtn").addEventListener("click", () => showScreen("screen-mypage"));
  $("backToNameFromAlreadyBtn").addEventListener("click", () => {
    state.name = "";
    state.docId = "";
    $("nameInput").value = "";
    showScreen("screen-name");
  });
}

async function init() {
  bindEvents();
  renderPickList();

  try {
    const cred = await auth.signInAnonymously();
    state.uid = cred.user.uid;
  } catch (err) {
    console.error("anonymous sign-in failed", err);
    // 匿名認証に失敗しても、閲覧はできるように続行する
  }

  await loadHorses();
  initSelects();

  // 前回投票した名前が端末に残っていれば、入力の手間を省く（実際の重複判定はサーバー側で行う）
  const savedName = localStorage.getItem("heiseikaiVoterName");
  if (savedName) {
    $("nameInput").value = savedName;
  }

  showScreen("screen-name");
}

init();
