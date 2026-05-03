const STORAGE_KEY = "founder-stack:v1";
const SESSION_KEY = "founder-stack:session";

const app = document.querySelector("#app");

const state = {
  database: readJson(STORAGE_KEY, { teams: {} }),
  session: readJson(SESSION_KEY, null),
};

function readJson(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function persistDatabase() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.database));
}

function persistSession() {
  if (!state.session) {
    window.localStorage.removeItem(SESSION_KEY);
    return;
  }

  window.localStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
}

function slugTeamCode(teamCode) {
  return teamCode.trim().toUpperCase();
}

function createPushId(team) {
  const nextNumber = team.updates.length + 1;
  return `push-${String(nextNumber).padStart(4, "0")}`;
}

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

function createTeam({ teamCode, email, role }) {
  const normalizedCode = slugTeamCode(teamCode);
  const ownerName = email.split("@")[0].replace(/[._-]+/g, " ");
  const team = {
    code: normalizedCode,
    name: `${ownerName}'s founder room`,
    members: {},
    updates: [],
    createdAt: new Date().toISOString(),
  };

  team.members[email] = {
    email,
    role,
    firstSeenAt: new Date().toISOString(),
  };

  state.database.teams[normalizedCode] = team;
  persistDatabase();
  return team;
}

function signIn({ email, teamCode, role }) {
  const normalizedCode = slugTeamCode(teamCode);
  let team = state.database.teams[normalizedCode];

  if (!team) {
    team = createTeam({ teamCode: normalizedCode, email, role });
  }

  team.members[email] = {
    email,
    role,
    firstSeenAt: team.members[email]?.firstSeenAt || new Date().toISOString(),
  };

  state.session = {
    email,
    role,
    teamCode: normalizedCode,
  };

  persistDatabase();
  persistSession();
  render();
}

function signOut() {
  state.session = null;
  persistSession();
  render();
}

function currentTeam() {
  if (!state.session) {
    return null;
  }

  return state.database.teams[state.session.teamCode] || null;
}

function addUpdate(formData) {
  const team = currentTeam();
  if (!team || !state.session) {
    return;
  }

  team.updates.unshift({
    id: createPushId(team),
    date: getTodayLocalDate(),
    headline: formData.get("headline").trim(),
    wins: formData.get("wins").trim(),
    blockers: formData.get("blockers").trim(),
    nextMove: formData.get("nextMove").trim(),
    authorEmail: state.session.email,
    authorRole: state.session.role,
    createdAt: new Date().toISOString(),
  });

  persistDatabase();
  render();
}

function seedDemoData() {
  const team = currentTeam();
  if (!team || team.updates.length > 0) {
    return;
  }

  const members = [
    { email: "ceo@team.com", role: "CEO" },
    { email: "coo@team.com", role: "COO" },
    { email: "cfo@team.com", role: "CFO" },
  ];

  members.forEach((member) => {
    team.members[member.email] = team.members[member.email] || {
      ...member,
      firstSeenAt: new Date().toISOString(),
    };
  });

  [
    {
      headline: "Locked product demo narrative for investor meeting",
      wins: "Refined the positioning, set the storyline, and aligned launch timing.",
      blockers: "Need final usage screenshot from the product walkthrough.",
      nextMove: "Capture product image and rehearse with the full founder team.",
      authorEmail: "ceo@team.com",
      authorRole: "CEO",
    },
    {
      headline: "Tightened operating cadence and owner map for the week",
      wins: "Defined Monday metrics review, Wednesday pipeline sync, and Friday finance close.",
      blockers: "Sales follow-up process still lives in too many places.",
      nextMove: "Collapse follow-up ownership into one shared workflow by tomorrow.",
      authorEmail: "coo@team.com",
      authorRole: "COO",
    },
    {
      headline: "April cash view is reconciled and runway is clear",
      wins: "Updated burn, runway, and collection timing assumptions for the next quarter.",
      blockers: "Waiting on one vendor invoice to finalize actuals.",
      nextMove: "Finalize the board-ready finance snapshot and share before noon.",
      authorEmail: "cfo@team.com",
      authorRole: "CFO",
    },
  ].forEach((entry, index) => {
    team.updates.push({
      id: `push-${String(index + 1).padStart(4, "0")}`,
      date: getTodayLocalDate(),
      createdAt: new Date(Date.now() - index * 1000 * 60 * 90).toISOString(),
      ...entry,
    });
  });

  team.updates.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  persistDatabase();
  render();
}

function exportJson() {
  const team = currentTeam();
  if (!team) {
    return;
  }

  const blob = new Blob([JSON.stringify(team, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${team.code.toLowerCase()}-founder-stack.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function renderAuth() {
  const template = document.querySelector("#auth-template");
  app.replaceChildren(template.content.cloneNode(true));

  const form = document.querySelector("#auth-form");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    signIn({
      email: String(formData.get("email")).trim().toLowerCase(),
      teamCode: String(formData.get("teamCode")),
      role: String(formData.get("role")),
    });
  });
}

function renderHistory(team) {
  const historyList = document.querySelector("#history-list");

  if (team.updates.length === 0) {
    historyList.innerHTML = `
      <div class="history-empty">
        No pushes yet. Your first founder update will land here as an immutable
        log entry.
      </div>
    `;
    return;
  }

  historyList.innerHTML = team.updates
    .map(
      (update) => `
        <article class="history-entry">
          <div class="entry-meta">
            <span class="entry-id">${update.id}</span>
            <div class="entry-author">${update.authorRole}</div>
            <div class="entry-time">${update.authorEmail}</div>
            <div class="entry-time">${formatTime(update.createdAt)}</div>
          </div>
          <div class="entry-copy">
            <h4>${escapeHtml(update.headline)}</h4>
            <p><strong>Wins:</strong> ${escapeHtml(update.wins)}</p>
            <p><strong>Blockers:</strong> ${escapeHtml(update.blockers)}</p>
            <p><strong>Next:</strong> ${escapeHtml(update.nextMove)}</p>
          </div>
        </article>
      `
    )
    .join("");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderWorkspace() {
  const team = currentTeam();

  if (!team || !state.session) {
    renderAuth();
    return;
  }

  const template = document.querySelector("#workspace-template");
  app.replaceChildren(template.content.cloneNode(true));

  document.querySelector("#team-name").textContent = team.name;
  document.querySelector("#team-code").textContent = team.code;
  document.querySelector("#member-summary").textContent = `${state.session.role} • ${state.session.email}`;
  document.querySelector("#push-count").textContent = String(team.updates.length);
  document.querySelector("#today-count").textContent = String(
    team.updates.filter((entry) => entry.date === getTodayLocalDate()).length
  );
  document.querySelector("#member-count").textContent = String(
    Object.keys(team.members).length
  );
  document.querySelector("#next-push-id").textContent = createPushId(team);

  renderHistory(team);

  document.querySelector("#sign-out").addEventListener("click", signOut);
  document.querySelector("#seed-demo").addEventListener("click", seedDemoData);
  document.querySelector("#export-json").addEventListener("click", exportJson);

  const updateForm = document.querySelector("#update-form");
  updateForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addUpdate(new FormData(updateForm));
    updateForm.reset();
  });
}

function render() {
  if (!state.session) {
    renderAuth();
    return;
  }

  renderWorkspace();
}

render();
