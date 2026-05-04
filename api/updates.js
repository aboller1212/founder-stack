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
      const { updateId } = request.body || {};

      if (!updateId) {
        return json(response, 400, { error: "Update id is required." });
      }

      const rows = await supabaseFetch(
        `/rest/v1/updates?select=id,team_id,user_id&id=eq.${encodeURIComponent(updateId)}&team_id=eq.${session.teamId}`
      );
      const update = rows[0];

      if (!update) {
        return json(response, 404, { error: "Update not found." });
      }

      const canDelete = session.role === "CEO" || update.user_id === session.userId;

      if (!canDelete) {
        return json(response, 403, { error: "You can only delete your own updates." });
      }

      await supabaseFetch(`/rest/v1/updates?id=eq.${encodeURIComponent(updateId)}&team_id=eq.${session.teamId}`, {
        method: "DELETE",
        headers: {
          Prefer: "return=minimal",
        },
      });

      return json(response, 200, { ok: true });
    }

    const { aiDraft, headline } = request.body || {};

    if (!aiDraft || !headline) {
      return json(response, 400, { error: "The pasted AI update is required." });
    }

    await supabaseFetch("/rest/v1/updates", {
      method: "POST",
      headers: {
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        team_id: session.teamId,
        user_id: session.userId,
        headline: String(headline).trim(),
        wins: String(aiDraft).trim(),
        blockers: "",
        next_move: "",
      }),
    });

    return json(response, 201, { ok: true });
  } catch (error) {
    return json(response, 500, { error: error.message || "Unable to save update." });
  }
};
