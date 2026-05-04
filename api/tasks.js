const {
  assertCEO,
  getCurrentWeekStart,
  getSessionFromRequest,
  json,
  supabaseFetch,
} = require("./_lib");

module.exports = async function handler(request, response) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return json(response, 401, { error: "Not signed in." });
  }

  try {
    assertCEO(session);

    if (request.method === "POST") {
      const { assigneeName, title } = request.body || {};
      if (!assigneeName || !title) {
        return json(response, 400, { error: "Assignee and task title are required." });
      }

      await supabaseFetch("/rest/v1/tasks", {
        method: "POST",
        headers: {
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          team_id: session.teamId,
          week_start: getCurrentWeekStart(),
          assignee_name: String(assigneeName).trim(),
          title: String(title).trim(),
          completed: false,
        }),
      });

      return json(response, 201, { ok: true });
    }

    if (request.method === "PATCH") {
      const { taskId, title, completed } = request.body || {};
      if (!taskId) {
        return json(response, 400, { error: "Task id is required." });
      }

      const patch = {};
      if (typeof title === "string") {
        patch.title = title.trim();
      }
      if (typeof completed === "boolean") {
        patch.completed = completed;
      }
      patch.updated_at = new Date().toISOString();

      await supabaseFetch(`/rest/v1/tasks?id=eq.${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        headers: {
          Prefer: "return=minimal",
        },
        body: JSON.stringify(patch),
      });

      return json(response, 200, { ok: true });
    }

    if (request.method === "DELETE") {
      const { taskId } = request.body || {};
      if (!taskId) {
        return json(response, 400, { error: "Task id is required." });
      }

      await supabaseFetch(`/rest/v1/tasks?id=eq.${encodeURIComponent(taskId)}`, {
        method: "DELETE",
        headers: {
          Prefer: "return=minimal",
        },
      });

      return json(response, 200, { ok: true });
    }

    return json(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return json(response, error.statusCode || 500, {
      error: error.message || "Unable to update tasks.",
    });
  }
};
