import fs from 'fs';
import path from 'path';

const outPath = path.resolve('docs/use-case-diagram.drawio');
fs.mkdirSync(path.dirname(outPath), { recursive: true });

// Hybrid project content (same as PDF 3.5)
const useCases = [
  { id: 'uc01', label: 'Accesses the System', group: 'common' },
  { id: 'uc02', label: 'View Dashboard', group: 'common' },
  { id: 'uc03', label: 'View / Edit Own Profile', group: 'common' },
  { id: 'uc04', label: 'Browse Curriculum', group: 'common' },
  { id: 'uc05', label: 'Manage Program', group: 'admin' },
  { id: 'uc06', label: 'Manage PEO', group: 'admin' },
  { id: 'uc07a', label: 'Manage Strategic Goals', group: 'admin' },
  { id: 'uc07b', label: 'Manage CHED Memo Orders', group: 'admin' },
  { id: 'uc09', label: 'Manage Program Outcomes', group: 'manager' },
  { id: 'uc10', label: 'Manage Courses / Curriculum\n(PO → Course)', group: 'manager' },
  { id: 'uc11', label: 'Manage LO (CLO)', group: 'user' },
  { id: 'uc12', label: 'View Faculty Directory', group: 'manager' },
  { id: 'uc13', label: 'View Activity Logs', group: 'manager' },
  { id: 'uc14', label: 'Visualization — Full\n(Admin manage + view)', group: 'admin' },
  { id: 'uc15', label: 'Visualization — View\n(Faculty read-only)', group: 'user' },
];

// For compact drawing, merge 7a/7b into one oval with two lines? We'll keep as two separate to keep 15? Actually list above has 15 if we count 7a+7b as 2 => total 15. Let's keep as defined.
// But we have 15 entries as above (count): 1-6 =6, 7a=7, 7b=8, 9=9,10=10,11=11,12=12,13=13,14=14,15=15 => 15

const colors = {
  common: '#334155',
  admin: '#1e40af',
  manager: '#0e7490',
  user: '#047857',
};

// Layout: same as n10 grid but for draw.io coordinates
// Canvas approx 900x1100
// System boundary: x=260, y=80, w=380, h=900
// Actors: Manager (80,340), User (80,700), Administrator (760,450)
// Use cases: centered at cx=450, startY=130, step=52, rx=140, ry=22

const sx = 260, sy = 80, sw = 380, sh = 900;
const cx = 450;
const startY = 130;
const stepY = 52;
const rx = 140, ry = 22;

// Actors positions
const actors = [
  { id: 'actor_manager', label: 'Manager\nPO → Course', x: 80, y: 340, color: colors.manager },
  { id: 'actor_user', label: 'Faculty (User)\nLO + Visualization', x: 80, y: 700, color: colors.user },
  { id: 'actor_admin', label: 'Administrator\nProgram → PEO', x: 760, y: 450, color: colors.admin },
];

// Connections (same as hybrid PDF slice)
const adminOvals = [1,2,3,4,5,6,7,8,9,10,11,14];
const managerOvals = [1,2,3,4,9,10,11,12,13];
const userOvals = [1,2,3,4,11,15];

function escapeXml(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

let cells = [];
let idCounter = 2; // 0,1 reserved for root
function nextId(){ return `c${idCounter++}`; }

const rootCells = `
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
`;

// Helpers to create vertex and edge
let xmlCells = '';

// System header and boundary
xmlCells += `
    <mxCell id="${nextId()}" value="" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f1f5f9;strokeColor=#94a3b8;" vertex="1" parent="1">
      <mxGeometry x="${sx}" y="${sy}" width="${sw}" height="28" as="geometry" />
    </mxCell>
`;
xmlCells += `
    <mxCell id="${nextId()}" value="CQI Monitoring System" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=12;fontStyle=1;fontColor=#0f172a;" vertex="1" parent="1">
      <mxGeometry x="${sx}" y="${sy}" width="${sw}" height="28" as="geometry" />
    </mxCell>
`;
xmlCells += `
    <mxCell id="${nextId()}" value="" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#94a3b8;" vertex="1" parent="1">
      <mxGeometry x="${sx}" y="${sy+28}" width="${sw}" height="${sh-28}" as="geometry" />
    </mxCell>
`;
// inner grid hint label
xmlCells += `
    <mxCell id="${nextId()}" value="3.5 System Diagrams — Use-Case Diagram  (drag any oval/actor to edit, reconnect lines)" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=8;fontColor=#64748b;fontStyle=2;" vertex="1" parent="1">
      <mxGeometry x="${sx}" y="${sy+sh-14}" width="${sw}" height="14" as="geometry" />
    </mxCell>
`;

// Actors - use UML actor shape available in draw.io: shape=mxgraph.uml.actor
actors.forEach(a => {
  const actorId = a.id;
  // actor graphic
  xmlCells += `
    <mxCell id="${actorId}" value="" style="shape=mxgraph.uml.actor;verticalLabelPosition=bottom;verticalAlign=top;html=1;fillColor=#ffffff;strokeColor=${a.color};strokeWidth=2;" vertex="1" parent="1">
      <mxGeometry x="${a.x - 20}" y="${a.y - 30}" width="40" height="60" as="geometry" />
    </mxCell>
  `;
  // label below actor
  xmlCells += `
    <mxCell id="${actorId}_label" value="${escapeXml(a.label)}" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=9;fontColor=#0f172a;" vertex="1" parent="1">
      <mxGeometry x="${a.x - 60}" y="${a.y + 32}" width="120" height="28" as="geometry" />
    </mxCell>
  `;
  // sub color dot? not needed
});

// Use cases - ellipses
const ucIds = [];
useCases.forEach((uc, i) => {
  const cy = startY + i * stepY;
  const id = `uc_${uc.id}`;
  ucIds.push({ id, idx: i+1, cy });
  const color = colors[uc.group] || colors.common;
  const label = escapeXml(uc.label);
  // ellipse shape: ellipse; perimeter=ellipsePerimeter
  xmlCells += `
    <mxCell id="${id}" value="${label}" style="ellipse;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=${color};strokeWidth=1.5;fontSize=8;fontColor=#0f172a;align=center;verticalAlign=middle;" vertex="1" parent="1">
      <mxGeometry x="${cx - rx}" y="${cy - ry}" width="${rx*2}" height="${ry*2}" as="geometry" />
    </mxCell>
  `;
});

// Edges - use orthogonal? No, straight lines as in n10 (straight)
// For each connection, create edge from actor to uc
function addEdge(source, target, color){
  const eid = nextId();
  xmlCells += `
    <mxCell id="${eid}" value="" style="endArrow=none;html=1;strokeColor=${color};strokeWidth=1;rounded=0;exitX=1;exitY=0.5;entryX=0;entryY=0.5;" edge="1" parent="1" source="${source}" target="${target}">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
  `;
}

// Admin edges
adminOvals.forEach(idx => {
  const target = `uc_${useCases[idx-1].id}`;
  addEdge('actor_admin', target, colors.admin);
});
managerOvals.forEach(idx => {
  const target = `uc_${useCases[idx-1].id}`;
  addEdge('actor_manager', target, colors.manager);
});
userOvals.forEach(idx => {
  const target = `uc_${useCases[idx-1].id}`;
  addEdge('actor_user', target, colors.user);
});

// Hierarchy note
xmlCells += `
    <mxCell id="${nextId()}" value="hierarchy:  Strategic Goals / CMO  →  PEO  →  PO  →  Course / Curriculum  →  CLO(LO)  →  Visualization (Subject→CLO→PO→PEO→SG→CMO)" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=7;fontColor=#64748b;fontStyle=2;" vertex="1" parent="1">
      <mxGeometry x="${sx}" y="${sy+sh-28}" width="${sw}" height="14" as="geometry" />
    </mxCell>
`;

// Legend
xmlCells += `
    <mxCell id="${nextId()}" value="● Admin (Program→PEO)   ● Manager (PO→Course)   ● Faculty (LO)   ● Common" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=7;fontColor=#64748b;" vertex="1" parent="1">
      <mxGeometry x="${sx}" y="${sy+sh-42}" width="${sw}" height="14" as="geometry" />
    </mxCell>
`;

// Assemble full xml
const content = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" version="21.0.0">
  <diagram id="CQI-3-5" name="3.5 Use-Case Diagram">
    <mxGraphModel dx="1422" dy="768" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
        ${rootCells}
        ${xmlCells}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
`;

fs.writeFileSync(outPath, content, 'utf8');
console.log(`draw.io created: ${outPath} (${(fs.statSync(outPath).size/1024).toFixed(1)} KB) — ${useCases.length} use cases editable`);
