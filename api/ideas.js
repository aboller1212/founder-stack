const { getSessionFromRequest, json, supabaseFetch } = require("./_lib");

module.exports = async function handler(request, response) {
  if (!["POST", "DELETE"].includes(request.method)) {
    return json(response, 405, { error: "Method not allowed." });
  }

  const session = getSessionFromRequest(request);
  if (!session) {
    return json(response, 401, { error: "Not signed in." });
  }

  try {
    if (request.method === "DELETE") {
      const { ideaId } = request.body || {};

      if (!ideaId) {
        return json(response, 400, { error: "Idea id is required." });
      }

      const rows = await supabaseFetch(
        `/rest/v1/ideas?select=id,team_id,author_user_id,author_email&id=eq.${encodeURIComponent(ideaId)}&team_id=eq.${session.teamId}`
      );
      const idea = rows[0];

      if (!idea) {
        return json(response, 404, { error: "Idea not found." });
      }

      const canDelete =
        session.role === "CEO" ||
        idea.author_user_id === session.userId ||
        idea.author_email?.toLowerCase() === session.email.toLowerCase();

      if (!canDelete) {
        return json(response, 403, { error: "You can only delete your own ideas." });
      }

      await supabaseFetch(`/rest/v1/ideas?id=eq.${encodeURIComponent(ideaId)}&team_id=eq.${session.teamId}`, {
        method: "DELETE",
        headers: {
          Prefer: "return=minimal",
        },
      });

      return json(response, 200, { ok: true });
    }

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
