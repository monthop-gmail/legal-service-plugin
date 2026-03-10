# RAG API Contract

API specification ที่ RAG service (แยก repo) ต้อง implement เพื่อให้ legal-th MCP plugin เรียกใช้ได้

## Base URL

```
RAG_URL=http://rag-legal:8080   # Docker network
RAG_URL=http://localhost:8080   # Local dev
```

## Authentication

```
Authorization: Bearer <RAG_API_KEY>
```

---

## POST /api/search

Semantic search จากฐานข้อมูล vector

### Request

```json
{
  "query": "พนักงานถูกเลิกจ้างเพราะโพสต์วิจารณ์บริษัท",
  "collection": "legal-th",
  "top_k": 5,
  "filter": { "type": "judgment" },
  "min_score": 0.5
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| query | string | yes | — | คำค้นหา (จะถูก embed เป็น vector) |
| collection | string | no | "legal-th" | ชื่อ collection ใน vector DB |
| top_k | number | no | 5 | จำนวนผลลัพธ์สูงสุด |
| filter | object | no | — | filter ตาม metadata |
| min_score | number | no | 0.5 | คะแนนขั้นต่ำ (0-1) |

### Response `200`

```json
[
  {
    "id": "doc_abc123",
    "score": 0.89,
    "content": "คำพิพากษาศาลฎีกาที่ 1234/2565 ... การโพสต์ข้อความวิจารณ์นายจ้าง...",
    "metadata": {
      "source": "คำพิพากษาศาลฎีกา",
      "type": "judgment",
      "section": "ฎ.1234/2565",
      "year": 2565,
      "tags": ["แรงงาน", "เลิกจ้าง", "โซเชียลมีเดีย"]
    }
  }
]
```

---

## POST /api/ingest

เพิ่มเอกสารใหม่ → chunk + embed + store

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
| content | string | yes | เนื้อหาเต็ม (จะถูก chunk อัตโนมัติ) |
| metadata | object | yes | ข้อมูล metadata ติดทุก chunk |
| collection | string | no | default: "legal-th" |
| chunk_size | number | no | default: 512 tokens |

### Response `200`

```json
{
  "id": "doc_xyz789",
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
  "collections": ["legal-th"],
  "total_documents": 1542
}
```

---

## Metadata Schema

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| source | string | — | ชื่อแหล่งที่มา |
| type | string | `law` \| `judgment` \| `regulation` \| `article` | ประเภทเอกสาร |
| section | string? | — | มาตรา / เลขคดี |
| year | number? | — | ปี พ.ศ. |
| tags | string[]? | — | แท็กสำหรับ filter |

### Document Types

| type | คำอธิบาย | ตัวอย่าง source |
|------|---------|----------------|
| `law` | ตัวบทกฎหมาย | พ.ร.บ.คุ้มครองแรงงาน พ.ศ. 2541 |
| `judgment` | คำพิพากษา | คำพิพากษาศาลฎีกา |
| `regulation` | กฎกระทรวง / ประกาศ | ประกาศกระทรวงแรงงาน |
| `article` | บทความวิชาการ | วารสารนิติศาสตร์ |

---

## Recommended Stack (for RAG repo)

```
┌─────────────────────────────┐
│  RAG Service (:8080)        │
│  ├─ FastAPI / Express       │
│  ├─ Embedding Model         │
│  │   └─ multilingual-e5     │
│  ├─ Chunking (Thai-aware)   │
│  └─ Qdrant Client           │
└──────────┬──────────────────┘
           │
┌──────────▼──────────────────┐
│  Qdrant (:6333)             │
│  └─ Collection: legal-th    │
└─────────────────────────────┘
```
