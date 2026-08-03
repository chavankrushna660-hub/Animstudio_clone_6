import { Point, Transform, Pivot, VectorObject, Bone } from '../types';

export function distance(p1: Point, p2: Point): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Distance from point p to line segment ab
export function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const l2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  if (l2 === 0) return distance(p, a);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projection = {
    x: a.x + t * (b.x - a.x),
    y: a.y + t * (b.y - a.y),
  };
  return distance(p, projection);
}

// Minimum distance from point to a polyline
export function pointToPolylineDistance(p: Point, points: Point[]): number {
  if (points.length === 0) return Infinity;
  if (points.length === 1) return distance(p, points[0]);
  let minDist = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    // Skip segment if the next point is marked as a gap (start of a new stroke)
    if (points[i + 1].gap) {
      continue;
    }
    const dist = pointToSegmentDistance(p, points[i], points[i + 1]);
    if (dist < minDist) {
      minDist = dist;
    }
  }
  return minDist;
}

// Point in polygon check (even-odd rule)
export function isPointInPolygon(p: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y))
        && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Calculate bounding box of points
export function calculateBoundingBox(points: Point[]): { x: number; y: number; width: number; height: number } {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export function calculateCenter(points: Point[]): Point {
  const box = calculateBoundingBox(points);
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

/**
 * Unifies multiple separate strokes (sub-paths) into a single continuous array of points.
 * Automatically aligns endpoint directions, chains nearest stroke segments,
 * and closes the shape loop if start and end points are near each other.
 */
export function unifyStrokesToSinglePath(strokes: Point[][]): Point[] {
  if (!strokes || strokes.length === 0) return [];
  
  // Filter out empty strokes
  const validStrokes = strokes.filter(s => s && s.length > 0).map(s => s.map(p => ({ ...p })));
  if (validStrokes.length === 0) return [];
  if (validStrokes.length === 1) {
    const single = validStrokes[0];
    if (single.length > 3) {
      const head = single[0];
      const tail = single[single.length - 1];
      if (distance(head, tail) < 25 && distance(head, tail) > 0) {
        return [...single, { ...head }];
      }
    }
    return single.map(p => {
      const { gap, ...clean } = p;
      return clean;
    });
  }

  // Chain strokes using greedy nearest-endpoint search
  let currentChain: Point[] = [...validStrokes[0]];
  const remaining = validStrokes.slice(1);

  while (remaining.length > 0) {
    const headP = currentChain[0];
    const tailP = currentChain[currentChain.length - 1];

    let bestIndex = -1;
    let bestOption: 'append_as_is' | 'append_reversed' | 'prepend_as_is' | 'prepend_reversed' = 'append_as_is';
    let minDistance = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const s = remaining[i];
      const sHead = s[0];
      const sTail = s[s.length - 1];

      // Option 1: Append as-is to tail
      const d1 = distance(tailP, sHead);
      if (d1 < minDistance) {
        minDistance = d1;
        bestIndex = i;
        bestOption = 'append_as_is';
      }

      // Option 2: Append reversed to tail
      const d2 = distance(tailP, sTail);
      if (d2 < minDistance) {
        minDistance = d2;
        bestIndex = i;
        bestOption = 'append_reversed';
      }

      // Option 3: Prepend reversed to head
      const d3 = distance(headP, sHead);
      if (d3 < minDistance) {
        minDistance = d3;
        bestIndex = i;
        bestOption = 'prepend_reversed';
      }

      // Option 4: Prepend as-is to head
      const d4 = distance(headP, sTail);
      if (d4 < minDistance) {
        minDistance = d4;
        bestIndex = i;
        bestOption = 'prepend_as_is';
      }
    }

    if (bestIndex !== -1) {
      const bestStroke = remaining[bestIndex];
      remaining.splice(bestIndex, 1);

      if (bestOption === 'append_as_is') {
        const attachPt = bestStroke[0];
        const skipFirst = distance(tailP, attachPt) < 15;
        const ptsToAdd = skipFirst 
          ? bestStroke.slice(1) 
          : bestStroke.map((p, idx) => idx === 0 ? { ...p, gap: true } : p);
        currentChain = [...currentChain, ...ptsToAdd];
      } else if (bestOption === 'append_reversed') {
        const rev = [...bestStroke].reverse();
        const attachPt = rev[0];
        const skipFirst = distance(tailP, attachPt) < 15;
        const ptsToAdd = skipFirst 
          ? rev.slice(1) 
          : rev.map((p, idx) => idx === 0 ? { ...p, gap: true } : p);
        currentChain = [...currentChain, ...ptsToAdd];
      } else if (bestOption === 'prepend_reversed') {
        const rev = [...bestStroke].reverse();
        const attachPt = rev[rev.length - 1];
        const skipLast = distance(headP, attachPt) < 15;
        const ptsToAdd = skipLast ? rev.slice(0, -1) : rev;
        const headMarked = currentChain.map((p, idx) => idx === 0 ? { ...p, gap: true } : p);
        currentChain = [...ptsToAdd, ...headMarked];
      } else if (bestOption === 'prepend_as_is') {
        const attachPt = bestStroke[bestStroke.length - 1];
        const skipLast = distance(headP, attachPt) < 15;
        const ptsToAdd = skipLast ? bestStroke.slice(0, -1) : bestStroke;
        const headMarked = currentChain.map((p, idx) => idx === 0 ? { ...p, gap: true } : p);
        currentChain = [...ptsToAdd, ...headMarked];
      }
    } else {
      break;
    }
  }

  // Check if closed loop between final tail and head
  if (currentChain.length > 3) {
    const finalHead = currentChain[0];
    const finalTail = currentChain[currentChain.length - 1];
    if (distance(finalHead, finalTail) < 30 && (finalHead.x !== finalTail.x || finalHead.y !== finalTail.y)) {
      currentChain.push({ ...finalHead });
    }
  }

  return currentChain;
}

function lineIntersection(p1: Point, p2: Point, p3: Point, p4: Point): Point | null {
  const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
  if (Math.abs(denom) < 1e-6) return null;

  const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom;
  const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom;

  if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
    return {
      x: p1.x + ua * (p2.x - p1.x),
      y: p1.y + ua * (p2.y - p1.y)
    };
  }
  return null;
}

function getPolygonArea(pts: Point[]): number {
  if (!pts || pts.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

export function detectContinuousSubPaths(points: Point[]): Point[][] {
  if (!points || points.length < 3) return points && points.length > 0 ? [points] : [];

  const subPaths: Point[][] = [];

  // Pass 1: Find all self-intersections and extracted closed loops
  const N = points.length;
  const loopCandidates: Point[][] = [];

  for (let i = 0; i < N - 3; i++) {
    for (let j = i + 3; j < N; j++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[j];
      const p4 = points[j + 1] || points[0];

      const intersect = lineIntersection(p1, p2, p3, p4);
      const dist = distance(p1, p3);

      if (intersect || dist < 25) {
        const cutPt = intersect || { x: (p1.x + p3.x) / 2, y: (p1.y + p3.y) / 2 };
        const loop = [cutPt, ...points.slice(i + 1, j + 1), cutPt];
        if (loop.length >= 3 && getPolygonArea(loop) > 20) {
          loopCandidates.push(loop);
        }
      }
    }
  }

  // Deduplicate overlapping/identical loops
  loopCandidates.forEach(candidate => {
    const candArea = getPolygonArea(candidate);
    const isDuplicate = subPaths.some(existing => {
      const existArea = getPolygonArea(existing);
      return Math.abs(candArea - existArea) < 50;
    });
    if (!isDuplicate) {
      subPaths.push(candidate);
    }
  });

  // Always include the full outer envelope loop
  const outerLoop = [...points];
  if (distance(outerLoop[0], outerLoop[outerLoop.length - 1]) > 1e-3) {
    outerLoop.push({ ...outerLoop[0] });
  }
  if (getPolygonArea(outerLoop) > 20) {
    subPaths.push(outerLoop);
  }

  // Sort subPaths from largest area (outer envelope) to smallest area (inner details/eyes/mouth)
  subPaths.sort((a, b) => getPolygonArea(b) - getPolygonArea(a));

  return subPaths.length > 0 ? subPaths : [points];
}

export function extractAllSubPaths(obj: VectorObject): Point[][] {
  if (!obj) return [];
  
  // 1. If explicit subPaths array exists and is not empty, use it
  if (obj.subPaths && obj.subPaths.length > 0) {
    const valid = obj.subPaths.filter(s => s && s.length > 0);
    if (valid.length > 0) return valid;
  }

  if (!obj.points || obj.points.length === 0) return [];

  // 2. Check for gap markers inside obj.points
  const gapSegments: Point[][] = [];
  let currentSeg: Point[] = [];
  for (let i = 0; i < obj.points.length; i++) {
    const pt = obj.points[i];
    if (pt.gap && currentSeg.length > 0) {
      gapSegments.push(currentSeg);
      currentSeg = [];
    }
    currentSeg.push(pt);
  }
  if (currentSeg.length > 0) {
    gapSegments.push(currentSeg);
  }

  if (gapSegments.length > 1) {
    return gapSegments;
  }

  // 3. For continuous single-stroke drawings, detect all loops and self-intersections
  return detectContinuousSubPaths(obj.points);
}

export function finalizeContinuousObject(obj: VectorObject): VectorObject {
  if (!obj) return obj;
  const extractedSubs = extractAllSubPaths(obj);
  const allStrokes = extractedSubs.length > 0 ? extractedSubs : [obj.points];
  const unifiedPts = unifyStrokesToSinglePath(allStrokes);

  return {
    ...obj,
    points: unifiedPts,
    subPaths: extractedSubs.length > 0 ? extractedSubs : obj.subPaths,
    joinedStrokesDemo: [...unifiedPts],
    isContinuousDrawing: true,
  };
}

// Rotate point around origin by angle (degrees)
export function rotatePoint(p: Point, angleDeg: number, origin: Point): Point {
  const angleRad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  const dx = p.x - origin.x;
  const dy = p.y - origin.y;

  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

// Transform point from local to world coordinates with full Skew, 3D flip/rotate, and perspective projection
export function localToWorld(p: Point, transform: Transform, pivot?: { localX: number; localY: number }): Point {
  const pivotX = pivot ? pivot.localX : 0;
  const pivotY = pivot ? pivot.localY : 0;

  // 1. Get positions relative to the pivot
  const lx = p.x - pivotX;
  const ly = p.y - pivotY;

  // 2. Apply Skew
  const skewXRad = ((transform.skewX || 0) * Math.PI) / 180;
  const skewYRad = ((transform.skewY || 0) * Math.PI) / 180;
  const sx = lx + ly * Math.tan(skewXRad);
  const sy = ly + lx * Math.tan(skewYRad);

  // 3. Apply Scale
  const scx = sx * transform.scaleX;
  const scy = sy * transform.scaleY;

  // 4. Apply 3D Flips / Rotations (including camera angles)
  const effRotX = (transform.rotateX || 0) + (transform.cameraAngleX || 0);
  const effRotY = (transform.rotateY || 0) + (transform.cameraAngleY || 0);

  const rotXRad = (effRotX * Math.PI) / 180;
  const rotYRad = (effRotY * Math.PI) / 180;
  
  // Parallax offset based on camera angle
  const camXRad = ((transform.cameraAngleX || 0) * Math.PI) / 180;
  const camYRad = ((transform.cameraAngleY || 0) * Math.PI) / 180;
  const parallaxX = Math.sin(camYRad) * 80;
  const parallaxY = Math.sin(camXRad) * 80;
  
  // Shrink factor based on rotateX / rotateY to simulate 3D rotation projection
  const r3x = scx * Math.cos(rotYRad);
  const r3y = scy * Math.cos(rotXRad);

  // 5. Apply Perspective Projection
  const sinRotX = Math.sin(rotXRad);
  const sinRotY = Math.sin(rotYRad);
  // Z depth can be modeled based on position relative to the rotX and rotY pivots
  const z = -(scx * sinRotY + scy * sinRotX);

  const perspective = transform.perspective ? (transform.perspective / 1000) : 0; // scale perspective down for sensible range
  const f = (perspective !== 0) ? (1 / (1 - z * perspective)) : 1;

  const px = r3x * f;
  const py = r3y * f;

  // 6. Apply standard 2D Rotation around pivot
  let pRotated = { x: px + pivotX, y: py + pivotY };
  if (transform.rotation !== 0) {
    pRotated = rotatePoint(pRotated, transform.rotation, { x: pivotX, y: pivotY });
  }

  // 7. Translate (including parallax offset)
  return {
    x: pRotated.x + transform.x + parallaxX,
    y: pRotated.y + transform.y + parallaxY,
  };
}

// Transform point from world to local coordinates with analytic inverse transformations
export function worldToLocal(p: Point, transform: Transform, pivot?: { localX: number; localY: number }): Point {
  const pivotX = pivot ? pivot.localX : 0;
  const pivotY = pivot ? pivot.localY : 0;

  // Parallax offset based on camera angle
  const camXRad = ((transform.cameraAngleX || 0) * Math.PI) / 180;
  const camYRad = ((transform.cameraAngleY || 0) * Math.PI) / 180;
  const parallaxX = Math.sin(camYRad) * 80;
  const parallaxY = Math.sin(camXRad) * 80;

  // 1. Translate back (including camera parallax)
  const tx = p.x - transform.x - parallaxX;
  const ty = p.y - transform.y - parallaxY;

  // 2. Rotate back around pivot
  let pRotated = { x: tx, y: ty };
  if (transform.rotation !== 0) {
    pRotated = rotatePoint(pRotated, -transform.rotation, { x: pivotX, y: pivotY });
  }

  // Relative to pivot
  const rx = pRotated.x - pivotX;
  const ry = pRotated.y - pivotY;

  // 3. Inverse Perspective
  const effRotX = (transform.rotateX || 0) + (transform.cameraAngleX || 0);
  const effRotY = (transform.rotateY || 0) + (transform.cameraAngleY || 0);

  const perspective = transform.perspective ? (transform.perspective / 1000) : 0;
  const rotXRad = (effRotX * Math.PI) / 180;
  const rotYRad = (effRotY * Math.PI) / 180;
  const sinRotX = Math.sin(rotXRad);
  const sinRotY = Math.sin(rotYRad);
  const cosRotX = Math.cos(rotXRad);
  const cosRotY = Math.cos(rotYRad);

  let unprojX = rx;
  let unprojY = ry;

  if (perspective !== 0) {
    const tanY = cosRotY === 0 ? 0 : Math.tan(rotYRad);
    const tanX = cosRotX === 0 ? 0 : Math.tan(rotXRad);
    const denom = 1 - perspective * (rx * tanY + ry * tanX);
    const W = denom === 0 ? 1 : 1 / denom;
    unprojX = rx * W;
    unprojY = ry * W;
  }

  // 4. Inverse 3D Rotation (divide by cos)
  const divX = cosRotY === 0 ? 1 : cosRotY;
  const divY = cosRotX === 0 ? 1 : cosRotX;
  const scx = unprojX / divX;
  const scy = unprojY / divY;

  // 5. Inverse Scale
  const scaleX = transform.scaleX === 0 ? 1 : transform.scaleX;
  const scaleY = transform.scaleY === 0 ? 1 : transform.scaleY;
  const sx = scx / scaleX;
  const sy = scy / scaleY;

  // 6. Inverse Skew
  const skewXRad = ((transform.skewX || 0) * Math.PI) / 180;
  const skewYRad = ((transform.skewY || 0) * Math.PI) / 180;
  const tX = Math.tan(skewXRad);
  const tY = Math.tan(skewYRad);
  const skewDenom = 1 - tX * tY;

  let lx = sx;
  let ly = sy;
  if (skewDenom !== 0) {
    lx = (sx - sy * tX) / skewDenom;
    ly = (sy - sx * tY) / skewDenom;
  }

  return {
    x: lx + pivotX,
    y: ly + pivotY,
  };
}

// Inverse Distance Weighting (IDW) deformation for puppet pin warping
// Deforms drawing points dynamically based on the current pin targets
export function deformPoints(
  points: Point[],
  basePins: Pivot[],
  currentPins: Pivot[],
  influenceRadius: number = 250
): Point[] {
  if (!basePins || basePins.length === 0 || !currentPins || currentPins.length === 0) {
    return points;
  }

  return points.map((p) => {
    let totalWeight = 0;
    const pinDeltas: Point[] = [];
    const weights: number[] = [];

    for (let i = 0; i < basePins.length; i++) {
      const basePin = basePins[i];
      // Find corresponding current pin
      const currPin = currentPins.find((cp) => cp.id === basePin.id) || basePin;

      const d = distance(p, { x: basePin.localX, y: basePin.localY });
      const delta = {
        x: currPin.localX - basePin.localX,
        y: currPin.localY - basePin.localY,
      };

      pinDeltas.push(delta);

      // Exact match gets weight 1 directly
      if (d === 0) {
        return { x: p.x + delta.x, y: p.y + delta.y };
      }

      // Proximity-based weight
      if (d < influenceRadius) {
        const weight = (1 - d / influenceRadius) ** 2 / (d * d);
        weights.push(weight);
        totalWeight += weight;
      } else {
        weights.push(0);
      }
    }

    if (totalWeight === 0) {
      return { ...p }; // No change
    }

    let dx = 0;
    let dy = 0;
    for (let i = 0; i < basePins.length; i++) {
      const normWeight = weights[i] / totalWeight;
      dx += pinDeltas[i].x * normWeight;
      dy += pinDeltas[i].y * normWeight;
    }

    return {
      x: p.x + dx,
      y: p.y + dy,
    };
  });
}

// FABRIK (Forward And Backward Reaching Inverse Kinematics) solver for Bone Chains
// Solver guarantees rigid lengths and solves up to joint constraints!
export function solveIK(
  chainBones: Bone[],
  objects: { [id: string]: VectorObject },
  target: Point,
  maxIterations = 15,
  tolerance = 0.5
): { [objectId: string]: { x: number; y: number; rotation: number } } {
  if (chainBones.length === 0) return {};

  // Find corresponding drawing objects and extract world joint positions
  // Joints representation: Root joint, Joint 1, Joint 2 ... Joint N (End effector)
  interface JointNode {
    pos: Point;
    originalPos: Point;
    boneId: string;
    startObjectId: string;
    endObjectId: string;
    length: number;
    minAngle: number;
    maxAngle: number;
    enableConstraints: boolean;
  }

  const joints: JointNode[] = [];

  // Reconstruct bone chain joints in world coordinates
  for (let i = 0; i < chainBones.length; i++) {
    const bone = chainBones[i];
    const startObj = objects[bone.startObjectId];
    const endObj = objects[bone.endObjectId];

    const startWorld = localToWorld(
      { x: bone.startLocalX, y: bone.startLocalY },
      startObj.transform,
      startObj.pivots[0]
    );
    const endWorld = localToWorld(
      { x: bone.endLocalX, y: bone.endLocalY },
      endObj.transform,
      endObj.pivots[0]
    );

    if (i === 0) {
      joints.push({
        pos: startWorld,
        originalPos: { ...startWorld },
        boneId: bone.id,
        startObjectId: bone.startObjectId,
        endObjectId: bone.endObjectId,
        length: bone.lockedDistance,
        minAngle: bone.minAngle,
        maxAngle: bone.maxAngle,
        enableConstraints: bone.enableConstraints,
      });
    }

    joints.push({
      pos: endWorld,
      originalPos: { ...endWorld },
      boneId: bone.id,
      startObjectId: bone.startObjectId,
      endObjectId: bone.endObjectId,
      length: bone.lockedDistance,
      minAngle: bone.minAngle,
      maxAngle: bone.maxAngle,
      enableConstraints: bone.enableConstraints,
    });
  }

  const rootIndex = 0;
  const endIndex = joints.length - 1;

  // Total distance we can reach is sum of bone lengths
  const totalLength = chainBones.reduce((sum, b) => sum + b.lockedDistance, 0);
  const distToTarget = distance(joints[rootIndex].pos, target);

  if (distToTarget > totalLength) {
    // Target is out of reach: Stretch chain in direction of target
    const dir = {
      x: (target.x - joints[rootIndex].pos.x) / distToTarget,
      y: (target.y - joints[rootIndex].pos.y) / distToTarget,
    };

    for (let i = 0; i < chainBones.length; i++) {
      const len = chainBones[i].lockedDistance;
      joints[i + 1].pos = {
        x: joints[i].pos.x + dir.x * len,
        y: joints[i].pos.y + dir.y * len,
      };
    }
  } else {
    // Target is within reach: Run FABRIK iterations
    const rootPos = { ...joints[rootIndex].pos };

    for (let iter = 0; iter < maxIterations; iter++) {
      const diff = distance(joints[endIndex].pos, target);
      if (diff < tolerance) break;

      // STAGE 1: FORWARD REACHING (from end to root)
      joints[endIndex].pos = { ...target };
      for (let i = endIndex - 1; i >= rootIndex; i--) {
        const d = distance(joints[i + 1].pos, joints[i].pos);
        const ratio = joints[i + 1].length / (d || 1);
        joints[i].pos = {
          x: joints[i + 1].pos.x + (joints[i].pos.x - joints[i + 1].pos.x) * ratio,
          y: joints[i + 1].pos.y + (joints[i].pos.y - joints[i + 1].pos.y) * ratio,
        };
      }

      // STAGE 2: BACKWARD REACHING (from root to end)
      joints[rootIndex].pos = { ...rootPos };
      for (let i = rootIndex; i < endIndex; i++) {
        const d = distance(joints[i + 1].pos, joints[i].pos);
        const ratio = joints[i].length / (d || 1);
        joints[i + 1].pos = {
          x: joints[i].pos.x + (joints[i + 1].pos.x - joints[i].pos.x) * ratio,
          y: joints[i].pos.y + (joints[i + 1].pos.y - joints[i].pos.y) * ratio,
        };
      }
    }
  }

  // Calculate new transforms/rotations for each connected drawing
  const results: { [objectId: string]: { x: number; y: number; rotation: number } } = {};

  for (let i = 0; i < chainBones.length; i++) {
    const bone = chainBones[i];
    const jointStart = joints[i];
    const jointEnd = joints[i + 1];

    // Angle of current bone segment in world coordinates
    let angleRad = Math.atan2(jointEnd.pos.y - jointStart.pos.y, jointEnd.pos.x - jointStart.pos.x);
    let angleDeg = (angleRad * 180) / Math.PI;

    // Relative rotation change from its resting/base pose
    const baseAngleRad = Math.atan2(
      bone.endLocalY - bone.startLocalY,
      bone.endLocalX - bone.startLocalX
    );
    const baseAngleDeg = (baseAngleRad * 180) / Math.PI;
    const deltaAngle = angleDeg - baseAngleDeg;

    // Calculate drawing new coordinates to lock its start point onto jointStart.pos
    const drawing = objects[bone.endObjectId];
    const attachPointLocal = { x: bone.endLocalX, y: bone.endLocalY };

    // Set rotation and adjust position
    results[bone.endObjectId] = {
      x: jointStart.pos.x,
      y: jointStart.pos.y,
      rotation: deltaAngle,
    };
  }

  return results;
}

export function bilinearInterpolate(
  x: number,
  y: number,
  topLeft: { originalX: number; originalY: number; currentX: number; currentY: number },
  topRight: { originalX: number; originalY: number; currentX: number; currentY: number },
  bottomLeft: { originalX: number; originalY: number; currentX: number; currentY: number },
  bottomRight: { originalX: number; originalY: number; currentX: number; currentY: number },
  axis: 'x' | 'y' = 'x'
): number {
  const x1 = topLeft.originalX;
  const y1 = topLeft.originalY;
  const x2 = bottomRight.originalX;
  const y2 = bottomRight.originalY;

  // Avoid division by zero
  const dx = (x2 - x1) || 1;
  const dy = (y2 - y1) || 1;

  // Normalized coordinates (0 to 1)
  const tx = Math.max(0, Math.min(1, (x - x1) / dx));
  const ty = Math.max(0, Math.min(1, (y - y1) / dy));

  let val1: number, val2: number, val3: number, val4: number;
  if (axis === 'x') {
    val1 = topLeft.currentX;
    val2 = topRight.currentX;
    val3 = bottomLeft.currentX;
    val4 = bottomRight.currentX;
  } else {
    val1 = topLeft.currentY;
    val2 = topRight.currentY;
    val3 = bottomLeft.currentY;
    val4 = bottomRight.currentY;
  }

  // Bilinear interpolation
  const interpolated =
    val1 * (1 - tx) * (1 - ty) +
    val2 * tx * (1 - ty) +
    val3 * (1 - tx) * ty +
    val4 * tx * ty;

  return interpolated;
}

export function findClosestView360(views: any[] | undefined, angle: number): any | null {
  if (!views || views.length === 0) return null;
  let closest = views[0];
  let minDiff = 360;
  views.forEach(v => {
    let diff = Math.abs((v.angle - angle + 180) % 360) - 180;
    diff = Math.abs(diff < -180 ? diff + 360 : diff);
    if (diff < minDiff) {
      minDiff = diff;
      closest = v;
    }
  });
  return closest;
}

// 🌟 3D Wire Sculpting Helper Functions
export function resamplePointsBySpacing(points: Point[], targetSpacing: number = 10): Point[] {
  if (!points || points.length < 2) return points ? [...points] : [];
  const resampled: Point[] = [points[0]];
  let lastPt = points[0];

  for (let i = 1; i < points.length; i++) {
    const pt = points[i];
    if (pt.gap) {
      resampled.push({ ...pt });
      lastPt = pt;
      continue;
    }
    const d = distance(lastPt, pt);
    if (d >= targetSpacing) {
      const steps = Math.floor(d / targetSpacing);
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        resampled.push({
          x: lastPt.x + (pt.x - lastPt.x) * t,
          y: lastPt.y + (pt.y - lastPt.y) * t,
          z: (lastPt.z || 0) + ((pt.z || 0) - (lastPt.z || 0)) * t
        });
      }
      lastPt = pt;
    }
  }

  if (resampled.length < 2 && points.length >= 2) {
    return [...points];
  }
  return resampled;
}

export function extrudeVertices(points: Point[], selectedIndices: number[], axis: 'x' | 'y' | 'z', amount: number): { points: Point[]; newSelection: number[] } {
  if (!points || points.length === 0 || selectedIndices.length === 0) return { points: points || [], newSelection: selectedIndices || [] };
  const updated = [...points.map(p => ({ ...p }))];
  const newSelection: number[] = [];

  const sortedIndices = [...selectedIndices].sort((a, b) => b - a);
  sortedIndices.forEach((idx) => {
    if (idx < 0 || idx >= updated.length) return;
    const base = updated[idx];
    const extrudedPoint: Point = {
      x: base.x + (axis === 'x' ? amount : 0),
      y: base.y + (axis === 'y' ? amount : 0),
      z: (base.z || 0) + (axis === 'z' ? amount : 0),
      color: base.color,
      thickness: base.thickness
    };
    updated.splice(idx + 1, 0, extrudedPoint);
    newSelection.push(idx + 1);
  });

  return { points: updated, newSelection };
}

export function smoothSelectedVertices(points: Point[], selectedIndices: number[], strength: number = 0.5): Point[] {
  if (!points || points.length < 3 || selectedIndices.length === 0) return points || [];
  const updated = [...points.map(p => ({ ...p }))];

  selectedIndices.forEach((idx) => {
    if (idx <= 0 || idx >= points.length - 1) return;
    const prev = points[idx - 1];
    const curr = points[idx];
    const next = points[idx + 1];

    if (prev.gap || next.gap) return;

    const avgX = (prev.x + next.x) / 2;
    const avgY = (prev.y + next.y) / 2;
    const avgZ = ((prev.z || 0) + (next.z || 0)) / 2;

    updated[idx] = {
      ...curr,
      x: curr.x + (avgX - curr.x) * strength,
      y: curr.y + (avgY - curr.y) * strength,
      z: (curr.z || 0) + (avgZ - (curr.z || 0)) * strength
    };
  });

  return updated;
}

export function flattenSelectedVertices(points: Point[], selectedIndices: number[], axis: 'x' | 'y' | 'z'): Point[] {
  if (!points || points.length === 0 || selectedIndices.length === 0) return points || [];
  const updated = [...points.map(p => ({ ...p }))];
  const selectedPts = selectedIndices.map(i => points[i]).filter(Boolean);
  if (selectedPts.length === 0) return points;

  let avgVal = 0;
  if (axis === 'x') {
    avgVal = selectedPts.reduce((acc, p) => acc + p.x, 0) / selectedPts.length;
  } else if (axis === 'y') {
    avgVal = selectedPts.reduce((acc, p) => acc + p.y, 0) / selectedPts.length;
  } else {
    avgVal = selectedPts.reduce((acc, p) => acc + (p.z || 0), 0) / selectedPts.length;
  }

  selectedIndices.forEach(idx => {
    if (updated[idx]) {
      if (axis === 'x') updated[idx].x = avgVal;
      else if (axis === 'y') updated[idx].y = avgVal;
      else updated[idx].z = avgVal;
    }
  });

  return updated;
}

export function mirrorSelectedVertices(points: Point[], selectedIndices: number[], axis: 'x' | 'y'): Point[] {
  if (!points || points.length === 0 || selectedIndices.length === 0) return points || [];
  const updated = [...points.map(p => ({ ...p }))];
  const box = calculateBoundingBox(points);
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  selectedIndices.forEach(idx => {
    if (updated[idx]) {
      if (axis === 'x') {
        updated[idx].x = centerX + (centerX - updated[idx].x);
      } else {
        updated[idx].y = centerY + (centerY - updated[idx].y);
      }
    }
  });

  return updated;
}
