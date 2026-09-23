import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const outPath = path.resolve('docs/use-case-diagram.pdf');
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 24, bottom: 24, left: 24, right: 24 },
  info: {
    Title: '3.5 System Diagrams - Use-Case Diagram - CQI Monitoring System',
    Author: 'NBSC Institute of Computer Studies',
    Subject: 'Program->PEO / PO->Course / LO+viz  in n10 connectability layout',
    CreationDate: new Date(),
  }
});
const stream = fs.createWriteStream(outPath);
doc.pipe(stream);

const W = 595.28;
const H = 841.89;

const C = {
  bg: '#f8fafc',
  grid: '#e9eef5',
  systemFill: '#ffffff',
  systemStroke: '#94a3b8',
  systemHeaderFill: '#f1f5f9',
  ovalFill: '#ffffff',
  ovalStroke: '#64748b',
  ovalAdmin: '#1e40af',
  ovalManager: '#0e7490',
  ovalUser: '#047857',
  ovalCommon: '#334155',
  line: '#334155',
  text: '#0f172a',
  muted: '#64748b',
  actor: '#0f172a',
};

// Background + grid (n10 style)
doc.rect(0, 0, W, H).fill(C.bg);
doc.save();
doc.strokeColor(C.grid).lineWidth(0.5);
for (let x = 0; x < W; x += 16) doc.moveTo(x, 0).lineTo(x, H).stroke();
for (let y = 0; y < H; y += 16) doc.moveTo(0, y).lineTo(W, y).stroke();
doc.restore();

// Header banner for 3.5
doc.save();
doc.rect(0, 0, W, 18).fill(C.systemHeaderFill);
doc.strokeColor(C.systemStroke).lineWidth(0.6).moveTo(0, 18).lineTo(W, 18).stroke();
doc.fillColor(C.muted).font('Helvetica').fontSize(6);
doc.text('3.5  System Diagrams  —  Use-Case Diagram', 24, 6, { width: 280 });
doc.fillColor(C.muted).font('Helvetica-Oblique').fontSize(5);
doc.text('Program → PEO (Admin)  /  PO → Course (Manager)  /  LO + Visualization (Faculty)  •  n10 connectability layout', W - 340, 6, { width: 320, align: 'right' });
doc.restore();

// System boundary (same as n10, tall centered)
const sx = 138;
const sy = 38;
const sw = 318;
const sh = 750;
const headerH = 24;

doc.save();
doc.roundedRect(sx, sy, sw, sh, 4).fillAndStroke(C.systemFill, C.systemStroke);
doc.lineWidth(1);
doc.restore();

doc.save();
doc.roundedRect(sx, sy, sw, headerH, 4).fill(C.systemHeaderFill);
doc.rect(sx, sy + headerH - 4, sw, 4).fill(C.systemHeaderFill);
doc.strokeColor(C.systemStroke).lineWidth(1).roundedRect(sx, sy, sw, headerH, 4).stroke();
doc.fillColor(C.text).font('Helvetica-Bold').fontSize(10);
doc.text('CQI Monitoring System', sx, sy + 7, { width: sw, align: 'center' });
doc.restore();

const ix = sx + 2;
const iy = sy + headerH + 2;
const iw = sw - 4;
const ih = sh - headerH - 4;
doc.save();
doc.strokeColor('#cbd5e1').lineWidth(0.6).rect(ix, iy, iw, ih).stroke();
doc.restore();

// --- Project-specific use cases (15) in n10 central column ---
// Each entry: lines[] for oval text, group for color hint
const useCases = [
  { lines: ['Accesses the System'], group: 'common', detail: 'Sign In/Out • handle_new_user • sync_demo_role • record_login_event' },
  { lines: ['View Dashboard'], group: 'common', detail: 'Role-based dashboard (admin/manager/user)' },
  { lines: ['View / Edit Own Profile'], group: 'common', detail: 'profiles (own) • updateProfile' },
  { lines: ['Browse Curriculum'], group: 'common', detail: 'resources (read) • programs/courses read' },
  { lines: ['Manage Program'], group: 'admin', detail: 'programs CRUD+D • Program→PEO slice' },
  { lines: ['Manage PEO'], group: 'admin', detail: 'program_educational_objectives • PEO-1..n' },
  { lines: ['Manage Strategic Goals', '& CHED Memo Orders'], group: 'admin', detail: 'strategic_goals • ched_memorandum_orders' },
  { lines: ['Manage Users & Roles'], group: 'admin', detail: 'profiles • admin-users Edge Function' },
  { lines: ['Manage Program Outcomes'], group: 'manager', detail: 'admin_program_outcomes • PO-1..n • cmo_id/peo_id/sg_id' },
  { lines: ['Manage Courses / Curriculum', '(PO → Course)'], group: 'manager', detail: 'courses + resources • curriculum_id • prereq/coreq' },
  { lines: ['Manage LO (CLO)'], group: 'user', detail: 'admin_course_learning_outcomes • cloMatchesSubject • course field' },
  { lines: ['View Faculty Directory'], group: 'manager', detail: 'profiles read (manager/admin)' },
  { lines: ['View Activity Logs'], group: 'manager', detail: 'activity_logs • log_activity RPC • admin/manager' },
  { lines: ['Visualization — Full', '(Admin manage + view)'], group: 'admin', detail: 'Subject Graph D3 • Subject→CLO→PO→PEO→SG→CMO' },
  { lines: ['Visualization — View', '(Faculty read-only)'], group: 'user', detail: 'Subject Graph read-only • same D3 hierarchy' },
];

const cx = sx + sw / 2;
const ovalRx = 94;
const ovalRy = 13.5;
const startY = iy + 28;
const stepY = 46;

const centers = [];
useCases.forEach((uc, i) => {
  const cy = startY + i * stepY;
  const group = uc.group;
  let stroke = C.ovalStroke;
  if (group === 'admin') stroke = C.ovalAdmin;
  else if (group === 'manager') stroke = C.ovalManager;
  else if (group === 'user') stroke = C.ovalUser;
  else stroke = C.ovalCommon;
  centers.push({ cx, cy, rx: ovalRx, ry: ovalRy, idx: i + 1, group, lines: uc.lines });

  doc.save();
  doc.ellipse(cx, cy, ovalRx, ovalRy).fillAndStroke(C.ovalFill, stroke);
  doc.lineWidth(1);
  doc.restore();

  // label - handle 1 or 2 lines
  doc.save();
  doc.fillColor(C.text).font('Helvetica').fontSize(6.6);
  if (uc.lines.length === 1) {
    doc.text(uc.lines[0], cx - ovalRx + 8, cy - 4.2, { width: ovalRx * 2 - 16, align: 'center', lineBreak: false });
  } else {
    doc.font('Helvetica').fontSize(6.2);
    doc.text(uc.lines[0], cx - ovalRx + 8, cy - 8.5, { width: ovalRx * 2 - 16, align: 'center', lineBreak: false });
    doc.text(uc.lines[1], cx - ovalRx + 8, cy + 1.2, { width: ovalRx * 2 - 16, align: 'center', lineBreak: false });
  }
  doc.restore();
});

// Color dots legend inside system bottom
doc.save();
const legendY = iy + ih - 18;
doc.fillColor(C.muted).font('Helvetica').fontSize(4.8);
doc.text('● Admin (Program→PEO)   ● Manager (PO→Course)   ● Faculty (LO)   ● Common', cx - 110, legendY, { width: 220, align: 'center' });
doc.restore();

// --- Actors (same positions as n10) ---
function drawActor(x, y, label, sublabel, color) {
  const headR = 11;
  const headY = y - 18;
  const bodyTop = y - 7;
  const bodyBottom = y + 14;
  const armY = y - 2;
  doc.save();
  doc.strokeColor(color || C.actor).lineWidth(1.6);
  doc.circle(x, headY, headR).stroke();
  doc.moveTo(x, bodyTop).lineTo(x, bodyBottom).stroke();
  doc.moveTo(x - 14, armY).lineTo(x + 14, armY).stroke();
  doc.moveTo(x, bodyBottom).lineTo(x - 10, bodyBottom + 14).stroke();
  doc.moveTo(x, bodyBottom).lineTo(x + 10, bodyBottom + 14).stroke();
  doc.fillColor(C.text).font('Helvetica').fontSize(7.5);
  doc.text(label, x - 30, bodyBottom + 16, { width: 60, align: 'center' });
  if (sublabel) {
    doc.fillColor(C.muted).font('Helvetica').fontSize(5.2);
    doc.text(sublabel, x - 36, bodyBottom + 25, { width: 72, align: 'center' });
  }
  doc.restore();
  return { x, armY, headY };
}

const manager = drawActor(48, 285, 'Manager', 'PO → Course', C.ovalManager);
const user = drawActor(48, 560, 'Faculty (User)', 'LO + Visualization', C.ovalUser);
const admin = drawActor(548, 375, 'Administrator', 'Program → PEO', C.ovalAdmin);

function drawLine(ax, ay, bx, by, color) {
  doc.save();
  doc.strokeColor(color || C.line).lineWidth(0.7).opacity(0.92);
  doc.moveTo(ax, ay).lineTo(bx, by).stroke();
  doc.restore();
}
function leftEdge(c) { return { x: c.cx - c.rx + 1, y: c.cy }; }
function rightEdge(c) { return { x: c.cx + c.rx - 1, y: c.cy }; }

// --- Connectability (n10 inside-circle wiring) but with project slice ---
// Admin (Program→PEO + full viz): common 1-4 + manage 5-8 + PO 9 + course 10 + LO 11 + full viz 14
// Manager (PO→Course): common 1-4 + PO 9 + course 10 + LO 11 + directory 12 + logs 13
// Faculty (LO+view): common 1-4 + LO 11 + view viz 15

const adminOvals = [1,2,3,4,5,6,7,8,9,10,11,14];
const managerOvals = [1,2,3,4,9,10,11,12,13];
const userOvals = [1,2,3,4,11,15];

const connColor = {
  admin: C.ovalAdmin,
  manager: C.ovalManager,
  user: C.ovalUser,
};

adminOvals.forEach((idx, k) => {
  const c = centers[idx - 1];
  const target = rightEdge(c);
  const oy = admin.armY + (k - adminOvals.length/2) * 1.7;
  const ox = admin.x - 14;
  drawLine(ox, Math.max(admin.armY - 18, Math.min(admin.armY + 18, oy)), target.x, target.y, connColor.admin);
});
managerOvals.forEach((idx, k) => {
  const c = centers[idx - 1];
  const target = leftEdge(c);
  const oy = manager.armY + (k - managerOvals.length/2) * 1.5;
  const ox = manager.x + 14;
  drawLine(ox, Math.max(manager.armY - 14, Math.min(manager.armY + 14, oy)), target.x, target.y, connColor.manager);
});
userOvals.forEach((idx, k) => {
  const c = centers[idx - 1];
  const target = leftEdge(c);
  const oy = user.armY + (k - userOvals.length/2) * 1.6;
  const ox = user.x + 14;
  drawLine(ox, Math.max(user.armY - 10, Math.min(user.armY + 10, oy)), target.x, target.y, connColor.user);
});

// Small hierarchy hint inside
doc.save();
doc.fillColor(C.muted).font('Helvetica-Oblique').fontSize(4.6);
doc.text('hierarchy:  Strategic Goals / CMO  →  PEO  →  PO  →  Course / Curriculum  →  CLO(LO)  →  Visualization', cx - 130, iy + ih - 8, { width: 260, align: 'center' });
doc.restore();

// Footer for 3.5
doc.save();
doc.fillColor(C.muted).font('Helvetica-Oblique').fontSize(5);
doc.text('Fig. 3.5  Use-Case Diagram  •  CQI Monitoring System  •  docs/use-case-diagram.pdf  •  generated via scripts/generate-use-case-pdf.mjs', 24, H - 14, { width: W - 48, align: 'center' });
doc.restore();

// --- Add second page for 3.5 details? Keep single page for figure, second page appendix optional but we keep single as n10 style ---
// Instead, we will add a tiny legend box at bottom outside system for DB mapping
doc.save();
doc.roundedRect(24, H - 38, W - 48, 20, 4).fill('#ffffff');
doc.strokeColor(C.systemStroke).lineWidth(0.6).roundedRect(24, H - 38, W - 48, 20, 4).stroke();
doc.fillColor(C.muted).font('Helvetica').fontSize(4.8);
doc.text('DB: programs → program_educational_objectives → strategic_goals/ched_memorandum_orders  |  PO→Course: admin_program_outcomes ↔ courses/resources  |  LO: admin_course_learning_outcomes.course = subject code (cloMatchesSubject)', 28, H - 32, { width: W - 56, align: 'center' });
doc.restore();

doc.end();
stream.on('finish', () => {
  const stat = fs.statSync(outPath);
  console.log(`PDF created: ${outPath} (${(stat.size/1024).toFixed(1)} KB) — hybrid 3.5 (${useCases.length} use cases)`);
});
