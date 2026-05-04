const { getSessionFromRequest, json, supabaseFetch } = require("./_lib");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    return json(response, 405, { error: "Method not allowed." });
  }

  const session = getSessionFromRequest(request);
  if (!session) {
    return json(response, 401, { error: "Not signed in." });
  }

  try {
    const { body } = request.body || {};

    if (!body) {
      return json(response, 400, { error: "Idea text is required." });
    }

    await supabaseFetch("/rest/v1/ideas", {
      method: "POST",
      headers: {
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        team_id: session.teamId,
        author_user_id: session.userId,
        author_email: session.email,
        author_role: session.role,
        body: String(body).trim(),
      }),
    });

    return json(response, 201, { ok: true });
  } catch (error) {
    return json(response, error.statusCode || 500, {
      error: error.message || "Unable to save idea.",
    });
  }
};
