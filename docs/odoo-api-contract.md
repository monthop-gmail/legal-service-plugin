# Odoo CRM API Contract

API ที่ legal-th MCP plugin ใช้เรียก Odoo CRM — ใช้ Odoo JSON-RPC standard

## Connection

```env
ODOO_URL=http://odoo:8069       # Docker network
ODOO_URL=http://localhost:8069  # Local dev
ODOO_DB=legal_th
ODOO_USER=admin
ODOO_PASS=admin
```

## Transport: JSON-RPC 2.0

ทุก request ใช้ `POST` + `Content-Type: application/json`

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "call",
  "params": { ... }
}
```

---

## POST /web/session/authenticate

Authenticate + get session

### Request

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "call",
  "params": {
    "db": "legal_th",
    "login": "admin",
    "password": "admin"
  }
}
```

### Response

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "uid": 2,
    "session_id": "abc123..."
  }
}
```

---

## POST /web/dataset/call_kw

Call any Odoo model method

### Create Lead (crm.lead → create)

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "call",
  "params": {
    "model": "crm.lead",
    "method": "create",
    "args": [{
      "name": "[labor] สมชาย ใจดี",
      "contact_name": "สมชาย ใจดี",
      "phone": "081-234-5678",
      "email_from": "somchai@example.com",
      "description": "ถูกเลิกจ้างไม่เป็นธรรม ทำงานมา 5 ปี",
      "expected_revenue": 3000
    }],
    "kwargs": {
      "context": { "lang": "th_TH" }
    }
  }
}
```

**Response:** `{ "result": 42 }` (Odoo record ID)

### Search Leads (crm.lead → search)

```json
{
  "params": {
    "model": "crm.lead",
    "method": "search",
    "args": [[]],
    "kwargs": { "limit": 50 }
  }
}
```

**Response:** `{ "result": [1, 2, 3, 42] }` (array of IDs)

### Read Leads (crm.lead → read)

```json
{
  "params": {
    "model": "crm.lead",
    "method": "read",
    "args": [[1, 2, 3, 42]],
    "kwargs": {
      "fields": ["id", "name", "contact_name", "phone", "email_from", "description", "stage_id", "create_date"]
    }
  }
}
```

**Response:**

```json
{
  "result": [
    {
      "id": 42,
      "name": "[labor] สมชาย ใจดี",
      "contact_name": "สมชาย ใจดี",
      "phone": "081-234-5678",
      "email_from": "somchai@example.com",
      "description": "ถูกเลิกจ้างไม่เป็นธรรม ทำงานมา 5 ปี",
      "stage_id": [1, "ใหม่"],
      "create_date": "2026-03-10 06:45:00"
    }
  ]
}
```

---

## CRM Lead Field Mapping

| MCP Field | Odoo Field | Type | Description |
|-----------|-----------|------|-------------|
| name | contact_name | string | ชื่อลูกค้า |
| — | name | string | `[caseType] name` (display) |
| phone | phone | string | เบอร์โทร |
| email | email_from | string | อีเมล |
| description | description | text | รายละเอียดคดี |
| estimatedFee | expected_revenue | float | ค่าบริการโดยประมาณ |
| caseType | — | — | extracted from name `[type]` |
| status | stage_id | [id, name] | mapping ด้านล่าง |

### Stage Mapping

| Odoo Stage | MCP Status | ความหมาย |
|-----------|-----------|---------|
| ใหม่ / New | `new` | เรื่องใหม่ |
| ติดต่อแล้ว / Contacted | `contacted` | ทนายติดต่อลูกค้าแล้ว |
| ประเมินแล้ว / Qualified | `qualified` | ประเมินคดีแล้ว |
| รับเรื่อง / Won | `converted` | รับเป็นลูกความ |

---

## Fallback Behavior

เมื่อ Odoo ไม่พร้อม:

| Operation | Fallback | Lead ID format |
|-----------|----------|---------------|
| createLead | in-memory store | `LEAD-xxx` |
| getLeads | return in-memory only | — |
| getLeadById | search in-memory | — |

เมื่อ Odoo พร้อม → Lead ID format: `ODOO-{id}`

---

## Odoo Setup Requirements

Odoo instance ต้องมี:

1. **Module:** `crm` (CRM/Sales — built-in)
2. **User:** API user with access to `crm.lead`
3. **Language:** Thai (`th_TH`) installed (optional แต่แนะนำ)
4. **Stages:** อย่างน้อย 4 stages: ใหม่ → ติดต่อแล้ว → ประเมินแล้ว → รับเรื่อง
