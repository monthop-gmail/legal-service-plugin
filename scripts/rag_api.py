"""
RAG API Service — wraps ChromaDB with REST API
Compatible with rag.ts client (POST /api/search, POST /api/ingest, GET /api/health)
"""

import os
import re
import json
import uuid
from http.server import HTTPServer, BaseHTTPRequestHandler
from sentence_transformers import SentenceTransformer
import chromadb

CHROMA_HOST = os.getenv("CHROMA_HOST", "localhost")
CHROMA_PORT = int(os.getenv("CHROMA_PORT", "8000"))
COLLECTION_NAME = "thai_laws"
API_PORT = int(os.getenv("RAG_API_PORT", "8080"))

print("Loading embedding model: intfloat/multilingual-e5-base ...")
model = SentenceTransformer("intfloat/multilingual-e5-base")
print("Model loaded!")

client = chromadb.HttpClient(host=CHROMA_HOST, port=CHROMA_PORT)


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
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/health":
            try:
                collection = client.get_collection(COLLECTION_NAME)
                count = collection.count()
                self._send_json(200, {
                    "status": "ok",
                    "collections": [COLLECTION_NAME],
                    "total_documents": count,
                })
            except Exception as e:
                self._send_json(503, {"status": "error", "error": str(e)})
            return

        self._send_json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path == "/api/search":
            self._handle_search()
            return
        if self.path == "/api/ingest":
            self._handle_ingest()
            return

        self._send_json(404, {"error": "Not found"})

    def _handle_search(self):
        try:
            body = self._read_body()
            query = body.get("query", "")
            top_k = min(body.get("top_k", 5), 20)
            min_score = body.get("min_score", 0.0)
            filter_meta = body.get("filter")

            collection = client.get_collection(COLLECTION_NAME)
            query_embedding = model.encode(f"query: {query}").tolist()

            where = None
            if filter_meta and isinstance(filter_meta, dict):
                # Map type filter to law_name where possible
                type_val = filter_meta.get("type")
                if type_val and type_val != "all":
                    where = {"law_name": {"$contains": type_val}} if type_val else None

            results = collection.query(
                query_embeddings=[query_embedding],
                n_results=top_k,
                include=["documents", "metadatas", "distances"],
                where=where,
            )

            output = []
            for i in range(len(results["ids"][0])):
                score = round(1 - results["distances"][0][i], 4)
                if score < min_score:
                    continue
                meta = results["metadatas"][0][i]
                output.append({
                    "id": results["ids"][0][i],
                    "score": score,
                    "content": results["documents"][0][i],
                    "metadata": {
                        "source": meta.get("law_name", ""),
                        "type": "law",
                        "section": meta.get("section", ""),
                    },
                })

            self._send_json(200, output)

        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _handle_ingest(self):
        try:
            body = self._read_body()
            content = body.get("content", "")
            metadata = body.get("metadata", {})
            chunk_size = body.get("chunk_size", 512)

            collection = client.get_or_create_collection(
                name=COLLECTION_NAME,
                metadata={"hnsw:space": "cosine"},
            )

            # Chunk by section pattern or by size
            pattern = r"(มาตรา\s+\d+[/\d]*\s*:?)"
            parts = re.split(pattern, content)

            chunks = []
            current_section = metadata.get("section", "")
            current_text = ""

            for part in parts:
                if re.match(pattern, part):
                    if current_text.strip():
                        chunks.append({"section": current_section, "text": current_text.strip()})
                    current_section = part.strip()
                    current_text = ""
                else:
                    current_text += part

            if current_text.strip():
                chunks.append({"section": current_section, "text": current_text.strip()})

            if not chunks:
                chunks = [{"section": metadata.get("section", ""), "text": content}]

            texts = [f"passage: {c['text']}" for c in chunks]
            embeddings = model.encode(texts).tolist()

            doc_id = str(uuid.uuid4())[:8]
            ids = [f"doc_{doc_id}_{i}" for i in range(len(chunks))]
            documents = [c["text"] for c in chunks]
            metadatas = [{
                "law_name": metadata.get("source", ""),
                "section": c["section"],
                "type": metadata.get("type", "law"),
            } for c in chunks]

            collection.add(
                ids=ids,
                embeddings=embeddings,
                documents=documents,
                metadatas=metadatas,
            )

            self._send_json(200, {
                "id": doc_id,
                "status": "indexed",
                "chunks": len(chunks),
            })

        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def log_message(self, format, *args):
        print(f"[RAG API] {args[0]}")


def main():
    server = HTTPServer(("0.0.0.0", API_PORT), RagHandler)
    print(f"RAG API Server running on port {API_PORT}")
    print(f"  POST /api/search  — Semantic search")
    print(f"  POST /api/ingest  — Add documents")
    print(f"  GET  /api/health  — Health check")
    server.serve_forever()


if __name__ == "__main__":
    main()
