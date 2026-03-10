import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { randomUUID } from "crypto";
import { searchLaws, calculateCompensation, getFeeEstimate, FEE_SCHEDULES } from "./data/labor-law.js";
import { createLead, getLeads } from "./services/odoo.js";

const PORT = parseInt(process.env.MCP_HTTP_PORT || "3001");

// ─── Shared tool registration ────────────────────────────────
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

// ─── Streamable HTTP (primary) ───────────────────────────────
// Stateful: 1 transport per session, server manages session IDs
const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: McpServer }>();

async function handleStreamableHTTP(req: IncomingMessage, res: ServerResponse) {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  // Existing session → delegate
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    await session.transport.handleRequest(req, res);
    return;
  }

  // New session (POST initialize) or stateless
  if (req.method === "POST") {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, { transport, server });
        console.error(`[Streamable HTTP] Session created: ${id}`);
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
        console.error(`[Streamable HTTP] Session closed: ${transport.sessionId}`);
      }
    };

    const server = createLegalServer();
    await server.connect(transport);
    await transport.handleRequest(req, res);
    return;
  }

  // GET on /mcp without session → 400
  if (req.method === "GET") {
    if (!sessionId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing Mcp-Session-Id header for GET" }));
      return;
    }
    // Unknown session
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Session not found" }));
    return;
  }

  // DELETE → close session
  if (req.method === "DELETE") {
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      await session.transport.close();
      sessions.delete(sessionId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ closed: true }));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Session not found" }));
    return;
  }

  res.writeHead(405, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Method not allowed" }));
}

// ─── SSE fallback (backward compat) ─────────────────────────
const sseSessions = new Map<string, SSEServerTransport>();

async function handleSSE(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (url.pathname === "/sse" && req.method === "GET") {
    const transport = new SSEServerTransport("/message", res);
    const server = createLegalServer();
    sseSessions.set(transport.sessionId, transport);
    res.on("close", () => sseSessions.delete(transport.sessionId));
    await server.connect(transport);
    return;
  }

  if (url.pathname === "/message" && req.method === "POST") {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId || !sseSessions.has(sessionId)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }
    await sseSessions.get(sessionId)!.handlePostMessage(req, res);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}

// ─── HTTP Router ─────────────────────────────────────────────
const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      service: "legal-th-mcp",
      version: "0.1.0",
      transport: "streamable-http",
      active_sessions: sessions.size,
      sse_sessions: sseSessions.size,
    }));
    return;
  }

  // Streamable HTTP endpoint (primary)
  if (url.pathname === "/mcp") {
    await handleStreamableHTTP(req, res);
    return;
  }

  // SSE fallback endpoints
  if (url.pathname === "/sse" || url.pathname === "/message") {
    await handleSSE(req, res, url);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found", endpoints: ["/mcp", "/sse", "/health"] }));
});

httpServer.listen(PORT, () => {
  console.error(`⚖️ Legal-TH MCP Server v0.1.0`);
  console.error(`  Streamable HTTP → http://0.0.0.0:${PORT}/mcp`);
  console.error(`  SSE fallback    → http://0.0.0.0:${PORT}/sse`);
  console.error(`  Health check    → http://0.0.0.0:${PORT}/health`);
});
