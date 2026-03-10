# Legal-TH MCP Plugin

> **Repo:** [github.com/monthop-gmail/legal-service-plugin](https://github.com/monthop-gmail/legal-service-plugin)

Thai Legal Assistant — MCP Plugin สำหรับ Claude Marketplace

ปรึกษากฎหมายไทยเบื้องต้น ค้นหามาตรา คำนวณค่าชดเชย ประเมินค่าบริการ นัดหมายทนายความ และค้นหาคำพิพากษาด้วย Semantic Search (ChromaDB) ผ่าน Claude Code / Claude Desktop

## Demo Flow

```
ผู้ใช้: "ถูกเลิกจ้างไม่เป็นธรรม ทำงานมา 5 ปี"

Claude → legal_search("เลิกจ้างไม่เป็นธรรม", years=5)
       → พ.ร.บ.คุ้มครองแรงงาน ม.118, 119 + ค่าชดเชย 180 วัน

Claude → rag_search("เลิกจ้างไม่เป็นธรรม ทำงาน 5 ปี")
       → Semantic search จาก ChromaDB (57 มาตรา, 3 ฉบับกฎหมาย)

Claude → fee_estimate("labor", "consultation")
       → 1,500-3,000 บาท/ครั้ง

Claude → case_intake({name: "...", type: "labor"})
       → สร้าง Lead ใน Odoo CRM

Claude ตอบกลับ:
  "ตามมาตรา 118 ทำงาน 5 ปี มีสิทธิ์ได้ค่าชดเชย 180 วัน..."
  + มาตราที่เกี่ยวข้องจาก PDPA / อาญา + นัดพบทนาย / ดูค่าบริการ
```

## Skill Commands (Slash Commands)

| Command | Auto? | คำอธิบาย |
|---------|-------|---------|
| `/legal-consult` | Auto | ปรึกษากฎหมายเบื้องต้น — วิเคราะห์ปัญหา ค้นหามาตรา แนะนำทางเลือก |
| `/legal-calculate` | Auto | คำนวณค่าชดเชย สินจ้าง ค่าล่วงเวลา สิทธิประโยชน์แรงงาน |
| `/legal-compare` | Auto | เปรียบเทียบทางเลือก (เจรจา vs ร้องเรียน vs ฟ้องศาล) |
| `/legal-intake` | Manual | นัดหมายทนาย / ส่งเรื่องเข้า CRM (ต้องเรียกเอง) |
| `/legal-draft` | Manual | ร่างหนังสือทวงถาม ร้องเรียน บันทึกข้อตกลง |
| `/legal-status` | Manual | ดูสถานะเรื่อง / Lead (admin) |

> **Auto** = Claude เรียกใช้เองอัตโนมัติเมื่อเห็นว่าเกี่ยวข้อง / **Manual** = ต้องพิมพ์ `/command` เอง

### ตัวอย่างการใช้

```bash
/legal-consult ถูกเลิกจ้างไม่เป็นธรรม ทำงานมา 5 ปี เงินเดือน 25,000
/legal-calculate อายุงาน 5 ปี เงินเดือน 25,000
/legal-compare ถูกเลิกจ้าง ควรเจรจาหรือฟ้องศาลดี
/legal-draft ทวงถาม ค่าชดเชย 150,000 บาท จากบริษัท ABC
/legal-intake สมชาย ใจดี แรงงาน ถูกเลิกจ้างไม่มีเหตุผล
/legal-status
```

## MCP Tools

| Tool | หมวด | คำอธิบาย |
|------|------|---------|
| `legal_search` | Static | ค้นหากฎหมายแรงงาน + คำนวณค่าชดเชยอัตโนมัติ |
| `fee_estimate` | Static | ประเมินค่าบริการทนาย (labor / contract / criminal) |
| `case_intake` | Odoo | สร้าง Lead → Odoo CRM (fallback: in-memory) |
| `list_leads` | Odoo | ดู Lead ทั้งหมด (admin) |
| `rag_search` | RAG | Semantic search — กฎหมาย 57 มาตรา (ChromaDB + multilingual-e5) |
| `rag_ingest` | RAG | เพิ่มเอกสารเข้า ChromaDB (admin) |
| `rag_status` | RAG | ตรวจสอบสถานะ RAG service |

### Skills + MCP Flow

```
ผู้ใช้: /legal-consult ถูกเลิกจ้าง ทำงาน 5 ปี
        │
        ▼
┌─ Skill: legal-consult ──────────────────────┐
│  1. วิเคราะห์ → ประเภท: แรงงาน               │
│  2. MCP: legal_search(เลิกจ้าง, 5ปี)         │
│  3. MCP: rag_search(เลิกจ้าง)                │
│  4. MCP: fee_estimate(labor, consult)         │
│  5. ตอบกลับ: มาตรา + ผลค้นหา + ราคา           │
└──────────────────────────────────────────────┘
        │
        ▼
ผู้ใช้: อยากส่งเรื่องให้ทนาย
        │
        ▼
/legal-intake → MCP: case_intake → Lead ใน Odoo
```

## Install as Claude Code Plugin

### Step 1: Add marketplace

```bash
/plugin marketplace add monthop-gmail/legal-service-plugin
```

### Step 2: Install plugin

```bash
/plugin install legal-th@monthop-gmail-legal-service-plugin
```

### Step 3: Start Docker services

```bash
git clone https://github.com/monthop-gmail/legal-service-plugin.git
cd legal-service-plugin

# Ingest กฎหมาย 57 มาตรา เข้า ChromaDB (ครั้งแรก)
docker compose up chromadb ingest

# Start ทุก service
docker compose up -d
```

เสร็จ! ใช้ `/legal-consult` หรือถามคำถามกฎหมายไทยได้เลย

> **Dev mode**: ทดสอบ plugin จาก local directory
> ```bash
> claude --plugin-dir ./legal-service-plugin
> ```

---

## Quick Start (Docker Only)

### Prerequisites

- Docker & Docker Compose

### Run

```bash
# 1. Ingest กฎหมายเข้า ChromaDB (ครั้งแรก)
docker compose up chromadb ingest

# 2. Start core services (ChromaDB + RAG + MCP)
docker compose up -d

# 3. (Optional) + Odoo CRM
docker compose --profile with-odoo up -d
```

### Environment Variables

คัดลอก `.env.example` → `.env` แล้วแก้ค่าตามต้องการ:

```bash
cp .env.example .env
```

```env
# Hugging Face (for embedding model)
HF_TOKEN=

# Odoo CRM (optional — use with-odoo profile)
ODOO_URL=http://odoo:8069
ODOO_DB=legal_th
ODOO_USER=admin
ODOO_PASS=admin
```

### Health Check

```bash
# MCP Server
curl http://localhost:3001/health
# {"status":"ok","service":"legal-th-mcp","version":"0.1.0","transport":"streamable-http"}

# RAG Service
curl http://localhost:8080/api/health
# {"status":"ok","collections":["thai_laws"],"total_documents":57}
```

## Connect to Claude

### Streamable HTTP (recommended)

เพิ่มใน `~/.claude/settings.json` หรือ `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "legal-th": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

### stdio (alternative)

```json
{
  "mcpServers": {
    "legal-th": {
      "command": "docker",
      "args": ["exec", "-i", "legal-th-mcp", "node", "dist/index.js"]
    }
  }
}
```

### SSE (legacy fallback)

```json
{
  "mcpServers": {
    "legal-th": {
      "url": "http://localhost:3001/sse"
    }
  }
}
```

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Claude Code / Claude Desktop                    │
│  ผู้ใช้: /legal-consult ถูกเลิกจ้าง 5 ปี           │
└──────────┬───────────────────────────────────────┘
           │
┌──────────▼───────────────────────────────────────┐
│  Skills Layer (skills/)                          │
│  ├─ /legal-consult   → ปรึกษากฎหมาย (auto)       │
│  ├─ /legal-calculate → คำนวณค่าชดเชย (auto)      │
│  ├─ /legal-compare   → เปรียบเทียบทางเลือก (auto) │
│  ├─ /legal-intake    → นัดหมายทนาย (manual)      │
│  ├─ /legal-draft     → ร่างหนังสือ (manual)       │
│  └─ /legal-status    → ดูสถานะ (manual)          │
└──────────┬───────────────────────────────────────┘
           │ MCP (Streamable HTTP / stdio / SSE)
┌──────────▼───────────────────────────────────────┐
│  legal-th-mcp          :3001                     │
│  ├─ /mcp     → Streamable HTTP (primary)         │
│  ├─ /sse     → SSE fallback (legacy)             │
│  ├─ /health  → Health check                      │
│  │                                               │
│  Tools (7):                                      │
│  ├─ legal_search   → ฐานข้อมูลกฎหมาย (built-in)  │
│  ├─ fee_estimate   → ตารางค่าบริการ (built-in)    │
│  ├─ case_intake  ──┤                             │
│  ├─ list_leads   ──┘→ Odoo CRM (external)        │
│  ├─ rag_search   ──┤                             │
│  ├─ rag_ingest   ──┤→ RAG API (built-in)         │
│  └─ rag_status   ──┘                             │
└──────┬──────────────────┬────────────────────────┘
       │                  │
┌──────▼──────┐    ┌──────▼───────────────────┐
│ Odoo CRM    │    │ RAG Service (built-in)   │
│ :8069 (opt) │    │ :8080                    │
│ JSON-RPC    │    │ REST API (Python)        │
│ ┌─────────┐ │    │ ┌───────────┐ ┌────────┐ │
│ │ crm.lead│ │    │ │ ChromaDB  │ │ e5-base│ │
│ └─────────┘ │    │ │ :8100     │ │ embed  │ │
└─────────────┘    │ └───────────┘ └────────┘ │
                   └──────────────────────────┘
                          ▲
                   ┌──────┘
                   │ Ingest Pipeline
            ┌──────┴──────────────┐
            │ laws/*.txt (57 มาตรา)│
            │ ├─ แรงงาน    (17)    │
            │ ├─ PDPA      (14)    │
            │ └─ อาญา      (26)    │
            └─────────────────────┘
```

## External Services

Odoo CRM มี **graceful fallback** — plugin ทำงานได้แม้ไม่เปิด

| Service | พร้อม | ไม่พร้อม (fallback) |
|---------|-------|-------------------|
| **Odoo CRM** | Lead → Odoo (`ODOO-{id}`) | Lead → in-memory (`LEAD-xxx`) |
| **RAG** | Semantic search (ChromaDB) | error + แนะนำใช้ `legal_search` |

### API Contracts

- [`docs/odoo-api-contract.md`](docs/odoo-api-contract.md) — Odoo JSON-RPC spec
- [`docs/rag-api-contract.md`](docs/rag-api-contract.md) — RAG REST API spec (ChromaDB)

## Docker Services

| Service | Container | Port | Profile | คำอธิบาย |
|---------|-----------|------|---------|---------|
| `chromadb` | `legal-th-chromadb` | 8100 | default | ChromaDB vector database |
| `ingest` | `legal-th-ingest` | — | default | Ingest กฎหมาย 57 มาตรา (run once) |
| `rag-legal` | `legal-th-rag` | 8080 | default | RAG API (Python + multilingual-e5) |
| `legal-mcp` | `legal-th-mcp` | — | default | MCP server (stdio) |
| `legal-mcp-http` | `legal-th-mcp-http` | 3001 | default | MCP server (Streamable HTTP + SSE) |
| `odoo` | `legal-th-odoo` | 8069 | `with-odoo` | Odoo CRM |
| `odoo-db` | `legal-th-postgres` | — | `with-odoo` | PostgreSQL for Odoo |

## Legal Database

### Built-in Knowledge Base (labor-law.ts)

ฐานข้อมูล keyword search สำหรับ `legal_search` tool:

- **พ.ร.บ.คุ้มครองแรงงาน พ.ศ. 2541** — ม.17, 67, 76, 118, 119
- **พ.ร.บ.จัดตั้งศาลแรงงานฯ พ.ศ. 2522** — ม.49
- **ตารางค่าบริการ** — แรงงาน / สัญญา / อาญา

### Semantic Search (ChromaDB — 57 มาตรา)

ฐานข้อมูล semantic search สำหรับ `rag_search` tool:

| กฎหมาย | จำนวนมาตรา | ไฟล์ |
|--------|-----------|------|
| พ.ร.บ.คุ้มครองแรงงาน พ.ศ. 2541 | 17 | `laws/labor_protection_2541.txt` |
| พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA) พ.ศ. 2562 | 14 | `laws/pdpa_2562.txt` |
| ประมวลกฎหมายอาญา | 26 | `laws/criminal_code_common.txt` |

**เพิ่มกฎหมายใหม่:** เพิ่มไฟล์ `.txt` ใน `laws/` → แก้ `LAW_NAMES` ใน `scripts/ingest_laws.py` → run `docker compose up ingest`

### Embedding Model

- **Model:** `intfloat/multilingual-e5-base` (768 dims)
- **Prefix:** `"passage: "` สำหรับ documents, `"query: "` สำหรับ queries
- **Distance:** Cosine similarity

## Project Structure

```
legal-service/
├── CLAUDE.md                       # System prompt (Thai Legal Assistant)
├── .mcp.json                       # MCP server config (auto-discovered)
├── .claude-plugin/
│   ├── plugin.json                 # Plugin manifest
│   └── marketplace.json            # Marketplace listing
├── skills/                         # Skill commands (6 slash commands)
│   ├── legal-consult/SKILL.md
│   ├── legal-calculate/SKILL.md
│   ├── legal-compare/SKILL.md
│   ├── legal-intake/SKILL.md
│   ├── legal-draft/SKILL.md
│   └── legal-status/SKILL.md
├── src/                            # TypeScript MCP server
│   ├── index.ts                    # MCP server (stdio transport)
│   ├── http-server.ts              # MCP server (Streamable HTTP + SSE)
│   ├── data/
│   │   └── labor-law.ts            # Thai labor law knowledge base
│   └── services/
│       ├── odoo.ts                 # Odoo CRM client (JSON-RPC + fallback)
│       └── rag.ts                  # RAG API client (REST)
├── laws/                           # Thai law text files (57 มาตรา)
│   ├── labor_protection_2541.txt   # พ.ร.บ.คุ้มครองแรงงาน (17 มาตรา)
│   ├── pdpa_2562.txt               # PDPA (14 มาตรา)
│   └── criminal_code_common.txt    # ประมวลกฎหมายอาญา (26 มาตรา)
├── scripts/                        # Python scripts for RAG pipeline
│   ├── ingest_laws.py              # Ingest laws → ChromaDB (run once)
│   ├── rag_api.py                  # RAG REST API (wraps ChromaDB)
│   └── requirements.txt            # Python dependencies
├── docs/
│   ├── odoo-api-contract.md        # Odoo integration spec
│   └── rag-api-contract.md         # RAG API spec (ChromaDB)
├── docker-compose.yml              # 7 services (5 default + 2 optional)
├── Dockerfile                      # Node.js MCP server
├── Dockerfile.ingest               # Python ingest container
├── Dockerfile.rag                  # Python RAG API container
├── marketplace-manifest.json       # Claude Marketplace manifest
├── claude-mcp-config.json          # MCP connection config examples
└── .env.example
```

## Development

```bash
npm install
npm run build      # compile TypeScript
npm start          # run MCP server (stdio)
npm run dev        # watch mode
```

## Roadmap

- [x] MCP server with Streamable HTTP transport (MCP 2025-03-26)
- [x] Skill commands (6 slash commands)
- [x] RAG MCP tools (external service pattern)
- [x] Odoo CRM client (JSON-RPC + graceful fallback)
- [x] Built-in semantic search (ChromaDB + multilingual-e5-base)
- [x] ฐานข้อมูลกฎหมาย 57 มาตรา (แรงงาน / PDPA / อาญา)
- [x] CLAUDE.md system prompt
- [ ] เพิ่มกฎหมายแพ่ง / ที่ดิน / ครอบครัว / คอมพิวเตอร์
- [ ] Marketplace pricing & billing integration

## License

MIT
