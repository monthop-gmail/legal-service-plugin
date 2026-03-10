// Odoo CRM Integration Service (Stub for PoC)
// Production: ใช้ XML-RPC หรือ REST API ของ Odoo

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
}

// In-memory store for PoC (production: Odoo database)
const leads: CaseIntake[] = [];

const ODOO_URL = process.env.ODOO_URL || "http://odoo:8069";
const ODOO_DB = process.env.ODOO_DB || "legal_th";
const ODOO_USER = process.env.ODOO_USER || "admin";
const ODOO_PASS = process.env.ODOO_PASS || "admin";

export async function createLead(data: {
  name: string;
  phone?: string;
  email?: string;
  caseType: string;
  description: string;
  estimatedFee?: number;
}): Promise<CaseIntake> {
  const lead: CaseIntake = {
    id: `LEAD-${Date.now().toString(36).toUpperCase()}`,
    ...data,
    status: "new",
    createdAt: new Date().toISOString(),
  };

  // PoC: in-memory store
  leads.push(lead);

  // Production: Odoo XML-RPC call
  // await odooCreateLead(lead);

  console.error(`[Odoo] Created lead: ${lead.id} - ${lead.name} (${lead.caseType})`);
  return lead;
}

export async function getLeads(): Promise<CaseIntake[]> {
  return leads;
}

export async function getLeadById(id: string): Promise<CaseIntake | undefined> {
  return leads.find((l) => l.id === id);
}

// Production Odoo integration (commented out for PoC)
/*
import xmlrpc from 'xmlrpc';

async function odooCreateLead(lead: CaseIntake) {
  const client = xmlrpc.createClient({ host: ODOO_URL, port: 8069, path: '/xmlrpc/2/object' });
  const uid = await authenticate();

  return new Promise((resolve, reject) => {
    client.methodCall('execute_kw', [
      ODOO_DB, uid, ODOO_PASS,
      'crm.lead', 'create', [{
        name: `[${lead.caseType}] ${lead.name}`,
        contact_name: lead.name,
        phone: lead.phone,
        email_from: lead.email,
        description: lead.description,
        expected_revenue: lead.estimatedFee,
        tag_ids: [[6, 0, [getTagId(lead.caseType)]]],
      }]
    ], (err, value) => err ? reject(err) : resolve(value));
  });
}
*/
