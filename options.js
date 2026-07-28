const STORAGE_KEY = "rpk_v1";

let state = { users: {}, tags: [], schemaVersion: 1 };

const el = (id) => document.getElementById(id);

function load() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      state = res?.[STORAGE_KEY] || { users: {}, tags: [], schemaVersion: 1 };
      resolve(state);
    });
  });
}

function save() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: state }, () => resolve());
  });
}

function esc(s) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function allUsers() {
  return Object.entries(state.users || {}).sort((a, b) => (b[1].karma || 0) - (a[1].karma || 0) || a[0].localeCompare(b[0]));
}

function renderStats() {
  const users = allUsers();
  const voteCount = users.reduce((acc, [, u]) => acc + Object.keys(u.votes || {}).length, 0);
  const historyCount = users.reduce((acc, [, u]) => acc + (u.history || []).length, 0);
  const tagCount = (state.tags || []).length;

  el("stats").innerHTML = `
    <div class="stat"><div class="label">Users tracked</div><div class="value">${users.length}</div></div>
    <div class="stat"><div class="label">Tags</div><div class="value">${tagCount}</div></div>
    <div class="stat"><div class="label">Active votes</div><div class="value">${voteCount}</div></div>
    <div class="stat"><div class="label">History entries</div><div class="value">${historyCount}</div></div>
  `;
}

function renderUsers() {
  const q = (el("search").value || "").trim().toLowerCase();
  const users = allUsers().filter(([name, user]) => {
    if (!q) return true;
    const tags = (user.tags || []).join(" ").toLowerCase();
    return name.toLowerCase().includes(q) || tags.includes(q);
  });

  if (!users.length) {
    el("users").innerHTML = `<div class="empty">No matching users.</div>`;
    return;
  }

  el("users").innerHTML = users.map(([name, user]) => {
    const karma = user.karma || 0;
    const voteCount = Object.keys(user.votes || {}).length;
    const history = (user.history || []).slice(0, 30);
    const tags = user.tags || [];

    return `
      <article class="user-card" data-user="${esc(name)}">
        <div class="user-top">
          <div>
            <div class="user-name">${esc(name)}</div>
            <div class="muted">${voteCount} saved comment links</div>
          </div>
          <div class="karma ${karma > 0 ? "positive" : karma < 0 ? "negative" : ""}">${karma}</div>
        </div>

        <div class="tag-list">
          ${tags.length ? tags.map(tag => `
            <span class="tag-chip">
              ${esc(tag)}
              <button data-action="remove-user-tag" data-tag="${esc(tag)}" title="Remove tag from this user">×</button>
            </span>
          `).join("") : `<span class="muted">No tags yet.</span>`}
        </div>

        <div class="row">
          <input type="text" placeholder="Add existing or new tag" data-role="tag-input" />
          <button class="small-btn primary" data-action="add-tag">Add tag</button>
          <button class="small-btn danger" data-action="delete-user">Delete user</button>
        </div>

        <details style="margin-top:12px;">
          <summary>History (${history.length})</summary>
          <ul class="history">
            ${history.length ? history.map(h => `
              <li>
                <div><strong>${h.value === 1 ? "Upvote" : h.value === -1 ? "Downvote" : "Cleared"}</strong> — ${new Date(h.timestamp || Date.now()).toLocaleString()}</div>
                <div><a href="${esc(h.permalink || h.postUrl || "#")}" target="_blank" rel="noreferrer">${esc(h.permalink || h.postUrl || "")}</a></div>
              </li>
            `).join("") : `<li class="muted">No history yet.</li>`}
          </ul>
        </details>
      </article>
    `;
  }).join("");
}

function renderTags() {
  const tags = [...(state.tags || [])].sort((a, b) => a.localeCompare(b));
  if (!tags.length) {
    el("tags").innerHTML = `<div class="empty">No global tags yet.</div>`;
    return;
  }

  el("tags").innerHTML = tags.map(tag => `
    <div class="user-card">
      <div class="user-top">
        <div class="user-name">${esc(tag)}</div>
        <div class="inline-actions">
          <button class="small-btn" data-action="rename-tag" data-tag="${esc(tag)}">Rename</button>
          <button class="small-btn danger" data-action="delete-tag" data-tag="${esc(tag)}">Delete</button>
        </div>
      </div>
    </div>
  `).join("");
}

function renderHistory() {
  const entries = [];
  for (const [name, user] of allUsers()) {
    for (const h of (user.history || [])) {
      entries.push({ name, ...h });
    }
  }
  entries.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const recent = entries.slice(0, 50);

  el("history").innerHTML = recent.length ? `
    <div class="muted" style="margin-bottom:10px;">Showing the 50 most recent actions.</div>
    <ul class="history">
      ${recent.map(h => `
        <li>
          <div><strong>${esc(h.name)}</strong> — ${h.value === 1 ? "upvote" : h.value === -1 ? "downvote" : "clear"} at ${new Date(h.timestamp || Date.now()).toLocaleString()}</div>
          <div><a href="${esc(h.permalink || h.postUrl || "#")}" target="_blank" rel="noreferrer">${esc(h.permalink || h.postUrl || "")}</a></div>
        </li>
      `).join("")}
    </ul>
  ` : `<div class="empty">No history yet.</div>`;
}

function renderAll() {
  renderStats();
  renderUsers();
  renderTags();
  renderHistory();
}

function normalizeTag(tag) {
  return String(tag || "").trim();
}

async function addTagToUser(name, tag) {
  tag = normalizeTag(tag);
  if (!tag) return;
  const user = state.users[name];
  if (!user.tags) user.tags = [];
  if (!state.tags.includes(tag)) state.tags.push(tag);
  if (!user.tags.includes(tag)) user.tags.push(tag);
  await save();
}

async function removeUserTag(name, tag) {
  const user = state.users[name];
  user.tags = (user.tags || []).filter((t) => t !== tag);
  await save();
}

async function deleteUser(name) {
  delete state.users[name];
  await save();
}

async function renameTag(oldTag, newTag) {
  newTag = normalizeTag(newTag);
  if (!newTag) return;
  state.tags = state.tags.map((t) => (t === oldTag ? newTag : t));
  for (const user of Object.values(state.users)) {
    user.tags = (user.tags || []).map((t) => (t === oldTag ? newTag : t));
  }
  await save();
}

async function deleteTag(tag) {
  state.tags = (state.tags || []).filter((t) => t !== tag);
  for (const user of Object.values(state.users)) {
    user.tags = (user.tags || []).filter((t) => t !== tag);
  }
  await save();
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;

  const card = btn.closest(".user-card");
  const action = btn.dataset.action;
  const userName = card?.dataset?.user;
  const tag = btn.dataset.tag;

  if (action === "delete-user" && userName) {
    if (!confirm(`Delete all local data for ${userName}?`)) return;
    await deleteUser(userName);
    renderAll();
  }

  if (action === "add-tag" && userName) {
    const input = card.querySelector('[data-role="tag-input"]');
    const value = input?.value?.trim();
    if (!value) return;
    await addTagToUser(userName, value);
    input.value = "";
    renderAll();
  }

  if (action === "remove-user-tag" && userName && tag) {
    await removeUserTag(userName, tag);
    renderAll();
  }

  if (action === "rename-tag" && tag) {
    const value = prompt(`Rename tag "${tag}" to:`, tag);
    if (!value) return;
    await renameTag(tag, value);
    renderAll();
  }

  if (action === "delete-tag" && tag) {
    if (!confirm(`Delete tag "${tag}" from everywhere?`)) return;
    await deleteTag(tag);
    renderAll();
  }
});

el("search").addEventListener("input", renderUsers);

el("exportBtn").addEventListener("click", async () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "reddit-private-karma.json";
  a.click();
  URL.revokeObjectURL(url);
});

el("importFile").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") throw new Error("Invalid JSON");
    state = {
      users: parsed.users || {},
      tags: parsed.tags || [],
      schemaVersion: 1
    };
    await save();
    renderAll();
  } catch (err) {
    alert(`Import failed: ${err.message}`);
  } finally {
    e.target.value = "";
  }
});

el("clearAllBtn").addEventListener("click", async () => {
  if (!confirm("Clear all saved Reddit private karma and tags?")) return;
  state = { users: {}, tags: [], schemaVersion: 1 };
  await save();
  renderAll();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[STORAGE_KEY]) return;
  state = changes[STORAGE_KEY].newValue || { users: {}, tags: [], schemaVersion: 1 };
  renderAll();
});

(async function init() {
  await load();
  renderAll();
})();
