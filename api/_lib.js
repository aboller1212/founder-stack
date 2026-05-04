const crypto = require("node:crypto");

const BASE_URL = process.env.SUPABASE_URL || "https://eiajzuoreyniiclqqtrg.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_COOKIE = "founder_stack_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 14;

function ensureServerConfig() {
  if (!SERVICE_ROLE_KEY || !SESSION_SECRET) {
    throw new Error("Missing server configuration.");
  }
}

async function supabaseFetch(path, options = {}) {
  ensureServerConfig();

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(payload?.message || payload?.error_description || "Supabase request failed.");
  }

  return payload;
}

async function optionalSupabaseFetch(path, fallback) {
  try {
    return await supabaseFetch(path);
  } catch {
    return fallback;
  }
}

function json(response, statusCode, payload, extraHeaders = {}) {
  response.status(statusCode).setHeader("Content-Type", "application/json; charset=utf-8");
  Object.entries(extraHeaders).forEach(([key, value]) => {
    response.setHeader(key, value);
  });
  response.end(JSON.stringify(payload));
}

function parseCookies(request) {
  const header = request.headers.cookie || "";
  return header.split(";").reduce((cookies, chunk) => {
    const [rawName, ...rest] = chunk.trim().split("=");
    if (!rawName) {
      return cookies;
    }

    cookies[rawName] = decodeURIComponent(rest.join("="));
    return cookies;
  }, {});
}

function signSession(session) {
  ensureServerConfig();
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function verifySession(token) {
  ensureServerConfig();
  if (!token || !token.includes(".")) {
    return null;
  }

  const [payload, signature] = token.split(".");
  const expected = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("base64url");

  if (signature !== expected) {
    return null;
  }

  const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (!session.exp || session.exp < Date.now()) {
    return null;
  }

  return session;
}

function buildSessionCookie(token) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
}

function buildExpiredSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function getSessionFromRequest(request) {
  const cookies = parseCookies(request);
  return verifySession(cookies[SESSION_COOKIE]);
}

function getCurrentWeekStart(date = new Date()) {
  const now = new Date(date);
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  now.setDate(now.getDate() + diff);
  now.setHours(0, 0, 0, 0);
  return now.toISOString().slice(0, 10);
}

function assertCEO(session) {
  if (session.role !== "CEO") {
    const error = new Error("Only the CEO can edit this section.");
    error.statusCode = 403;
    throw error;
  }
}

function founderDisplayNameFromEmail(email) {
  if (!email) {
    return "Founder";
  }

  const localPart = email.split("@")[0] || "";
  const normalized = localPart.replace(/[._-]+/g, " ").trim();
  if (!normalized) {
    return "Founder";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

async function findTeamByCode(teamCode) {
  const rows = await supabaseFetch(
    `/rest/v1/teams?select=id,name,invite_code,created_at&invite_code=eq.${encodeURIComponent(teamCode)}`
  );
  return rows[0] || null;
}

async function findMembership(teamId, email) {
  const rows = await supabaseFetch(
    `/rest/v1/memberships?select=id,team_id,email,role,user_id,created_at&team_id=eq.${teamId}&email=eq.${encodeURIComponent(email)}`
  );
  return rows[0] || null;
}

async function createAuthUser(email) {
  return supabaseFetch("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      email_confirm: true,
      user_metadata: {
        source: "founder-stack-team-code",
      },
    }),
  });
}

async function findAuthUserByEmail(email) {
  const payload = await supabaseFetch("/auth/v1/admin/users?page=1&per_page=100");
  return payload.users?.find((user) => user.email?.toLowerCase() === email.toLowerCase()) || null;
}

async function updateMembershipUserId(membershipId, userId) {
  await supabaseFetch(`/rest/v1/memberships?id=eq.${membershipId}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ user_id: userId }),
  });
}

async function ensureMembershipUser(membership) {
  if (membership.user_id) {
    return membership.user_id;
  }

  let userId;

  try {
    const created = await createAuthUser(membership.email);
    userId = created.user?.id || created.id;
  } catch {
    const existingUser = await findAuthUserByEmail(membership.email);
    userId = existingUser?.id;
  }

  if (!userId) {
    throw new Error("Unable to create founder identity.");
  }

  await updateMembershipUserId(membership.id, userId);
  return userId;
}

async function loadWorkspace(session) {
  const weekStart = getCurrentWeekStart();

  const [teamRows, memberships, updates, comments, ideas, ideaComments, weeklyGoals, tasks] = await Promise.all([
    supabaseFetch(`/rest/v1/teams?select=id,name,created_at&id=eq.${session.teamId}`),
    supabaseFetch(
      `/rest/v1/memberships?select=id,email,role,user_id,created_at&team_id=eq.${session.teamId}&order=created_at.asc`
    ),
    supabaseFetch(
      `/rest/v1/updates?select=id,team_id,user_id,headline,wins,blockers,next_move,created_at&team_id=eq.${session.teamId}&order=created_at.desc`
    ),
    optionalSupabaseFetch(
      `/rest/v1/comments?select=id,update_id,team_id,author_user_id,author_email,author_role,body,created_at&team_id=eq.${session.teamId}&order=created_at.asc`,
      []
    ),
    optionalSupabaseFetch(
      `/rest/v1/ideas?select=id,team_id,author_user_id,author_email,author_role,body,status,status_updated_at,status_updated_by_email,created_at&team_id=eq.${session.teamId}&order=created_at.desc`,
      []
    ),
    optionalSupabaseFetch(
      `/rest/v1/idea_comments?select=id,idea_id,team_id,author_user_id,author_email,author_role,body,created_at&team_id=eq.${session.teamId}&order=created_at.asc`,
      []
    ),
    optionalSupabaseFetch(
      `/rest/v1/weekly_goals?select=id,team_id,week_start,goal_text,updated_by_email,updated_at&team_id=eq.${session.teamId}&week_start=eq.${weekStart}&order=updated_at.desc`,
      []
    ),
    optionalSupabaseFetch(
      `/rest/v1/tasks?select=id,team_id,week_start,assignee_name,title,completed,sort_order,created_at,updated_at&team_id=eq.${session.teamId}&week_start=eq.${weekStart}&order=sort_order.asc,created_at.asc`,
      []
    ),
  ]);

  const team = teamRows[0];
  const membership = memberships.find((item) => item.email.toLowerCase() === session.email.toLowerCase());

  if (!team || !membership) {
    throw new Error("Workspace not found.");
  }

  return {
    session,
    team,
    membership,
    memberships,
    updates,
    comments,
    ideas,
    ideaComments,
    weeklyGoal: weeklyGoals[0] || null,
    tasks,
    weekStart,
  };
}

module.exports = {
  SESSION_MAX_AGE,
  assertCEO,
  buildExpiredSessionCookie,
  buildSessionCookie,
  ensureMembershipUser,
  findMembership,
  findTeamByCode,
  founderDisplayNameFromEmail,
  getCurrentWeekStart,
  getSessionFromRequest,
  json,
  loadWorkspace,
  optionalSupabaseFetch,
  signSession,
  supabaseFetch,
};
