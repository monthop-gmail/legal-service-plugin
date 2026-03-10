"""
RAG API Service — wraps ChromaDB with REST API
Features: Hybrid Search (BM25+RRF), PDF/URL ingestion, document delete, SSRF protection
Compatible with rag.ts client
"""

import cgi
import os
import re
import json
import uuid
import tempfile
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

import chromadb
import fitz  # PyMuPDF
import requests
from bs4 import BeautifulSoup
from rank_bm25 import BM25Okapi
from sentence_transformers import SentenceTransformer

# ─── Config ───────────────────────────────────────────────
CHROMA_HOST = os.getenv("CHROMA_HOST", "localhost")
CHROMA_PORT = int(os.getenv("CHROMA_PORT", "8000"))
COLLECTION_NAME = "thai_laws"
API_PORT = int(os.getenv("RAG_API_PORT", "8080"))
RRF_K = int(os.getenv("RRF_K", "60"))
DEFAULT_MIN_SCORE = float(os.getenv("DEFAULT_MIN_SCORE", "0.0"))

# ─── Model & ChromaDB ────────────────────────────────────
print("Loading embedding model: intfloat/multilingual-e5-base ...")
model = SentenceTransformer("intfloat/multilingual-e5-base")
print("Model loaded!")

client = chromadb.HttpClient(host=CHROMA_HOST, port=CHROMA_PORT)

# ─── BM25 Index ──────────────────────────────────────────
_bm25_lock = threading.Lock()
_bm25: BM25Okapi | None = None
_bm25_chunks: list[dict] = []


def build_bm25_index() -> int:
    """Build/rebuild BM25 index from all chunks in ChromaDB."""
    global _bm25, _bm25_chunks
    try:
        collection = client.get_collection(COLLECTION_NAME)
        all_data = collection.get(include=["documents", "metadatas"])
    except Exception:
        with _bm25_lock:
            _bm25 = None
            _bm25_chunks = []
        return 0

    if not all_data["ids"]:
        with _bm25_lock:
            _bm25 = None
            _bm25_chunks = []
        return 0

    chunks = []
    for i, doc_id in enumerate(all_data["ids"]):
        chunks.append({
            "id": doc_id,
            "content": all_data["documents"][i],
            "metadata": all_data["metadatas"][i],
        })

    tokenized = [c["content"].lower().split() for c in chunks]

    with _bm25_lock:
        _bm25 = BM25Okapi(tokenized)
        _bm25_chunks = chunks

    print(f"[BM25] Index built with {len(chunks)} chunks")
    return len(chunks)


def bm25_search(query: str, top_k: int = 5) -> list[dict]:
    """Search using BM25 keyword matching."""
    with _bm25_lock:
        bm25 = _bm25
        chunks = _bm25_chunks

    if bm25 is None or not chunks:
        return []

    tokenized_query = query.lower().split()
    scores = bm25.get_scores(tokenized_query)

    scored_indices = sorted(
        range(len(scores)), key=lambda i: scores[i], reverse=True
    )[:top_k]

    results = []
    for idx in scored_indices:
        if scores[idx] > 0:
            meta = chunks[idx]["metadata"]
            results.append({
                "id": chunks[idx]["id"],
                "score": float(scores[idx]),
                "content": chunks[idx]["content"],
                "metadata": {
                    "source": meta.get("law_name", ""),
                    "type": meta.get("type", "law"),
                    "section": meta.get("section", ""),
                },
            })
    return results


def reciprocal_rank_fusion(
    vector_results: list[dict],
    keyword_results: list[dict],
    k: int = RRF_K,
) -> list[dict]:
    """Merge vector and keyword results using Reciprocal Rank Fusion."""
    scores: dict[str, float] = {}
    items: dict[str, dict] = {}

    for rank, result in enumerate(vector_results):
        rid = result["id"]
        scores[rid] = scores.get(rid, 0.0) + 1.0 / (k + rank + 1)
        items[rid] = result

    for rank, result in enumerate(keyword_results):
        rid = result["id"]
        scores[rid] = scores.get(rid, 0.0) + 1.0 / (k + rank + 1)
        if rid not in items:
            items[rid] = result

    sorted_ids = sorted(scores, key=lambda rid: scores[rid], reverse=True)

    merged = []
    for rid in sorted_ids:
        item = items[rid].copy()
        item["score"] = round(scores[rid], 6)
        merged.append(item)

    return merged


# ─── SSRF Protection ─────────────────────────────────────
BLOCKED_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "169.254.169.254", "[::1]"}
BLOCKED_PREFIXES = (
    "10.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.",
    "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.",
    "172.27.", "172.28.", "172.29.", "172.30.", "172.31.", "192.168.",
)


def validate_url(url: str) -> None:
    """Validate URL to prevent SSRF attacks."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Invalid URL scheme: {parsed.scheme}. Only http/https allowed.")
    hostname = parsed.hostname or ""
    if hostname in BLOCKED_HOSTS or hostname.startswith(BLOCKED_PREFIXES):
        raise ValueError("URLs pointing to internal/private networks are not allowed.")


# ─── Chunking ────────────────────────────────────────────
SECTION_PATTERN = r"(มาตรา\s+\d+[/\d]*\s*:?)"


def chunk_by_section(content: str, default_section: str = "") -> list[dict]:
    """Chunk text by มาตรา pattern (Thai law-specific)."""
    parts = re.split(SECTION_PATTERN, content)

    chunks = []
    current_section = default_section
    current_text = ""

    for part in parts:
        if re.match(SECTION_PATTERN, part):
            if current_text.strip():
                chunks.append({"section": current_section, "text": current_text.strip()})
            current_section = part.strip()
            current_text = ""
        else:
            current_text += part

    if current_text.strip():
        chunks.append({"section": current_section, "text": current_text.strip()})

    return chunks


def chunk_by_size(content: str, chunk_size: int = 1000, overlap: int = 200) -> list[dict]:
    """Fallback chunking by character size with overlap."""
    chunks = []
    start = 0
    while start < len(content):
        end = start + chunk_size
        text = content[start:end]
        if text.strip():
            chunks.append({"section": "", "text": text.strip()})
        start = end - overlap if end < len(content) else end
    return chunks


def smart_chunk(content: str, default_section: str = "") -> list[dict]:
    """Try section-based chunking first, fall back to size-based."""
    chunks = chunk_by_section(content, default_section)
    if not chunks or (len(chunks) == 1 and len(chunks[0]["text"]) > 3000):
        chunks = chunk_by_size(content)
    return chunks if chunks else [{"section": default_section, "text": content}]


# ─── PDF Loading ─────────────────────────────────────────
def load_pdf(file_path: str) -> str:
    """Extract text from a PDF file using PyMuPDF."""
    doc = fitz.open(file_path)
    pages = [page.get_text() for page in doc]
    doc.close()
    return "\n".join(pages)


# ─── URL Loading ─────────────────────────────────────────
def load_url(url: str) -> tuple[str, str]:
    """Fetch and extract text from a web page. Returns (text, title)."""
    validate_url(url)
    headers = {"User-Agent": "Mozilla/5.0 (compatible; LegalTH-RAG/1.0)"}
    response = requests.get(url, headers=headers, timeout=15)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()

    text = soup.get_text(separator="\n", strip=True)
    title = soup.title.string if soup.title else url
    return text, title


# ─── Ingest Helper ───────────────────────────────────────
def ingest_chunks(chunks: list[dict], metadata: dict) -> dict:
    """Embed chunks and store in ChromaDB. Returns response dict."""
    collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )

    texts = [f"passage: {c['text']}" for c in chunks]
    embeddings = model.encode(texts).tolist()

    doc_id = str(uuid.uuid4())[:8]
    ids = [f"doc_{doc_id}_{i}" for i in range(len(chunks))]
    documents = [c["text"] for c in chunks]
    metadatas = [{
        "law_name": metadata.get("source", ""),
        "section": c["section"],
        "type": metadata.get("type", "law"),
        "document_id": doc_id,
        "source_type": metadata.get("source_type", "text"),
        "filename": metadata.get("filename", ""),
    } for c in chunks]

    collection.add(
        ids=ids,
        embeddings=embeddings,
        documents=documents,
        metadatas=metadatas,
    )

    # Rebuild BM25 index
    build_bm25_index()

    return {"id": doc_id, "status": "indexed", "chunks": len(chunks)}


# ─── HTTP Handler ────────────────────────────────────────
class RagHandler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def _read_body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        return json.loads(body) if body else {}

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    # ─── GET ─────────────────────────────────────────
    def do_GET(self):
        if self.path == "/api/health":
            self._handle_health()
            return
        if self.path == "/api/documents":
            self._handle_list_documents()
            return
        self._send_json(404, {"error": "Not found"})

    # ─── POST ────────────────────────────────────────
    def do_POST(self):
        if self.path == "/api/search":
            self._handle_search()
            return
        if self.path == "/api/ingest":
            self._handle_ingest()
            return
        if self.path == "/api/ingest/pdf":
            self._handle_ingest_pdf()
            return
        if self.path == "/api/ingest/url":
            self._handle_ingest_url()
            return
        self._send_json(404, {"error": "Not found"})

    # ─── DELETE ──────────────────────────────────────
    def do_DELETE(self):
        # /api/documents/<doc_id>
        if self.path.startswith("/api/documents/"):
            doc_id = self.path.split("/api/documents/")[1].strip("/")
            if doc_id:
                self._handle_delete_document(doc_id)
                return
        self._send_json(404, {"error": "Not found"})

    # ─── Handlers ────────────────────────────────────
    def _handle_health(self):
        try:
            collection = client.get_collection(COLLECTION_NAME)
            count = collection.count()
            self._send_json(200, {
                "status": "ok",
                "collections": [COLLECTION_NAME],
                "total_documents": count,
                "search_modes": ["vector", "keyword", "hybrid"],
            })
        except Exception as e:
            self._send_json(503, {"status": "error", "error": str(e)})

    def _handle_search(self):
        try:
            body = self._read_body()
            query = body.get("query", "")
            top_k = min(body.get("top_k", 5), 20)
            min_score = body.get("min_score", DEFAULT_MIN_SCORE)
            filter_meta = body.get("filter")
            search_mode = body.get("search_mode", "hybrid")

            # ─── Vector search ───
            vector_results = []
            if search_mode in ("vector", "hybrid"):
                collection = client.get_collection(COLLECTION_NAME)
                query_embedding = model.encode(f"query: {query}").tolist()

                where = None
                if filter_meta and isinstance(filter_meta, dict):
                    type_val = filter_meta.get("type")
                    if type_val and type_val != "all":
                        where = {"law_name": {"$contains": type_val}}

                fetch_k = top_k * 3 if search_mode == "hybrid" else top_k
                results = collection.query(
                    query_embeddings=[query_embedding],
                    n_results=fetch_k,
                    include=["documents", "metadatas", "distances"],
                    where=where,
                )

                for i in range(len(results["ids"][0])):
                    score = round(1 - results["distances"][0][i], 4)
                    meta = results["metadatas"][0][i]
                    vector_results.append({
                        "id": results["ids"][0][i],
                        "score": score,
                        "content": results["documents"][0][i],
                        "metadata": {
                            "source": meta.get("law_name", ""),
                            "type": meta.get("type", "law"),
                            "section": meta.get("section", ""),
                        },
                    })

            # ─── Keyword search (BM25) ───
            keyword_results = []
            if search_mode in ("keyword", "hybrid"):
                fetch_k = top_k * 3 if search_mode == "hybrid" else top_k
                keyword_results = bm25_search(query, fetch_k)

            # ─── Merge ───
            if search_mode == "hybrid":
                output = reciprocal_rank_fusion(vector_results, keyword_results)[:top_k]
            elif search_mode == "keyword":
                output = keyword_results[:top_k]
            else:
                output = vector_results[:top_k]

            # Apply min_score filter
            if min_score > 0:
                output = [r for r in output if r["score"] >= min_score]

            self._send_json(200, output)

        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _handle_ingest(self):
        try:
            body = self._read_body()
            content = body.get("content", "")
            metadata = body.get("metadata", {})

            chunks = smart_chunk(content, metadata.get("section", ""))
            metadata["source_type"] = "text"
            result = ingest_chunks(chunks, metadata)

            self._send_json(200, result)

        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _handle_ingest_pdf(self):
        try:
            content_type = self.headers.get("Content-Type", "")
            if "multipart/form-data" not in content_type:
                self._send_json(400, {"error": "Content-Type must be multipart/form-data"})
                return

            # Parse multipart
            environ = {
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": content_type,
                "CONTENT_LENGTH": self.headers.get("Content-Length", "0"),
            }
            form = cgi.FieldStorage(
                fp=self.rfile, headers=self.headers, environ=environ
            )

            file_item = form["file"] if "file" in form else None
            if not file_item or not file_item.file:
                self._send_json(400, {"error": "Missing 'file' field"})
                return

            filename = file_item.filename or "document.pdf"
            if not filename.lower().endswith(".pdf"):
                self._send_json(400, {"error": "Only PDF files are supported"})
                return

            # Save to temp file and extract text
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                tmp.write(file_item.file.read())
                tmp_path = tmp.name

            try:
                text = load_pdf(tmp_path)
            finally:
                os.unlink(tmp_path)

            if not text.strip():
                self._send_json(400, {"error": "No text content found in PDF"})
                return

            # Get optional metadata from form fields
            source = form.getvalue("source", filename)
            doc_type = form.getvalue("type", "law")

            chunks = smart_chunk(text)
            metadata = {
                "source": source,
                "type": doc_type,
                "source_type": "pdf",
                "filename": filename,
            }
            result = ingest_chunks(chunks, metadata)

            self._send_json(200, result)

        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _handle_ingest_url(self):
        try:
            body = self._read_body()
            url = body.get("url", "")
            metadata = body.get("metadata", {})

            if not url:
                self._send_json(400, {"error": "Missing 'url' field"})
                return

            text, title = load_url(url)

            if not text.strip():
                self._send_json(400, {"error": "No text content found at URL"})
                return

            chunks = smart_chunk(text)
            metadata.setdefault("source", title)
            metadata.setdefault("type", "article")
            metadata["source_type"] = "url"
            metadata["filename"] = title
            metadata["url"] = url
            result = ingest_chunks(chunks, metadata)

            self._send_json(200, result)

        except ValueError as e:
            self._send_json(400, {"error": str(e)})
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _handle_list_documents(self):
        try:
            collection = client.get_collection(COLLECTION_NAME)
            all_data = collection.get(include=["metadatas"])

            # Group by document_id
            docs: dict[str, dict] = {}
            for i, meta in enumerate(all_data["metadatas"]):
                doc_id = meta.get("document_id", "legacy")
                if doc_id not in docs:
                    docs[doc_id] = {
                        "id": doc_id,
                        "filename": meta.get("filename", ""),
                        "source": meta.get("law_name", ""),
                        "source_type": meta.get("source_type", "unknown"),
                        "type": meta.get("type", ""),
                        "chunk_count": 0,
                    }
                docs[doc_id]["chunk_count"] += 1

            self._send_json(200, list(docs.values()))

        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _handle_delete_document(self, doc_id: str):
        try:
            collection = client.get_collection(COLLECTION_NAME)
            all_data = collection.get(include=["metadatas"])

            # Find chunk IDs belonging to this document
            ids_to_delete = []
            for i, meta in enumerate(all_data["metadatas"]):
                if meta.get("document_id") == doc_id:
                    ids_to_delete.append(all_data["ids"][i])

            if not ids_to_delete:
                self._send_json(404, {"error": f"Document '{doc_id}' not found"})
                return

            collection.delete(ids=ids_to_delete)

            # Rebuild BM25 index
            build_bm25_index()

            self._send_json(200, {
                "deleted": True,
                "doc_id": doc_id,
                "chunks_deleted": len(ids_to_delete),
            })

        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def log_message(self, format, *args):
        print(f"[RAG API] {args[0]}")


# ─── Main ────────────────────────────────────────────────
def main():
    # Build BM25 index on startup
    print("Building BM25 index...")
    count = build_bm25_index()
    print(f"BM25 index ready ({count} chunks)")

    server = HTTPServer(("0.0.0.0", API_PORT), RagHandler)
    print(f"RAG API Server running on port {API_PORT}")
    print(f"  POST /api/search          — Hybrid/vector/keyword search")
    print(f"  POST /api/ingest          — Add text documents")
    print(f"  POST /api/ingest/pdf      — Upload PDF")
    print(f"  POST /api/ingest/url      — Ingest from URL")
    print(f"  GET  /api/documents       — List documents")
    print(f"  DELETE /api/documents/:id  — Delete document")
    print(f"  GET  /api/health          — Health check")
    server.serve_forever()


if __name__ == "__main__":
    main()
