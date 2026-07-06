import http from "node:http";
import { handlePatientReplyRequest } from "@/src/server/patientReplyService";

const port = Number(process.env.PATIENT_AGENT_API_PORT || 8787);

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.PATIENT_AGENT_ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST" || req.url !== "/api/patient-reply") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", async () => {
    try {
      const result = await handlePatientReplyRequest(JSON.parse(body || "{}"));
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Patient reply failed" }));
    }
  });
});

server.listen(port, () => {
  console.log(`Patient Agent API listening at http://127.0.0.1:${port}/api/patient-reply`);
});
