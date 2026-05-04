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
