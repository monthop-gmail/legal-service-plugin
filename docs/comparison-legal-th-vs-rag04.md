# Legal-TH vs RAG-04-Claude — เปรียบเทียบสถาปัตยกรรม

## Overview

| | **Legal-TH** | **RAG-04-Claude** |
|---|---|---|
| **จุดประสงค์** | MCP Plugin เฉพาะกฎหมายไทย | General-purpose RAG template |
| **ภาษา** | TypeScript (MCP) + Python (RAG) | Python ทั้งหมด |
| **Framework** | MCP SDK + http.server | FastAPI + FastMCP |
| **Repo** | `legal-service-plugin` | `server-rag/templates/rag-04-claude` |

---

## สถาปัตยกรรม

### Legal-TH
```
Claude Code ──► MCP Server (Node.js :3001)
                  ├─ legal_search   (built-in)
                  ├─ fee_estimate   (built-in)
                  ├─ case_intake  ──► Odoo CRM (optional)
                  ├─ rag_search   ──┐
                  ├─ rag_ingest   ──┤► RAG API (Python :8080)
                  └─ rag_status   ──┘     └─► ChromaDB (:8100)
```

### RAG-04-Claude
```
Claude Code ──► MCP Server (FastMCP :8001)
                  ├─ rag_query      ──┐
                  ├─ rag_upload_text ──┤
                  ├─ rag_ingest_url ──┤► FastAPI (Python :8000)
                  ├─ rag_list_docs  ──┤     ├─ Voyage AI (embedding)
                  └─ rag_delete_doc ──┘     ├─ Claude API (generation)
                                            ├─ BM25 (keyword search)
                                            └─ ChromaDB (PersistentClient)
```

---

## เปรียบเทียบรายด้าน

### 1. MCP Transport & Tools

| | **Legal-TH** | **RAG-04-Claude** |
|---|---|---|
| Transport | Streamable HTTP + SSE + stdio | Streamable HTTP (FastMCP) |
| Port | 3001 (รวม API + MCP) | 8001 (MCP) + 8000 (API) |
| MCP SDK | `@modelcontextprotocol/sdk` (TS) | `fastmcp` (Python) |
| Tools | 6-7 (domain-specific) | 5 (generic RAG) |
| Skill Commands | 6 slash commands | ไม่มี |

**Tools เปรียบเทียบ:**

| Legal-TH | RAG-04-Claude | หมายเหตุ |
|----------|--------------|----------|
| `legal_search` | — | เฉพาะกฎหมายไทย + คำนวณค่าชดเชย |
| `fee_estimate` | — | ประเมินค่าทนาย |
| `case_intake` | — | สร้าง Lead → Odoo CRM |
| `list_leads` (stdio) | — | ดู Lead ทั้งหมด |
| `rag_search` | `rag_query` | Legal-TH = search only, RAG-04 = search + LLM answer |
| `rag_ingest` | `rag_upload_text` | คล้ายกัน |
| — | `rag_ingest_url` | Legal-TH ไม่มี URL ingestion |
| `rag_status` | `rag_list_documents` | RAG-04 แสดง per-document detail |
| — | `rag_delete_document` | Legal-TH ไม่มี delete |

---

### 2. Embedding & Vector Search

| | **Legal-TH** | **RAG-04-Claude** |
|---|---|---|
| Model | `multilingual-e5-base` | `voyage-3` (Voyage AI) |
| Dimensions | 768 | 1024 |
| Run mode | **Local** (ฟรี) | **API** (เสียเงิน) |
| Thai support | ดี (multilingual) | ดี (multilingual) |
| Query prefix | `"query: {text}"` | `input_type="query"` |
| Doc prefix | `"passage: {text}"` | default |
| Batch size | ~50 chunks | 100 chunks |

**ข้อดี Legal-TH:** ไม่ต้องจ่ายค่า API, ทำงาน offline ได้
**ข้อดี RAG-04:** embedding quality สูงกว่า (1024 dims), ไม่ต้อง load model local

---

### 3. Search Strategy

| | **Legal-TH** | **RAG-04-Claude** |
|---|---|---|
| Vector search | ✅ ChromaDB cosine | ✅ ChromaDB cosine |
| Keyword search | ❌ | ✅ BM25 (rank-bm25) |
| Hybrid search | ❌ | ✅ Reciprocal Rank Fusion (k=60) |
| Reranking | ❌ | ✅ Voyage AI Rerank (optional) |
| Search modes | vector only | vector / keyword / hybrid |

**ผลกระทบ:**
- Legal-TH อาจพลาดผลลัพธ์ที่มีคำ exact match เช่น "มาตรา 118" เพราะ vector search อาจให้ score ต่ำกว่า keyword match
- RAG-04 Hybrid (RRF) รวมจุดแข็งของทั้ง semantic + keyword

---

### 4. Chunking Strategy

| | **Legal-TH** | **RAG-04-Claude** |
|---|---|---|
| วิธีการ | แยกตาม pattern `มาตรา N:` | Recursive character split |
| Chunk size | ตาม content แต่ละมาตรา | 1000 chars |
| Overlap | ไม่มี | 200 chars |
| Separators | `มาตรา \d+[/\d]*\s*:?` | `\n\n` → `\n` → `. ` → ` ` |

**ข้อดี Legal-TH:** chunk ตาม semantic unit ของกฎหมาย (1 มาตรา = 1 chunk) แม่นกว่าสำหรับ domain นี้
**ข้อดี RAG-04:** ยืดหยุ่นกว่า รองรับเอกสารทุกรูปแบบ, overlap ป้องกันข้อมูลหายที่ขอบ chunk

---

### 5. Document Ingestion

| | **Legal-TH** | **RAG-04-Claude** |
|---|---|---|
| Text (.txt) | ✅ batch script | ✅ upload API |
| PDF | ❌ | ✅ PyMuPDF |
| Markdown | ❌ | ✅ |
| URL | ❌ | ✅ + SSRF protection |
| MCP ingest | ✅ `rag_ingest` (text) | ✅ `rag_upload_text` + `rag_ingest_url` |
| Delete | ❌ | ✅ per-document |
| Batch ingest | ✅ `ingest_laws.py` | ❌ (ทีละไฟล์) |

---

### 6. LLM Integration

| | **Legal-TH** | **RAG-04-Claude** |
|---|---|---|
| LLM ใน RAG pipeline | ❌ ไม่มี (ส่ง context ให้ Claude host) | ✅ Claude API (generate answer) |
| System prompt | CLAUDE.md (ให้ Claude host ใช้) | Built-in system prompt |
| Answer generation | Claude host สร้างคำตอบเอง | RAG service สร้างคำตอบ + sources |

**ข้อดี Legal-TH:** ไม่เสียค่า API เพิ่ม, Claude host เห็น raw context ได้ตัดสินใจเอง
**ข้อดี RAG-04:** answer พร้อม sources กลับมาเลย, ลด latency

---

### 7. Docker & Security

| | **Legal-TH** | **RAG-04-Claude** |
|---|---|---|
| Containers | 5 (chromadb, ingest, rag, mcp, mcp-http) | 2 (rag-server, mcp-server) |
| ChromaDB | HttpClient (แยก container) | PersistentClient (ใน app) |
| Container user | root | **non-root (appuser)** |
| Health check | ✅ manual endpoint | ✅ Docker healthcheck |
| SSRF protection | ❌ | ✅ |
| CORS | ❌ | ✅ middleware |
| Auth | ❌ (optional API key) | ❌ |
| HF model cache | ✅ shared volume | N/A (ใช้ API) |

---

### 8. Domain Features

| Feature | **Legal-TH** | **RAG-04-Claude** |
|---------|---|---|
| กฎหมายไทย 57 มาตรา | ✅ | ❌ |
| คำนวณค่าชดเชย | ✅ (built-in table) | ❌ |
| ประเมินค่าทนาย | ✅ | ❌ |
| CRM (Odoo) | ✅ + fallback | ❌ |
| Skill commands | ✅ 6 commands | ❌ |
| System prompt กฎหมาย | ✅ CLAUDE.md | ❌ |
| กรอง min_score | ❌ (TODO) | ❌ |

---

## สรุป: จุดแข็ง-จุดอ่อน

### Legal-TH
| จุดแข็ง | จุดอ่อน |
|---------|---------|
| Domain-specific (กฎหมายไทย) | Vector search อย่างเดียว (ไม่มี hybrid) |
| Embedding ฟรี (local) | ไม่รองรับ PDF/URL |
| Chunking ตามมาตรา (แม่นกว่า) | ไม่มี document delete |
| 6 Skill commands | http.server ไม่มี auto-docs |
| CRM integration | ไม่มี SSRF protection |
| 3 transports (HTTP+SSE+stdio) | Container run as root |

### RAG-04-Claude
| จุดแข็ง | จุดอ่อน |
|---------|---------|
| Hybrid Search (RRF) | Generic (ไม่มี domain logic) |
| PDF/URL/TXT ingestion | Embedding เสียเงิน (Voyage AI) |
| FastAPI + auto-docs | ไม่มี Skill commands |
| Document lifecycle (CRUD) | ไม่มี CRM integration |
| SSRF + non-root security | Transport เดียว (HTTP) |
| Reranking (optional) | ไม่มี built-in calculator |

---

## แนะนำ: สิ่งที่ Legal-TH ควรนำมาปรับใช้

| Feature | Priority | Effort | ผลกระทบ |
|---------|----------|--------|---------|
| **Hybrid Search (BM25 + RRF)** | 🔴 สูง | กลาง | keyword "มาตรา 118" จะแม่นขึ้นมาก |
| **PDF ingestion** | 🔴 สูง | ต่ำ | รับ PDF กฎหมายจริงได้เลย |
| **Document delete** | 🟡 กลาง | ต่ำ | CRUD ครบ lifecycle |
| **FastAPI แทน http.server** | 🟡 กลาง | กลาง | async, auto-docs, middleware |
| **URL ingestion + SSRF** | 🟡 กลาง | ต่ำ | ดึงกฎหมายจาก web ได้ |
| **Non-root container** | 🟢 ต่ำ | ต่ำ | security best practice |
| **Reranking** | 🟢 ต่ำ | ต่ำ | ปรับ relevance (แต่เสียเงิน API) |

### ไม่แนะนำนำมาใช้
- **Voyage AI embedding** — เสียเงิน, multilingual-e5-base ก็ดีพอสำหรับ Thai
- **LLM answer generation ใน RAG** — เราให้ Claude host สร้างคำตอบดีกว่า (ยืดหยุ่นกว่า)
- **Recursive character chunking** — chunking ตามมาตราของเราแม่นกว่าสำหรับ domain กฎหมาย
