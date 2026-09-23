import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const outPath = path.resolve('docs/use-case-diagram-n10.pdf');
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 24, bottom: 24, left: 24, right: 24 },
  info: {
    Title: 'CQI Monitoring System - Use Case Diagram',
    Author: 'NBSC Institute of Computer Studies',
    Subject: 'Use Case Diagram matching n10.png',
    CreationDate: new Date(),
  }
});
const stream = fs.createWriteStream(outPath);
doc.pipe(stream);

const W = 595.28;
const H = 841.89;

// Colors matching reference (clean, print-friendly)
const C = {
  bg: '#f8fafc',
  grid: '#e9eef5', // very light grid like graph paper
  systemFill: '#ffffff',
  systemStroke: '#94a3b8',
  systemHeaderFill: '#f1f5f9',
  ovalFill: '#ffffff',
  ovalStroke: '#64748b',
  line: '#334155',
  text: '#0f172a',
  muted: '#64748b',
  actor: '#0f172a',
};

// --- Background + grid (like reference) ---
doc.rect(0, 0, W, H).fill(C.bg);

// light grid
doc.save();
doc.strokeColor(C.grid).lineWidth(0.5);
const gridStep = 16;
// vertical lines
for (let x = 0; x < W; x += gridStep) {
  doc.moveTo(x, 0).lineTo(x, H).stroke();
}
// horizontal
for (let y = 0; y < H; y += gridStep) {
  doc.moveTo(0, y).lineTo(W, y).stroke();
}
doc.restore();

// --- System boundary (centered tall rectangle) ---
const sx = 138;
const sy = 38;
const sw = 318;
const sh = 740;
const headerH = 24;

// outer system rect
doc.save();
doc.roundedRect(sx, sy, sw, sh, 4).fillAndStroke(C.systemFill, C.systemStroke);
doc.lineWidth(1);
doc.restore();

// header bar
doc.save();
doc.roundedRect(sx, sy, sw, headerH, 4).fill(C.systemHeaderFill);
doc.rect(sx, sy + headerH - 4, sw, 4).fill(C.systemHeaderFill); // square bottom of header
doc.strokeColor(C.systemStroke).lineWidth(1).roundedRect(sx, sy, sw, headerH, 4).stroke();
doc.restore();

// title
doc.save();
doc.fillColor(C.text).font('Helvetica-Bold').fontSize(10);
doc.text('CQI Monitoring System', sx, sy + 7, { width: sw, align: 'center' });
doc.restore();

// inner content rect (ovals live inside, with small padding)
const ix = sx + 2;
const iy = sy + headerH + 2;
const iw = sw - 4;
const ih = sh - headerH - 4;
doc.save();
doc.strokeColor('#cbd5e1').lineWidth(0.6).rect(ix, iy, iw, ih).stroke();
doc.restore();

// --- Use cases: 15 ellipses vertically centered ---
const useCases = [
  'Accesses the System',
  'View Dashboard',
  'Manage Users',
  'Manage BSIT Curriculum',
  'Manage Courses',
  'Manage Course Syllabi',
  'Manage Program Outcomes',
  'Manage Course Outcomes',
  'Manage Assessment Data',
  'Review Curriculum Mapping',
  'Review Outcomes Alignment',
  'Review Assessment Results',
  'View D3.js Visualizations',
  'Manage CQI Recommendations',
  'Generate CQI Reports',
];

const cx = sx + sw / 2;
const ovalRx = 88;
const ovalRy = 13.5;
const startY = iy + 28;
const stepY = 46; // spacing

// store centers for line drawing
const centers = [];

useCases.forEach((label, i) => {
  const cy = startY + i * stepY;
  centers.push({ cx, cy, label, idx: i + 1, rx: ovalRx, ry: ovalRy });
  // ellipse
  doc.save();
  doc.ellipse(cx, cy, ovalRx, ovalRy).fillAndStroke(C.ovalFill, C.ovalStroke);
  doc.lineWidth(1);
  doc.restore();
  // text
  doc.save();
  doc.fillColor(C.text).font('Helvetica').fontSize(7);
  // For long labels, split if needed, but most fit in one line
  doc.text(label, cx - ovalRx + 8, cy - 4.5, { width: ovalRx * 2 - 16, align: 'center', lineBreak: false });
  doc.restore();
});

// --- Actors ---
function drawActor(x, y, label) {
  // y is center of actor figure
  const headR = 11;
  const headY = y - 18;
  const bodyTop = y - 7;
  const bodyBottom = y + 14;
  const armY = y - 2;

  doc.save();
  doc.strokeColor(C.actor).lineWidth(1.6);
  // head
  doc.circle(x, headY, headR).stroke();
  // body vertical
  doc.moveTo(x, bodyTop).lineTo(x, bodyBottom).stroke();
  // arms horizontal with slight curve? just straight
  doc.moveTo(x - 14, armY).lineTo(x + 14, armY).stroke();
  // left leg
  doc.moveTo(x, bodyBottom).lineTo(x - 10, bodyBottom + 14).stroke();
  // right leg
  doc.moveTo(x, bodyBottom).lineTo(x + 10, bodyBottom + 14).stroke();
  // label
  doc.fillColor(C.text).font('Helvetica').fontSize(8);
  doc.text(label, x - 30, bodyBottom + 16, { width: 60, align: 'center' });
  doc.restore();
  return { x, y: headY, bodyX: x, armY, legY: bodyBottom };
}

// Positions matching reference: Manager upper-left, User lower-left, Administrator mid-right
const manager = drawActor(48, 280, 'Manager');
const user = drawActor(48, 560, 'User');
const admin = drawActor(548, 380, 'Administrator');

// For line routing, use small offsets so lines don't overlap at origin too much.
// We'll jitter origin slightly per connection.

function drawLine(ax, ay, bx, by) {
  doc.save();
  doc.strokeColor(C.line).lineWidth(0.7).opacity(0.9);
  doc.moveTo(ax, ay).lineTo(bx, by).stroke();
  doc.restore();
}

function leftEdge(center) {
  // intersection with ellipse left side (approx horizontal)
  return { x: center.cx - center.rx + 1, y: center.cy };
}
function rightEdge(center) {
  return { x: center.cx + center.rx - 1, y: center.cy };
}

// Connections per n10.png interpretation
// Manager (left middle) -> many
// User (left bottom) -> subset (mainly review/view/CQI)
// Administrator (right) -> manage side

// We'll define lists by oval index (1-based)
// From careful trace of reference image:
// - Manager connects to: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15  (all) — visible dense fan from manager
// - User connects to: 1,2,10,11,12,13,14,15 + also 9 (Manage Assessment Data) per image lower fan
// - Administrator connects to: 1,2,3,4,5,6,7,8,9,15 (?) — top manage block + Generate at bottom diagonal
// Let's match exactly visual density: count right side lines = 9 (1-8 +15)
// left Manager lines = 15, left User lines = 9 (1,2,9-15) => total matches image density.

const managerOvals = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15];
const userOvals = [1,2,9,10,11,12,13,14,15]; // User also to View Dashboard per common access
const adminOvals = [1,2,3,4,5,6,7,8,15]; // admin to manage block + top + bottom Generate

// Draw Manager lines (origin jitter)
managerOvals.forEach((idx, k) => {
  const c = centers[idx - 1];
  const target = leftEdge(c);
  // origin: manager actor central area, jitter vertically small to separate lines at source
  // manager at (48,280) body region; we spread origins over ~18px vertical around armY
  const originY = manager.armY + (k - managerOvals.length/2) * 1.2;
  // clamp
  const oy = Math.max(manager.armY - 14, Math.min(manager.armY + 14, originY));
  const ox = manager.x + 14; // right arm tip
  drawLine(ox, oy, target.x, target.y);
});

// User lines
userOvals.forEach((idx, k) => {
  const c = centers[idx - 1];
  const target = leftEdge(c);
  const originY = user.armY + (k - userOvals.length/2) * 1.6;
  const oy = Math.max(user.armY - 10, Math.min(user.armY + 10, originY));
  const ox = user.x + 14;
  drawLine(ox, oy, target.x, target.y);
});

// Admin lines (from left side of admin figure to right edge of oval)
adminOvals.forEach((idx, k) => {
  const c = centers[idx - 1];
  const target = rightEdge(c);
  const originY = admin.armY + (k - adminOvals.length/2) * 1.8;
  const oy = Math.max(admin.armY - 18, Math.min(admin.armY + 18, originY));
  const ox = admin.x - 14; // left arm tip
  drawLine(ox, oy, target.x, target.y);
});

// Optional footer small note
doc.save();
doc.fillColor(C.muted).font('Helvetica-Oblique').fontSize(5);
doc.text('Generated to match C:\\Users\\HP\\Downloads\\n10.png  •  vector PDF  •  docs/use-case-diagram-n10.pdf', 24, H - 14, { width: W - 48, align: 'center' });
doc.restore();

doc.end();

stream.on('finish', () => {
  const stat = fs.statSync(outPath);
  console.log(`PDF created: ${outPath} (${(stat.size/1024).toFixed(1)} KB) — ${useCases.length} use cases`);
});
