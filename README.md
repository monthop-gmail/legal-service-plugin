# ⚖️ Legal-TH MCP Plugin

Thai Legal Assistant — MCP Plugin สำหรับ Claude Marketplace

ปรึกษากฎหมายไทยเบื้องต้น ค้นหามาตรา คำนวณค่าชดเชย ประเมินค่าบริการ และนัดหมายทนายความ ผ่าน Claude Code / Claude Desktop

## Demo Flow

```
ผู้ใช้: "ถูกเลิกจ้างไม่เป็นธรรม ทำงานมา 5 ปี"

Claude → legal_search("เลิกจ้างไม่เป็นธรรม", years=5)
       → พ.ร.บ.คุ้มครองแรงงาน ม.118, 119 + ค่าชดเชย 180 วัน

Claude → fee_estimate("labor", "consultation")
       → 1,500-3,000 บาท/ครั้ง

Claude → case_intake({name: "...", type: "labor"})
       → สร้าง Lead ใน Odoo CRM

Claude ตอบกลับ:
  "ตามมาตรา 118 ทำงาน 5 ปี มีสิทธิ์ได้ค่าชดเชย 180 วัน..."
  + นัดพบทนาย / ดูค่าบริการ
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
# ปรึกษาเบื้องต้น (Claude จะเรียก legal_search + fee_estimate ให้)
/legal-consult ถูกเลิกจ้างไม่เป็นธรรม ทำงานมา 5 ปี เงินเดือน 25,000

# คำนวณสิทธิ์ค่าชดเชย
/legal-calculate อายุงาน 5 ปี เงินเดือน 25,000

# เปรียบเทียบทางเลือก
/legal-compare ถูกเลิกจ้าง ควรเจรจาหรือฟ้องศาลดี

# ร่างหนังสือทวงถาม
/legal-draft ทวงถาม ค่าชดเชย 150,000 บาท จากบริษัท ABC

# ส่งเรื่องให้ทนาย
/legal-intake สมชาย ใจดี แรงงาน ถูกเลิกจ้างไม่มีเหตุผล

# ดูสถานะเรื่อง
/legal-status
```

## MCP Tools

| Tool | คำอธิบาย |
|------|---------|
| `legal_search` | ค้นหากฎหมายไทย + คำนวณค่าชดเชยอัตโนมัติ |
| `fee_estimate` | ประเมินค่าบริการทนาย (labor / contract / criminal) |
| `case_intake` | สร้าง Lead → Odoo CRM |
| `list_leads` | ดู Lead ทั้งหมด (admin) |

### Skills + MCP Flow

```
ผู้ใช้: /legal-consult ถูกเลิกจ้าง ทำงาน 5 ปี
        │
        ▼
┌─ Skill: legal-consult ────────────────┐
│  1. วิเคราะห์ → ประเภท: แรงงาน        │
│  2. MCP: legal_search(เลิกจ้าง, 5ปี)  │
│  3. MCP: fee_estimate(labor, consult)  │
│  4. ตอบกลับ: มาตรา + ค่าชดเชย + ราคา  │
└───────────────────────────────────────┘
        │
        ▼
ผู้ใช้: อยากส่งเรื่องให้ทนาย
        │
        ▼
/legal-intake → MCP: case_intake → Lead ใน Odoo
```

## Quick Start

### Prerequisites

- Docker & Docker Compose

### Run

```bash
# Core services (MCP stdio + HTTP/SSE)
docker compose up -d

# พร้อม Odoo CRM
docker compose --profile with-odoo up -d
```

### Health Check

```bash
curl http://localhost:3001/health
# {"status":"ok","service":"legal-th-mcp","version":"0.1.0"}
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
│  ├─ legal_search   → ฐานข้อมูลกฎหมาย             │
│  ├─ fee_estimate   → ตารางค่าบริการ               │
│  ├─ case_intake    → Odoo CRM                    │
│  └─ list_leads     → Odoo CRM                   │
└──────────┬───────────────────────────────────────┘
           │ (optional)
┌──────────▼───────────────────────────────────────┐
│  Odoo 17          :8069                          │
│  └─ PostgreSQL    (internal)                     │
└──────────────────────────────────────────────────┘
```

## Docker Services

| Service | Container | Port | Profile |
|---------|-----------|------|---------|
| `legal-mcp` | `legal-th-mcp` | — | default |
| `legal-mcp-http` | `legal-th-mcp-http` | 3001 | default |
| `odoo` | `legal-th-odoo` | 8069 | `with-odoo` |
| `odoo-db` | `legal-th-postgres` | — | `with-odoo` |

## Legal Database (PoC)

ฐานข้อมูลปัจจุบันครอบคลุม:

- **พ.ร.บ.คุ้มครองแรงงาน พ.ศ. 2541** — ม.17, 67, 76, 118, 119
- **พ.ร.บ.จัดตั้งศาลแรงงานฯ พ.ศ. 2522** — ม.49

Fee schedules: แรงงาน / สัญญา / อาญา (consultation, letter, negotiation, litigation, draft, bail)

## Development

```bash
npm install
npm run build      # compile TypeScript
npm start          # run MCP server (stdio)
npm run dev        # watch mode
```

## Roadmap

- [x] Streamable HTTP transport (MCP 2025-03-26)
- [x] Skill commands (6 slash commands)
- [ ] เพิ่มกฎหมายแพ่ง / อาญา / ที่ดิน / ครอบครัว
- [ ] เชื่อมต่อ Odoo CRM จริง (XML-RPC)
- [ ] RAG search จากฐานข้อมูลคำพิพากษา
- [ ] Marketplace pricing & billing integration

## License

MIT
