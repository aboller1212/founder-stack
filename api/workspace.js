const { getSessionFromRequest, json, loadWorkspace } = require("./_lib");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    return json(response, 405, { error: "Method not allowed." });
  }

  const session = getSessionFromRequest(request);
  if (!session) {
    return json(response, 401, { error: "Not signed in." });
  }

  try {
    const workspace = await loadWorkspace(session);
    return json(response, 200, workspace);
  } catch (error) {
    return json(response, 401, { error: error.message || "Unable to load workspace." });
  }
};
