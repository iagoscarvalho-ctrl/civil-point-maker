// DXF processor for estaqueamento generation.
// Parses pairs (code, value), augments the ENTITIES section, returns new DXF text.

type Pair = [string, string];

interface Entity {
  type: string;
  pairs: Pair[];
}

const PV_LAYER = "PV";
const POLY_LAYER = "ELEVACAO_05_LINHA_EIXO";
const OUT_PV_TEXT_LAYER = "ELEVACAO_19_TEXTO_PVS";
const OUT_REDE_TEXT_LAYER = "ELEVACAO_19_TEXTO_REDE";
const OUT_STAKE_LAYER = "ELEVACAO_00_ESTACAS";
const OUT_ARROW_LAYER = "ELEVACAO_34_SETA_FLUXO";
const ARROW_BLOCK = "seta";

// Layer that contains 3DFACE entities forming the TIN. Matched case-insensitively
// and tolerant of accents (Triangulação / Triangulacao / TRIANGULATION).
function isTinLayer(name: string): boolean {
  const n = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return n.startsWith("triangul");
}

function splitLines(src: string): string[] {
  return src.split(/\r\n|\r|\n/);
}

function getPair(e: Entity, code: string): string | undefined {
  const p = e.pairs.find((x) => x[0] === code);
  return p?.[1];
}
function getAll(e: Entity, code: string): string[] {
  return e.pairs.filter((x) => x[0] === code).map((x) => x[1]);
}
function num(v: string | undefined): number {
  return v === undefined ? NaN : parseFloat(v);
}

export interface ProcessResult {
  dxf: string;
  summary: {
    polylineCount: number;
    totalStakes: number;
    stakeSpacing: number;
    tinTriangles: number;
    stakesFromTin: number;
    polylines: Array<{
      pvA: { name: string; elev: number };
      pvB: { name: string; elev: number };
      length: number;
      stakes: number;
    }>;
  };
}

export interface ProcessOptions {
  spacing?: number; // meters between stakes, default 20
  textHeightPV?: number; // default 1.4
  textHeightStake?: number; // default 0.5
  textHeightRede?: number; // default 1.4
  arrowScale?: number; // default 1
}

export function processDxf(src: string, opts: ProcessOptions = {}): ProcessResult {
  const spacing = opts.spacing ?? 20;
  const hPV = opts.textHeightPV ?? 1.4;
  const hStake = opts.textHeightStake ?? 0.5;
  const hRede = opts.textHeightRede ?? 1.4;

  const lines = splitLines(src);

  const eol = src.includes("\r\n") ? "\r\n" : src.includes("\r") ? "\r" : "\n";

  function normalizeHandle(value: string | undefined): string | null {
    const raw = (value ?? "").trim().toUpperCase();
    if (!/^[0-9A-F]+$/.test(raw)) return null;
    return raw.replace(/^0+(?=[0-9A-F])/, "") || "0";
  }

  function isHandleCode(code: string): boolean {
    const n = Number(code.trim());
    return n === 5 || n === 105 || (n >= 320 && n <= 369) || n === 390 || n === 480 || n === 481;
  }

  // Reserve handles far above the source HANDSEED and skip every handle/reference
  // already present. This avoids AutoCAD collisions even in DXFs with stale seeds
  // or existing high handles such as 6EAB.
  const usedHandles = new Set<string>();
  let maxHandle = 0x1000000;
  for (let li = 0; li < lines.length - 1; li++) {
    if (!isHandleCode(lines[li])) continue;
    const normalized = normalizeHandle(lines[li + 1]);
    if (!normalized) continue;
    usedHandles.add(normalized);
    const h = parseInt(normalized, 16);
    if (!isNaN(h) && h > maxHandle) maxHandle = h;
  }
  const nextHandle = () => {
    let candidate = "";
    do {
      maxHandle += 1;
      candidate = maxHandle.toString(16).toUpperCase();
    } while (usedHandles.has(candidate));
    usedHandles.add(candidate);
    return candidate;
  };

  // Find ENTITIES section bounds
  let entStart = -1;
  let entEnd = -1; // index of the ENDSEC group code "0"
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].trim() === "2" && lines[i + 1].trim() === "ENTITIES") {
      // The section starts after the SECTION/2/ENTITIES header.
      // Move forward to the first group code line after the name.
      entStart = i + 2;
      break;
    }
  }
  if (entStart === -1) throw new Error("Seção ENTITIES não encontrada no DXF.");
  for (let i = entStart; i < lines.length - 1; i++) {
    if (lines[i].trim() === "0" && lines[i + 1].trim() === "ENDSEC") {
      entEnd = i;
      break;
    }
  }
  if (entEnd === -1) throw new Error("Fim da seção ENTITIES não encontrado.");

  // Parse entities between entStart and entEnd
  const entities: Entity[] = [];
  let i = entStart;
  let cur: Entity | null = null;
  while (i < entEnd) {
    const code = lines[i]?.trim();
    const val = lines[i + 1] ?? "";
    if (code === undefined) break;
    if (code === "0") {
      if (cur) entities.push(cur);
      cur = { type: val.trim(), pairs: [] };
    } else if (cur) {
      cur.pairs.push([code, val]);
    }
    i += 2;
  }
  if (cur) entities.push(cur);

  const modelSpaceOwner =
    entities
      .map((e) => (getPair(e, "330") ?? "").trim())
      .find((h) => normalizeHandle(h) !== null) ?? "1F";
  const textStyle =
    entities
      .filter((e) => e.type === "TEXT")
      .map((e) => (getPair(e, "7") ?? "").trim())
      .find(Boolean) ?? "Standard";

  // Find PV points (POINT entities on layer PV)
  const pvPoints = entities.filter(
    (e) => e.type === "POINT" && (getPair(e, "8") ?? "").trim() === PV_LAYER,
  );
  if (pvPoints.length < 2) {
    throw new Error(
      `Esperado ao menos 2 POINTs no layer "${PV_LAYER}", encontrado ${pvPoints.length}.`,
    );
  }
  const pvs = pvPoints.map((e) => ({
    x: num(getPair(e, "10")),
    y: num(getPair(e, "20")),
    z: num(getPair(e, "30")),
  }));

  // Find ALL polylines on the eixo layer
  const polys = entities.filter(
    (e) =>
      (e.type === "LWPOLYLINE" || e.type === "POLYLINE") &&
      (getPair(e, "8") ?? "").trim() === POLY_LAYER,
  );
  if (polys.length === 0) {
    throw new Error(`Nenhuma polyline encontrada no layer "${POLY_LAYER}".`);
  }

  // Try to find PV names from PV-layer TEXT entities, matching XY proximity.
  // In source files PV TEXTs are usually attribute-style stacked at the point.
  const pvTexts = entities.filter(
    (e) => e.type === "TEXT" && (getPair(e, "8") ?? "").trim() === PV_LAYER,
  );
  function findName(px: number, py: number): string | null {
    let best: { d: number; v: string } | null = null;
    for (const t of pvTexts) {
      const tx = num(getPair(t, "10"));
      const ty = num(getPair(t, "20"));
      const v = (getPair(t, "1") ?? "").trim();
      if (!v || v.toUpperCase() === "PV") continue;
      if (/^[-+]?\d+(\.\d+)?$/.test(v)) continue; // skip elevation number
      const d = Math.hypot(tx - px, ty - py);
      if (!best || d < best.d) best = { d, v };
    }
    return best && best.d < 5 ? best.v : null;
  }

  function nearestPV(px: number, py: number) {
    return pvs
      .map((p, idx) => ({ idx, p, d: Math.hypot(p.x - px, p.y - py) }))
      .sort((a, b) => a.d - b.d)[0];
  }

  // Build TIN from 3DFACE entities on the triangulação layer
  type Tri = { ax: number; ay: number; az: number; bx: number; by: number; bz: number; cx: number; cy: number; cz: number; minX: number; maxX: number; minY: number; maxY: number };
  const tris: Tri[] = [];
  for (const e of entities) {
    if (e.type !== "3DFACE") continue;
    if (!isTinLayer((getPair(e, "8") ?? "").trim())) continue;
    const p0 = [num(getPair(e, "10")), num(getPair(e, "20")), num(getPair(e, "30"))];
    const p1 = [num(getPair(e, "11")), num(getPair(e, "21")), num(getPair(e, "31"))];
    const p2 = [num(getPair(e, "12")), num(getPair(e, "22")), num(getPair(e, "32"))];
    const p3 = [num(getPair(e, "13")), num(getPair(e, "23")), num(getPair(e, "33"))];
    const pushTri = (a: number[], b: number[], c: number[]) => {
      if (a.some(isNaN) || b.some(isNaN) || c.some(isNaN)) return;
      tris.push({
        ax: a[0], ay: a[1], az: a[2],
        bx: b[0], by: b[1], bz: b[2],
        cx: c[0], cy: c[1], cz: c[2],
        minX: Math.min(a[0], b[0], c[0]),
        maxX: Math.max(a[0], b[0], c[0]),
        minY: Math.min(a[1], b[1], c[1]),
        maxY: Math.max(a[1], b[1], c[1]),
      });
    };
    pushTri(p0, p1, p2);
    // If 4th corner differs from 3rd, the 3DFACE is a quad; split into 2 tris
    if (Math.hypot(p3[0] - p2[0], p3[1] - p2[1], p3[2] - p2[2]) > 1e-9) {
      pushTri(p0, p2, p3);
    }
  }

  function interpZ(x: number, y: number): number | null {
    // Find triangle containing (x,y) via barycentric coords
    for (const t of tris) {
      if (x < t.minX || x > t.maxX || y < t.minY || y > t.maxY) continue;
      const v0x = t.bx - t.ax, v0y = t.by - t.ay;
      const v1x = t.cx - t.ax, v1y = t.cy - t.ay;
      const v2x = x - t.ax, v2y = y - t.ay;
      const den = v0x * v1y - v1x * v0y;
      if (Math.abs(den) < 1e-12) continue;
      const v = (v2x * v1y - v1x * v2y) / den;
      const w = (v0x * v2y - v2x * v0y) / den;
      const u = 1 - v - w;
      const eps = -1e-7;
      if (u >= eps && v >= eps && w >= eps) {
        return u * t.az + v * t.bz + w * t.cz;
      }
    }
    return null;
  }

  // Build new entity text
  const out: string[] = [];

  function emitText(layer: string, x: number, y: number, z: number, h: number, value: string) {
    const safeValue = value.replace(/[\r\n]+/g, " ");
    out.push(
      "  0", "TEXT",
      "  5", nextHandle(),
      "330", modelSpaceOwner,
      "100", "AcDbEntity",
      "  8", layer,
      "100", "AcDbText",
      " 10", String(x),
      " 20", String(y),
      " 30", String(z),
      " 40", String(h),
      "  1", safeValue,
      " 50", "0.0",
      "  7", textStyle,
      "100", "AcDbText",
    );
  }
  function emitPoint(layer: string, x: number, y: number, z: number) {
    out.push(
      "  0", "POINT",
      "  5", nextHandle(),
      "330", modelSpaceOwner,
      "100", "AcDbEntity",
      "  8", layer,
      "100", "AcDbPoint",
      " 10", String(x),
      " 20", String(y),
      " 30", String(z),
    );
  }
  function emitInsert(layer: string, block: string, x: number, y: number, rotDeg: number, scale: number) {
    out.push(
      "  0", "INSERT",
      "  5", nextHandle(),
      "330", modelSpaceOwner,
      "100", "AcDbEntity",
      "  8", layer,
      "100", "AcDbBlockReference",
      "  2", block,
      " 10", String(x),
      " 20", String(y),
      " 30", "0.0",
      " 41", String(scale),
      " 42", String(scale),
      " 43", String(scale),
      " 50", String(rotDeg),
    );
  }

  const offset = Math.max(0.8, hPV * 0.6);
  const stakeOff = Math.max(0.3, hStake * 0.6);
  const labelOff = Math.max(1.5, hRede * 1.1);

  // Dedupe PV labels emitted across polylines (a PV may be shared by multiple lines)
  const emittedPVs = new Set<number>();

  let totalStakes = 0;
  let interpolatedFromTin = 0;
  const polySummaries: ProcessResult["summary"]["polylines"] = [];

  for (const poly of polys) {
    const vxs = getAll(poly, "10").map(num);
    const vys = getAll(poly, "20").map(num);
    if (vxs.length < 2) continue;

    // Cumulative segment lengths
    const segLen: number[] = [];
    const cum: number[] = [0];
    for (let k = 0; k < vxs.length - 1; k++) {
      const L = Math.hypot(vxs[k + 1] - vxs[k], vys[k + 1] - vys[k]);
      segLen.push(L);
      cum.push(cum[k] + L);
    }
    const total = cum[cum.length - 1];
    if (total <= 0) continue;

    const pointAt = (s: number) => {
      let k = 0;
      while (k < segLen.length - 1 && cum[k + 1] < s) k++;
      const t = segLen[k] === 0 ? 0 : (s - cum[k]) / segLen[k];
      const x = vxs[k] + (vxs[k + 1] - vxs[k]) * t;
      const y = vys[k] + (vys[k + 1] - vys[k]) * t;
      const ang = Math.atan2(vys[k + 1] - vys[k], vxs[k + 1] - vxs[k]);
      return { x, y, ang };
    };

    // Match endpoints to PV POINTs
    const startNear = nearestPV(vxs[0], vys[0]);
    const endNear = nearestPV(vxs[vxs.length - 1], vys[vys.length - 1]);
    if (startNear.d > 5 || endNear.d > 5) {
      // Endpoints are too far from any PV — skip this polyline (likely not an eixo)
      continue;
    }
    const startPV = startNear.p;
    const endPV = endNear.p;
    const nameStart = findName(startPV.x, startPV.y) ?? "PV";
    const nameEnd = findName(endPV.x, endPV.y) ?? "PV";

    // PV name texts (only once per PV across the file)
    const a0 = Math.atan2(vys[1] - vys[0], vxs[1] - vxs[0]);
    const aN = Math.atan2(
      vys[vys.length - 1] - vys[vys.length - 2],
      vxs[vxs.length - 1] - vxs[vxs.length - 2],
    );
    if (!emittedPVs.has(startNear.idx)) {
      emittedPVs.add(startNear.idx);
      emitText(
        OUT_PV_TEXT_LAYER,
        startPV.x + Math.cos(a0) * offset - Math.sin(a0) * offset,
        startPV.y + Math.sin(a0) * offset + Math.cos(a0) * offset,
        0,
        hPV,
        nameStart,
      );
    }
    if (!emittedPVs.has(endNear.idx)) {
      emittedPVs.add(endNear.idx);
      emitText(
        OUT_PV_TEXT_LAYER,
        endPV.x - Math.cos(aN) * offset - Math.sin(aN) * offset,
        endPV.y - Math.sin(aN) * offset + Math.cos(aN) * offset,
        0,
        hPV,
        nameEnd,
      );
    }

    // Stakes
    let n = 1;
    let stakesThis = 0;
    for (let s = spacing; s < total - 1e-6; s += spacing) {
      const p = pointAt(s);
      const tinZ = tris.length > 0 ? interpZ(p.x, p.y) : null;
      const z =
        tinZ !== null
          ? (interpolatedFromTin++, tinZ)
          : startPV.z + ((endPV.z - startPV.z) * s) / total;
      emitPoint(OUT_STAKE_LAYER, p.x, p.y, z);
      emitText(
        OUT_STAKE_LAYER,
        p.x - Math.sin(p.ang) * stakeOff,
        p.y + Math.cos(p.ang) * stakeOff,
        0,
        hStake,
        String(n),
      );
      n++;
      stakesThis++;
    }
    totalStakes += stakesThis;

    // Arrow + length text at midpoint
    const mid = pointAt(total / 2);
    const arrowRotDeg = (mid.ang * 180) / Math.PI;
    const perpX = -Math.sin(mid.ang);
    const perpY = Math.cos(mid.ang);
    emitInsert(OUT_ARROW_LAYER, ARROW_BLOCK, mid.x, mid.y, arrowRotDeg, opts.arrowScale ?? 1);
    emitText(
      OUT_REDE_TEXT_LAYER,
      mid.x + perpX * labelOff,
      mid.y + perpY * labelOff,
      0,
      hRede,
      `${total.toFixed(2)}m`,
    );

    polySummaries.push({
      pvA: { name: nameStart, elev: startPV.z },
      pvB: { name: nameEnd, elev: endPV.z },
      length: total,
      stakes: stakesThis,
    });
  }

  if (polySummaries.length === 0) {
    throw new Error(
      "Nenhuma polyline pôde ser processada (verifique se as extremidades coincidem com POINTs no layer PV).",
    );
  }

  // Inject before entEnd (the "0" line of ENDSEC)
  const before = lines.slice(0, entEnd);
  const after = lines.slice(entEnd);
  const finalLines = [...before, ...out, ...after];
  const nextSeed = (maxHandle + 1).toString(16).toUpperCase();
  for (let hi = 0; hi < finalLines.length - 3; hi++) {
    if (finalLines[hi].trim() !== "9" || finalLines[hi + 1].trim() !== "$HANDSEED") continue;
    for (let hj = hi + 2; hj < Math.min(hi + 20, finalLines.length - 1); hj++) {
      if (finalLines[hj].trim() === "5") {
        finalLines[hj + 1] = nextSeed;
        hi = finalLines.length;
        break;
      }
    }
  }
  const result = finalLines.join(eol);

  return {
    dxf: result,
    summary: {
      polylineCount: polySummaries.length,
      totalStakes,
      stakeSpacing: spacing,
      tinTriangles: tris.length,
      stakesFromTin: interpolatedFromTin,
      polylines: polySummaries,
    },
  };
}