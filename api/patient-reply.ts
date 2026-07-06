import { handlePatientReplyRequest } from "../src/server/patientReplyService";

const allowedMethods = "POST, OPTIONS";

function setCors(res: { setHeader: (key: string, value: string) => void }) {
  res.setHeader("Access-Control-Allow-Origin", process.env.PATIENT_AGENT_ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", allowedMethods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: `Method ${req.method} not allowed` });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const result = await handlePatientReplyRequest(body);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Patient reply request failed"
    });
  }
}
