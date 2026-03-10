# RAG API Contract (ChromaDB)

API specification ของ RAG service ที่ wrap ChromaDB เพื่อให้ legal-th MCP plugin เรียกใช้ได้

> **Note:** ตั้งแต่ v0.2.0 ใช้ built-in RAG service (`scripts/rag_api.py` + ChromaDB) แทน external Qdrant

## Base URL

```
RAG_URL=http://rag-legal:8080   # Docker network
RAG_URL=http://localhost:8080   # Local dev
```

## Authentication

```
Authorization: Bearer <RAG_API_KEY>    # optional
```

---

## Stack

```
┌─────────────────────────────────────┐
│  RAG API Service (:8080)            │
│  ├─ Python (http.server)            │
│  ├─ Embedding Model                 │
│  │   └─ intfloat/multilingual-e5    │
│  │       (768 dims, Thai-aware)     │
│  └─ ChromaDB Client                 │
└──────────┬──────────────────────────┘
           │
┌──────────▼──────────────────────────┐
│  ChromaDB (:8100 → :8000 internal)  │
│  └─ Collection: thai_laws           │
│     └─ 57 sections, cosine distance │
└─────────────────────────────────────┘
           ▲
┌──────────┘
│  Ingest Pipeline (run once)
│  scripts/ingest_laws.py
│  └─ laws/*.txt → chunk by มาตรา
│     → embed with e5-base
│     → store in ChromaDB
└─────────────────────────────────────
```

---

## POST /api/search

Semantic search จากฐานข้อมูล ChromaDB

### Request

```json
{
  "query": "พนักงานถูกเลิกจ้างเพราะโพสต์วิจารณ์บริษัท",
  "collection": "legal-th",
  "top_k": 5,
  "filter": { "type": "law" },
  "min_score": 0.5
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| query | string | yes | — | คำค้นหา (embed ด้วย `"query: {query}"`) |
| collection | string | no | "legal-th" | ชื่อ collection (mapped to `thai_laws`) |
| top_k | number | no | 5 | จำนวนผลลัพธ์สูงสุด (max: 20) |
| filter | object | no | — | filter ตาม metadata |
| min_score | number | no | 0.5 | คะแนนขั้นต่ำ (0-1) |

### Response `200`

```json
[
  {
    "id": "law_12",
    "score": 0.89,
    "content": "มาตรา 118: เมื่อนายจ้างเลิกจ้างลูกจ้าง ให้จ่ายค่าชดเชยดังนี้...",
    "metadata": {
      "source": "พ.ร.บ.คุ้มครองแรงงาน พ.ศ. 2541",
      "type": "law",
      "section": "มาตรา 118:"
    }
  }
]
```

---

## POST /api/ingest

เพิ่มเอกสารใหม่ → chunk by มาตรา + embed + store

### Request

```json
{
  "content": "มาตรา 118 ให้นายจ้างจ่ายค่าชดเชยให้แก่ลูกจ้าง...",
  "metadata": {
    "source": "พ.ร.บ.คุ้มครองแรงงาน พ.ศ. 2541",
    "type": "law",
    "section": "มาตรา 118",
    "year": 2541,
    "tags": ["แรงงาน", "ค่าชดเชย"]
  },
  "collection": "legal-th",
  "chunk_size": 512
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| content | string | yes | เนื้อหาเต็ม (chunk อัตโนมัติโดยแยกตาม `มาตรา N:`) |
| metadata | object | yes | ข้อมูล metadata ติดทุก chunk |
| collection | string | no | default: "legal-th" |
| chunk_size | number | no | default: 512 (fallback ถ้าไม่พบ pattern มาตรา) |

### Response `200`

```json
{
  "id": "doc_abc12345",
  "status": "indexed",
  "chunks": 12
}
```

---

## GET /api/health

Health check + สถิติ

### Response `200`

```json
{
  "status": "ok",
  "collections": ["thai_laws"],
  "total_documents": 57
}
```

---

## Metadata Schema

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| source / law_name | string | — | ชื่อกฎหมาย (e.g. `พ.ร.บ.คุ้มครองแรงงาน พ.ศ. 2541`) |
| type | string | `law` | ประเภทเอกสาร (ปัจจุบันรองรับ `law` เท่านั้น) |
| section | string | — | มาตรา (e.g. `มาตรา 118:`) |

### Embedding Details

| Property | Value |
|----------|-------|
| Model | `intfloat/multilingual-e5-base` |
| Dimensions | 768 |
| Document prefix | `"passage: {text}"` |
| Query prefix | `"query: {query}"` |
| Distance metric | Cosine |
| Score calculation | `1 - cosine_distance` (0-1, higher = more relevant) |

---

## กฎหมายในระบบ (57 มาตรา)

| กฎหมาย | จำนวนมาตรา | ไฟล์ |
|--------|-----------|------|
| พ.ร.บ.คุ้มครองแรงงาน พ.ศ. 2541 | 17 | `laws/labor_protection_2541.txt` |
| พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA) | 14 | `laws/pdpa_2562.txt` |
| ประมวลกฎหมายอาญา | 26 | `laws/criminal_code_common.txt` |

### เพิ่มกฎหมายใหม่

1. สร้างไฟล์ `.txt` ใน `laws/` ตามรูปแบบ:
   ```
   =====================================
   ชื่อกฎหมาย
   =====================================

   มาตรา 1: เนื้อหา...

   มาตรา 2: เนื้อหา...
   ```

2. เพิ่ม mapping ใน `scripts/ingest_laws.py`:
   ```python
   LAW_NAMES = {
       "new_law.txt": "ชื่อกฎหมายใหม่",
       ...
   }
   ```

3. Re-ingest:
   ```bash
   docker compose up ingest
   ```
