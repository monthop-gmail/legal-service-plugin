// RAG Service Client — calls external RAG API (separate repo/service)
// Supports any RAG backend that exposes REST API (Qdrant, Weaviate, custom, etc.)

const RAG_URL = process.env.RAG_URL || "http://rag-legal:8080";
const RAG_API_KEY = process.env.RAG_API_KEY || "";

export interface RagSearchResult {
  id: string;
  score: number;
  content: string;
  metadata: {
    source: string;       // e.g. "พ.ร.บ.คุ้มครองแรงงาน", "คำพิพากษาศาลฎีกา"
    type: string;         // "law" | "judgment" | "regulation" | "article"
    section?: string;     // มาตรา / เลขคดี
    year?: number;
    tags?: string[];
  };
}

export interface RagIngestResult {
  id: string;
  status: "indexed" | "queued" | "error";
  chunks: number;
}

async function ragFetch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (RAG_API_KEY) headers["Authorization"] = `Bearer ${RAG_API_KEY}`;

  const res = await fetch(`${RAG_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RAG API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ─── Search ──────────────────────────────────────────────────
export async function ragSearch(params: {
  query: string;
  collection?: string;
  top_k?: number;
  filter_type?: string;
  min_score?: number;
}): Promise<RagSearchResult[]> {
  return ragFetch<RagSearchResult[]>("/api/search", {
    query: params.query,
    collection: params.collection || "legal-th",
    top_k: params.top_k || 5,
    filter: params.filter_type ? { type: params.filter_type } : undefined,
    min_score: params.min_score || 0.5,
  });
}

// ─── Ingest ──────────────────────────────────────────────────
export async function ragIngest(params: {
  content: string;
  metadata: RagSearchResult["metadata"];
  collection?: string;
  chunk_size?: number;
}): Promise<RagIngestResult> {
  return ragFetch<RagIngestResult>("/api/ingest", {
    content: params.content,
    metadata: params.metadata,
    collection: params.collection || "legal-th",
    chunk_size: params.chunk_size || 512,
  });
}

// ─── Health check ────────────────────────────────────────────
export async function ragHealth(): Promise<{ status: string; collections: string[]; total_documents: number }> {
  const headers: Record<string, string> = {};
  if (RAG_API_KEY) headers["Authorization"] = `Bearer ${RAG_API_KEY}`;

  const res = await fetch(`${RAG_URL}/api/health`, { headers });
  if (!res.ok) throw new Error(`RAG health check failed: ${res.status}`);
  return res.json() as Promise<{ status: string; collections: string[]; total_documents: number }>;
}
