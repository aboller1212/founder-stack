const {
  assertCEO,
  getCurrentWeekStart,
  getSessionFromRequest,
  json,
  supabaseFetch,
} = require("./_lib");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    return json(response, 405, { error: "Method not allowed." });
  }

  const session = getSessionFromRequest(request);
  if (!session) {
    return json(response, 401, { error: "Not signed in." });
  }

  try {
    assertCEO(session);

    const { goalText } = request.body || {};
    if (typeof goalText !== "string") {
      return json(response, 400, { error: "Goal text is required." });
    }

    const weekStart = getCurrentWeekStart();
    const existingRows = await supabaseFetch(
      `/rest/v1/weekly_goals?select=id&team_id=eq.${session.teamId}&week_start=eq.${weekStart}`
    );

    const payload = {
      team_id: session.teamId,
      week_start: weekStart,
      goal_text: goalText.trim(),
      updated_by_email: session.email,
      updated_at: new Date().toISOString(),
    };

    if (existingRows[0]?.id) {
      await supabaseFetch(`/rest/v1/weekly_goals?id=eq.${existingRows[0].id}`, {
        method: "PATCH",
        headers: {
          Prefer: "return=minimal",
        },
        body: JSON.stringify(payload),
      });
    } else {
      await supabaseFetch("/rest/v1/weekly_goals", {
        method: "POST",
        headers: {
          Prefer: "return=minimal",
        },
        body: JSON.stringify(payload),
      });
    }

    return json(response, 200, { ok: true });
  } catch (error) {
    return json(response, error.statusCode || 500, {
      error: error.message || "Unable to save weekly goal.",
    });
  }
};
