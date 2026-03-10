import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchLaws, calculateCompensation, getFeeEstimate, FEE_SCHEDULES } from "./data/labor-law.js";
import { createLead, getLeads } from "./services/odoo.js";
import { ragSearch, ragIngest, ragHealth } from "./services/rag.js";

const server = new McpServer({
  name: "legal-th",
  version: "0.1.0",
});

// ─── Tool 1: legal_search ───────────────────────────────────────
server.tool(
  "legal_search",
  "ค้นหากฎหมายไทยที่เกี่ยวข้อง พร้อมคำนวณค่าชดเชย (ถ้ามี)",
  {
    query: z.string().describe("คำค้นหา เช่น 'เลิกจ้างไม่เป็นธรรม', 'ค่าล่วงเวลา', 'ลาป่วย'"),
    years_of_service: z.number().optional().describe("อายุงาน (ปี) สำหรับคำนวณค่าชดเชย"),
  },
  async ({ query, years_of_service }) => {
    const results = searchLaws(query);

    if (results.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              found: false,
              message: `ไม่พบกฎหมายที่เกี่ยวข้องกับ "${query}" ในฐานข้อมูล PoC กรุณาปรึกษาทนายความเพื่อข้อมูลที่ครบถ้วน`,
            }, null, 2),
          },
        ],
      };
    }

    const response: any = {
      found: true,
      laws: results.map((law) => ({
        act: law.act,
        section: law.section,
        title: law.title,
        summary: law.summary,
        details: law.details,
        compensation_table: law.compensation || undefined,
      })),
    };

    // คำนวณค่าชดเชยถ้าระบุอายุงาน
    if (years_of_service !== undefined) {
      const comp = calculateCompensation(years_of_service);
      if (comp) {
        response.calculated_compensation = {
          years_of_service,
          entitled_days: comp.days,
          description: comp.description,
          note: `ทำงาน ${years_of_service} ปี → สิทธิ์ได้ค่าชดเชย ${comp.days} วัน (${comp.description})`,
        };
      }
    }

    response.disclaimer = "⚠️ ข้อมูลนี้เป็นข้อมูลเบื้องต้นเท่านั้น ไม่ถือเป็นคำปรึกษาทางกฎหมาย กรุณาปรึกษาทนายความเพื่อคำแนะนำที่เหมาะสมกับกรณีของท่าน";

    return {
      content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
    };
  }
);

// ─── Tool 2: fee_estimate ───────────────────────────────────────
server.tool(
  "fee_estimate",
  "ประเมินค่าบริการทนายความเบื้องต้น",
  {
    type: z.enum(["labor", "contract", "criminal"]).describe("ประเภทคดี: labor=แรงงาน, contract=สัญญา, criminal=อาญา"),
    service: z.string().describe("ประเภทบริการ: consultation, letter, negotiation, litigation, draft, bail"),
  },
  async ({ type, service }) => {
    const fee = getFeeEstimate(type, service);

    if (!fee) {
      const available = FEE_SCHEDULES.find((s) => s.type === type);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              found: false,
              message: `ไม่พบบริการ "${service}" ในประเภท "${type}"`,
              available_services: available?.services.map((s) => s.service) || [],
              available_types: FEE_SCHEDULES.map((s) => s.type),
            }, null, 2),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            found: true,
            type,
            service: fee.service,
            price_range: {
              min: fee.priceRange.min,
              max: fee.priceRange.max,
              currency: "THB",
              formatted: `${fee.priceRange.min.toLocaleString()}-${fee.priceRange.max.toLocaleString()} บาท/${fee.unit}`,
            },
            description: fee.description,
            note: "ราคาอาจเปลี่ยนแปลงตามความซับซ้อนของคดี",
          }, null, 2),
        },
      ],
    };
  }
);

// ─── Tool 3: case_intake ────────────────────────────────────────
server.tool(
  "case_intake",
  "สร้าง Lead / รับเรื่องคดีใหม่เข้าระบบ (Odoo CRM)",
  {
    name: z.string().describe("ชื่อลูกค้า"),
    phone: z.string().optional().describe("เบอร์โทรศัพท์"),
    email: z.string().optional().describe("อีเมล"),
    case_type: z.enum(["labor", "contract", "criminal", "other"]).describe("ประเภทคดี"),
    description: z.string().describe("รายละเอียดเบื้องต้นของคดี"),
  },
  async ({ name, phone, email, case_type, description }) => {
    const lead = await createLead({
      name,
      phone,
      email,
      caseType: case_type,
      description,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            lead: {
              id: lead.id,
              status: lead.status,
              created_at: lead.createdAt,
            },
            message: `สร้างเรื่องสำเร็จ (${lead.id}) ทีมทนายจะติดต่อกลับภายใน 24 ชั่วโมง`,
            next_steps: [
              "📞 ทีมทนายจะโทรกลับเพื่อนัดหมาย",
              "📋 เตรียมเอกสารที่เกี่ยวข้อง (สัญญาจ้าง, สลิปเงินเดือน, หนังสือเลิกจ้าง)",
              "💬 สามารถสอบถามเพิ่มเติมได้ตลอด",
            ],
          }, null, 2),
        },
      ],
    };
  }
);

// ─── Tool 4: list_leads (admin) ─────────────────────────────────
server.tool(
  "list_leads",
  "ดูรายการ Lead ทั้งหมดในระบบ (สำหรับทนาย/admin)",
  {},
  async () => {
    const leads = await getLeads();
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            total: leads.length,
            leads: leads.map((l) => ({
              id: l.id,
              name: l.name,
              type: l.caseType,
              status: l.status,
              created: l.createdAt,
            })),
          }, null, 2),
        },
      ],
    };
  }
);

// ─── Tool 5: rag_search ─────────────────────────────────────────
server.tool(
  "rag_search",
  "ค้นหาเชิงความหมาย (semantic search) จากฐานข้อมูลกฎหมาย คำพิพากษา บทความ — ใช้เมื่อ legal_search ไม่พบข้อมูล หรือต้องการค้นหาคำพิพากษาศาลฎีกา/บทความวิชาการ",
  {
    query: z.string().describe("คำค้นหาเชิงความหมาย เช่น 'พนักงานถูกเลิกจ้างเพราะโพสต์วิจารณ์บริษัทในโซเชียล'"),
    type: z.enum(["law", "judgment", "regulation", "article", "all"]).optional()
      .describe("กรองประเภท: law=ตัวบท, judgment=คำพิพากษา, regulation=กฎกระทรวง, article=บทความ, all=ทั้งหมด"),
    top_k: z.number().optional().describe("จำนวนผลลัพธ์ (default: 5, max: 20)"),
  },
  async ({ query, type, top_k }) => {
    try {
      const results = await ragSearch({
        query,
        filter_type: type === "all" ? undefined : type,
        top_k: Math.min(top_k || 5, 20),
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            found: results.length > 0,
            total: results.length,
            results: results.map((r) => ({
              score: r.score,
              source: r.metadata.source,
              type: r.metadata.type,
              section: r.metadata.section,
              year: r.metadata.year,
              content: r.content,
              tags: r.metadata.tags,
            })),
            disclaimer: "⚠️ ผลลัพธ์จาก RAG search อาจไม่ครบถ้วน กรุณาตรวจสอบกับแหล่งข้อมูลต้นฉบับ",
          }, null, 2),
        }],
      };
    } catch (err: any) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            found: false,
            error: "RAG service unavailable",
            message: err.message,
            fallback: "ใช้ legal_search สำหรับค้นหาจากฐานข้อมูลหลัก",
          }, null, 2),
        }],
      };
    }
  }
);

// ─── Tool 6: rag_ingest ─────────────────────────────────────────
server.tool(
  "rag_ingest",
  "เพิ่มเอกสารกฎหมายเข้าฐานข้อมูล RAG (สำหรับ admin) — รับข้อความ + metadata แล้ว chunk & embed อัตโนมัติ",
  {
    content: z.string().describe("เนื้อหาเอกสาร (ข้อความเต็ม)"),
    source: z.string().describe("แหล่งที่มา เช่น 'พ.ร.บ.คุ้มครองแรงงาน พ.ศ. 2541'"),
    type: z.enum(["law", "judgment", "regulation", "article"]).describe("ประเภทเอกสาร"),
    section: z.string().optional().describe("มาตรา / เลขคดี เช่น 'มาตรา 118' หรือ 'ฎ.1234/2565'"),
    year: z.number().optional().describe("ปี พ.ศ. ของเอกสาร"),
    tags: z.array(z.string()).optional().describe("แท็ก เช่น ['แรงงาน', 'เลิกจ้าง', 'ค่าชดเชย']"),
  },
  async ({ content, source, type, section, year, tags }) => {
    try {
      const result = await ragIngest({
        content,
        metadata: { source, type, section, year, tags },
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            id: result.id,
            status: result.status,
            chunks: result.chunks,
            message: `เพิ่มเอกสารสำเร็จ (${result.chunks} chunks)`,
          }, null, 2),
        }],
      };
    } catch (err: any) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            error: "RAG service unavailable",
            message: err.message,
          }, null, 2),
        }],
      };
    }
  }
);

// ─── Tool 7: rag_status ─────────────────────────────────────────
server.tool(
  "rag_status",
  "ตรวจสอบสถานะ RAG service และจำนวนเอกสารในฐานข้อมูล",
  {},
  async () => {
    try {
      const health = await ragHealth();
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            connected: true,
            ...health,
          }, null, 2),
        }],
      };
    } catch (err: any) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            connected: false,
            error: err.message,
            hint: "RAG service ยังไม่พร้อม — ใช้ legal_search สำหรับค้นหาจากฐานข้อมูลหลักแทน",
          }, null, 2),
        }],
      };
    }
  }
);

// ─── Start Server ───────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🏛️ Legal-TH MCP Server running (stdio)");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
