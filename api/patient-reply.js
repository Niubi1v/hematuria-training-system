const { applyAgentCors } = require("../server/requestSecurity.js");

module.exports = async function handler(req, res) {
  const origin = applyAgentCors(req, res);
  if (!origin.allowed) return res.status(403).json({ error: "origin_not_allowed" });
  if (req.method === "OPTIONS") return res.status(204).end();
  return res.status(410).json({ error: "endpoint_retired", replacement: "/api/agent-chat/" });
};
