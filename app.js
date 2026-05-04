const app = document.querySelector("#app");

const state = {
  authMessage: "",
  authTone: "info",
  membership: null,
  memberships: [],
  session: null,
  team: null,
  updates: [],
};

const updateRoleMap = new Map();

function getTodayLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function nextPushId() {
  return `push-${String(state.updates.length + 1).padStart(4, "0")}`;
}

function renderStatus(container, message, tone = "info") {
  if (!message) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `<div class="status-callout ${tone}">${escapeHtml(message)}</div>`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : { error: "Unexpected response from server." };

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

async function fetchWorkspace() {
  try {
    const payload = await api("/api/workspace", { method: "GET" });
    state.session = payload.session;
    state.team = payload.team;
    state.membership = payload.membership;
    state.memberships = payload.memberships || [];
    state.updates = payload.updates || [];
    state.authMessage = "";
    state.authTone = "info";

    updateRoleMap.clear();
    state.memberships.forEach((member) => {
      if (member.user_id) {
        updateRoleMap.set(member.user_id, member.role);
      }
    });
  } catch (error) {
    state.session = null;
    state.team = null;
    state.membership = null;
    state.memberships = [];
    state.updates = [];
  }
}

async function signIn(email, teamCode) {
  try {
    const payload = await api("/api/session", {
      method: "POST",
      body: JSON.stringify({ email, teamCode }),
    });

    state.session = payload.session;
    state.authMessage = "";
    await fetchWorkspace();
    render();
  } catch (error) {
    state.authMessage = error.message;
    state.authTone = "error";
    render();
  }
}

async function signOut() {
  try {
    await api("/api/session", { method: "DELETE" });
  } catch {
    // Clear local state even if the cookie is already gone.
  }

  state.session = null;
  state.membership = null;
  state.memberships = [];
  state.team = null;
  state.updates = [];
  state.authMessage = "";
  render();
}

async function addUpdate(formData) {
  if (!state.membership || !state.session) {
    return;
  }

  const payload = {
    headline: String(formData.get("headline")).trim(),
    wins: String(formData.get("wins")).trim(),
    blockers: String(formData.get("blockers")).trim(),
    nextMove: String(formData.get("nextMove")).trim(),
  };

  try {
    await api("/api/updates", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    state.authMessage = "";
    await fetchWorkspace();
    render();
  } catch (error) {
    state.authMessage = error.message;
    state.authTone = "error";
    render();
  }
}

function exportJson() {
  if (!state.team) {
    return;
  }

  const blob = new Blob(
    [
      JSON.stringify(
        {
          team: state.team,
          members: state.memberships,
          updates: state.updates,
        },
        null,
        2
      ),
    ],
    {
      type: "application/json",
    }
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "founder-stack-export.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

function renderAuth() {
  const template = document.querySelector("#auth-template");
  app.replaceChildren(template.content.cloneNode(true));

  const feedback = document.querySelector("#auth-feedback");
  renderStatus(feedback, state.authMessage, state.authTone);

  const form = document.querySelector("#auth-form");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    void signIn(
      String(formData.get("email")).trim().toLowerCase(),
      String(formData.get("teamCode")).trim().toUpperCase()
    );
  });
}

function renderHistory() {
  const historyList = document.querySelector("#history-list");

  if (state.updates.length === 0) {
    historyList.innerHTML = `
      <div class="history-empty">
        No pushes yet. Your first founder update will land here as an immutable
        log entry.
      </div>
    `;
    return;
  }

  historyList.innerHTML = state.updates
    .map((update, index) => {
      const role = updateRoleMap.get(update.user_id) || update.author_role || "Founder";
      const authorEmail = update.author_email || state.memberships.find((member) => member.user_id === update.user_id)?.email || "";

      return `
        <article class="history-entry">
          <div class="entry-meta">
            <span class="entry-id">push-${String(state.updates.length - index).padStart(4, "0")}</span>
            <div class="entry-author">${escapeHtml(role)}</div>
            <div class="entry-time">${escapeHtml(authorEmail)}</div>
            <div class="entry-time">${escapeHtml(update.created_at ? formatTime(update.created_at) : "")}</div>
          </div>
          <div class="entry-copy">
            <h4>${escapeHtml(update.headline)}</h4>
            <p><strong>Wins:</strong> ${escapeHtml(update.wins)}</p>
            <p><strong>Blockers:</strong> ${escapeHtml(update.blockers)}</p>
            <p><strong>Next:</strong> ${escapeHtml(update.next_move)}</p>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderWorkspace() {
  if (!state.session || !state.membership || !state.team) {
    renderAuth();
    return;
  }

  const template = document.querySelector("#workspace-template");
  app.replaceChildren(template.content.cloneNode(true));

  document.querySelector("#team-name").textContent = state.team.name;
  document.querySelector("#member-summary").textContent = `${state.membership.role} • ${state.membership.email}`;
  document.querySelector("#push-count").textContent = String(state.updates.length);
  document.querySelector("#today-count").textContent = String(
    state.updates.filter((entry) => entry.created_at?.slice(0, 10) === getTodayLocalDate()).length
  );
  document.querySelector("#member-count").textContent = String(state.memberships.length);
  document.querySelector("#next-push-id").textContent = nextPushId();

  const workspaceFeedback = document.querySelector("#workspace-feedback");
  renderStatus(workspaceFeedback, state.authMessage, state.authTone);
  renderHistory();

  document.querySelector("#sign-out").addEventListener("click", () => {
    void signOut();
  });
  document.querySelector("#export-json").addEventListener("click", exportJson);

  const updateForm = document.querySelector("#update-form");
  updateForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void addUpdate(new FormData(updateForm));
    updateForm.reset();
  });
}

function render() {
  if (!state.session || !state.membership || !state.team) {
    renderAuth();
    return;
  }

  renderWorkspace();
}

async function boot() {
  await fetchWorkspace();
  render();
}

void boot();
