// ฐานข้อมูลกฎหมายแรงงานไทย (PoC - มาตราหลักที่ใช้บ่อย)
export interface LawSection {
  act: string;
  section: number;
  title: string;
  summary: string;
  details: string;
  keywords: string[];
  compensation?: CompensationTable[];
}

export interface CompensationTable {
  yearsOfService: string;
  days: number;
  description: string;
}

export const LABOR_LAWS: LawSection[] = [
  {
    act: "พ.ร.บ.คุ้มครองแรงงาน พ.ศ. 2541",
    section: 118,
    title: "ค่าชดเชยกรณีเลิกจ้าง",
    summary: "นายจ้างต้องจ่ายค่าชดเชยให้แก่ลูกจ้างซึ่งถูกเลิกจ้าง",
    details: "ลูกจ้างซึ่งทำงานติดต่อกันครบระยะเวลาตามที่กำหนด มีสิทธิได้รับค่าชดเชยตามอัตราที่กฎหมายกำหนด เมื่อถูกเลิกจ้างโดยไม่มีความผิดตามมาตรา 119",
    keywords: ["เลิกจ้าง", "ค่าชดเชย", "ไล่ออก", "ถูกเลิกจ้าง", "ชดเชย", "unfair dismissal"],
    compensation: [
      { yearsOfService: "120 วัน ถึง 1 ปี", days: 30, description: "ค่าจ้างอัตราสุดท้าย 30 วัน" },
      { yearsOfService: "1 ปี ถึง 3 ปี", days: 90, description: "ค่าจ้างอัตราสุดท้าย 90 วัน" },
      { yearsOfService: "3 ปี ถึง 6 ปี", days: 180, description: "ค่าจ้างอัตราสุดท้าย 180 วัน" },
      { yearsOfService: "6 ปี ถึง 10 ปี", days: 240, description: "ค่าจ้างอัตราสุดท้าย 240 วัน" },
      { yearsOfService: "10 ปี ถึง 20 ปี", days: 300, description: "ค่าจ้างอัตราสุดท้าย 300 วัน" },
      { yearsOfService: "20 ปี ขึ้นไป", days: 400, description: "ค่าจ้างอัตราสุดท้าย 400 วัน" },
    ],
  },
  {
    act: "พ.ร.บ.คุ้มครองแรงงาน พ.ศ. 2541",
    section: 119,
    title: "เหตุที่นายจ้างไม่ต้องจ่ายค่าชดเชย",
    summary: "นายจ้างไม่ต้องจ่ายค่าชดเชยกรณีลูกจ้างกระทำความผิดร้ายแรง",
    details: "นายจ้างไม่ต้องจ่ายค่าชดเชยกรณี: (1) ทุจริตต่อหน้าที่ (2) จงใจทำให้เสียหาย (3) ประมาทเลินเล่ออย่างร้ายแรง (4) ฝ่าฝืนข้อบังคับ/ระเบียบ โดยได้รับหนังสือเตือนแล้ว (5) ละทิ้งหน้าที่ 3 วันทำงานติดต่อกัน (6) ได้รับโทษจำคุกตามคำพิพากษา",
    keywords: ["ไม่จ่ายค่าชดเชย", "ความผิดร้ายแรง", "ทุจริต", "ละทิ้งหน้าที่", "หนังสือเตือน", "119"],
  },
  {
    act: "พ.ร.บ.คุ้มครองแรงงาน พ.ศ. 2541",
    section: 17,
    title: "การบอกกล่าวล่วงหน้า",
    summary: "สัญญาจ้างไม่มีกำหนดระยะเวลา ต้องบอกกล่าวล่วงหน้าอย่างน้อย 1 งวดการจ่ายค่าจ้าง",
    details: "กรณีสัญญาจ้างไม่มีกำหนดระยะเวลา ฝ่ายใดฝ่ายหนึ่งอาจบอกเลิกสัญญาได้ โดยบอกกล่าวล่วงหน้าเป็นหนังสือในวันจ่ายค่าจ้าง เพื่อให้มีผลในวันจ่ายค่าจ้างถัดไป หรือจ่ายค่าจ้างแทนการบอกกล่าวล่วงหน้า",
    keywords: ["บอกกล่าวล่วงหน้า", "ลาออก", "เลิกจ้าง", "สินจ้างแทนการบอกกล่าว", "notice"],
  },
  {
    act: "พ.ร.บ.คุ้มครองแรงงาน พ.ศ. 2541",
    section: 67,
    title: "ค่าจ้างในวันลาป่วย",
    summary: "ลูกจ้างมีสิทธิลาป่วยได้เท่าที่ป่วยจริง โดยได้รับค่าจ้างไม่เกิน 30 วันทำงานต่อปี",
    details: "ลูกจ้างมีสิทธิลาป่วยได้เท่าที่ป่วยจริง การลาป่วยตั้งแต่ 3 วันทำงานขึ้นไป นายจ้างอาจให้ลูกจ้างแสดงใบรับรองแพทย์",
    keywords: ["ลาป่วย", "ใบรับรองแพทย์", "sick leave", "วันลา"],
  },
  {
    act: "พ.ร.บ.คุ้มครองแรงงาน พ.ศ. 2541",
    section: 76,
    title: "ค่าล่วงเวลา",
    summary: "นายจ้างต้องจ่ายค่าล่วงเวลาไม่น้อยกว่า 1.5 เท่าของอัตราค่าจ้างต่อชั่วโมง",
    details: "กรณีให้ลูกจ้างทำงานล่วงเวลาในวันทำงาน นายจ้างต้องจ่ายค่าล่วงเวลาไม่น้อยกว่า 1.5 เท่า กรณีวันหยุดต้องจ่ายไม่น้อยกว่า 3 เท่า",
    keywords: ["ค่าล่วงเวลา", "OT", "ทำงานล่วงเวลา", "overtime", "วันหยุด"],
  },
  {
    act: "พ.ร.บ.จัดตั้งศาลแรงงานฯ พ.ศ. 2522",
    section: 49,
    title: "การเลิกจ้างไม่เป็นธรรม",
    summary: "ศาลแรงงานมีอำนาจสั่งให้นายจ้างรับลูกจ้างกลับเข้าทำงาน หรือชดใช้ค่าเสียหาย",
    details: "กรณีศาลเห็นว่าเป็นการเลิกจ้างไม่เป็นธรรม ศาลอาจสั่งให้นายจ้างรับลูกจ้างกลับเข้าทำงาน หรือให้จ่ายค่าเสียหายแทน โดยพิจารณาจากอายุงาน ความเดือดร้อน ของลูกจ้าง และเหตุผลในการเลิกจ้าง",
    keywords: ["เลิกจ้างไม่เป็นธรรม", "ศาลแรงงาน", "ค่าเสียหาย", "unfair dismissal", "ฟ้อง"],
  },
];

// Fee schedule for legal services
export interface FeeSchedule {
  type: string;
  services: ServiceFee[];
}

export interface ServiceFee {
  service: string;
  priceRange: { min: number; max: number };
  unit: string;
  description: string;
}

export const FEE_SCHEDULES: FeeSchedule[] = [
  {
    type: "labor",
    services: [
      { service: "consultation", priceRange: { min: 1500, max: 3000 }, unit: "ครั้ง", description: "ปรึกษาเบื้องต้นกฎหมายแรงงาน (30-60 นาที)" },
      { service: "letter", priceRange: { min: 3000, max: 8000 }, unit: "ฉบับ", description: "ร่างหนังสือทวงถาม/เตือน" },
      { service: "negotiation", priceRange: { min: 10000, max: 30000 }, unit: "เคส", description: "เจรจาไกล่เกลี่ยข้อพิพาทแรงงาน" },
      { service: "litigation", priceRange: { min: 30000, max: 80000 }, unit: "เคส", description: "ดำเนินคดีที่ศาลแรงงาน" },
    ],
  },
  {
    type: "contract",
    services: [
      { service: "consultation", priceRange: { min: 2000, max: 5000 }, unit: "ครั้ง", description: "ปรึกษาเบื้องต้นกฎหมายสัญญา" },
      { service: "draft", priceRange: { min: 5000, max: 20000 }, unit: "ฉบับ", description: "ร่าง/ตรวจสอบสัญญา" },
      { service: "litigation", priceRange: { min: 50000, max: 150000 }, unit: "เคส", description: "ดำเนินคดีแพ่ง" },
    ],
  },
  {
    type: "criminal",
    services: [
      { service: "consultation", priceRange: { min: 2000, max: 5000 }, unit: "ครั้ง", description: "ปรึกษาเบื้องต้นคดีอาญา" },
      { service: "bail", priceRange: { min: 10000, max: 30000 }, unit: "ครั้ง", description: "ยื่นประกันตัว" },
      { service: "litigation", priceRange: { min: 50000, max: 200000 }, unit: "เคส", description: "ว่าความคดีอาญา" },
    ],
  },
];

// Helper: search laws by keyword
export function searchLaws(query: string): LawSection[] {
  const q = query.toLowerCase();
  return LABOR_LAWS.filter((law) =>
    law.keywords.some((kw) => q.includes(kw.toLowerCase()) || kw.toLowerCase().includes(q)) ||
    law.title.toLowerCase().includes(q) ||
    law.summary.toLowerCase().includes(q)
  );
}

// Helper: calculate compensation
export function calculateCompensation(yearsOfService: number): CompensationTable | null {
  const section118 = LABOR_LAWS.find((l) => l.section === 118);
  if (!section118?.compensation) return null;

  if (yearsOfService < 120 / 365) return null;
  if (yearsOfService < 1) return section118.compensation[0];
  if (yearsOfService < 3) return section118.compensation[1];
  if (yearsOfService < 6) return section118.compensation[2];
  if (yearsOfService < 10) return section118.compensation[3];
  if (yearsOfService < 20) return section118.compensation[4];
  return section118.compensation[5];
}

// Helper: get fee estimate
export function getFeeEstimate(type: string, service: string): ServiceFee | null {
  const schedule = FEE_SCHEDULES.find((s) => s.type === type);
  if (!schedule) return null;
  return schedule.services.find((s) => s.service === service) || null;
}
