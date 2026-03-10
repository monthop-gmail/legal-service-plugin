# เปรียบเทียบ 2 Repos: `legal-service` vs `legal-th`

ทั้งสอง repo เป็น **Thai Legal Assistant** ที่ใช้ **MCP Protocol** เหมือนกัน แต่มีความแตกต่างสำคัญหลายด้าน

---

## 1. Tech Stack

| | `server-poc/legal-service` | `server-assistant/legal-th` |
|---|---|---|
| **ภาษา** | TypeScript (Node.js 22) | Python 3.11 |
| **MCP SDK** | `@modelcontextprotocol/sdk` | `FastMCP` (mcp[cli]) |
| **Vector DB** | Qdrant (external) | ChromaDB (Docker) |
| **Embedding** | ใช้ RAG service ภายนอก | `intfloat/multilingual-e5-base` (ในตัว) |
| **CRM** | Odoo v17.0 (JSON-RPC) | ไม่มี |
| **Validation** | Zod v4 | ไม่มี (Python type hints) |

---

## 2. ขอบเขตกฎหมาย

| | `legal-service` | `legal-th` |
|---|---|---|
| **กฎหมาย** | พ.ร.บ.คุ้มครองแรงงาน เท่านั้น (6 มาตรา hardcode) | 3 ฉบับ: แรงงาน (17 มาตรา), PDPA (14), อาญา (26) |
| **จำนวนมาตรา** | ~6 มาตรา | **57 มาตรา** |
| **แหล่งข้อมูล** | Hardcode ใน `labor-law.ts` | ไฟล์ `.txt` ใน `laws/` (ingest เข้า vector DB) |
| **การค้นหา** | Keyword matching + RAG ภายนอก | **Semantic search** (cosine similarity) |

---

## 3. ฟีเจอร์

| ฟีเจอร์ | `legal-service` | `legal-th` |
|---|---|---|
| **MCP Tools** | 7 tools | 2 tools (`search_law`, `list_laws`) |
| **ค้นหากฎหมาย** | ✅ | ✅ |
| **คำนวณค่าชดเชย** | ✅ (อัตโนมัติ) | ❌ |
| **ประเมินค่าทนาย** | ✅ (`fee_estimate`) | ❌ |
| **Case Intake (CRM)** | ✅ (Odoo + fallback) | ❌ |
| **RAG Search** | ✅ (external service) | ✅ (built-in ChromaDB) |
| **RAG Ingest** | ✅ (via tool) | ✅ (via script) |
| **Skill Commands** | 6 commands | ❌ |
| **CLAUDE.md prompt** | ❌ | ✅ |

---

## 4. MCP Tools รายละเอียด

### `legal-service` (7 tools)

| Tool | Input | Purpose |
|------|-------|---------|
| `legal_search` | query, years_of_service? | ค้นหากฎหมายแรงงาน + คำนวณค่าชดเชย |
| `fee_estimate` | type, service | ประเมินค่าทนายความ |
| `case_intake` | name, phone, email, case_type, description | สร้าง lead ใน Odoo CRM |
| `list_leads` | — | ดูรายการ lead ทั้งหมด |
| `rag_search` | query, type?, top_k? | Semantic search คำพิพากษา/บทความ |
| `rag_ingest` | content, source, type, ... | เพิ่มเอกสารเข้า vector DB |
| `rag_status` | — | ตรวจสอบสถานะ RAG service |

### `legal-th` (2 tools)

| Tool | Input | Purpose |
|------|-------|---------|
| `search_law` | query, n_results=5 | Semantic search มาตรากฎหมาย |
| `list_laws` | — | แสดงรายการกฎหมายทั้งหมด + จำนวนมาตรา |

---

## 5. Skill Commands (`legal-service` เท่านั้น)

| Command | Auto-trigger | Purpose |
|---------|-------------|---------|
| `/legal-consult` | ✅ | วิเคราะห์ปัญหา → ค้นหากฎหมาย → ประเมินค่าใช้จ่าย |
| `/legal-calculate` | ✅ | คำนวณค่าชดเชย, ค่าบอกกล่าว, ค่าล่วงเวลา |
| `/legal-compare` | ✅ | เปรียบเทียบ settlement vs litigation |
| `/legal-intake` | ❌ | รวบรวมข้อมูลลูกค้า สร้าง lead ใน CRM |
| `/legal-draft` | ❌ | ร่างหนังสือทวงถาม, คำฟ้อง, สัญญา |
| `/legal-status` | ❌ | ดูสถานะ case ใน CRM |

---

## 6. สถาปัตยกรรม

| | `legal-service` | `legal-th` |
|---|---|---|
| **Transport** | Stdio + HTTP (port 3001) | HTTP only (port 8200) |
| **Docker services** | 6 services | 3 services |
| **Fallback strategy** | ✅ ทุก service มี fallback (in-memory) | ❌ ต้องมี ChromaDB |
| **Plugin marketplace** | ✅ (`plugin.json`, `marketplace.json`) | ❌ |
| **Embedding model** | อยู่ใน RAG service แยก | โหลดในตัว MCP server (~1.1 GB) |

### Docker Services

**`legal-service`** (6 services):
- `legal-mcp` — MCP server (stdio)
- `legal-mcp-http` — MCP server (HTTP, port 3001)
- `rag-legal` — RAG service (port 8080)
- `qdrant` — Vector DB (port 6333)
- `odoo` — CRM (port 8069)
- `odoo-db` — PostgreSQL 16

**`legal-th`** (3 services):
- `chromadb` — Vector DB (port 8100)
- `app` — Ingest container (one-time)
- `mcp-server` — MCP HTTP server (port 8200)

---

## 7. Data Models

### `legal-service`

```typescript
// กฎหมาย (hardcode)
interface LawSection {
  act: string;           // "พ.ร.บ.คุ้มครองแรงงาน พ.ศ. 2541"
  section: number;
  title: string;
  summary: string;
  details: string;
  keywords: string[];
  compensation?: CompensationTable[];
}

// Case Intake (Odoo CRM)
interface CaseIntake {
  id: string;            // "ODOO-{id}" หรือ "LEAD-xxx"
  name: string;
  phone?: string;
  email?: string;
  caseType: "labor" | "contract" | "criminal" | "other";
  description: string;
  status: "new" | "contacted" | "qualified" | "converted";
  source: "odoo" | "fallback";
}

// ค่าทนาย
interface ServiceFee {
  service: string;
  priceRange: { min: number; max: number };
  unit: string;          // "ครั้ง", "ฉบับ", "เคส"
  description: string;
}
```

### `legal-th`

```python
# ChromaDB Document
{
    "id": "law_0",
    "embedding": [...768 dims],
    "document": "มาตรา 118: เมื่อนายจ้างเลิกจ้าง...",
    "metadata": {
        "law_name": "พ.ร.บ.คุ้มครองแรงงาน พ.ศ. 2541",
        "section": "มาตรา 118"
    }
}
```

---

## 8. Configuration

### `legal-service`

```env
# Odoo CRM
ODOO_URL=http://odoo:8069
ODOO_DB=legal_th
ODOO_USER=admin
ODOO_PASS=admin

# RAG Service
RAG_URL=http://rag-legal:8080
RAG_API_KEY=
```

### `legal-th`

```env
HF_TOKEN=<huggingface_token>
```

```json
// .mcp.json
{
  "mcpServers": {
    "legal-th": {
      "type": "http",
      "url": "http://localhost:8200/mcp"
    }
  }
}
```

---

## 9. สรุปจุดเด่นแต่ละ Repo

### `legal-service` (POC)

**จุดเด่น:**
- ฟีเจอร์ครบกว่ามาก (7 tools, 6 skills, CRM, fee calculator)
- มี fallback architecture ที่ดี — ทำงานได้แม้ external service ล่ม
- พร้อมสำหรับ Claude Marketplace (มี plugin.json, marketplace.json)
- รองรับ 2 transport modes (stdio + HTTP)

**จุดด้อย:**
- ข้อมูลกฎหมายน้อย (6 มาตรา hardcode)
- ต้องพึ่ง external RAG service สำหรับ semantic search
- Docker setup ซับซ้อน (6 services)

### `legal-th` (Assistant)

**จุดเด่น:**
- ข้อมูลกฎหมายเยอะกว่ามาก (57 มาตรา, 3 ฉบับ)
- Semantic search ในตัว (ไม่ต้องพึ่ง service ภายนอก)
- สถาปัตยกรรมเรียบง่าย (3 Docker services)
- มี CLAUDE.md สำหรับ guide การตอบคำถาม
- เพิ่มกฎหมายใหม่ได้ง่าย (แค่เพิ่มไฟล์ .txt แล้ว re-ingest)

**จุดด้อย:**
- ฟีเจอร์น้อย (แค่ search กับ list)
- ไม่มี CRM, fee calculator, skill commands
- ไม่มี fallback — ต้องมี ChromaDB เสมอ
- Embedding model โหลดในตัว (~1.1 GB RAM)

---

## 10. ข้อเสนอแนะ: การรวม 2 Repos

หากต้องการรวม 2 repo เข้าด้วยกัน ควรพิจารณา:

1. **ฐานข้อมูลกฎหมาย** — ใช้แนวทาง `legal-th` (ไฟล์ .txt + ingest pipeline) แทน hardcode เพื่อรองรับกฎหมายจำนวนมาก
2. **Semantic Search** — ใช้ ChromaDB + `multilingual-e5-base` จาก `legal-th` แทน external RAG service เพื่อลด dependency
3. **Business Logic** — นำฟีเจอร์จาก `legal-service` มาเพิ่ม (คำนวณค่าชดเชย, ประเมินค่าทนาย, CRM integration)
4. **Skill Commands** — นำ 6 skill commands จาก `legal-service` มาใช้เพื่อ UX ที่ดี
5. **Fallback Architecture** — นำแนวคิด fallback จาก `legal-service` มาใช้กับ ChromaDB
6. **CLAUDE.md** — นำ system prompt จาก `legal-th` มาใช้เพื่อควบคุมคุณภาพการตอบ
