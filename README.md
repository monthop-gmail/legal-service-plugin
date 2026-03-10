# ⚖️ Legal-TH MCP Plugin

Thai Legal Assistant — MCP Plugin สำหรับ Claude Marketplace

ปรึกษากฎหมายไทยเบื้องต้น ค้นหามาตรา คำนวณค่าชดเชย ประเมินค่าบริการ นัดหมายทนายความ และค้นหาคำพิพากษาด้วย RAG ผ่าน Claude Code / Claude Desktop

## Demo Flow

```
ผู้ใช้: "ถูกเลิกจ้างไม่เป็นธรรม ทำงานมา 5 ปี"

Claude → legal_search("เลิกจ้างไม่เป็นธรรม", years=5)
       → พ.ร.บ.คุ้มครองแรงงาน ม.118, 119 + ค่าชดเชย 180 วัน

Claude → rag_search("เลิกจ้างไม่เป็นธรรม ทำงาน 5 ปี")
       → คำพิพากษาศาลฎีกาที่เกี่ยวข้อง

Claude → fee_estimate("labor", "consultation")
       → 1,500-3,000 บาท/ครั้ง

Claude → case_intake({name: "...", type: "labor"})
       → สร้าง Lead ใน Odoo CRM

Claude ตอบกลับ:
  "ตามมาตรา 118 ทำงาน 5 ปี มีสิทธิ์ได้ค่าชดเชย 180 วัน..."
  + คำพิพากษาที่คล้ายกัน + นัดพบทนาย / ดูค่าบริการ
```

## Skill Commands (Slash Commands)

| Command | Auto? | คำอธิบาย |
|---------|-------|---------|
| `/legal-consult` | ✅ | ปรึกษากฎหมายเบื้องต้น — วิเคราะห์ปัญหา ค้นหามาตรา แนะนำทางเลือก |
| `/legal-calculate` | ✅ | คำนวณค่าชดเชย สินจ้าง ค่าล่วงเวลา สิทธิประโยชน์แรงงาน |
| `/legal-compare` | ✅ | เปรียบเทียบทางเลือก (เจรจา vs ร้องเรียน vs ฟ้องศาล) |
| `/legal-intake` | ❌ | นัดหมายทนาย / ส่งเรื่องเข้า CRM (ต้องเรียกเอง) |
| `/legal-draft` | ❌ | ร่างหนังสือทวงถาม ร้องเรียน บันทึกข้อตกลง |
| `/legal-status` | ❌ | ดูสถานะเรื่อง / Lead (admin) |

> **Auto?** = Claude เรียกใช้เองอัตโนมัติเมื่อเห็นว่าเกี่ยวข้อง / ❌ = ต้องพิมพ์ `/command` เอง

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
| `legal_search` | Static | ค้นหากฎหมายไทย + คำนวณค่าชดเชยอัตโนมัติ |
| `fee_estimate` | Static | ประเมินค่าบริการทนาย (labor / contract / criminal) |
| `case_intake` | Odoo | สร้าง Lead → Odoo CRM (fallback: in-memory) |
| `list_leads` | Odoo | ดู Lead ทั้งหมด (admin) |
| `rag_search` | RAG | semantic search — กฎหมาย / คำพิพากษา / บทความ |
| `rag_ingest` | RAG | เพิ่มเอกสารเข้า vector DB (admin) |
| `rag_status` | RAG | ตรวจสอบสถานะ RAG service |

### Skills + MCP Flow

```
ผู้ใช้: /legal-consult ถูกเลิกจ้าง ทำงาน 5 ปี
        │
        ▼
┌─ Skill: legal-consult ──────────────────────┐
│  1. วิเคราะห์ → ประเภท: แรงงาน               │
│  2. MCP: legal_search(เลิกจ้าง, 5ปี)         │
│  3. MCP: rag_search(เลิกจ้าง, type=judgment)  │
│  4. MCP: fee_estimate(labor, consult)         │
│  5. ตอบกลับ: มาตรา + คำพิพากษา + ราคา         │
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
/plugin install legal-th@monthop-gmail-poc-legal-service
```

### Step 3: Start Docker services

```bash
git clone https://github.com/monthop-gmail/legal-service-plugin.git
cd poc-legal-service
docker compose up -d
```

เสร็จ! ใช้ `/legal-consult` หรือถามคำถามกฎหมายไทยได้เลย

> **Dev mode**: ทดสอบ plugin จาก local directory
> ```bash
> claude --plugin-dir ./poc-legal-service
> ```

---

## Quick Start (Docker Only)

### Prerequisites

- Docker & Docker Compose

### Run

```bash
# Core เท่านั้น (Odoo & RAG ใช้ fallback)
docker compose up -d

# + Odoo CRM
docker compose --profile with-odoo up -d

# + RAG (Qdrant + RAG service)
docker compose --profile with-rag up -d

# ทุก service
docker compose --profile with-odoo --profile with-rag up -d
```

### Environment Variables

คัดลอก `.env.example` → `.env` แล้วแก้ค่าตามต้องการ:

```bash
cp .env.example .env
```

```env
# Odoo CRM (external)
ODOO_URL=http://odoo:8069
ODOO_DB=legal_th
ODOO_USER=admin
ODOO_PASS=admin

# RAG Service (external)
RAG_URL=http://rag-legal:8080
RAG_API_KEY=
```

### Health Check

```bash
curl http://localhost:3001/health
# {"status":"ok","service":"legal-th-mcp","version":"0.1.0","transport":"streamable-http"}
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
│  Skills Layer (.claude/skills/)                  │
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
│  ├─ rag_ingest   ──┤→ RAG Service (external)     │
│  └─ rag_status   ──┘                             │
└──────┬──────────────────┬────────────────────────┘
       │                  │
┌──────▼──────┐    ┌──────▼───────┐
│ Odoo CRM    │    │ RAG Service  │
│ :8069 (ext) │    │ :8080 (ext)  │
│ JSON-RPC    │    │ REST API     │
│ ┌─────────┐ │    │ ┌──────────┐ │
│ │ crm.lead│ │    │ │ Qdrant   │ │
│ └─────────┘ │    │ │ :6333    │ │
└─────────────┘    │ └──────────┘ │
                   └──────────────┘
```

## External Services

ทุก service ภายนอกมี **graceful fallback** — plugin ทำงานได้แม้ไม่เปิด

| Service | พร้อม | ไม่พร้อม (fallback) |
|---------|-------|-------------------|
| **Odoo CRM** | Lead → Odoo (`ODOO-{id}`) | Lead → in-memory (`LEAD-xxx`) |
| **RAG** | semantic search results | error + แนะนำใช้ `legal_search` |

### API Contracts

- [`docs/odoo-api-contract.md`](docs/odoo-api-contract.md) — Odoo JSON-RPC spec
- [`docs/rag-api-contract.md`](docs/rag-api-contract.md) — RAG REST API spec

## Docker Services

| Service | Container | Port | Profile | คำอธิบาย |
|---------|-----------|------|---------|---------|
| `legal-mcp` | `legal-th-mcp` | — | default | MCP server (stdio) |
| `legal-mcp-http` | `legal-th-mcp-http` | 3001 | default | MCP server (Streamable HTTP + SSE) |
| `rag-legal` | `legal-th-rag` | 8080 | `with-rag` | RAG service (external image) |
| `qdrant` | `legal-th-qdrant` | 6333 | `with-rag` | Vector DB |
| `odoo` | `legal-th-odoo` | 8069 | `with-odoo` | Odoo CRM |
| `odoo-db` | `legal-th-postgres` | — | `with-odoo` | PostgreSQL for Odoo |

## Legal Database (PoC)

ฐานข้อมูล built-in ครอบคลุม:

- **พ.ร.บ.คุ้มครองแรงงาน พ.ศ. 2541** — ม.17, 67, 76, 118, 119
- **พ.ร.บ.จัดตั้งศาลแรงงานฯ พ.ศ. 2522** — ม.49

Fee schedules: แรงงาน / สัญญา / อาญา (consultation, letter, negotiation, litigation, draft, bail)

## Project Structure

```
legal-service/
├── .claude-plugin/
│   ├── plugin.json              # Plugin manifest
│   └── marketplace.json         # Marketplace listing
├── .mcp.json                    # MCP server config (auto-discovered)
├── skills/                      # Skill commands (6 slash commands)
│   ├── legal-consult/SKILL.md
│   ├── legal-calculate/SKILL.md
│   ├── legal-compare/SKILL.md
│   ├── legal-intake/SKILL.md
│   ├── legal-draft/SKILL.md
│   └── legal-status/SKILL.md
├── .claude/skills/              # Local dev copy (same skills)
├── src/
│   ├── index.ts                 # MCP server (stdio transport)
│   ├── http-server.ts           # MCP server (Streamable HTTP + SSE)
│   ├── data/
│   │   └── labor-law.ts         # Thai labor law knowledge base
│   └── services/
│       ├── odoo.ts              # Odoo CRM client (JSON-RPC + fallback)
│       └── rag.ts               # RAG service client (REST + fallback)
├── docs/
│   ├── odoo-api-contract.md     # Odoo integration spec
│   └── rag-api-contract.md      # RAG integration spec
├── docker-compose.yml
├── Dockerfile
├── marketplace-manifest.json    # Claude Marketplace manifest
├── claude-mcp-config.json       # MCP connection config examples
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
- [ ] เพิ่มกฎหมายแพ่ง / อาญา / ที่ดิน / ครอบครัว
- [ ] RAG service repo (Qdrant + multilingual embeddings)
- [ ] Marketplace pricing & billing integration

## License

MIT
