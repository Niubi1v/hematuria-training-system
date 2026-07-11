const { initSession } = require("../../server/patientSession.js");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.AGENT_API_ALLOWED_ORIGIN || process.env.PATIENT_AGENT_ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    if (!body.caseId) return res.status(400).json({ error: "caseId is required" });
    const result = await initSession({
      caseId: body.caseId,
      mode: body.mode || "training",
      language: body.language || "zh",
      debug: true
    });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Profile completion failed" });
  }
};
