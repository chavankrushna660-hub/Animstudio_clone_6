import { Point, CustomVectorDeformNode } from '../types';

/**
 * Calculates deformed object points given original object points and custom vector deform nodes.
 * Uses localized smooth Gaussian displacement blending: dragging a node moves and blends
 * the local region around that node, while leaving distant drawing geometry completely intact
 * without global scaling or full-shape translation.
 *
 * @param origPoints - Array of original un-deformed object points
 * @param nodes - Array of custom vector deform nodes with current (x, y) and rest (origX, origY)
 * @param stiffness - Local influence radius parameter (default ~35)
 */
export function calculateCustomVectorDeformedPoints(
  origPoints: Point[],
  nodes: CustomVectorDeformNode[],
  stiffness: number = 35
): Point[] {
  if (!origPoints || origPoints.length === 0) return [];
  if (!nodes || nodes.length === 0) return origPoints;

  const activeDisplacements = nodes.map(n => {
    const rawDx = n.x - n.origX;
    const rawDy = n.y - n.origY;
    const sx = n.scaleX ?? 1;
    const sy = n.scaleY ?? 1;
    const rot = ((n.rotationZ || 0) * Math.PI) / 180;
    const skewX = ((n.skewX || 0) * Math.PI) / 180;
    const skewY = ((n.skewY || 0) * Math.PI) / 180;
    const wMult = (n.width && n.width > 0) ? n.width / 100 : 1;
    const hMult = (n.height && n.height > 0) ? n.height / 100 : 1;

    return {
      node: n,
      rawDx,
      rawDy,
      sx: sx * wMult,
      sy: sy * hMult,
      rot,
      skewX,
      skewY,
      origX: n.origX,
      origY: n.origY
    };
  });

  const hasMovement = activeDisplacements.some(
    d => Math.abs(d.rawDx) > 0.001 || Math.abs(d.rawDy) > 0.001 || Math.abs(d.sx - 1) > 0.001 || Math.abs(d.sy - 1) > 0.001 || Math.abs(d.rot) > 0.001 || Math.abs(d.skewX) > 0.001 || Math.abs(d.skewY) > 0.001
  );
  if (!hasMovement) {
    return origPoints;
  }

  // Calculate local influence radius based on stiffness
  const radius = Math.max(25, stiffness * 2.2);
  const radiusSq = radius * radius;

  return origPoints.map(pt => {
    let totalDispX = 0;
    let totalDispY = 0;
    let hasInfluence = false;

    for (let i = 0; i < activeDisplacements.length; i++) {
      const d = activeDisplacements[i];
      const relX = pt.x - d.origX;
      const relY = pt.y - d.origY;
      const dist = Math.hypot(relX, relY);

      const nodeRadius = Math.max(20, (d.node.radius || stiffness || 35) * 2.2);
      if (dist >= nodeRadius) {
        // STRICTLY 0 MOVEMENT OUTSIDE CAPTURED RADIUS!
        continue;
      }

      // Compact-support cubic smoothstep kernel (drops to EXACTLY 0 at nodeRadius with 0 derivative)
      const t = 1 - (dist / nodeRadius);
      const w = t * t * (3 - 2 * t);

      // Transformed relative coordinates under local node scale/rotation/skew
      let tx = relX * d.sx + relY * Math.tan(d.skewX);
      let ty = relY * d.sy + relX * Math.tan(d.skewY);

      if (d.rot !== 0) {
        const cosR = Math.cos(d.rot);
        const sinR = Math.sin(d.rot);
        const rx = tx * cosR - ty * sinR;
        const ry = tx * sinR + ty * cosR;
        tx = rx;
        ty = ry;
      }

      const nodeDispX = d.rawDx + (tx - relX);
      const nodeDispY = d.rawDy + (ty - relY);

      totalDispX += nodeDispX * w;
      totalDispY += nodeDispY * w;
      hasInfluence = true;
    }

    if (!hasInfluence) {
      // 100% Frozen/Stationary outside radius!
      return pt;
    }

    const extendedPt = pt as Point & { p1?: Point; p2?: Point };
    return {
      ...pt,
      x: Number((pt.x + totalDispX).toFixed(2)),
      y: Number((pt.y + totalDispY).toFixed(2)),
      ...(extendedPt.p1 ? { p1: { x: Number((extendedPt.p1.x + totalDispX).toFixed(2)), y: Number((extendedPt.p1.y + totalDispY).toFixed(2)) } } : {}),
      ...(extendedPt.p2 ? { p2: { x: Number((extendedPt.p2.x + totalDispX).toFixed(2)), y: Number((extendedPt.p2.y + totalDispY).toFixed(2)) } } : {})
    };
  });
}

/**
 * Calculates deformed object points using STRICT RIGID 2D MOVE & ROTATE TRANSFORM.
 * Preserves 100% of the drawing's original shapes, stroke widths, distances, and geometry.
 * Does NOT stretch, scale, blend, or distort flexibly.
 * Segments between control nodes move and rotate rigidly in straight lines.
 */
export function calculateRigidLinearDeformedPoints(
  origPoints: Point[],
  nodes: CustomVectorDeformNode[]
): Point[] {
  if (!origPoints || origPoints.length === 0) return [];
  if (!nodes || nodes.length === 0) return origPoints;

  const hasMovement = nodes.some(n => Math.abs(n.x - n.origX) > 0.0001 || Math.abs(n.y - n.origY) > 0.0001);
  if (!hasMovement) {
    return origPoints;
  }

  // 1. Single node case: Pure rigid translation by node displacement
  if (nodes.length === 1) {
    const n = nodes[0];
    const dx = n.x - n.origX;
    const dy = n.y - n.origY;
    return origPoints.map(pt => {
      const ext = pt as Point & { p1?: Point; p2?: Point };
      return {
        ...pt,
        x: pt.x + dx,
        y: pt.y + dy,
        ...(ext.p1 ? { p1: { x: ext.p1.x + dx, y: ext.p1.y + dy } } : {}),
        ...(ext.p2 ? { p2: { x: ext.p2.x + dx, y: ext.p2.y + dy } } : {})
      };
    });
  }

  // 2. Multi-node case: Strict 2D rigid transform per segment (rotate + move without scaling or distortion)
  const segments: Array<{
    nA: CustomVectorDeformNode;
    nB: CustomVectorDeformNode;
    theta: number;
    cosT: number;
    sinT: number;
  }> = [];

  const nodeMap = new Map<string, CustomVectorDeformNode>();
  nodes.forEach(n => nodeMap.set(n.id, n));
  const processedPairs = new Set<string>();

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    let parentNode: CustomVectorDeformNode | undefined;

    if (node.parentNodeId && nodeMap.has(node.parentNodeId)) {
      parentNode = nodeMap.get(node.parentNodeId);
    } else if (i > 0) {
      parentNode = nodes[i - 1];
    }

    if (parentNode && parentNode.id !== node.id) {
      const pairKey = `${parentNode.id}_${node.id}`;
      if (!processedPairs.has(pairKey)) {
        processedPairs.add(pairKey);

        const nA = parentNode;
        const nB = node;

        const origDx = nB.origX - nA.origX;
        const origDy = nB.origY - nA.origY;
        const origLen = Math.hypot(origDx, origDy);

        const currDx = nB.x - nA.x;
        const currDy = nB.y - nA.y;
        const currLen = Math.hypot(currDx, currDy);

        const origAngle = Math.atan2(origDy, origDx);
        const currAngle = Math.atan2(currDy, currDx);

        // Strict 2D rotation angle around start node
        const theta = (origLen > 0.001 && currLen > 0.001) ? (currAngle - origAngle) : 0;

        segments.push({
          nA,
          nB,
          theta,
          cosT: Math.cos(theta),
          sinT: Math.sin(theta)
        });
      }
    }
  }

  return origPoints.map(pt => {
    // Find closest segment to this original point
    let minDistSq = Infinity;
    let bestSegIdx = 0;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const ax = seg.nA.origX;
      const ay = seg.nA.origY;
      const bx = seg.nB.origX;
      const by = seg.nB.origY;

      const abx = bx - ax;
      const aby = by - ay;
      const ab2 = abx * abx + aby * aby;

      let t = 0;
      if (ab2 > 0.0001) {
        t = ((pt.x - ax) * abx + (pt.y - ay) * aby) / ab2;
        t = Math.max(0, Math.min(1, t));
      }

      const projX = ax + t * abx;
      const projY = ay + t * aby;
      const distSq = (pt.x - projX) ** 2 + (pt.y - projY) ** 2;

      if (distSq < minDistSq) {
        minDistSq = distSq;
        bestSegIdx = i;
      }
    }

    const seg = segments[bestSegIdx];
    const axOrig = seg.nA.origX;
    const ayOrig = seg.nA.origY;
    const axCurr = seg.nA.x;
    const ayCurr = seg.nA.y;

    const transformPoint = (p: { x: number; y: number }) => {
      const vx = p.x - axOrig;
      const vy = p.y - ayOrig;
      const rx = vx * seg.cosT - vy * seg.sinT;
      const ry = vx * seg.sinT + vy * seg.cosT;
      return {
        x: axCurr + rx,
        y: ayCurr + ry
      };
    };

    const newPt = transformPoint(pt);
    const ext = pt as Point & { p1?: Point; p2?: Point };

    return {
      ...pt,
      x: newPt.x,
      y: newPt.y,
      ...(ext.p1 ? { p1: transformPoint(ext.p1) } : {}),
      ...(ext.p2 ? { p2: transformPoint(ext.p2) } : {})
    };
  });
}


