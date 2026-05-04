import { createClient } from "https://esm.sh/@supabase/supabase-js@2?bundle";
import APP_CONFIG from "./config.js";

const app = document.querySelector("#app");

const supabase = createClient(
  APP_CONFIG.supabaseUrl,
  APP_CONFIG.supabasePublishableKey,
  {
    auth: {
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  }
);

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

async function exchangeAuthCodeIfPresent() {
  const params = new URL(window.location.href).searchParams;
  const authCode = params.get("code");

  if (!authCode) {
    return;
  }

  const { error } = await supabase.auth.exchangeCodeForSession(authCode);

  if (error) {
    state.authMessage = error.message;
    state.authTone = "error";
  }

  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete("code");
  cleanUrl.searchParams.delete("type");
  window.history.replaceState({}, "", cleanUrl.pathname || "/");
}

async function fetchWorkspace() {
  const sessionResult = await supabase.auth.getSession();
  state.session = sessionResult.data.session;

  if (!state.session?.user) {
    state.membership = null;
    state.memberships = [];
    state.team = null;
    state.updates = [];
    return;
  }

  const user = state.session.user;

  const claimResult = await supabase
    .from("memberships")
    .update({ user_id: user.id })
    .eq("email", user.email)
    .is("user_id", null);

  if (claimResult.error) {
    state.authMessage = claimResult.error.message;
    state.authTone = "error";
  }

  const membershipResult = await supabase
    .from("memberships")
    .select("id, team_id, email, role, user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipResult.error) {
    state.authMessage = membershipResult.error.message;
    state.authTone = "error";
    return;
  }

  if (!membershipResult.data) {
    state.membership = null;
    state.team = null;
    state.memberships = [];
    state.updates = [];
    state.authMessage =
      "This email is authenticated, but it is not on the founder roster yet.";
    state.authTone = "error";
    return;
  }

  state.membership = membershipResult.data;

  const [teamResult, membersResult, updatesResult] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, created_at")
      .eq("id", state.membership.team_id)
      .single(),
    supabase
      .from("memberships")
      .select("id, email, role, user_id")
      .eq("team_id", state.membership.team_id)
      .order("created_at", { ascending: true }),
    supabase
      .from("updates")
      .select("id, team_id, user_id, headline, wins, blockers, next_move, created_at")
      .eq("team_id", state.membership.team_id)
      .order("created_at", { ascending: false }),
  ]);

  if (teamResult.error || membersResult.error || updatesResult.error) {
    state.authMessage =
      teamResult.error?.message ||
      membersResult.error?.message ||
      updatesResult.error?.message ||
      "Unable to load the founder workspace.";
    state.authTone = "error";
    return;
  }

  state.team = teamResult.data;
  state.memberships = membersResult.data;
  state.updates = updatesResult.data;

  updateRoleMap.clear();
  state.memberships.forEach((member) => {
    if (member.user_id) {
      updateRoleMap.set(member.user_id, member.role);
    }
  });
}

async function requestMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: APP_CONFIG.siteUrl,
      shouldCreateUser: false,
    },
  });

  if (error) {
    state.authMessage = error.message;
    state.authTone = "error";
    render();
    return;
  }

  state.authMessage =
    "Magic link sent. Open the email on this same device and browser to finish sign-in.";
  state.authTone = "success";
  render();
}

async function signOut() {
  await supabase.auth.signOut();
  state.session = null;
  state.membership = null;
  state.memberships = [];
  state.team = null;
  state.updates = [];
  state.authMessage = "";
  render();
}

async function addUpdate(formData) {
  if (!state.membership || !state.session?.user) {
    return;
  }

  const payload = {
    team_id: state.membership.team_id,
    user_id: state.session.user.id,
    headline: String(formData.get("headline")).trim(),
    wins: String(formData.get("wins")).trim(),
    blockers: String(formData.get("blockers")).trim(),
    next_move: String(formData.get("nextMove")).trim(),
  };

  const { error } = await supabase.from("updates").insert(payload);

  if (error) {
    state.authMessage = error.message;
    state.authTone = "error";
    render();
    return;
  }

  state.authMessage = "";
  await fetchWorkspace();
  render();
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
    void requestMagicLink(String(formData.get("email")).trim().toLowerCase());
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
      const role = updateRoleMap.get(update.user_id) || "Founder";
      return `
        <article class="history-entry">
          <div class="entry-meta">
            <span class="entry-id">push-${String(state.updates.length - index).padStart(4, "0")}</span>
            <div class="entry-author">${escapeHtml(role)}</div>
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
  if (!state.session?.user || !state.membership || !state.team) {
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
  if (!state.session?.user || !state.membership || !state.team) {
    renderAuth();
    return;
  }

  renderWorkspace();
}

async function boot() {
  await exchangeAuthCodeIfPresent();
  await fetchWorkspace();
  render();

  supabase.auth.onAuthStateChange(() => {
    void fetchWorkspace().then(render);
  });
}

void boot();
