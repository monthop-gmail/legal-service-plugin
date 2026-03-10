// RAG Service Client — calls built-in RAG API (ChromaDB + multilingual-e5)
// Supports: hybrid search (BM25+RRF), PDF/URL ingestion, document CRUD

const RAG_URL = process.env.RAG_URL || "http://rag-legal:8080";
const RAG_API_KEY = process.env.RAG_API_KEY || "";

export interface RagSearchResult {
  id: string;
  score: number;
  content: string;
  metadata: {
    source: string;
    type: string;
    section?: string;
    year?: number;
    tags?: string[];
  };
}

export interface RagIngestResult {
  id: string;
  status: "indexed" | "queued" | "error";
  chunks: number;
}

export interface RagDocumentInfo {
  id: string;
  filename: string;
  source: string;
  source_type: string;
  type: string;
  chunk_count: number;
}

export interface RagDeleteResult {
  deleted: boolean;
  doc_id: string;
  chunks_deleted: number;
}

function ragHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (RAG_API_KEY) headers["Authorization"] = `Bearer ${RAG_API_KEY}`;
  return headers;
}

async function ragFetch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${RAG_URL}${path}`, {
    method: "POST",
    headers: ragHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RAG API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

async function ragGet<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (RAG_API_KEY) headers["Authorization"] = `Bearer ${RAG_API_KEY}`;

  const res = await fetch(`${RAG_URL}${path}`, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RAG API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function ragDelete<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (RAG_API_KEY) headers["Authorization"] = `Bearer ${RAG_API_KEY}`;

  const res = await fetch(`${RAG_URL}${path}`, { method: "DELETE", headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RAG API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Search (hybrid/vector/keyword) ─────────────────────────
export async function ragSearch(params: {
  query: string;
  collection?: string;
  top_k?: number;
  filter_type?: string;
  min_score?: number;
  search_mode?: "vector" | "keyword" | "hybrid";
}): Promise<RagSearchResult[]> {
  return ragFetch<RagSearchResult[]>("/api/search", {
    query: params.query,
    collection: params.collection || "legal-th",
    top_k: params.top_k || 5,
    filter: params.filter_type ? { type: params.filter_type } : undefined,
    min_score: params.min_score || 0.5,
    search_mode: params.search_mode || "hybrid",
  });
}

// ─── Ingest text ────────────────────────────────────────────
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

// ─── Ingest URL ─────────────────────────────────────────────
export async function ragIngestUrl(params: {
  url: string;
  metadata?: Record<string, string>;
}): Promise<RagIngestResult> {
  return ragFetch<RagIngestResult>("/api/ingest/url", {
    url: params.url,
    metadata: params.metadata || {},
  });
}

// ─── List documents ─────────────────────────────────────────
export async function ragListDocuments(): Promise<RagDocumentInfo[]> {
  return ragGet<RagDocumentInfo[]>("/api/documents");
}

// ─── Delete document ────────────────────────────────────────
export async function ragDeleteDocument(docId: string): Promise<RagDeleteResult> {
  return ragDelete<RagDeleteResult>(`/api/documents/${docId}`);
}

// ─── Health check ───────────────────────────────────────────
export async function ragHealth(): Promise<{
  status: string;
  collections: string[];
  total_documents: number;
  search_modes: string[];
}> {
  return ragGet<{ status: string; collections: string[]; total_documents: number; search_modes: string[] }>("/api/health");
}
