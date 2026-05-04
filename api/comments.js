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
    const { updateId, body } = request.body || {};

    if (!updateId || !body) {
      return json(response, 400, { error: "Update and comment body are required." });
    }

    await supabaseFetch("/rest/v1/comments", {
      method: "POST",
      headers: {
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        update_id: String(updateId),
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
      error: error.message || "Unable to save comment.",
    });
  }
};
