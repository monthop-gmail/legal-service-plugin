import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { createServer } from "http";
import { searchLaws, calculateCompensation, getFeeEstimate, FEE_SCHEDULES } from "./data/labor-law.js";
import { createLead, getLeads } from "./services/odoo.js";

const PORT = parseInt(process.env.MCP_HTTP_PORT || "3001");

// Reuse same tool definitions — extract to shared module in production
function createLegalServer(): McpServer {
  const server = new McpServer({ name: "legal-th", version: "0.1.0" });

  server.tool(
    "legal_search",
    "ค้นหากฎหมายไทยที่เกี่ยวข้อง พร้อมคำนวณค่าชดเชย",
    {
      query: z.string().describe("คำค้นหา เช่น 'เลิกจ้างไม่เป็นธรรม'"),
      years_of_service: z.number().optional().describe("อายุงาน (ปี)"),
    },
    async ({ query, years_of_service }) => {
      const results = searchLaws(query);
      const response: any = {
        found: results.length > 0,
        laws: results.map((law) => ({
          act: law.act,
          section: law.section,
          title: law.title,
          summary: law.summary,
          details: law.details,
          compensation_table: law.compensation,
        })),
      };
      if (years_of_service !== undefined) {
        const comp = calculateCompensation(years_of_service);
        if (comp) {
          response.calculated_compensation = {
            years_of_service,
            entitled_days: comp.days,
            description: comp.description,
          };
        }
      }
      response.disclaimer = "⚠️ ข้อมูลเบื้องต้นเท่านั้น กรุณาปรึกษาทนายความ";
      return { content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }] };
    }
  );

  server.tool(
    "fee_estimate",
    "ประเมินค่าบริการทนายความ",
    {
      type: z.enum(["labor", "contract", "criminal"]).describe("ประเภทคดี"),
      service: z.string().describe("ประเภทบริการ"),
    },
    async ({ type, service }) => {
      const fee = getFeeEstimate(type, service);
      if (!fee) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ found: false, available_types: FEE_SCHEDULES.map((s) => s.type) }, null, 2),
          }],
        };
      }
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            found: true,
            price_range: `${fee.priceRange.min.toLocaleString()}-${fee.priceRange.max.toLocaleString()} บาท/${fee.unit}`,
            description: fee.description,
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    "case_intake",
    "สร้าง Lead / รับเรื่องคดีใหม่",
    {
      name: z.string(),
      phone: z.string().optional(),
      email: z.string().optional(),
      case_type: z.enum(["labor", "contract", "criminal", "other"]),
      description: z.string(),
    },
    async ({ name, phone, email, case_type, description }) => {
      const lead = await createLead({ name, phone, email, caseType: case_type, description });
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            lead_id: lead.id,
            message: `สร้างเรื่องสำเร็จ (${lead.id})`,
          }, null, 2),
        }],
      };
    }
  );

  return server;
}

// SSE HTTP Server
const sessions = new Map<string, SSEServerTransport>();

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "legal-th-mcp", version: "0.1.0" }));
    return;
  }

  // SSE endpoint — client connects here
  if (url.pathname === "/sse" && req.method === "GET") {
    const transport = new SSEServerTransport("/message", res);
    const server = createLegalServer();
    sessions.set(transport.sessionId, transport);

    res.on("close", () => {
      sessions.delete(transport.sessionId);
    });

    await server.connect(transport);
    return;
  }

  // Message endpoint — client sends MCP messages here
  if (url.pathname === "/message" && req.method === "POST") {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId || !sessions.has(sessionId)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }

    const transport = sessions.get(sessionId)!;
    await transport.handlePostMessage(req, res);
    return;
  }

  // 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

httpServer.listen(PORT, () => {
  console.error(`🏛️ Legal-TH MCP HTTP/SSE Server running on port ${PORT}`);
});
