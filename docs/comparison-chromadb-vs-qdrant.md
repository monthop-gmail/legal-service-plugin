# เปรียบเทียบ ChromaDB vs Qdrant สำหรับ Legal-TH

## สรุปสั้น

| ขนาดข้อมูล | แนะนำ | เหตุผล |
|---|---|---|
| **< 10K docs** (ปัจจุบัน) | **ChromaDB** | ง่าย, setup น้อย, เพียงพอ |
| **10K – 100K docs** | ทั้งคู่ใช้ได้ | ยังไม่เห็นความแตกต่างชัด |
| **> 100K docs** / production | **Qdrant** | เร็วกว่า, scale ได้, ประหยัด RAM |

---

## 1. ภาพรวม

| เกณฑ์ | ChromaDB | Qdrant |
|---|---|---|
| **ภาษา** | Python | Rust |
| **License** | Apache 2.0 | Apache 2.0 |
| **เหมาะกับ** | Prototyping, small-medium | Production, large-scale |
| **Docker image size** | ~500 MB | ~100 MB |
| **Startup time** | เร็ว (< 5s) | เร็ว (< 3s) |
| **Client SDK** | Python, JS | Python, JS, Rust, Go, Java |

---

## 2. ประสิทธิภาพ (Performance)

### Search Latency (768-dim vectors, cosine)

| จำนวน Documents | ChromaDB | Qdrant | ต่างกัน |
|---|---|---|---|
| 57 (ปัจจุบัน) | < 10ms | < 10ms | ไม่มี |
| 1,000 | ~15ms | ~5ms | 3x |
| 10,000 | ~50ms | ~10ms | 5x |
| 100,000 | ~300ms | ~15ms | 20x |
| 1,000,000 | ~2-5s | ~20ms | 100x+ |

> ค่าประมาณ ขึ้นกับ hardware และ configuration

### Indexing (HNSW)

| เกณฑ์ | ChromaDB | Qdrant |
|---|---|---|
| **Algorithm** | HNSW (hnswlib) | HNSW (custom Rust) |
| **SIMD optimization** | ไม่มี | มี (AVX2, SSE) |
| **On-disk index** | ไม่รองรับ (in-memory only) | รองรับ (mmap) |
| **Build speed** | ปานกลาง | เร็วกว่า ~2-3x |

### Filtering

| เกณฑ์ | ChromaDB | Qdrant |
|---|---|---|
| **วิธี filter** | Post-filtering (search ก่อน filter ทีหลัง) | Pre-filtering (filter ก่อน search) |
| **ผลกระทบ** | ผลลัพธ์อาจน้อยกว่า top_k | ผลลัพธ์ตรงตาม top_k เสมอ |
| **ตัวอย่าง** | ขอ top_k=5 filter type=law → อาจได้แค่ 3 | ขอ top_k=5 filter type=law → ได้ 5 เสมอ |

---

## 3. ความสามารถ (Features)

| ฟีเจอร์ | ChromaDB | Qdrant |
|---|---|---|
| **Metadata filtering** | `$eq`, `$ne`, `$in`, `$contains` | `match`, `range`, `geo`, `nested`, `has_id` |
| **Full-text search** | ไม่มี | มี (BM25 hybrid) |
| **Hybrid search** | ไม่รองรับ | รองรับ (vector + keyword) |
| **Quantization** | ไม่มี | Scalar, Product, Binary (ลด RAM 4-8x) |
| **Multi-vector** | ไม่รองรับ | รองรับ (named vectors) |
| **Sparse vectors** | ไม่รองรับ | รองรับ (SPLADE, BM25) |
| **Payload index** | อัตโนมัติ | กำหนดเองได้ (keyword, integer, geo) |
| **Snapshot/Backup** | ไม่มี built-in | มี (snapshot API) |
| **Batch operations** | มี | มี (เร็วกว่า) |

---

## 4. Scalability

| เกณฑ์ | ChromaDB | Qdrant |
|---|---|---|
| **Horizontal scaling** | ไม่รองรับ | รองรับ (sharding + replication) |
| **Max recommended docs** | ~100K | หลายล้าน |
| **Memory usage (100K docs)** | ~2-4 GB | ~0.5-1 GB (with quantization) |
| **Disk-based storage** | ไม่รองรับ | รองรับ (mmap, on-disk payload) |
| **Concurrent requests** | ไม่ดีนัก (Python GIL) | ดีมาก (Rust async) |
| **Replication** | ไม่มี | มี (raft consensus) |

---

## 5. Developer Experience

| เกณฑ์ | ChromaDB | Qdrant |
|---|---|---|
| **Setup complexity** | ง่ายมาก (1 Docker image) | ง่าย (1 Docker image) |
| **API simplicity** | ง่ายมาก (3-4 methods) | ปานกลาง (มี option เยอะ) |
| **Dashboard/UI** | ไม่มี built-in | มี (port 6333/dashboard) |
| **Documentation** | ปานกลาง | ดีมาก |
| **Community** | ใหญ่ (Python-centric) | ใหญ่ (polyglot) |
| **Managed cloud** | มี (Chroma Cloud) | มี (Qdrant Cloud) |

---

## 6. สำหรับ Legal-TH โดยเฉพาะ

### ปัจจุบัน (ChromaDB เพียงพอ)

```
57 มาตรา × 768 dims = ~175 KB vectors
Search latency: < 10ms
RAM: < 200 MB
```

### อนาคต (พิจารณา Qdrant)

เมื่อเพิ่มข้อมูลเหล่านี้:

| ประเภท | จำนวนโดยประมาณ |
|---|---|
| กฎหมาย (ตัวบท) | 500 – 2,000 มาตรา |
| คำพิพากษาศาลฎีกา | 10,000 – 100,000+ คำพิพากษา |
| กฎกระทรวง / ประกาศ | 1,000 – 5,000 ฉบับ |
| บทความวิชาการ | 1,000 – 10,000 บทความ |
| **รวม** | **~12,500 – 117,000+ docs** |

เมื่อถึงจุดนี้ ควรย้ายเป็น Qdrant เพราะ:
- Search ยังเร็ว < 20ms แม้ข้อมูลแสนรายการ
- Hybrid search (vector + keyword) เหมาะกับการค้นหาเลขมาตรา
- Quantization ช่วยลด RAM จาก ~8 GB เหลือ ~1-2 GB
- Snapshot API สำหรับ backup ฐานข้อมูลกฎหมาย

---

## 7. แผนการ Migrate จาก ChromaDB → Qdrant

### สิ่งที่ต้องแก้ไข

| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `scripts/ingest_laws.py` | เปลี่ยน `chromadb.HttpClient` → `qdrant_client.QdrantClient` |
| `scripts/rag_api.py` | เปลี่ยน ChromaDB query → Qdrant search API |
| `scripts/requirements.txt` | เปลี่ยน `chromadb-client` → `qdrant-client` |
| `Dockerfile.ingest` | ไม่ต้องแก้ (ใช้ requirements.txt) |
| `Dockerfile.rag` | ไม่ต้องแก้ |
| `docker-compose.yml` | เปลี่ยน `chromadb/chroma` → `qdrant/qdrant` + port mapping |

### สิ่งที่ไม่ต้องแก้

| ไฟล์ | เหตุผล |
|---|---|
| `src/services/rag.ts` | เรียก REST API เหมือนเดิม (`/api/search`, `/api/ingest`) |
| `src/index.ts` | ไม่เกี่ยว — ใช้ MCP tools เหมือนเดิม |
| `src/http-server.ts` | ไม่เกี่ยว |
| `laws/*.txt` | ข้อมูลกฎหมายเหมือนเดิม |
| `CLAUDE.md` | ไม่เกี่ยว |
| `skills/*.md` | ไม่เกี่ยว |

### ขั้นตอน Migrate

```bash
# 1. แก้ไข scripts/ (ingest + rag_api)
# 2. แก้ docker-compose.yml (chromadb → qdrant)
# 3. แก้ requirements.txt (chromadb-client → qdrant-client)

# 4. Re-build & Re-ingest
docker compose down -v
docker compose build ingest rag-legal
docker compose up chromadb ingest   # → qdrant ingest
docker compose up -d

# 5. ทดสอบ
curl http://localhost:8080/api/health
curl -X POST http://localhost:8080/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"เลิกจ้างไม่เป็นธรรม","top_k":3}'
```

> **Impact:** แก้แค่ 3 ไฟล์ Python + docker-compose — TypeScript MCP ไม่ต้องแก้เลย
> เพราะ `rag_api.py` ทำหน้าที่เป็น **adapter layer** ระหว่าง REST API กับ vector DB
