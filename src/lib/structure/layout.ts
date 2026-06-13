import type { GeoJSONGeometry, LocationType } from "@/lib/types";
import {
  MAX_STRUCTURE_DEPTH,
  MAX_STRUCTURE_NODES,
  type StructureNode,
  type StructureSpec,
} from "@/lib/structure/schema";

// A single location ready to be saved, with geometry already projected to lng/lat.
export type PlacedNode = {
  tempId: string;
  parentTempId: string | null;
  type: LocationType;
  name: string;
  geometry: GeoJSONGeometry;
};

export type Anchor = { lng: number; lat: number };

// ---- internal layout works in a flat meters plane, projected to lng/lat at the end ----

type Rect = { x: number; y: number; w: number; h: number };

type Instance = {
  tempId: string;
  parentTempId: string | null;
  type: LocationType;
  name: string;
  children: Instance[];
};

const PAD = 0.5; // inner padding inside a container, meters
const GAP = 0.6; // gap between sibling containers, meters

// Default footprint (meters) for a container that has no container children.
const LEAF_SIZE: Record<string, { w: number; h: number }> = {
  bed: { w: 1.2, h: 6 },
  hoophouse: { w: 4, h: 10 },
  field: { w: 12, h: 18 },
  zone: { w: 8, h: 10 },
  farm: { w: 20, h: 24 },
  paddock: { w: 15, h: 20 },
};
const DEFAULT_LEAF = { w: 4, h: 4 };

const LINE_TYPES: ReadonlySet<LocationType> = new Set(["row", "alley", "fence"]);

export function isLineType(type: LocationType): boolean {
  return LINE_TYPES.has(type);
}

// Expand the LLM spec (with counts) into concrete numbered instances.
export function expandSpec(spec: StructureSpec): Instance[] {
  let counter = 0;
  const nextId = () => `n${counter++}`;

  function expand(
    node: StructureNode,
    parentTempId: string | null,
    depth: number,
  ): Instance[] {
    if (depth > MAX_STRUCTURE_DEPTH) {
      throw new Error("Structure is nested too deeply");
    }
    const count = node.count && node.count > 0 ? node.count : 1;
    const out: Instance[] = [];

    for (let i = 1; i <= count; i++) {
      const tempId = nextId();
      const name = count > 1 ? `${node.name} ${i}` : node.name;
      const inst: Instance = {
        tempId,
        parentTempId,
        type: node.type,
        name,
        children: [],
      };
      for (const child of node.children ?? []) {
        inst.children.push(...expand(child, tempId, depth + 1));
      }
      out.push(inst);
      if (counter > MAX_STRUCTURE_NODES) {
        throw new Error("Structure has too many parts to place at once");
      }
    }
    return out;
  }

  const roots: Instance[] = [];
  for (const node of spec.nodes) {
    roots.push(...expand(node, null, 1));
  }
  return roots;
}

function areaChildren(node: Instance): Instance[] {
  return node.children.filter((c) => !isLineType(c.type));
}
function lineChildren(node: Instance): Instance[] {
  return node.children.filter((c) => isLineType(c.type));
}

// Measure the footprint a container needs, bottom-up from its container children.
function measure(node: Instance): { w: number; h: number } {
  const areas = areaChildren(node);
  if (areas.length === 0) {
    return LEAF_SIZE[node.type] ?? DEFAULT_LEAF;
  }
  const sizes = areas.map(measure);
  const totalW = sizes.reduce((s, x) => s + x.w, 0) + GAP * (sizes.length - 1);
  const maxH = Math.max(...sizes.map((s) => s.h));
  return { w: totalW + 2 * PAD, h: maxH + 2 * PAD };
}

function rectToPolygon(rect: Rect): [number, number][] {
  const { x, y, w, h } = rect;
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
    [x, y],
  ];
}

// Place a container at `rect`, recursing into children. Pushes meter-space nodes.
type MeterNode = {
  tempId: string;
  parentTempId: string | null;
  type: LocationType;
  name: string;
  kind: "polygon" | "line";
  points: [number, number][];
};

function place(node: Instance, rect: Rect, out: MeterNode[]) {
  out.push({
    tempId: node.tempId,
    parentTempId: node.parentTempId,
    type: node.type,
    name: node.name,
    kind: "polygon",
    points: rectToPolygon(rect),
  });

  const inner: Rect = {
    x: rect.x + PAD,
    y: rect.y + PAD,
    w: Math.max(rect.w - 2 * PAD, 0.2),
    h: Math.max(rect.h - 2 * PAD, 0.2),
  };

  const areas = areaChildren(node);
  if (areas.length > 0) {
    const sizes = areas.map(measure);
    let cursorX = inner.x;
    areas.forEach((child, i) => {
      const size = sizes[i];
      const childRect: Rect = {
        x: cursorX,
        y: inner.y + (inner.h - size.h) / 2,
        w: size.w,
        h: size.h,
      };
      cursorX += size.w + GAP;
      place(child, childRect, out);
    });
  }

  // Lines (rows/alleys) fill the parent, evenly spaced across its short axis,
  // running along its long axis.
  const lines = lineChildren(node);
  if (lines.length > 0) {
    placeLines(lines, inner, out);
  }
}

function placeLines(lines: Instance[], rect: Rect, out: MeterNode[]) {
  const n = lines.length;
  const alongX = rect.w >= rect.h;
  lines.forEach((line, i) => {
    const t = (i + 1) / (n + 1);
    const points: [number, number][] = alongX
      ? [
          [rect.x, rect.y + rect.h * t],
          [rect.x + rect.w, rect.y + rect.h * t],
        ]
      : [
          [rect.x + rect.w * t, rect.y],
          [rect.x + rect.w * t, rect.y + rect.h],
        ];
    out.push({
      tempId: line.tempId,
      parentTempId: line.parentTempId,
      type: line.type,
      name: line.name,
      kind: "line",
      points,
    });
  });
}

// Convert the whole layout from a meters plane (re-centered on its own bounds)
// to lng/lat anchored at the map center.
function project(points: [number, number][], center: { x: number; y: number }, anchor: Anchor) {
  const latRad = (anchor.lat * Math.PI) / 180;
  const mPerDegLat = 110540;
  const mPerDegLng = 111320 * Math.cos(latRad);
  return points.map(([mx, my]): [number, number] => {
    const lng = anchor.lng + (mx - center.x) / mPerDegLng;
    const lat = anchor.lat + (my - center.y) / mPerDegLat;
    return [lng, lat];
  });
}

// Build a complete, map-ready set of placed locations from an LLM structure spec.
export function layoutStructure(spec: StructureSpec, anchor: Anchor): PlacedNode[] {
  const roots = expandSpec(spec);
  const meterNodes: MeterNode[] = [];

  // Lay roots out left-to-right. Area roots first, then any stray line roots below.
  const areaRoots = roots.filter((r) => !isLineType(r.type));
  const lineRoots = roots.filter((r) => isLineType(r.type));

  let cursorX = 0;
  let maxH = 0;
  for (const root of areaRoots) {
    const size = measure(root);
    place(root, { x: cursorX, y: 0, w: size.w, h: size.h }, meterNodes);
    cursorX += size.w + GAP;
    maxH = Math.max(maxH, size.h);
  }

  // Stray fences/alleys with no container parent: default 8m lines stacked below.
  let lineY = -2;
  for (const root of lineRoots) {
    meterNodes.push({
      tempId: root.tempId,
      parentTempId: root.parentTempId,
      type: root.type,
      name: root.name,
      kind: "line",
      points: [
        [0, lineY],
        [Math.max(cursorX - GAP, 8), lineY],
      ],
    });
    lineY -= 1.5;
  }

  // Recenter on the layout's own bounds so it lands centered on the anchor.
  const allPoints = meterNodes.flatMap((n) => n.points);
  const xs = allPoints.map((p) => p[0]);
  const ys = allPoints.map((p) => p[1]);
  const center = {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };

  return meterNodes.map((n) => {
    const coords = project(n.points, center, anchor);
    const geometry: GeoJSONGeometry =
      n.kind === "polygon"
        ? { type: "Polygon", coordinates: [coords] }
        : { type: "LineString", coordinates: coords };
    return {
      tempId: n.tempId,
      parentTempId: n.parentTempId,
      type: n.type,
      name: n.name,
      geometry,
    };
  });
}
