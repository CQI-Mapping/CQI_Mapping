import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const outPath = path.resolve('docs/use-case-diagram.pdf');

// Ensure docs exists
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 36, bottom: 36, left: 36, right: 36 },
  info: {
    Title: 'CQI Monitoring System - Use Case Diagram',
    Author: 'NBSC Institute of Computer Studies',
    Subject: 'Program->PEO / PO->Course / LO+Visualization',
    CreationDate: new Date(),
  }
});

const stream = fs.createWriteStream(outPath);
doc.pipe(stream);

// Colors
const C = {
  navy: '#0f172a',
  slate: '#334155',
  muted: '#64748b',
  light: '#f1f5f9',
  border: '#cbd5e1',
  borderDark: '#94a3b8',
  primary: '#2563eb',
  primaryLight: '#eff6ff',
  accent: '#7c3aed',
  admin: '#1e40af',
  manager: '#0e7490',
  user: '#047857',
  system: '#475569',
  bg: '#f8fafc',
};

// Helpers
function drawEllipse(doc, cx, cy, rx, ry, opts = {}) {
  const { fill = '#ffffff', stroke = C.borderDark, strokeWidth = 1.2 } = opts;
  doc.save();
  // approximate ellipse with bezier
  doc.ellipse(cx, cy, rx, ry);
  if (fill) {
    doc.fillAndStroke(fill, stroke);
  } else {
    doc.stroke(stroke);
  }
  doc.lineWidth(strokeWidth);
  doc.restore();
}

function drawRect(doc, x, y, w, h, opts = {}) {
  const { fill, stroke = C.borderDark, radius = 8, strokeWidth = 1 } = opts;
  doc.save();
  doc.lineWidth(strokeWidth);
  doc.roundedRect(x, y, w, h, radius);
  if (fill && stroke) doc.fillAndStroke(fill, stroke);
  else if (fill) doc.fill(fill);
  else if (stroke) doc.stroke(stroke);
  doc.restore();
}

function drawActor(doc, x, y, label, sublabel, color) {
  // stickman
  const cx = x;
  const headY = y - 28;
  const bodyTop = y - 18;
  const bodyBottom = y + 8;
  doc.save();
  doc.lineWidth(1.4);
  doc.strokeColor(color || C.slate);
  // head
  doc.circle(cx, headY, 9);
  doc.stroke();
  // body
  doc.moveTo(cx, bodyTop).lineTo(cx, bodyBottom).stroke();
  // arms
  doc.moveTo(cx - 12, y - 10).lineTo(cx + 12, y - 10).stroke();
  // legs
  doc.moveTo(cx, bodyBottom).lineTo(cx - 10, y + 22).stroke();
  doc.moveTo(cx, bodyBottom).lineTo(cx + 10, y + 22).stroke();
  // label
  doc.fillColor(C.navy);
  doc.font('Helvetica-Bold').fontSize(7.5);
  doc.text(label, cx - 30, y + 26, { width: 60, align: 'center' });
  if (sublabel) {
    doc.fillColor(C.muted);
    doc.font('Helvetica').fontSize(6);
    doc.text(sublabel, cx - 30, y + 36, { width: 60, align: 'center' });
  }
  doc.restore();
  return { cx, y: headY };
}

function drawLine(doc, x1, y1, x2, y2, opts = {}) {
  const { stroke = C.slate, width = 0.8, dash = null, opacity = 0.9 } = opts;
  doc.save();
  doc.strokeColor(stroke).lineWidth(width).opacity(opacity);
  if (dash) doc.dash(dash[0], { space: dash[1] });
  doc.moveTo(x1, y1).lineTo(x2, y2).stroke();
  doc.undash();
  doc.restore();
}

function drawDashedInclude(doc, x1, y1, x2, y2, label) {
  drawLine(doc, x1, y1, x2, y2, { stroke: C.muted, width: 0.7, dash: [3, 3], opacity: 0.8 });
  // arrow head
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const len = 6;
  doc.save();
  doc.strokeColor(C.muted).lineWidth(0.7).fillColor(C.muted);
  doc.moveTo(x2, y2)
    .lineTo(x2 - len * Math.cos(angle - Math.PI / 6), y2 - len * Math.sin(angle - Math.PI / 6))
    .lineTo(x2 - len * Math.cos(angle + Math.PI / 6), y2 - len * Math.sin(angle + Math.PI / 6))
    .closePath().fill().stroke();
  doc.restore();
  if (label) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2 - 6;
    doc.save();
    doc.fillColor(C.muted).font('Helvetica-Oblique').fontSize(5.5);
    doc.text(label, mx - 18, my, { width: 36, align: 'center' });
    doc.restore();
  }
}

function ellipseText(doc, cx, cy, rx, ry, lines, opts = {}) {
  const { fontSize = 6.2, boldFirst = true, color = C.navy } = opts;
  doc.save();
  doc.fillColor(color);
  let y = cy - (lines.length - 1) * (fontSize * 0.75 + 1.5) / 2;
  // we offset to center vertically
  const totalH = lines.length * (fontSize + 1.2);
  let startY = cy - totalH / 2 + 2;
  lines.forEach((line, i) => {
    const isBold = boldFirst && i === 0;
    doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(isBold ? fontSize + 0.3 : fontSize);
    // adjust width to ellipse width at this y
    // simplify: fixed width
    doc.text(line, cx - rx + 6, startY, { width: rx * 2 - 12, align: 'center', lineBreak: false });
    startY += isBold ? fontSize + 2.2 : fontSize + 1.8;
  });
  doc.restore();
}

// ===== PAGE 1 =====
const W = 595.28;
const H = 841.89;
const margin = 36;

// Background
doc.rect(0, 0, W, H).fill(C.bg);

// Header bar
doc.save();
doc.rect(0, 0, W, 58).fill(C.navy);
doc.fillColor('#ffffff');
doc.font('Helvetica-Bold').fontSize(14);
doc.text('CQI Monitoring System', 36, 14, { width: 380 });
doc.font('Helvetica').fontSize(8);
doc.fillColor('#cbd5e1');
doc.text('Use Case Diagram  —  Program → PEO  /  PO → Course  /  LO + Visualization', 36, 32, { width: 380 });
doc.fillColor('#93c5fd');
doc.font('Helvetica-Bold').fontSize(6.5);
doc.text('ROLE-BASED STARTER  •  React + Vite + Supabase (RLS)', 36, 44, { width: 380 });
doc.fillColor('#ffffff');
doc.font('Helvetica').fontSize(6);
doc.text('NBSC · Institute of Computer Studies  •  2026', W - 150, 18, { width: 120, align: 'right' });
doc.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), W - 150, 28, { width: 120, align: 'right' });
doc.fontSize(5).fillColor('#93c5fd');
doc.text('docs/use-case-diagram.pdf  •  A4 portrait  •  vector', W - 150, 38, { width: 120, align: 'right' });
doc.restore();

// System boundary
const sx = 132;
const sy = 78;
const sw = 430;
const sh = 505;
drawRect(doc, sx, sy, sw, sh, { fill: '#ffffff', stroke: C.borderDark, radius: 10, strokeWidth: 1.1 });
doc.save();
doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(7);
doc.text('CQI MONITORING SYSTEM', sx + 10, sy + 8, { width: sw - 20 });
doc.fillColor(C.muted).font('Helvetica').fontSize(5.5);
doc.text('Boundary = authenticated app  •  RLS is the real gate (supabase-schema.sql)', sx + 10, sy + 17, { width: sw - 20 });
doc.restore();
// subtle inner line
doc.save();
doc.strokeColor(C.light).lineWidth(0.8);
doc.moveTo(sx + 8, sy + 26).lineTo(sx + sw - 8, sy + 26).stroke();
doc.restore();

// Actors - left side
drawActor(doc, 62, 150, 'Admin', 'Program → PEO', C.admin);
drawActor(doc, 62, 250, 'Manager', 'PO → Course', C.manager);
drawActor(doc, 62, 360, 'Faculty (User)', 'LO + View', C.user);
drawActor(doc, 62, 480, 'System', 'Supabase Auth/DB', C.system);
drawActor(doc, 62, 545, 'Visitor', 'Unauthenticated', '#64748b');

// Actor labels small box for visitor note
doc.save();
doc.fillColor(C.muted).font('Helvetica-Oblique').fontSize(5);
doc.text('Visitor → Sign In → becomes Admin/Manager/User', 28, 572, { width: 90, align: 'center' });
doc.restore();

// ===== Use Cases definitions =====
// Positions: sx + offset
// We define each ellipse with cx, cy, rx, ry, fill, label lines
const UC = [];

// Helper to add
function addUC(id, cx, cy, rx, ry, fill, stroke, lines) {
  drawEllipse(doc, cx, cy, rx, ry, { fill, stroke });
  ellipseText(doc, cx, cy, rx, ry, lines, { fontSize: 6, color: C.navy });
  UC.push({ id, cx, cy, rx, ry });
}

// Common auth at top
addUC('UC01', 348, 112, 62, 18, C.primaryLight, C.primary, ['UC01  Sign In / Sign Out', 'auth.login → profile + sync_demo_role']);
// Common browse/dashboard
addUC('UC0A', 230, 145, 48, 16, '#ffffff', C.borderDark, ['UC0  Dashboard', 'View own dashboard']);
addUC('UC0B', 348, 145, 48, 16, '#ffffff', C.borderDark, ['UC0  Own Profile', 'View / Edit own profile']);
addUC('UC0C', 466, 145, 50, 16, '#ffffff', C.borderDark, ['UC0  Browse Curriculum', 'resources (read)']);

// Admin cluster - y ~190-240
addUC('A1', 210, 198, 58, 20, '#eff6ff', C.admin, ['A1  Manage Program', 'programs CRUD + archive']);
addUC('A2', 348, 198, 62, 20, '#eff6ff', C.admin, ['A2  Manage PEO / SG / CMO', 'PEO, Strategic Goals, CHED']);
addUC('A3', 485, 198, 56, 20, '#eff6ff', C.admin, ['A3  Users & Roles', 'view all, change role, create']);
// Admin visualization
addUC('A4', 348, 245, 78, 22, '#dbeafe', C.admin, ['A4  Visualization  (Admin) — full', 'Subject Graph  manage + view  D3.js']);

// Manager cluster
addUC('M1', 250, 300, 60, 20, '#ecfeff', C.manager, ['M1  Manage Program Outcomes', 'admin_program_outcomes']);
addUC('M2', 405, 300, 64, 20, '#ecfeff', C.manager, ['M2  PO → Course / Curriculum', 'courses + resources mapping']);
addUC('M3a', 250, 352, 54, 18, '#ffffff', C.manager, ['M3  Faculty Directory', 'read-only (manager)']);
addUC('M3b', 405, 352, 58, 18, '#ffffff', C.manager, ['M3  Activity Logs', 'view (manager)']);

// User cluster
addUC('U1', 250, 410, 62, 20, '#ecfdf5', C.user, ['U1  Manage LO (CLO)', 'admin_course_learning_outcomes']);
addUC('U2', 405, 410, 68, 20, '#d1fae5', C.user, ['U2  Visualization  (Faculty) — view', 'Subject Graph  read-only']);
addUC('U3', 328, 462, 58, 18, '#ffffff', C.user, ['U3  Browse Curriculum', 'read-only (LO view)']);

// Secondary links labels inside
doc.save();
doc.fillColor(C.muted).font('Helvetica-Oblique').fontSize(5);
doc.text('hierarchy:  SG/CMO  →  PEO  →  PO  →  Course  →  CLO(LO)', sx + sw/2 - 90, sy + sh - 12, { width: 180, align: 'center' });
doc.restore();

// ===== Connections Actor -> UC =====
// Admin to A1,A2,A3,A4 + common
const adminX = 62;
const adminY = 150 - 5; // approximate center for line origin (body)
// We'll draw from actor right edge (x+12) to ellipse left edge
function connectActor(actorX, actorY, uc) {
  const ax = actorX + 14;
  const ay = actorY;
  // compute intersection with ellipse left side approx
  const ex = uc.cx - uc.rx;
  const ey = uc.cy;
  // slightly offset ay to target ey for cleaner diagonal
  drawLine(doc, ax, ay, ex, ey, { stroke: C.slate, width: 0.7 });
}

// Admin connections
connectActor(62, 142, UC.find(u => u.id === 'UC01'));
connectActor(62, 148, UC.find(u => u.id === 'UC0A'));
connectActor(62, 150, UC.find(u => u.id === 'UC0B'));
connectActor(62, 152, UC.find(u => u.id === 'A1'));
connectActor(62, 154, UC.find(u => u.id === 'A2'));
connectActor(62, 156, UC.find(u => u.id === 'A3'));
connectActor(62, 158, UC.find(u => u.id === 'A4'));

// Manager connections - manager at y 250
connectActor(62, 242, UC.find(u => u.id === 'UC01'));
connectActor(62, 245, UC.find(u => u.id === 'UC0A'));
connectActor(62, 248, UC.find(u => u.id === 'UC0B'));
connectActor(62, 252, UC.find(u => u.id === 'M1'));
connectActor(62, 255, UC.find(u => u.id === 'M2'));
connectActor(62, 258, UC.find(u => u.id === 'M3a'));
connectActor(62, 260, UC.find(u => u.id === 'M3b'));

// Faculty connections - y 360
connectActor(62, 352, UC.find(u => u.id === 'UC01'));
connectActor(62, 355, UC.find(u => u.id === 'UC0A'));
connectActor(62, 358, UC.find(u => u.id === 'UC0B'));
connectActor(62, 362, UC.find(u => u.id === 'U1'));
connectActor(62, 365, UC.find(u => u.id === 'U2'));
connectActor(62, 368, UC.find(u => u.id === 'U3'));

// System connections - to UC01 (dotted include)
// System -> UC01 includes: handle_new_user, sync_demo_role, record_login_event
drawDashedInclude(doc, 76, 470, 290, 118, '<<include>>');
doc.save();
doc.fillColor(C.system).font('Helvetica').fontSize(5);
doc.text('handle_new_user / sync_demo_role / record_login_event', 78, 485, { width: 90, align: 'left' });
doc.restore();

// Visitor -> UC01
drawLine(doc, 76, 535, 290, 118, { stroke: '#64748b', width: 0.7, dash: [3,3] });
doc.save();
doc.fillColor('#64748b').font('Helvetica-Oblique').fontSize(5);
doc.text('authenticates', 110, 380, { width: 60, align: 'center' });
doc.restore();

// Hierarchy dashed dependencies: A1 -> A2 (Program→PEO), M1 -> M2 (PO→Course), U1 -> U2 (LO→PO)
drawDashedInclude(doc, 268, 198, 286, 198, ''); // A1->A2
drawLine(doc, 268, 198, 286, 198, { stroke: C.admin, width: 0.7, dash: [3,3] });
doc.save();
doc.fillColor(C.admin).font('Helvetica-Oblique').fontSize(5);
doc.text('Program → PEO', 232, 212, { width: 50, align: 'center' });
doc.restore();

drawDashedInclude(doc, 310, 300, 341, 300, '');
drawLine(doc, 310, 300, 341, 300, { stroke: C.manager, width: 0.7, dash: [3,3] });
doc.save();
doc.fillColor(C.manager).font('Helvetica-Oblique').fontSize(5);
doc.text('PO → Course', 312, 314, { width: 50, align: 'center' });
doc.restore();

drawDashedInclude(doc, 312, 410, 337, 410, '');
drawLine(doc, 312, 410, 337, 410, { stroke: C.user, width: 0.7, dash: [3,3] });
doc.save();
doc.fillColor(C.user).font('Helvetica-Oblique').fontSize(5);
doc.text('LO → PO', 314, 424, { width: 30, align: 'center' });
doc.restore();

// Also U1 -> U2 via title PO tokens note
doc.save();
doc.fillColor(C.muted).font('Helvetica').fontSize(4.8);
doc.text('via clo.title PO tokens → admin_program_outcomes (SubjectView.tsx:93)', 320, 432, { width: 100, align: 'center' });
doc.restore();

// Page 1 footer
doc.save();
doc.fillColor(C.muted).font('Helvetica').fontSize(5.5);
doc.text('1', W/2 - 10, H - 22, { width: 20, align: 'center' });
doc.text('RLS is the real gate  •  UI gating in src/App.tsx NAV/PAGES  •  Service layer src/services/database.ts', 36, H - 22, { width: W - 72, align: 'left' });
doc.restore();

// ===== PAGE 2 — Role Matrix + Notes =====
doc.addPage();
doc.rect(0, 0, W, H).fill(C.bg);
doc.rect(0, 0, W, 58).fill(C.navy);
doc.fillColor('#ffffff');
doc.font('Helvetica-Bold').fontSize(11);
doc.text('Role Matrix & Mapping Notes', 36, 16, { width: 380 });
doc.font('Helvetica').fontSize(7.5);
doc.fillColor('#cbd5e1');
doc.text('How Program→PEO / PO→Course / LO+Visualization maps to tables, RLS, and pages', 36, 32, { width: 500 });
doc.fillColor('#93c5fd');
doc.font('Helvetica').fontSize(6);
doc.text('Source: README.md Role Matrix  •  supabase-schema.sql RLS  •  src/App.tsx NAV', 36, 44, { width: 500 });

let y = 72;

// Table
const colX = [36, 190, 270, 350, 430];
const colW = [150, 78, 78, 78, 86];
const headers = ['Capability', 'Admin', 'Manager', 'Faculty (User)', 'Evidence'];
const rows = [
  ['Sign in / out, Dashboard, Own Profile', 'yes', 'yes', 'yes', 'Login.tsx, App.tsx'],
  ['Browse Curriculum (resources read)', 'yes', 'yes', 'yes', 'resources SELECT = authenticated'],
  ['Manage Program', 'yes CRUD+D', '—', '—', 'programs / Program.tsx'],
  ['Manage PEO / SG / CMO', 'yes CRUD+D', '—', '—', 'admin/*, RLS admin only'],
  ['Manage Program Outcomes (PO)', 'yes', 'yes C/U*', '—', 'admin_program_outcomes'],
  ['Manage Course / Curriculum', 'yes', 'yes C/U*', '—', 'courses + resources'],
  ['PO → Course mapping', '—', 'yes', '—', 'po links via peo_id/sg_id/cmo_id'],
  ['Manage LO (CLO) - create/edit', 'yes', 'yes', 'yes', 'admin_course_learning_outcomes'],
  ['Manage LO - delete', 'yes', '—', '—', 'DELETE = admin only'],
  ['Visualization (Subject Graph)', 'full (manage+view)', '—', 'view-only', 'SubjectView.tsx D3'],
  ['Faculty Directory', 'yes', 'yes (read)', '—', 'manager/Users.tsx'],
  ['Activity Logs', 'yes', 'yes (view)', '—', 'activity_logs SELECT admin/mgr'],
  ['Users & Roles (change role/create)', 'yes', '—', '—', 'admin/Users.tsx + admin-users fn'],
];

// Header bg
doc.save();
doc.rect(36, y, W - 72, 14).fill(C.navy);
doc.fillColor('#ffffff');
doc.font('Helvetica-Bold').fontSize(6);
headers.forEach((h, i) => {
  doc.text(h, colX[i] + 4, y + 4.5, { width: colW[i] - 8, align: i === 0 ? 'left' : 'center' });
});
doc.restore();
y += 14;

// Rows
rows.forEach((row, idx) => {
  const isAlt = idx % 2 === 0;
  doc.save();
  doc.rect(36, y, W - 72, 14).fill(isAlt ? '#ffffff' : '#f8fafc');
  doc.strokeColor(C.border).lineWidth(0.4).rect(36, y, W - 72, 14).stroke();
  // vertical dividers
  for (let i = 1; i < colX.length; i++) {
    doc.moveTo(colX[i], y).lineTo(colX[i], y + 14).stroke();
  }
  doc.restore();
  doc.fillColor(C.navy);
  row.forEach((cell, i) => {
    doc.font(i === 0 ? 'Helvetica' : 'Helvetica-Bold').fontSize(i === 0 ? 5.8 : 5.8);
    if (cell === 'yes') doc.fillColor('#0f766e');
    else if (cell === '—') doc.fillColor(C.muted);
    else if (cell.includes('C/U')) doc.fillColor(C.manager);
    else if (cell.includes('view')) doc.fillColor(C.user);
    else doc.fillColor(C.slate);
    const align = i === 0 || i === 4 ? 'left' : 'center';
    doc.text(cell, colX[i] + 4, y + 4.8, { width: colW[i] - 8, align, lineBreak: false });
  });
  // evidence smaller and muted left
  y += 14;
});
doc.save();
doc.fillColor(C.muted).font('Helvetica-Oblique').fontSize(5);
doc.text('* C/U = create/update only; delete = admin only (supabase-schema.sql:381,390,413).   D = delete.', 36, y + 4, { width: W - 72 });
doc.restore();
y += 16;

// Outcome hierarchy diagram (text flow)
doc.save();
doc.rect(36, y, W - 72, 62).fill('#ffffff');
doc.strokeColor(C.borderDark).lineWidth(0.8).roundedRect(36, y, W - 72, 62, 6).stroke();
doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(6.5);
doc.text('Outcome Hierarchy — how the visualization connects (SubjectView.tsx:5)', 44, y + 8, { width: W - 88 });
doc.fillColor(C.slate).font('Helvetica').fontSize(6);
// boxes flow
const flow = [
  { label: 'SG', sub: 'strategic_goals', color: '#d97706' },
  { label: 'CMO', sub: 'ched_memo_orders', color: '#0891b2' },
  { label: 'PEO', sub: 'program_educational_objectives', color: '#db2777' },
  { label: 'PO', sub: 'admin_program_outcomes', color: '#7c3aed' },
  { label: 'Course', sub: 'courses + curriculum', color: '#2563eb' },
  { label: 'CLO/LO', sub: 'admin_course_learning_outcomes', color: '#06b6d4' },
];
let fx = 44;
const boxW = 72;
const boxH = 28;
flow.forEach((b, i) => {
  doc.save();
  doc.roundedRect(fx, y + 20, boxW, boxH, 4).fill(b.color);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7);
  doc.text(b.label, fx, y + 24, { width: boxW, align: 'center' });
  doc.font('Helvetica').fontSize(4.5);
  doc.text(b.sub, fx + 2, y + 34, { width: boxW - 4, align: 'center' });
  doc.restore();
  if (i < flow.length - 1) {
    doc.save();
    doc.fillColor(C.slate).font('Helvetica-Bold').fontSize(8);
    doc.text('→', fx + boxW + 2, y + 30, { width: 10, align: 'center' });
    doc.restore();
  }
  fx += boxW + 14;
});
doc.fillColor(C.muted).font('Helvetica-Oblique').fontSize(5);
doc.text('Subject Graph:  Subject (double-ring) → Curriculum + Prereq/Coreq → CLOs → POs → PEO/SG/CMO  (SubjectView.tsx:20)', 44, y + 52, { width: W - 88, align: 'center' });
doc.restore();
y += 72;

// Responsibility slice boxes
doc.save();
doc.font('Helvetica-Bold').fontSize(6.5).fillColor(C.navy);
doc.text('Responsibility Slice (your requirement)', 36, y, { width: W - 72 });
y += 10;
const slices = [
  { title: 'Admin — Program → PEO', desc: 'Owns programs, PEOs, SG, CMO, users/roles, and full visualization (manage+view).', color: C.admin, bg: '#eff6ff' },
  { title: 'Manager — PO → Course', desc: 'Owns Program Outcomes and Course/Curriculum mapping; PO→Course via peo_id/sg_id/cmo_id links.', color: C.manager, bg: '#ecfeff' },
  { title: 'Faculty (User) — LO + View', desc: 'Owns LO (CLO create/edit) and read-only visualization + curriculum browse.', color: C.user, bg: '#ecfdf5' },
];
let sx2 = 36;
const sW = (W - 72 - 16) / 3;
slices.forEach((s) => {
  doc.save();
  doc.roundedRect(sx2, y, sW, 44, 6).fill(s.bg);
  doc.strokeColor(s.color).lineWidth(1).roundedRect(sx2, y, sW, 44, 6).stroke();
  doc.fillColor(s.color).font('Helvetica-Bold').fontSize(6);
  doc.text(s.title, sx2 + 6, y + 6, { width: sW - 12 });
  doc.fillColor(C.slate).font('Helvetica').fontSize(5.2);
  doc.text(s.desc, sx2 + 6, y + 16, { width: sW - 12 });
  doc.restore();
  sx2 += sW + 8;
});
doc.restore();
y += 54;

// Notes
doc.save();
doc.rect(36, y, W - 72, 70).fill('#fffbeb');
doc.strokeColor('#f59e0b').lineWidth(0.8).roundedRect(36, y, W - 72, 70, 6).stroke();
doc.fillColor('#92400e').font('Helvetica-Bold').fontSize(6);
doc.text('Notes — RLS & gating (read the lines, not just the boxes)', 44, y + 6, { width: W - 88 });
doc.fillColor('#78350f').font('Helvetica').fontSize(5.2);
const notes = [
  '• RLS is the real gate — hiding buttons is UX only. Policies in supabase-schema.sql use current_user_role().',
  '• resources: SELECT = authenticated, INSERT/UPDATE = admin|manager, DELETE = admin.',
  '• admin_course_learning_outcomes: INSERT/UPDATE = admin|manager|user, DELETE = admin (LO slice).',
  '• activity_logs: SELECT = admin|manager, INSERT via log_activity() SECURITY DEFINER (stamps JWT email).',
  '• Gating in src/App.tsx NAV + PAGES map coerces activePage to role-valid page.',
];
let ny = y + 16;
notes.forEach((n) => {
  doc.text(n, 44, ny, { width: W - 88 });
  ny += 8;
});
doc.restore();
y += 80;

// Test accounts
doc.save();
doc.rect(36, y, W - 72, 28).fill('#f1f5f9');
doc.strokeColor(C.border).lineWidth(0.6).roundedRect(36, y, W - 72, 28, 6).stroke();
doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(6);
doc.text('Test Accounts (README.md:66)', 44, y + 6, { width: 140 });
doc.fillColor(C.slate).font('Helvetica').fontSize(5.5);
doc.text('Admin — admin@cqi.test / Admin@123456    •    Manager — manager@cqi.test / Manager@123456    •    User — user@cqi.test / User@123456', 44, y + 14, { width: W - 88 });
doc.fillColor(C.muted).font('Helvetica-Oblique').fontSize(5);
doc.text('Roles restored on sign-in via sync_demo_role() — survives supabase-schema.sql re-run.', 44, y + 20, { width: W - 88 });
doc.restore();

// Footer page 2
doc.save();
doc.fillColor(C.muted).font('Helvetica').fontSize(5.5);
doc.text('2', W/2 - 10, H - 22, { width: 20, align: 'center' });
doc.text('Generated via scripts/generate-use-case-pdf.mjs  •  pdfkit vector  •  not a screenshot', 36, H - 22, { width: W - 72, align: 'left' });
doc.restore();

doc.end();

stream.on('finish', () => {
  const stat = fs.statSync(outPath);
  console.log(`PDF created: ${outPath} (${(stat.size/1024).toFixed(1)} KB)`);
});
