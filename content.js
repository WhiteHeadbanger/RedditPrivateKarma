(() => {
  const STORAGE_KEY = "rpk_v1";
  const COMMENT_PAGE = /\/comments\//i.test(location.pathname);

  if (!COMMENT_PAGE) return;

  const state = {
    data: null,
    loaded: false,
    panel: null
  };

  function getThreadId() {
    const m = location.pathname.match(/\/comments\/([^\/]+)/i);
    return m ? m[1] : location.pathname;
  }

  function getPostUrl() {
    return location.origin + location.pathname;
  }

  function normalizeUsername(name) {
    return String(name || "")
      .replace(/^u\//i, "")
      .replace(/^\/?user\//i, "")
      .replace(/^@/i, "")
      .trim();
  }

  function isValidUsername(name) {
    return !!name && !/^deleted$/i.test(name) && !/^unknown$/i.test(name);
  }

  function loadState() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (res) => {
        const data = res?.[STORAGE_KEY] || { users: {}, tags: [], schemaVersion: 1 };
        state.data = data;
        state.loaded = true;
        resolve(data);
      });
    });
  }

  function commitState(nextData) {
    state.data = nextData;
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: nextData }, () => resolve());
    });
  }

  function ensureUser(username) {
    const data = state.data;
    if (!data.users[username]) {
      data.users[username] = {
        karma: 0,
        tags: [],
        votes: {},
        history: []
      };
    }
    return data.users[username];
  }

  function getCommentRoots() {
    const roots = new Set();
    [
      "shreddit-comment",
      '[data-testid="comment"]',
      "div.thing.comment"
    ].forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => roots.add(el));
    });
    return [...roots];
  }

  function getCommentHeader(root) {
    return root.querySelector("summary") || root.querySelector('[data-testid="comment"]') || root;
  }

  function findUsernameAnchor(root) {
  const meta = root.querySelector('div[slot="commentMeta"]');
  if (meta) {
    const directUserLink =
      meta.querySelector('a[href*="/user/"]') ||
      meta.querySelector('a[href*="/u/"]');
    if (directUserLink) return directUserLink;
  }

  // 2) Fallbacks generales, pero solo si no encontró nada en comentarios
  const selectors = [
    'a[href*="/user/"]',
    'a[href*="/u/"]',
    'a[data-click-id="user"]',
    'a[data-testid*="author"]',
    '[data-testid="author-link"] a',
    '[data-testid="comment_author_link"]',
    '[data-testid="post_author_link"]'
  ];

  for (const sel of selectors) {
    const found = root.querySelector(sel);
    if (found && found.getAttribute) {
      const href = found.getAttribute("href") || "";
      const text = found.textContent || "";
      if (href.includes("/user/") || href.includes("/u/") || text.trim()) return found;
    }
  }

  const header = getCommentHeader(root);
  if (header) {
    const anchors = [...header.querySelectorAll("a")];
    const byHref = anchors.find((a) => /\/(u|user)\//i.test(a.getAttribute("href") || ""));
    if (byHref) return byHref;

    const byText = anchors.find((a) => normalizeUsername(a.textContent).length > 0);
    if (byText) return byText;
  }

  return null;
}

  function findUsername(root) {
    const anchor = findUsernameAnchor(root);
    if (anchor) {
      const href = anchor.getAttribute("href") || "";
      const text = normalizeUsername(anchor.textContent);

      const hrefMatch = href.match(/\/(?:u|user)\/([^\/?#]+)/i);
      if (hrefMatch) return normalizeUsername(hrefMatch[1]);
      if (text) return text;
    }

    const header = getCommentHeader(root);
    if (header) {
      const raw = normalizeUsername(header.textContent);
      const candidate = raw.split(/\s+/)[0];
      if (isValidUsername(candidate) && candidate.length < 40) return candidate;
    }

    return "";
  }

  function findPermalink(root) {
    const selectors = [
      'a[data-click-id="comments"]',
      'a[data-testid="comment_permalink"]',
      'a[data-click-id="timestamp"]',
      'a[href*="/comments/"]',
      'a[href*="#"]'
    ];
    for (const sel of selectors) {
      const a = root.querySelector(sel);
      if (a && a.href) return a.href;
    }
    return location.href;
  }

  function makeCommentKey(root, permalink) {
    const commentId =
      root?.getAttribute?.("id") ||
      root?.dataset?.testid ||
      root?.getAttribute?.("data-testid") ||
      root?.getAttribute?.("thingid") ||
      root?.getAttribute?.("comment-id") ||
      "";

    if (commentId) return commentId;
    if (permalink) return permalink.split("?")[0];
    const text = root?.innerText?.slice(0, 120) || "";
    return `${getThreadId()}::${text}`;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function createWidget(username, commentKey, permalink) {
    const container = document.createElement("span");
    container.className = "rpk-widget";
    container.dataset.rpkUsername = username;
    container.dataset.rpkCommentKey = commentKey;
    container.dataset.rpkPermalink = permalink;

    const karma = document.createElement("span");
    karma.className = "rpk-karma";
    karma.dataset.rpkRole = "karma";
    karma.textContent = "0";

    const up = document.createElement("button");
    up.type = "button";
    up.className = "rpk-vote-btn";
    up.dataset.vote = "1";
    up.textContent = "▲";
    up.title = "Private upvote";

    const down = document.createElement("button");
    down.type = "button";
    down.className = "rpk-vote-btn";
    down.dataset.vote = "-1";
    down.textContent = "▼";
    down.title = "Private downvote";

    const tags = document.createElement("span");
    tags.className = "rpk-tags";
    tags.dataset.rpkRole = "tags";

    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "rpk-plus-btn";
    plus.textContent = "+";
    plus.title = "Add tag";

    plus.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openTagPanel(username, plus);
    });

    up.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleVote(username, commentKey, permalink, 1);
    });

    down.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleVote(username, commentKey, permalink, -1);
    });

    container.append(karma, up, down, tags, plus);
    return container;
  }

  function updateWidgetUI(widget, username, commentKey) {
    const user = state.data?.users?.[username];
    const karmaEl = widget.querySelector('[data-rpk-role="karma"], .rpk-karma');
    const tagsEl = widget.querySelector('[data-rpk-role="tags"], .rpk-tags');
    const upBtn = widget.querySelector('button[data-vote="1"]');
    const downBtn = widget.querySelector('button[data-vote="-1"]');

    const karma = user?.karma ?? 0;
    if (karmaEl) {
      karmaEl.textContent = String(karma);
      karmaEl.classList.toggle("positive", karma > 0);
      karmaEl.classList.toggle("negative", karma < 0);
    }

    const vote = user?.votes?.[commentKey]?.value || 0;
    if (upBtn) upBtn.classList.toggle("active-up", vote === 1);
    if (downBtn) downBtn.classList.toggle("active-down", vote === -1);

    if (tagsEl) {
      tagsEl.innerHTML = "";
      const tags = user?.tags || [];
      tags.forEach((tag) => {
        const chip = document.createElement("span");
        chip.className = "rpk-tag-chip";
        chip.textContent = tag;
        tagsEl.appendChild(chip);
      });
    }
  }

  function refreshUserWidgets(username) {
    document.querySelectorAll(".rpk-widget").forEach((widget) => {
      if (widget.dataset.rpkUsername !== username) return;
      updateWidgetUI(widget, username, widget.dataset.rpkCommentKey);
    });
  }

  function refreshAllWidgets() {
    document.querySelectorAll(".rpk-widget").forEach((widget) => {
      updateWidgetUI(widget, widget.dataset.rpkUsername, widget.dataset.rpkCommentKey);
    });
  }

  function openTagPanel(username, anchorEl) {
    removePanel();

    const panel = document.createElement("div");
    panel.className = "rpk-panel";
    panel.innerHTML = `
      <h4>Tag ${escapeHtml(username)}</h4>
      <span class="rpk-inline-note">Pick a tag or create a new one.</span>
      <select></select>
      <input type="text" class="rpk-hidden" placeholder="New tag name" />
      <div class="rpk-panel-actions">
        <button type="button" class="rpk-cancel-btn">Cancel</button>
        <button type="button" class="rpk-save-btn">Save</button>
      </div>
    `;

    const select = panel.querySelector("select");
    const input = panel.querySelector("input");
    const cancel = panel.querySelector(".rpk-cancel-btn");
    const save = panel.querySelector(".rpk-save-btn");

    const tags = [...(state.data?.tags || [])].sort((a, b) => a.localeCompare(b));
    if (tags.length === 0) {
      const opt = document.createElement("option");
      opt.value = "__create__";
      opt.textContent = "Create new";
      select.appendChild(opt);
      input.classList.remove("rpk-hidden");
    } else {
      tags.forEach((tag) => {
        const opt = document.createElement("option");
        opt.value = tag;
        opt.textContent = tag;
        select.appendChild(opt);
      });
      const sep = document.createElement("option");
      sep.value = "__create__";
      sep.textContent = "Create new...";
      select.appendChild(sep);
    }

    select.addEventListener("change", () => {
      const create = select.value === "__create__";
      input.classList.toggle("rpk-hidden", !create);
      if (create) input.focus();
    });

    cancel.addEventListener("click", removePanel);
    save.addEventListener("click", async () => {
      if (!state.loaded) await loadState();

      let tag = select.value;
      if (tag === "__create__") tag = input.value.trim();
      if (!tag) return;

      const data = state.data;
      const user = ensureUser(username);
      if (!data.tags.includes(tag)) data.tags.push(tag);
      if (!user.tags.includes(tag)) user.tags.push(tag);

      await commitState(data);
      refreshUserWidgets(username);
      removePanel();
    });

    document.body.appendChild(panel);
    const rect = anchorEl.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 320))}px`;
    panel.style.top = `${Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 240))}px`;

    state.panel = panel;

    setTimeout(() => {
      const onDocClick = (ev) => {
        if (!panel.contains(ev.target) && ev.target !== anchorEl) {
          document.removeEventListener("mousedown", onDocClick, true);
          removePanel();
        }
      };
      document.addEventListener("mousedown", onDocClick, true);
    }, 0);
  }

  function removePanel() {
    if (state.panel) {
      state.panel.remove();
      state.panel = null;
    }
  }

  async function handleVote(username, commentKey, permalink, newVote) {
    if (!state.loaded) await loadState();

    const data = state.data;
    const user = ensureUser(username);
    const prev = user.votes?.[commentKey]?.value || 0;

    let finalVote = newVote;
    if (prev === newVote) finalVote = 0;

    const delta = finalVote - prev;
    if (delta === 0) return;

    user.karma += delta;
    user.votes = user.votes || {};

    if (finalVote === 0) {
      delete user.votes[commentKey];
    } else {
      user.votes[commentKey] = {
        value: finalVote,
        permalink,
        postUrl: getPostUrl(),
        threadId: getThreadId(),
        timestamp: Date.now()
      };
    }

    user.history = user.history || [];
    user.history.unshift({
      commentKey,
      value: finalVote,
      permalink,
      postUrl: getPostUrl(),
      threadId: getThreadId(),
      timestamp: Date.now()
    });

    await commitState(data);
    refreshUserWidgets(username);
  }

  function decorateComment(root) {
    if (!root || root.dataset.rpkProcessed === "1") return;

    const username = findUsername(root);
    if (!isValidUsername(username)) return;
    const anchor = findUsernameAnchor(root);
    const permalink = findPermalink(root);
    const commentKey = makeCommentKey(root, permalink);

    const widget = createWidget(username, commentKey, permalink);
    root.dataset.rpkProcessed = "1";
    root.dataset.rpkUsername = username;
    root.dataset.rpkCommentKey = commentKey;

    if (anchor) {
      anchor.insertAdjacentElement("afterend", widget);
      updateWidgetUI(widget, username, commentKey);
      return;
    }

    const header = getCommentHeader(root);
    if (header) {
      header.appendChild(widget);
      updateWidgetUI(widget, username, commentKey);
      return;
    }

    root.appendChild(widget);
    updateWidgetUI(widget, username, commentKey);
  }

  function scanAndDecorate() {
    if (!state.loaded) return;
    getCommentRoots().forEach(decorateComment);
  }

  function setupObservers() {
    const observer = new MutationObserver(() => {
      scanAndDecorate();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  async function init() {
    await loadState();
    scanAndDecorate();
    setupObservers();

    const fallback = setInterval(() => {
      scanAndDecorate();
      if (document.readyState === "complete") clearInterval(fallback);
    }, 1000);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") removePanel();
    });
  }

  init().catch((err) => console.error("[RPK] init failed", err));
})();
