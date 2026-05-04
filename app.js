const app = document.querySelector("#app");

const FOUNDERS = [
  { name: "Alex", email: "alex@forgechallenge.com", role: "CEO" },
  { name: "Ben", email: "ben@forgechallenge.com", role: "CFO" },
  { name: "Zach", email: "zach@forgechallenge.com", role: "COO" },
];

const FEED_ROLES = ["CEO", "COO", "CFO"];

const state = {
  authMessage: "",
  authTone: "info",
  comments: [],
  ideas: [],
  membership: null,
  memberships: [],
  session: null,
  tasks: [],
  team: null,
  updates: [],
  weekStart: "",
  weeklyGoal: null,
  openCommentThreads: new Set(),
};

const updateRoleMap = new Map();
const updateEmailMap = new Map();
const rolePrompts = {
  CEO: {
    title: "CEO prompt",
    summary: "Turn rough company notes into a crisp founder-facing operating update.",
    prompt: `Write a concise daily CEO update for my cofounders in plain text only.

Do not use markdown, bullets, tables, or emojis.
Keep it direct, practical, and easy to scan.
Start with a line formatted exactly like:
Title: [short title]

Then leave one blank line and write 2-4 compact paragraphs.
Focus on company movement, key decisions, risks, and what matters next.
Do not add greetings or sign-offs.

Use this context:
[PASTE CEO NOTES HERE]`,
  },
  COO: {
    title: "COO prompt",
    summary: "Turn execution notes into a clean operational update for the team.",
    prompt: `Write a concise daily COO update for my cofounders in plain text only.

Do not use markdown, bullets, tables, or emojis.
Keep it direct, practical, and easy to scan.
Start with a line formatted exactly like:
Title: [short title]

Then leave one blank line and write 2-4 compact paragraphs.
Focus on execution, coordination, bottlenecks, and what matters next.
Do not add greetings or sign-offs.

Use this context:
[PASTE COO NOTES HERE]`,
  },
  CFO: {
    title: "CFO prompt",
    summary: "Turn finance notes into a sharp financial update for the founder room.",
    prompt: `Write a concise daily CFO update for my cofounders in plain text only.

Do not use markdown, bullets, tables, or emojis.
Keep it direct, practical, and easy to scan.
Start with a line formatted exactly like:
Title: [short title]

Then leave one blank line and write 2-4 compact paragraphs.
Focus on cash, exposure, assumptions, and what matters next.
Do not add greetings or sign-offs.

Use this context:
[PASTE CFO NOTES HERE]`,
  },
  Founder: {
    title: "Founder prompt",
    summary: "Turn rough founder notes into a concise plain-text team update.",
    prompt: `Write a concise daily founder update for my cofounders in plain text only.

Do not use markdown, bullets, tables, or emojis.
Keep it direct, practical, and easy to scan.
Start with a line formatted exactly like:
Title: [short title]

Then leave one blank line and write 2-4 compact paragraphs.
Focus on what moved, what needs attention, and what matters next.
Do not add greetings or sign-offs.

Use this context:
[PASTE FOUNDER NOTES HERE]`,
  },
};

function isCEO() {
  return state.membership?.role === "CEO";
}

function founderNameFromEmail(email) {
  const match = FOUNDERS.find((person) => person.email === email);
  if (match) {
    return match.name;
  }

  const localPart = (email || "").split("@")[0] || "Founder";
  return localPart.charAt(0).toUpperCase() + localPart.slice(1);
}

function founderNameForRole(role) {
  return FOUNDERS.find((person) => person.role === role)?.name || role;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function getTodayLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nextPushId() {
  return `push-${String(state.updates.length + 1).padStart(4, "0")}`;
}

function formatWeekLabel(weekStart) {
  if (!weekStart) {
    return "Current founder operating week";
  }

  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  });

  return `Week of ${formatter.format(start)} to ${formatter.format(end)}`;
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

function getPromptForRole(role) {
  return rolePrompts[role] || rolePrompts.Founder;
}

function getDerivedHeadline(text, role) {
  const firstMeaningfulLine =
    text
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) || `${role} daily update`;

  return firstMeaningfulLine.slice(0, 80);
}

function parseAIDraft(text, role) {
  const lines = text.split("\n");
  const firstMeaningfulIndex = lines.findIndex((line) => line.trim().length > 0);

  if (firstMeaningfulIndex === -1) {
    return {
      headline: `${role} daily update`,
      body: "",
    };
  }

  const firstMeaningfulLine = lines[firstMeaningfulIndex].trim();
  const titleMatch = firstMeaningfulLine.match(/^title:\s*(.+)$/i);

  if (!titleMatch) {
    return {
      headline: getDerivedHeadline(text, role),
      body: text.trim(),
    };
  }

  const body = lines
    .slice(firstMeaningfulIndex + 1)
    .join("\n")
    .trim();

  return {
    headline: titleMatch[1].trim().slice(0, 80) || `${role} daily update`,
    body,
  };
}

function commentsByUpdateId() {
  return state.comments.reduce((map, comment) => {
    if (!map[comment.update_id]) {
      map[comment.update_id] = [];
    }

    map[comment.update_id].push(comment);
    return map;
  }, {});
}

function toggleCommentThread(updateId) {
  if (state.openCommentThreads.has(updateId)) {
    state.openCommentThreads.delete(updateId);
  } else {
    state.openCommentThreads.add(updateId);
  }

  renderWorkspace();
}

function tasksByAssignee() {
  return FOUNDERS.reduce((map, founder) => {
    map[founder.name] = state.tasks.filter((task) => task.assignee_name === founder.name);
    return map;
  }, {});
}

function roleForUpdate(update) {
  return updateRoleMap.get(update.user_id) || "Founder";
}

function emailForUpdate(update) {
  return updateEmailMap.get(update.user_id) || "";
}

async function fetchWorkspace() {
  try {
    const payload = await api("/api/workspace", { method: "GET" });
    state.session = payload.session;
    state.team = payload.team;
    state.membership = payload.membership;
    state.memberships = payload.memberships || [];
    state.updates = payload.updates || [];
    state.comments = payload.comments || [];
    state.ideas = payload.ideas || [];
    state.tasks = payload.tasks || [];
    state.weekStart = payload.weekStart || "";
    state.weeklyGoal = payload.weeklyGoal || null;
    state.authMessage = "";
    state.authTone = "info";

    updateRoleMap.clear();
    updateEmailMap.clear();
    state.memberships.forEach((member) => {
      if (member.user_id) {
        updateRoleMap.set(member.user_id, member.role);
        updateEmailMap.set(member.user_id, member.email);
      }
    });
  } catch {
    state.session = null;
    state.team = null;
    state.membership = null;
    state.memberships = [];
    state.updates = [];
    state.comments = [];
    state.ideas = [];
    state.tasks = [];
    state.weekStart = "";
    state.weeklyGoal = null;
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
    // Ignore and clear local state anyway.
  }

  state.authMessage = "";
  state.authTone = "info";
  state.session = null;
  state.membership = null;
  state.memberships = [];
  state.team = null;
  state.updates = [];
  state.comments = [];
  state.ideas = [];
  state.tasks = [];
  state.weekStart = "";
  state.weeklyGoal = null;
  render();
}

async function addUpdate(formData) {
  if (!state.membership || !state.session) {
    return;
  }

  const aiDraft = String(formData.get("aiDraft")).trim();
  const typedHeadline = String(formData.get("headline")).trim();
  const parsedDraft = parseAIDraft(aiDraft, state.membership.role);

  try {
    await api("/api/updates", {
      method: "POST",
      body: JSON.stringify({
        aiDraft: parsedDraft.body,
        headline: typedHeadline || parsedDraft.headline,
      }),
    });

    state.authMessage = "Update pushed to the founder feed.";
    state.authTone = "success";
    await fetchWorkspace();
    render();
  } catch (error) {
    state.authMessage = error.message;
    state.authTone = "error";
    render();
  }
}

async function saveWeeklyGoal(goalText) {
  try {
    await api("/api/weekly-goal", {
      method: "POST",
      body: JSON.stringify({ goalText }),
    });

    state.authMessage = "Weekly goal saved.";
    state.authTone = "success";
    await fetchWorkspace();
    render();
  } catch (error) {
    state.authMessage = error.message;
    state.authTone = "error";
    render();
  }
}

async function addTask(assigneeName, title) {
  try {
    await api("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ assigneeName, title }),
    });

    state.authMessage = `${assigneeName}'s task list updated.`;
    state.authTone = "success";
    await fetchWorkspace();
    render();
  } catch (error) {
    state.authMessage = error.message;
    state.authTone = "error";
    render();
  }
}

async function patchTask(taskId, patch) {
  try {
    await api("/api/tasks", {
      method: "PATCH",
      body: JSON.stringify({ taskId, ...patch }),
    });

    await fetchWorkspace();
    render();
  } catch (error) {
    state.authMessage = error.message;
    state.authTone = "error";
    render();
  }
}

async function deleteTask(taskId) {
  try {
    await api("/api/tasks", {
      method: "DELETE",
      body: JSON.stringify({ taskId }),
    });

    state.authMessage = "Task removed.";
    state.authTone = "success";
    await fetchWorkspace();
    render();
  } catch (error) {
    state.authMessage = error.message;
    state.authTone = "error";
    render();
  }
}

async function addIdea(body) {
  try {
    await api("/api/ideas", {
      method: "POST",
      body: JSON.stringify({ body }),
    });

    state.authMessage = "Idea added to the board.";
    state.authTone = "success";
    await fetchWorkspace();
    render();
  } catch (error) {
    state.authMessage = error.message;
    state.authTone = "error";
    render();
  }
}

async function addComment(updateId, body) {
  try {
    await api("/api/comments", {
      method: "POST",
      body: JSON.stringify({ updateId, body }),
    });

    state.authMessage = "Comment added.";
    state.authTone = "success";
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
          weekStart: state.weekStart,
          weeklyGoal: state.weeklyGoal,
          members: state.memberships,
          tasks: state.tasks,
          ideas: state.ideas,
          updates: state.updates,
          comments: state.comments,
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

function renderTaskColumns() {
  const groupedTasks = tasksByAssignee();

  FOUNDERS.forEach((founder) => {
    const list = document.querySelector(`#tasks-${founder.name.toLowerCase()}`);
    const tasks = groupedTasks[founder.name] || [];

    if (tasks.length === 0) {
      list.innerHTML = `<div class="empty-chip">No tasks yet.</div>`;
    } else {
      list.innerHTML = tasks
        .map(
          (task) => `
            <article class="task-item ${task.completed ? "is-complete" : ""}" data-task-id="${task.id}">
              <label class="task-check">
                <input type="checkbox" ${task.completed ? "checked" : ""} ${isCEO() ? "" : "disabled"} />
                <span>${escapeHtml(task.title)}</span>
              </label>
              ${isCEO() ? '<button class="task-delete" type="button">Remove</button>' : ""}
            </article>
          `
        )
        .join("");
    }

    list.querySelectorAll(".task-item").forEach((taskElement) => {
      const taskId = taskElement.dataset.taskId;
      const checkbox = taskElement.querySelector('input[type="checkbox"]');
      const deleteButton = taskElement.querySelector(".task-delete");

      if (checkbox && isCEO()) {
        checkbox.addEventListener("change", () => {
          void patchTask(taskId, { completed: checkbox.checked });
        });
      }

      if (deleteButton) {
        deleteButton.addEventListener("click", () => {
          void deleteTask(taskId);
        });
      }
    });
  });

  document.querySelectorAll(".task-form").forEach((form) => {
    if (!isCEO()) {
      form.classList.add("is-hidden");
      return;
    }

    form.classList.remove("is-hidden");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const title = String(formData.get("taskTitle")).trim();
      if (!title) {
        return;
      }

      void addTask(form.dataset.assignee, title);
      form.reset();
    });
  });
}

function renderIdeas() {
  const ideasList = document.querySelector("#ideas-list");

  if (state.ideas.length === 0) {
    ideasList.innerHTML = `<div class="history-empty">No ideas yet. Drop the first one into the board.</div>`;
    return;
  }

  ideasList.innerHTML = state.ideas
    .map(
      (idea) => `
        <article class="idea-card">
          <div class="compact-meta">
            <span class="entry-id compact">${escapeHtml(idea.author_role)}</span>
            <span>${escapeHtml(founderNameFromEmail(idea.author_email))}</span>
            <span>${escapeHtml(formatTime(idea.created_at))}</span>
          </div>
          <div class="entry-note">${escapeHtml(idea.body)}</div>
        </article>
      `
    )
    .join("");
}

function renderFeedColumns() {
  const commentGroups = commentsByUpdateId();
  const groupedUpdates = FEED_ROLES.reduce((map, role) => {
    map[role] = state.updates.filter((update) => roleForUpdate(update) === role);
    return map;
  }, {});

  FEED_ROLES.forEach((role) => {
    const feed = document.querySelector(`#feed-${role.toLowerCase()}`);
    const updates = groupedUpdates[role] || [];

    if (updates.length === 0) {
      feed.innerHTML = `<div class="history-empty">No ${role} updates yet.</div>`;
      return;
    }

    feed.innerHTML = updates
      .map((update) => {
        const comments = commentGroups[update.id] || [];
        const isOpen = state.openCommentThreads.has(update.id);
        return `
          <article class="feed-card" data-update-id="${update.id}">
            <div class="feed-card-head">
              <div>
                <span class="entry-id">${escapeHtml(role)}</span>
                <h4>${escapeHtml(update.headline)}</h4>
              </div>
              <div class="feed-meta">
                <span>${escapeHtml(founderNameFromEmail(emailForUpdate(update)))}</span>
                <span>${escapeHtml(formatTime(update.created_at))}</span>
              </div>
            </div>
            <div class="entry-note">${escapeHtml(update.wins)}</div>
            <div class="comment-shell ${isOpen ? "is-open" : ""}">
              <button class="comment-toggle ghost-button" type="button" data-update-id="${update.id}">
                Comments (${comments.length})
              </button>
              <div class="comment-thread ${isOpen ? "is-open" : ""}">
                <div class="comment-list">
                  ${
                    comments.length
                      ? comments
                          .map(
                            (comment) => `
                              <div class="comment-item">
                                <div class="compact-meta">
                                  <strong>${escapeHtml(comment.author_role)}</strong>
                                  <span>${escapeHtml(founderNameFromEmail(comment.author_email))}</span>
                                  <span>${escapeHtml(formatTime(comment.created_at))}</span>
                                </div>
                                <div class="comment-body">${escapeHtml(comment.body)}</div>
                              </div>
                            `
                          )
                          .join("")
                      : '<div class="empty-chip">No comments yet.</div>'
                  }
                </div>
                <form class="comment-form" data-update-id="${update.id}">
                  <textarea name="commentBody" rows="2" placeholder="Add a comment"></textarea>
                  <button type="submit">Comment</button>
                </form>
              </div>
            </div>
          </article>
        `;
      })
      .join("");
  });

  document.querySelectorAll(".comment-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      toggleCommentThread(button.dataset.updateId);
    });
  });

  document.querySelectorAll(".comment-form").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const body = String(formData.get("commentBody")).trim();
      if (!body) {
        return;
      }

      state.openCommentThreads.add(form.dataset.updateId);
      void addComment(form.dataset.updateId, body);
      form.reset();
    });
  });
}

function renderWorkspace() {
  if (!state.session || !state.membership || !state.team) {
    renderAuth();
    return;
  }

  const template = document.querySelector("#workspace-template");
  app.replaceChildren(template.content.cloneNode(true));

  document.querySelector("#team-name").textContent = state.team.name;
  document.querySelector("#member-summary").textContent = `${state.membership.role} • ${founderNameFromEmail(state.membership.email)}`;
  document.querySelector("#week-label").textContent = formatWeekLabel(state.weekStart);
  document.querySelector("#push-count").textContent = String(state.updates.length);
  document.querySelector("#today-count").textContent = String(
    state.updates.filter((entry) => entry.created_at?.slice(0, 10) === getTodayLocalDate()).length
  );
  document.querySelector("#member-count").textContent = String(state.memberships.length);
  document.querySelector("#next-push-id").textContent = nextPushId();
  document.querySelector("#ceo-owner").textContent = founderNameForRole("CEO");
  document.querySelector("#coo-owner").textContent = founderNameForRole("COO");
  document.querySelector("#cfo-owner").textContent = founderNameForRole("CFO");

  const workspaceFeedback = document.querySelector("#workspace-feedback");
  renderStatus(workspaceFeedback, state.authMessage, state.authTone);

  const weeklyGoalInput = document.querySelector("#weekly-goal-input");
  weeklyGoalInput.value = state.weeklyGoal?.goal_text || "";
  weeklyGoalInput.disabled = !isCEO();

  const saveGoalButton = document.querySelector("#save-goal");
  if (!isCEO()) {
    saveGoalButton.classList.add("is-hidden");
  } else {
    saveGoalButton.addEventListener("click", () => {
      void saveWeeklyGoal(weeklyGoalInput.value);
    });
  }

  renderTaskColumns();
  renderIdeas();
  renderFeedColumns();

  const promptConfig = getPromptForRole(state.membership.role);
  document.querySelector("#prompt-role-title").textContent = `${state.membership.role} update capture`;
  document.querySelector("#prompt-role-summary").textContent = promptConfig.summary;
  document.querySelector("#prompt-label").textContent = promptConfig.title;
  document.querySelector("#prompt-script").value = promptConfig.prompt;

  document.querySelector("#copy-prompt").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(promptConfig.prompt);
      state.authMessage = `${state.membership.role} prompt copied. Paste it into your AI, then paste the response back here.`;
      state.authTone = "success";
    } catch {
      state.authMessage = "Copy failed. You can still select the prompt text manually.";
      state.authTone = "error";
    }

    renderWorkspace();
  });

  document.querySelector("#sign-out").addEventListener("click", () => {
    void signOut();
  });

  document.querySelector("#export-json").addEventListener("click", exportJson);

  const updateForm = document.querySelector("#update-form");
  const headlineInput = updateForm.querySelector('input[name="headline"]');
  const draftInput = updateForm.querySelector('textarea[name="aiDraft"]');
  const copyTitleButton = document.querySelector("#copy-title");

  copyTitleButton.addEventListener("click", async () => {
    if (!headlineInput.value.trim()) {
      state.authMessage = "Add a title first, then copy it.";
      state.authTone = "error";
      renderWorkspace();
      return;
    }

    try {
      await navigator.clipboard.writeText(headlineInput.value.trim());
      state.authMessage = "Title copied.";
      state.authTone = "success";
    } catch {
      state.authMessage = "Copy failed. You can still select the title manually.";
      state.authTone = "error";
    }

    renderWorkspace();
  });

  draftInput.addEventListener("blur", () => {
    if (headlineInput.value.trim()) {
      return;
    }

    const parsedDraft = parseAIDraft(draftInput.value, state.membership.role);
    if (parsedDraft.headline) {
      headlineInput.value = parsedDraft.headline;
    }
  });

  updateForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(updateForm);
    const aiDraft = String(formData.get("aiDraft")).trim();
    if (!aiDraft) {
      return;
    }

    if (!String(formData.get("headline")).trim()) {
      const parsedDraft = parseAIDraft(aiDraft, state.membership.role);
      formData.set("headline", parsedDraft.headline);
    }

    void addUpdate(formData);
    updateForm.reset();
  });

  const ideaForm = document.querySelector("#idea-form");
  ideaForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(ideaForm);
    const body = String(formData.get("ideaBody")).trim();
    if (!body) {
      return;
    }

    void addIdea(body);
    ideaForm.reset();
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
