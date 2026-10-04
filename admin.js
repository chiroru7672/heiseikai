/* =========================================================
   平成会勝ち馬投票システム - admin.js
   ========================================================= */

/* ---- 設定エリア ---- */
// 管理画面のパスワード。必ずご自身の値に変更してください。
const ADMIN_PASSWORD = "7672";
const UNIT_PRICE = 250;
/* ---- ここまで ---- */

let unsubscribeVotes = null;
let latestVotes = []; // [{id, name, picks, count, totalAmount, createdAt}, ...]

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

function fmtDate(ts) {
  if (!ts) return "-";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("ja-JP");
}

/* ---------- ログイン ---------- */
function handleLogin() {
  const val = $("passwordInput").value;
  if (val === ADMIN_PASSWORD) {
    showScreen("screen-admin");
    startListening();
  } else {
    toast("パスワードが違います");
  }
}

function handleLogout() {
  if (unsubscribeVotes) {
    unsubscribeVotes();
    unsubscribeVotes = null;
  }
  $("passwordInput").value = "";
  showScreen("screen-login");
}

/* ---------- リアルタイム集計 ---------- */
async function startListening() {
  try {
    await auth.signInAnonymously();
  } catch (err) {
    console.error("anonymous sign-in failed (admin)", err);
  }

  unsubscribeVotes = db.collection("votes").onSnapshot(
    (snapshot) => {
      latestVotes = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderAll();
    },
    (err) => {
      console.error(err);
      toast("データの取得に失敗しました");
    }
  );
}

function renderAll() {
  renderStats();
  renderPosTally();
  renderComboTally();
  renderVotersTable();
}

function renderStats() {
  let totalCount = 0;
  let totalAmount = 0;
  const comboSet = new Set();

  latestVotes.forEach((v) => {
    totalCount += v.count || 0;
    totalAmount += v.totalAmount || 0;
    (v.picks || []).forEach((p) => comboSet.add(p.first + "|" + p.second + "|" + p.third));
  });

  $("totalVoters").textContent = latestVotes.length;
  $("totalCount").textContent = totalCount;
  $("totalAmount").textContent = fmtYen(totalAmount);
  $("totalCombos").textContent = comboSet.size;
}

function renderPosTally() {
  const tally = { first: {}, second: {}, third: {} };
  latestVotes.forEach((v) => {
    (v.picks || []).forEach((p) => {
      tally.first[p.first] = (tally.first[p.first] || 0) + 1;
      tally.second[p.second] = (tally.second[p.second] || 0) + 1;
      tally.third[p.third] = (tally.third[p.third] || 0) + 1;
    });
  });

  const cols = [
    { key: "first", label: "1着 人気" },
    { key: "second", label: "2着 人気" },
    { key: "third", label: "3着 人気" },
  ];

  $("posTally").innerHTML = cols
    .map((col) => {
      const entries = Object.entries(tally[col.key]).sort((a, b) => b[1] - a[1]);
      const rows = entries.length
        ? entries
            .map(
              ([name, n]) =>
                `<div class="pos-tally-row"><span>${escapeHtml(name)}</span><span>${n}票</span></div>`
            )
            .join("")
        : `<div class="empty">まだデータがありません</div>`;
      return `<div class="pos-tally-col"><h3>${col.label}</h3>${rows}</div>`;
    })
    .join("");
}

function renderComboTally() {
  const tally = {}; // key -> { first, second, third, count }
  latestVotes.forEach((v) => {
    (v.picks || []).forEach((p) => {
      const key = p.first + "|" + p.second + "|" + p.third;
      if (!tally[key]) tally[key] = { first: p.first, second: p.second, third: p.third, count: 0 };
      tally[key].count += 1;
    });
  });

  const rows = Object.values(tally).sort((a, b) => b.count - a.count);
  if (!rows.length) {
    $("comboTally").innerHTML = `<div class="empty">まだ投票がありません</div>`;
    return;
  }

  $("comboTally").innerHTML = rows
    .map(
      (r) => `
    <div class="pos-tally-row">
      <span>${escapeHtml(r.first)} → ${escapeHtml(r.second)} → ${escapeHtml(r.third)}</span>
      <span>${r.count}票（${fmtYen(r.count * UNIT_PRICE)}）</span>
    </div>`
    )
    .join("");
}

function renderVotersTable() {
  const tbody = $("votersTbody");
  if (!latestVotes.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">まだ投票がありません</td></tr>`;
    return;
  }

  const sorted = latestVotes.slice().sort((a, b) => {
    const ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
    const tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
    return tb - ta;
  });

  tbody.innerHTML = sorted
    .map((v) => {
      const picksText = (v.picks || [])
        .map((p) => `${escapeHtml(p.first)}→${escapeHtml(p.second)}→${escapeHtml(p.third)}`)
        .join("<br>");
      return `
      <tr>
        <td>${fmtDate(v.createdAt)}</td>
        <td>${escapeHtml(v.name)}</td>
        <td>${picksText}</td>
        <td class="num">${v.count || 0}</td>
        <td class="num">${fmtYen(v.totalAmount || 0)}</td>
      </tr>`;
    })
    .join("");
}

/* ---------- CSVダウンロード ---------- */
function downloadCsv() {
  if (!latestVotes.length) {
    toast("データがありません");
    return;
  }

  const header = ["投票日時", "投票者名", "買い目", "1着", "2着", "3着", "金額"];
  const rows = [header];

  latestVotes.forEach((v) => {
    (v.picks || []).forEach((p) => {
      rows.push([
        fmtDate(v.createdAt),
        v.name,
        `${p.first}→${p.second}→${p.third}`,
        p.first,
        p.second,
        p.third,
        UNIT_PRICE,
      ]);
    });
  });

  const csvBody = rows
    .map((row) => row.map((cell) => csvEscape(cell)).join(","))
    .join("\r\n");
  // Excelで文字化けしないようUTF-8 BOMを付与
  const blob = new Blob(["\uFEFF" + csvBody], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "");
  a.href = url;
  a.download = `heiseikai_votes_${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(v) {
  const s = String(v == null ? "" : v);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/* ---------- 初期化 ---------- */
function bindEvents() {
  $("loginBtn").addEventListener("click", handleLogin);
  $("passwordInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLogin();
  });
  $("logoutBtn").addEventListener("click", handleLogout);
  $("downloadCsvBtn").addEventListener("click", downloadCsv);
}

bindEvents();
