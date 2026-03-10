// Odoo CRM Client — calls external Odoo REST/JSON-RPC API (separate service)
// Fallback: in-memory store เมื่อ Odoo ยังไม่พร้อม

const ODOO_URL = process.env.ODOO_URL || "http://odoo:8069";
const ODOO_DB = process.env.ODOO_DB || "legal_th";
const ODOO_USER = process.env.ODOO_USER || "admin";
const ODOO_PASS = process.env.ODOO_PASS || "admin";

export interface CaseIntake {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  caseType: string;
  description: string;
  status: "new" | "contacted" | "qualified" | "converted";
  estimatedFee?: number;
  createdAt: string;
  source: "odoo" | "fallback";
}

// ─── In-memory fallback ──────────────────────────────────────
const fallbackLeads: CaseIntake[] = [];

// ─── Odoo JSON-RPC helpers ───────────────────────────────────
let cachedUid: number | null = null;

async function odooJsonRpc(url: string, method: string, params: Record<string, unknown>): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });

  if (!res.ok) throw new Error(`Odoo HTTP ${res.status}`);
  const data = await res.json() as any;
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.result;
}

async function odooAuthenticate(): Promise<number> {
  if (cachedUid) return cachedUid;

  const uid = await odooJsonRpc(`${ODOO_URL}/web/session/authenticate`, "call", {
    db: ODOO_DB,
    login: ODOO_USER,
    password: ODOO_PASS,
  });

  cachedUid = uid.uid as number;
  return cachedUid!;
}

async function odooCall(model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}): Promise<any> {
  await odooAuthenticate();
  return odooJsonRpc(`${ODOO_URL}/web/dataset/call_kw`, "call", {
    model,
    method,
    args,
    kwargs: { ...kwargs, context: { lang: "th_TH" } },
  });
}

// ─── Odoo health check ──────────────────────────────────────
export async function odooHealth(): Promise<{ status: string; url: string; db: string; uid: number | null }> {
  try {
    const uid = await odooAuthenticate();
    return { status: "connected", url: ODOO_URL, db: ODOO_DB, uid };
  } catch (err: any) {
    return { status: "disconnected", url: ODOO_URL, db: ODOO_DB, uid: null };
  }
}

// ─── Create Lead ─────────────────────────────────────────────
export async function createLead(data: {
  name: string;
  phone?: string;
  email?: string;
  caseType: string;
  description: string;
  estimatedFee?: number;
}): Promise<CaseIntake> {
  // Try Odoo first
  try {
    const odooId = await odooCall("crm.lead", "create", [{
      name: `[${data.caseType}] ${data.name}`,
      contact_name: data.name,
      phone: data.phone || false,
      email_from: data.email || false,
      description: data.description,
      expected_revenue: data.estimatedFee || 0,
    }]);

    const lead: CaseIntake = {
      id: `ODOO-${odooId}`,
      ...data,
      status: "new",
      createdAt: new Date().toISOString(),
      source: "odoo",
    };
    console.error(`[Odoo] Created lead in Odoo: ${lead.id}`);
    return lead;
  } catch {
    // Fallback: in-memory
    const lead: CaseIntake = {
      id: `LEAD-${Date.now().toString(36).toUpperCase()}`,
      ...data,
      status: "new",
      createdAt: new Date().toISOString(),
      source: "fallback",
    };
    fallbackLeads.push(lead);
    console.error(`[Odoo] Fallback — stored in-memory: ${lead.id}`);
    return lead;
  }
}

// ─── Get Leads ───────────────────────────────────────────────
export async function getLeads(): Promise<CaseIntake[]> {
  try {
    const ids = await odooCall("crm.lead", "search", [[]], { limit: 50 });
    if (!ids || !ids.length) return fallbackLeads;

    const records = await odooCall("crm.lead", "read", [ids], {
      fields: ["id", "name", "contact_name", "phone", "email_from", "description", "stage_id", "create_date"],
    });

    const odooLeads: CaseIntake[] = (records as any[]).map((r: any) => ({
      id: `ODOO-${r.id}`,
      name: r.contact_name || r.name || "",
      phone: r.phone || undefined,
      email: r.email_from || undefined,
      caseType: extractCaseType(r.name),
      description: r.description || "",
      status: mapOdooStage(r.stage_id),
      createdAt: r.create_date || "",
      source: "odoo" as const,
    }));

    // Merge with any fallback leads
    return [...odooLeads, ...fallbackLeads];
  } catch {
    return fallbackLeads;
  }
}

// ─── Get Lead by ID ──────────────────────────────────────────
export async function getLeadById(id: string): Promise<CaseIntake | undefined> {
  // Fallback leads
  const fallback = fallbackLeads.find((l) => l.id === id);
  if (fallback) return fallback;

  // Odoo leads
  if (id.startsWith("ODOO-")) {
    try {
      const odooId = parseInt(id.replace("ODOO-", ""));
      const records = await odooCall("crm.lead", "read", [[odooId]], {
        fields: ["id", "name", "contact_name", "phone", "email_from", "description", "stage_id", "create_date"],
      });
      if (!records?.length) return undefined;
      const r = records[0] as any;
      return {
        id,
        name: r.contact_name || r.name || "",
        phone: r.phone || undefined,
        email: r.email_from || undefined,
        caseType: extractCaseType(r.name),
        description: r.description || "",
        status: mapOdooStage(r.stage_id),
        createdAt: r.create_date || "",
        source: "odoo",
      };
    } catch {
      return undefined;
    }
  }

  return undefined;
}

// ─── Helpers ─────────────────────────────────────────────────
function extractCaseType(name: string): string {
  const match = name?.match(/\[(\w+)\]/);
  return match ? match[1] : "other";
}

function mapOdooStage(stageId: any): CaseIntake["status"] {
  // Odoo stage_id is [id, name] tuple
  const name = Array.isArray(stageId) ? (stageId[1] || "").toLowerCase() : "";
  if (name.includes("new") || name.includes("ใหม่")) return "new";
  if (name.includes("contact") || name.includes("ติดต่อ")) return "contacted";
  if (name.includes("qualif") || name.includes("ประเมิน")) return "qualified";
  if (name.includes("won") || name.includes("convert") || name.includes("รับเรื่อง")) return "converted";
  return "new";
}
