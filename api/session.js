const {
  SESSION_MAX_AGE,
  buildExpiredSessionCookie,
  buildSessionCookie,
  ensureMembershipUser,
  findMembership,
  findTeamByCode,
  json,
  signSession,
} = require("./_lib");

module.exports = async function handler(request, response) {
  if (request.method === "DELETE") {
    return json(
      response,
      200,
      { ok: true },
      {
        "Set-Cookie": buildExpiredSessionCookie(),
      }
    );
  }

  if (request.method !== "POST") {
    return json(response, 405, { error: "Method not allowed." });
  }

  try {
    const { email, teamCode } = request.body || {};

    if (!email || !teamCode) {
      return json(response, 400, { error: "Email and team code are required." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedCode = String(teamCode).trim().toUpperCase();

    const team = await findTeamByCode(normalizedCode);
    if (!team) {
      return json(response, 401, { error: "Team code not recognized." });
    }

    const membership = await findMembership(team.id, normalizedEmail);
    if (!membership) {
      return json(response, 401, { error: "This email is not on the founder roster." });
    }

    const userId = await ensureMembershipUser(membership);

    const session = {
      email: normalizedEmail,
      role: membership.role,
      teamId: team.id,
      userId,
      exp: Date.now() + SESSION_MAX_AGE * 1000,
    };

    return json(
      response,
      200,
      { session },
      {
        "Set-Cookie": buildSessionCookie(signSession(session)),
      }
    );
  } catch (error) {
    return json(response, 500, { error: error.message || "Unable to create session." });
  }
};
