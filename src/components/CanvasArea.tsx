import React, { useRef, useState, useEffect } from 'react';
import { RotateCcw, Sparkles, Feather, ZoomIn, ZoomOut, Maximize2, Activity, GitCommit } from 'lucide-react';
import { Point, VectorObject, Bone, Pivot, Frame, Transform, RealismSettings, LassoControlPoint, SmartWarpPin, BrushSettings, LiquifyBrushSettings, CurvePathState, FlexCurveState, FlexCurveControlPoint, CustomVectorDeformNode, CustomVectorDeformState, Layer } from '../types';
import { calculateCustomVectorDeformedPoints, calculateRigidLinearDeformedPoints } from '../utils/vectorDeform';
import { transform3DVertex, transform3DVertices, project3DVertex, getFaceLightColor, deformVertices3D, extrude2DTo3D } from '../utils/engine3D';
import { Renderer3D } from '../utils/extruded3D';
import { 
  distance, 
  pointToPolylineDistance, 
  isPointInPolygon, 
  localToWorld, 
  worldToLocal, 
  deformPoints, 
  calculateBoundingBox,
  rotatePoint,
  findClosestView360,
  unifyStrokesToSinglePath,
  finalizeContinuousObject,
  extractAllSubPaths
} from '../utils/math';
import { getInterpolatedObjects } from '../utils/interpolation';
import { performSmartFloodFill } from '../utils/smartFill';
import PNGDeepEditBar from './PNGDeepEditBar';
import { 
  isolateAndExtractPNGPart, 
  setupPNGMouthPosing, 
  setupPNGEyePosing, 
  convertPNGTo3DVolumetric, 
  applyGeometryProtection 
} from '../utils/pngDeepEdit';

function getTransparentColor(colorStr: string): string {
  if (!colorStr) return 'rgba(255, 255, 255, 0)';
  const trimmed = colorStr.trim().toLowerCase();
  
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    let r = 255, g = 255, b = 255;
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6 || hex.length === 8) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    }
    return `rgba(${r}, ${g}, ${b}, 0)`;
  }
  
  if (trimmed.startsWith('rgb')) {
    const match = trimmed.match(/\d+/g);
    if (match && match.length >= 3) {
      return `rgba(${match[0]}, ${match[1]}, ${match[2]}, 0)`;
    }
  }
  
  return 'rgba(255, 255, 255, 0)';
}

// Mesh Warp Bilinear & Distance Interpolation helper
const getWarpedPoint = (p: Point, meshState: any, bounds: any) => {
  if (!meshState || !meshState.active || !meshState.points || meshState.points.length === 0) return p;
  const { densityX, densityY, points } = meshState;

  // 1. Strict Stability check: If no mesh point has been moved yet, return p EXACTLY!
  const hasMoved = points.some((m: any) => Math.abs(m.currentX - m.originalX) > 0.001 || Math.abs(m.currentY - m.originalY) > 0.001);
  if (!hasMoved) {
    return p;
  }

  // 2. Contour / Unstructured Point Interpolation (Strict Compact-Support Local Smoothstep)
  if (points.length !== (densityX || 0) * (densityY || 0)) {
    let totalDx = 0;
    let totalDy = 0;
    let hasInfluence = false;
    const falloff = meshState.falloffRadius || 120;

    for (let i = 0; i < points.length; i++) {
      const mpt = points[i];
      const dx = mpt.currentX - mpt.originalX;
      const dy = mpt.currentY - mpt.originalY;
      if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) continue;

      const dist = Math.hypot(p.x - mpt.originalX, p.y - mpt.originalY);
      if (dist >= falloff) {
        // STRICTLY ZERO INFLUENCE OUTSIDE FALLOFF RADIUS!
        continue;
      }

      // Smooth cubic compact support kernel
      const t = 1 - (dist / falloff);
      const w = t * t * (3 - 2 * t);

      totalDx += dx * w;
      totalDy += dy * w;
      hasInfluence = true;
    }

    if (hasInfluence) {
      return {
        x: Number((p.x + totalDx).toFixed(2)),
        y: Number((p.y + totalDy).toFixed(2))
      };
    }
    return p;
  }

  // 3. Grid Bilinear Interpolation
  const tx = bounds.width > 0 ? (p.x - bounds.x) / bounds.width : 0;
  const ty = bounds.height > 0 ? (p.y - bounds.y) / bounds.height : 0;
  
  const cellX = Math.max(0, Math.min(densityX - 2, Math.floor(tx * (densityX - 1))));
  const cellY = Math.max(0, Math.min(densityY - 2, Math.floor(ty * (densityY - 1))));
  
  const idxTL = cellY * densityX + cellX;
  const idxTR = cellY * densityX + (cellX + 1);
  const idxBL = (cellY + 1) * densityX + cellX;
  const idxBR = (cellY + 1) * densityX + (cellX + 1);
  
  const topLeft = points[idxTL];
  const topRight = points[idxTR];
  const bottomLeft = points[idxBL];
  const bottomRight = points[idxBR];
  
  if (!topLeft || !topRight || !bottomLeft || !bottomRight) return p;
  
  const gridCellW = 1 / (densityX - 1);
  const gridCellH = 1 / (densityY - 1);
  const u = (tx - cellX * gridCellW) / gridCellW;
  const v = (ty - cellY * gridCellH) / gridCellH;
  
  const cu = Math.max(0, Math.min(1, u));
  const cv = Math.max(0, Math.min(1, v));
  
  const warpedX = topLeft.currentX * (1 - cu) * (1 - cv) +
                  topRight.currentX * cu * (1 - cv) +
                  bottomLeft.currentX * (1 - cu) * cv +
                  bottomRight.currentX * cu * cv;
                  
  const warpedY = topLeft.currentY * (1 - cu) * (1 - cv) +
                  topRight.currentY * cu * (1 - cv) +
                  bottomLeft.currentY * (1 - cu) * cv +
                  bottomRight.currentY * cu * cv;
                  
  return { x: warpedX, y: warpedY };
};

// 🌟 Distance from point to line segment helper
const pointToSegmentDistance = (p: Point, v: Point, w: Point): number => {
  const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
  if (l2 === 0) return distance(p, v);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return distance(p, {
    x: v.x + t * (w.x - v.x),
    y: v.y + t * (w.y - v.y)
  });
};

// 🌟 Distance from point to polygon boundary helper
const pointToPolygonDistance = (p: Point, polygon: Point[]): number => {
  let minD = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const v = polygon[i];
    const w = polygon[(i + 1) % polygon.length];
    const d = pointToSegmentDistance(p, v, w);
    if (d < minD) {
      minD = d;
    }
  }
  return minD;
};

// 🌟 Lasso selection deformation point helper with seamless organic boundary welding
const deformWithLasso = (p: Point, obj: VectorObject): Point => {
  if (
    obj.lassoDeformState && 
    obj.lassoDeformState.active && 
    obj.lassoDeformState.lassoPoints && 
    obj.lassoDeformState.lassoPoints.length >= 3
  ) {
    const polygon = obj.lassoDeformState.lassoPoints;
    let sumX = 0;
    let sumY = 0;
    polygon.forEach(pt => {
      sumX += pt.x;
      sumY += pt.y;
    });
    const lassoCenter = { localX: sumX / polygon.length, localY: sumY / polygon.length };
    // Rigid body transform of selected pixels relative to center
    const pTransformed = localToWorld(p, obj.lassoDeformState.transform, lassoCenter);

    if (isPointInPolygon(p, polygon)) {
      return pTransformed;
    } else {
      const d = pointToPolygonDistance(p, polygon);
      const polyBounds = calculateBoundingBox(polygon);
      const size = Math.max(polyBounds.width, polyBounds.height);
      // Perfect localized transition radius: 20% of selection size, bounded between 15px and 45px
      const R = Math.max(15, Math.min(45, size * 0.2));
      if (d >= R) {
        return p; // Keep points outside the transition range completely static!
      }
      const t = 1 - d / R;
      const w = t * t * (3 - 2 * t); // Hermite smoothstep for organic blend
      return {
        x: p.x + w * (pTransformed.x - p.x),
        y: p.y + w * (pTransformed.y - p.y)
      };
    }
  }
  return p;
};

// 🌟 Lasso Control Points Mesh Shepard's IDW deform helper
const deformWithLassoControlPoints = (p: Point, controlPoints: LassoControlPoint[]): Point => {
  if (!controlPoints || controlPoints.length === 0) return p;

  // Let's find if any control point is moved
  let hasMovement = false;
  for (const cp of controlPoints) {
    if (Math.abs(cp.currentX - cp.originalX) > 0.05 || Math.abs(cp.currentY - cp.originalY) > 0.05) {
      hasMovement = true;
      break;
    }
  }
  if (!hasMovement) return p;

  // Shepard's Interpolation (IDW)
  let sumX = 0;
  let sumY = 0;
  let totalWeight = 0;
  const pPower = 2; // Power parameter for distance weighting

  for (const cp of controlPoints) {
    const dx = p.x - cp.originalX;
    const dy = p.y - cp.originalY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.1) {
      // Extremely close to a control point, return its exact current position
      return { x: cp.currentX, y: cp.currentY };
    }

    const weight = 1 / Math.pow(dist, pPower);
    sumX += (cp.currentX - cp.originalX) * weight;
    sumY += (cp.currentY - cp.originalY) * weight;
    totalWeight += weight;
  }

  if (totalWeight > 0) {
    return {
      x: p.x + sumX / totalWeight,
      y: p.y + sumY / totalWeight
    };
  }

  return p;
};

// Puppet Pin Warp Shepard's IDW helper
const deformWithPuppetPins = (p: Point, pins: Pivot[]) => {
  if (!pins || pins.length === 0) return p;
  
  const movedPins = pins.filter(pin => {
    const curX = pin.currentLocalX !== undefined ? pin.currentLocalX : pin.localX;
    const curY = pin.currentLocalY !== undefined ? pin.currentLocalY : pin.localY;
    return Math.abs(curX - pin.localX) > 0.1 || Math.abs(curY - pin.localY) > 0.1;
  });
  
  if (movedPins.length === 0) return p;
  
  let totalWeight = 0;
  let deltaX = 0;
  let deltaY = 0;
  
  for (const pin of pins) {
    const d = distance(p, { x: pin.localX, y: pin.localY });
    if (d < 1) {
      const curX = pin.currentLocalX !== undefined ? pin.currentLocalX : pin.localX;
      const curY = pin.currentLocalY !== undefined ? pin.currentLocalY : pin.localY;
      return { x: curX, y: curY };
    }
  }
  
  for (const pin of pins) {
    const d = distance(p, { x: pin.localX, y: pin.localY });
    const curX = pin.currentLocalX !== undefined ? pin.currentLocalX : pin.localX;
    const curY = pin.currentLocalY !== undefined ? pin.currentLocalY : pin.localY;
    
    const weight = 1 / (d * d);
    totalWeight += weight;
    deltaX += (curX - pin.localX) * weight;
    deltaY += (curY - pin.localY) * weight;
  }
  
  if (totalWeight > 0) {
    return {
      x: p.x + deltaX / totalWeight,
      y: p.y + deltaY / totalWeight
    };
  }
  
  return p;
};

// Smart Warp Pin deformation helper (based on customizable radius, falloff curve, non-destructive)
const deformWithSmartWarp = (p: Point, smartWarp: any): Point => {
  if (!smartWarp || !smartWarp.pins || smartWarp.pins.length === 0) return p;
  
  const pins = smartWarp.pins;
  const influenceRadius = smartWarp.influenceRadius || 120;
  const influenceFalloff = smartWarp.influenceFalloff || 'smooth';

  let dx = 0;
  let dy = 0;

  for (const pin of pins) {
    const dist = distance(p, { x: pin.originalX, y: pin.originalY });
    if (dist < influenceRadius) {
      let weight = 0;
      const ratio = dist / influenceRadius;
      if (influenceFalloff === 'linear') {
        weight = 1 - ratio;
      } else if (influenceFalloff === 'sharp') {
        weight = Math.pow(1 - ratio, 2);
      } else { // smooth
        weight = (1 + Math.cos(Math.PI * ratio)) / 2;
      }
      dx += (pin.currentX - pin.originalX) * weight;
      dy += (pin.currentY - pin.originalY) * weight;
    }
  }

  return {
    x: p.x + dx,
    y: p.y + dy
  };
};

// 🌟 Spline Bezier Evaluation Helpers
const evaluateCubicBezier = (p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point => {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y
  };
};

const evaluateCubicBezierDerivative = (p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point => {
  const mt = 1 - t;
  return {
    x: 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y)
  };
};

const evaluateSplineCurrent = (segments: any[], t: number): Point => {
  if (!segments || segments.length === 0) return { x: 0, y: 0 };
  const numSegments = segments.length;
  const segIdx = Math.max(0, Math.min(numSegments - 1, Math.floor(t * numSegments)));
  const segT = (t * numSegments) - segIdx;
  const segment = segments[segIdx];
  return evaluateCubicBezier(segment.start, segment.cp1, segment.cp2, segment.end, segT);
};

const deformWithSpline = (p: Point, obj: any, idx: number, total: number): Point => {
  if (!obj.splineActive || !obj.splineControlPoints || obj.splineControlPoints.length === 0) return p;
  
  const segments = obj.splineControlPoints;
  const nSegs = segments.length;
  
  let t = total > 1 ? idx / (total - 1) : 0.5;
  t = Math.max(0, Math.min(1, t));
  
  // Find which segment this point belongs to
  const segIdx = Math.max(0, Math.min(nSegs - 1, Math.floor(t * nSegs)));
  const segT = (t * nSegs) - segIdx;
  
  const segment = segments[segIdx];
  const curPt = evaluateCubicBezier(segment.start, segment.cp1, segment.cp2, segment.end, segT);
  const curDeriv = evaluateCubicBezierDerivative(segment.start, segment.cp1, segment.cp2, segment.end, segT);
  
  // Calculate local orientation angle of current segment
  const curAngle = Math.atan2(curDeriv.y, curDeriv.x);
  
  // Base offset from original shape
  let offset = { x: 0, y: 0 };
  if (obj.splineOriginalPoints && obj.splineOriginalPoints[idx]) {
    const origPt = obj.splineOriginalPoints[idx];
    // Find base coordinate for comparison
    // Let's find equivalent starting coordinate on simple linear interpolation of initial spline control points.
    // At initialization, we evaluate initial spline position. Since we don't store initial curve,
    // we can approximate or compute relative offset at init.
    // A great approach is: if we stored absolute offset inside original points:
    // origOffset = origPt - C_initial(t)
    // To make it fully stable, let's look at relative position to original spline.
    // If we just store the absolute local offset, we can calculate it:
    // If the original shape points are in splineOriginalPoints, we can rotate/scale them nicely!
    const initPt = obj.points[idx] || p;
    offset = { x: initPt.x - origPt.x, y: initPt.y - origPt.y };
  } else {
    // Fallback: simple delta relative to local straight line
    const startPt = segments[0].start;
    const endPt = segments[nSegs - 1].end;
    const lineX = startPt.x + t * (endPt.x - startPt.x);
    const lineY = startPt.y + t * (endPt.y - startPt.y);
    offset = { x: p.x - lineX, y: p.y - lineY };
  }
  
  // Twist Points rotation & scale factor
  let twistAngle = 0;
  let twistScale = 1.0;
  if (obj.splineTwistPoints && obj.splineTwistPoints.length > 0) {
    obj.splineTwistPoints.forEach((tp: any) => {
      const d = Math.abs(t - tp.t);
      const falloff = Math.max(0, 1 - d / 0.35); // range of influence
      if (falloff > 0) {
        twistAngle += (tp.rotation * Math.PI / 180) * falloff;
        twistScale += (tp.scale - 1) * falloff;
      }
    });
  }
  
  // Rotate offset by tangent angle change and twistAngle
  const totalAngle = twistAngle;
  const cosA = Math.cos(totalAngle);
  const sinA = Math.sin(totalAngle);
  
  const rotatedOffset = {
    x: (offset.x * cosA - offset.y * sinA) * twistScale,
    y: (offset.x * sinA + offset.y * cosA) * twistScale
  };
  
  return {
    x: Number((curPt.x + rotatedOffset.x).toFixed(2)),
    y: Number((curPt.y + rotatedOffset.y).toFixed(2))
  };
};

// Cage deformation helper using Shepard's Inverse Distance Weighting (IDW)
const deformWithCage = (p: Point, cageState: any): Point => {
  if (!cageState || !cageState.points || cageState.points.length === 0) return p;

  const points = cageState.points;
  let totalWeight = 0;
  let dx = 0;
  let dy = 0;

  // Check if point P is exactly on a cage original point to prevent division by zero
  for (const pt of points) {
    const dist = distance(p, { x: pt.originalX, y: pt.originalY });
    if (dist < 0.1) {
      return {
        x: p.x + (pt.currentX - pt.originalX),
        y: p.y + (pt.currentY - pt.originalY)
      };
    }
  }

  // Calculate Shepard weights
  for (const pt of points) {
    const dist = distance(p, { x: pt.originalX, y: pt.originalY });
    const weight = 1 / Math.pow(dist, 2); // Inverse distance squared
    totalWeight += weight;
    dx += (pt.currentX - pt.originalX) * weight;
    dy += (pt.currentY - pt.originalY) * weight;
  }

  if (totalWeight > 0) {
    dx /= totalWeight;
    dy /= totalWeight;
  }

  return {
    x: Number((p.x + dx).toFixed(2)),
    y: Number((p.y + dy).toFixed(2))
  };
};

const getFullObjectBounds = (obj: VectorObject) => {
  let pts = [...obj.points];
  if (obj.subPaths && obj.subPaths.length > 0) {
    obj.subPaths.forEach(sub => {
      pts = pts.concat(sub);
    });
  }
  if (pts.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return calculateBoundingBox(pts);
};

const initializeCurvePathState = (obj: VectorObject, hPointsCount = 10, vPointsCount = 10): CurvePathState => {
  const bounds = getFullObjectBounds(obj);
  const minX = bounds.x;
  const minY = bounds.y;
  
  const yMid = minY + bounds.height * 0.5;
  const hControlPoints: Point[] = [];
  const hControlPoints0: Point[] = [];
  for (let i = 0; i < hPointsCount; i++) {
    const x = minX + (bounds.width > 0 ? (i / (hPointsCount - 1)) * bounds.width : 0);
    const pt = { x, y: yMid };
    hControlPoints.push({ ...pt });
    hControlPoints0.push({ ...pt });
  }

  const xMid = minX + bounds.width * 0.5;
  const vControlPoints: Point[] = [];
  const vControlPoints0: Point[] = [];
  for (let j = 0; j < vPointsCount; j++) {
    const y = minY + (bounds.height > 0 ? (j / (vPointsCount - 1)) * bounds.height : 0);
    const pt = { x: xMid, y };
    vControlPoints.push({ ...pt });
    vControlPoints0.push({ ...pt });
  }

  return {
    active: true,
    hPointsCount,
    vPointsCount,
    hControlPoints,
    vControlPoints,
    hControlPoints0,
    vControlPoints0
  };
};

const getCurvePathHash = (cps: CurvePathState): number => {
  const hCPs = cps.hControlPoints || [];
  const vCPs = cps.vControlPoints || [];
  let hash = hCPs.length + vCPs.length * 31;
  for (let i = 0; i < hCPs.length; i++) {
    hash += hCPs[i].x + hCPs[i].y * 17;
  }
  for (let i = 0; i < vCPs.length; i++) {
    hash += vCPs[i].x + vCPs[i].y * 17;
  }
  return hash;
};

const curvePathCache = new WeakMap<any, { hash: number; hTransforms: any[]; vTransforms: any[] }>();

const deformWithCurvePath = (p: Point, cps: CurvePathState): Point => {
  if (!cps || !cps.active) return p;
  
  const currentHash = getCurvePathHash(cps);
  let cached = curvePathCache.get(cps);
  if (!cached || cached.hash !== currentHash) {
    const hCPs = cps.hControlPoints || [];
    const hCPs0 = cps.hControlPoints0 || [];
    const vCPs = cps.vControlPoints || [];
    const vCPs0 = cps.vControlPoints0 || [];

    const nH = hCPs.length;
    const nV = vCPs.length;

    const hTransforms = hCPs.map((cp, i) => {
      const cp0 = hCPs0[i];
      let theta = 0;
      let scale = 1;
      if (nH > 1 && cp0 && cp) {
        const prevIdx = Math.max(0, i - 1);
        const nextIdx = Math.min(nH - 1, i + 1);
        if (prevIdx !== nextIdx) {
          const origDirX = hCPs0[nextIdx].x - hCPs0[prevIdx].x;
          const origDirY = hCPs0[nextIdx].y - hCPs0[prevIdx].y;
          const origLen = Math.hypot(origDirX, origDirY);

          const currDirX = hCPs[nextIdx].x - hCPs[prevIdx].x;
          const currDirY = hCPs[nextIdx].y - hCPs[prevIdx].y;
          const currLen = Math.hypot(currDirX, currDirY);

          if (origLen > 0.001) {
            theta = Math.atan2(currDirY, currDirX) - Math.atan2(origDirY, origDirX);
            scale = Math.max(0.1, Math.min(10, currLen / origLen));
          }
        }
      }
      return { cp0, cp, cosT: Math.cos(theta), sinT: Math.sin(theta), scale };
    });

    const vTransforms = vCPs.map((cp, j) => {
      const cp0 = vCPs0[j];
      let theta = 0;
      let scale = 1;
      if (nV > 1 && cp0 && cp) {
        const prevIdx = Math.max(0, j - 1);
        const nextIdx = Math.min(nV - 1, j + 1);
        if (prevIdx !== nextIdx) {
          const origDirX = vCPs0[nextIdx].x - vCPs0[prevIdx].x;
          const origDirY = vCPs0[nextIdx].y - vCPs0[prevIdx].y;
          const origLen = Math.hypot(origDirX, origDirY);

          const currDirX = vCPs[nextIdx].x - vCPs[prevIdx].x;
          const currDirY = vCPs[nextIdx].y - vCPs[prevIdx].y;
          const currLen = Math.hypot(currDirX, currDirY);

          if (origLen > 0.001) {
            theta = Math.atan2(currDirY, currDirX) - Math.atan2(origDirY, origDirX);
            scale = Math.max(0.1, Math.min(10, currLen / origLen));
          }
        }
      }
      return { cp0, cp, cosT: Math.cos(theta), sinT: Math.sin(theta), scale };
    });

    cached = { hash: currentHash, hTransforms, vTransforms };
    curvePathCache.set(cps, cached);
  }

  const { hTransforms, vTransforms } = cached;
  const nH = hTransforms.length;
  const nV = vTransforms.length;
  const power = 2;
  
  let totalWeight = 0;
  let weightedX = 0;
  let weightedY = 0;

  for (let i = 0; i < nH; i++) {
    const t = hTransforms[i];
    if (!t.cp0 || !t.cp) continue;
    const dx = p.x - t.cp0.x;
    const dy = p.y - t.cp0.y;
    const distSq = dx * dx + dy * dy;
    
    if (distSq < 0.001) {
      return { x: t.cp.x, y: t.cp.y };
    }
    
    const w = 1.0 / Math.pow(distSq, power / 2);
    totalWeight += w;
    
    const rx = t.scale * (dx * t.cosT - dy * t.sinT);
    const ry = t.scale * (dx * t.sinT + dy * t.cosT);
    weightedX += w * (t.cp.x + rx);
    weightedY += w * (t.cp.y + ry);
  }

  for (let j = 0; j < nV; j++) {
    const t = vTransforms[j];
    if (!t.cp0 || !t.cp) continue;
    const dx = p.x - t.cp0.x;
    const dy = p.y - t.cp0.y;
    const distSq = dx * dx + dy * dy;
    
    if (distSq < 0.001) {
      return { x: t.cp.x, y: t.cp.y };
    }
    
    const w = 1.0 / Math.pow(distSq, power / 2);
    totalWeight += w;
    
    const rx = t.scale * (dx * t.cosT - dy * t.sinT);
    const ry = t.scale * (dx * t.sinT + dy * t.cosT);
    weightedX += w * (t.cp.x + rx);
    weightedY += w * (t.cp.y + ry);
  }

  if (totalWeight === 0) return p;
  
  return {
    x: weightedX / totalWeight,
    y: weightedY / totalWeight
  };
};

const distanceToSegment = (p: Point, a: Point, b: Point): number => {
  const l2 = (b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y);
  if (l2 === 0) return distance(p, a);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return distance(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
};

const initializeFlexCurveState = (obj: VectorObject, nodeCount = 4): FlexCurveState => {
  const bounds = getFullObjectBounds(obj);
  const width = Math.max(bounds.width, 60);
  const height = Math.max(bounds.height, 60);
  
  const startX = bounds.x + width * 0.1;
  const endX = bounds.x + width * 0.9;
  const startY = bounds.y + height * 0.3;
  const endY = bounds.y + height * 0.3;
  
  const points: FlexCurveControlPoint[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const t = nodeCount > 1 ? i / (nodeCount - 1) : 0.5;
    const px = startX + t * (endX - startX);
    const arch = Math.sin(t * Math.PI) * (-height * 0.1);
    const py = startY + t * (endY - startY) + arch;
    
    points.push({
      id: `fcp_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 4)}`,
      x: Number(px.toFixed(2)),
      y: Number(py.toFixed(2)),
      origX: Number(px.toFixed(2)),
      origY: Number(py.toFixed(2))
    });
  }

  return {
    active: true,
    isAttached: true,
    points,
    influenceRadius: Math.max(80, Math.max(width, height) * 0.4),
    preserveLength: true
  };
};

const deformWithFlexCurve = (p: Point, fcs: FlexCurveState): Point => {
  if (!fcs || !fcs.active || !fcs.isAttached || !fcs.points || fcs.points.length < 2) {
    return p;
  }

  const pts = fcs.points;
  const numPts = pts.length;
  const radius = Math.max(fcs.influenceRadius || 120, 1200);
  
  let totalWeight = 0;
  let accumDx = 0;
  let accumDy = 0;

  for (let i = 0; i < numPts - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];

    const origVx = p2.origX - p1.origX;
    const origVy = p2.origY - p1.origY;
    const origLen = Math.hypot(origVx, origVy);
    if (origLen < 0.001) continue;

    const currVx = p2.x - p1.x;
    const currVy = p2.y - p1.y;
    const currLen = Math.hypot(currVx, currVy);
    if (currLen < 0.001) continue;

    const tx0 = origVx / origLen;
    const ty0 = origVy / origLen;
    const nx0 = -ty0;
    const ny0 = tx0;

    const dx0 = p.x - p1.origX;
    const dy0 = p.y - p1.origY;

    const u = dx0 * tx0 + dy0 * ty0;
    const v = dx0 * nx0 + dy0 * ny0;

    const uClamped = Math.max(0, Math.min(origLen, u));
    const closestX = p1.origX + uClamped * tx0;
    const closestY = p1.origY + uClamped * ty0;
    const dist = Math.hypot(p.x - closestX, p.y - closestY);

    if (dist > radius) continue;

    const normDist = dist / radius;
    const w = (1 - normDist) * (1 - normDist);

    const tx = currVx / currLen;
    const ty = currVy / currLen;
    const nx = -ty;
    const ny = tx;

    const effU = fcs.preserveLength !== false ? u : u * (currLen / origLen);
    const deformedX = p1.x + effU * tx + v * nx;
    const deformedY = p1.y + effU * ty + v * ny;

    accumDx += w * (deformedX - p.x);
    accumDy += w * (deformedY - p.y);
    totalWeight += w;
  }

  if (totalWeight < 0.0001) {
    return p;
  }

  return {
    x: p.x + accumDx / totalWeight,
    y: p.y + accumDy / totalWeight
  };
};

const getWorldLassoPointsForObject = (
  fill: {
    localLassoPoints: Point[];
    color: string;
    origBounds?: { minX: number; minY: number; width: number; height: number };
    origPoints?: Point[];
  },
  obj: VectorObject,
  localPivot: any
): Point[] => {
  if (!fill.localLassoPoints || fill.localLassoPoints.length === 0) return [];

  const currObjPoints = obj.points && obj.points.length > 0 ? obj.points : [];

  // Snapshot origPoints on fill if missing so we have a reference baseline
  if (!fill.origPoints && currObjPoints.length > 0) {
    fill.origPoints = currObjPoints.map(p => ({ x: p.x, y: p.y }));
  }

  const origObjPoints = fill.origPoints && fill.origPoints.length === currObjPoints.length
    ? fill.origPoints
    : currObjPoints;

  const N = origObjPoints.length;

  // Compute bounding boxes for bounding box remapping setup
  const origBox = fill.origBounds || (origObjPoints.length > 0 ? calculateBoundingBox(origObjPoints) : calculateBoundingBox(fill.localLassoPoints));
  const currBox = currObjPoints.length > 0 ? calculateBoundingBox(currObjPoints) : origBox;

  const origMinX = (origBox as any).minX ?? (origBox as any).x ?? 0;
  const origMinY = (origBox as any).minY ?? (origBox as any).y ?? 0;
  const currMinX = (currBox as any).x ?? (currBox as any).minX ?? 0;
  const currMinY = (currBox as any).y ?? (currBox as any).minY ?? 0;
  const origW = Math.max(1, origBox.width);
  const origH = Math.max(1, origBox.height);
  const currW = Math.max(1, currBox.width);
  const currH = Math.max(1, currBox.height);

  return fill.localLassoPoints.map(p => {
    let remappedLocalP: Point = { ...p };

    // 1. Calculate Bounding Box remapped position
    if (origW > 0 && origH > 0 && currW > 0 && currH > 0) {
      const u = (p.x - origMinX) / origW;
      const v = (p.y - origMinY) / origH;
      remappedLocalP = {
        x: currMinX + u * currW,
        y: currMinY + v * currH
      };
    }

    // 2. Calculate Inverse Distance Weighting (IDW) displacement if vertices moved relative to box
    if (N >= 2 && N === currObjPoints.length) {
      let totalW = 0;
      let accumDx = 0;
      let accumDy = 0;
      let exactMatch = false;

      for (let i = 0; i < N; i++) {
        const origP = origObjPoints[i];
        const currP = currObjPoints[i];

        const dx = p.x - origP.x;
        const dy = p.y - origP.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < 0.0001) {
          remappedLocalP = { x: currP.x, y: currP.y };
          exactMatch = true;
          break;
        }

        const w = 1.0 / distSq;
        // Calculate displacement beyond uniform box scaling
        const expectedScaledX = currMinX + ((origP.x - origMinX) / origW) * currW;
        const expectedScaledY = currMinY + ((origP.y - origMinY) / origH) * currH;
        const nonLinearDevX = currP.x - expectedScaledX;
        const nonLinearDevY = currP.y - expectedScaledY;

        accumDx += w * nonLinearDevX;
        accumDy += w * nonLinearDevY;
        totalW += w;
      }

      if (!exactMatch && totalW > 0) {
        remappedLocalP.x += accumDx / totalW;
        remappedLocalP.y += accumDy / totalW;
      }
    }

    // 3. Apply secondary non-linear deformations (FlexCurve, MeshWrap, Cage, PuppetPins, Spline, etc.)
    const deformed = deformLocalPoint(remappedLocalP, obj);

    // 4. Transform to world space
    return localToWorld(deformed, obj.transform, localPivot);
  });
};

const deformLocalPoint = (p: Point, drawObj: VectorObject, idx?: number, subPathIdx?: number): Point => {
  let curr = p;
  let copied = false;
  try {
    if (drawObj.lassoControlPoints && drawObj.lassoControlPoints.length > 0) {
      if (subPathIdx !== undefined && idx !== undefined) {
        const wasInsideLasso = drawObj.lassoControlPoints.some(cp => cp.subPathIndex === subPathIdx && cp.pointIndex === idx);
        if (wasInsideLasso) {
          if (!copied) { curr = { ...p }; copied = true; }
          curr = deformWithLassoControlPoints(curr, drawObj.lassoControlPoints);
        }
      } else {
        const wasInsideLasso = drawObj.lassoControlPoints.some(cp => (cp.subPathIndex === undefined || cp.subPathIndex === -1 || cp.subPathIndex === null) && cp.pointIndex === idx);
        if (wasInsideLasso) {
          if (!copied) { curr = { ...p }; copied = true; }
          curr = deformWithLassoControlPoints(curr, drawObj.lassoControlPoints);
        }
      }
    }
    if (drawObj.lassoDeformState && drawObj.lassoDeformState.active) {
      if (!copied) { curr = { ...p }; copied = true; }
      curr = deformWithLasso(curr, drawObj);
    }
    if (drawObj.cageState && drawObj.cageState.active) {
      if (!copied) { curr = { ...p }; copied = true; }
      curr = deformWithCage(curr, drawObj.cageState);
    }
    if (drawObj.meshState && drawObj.meshState.active) {
      if (!copied) { curr = { ...p }; copied = true; }
      const bounds = getFullObjectBounds(drawObj);
      curr = getWarpedPoint(curr, drawObj.meshState, bounds);
    }
    if (drawObj.splineActive && drawObj.splineControlPoints && drawObj.splineControlPoints.length > 0 && idx !== undefined) {
      if (!copied) { curr = { ...p }; copied = true; }
      const length = (subPathIdx !== undefined && drawObj.subPaths) ? drawObj.subPaths[subPathIdx].length : drawObj.points.length;
      curr = deformWithSpline(curr, drawObj, idx, length);
    }
    if (drawObj.pins && drawObj.pins.length > 0) {
      if (!copied) { curr = { ...p }; copied = true; }
      curr = deformWithPuppetPins(curr, drawObj.pins);
    }
    if (drawObj.smartWarp && drawObj.smartWarp.pins && drawObj.smartWarp.pins.length > 0) {
      if (!copied) { curr = { ...p }; copied = true; }
      curr = deformWithSmartWarp(curr, drawObj.smartWarp);
    }
    if (drawObj.curvePathState && drawObj.curvePathState.active) {
      if (!copied) { curr = { ...p }; copied = true; }
      curr = deformWithCurvePath(curr, drawObj.curvePathState);
    }
    if (drawObj.flexCurveState && drawObj.flexCurveState.active) {
      if (!copied) { curr = { ...p }; copied = true; }
      curr = deformWithFlexCurve(curr, drawObj.flexCurveState);
    }
  } catch (err) {
    console.error("deformLocalPoint error, falling back to current point:", err);
  }
  return curr;
};

const distanceSq = (p1: Point, p2: Point): number => {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return dx * dx + dy * dy;
};

const inverseDeformLocalPoint = (deformedLocal: Point, drawObj: VectorObject): Point => {
  let p = { ...deformedLocal };
  let bestP = { ...p };
  
  const getDeformed = (testPt: Point) => {
    if (drawObj.type === 'image') {
      const bounds = { x: 100, y: 100, width: 200, height: 200 };
      return deformImagePoint(testPt, drawObj, bounds);
    }
    return deformLocalPoint(testPt, drawObj);
  };

  let bestDist = distanceSq(getDeformed(p), deformedLocal);
  if (bestDist < 0.01) return bestP;
  
  let step = 16.0;
  const tolerance = 0.1;
  const maxIterations = 50;
  
  const dirs = [
    { x: 1, y: 0 }, { x: -1, y: 0 },
    { x: 0, y: 1 }, { x: 0, y: -1 }
  ];
  
  for (let iter = 0; iter < maxIterations; iter++) {
    let improved = false;
    for (const dir of dirs) {
      const testP = { x: p.x + dir.x * step, y: p.y + dir.y * step };
      const deformedTest = getDeformed(testP);
      const dist = distanceSq(deformedTest, deformedLocal);
      if (dist < bestDist) {
        bestDist = dist;
        bestP = { ...testP };
        improved = true;
      }
    }
    if (improved) {
      p = { ...bestP };
    } else {
      step *= 0.5;
      if (step < tolerance) break;
    }
  }
  return bestP;
};

const deformImagePoint = (p: Point, drawObj: VectorObject, imgBounds: any): Point => {
  let curr = { ...p };
  try {
    if (drawObj.lassoControlPoints && drawObj.lassoControlPoints.length > 0) {
      curr = deformWithLassoControlPoints(curr, drawObj.lassoControlPoints);
    }
    if (drawObj.lassoDeformState && drawObj.lassoDeformState.active) {
      curr = deformWithLasso(curr, drawObj);
    }
    if (drawObj.cageState && drawObj.cageState.active) {
      curr = deformWithCage(curr, drawObj.cageState);
    }
    if (drawObj.meshState && drawObj.meshState.active) {
      curr = getWarpedPoint(curr, drawObj.meshState, imgBounds);
    }
    if (drawObj.pins && drawObj.pins.length > 0) {
      curr = deformWithPuppetPins(curr, drawObj.pins);
    }
    if (drawObj.smartWarp && drawObj.smartWarp.pins && drawObj.smartWarp.pins.length > 0) {
      curr = deformWithSmartWarp(curr, drawObj.smartWarp);
    }
    if (drawObj.curvePathState && drawObj.curvePathState.active) {
      curr = deformWithCurvePath(curr, drawObj.curvePathState);
    }
    if (drawObj.flexCurveState && drawObj.flexCurveState.active) {
      curr = deformWithFlexCurve(curr, drawObj.flexCurveState);
    }
    if (drawObj.customVectorDeformState && drawObj.customVectorDeformState.active && drawObj.customVectorDeformState.nodes && drawObj.customVectorDeformState.nodes.length > 0) {
      if (drawObj.customVectorDeformState.rigidLinear) {
        const res = calculateRigidLinearDeformedPoints([curr], drawObj.customVectorDeformState.nodes);
        if (res && res[0]) curr = res[0];
      } else {
        const res = calculateCustomVectorDeformedPoints([curr], drawObj.customVectorDeformState.nodes, drawObj.customVectorDeformState.stiffness || 30);
        if (res && res[0]) curr = res[0];
      }
    }
  } catch (err) {
    console.error("deformImagePoint error:", err);
  }
  return curr;
};

// Textured triangle renderer for 2D HTML5 Canvas
const drawTexturedTriangle = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  u0: number, v0: number,
  u1: number, v1: number,
  u2: number, v2: number,
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number
) => {
  // Find centroid of destination triangle
  const cx = (x0 + x1 + x2) / 3;
  const cy = (y0 + y1 + y2) / 3;

  // Slightly push vertices outward from centroid (e.g. by 0.5 pixels) to avoid rendering seams
  const expand = 0.5;
  
  let dx0 = x0 - cx;
  let dy0 = y0 - cy;
  let len0 = Math.sqrt(dx0 * dx0 + dy0 * dy0);
  if (len0 > 0) {
    x0 += (dx0 / len0) * expand;
    y0 += (dy0 / len0) * expand;
  }

  let dx1 = x1 - cx;
  let dy1 = y1 - cy;
  let len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
  if (len1 > 0) {
    x1 += (dx1 / len1) * expand;
    y1 += (dy1 / len1) * expand;
  }

  let dx2 = x2 - cx;
  let dy2 = y2 - cy;
  let len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
  if (len2 > 0) {
    x2 += (dx2 / len2) * expand;
    y2 += (dy2 / len2) * expand;
  }

  const delta = u0 * (v1 - v2) + u1 * (v2 - v0) + u2 * (v0 - v1);
  if (Math.abs(delta) < 0.0001) return;

  const a = (x0 * (v1 - v2) + x1 * (v2 - v0) + x2 * (v0 - v1)) / delta;
  const c = (x0 * (u2 - u1) + x1 * (u0 - u2) + x2 * (u1 - u0)) / delta;
  const e = (x0 * (u1 * v2 - u2 * v1) + x1 * (u2 * v0 - u0 * v2) + x2 * (u0 * v1 - u1 * v0)) / delta;

  const b = (y0 * (v1 - v2) + y1 * (v2 - v0) + y2 * (v0 - v1)) / delta;
  const d = (y0 * (u2 - u1) + y1 * (u0 - u2) + y2 * (u1 - u0)) / delta;
  const f = (y0 * (u1 * v2 - u2 * v1) + y1 * (u2 * v0 - u0 * v2) + y2 * (u0 * v1 - u1 * v0)) / delta;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.closePath();
  ctx.clip();

  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
};

const isChildInsideParent = (
  child: VectorObject,
  parent: VectorObject,
  testTransform: Transform,
  objects: { [id: string]: VectorObject }
): boolean => {
  if (!parent.points || parent.points.length < 3) return true;
  
  // Get parent world points
  const parentPivot = parent.pivots[0] || { localX: 0, localY: 0 };
  const parentWorldPoints = parent.points.map(p => localToWorld(p, parent.transform, parentPivot));

  // Get child world points with testTransform
  const childPivot = child.pivots[0] || { localX: 0, localY: 0 };
  let localPoints = child.points;
  if (child.cageState && child.cageState.active) {
    localPoints = child.points.map(p => deformWithCage(p, child.cageState));
  } else if (child.meshState && child.meshState.active) {
    const bounds = calculateBoundingBox(child.points);
    localPoints = child.points.map(p => getWarpedPoint(p, child.meshState, bounds));
  } else if (child.pins && child.pins.length > 0) {
    localPoints = child.points.map(p => deformWithPuppetPins(p, child.pins));
  }
  const childWorldPoints = localPoints.map(p => localToWorld(p, testTransform, childPivot));

  // Check if every child world point is inside the parent polygon
  return childWorldPoints.every(pt => isPointInPolygon(pt, parentWorldPoints));
};

const getTaperWidth = (i: number, N: number, baseWidth: number, enabled: boolean): number => {
  if (!enabled || N <= 2) return baseWidth;
  const taperLength = Math.min(15, Math.floor(N / 3.5));
  if (taperLength <= 0) return baseWidth;
  
  if (i < taperLength) {
    const ratio = i / taperLength;
    const factor = Math.sin(ratio * Math.PI / 2);
    return baseWidth * factor;
  } else if (i >= N - taperLength) {
    const ratio = (N - 1 - i) / taperLength;
    const factor = Math.sin(ratio * Math.PI / 2);
    return baseWidth * factor;
  }
  return baseWidth;
};

const createRealismPoint = (
  coords: Point,
  lastPt: Point | null,
  settings?: RealismSettings
): Point => {
  const now = Date.now();
  let w = settings?.maxThickness ?? 3.5;
  let angle = 0;
  
  if (lastPt) {
    const dist = Math.hypot(coords.x - lastPt.x, coords.y - lastPt.y);
    const dt = now - (lastPt.t ?? (now - 16));
    const timeDelta = Math.max(1, dt);
    
    // 1. Velocity-Based Auto-Taper
    if (settings?.autoTaperEnabled) {
      const speed = dist / timeDelta; // px per ms
      // Speed thinning formula: fast = thin, slow = thick
      const thinning = speed * (settings.thinningFactor * 10);
      w = Math.max(settings.minThickness, settings.maxThickness - thinning);
    }
    
    // 2. Stroke Angle
    angle = Math.atan2(coords.y - lastPt.y, coords.x - lastPt.x);
  } else {
    w = settings ? (settings.maxThickness + settings.minThickness) / 2 : 3.5;
  }
  
  // 3. Micro-Jitter
  let jitterX = 0;
  let jitterY = 0;
  if (settings?.microJitterEnabled) {
    const amt = settings.microJitterAmount;
    jitterX = Math.random() * amt - amt / 2;
    jitterY = Math.random() * amt - amt / 2;
  }
  
  // 4. Paper Grain static modifier
  let grainOpacity = 1.0;
  if (settings?.paperGrainEnabled) {
    const intensity = settings.paperGrainIntensity;
    grainOpacity = 1.0 - (Math.random() * intensity);
  }
  
  return {
    x: coords.x,
    y: coords.y,
    t: now,
    w: Number(w.toFixed(2)),
    angle,
    jitterX: Number(jitterX.toFixed(2)),
    jitterY: Number(jitterY.toFixed(2)),
    grainOpacity: Number(grainOpacity.toFixed(2))
  };
};

const applyBrushSettingsToCtx = (
  ctx: CanvasRenderingContext2D,
  brush: Partial<BrushSettings>,
  baseColor: string,
  strokeWidth: number
) => {
  const opacity = brush.strokeOpacity ?? 1.0;
  ctx.globalAlpha = ctx.globalAlpha * opacity;

  // Apply basic shadow if enabled
  if (brush.shadowEnabled) {
    ctx.shadowColor = brush.shadowColor ?? '#000000';
    ctx.shadowBlur = brush.shadowBlur ?? 4;
    ctx.shadowOffsetX = brush.shadowOffsetX ?? 2;
    ctx.shadowOffsetY = brush.shadowOffsetY ?? 2;
  } else {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  // Hardness & blur filters
  const blurVal = brush.blur ?? 0;
  if (blurVal > 0) {
    ctx.filter = `blur(${blurVal}px)`;
  } else {
    ctx.filter = 'none';
  }
};

const drawVariableWidthStrokeInternal = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  baseColor: string,
  settings?: RealismSettings,
  widthOffset: number = 0,
  drawShading: boolean = true,
  brush?: Partial<BrushSettings>
) => {
  if (points.length === 0) return;

  ctx.save();
  const brushType = brush?.brushType || 'solid';
  const baseWidth = (brush?.strokeWidth ?? 5) + widthOffset;

  if (brush) {
    applyBrushSettingsToCtx(ctx, brush, baseColor, baseWidth);
  }

  // Split points by gap flag
  const segments: Point[][] = [];
  let currentSegment: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (pt.gap && currentSegment.length > 0) {
      segments.push(currentSegment);
      currentSegment = [];
    }
    currentSegment.push(pt);
  }
  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  segments.forEach(seg => {
    if (seg.length === 0) return;

    if (brushType === 'calligraphy') {
      // 2. Calligraphy Chisel Nib Brush
      const angle = ((brush?.chiselAngle ?? 45) * Math.PI) / 180;
      ctx.save();
      ctx.fillStyle = baseColor;
      for (let i = 0; i < seg.length; i++) {
        const pt = seg[i];
        ctx.save();
        ctx.translate(pt.x, pt.y);
        ctx.rotate(angle);
        ctx.fillRect(-baseWidth / 2, -baseWidth / 8, baseWidth, Math.max(1, baseWidth / 4));
        ctx.restore();
      }
      ctx.restore();
    } else if (brushType === 'pencil') {
      // 3. Pencil Sketch Brush
      ctx.save();
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = Math.max(1, baseWidth * 0.7);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.8;
      
      ctx.beginPath();
      if (seg.length === 1) {
        ctx.arc(seg[0].x, seg[0].y, baseWidth / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.moveTo(seg[0].x, seg[0].y);
        for (let i = 1; i < seg.length; i++) {
          const xc = (seg[i].x + seg[i - 1].x) / 2;
          const yc = (seg[i].y + seg[i - 1].y) / 2;
          ctx.quadraticCurveTo(seg[i - 1].x, seg[i - 1].y, xc, yc);
        }
        ctx.lineTo(seg[seg.length - 1].x, seg[seg.length - 1].y);
        ctx.stroke();
      }
      ctx.restore();
    } else if (brushType === 'marker') {
      // 4. Marker Highlighter Brush
      ctx.save();
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = baseWidth * 1.2;
      ctx.lineCap = 'square';
      ctx.lineJoin = 'miter';
      ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.55;
      ctx.beginPath();
      if (seg.length === 1) {
        ctx.fillRect(seg[0].x - baseWidth / 2, seg[0].y - baseWidth / 2, baseWidth, baseWidth);
      } else {
        ctx.moveTo(seg[0].x, seg[0].y);
        for (let i = 1; i < seg.length; i++) {
          const xc = (seg[i].x + seg[i - 1].x) / 2;
          const yc = (seg[i].y + seg[i - 1].y) / 2;
          ctx.quadraticCurveTo(seg[i - 1].x, seg[i - 1].y, xc, yc);
        }
        ctx.lineTo(seg[seg.length - 1].x, seg[seg.length - 1].y);
        ctx.stroke();
      }
      ctx.restore();
    } else if (brushType === 'airbrush') {
      // 5. Soft Airbrush Spray
      ctx.save();
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = baseWidth * 1.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.filter = `blur(${Math.max(2, baseWidth * 0.3)}px)`;
      ctx.beginPath();
      if (seg.length === 1) {
        ctx.arc(seg[0].x, seg[0].y, baseWidth, 0, Math.PI * 2);
        ctx.fillStyle = baseColor;
        ctx.fill();
      } else {
        ctx.moveTo(seg[0].x, seg[0].y);
        for (let i = 1; i < seg.length; i++) {
          const xc = (seg[i].x + seg[i - 1].x) / 2;
          const yc = (seg[i].y + seg[i - 1].y) / 2;
          ctx.quadraticCurveTo(seg[i - 1].x, seg[i - 1].y, xc, yc);
        }
        ctx.lineTo(seg[seg.length - 1].x, seg[seg.length - 1].y);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      // 1. Solid Monoline Vector Brush
      ctx.beginPath();
      if (seg.length === 1) {
        const pt = seg[0];
        const r = Math.max(0.1, baseWidth / 2);
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fillStyle = baseColor;
        ctx.fill();
      } else {
        ctx.moveTo(seg[0].x, seg[0].y);
        for (let i = 1; i < seg.length; i++) {
          const xc = (seg[i].x + seg[i - 1].x) / 2;
          const yc = (seg[i].y + seg[i - 1].y) / 2;
          ctx.quadraticCurveTo(seg[i - 1].x, seg[i - 1].y, xc, yc);
        }
        ctx.lineTo(seg[seg.length - 1].x, seg[seg.length - 1].y);

        ctx.strokeStyle = baseColor;
        ctx.lineWidth = baseWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    }
  });

  ctx.restore();
};

const drawVariableWidthStroke = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  baseColor: string,
  settings?: RealismSettings,
  brush?: Partial<BrushSettings>
) => {
  drawVariableWidthStrokeInternal(ctx, points, baseColor, settings, 0, false, brush);
};

interface CanvasAreaProps {
  objects: { [id: string]: VectorObject };
  setObjects: React.Dispatch<React.SetStateAction<{ [id: string]: VectorObject }>>;
  updateObject?: (id: string, updates: Partial<VectorObject>) => void;
  selectedObjectId: string | null;
  setSelectedObjectId: (id: string | null) => void;
  activeTool: string;
  setActiveTool?: (tool: string) => void;
  frames: Frame[];
  currentFrameIndex: number;
  autoTween?: boolean;
  bones: Bone[];
  setBones: React.Dispatch<React.SetStateAction<Bone[]>>;
  activeLayerId: string;
  onionSkinEnabled: boolean;
  showBones?: boolean;
  isPlaying: boolean;
  historyPush: () => void;
  layers?: any[];
  setLayers?: React.Dispatch<React.SetStateAction<any[]>>;
  lassoPoints: Point[];
  setLassoPoints: React.Dispatch<React.SetStateAction<Point[]>>;
  lassoMode: 'freehand' | 'pen';
  setLassoMode: (mode: 'freehand' | 'pen') => void;
  penLassoPoints: Point[];
  setPenLassoPoints: React.Dispatch<React.SetStateAction<Point[]>>;
  realismSettings?: RealismSettings;
  is360WizardActive?: boolean;
  draft360Views?: any[];
  onionSkinEnabled360?: boolean;
  artboardW: number;
  setArtboardW: React.Dispatch<React.SetStateAction<number>>;
  artboardH: number;
  setArtboardH: React.Dispatch<React.SetStateAction<number>>;
  showCanvasSizePanel: boolean;
  setShowCanvasSizePanel: React.Dispatch<React.SetStateAction<boolean>>;
  adaptiveSubdivisionEnabled: boolean;
  adaptiveSubdivisionPoints: number;
  fillToolColor?: string;
  setFillToolColor?: (color: string) => void;
  ignoreInnerDrawings?: boolean;
  brushSettings?: BrushSettings;
  setBrushSettings?: React.Dispatch<React.SetStateAction<BrushSettings>>;
  selectedDeformPointIndex?: number | null;
  setSelectedDeformPointIndex?: (idx: number | null) => void;
  selectedDeformPointType?: 'standard' | 'grid' | '3d' | null;
  setSelectedDeformPointType?: (type: 'standard' | 'grid' | '3d' | null) => void;
  setOriginalDeformPointCoords?: (coords: { x: number; y: number; z?: number } | null) => void;
  setDeformPointTransform?: (t: Transform) => void;
  isRecording?: boolean;
  liquifySettings?: LiquifyBrushSettings;
  setLiquifySettings?: React.Dispatch<React.SetStateAction<LiquifyBrushSettings>>;
  hideLassoSelection?: boolean;
  setHideLassoSelection?: React.Dispatch<React.SetStateAction<boolean>>;
  fslPoints?: Point[];
  setFslPoints?: React.Dispatch<React.SetStateAction<Point[]>>;
  hideFslSelection?: boolean;
  setHideFslSelection?: React.Dispatch<React.SetStateAction<boolean>>;
  continuousDrawActive?: boolean;
  setContinuousDrawActive?: (active: boolean) => void;
  activeContinuousDrawingId?: string | null;
  setActiveContinuousDrawingId?: (id: string | null) => void;
  lassoRestrictActive?: boolean;
  setLassoRestrictActive?: (active: boolean) => void;
  registerInverseDeformer?: (fn: (pts: Point[], obj: VectorObject) => Point[]) => void;
}

const initializeCageState = (obj: VectorObject): any => {
  const bounds = getFullObjectBounds(obj);
  const minX = bounds.x;
  const minY = bounds.y;
  const maxX = bounds.x + bounds.width;
  const maxY = bounds.y + bounds.height;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const coords = [
    { x: minX, y: minY },       // TL
    { x: midX, y: minY },       // TM
    { x: maxX, y: minY },       // TR
    { x: maxX, y: midY },       // MR
    { x: maxX, y: maxY },       // BR
    { x: midX, y: maxY },       // BM
    { x: minX, y: maxY },       // BL
    { x: minX, y: midY }        // ML
  ];

  const points = coords.map((c, i) => ({
    id: `cage_pt_${i}_${Date.now()}`,
    originalX: Number(c.x.toFixed(2)),
    originalY: Number(c.y.toFixed(2)),
    currentX: Number(c.x.toFixed(2)),
    currentY: Number(c.y.toFixed(2))
  }));

  return {
    active: true,
    points,
    showGrid: true
  };
};

const initializeMeshState = (obj: VectorObject, densityX = 10, densityY = 10): any => {
  const bounds = getFullObjectBounds(obj);
  const points: any[] = [];
  const stepX = bounds.width / (densityX - 1);
  const stepY = bounds.height / (densityY - 1);
  for (let y = 0; y < densityY; y++) {
    for (let x = 0; x < densityX; x++) {
      const px = bounds.x + x * stepX;
      const py = bounds.y + y * stepY;
      points.push({
        id: `mpt_${Date.now()}_${y}_${x}`,
        originalX: Number(px.toFixed(2)),
        originalY: Number(py.toFixed(2)),
        currentX: Number(px.toFixed(2)),
        currentY: Number(py.toFixed(2)),
        pinned: false,
        pinType: null
      });
    }
  }
  return {
    active: true,
    densityX,
    densityY,
    points,
    originalPoints: JSON.parse(JSON.stringify(points)),
    pointSize: 10,
    showGrid: true,
    showPoints: true,
    previewMode: true
  };
};

export default function CanvasArea({
  objects: rawObjects,
  setObjects,
  updateObject,
  selectedObjectId,
  setSelectedObjectId,
  activeTool,
  setActiveTool,
  frames,
  currentFrameIndex,
  autoTween = true,
  bones,
  setBones,
  activeLayerId = 'layer-1',
  onionSkinEnabled,
  showBones = true,
  isPlaying,
  historyPush,
  layers = [],
  setLayers,
  lassoPoints,
  setLassoPoints,
  lassoMode,
  setLassoMode,
  penLassoPoints,
  setPenLassoPoints,
  realismSettings,
  is360WizardActive = false,
  draft360Views = [],
  onionSkinEnabled360 = true,
  artboardW,
  setArtboardW,
  artboardH,
  setArtboardH,
  showCanvasSizePanel,
  setShowCanvasSizePanel,
  adaptiveSubdivisionEnabled,
  adaptiveSubdivisionPoints,
  fillToolColor = '#4CAF50',
  setFillToolColor,
  ignoreInnerDrawings = true,
  brushSettings,
  setBrushSettings,
  selectedDeformPointIndex = null,
  setSelectedDeformPointIndex,
  selectedDeformPointType = null,
  setSelectedDeformPointType,
  setOriginalDeformPointCoords,
  setDeformPointTransform,
  isRecording = false,
  liquifySettings,
  setLiquifySettings,
  hideLassoSelection = false,
  setHideLassoSelection,
  fslPoints = [],
  setFslPoints,
  hideFslSelection = false,
  setHideFslSelection,
  continuousDrawActive = false,
  setContinuousDrawActive,
  activeContinuousDrawingId = null,
  setActiveContinuousDrawingId,
  lassoRestrictActive = false,
  setLassoRestrictActive,
  registerInverseDeformer,
}: CanvasAreaProps) {
  React.useEffect(() => {
    if (registerInverseDeformer) {
      registerInverseDeformer((pts, obj) => {
        return pts.map(p => inverseDeformLocalPoint(p, obj));
      });
    }
  }, [registerInverseDeformer]);

  const effectiveSelectedObjectId = (isRecording || isPlaying) ? null : selectedObjectId;

  const activeObjects: { [id: string]: VectorObject } = React.useMemo(() => {
    if (autoTween) {
      return getInterpolatedObjects(frames, currentFrameIndex, rawObjects);
    }
    return rawObjects;
  }, [autoTween, frames, currentFrameIndex, rawObjects]);

  const objects: { [id: string]: VectorObject } = activeObjects;

  const dragRafRef = useRef<number | null>(null);
  const pendingCoordsRef = useRef<{ x: number; y: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const backCanvasRef = useRef<HTMLCanvasElement>(null);
  const frontCanvasRef = useRef<HTMLCanvasElement>(null);
  const imagesCacheRef = useRef<{ [url: string]: HTMLImageElement }>({});
  const [, setForceRender] = useState(0);

  const [dimensions, setDimensions] = useState({ width: 1000, height: 700 });

  const [tempArtboardW, setTempArtboardW] = useState<string>(artboardW.toString());
  const [tempArtboardH, setTempArtboardH] = useState<string>(artboardH.toString());

  useEffect(() => {
    const nextW = artboardW.toString();
    const nextH = artboardH.toString();
    setTempArtboardW(prev => prev === nextW ? prev : nextW);
    setTempArtboardH(prev => prev === nextH ? prev : nextH);
  }, [artboardW, artboardH]);

  const recenterCanvas = () => {
    try {
      const scaleX = (dimensions.width - 48) / artboardW;
      const scaleY = (dimensions.height - 48) / artboardH;
      const bestScale = Math.min(2.0, Math.max(0.3, Math.min(scaleX, scaleY)));
      const offsetX = (dimensions.width - artboardW * bestScale) / 2;
      const offsetY = (dimensions.height - artboardH * bestScale) / 2;
      
      setZoomScale(prev => {
        if (Math.abs(prev - bestScale) < 0.001) {
          return prev;
        }
        return bestScale;
      });
      
      setZoomOffset(prev => {
        if (Math.abs(prev.x - offsetX) < 0.01 && Math.abs(prev.y - offsetY) < 0.01) {
          return prev;
        }
        return { x: offsetX, y: offsetY };
      });
    } catch (err) {
      console.error("Recenter canvas failed", err);
    }
  };

  const getActiveTargetObjectInfo = (id: string | null): { rawObj: VectorObject; activeObj: VectorObject; targetId: string } | null => {
    if (!id || !objects[id]) return null;
    try {
      const rawObj = objects[id];
      if (rawObj.type === '360_container' && rawObj.views360 && rawObj.views360.length > 0) {
        const activeObj = resolve360Object(rawObj, objects);
        const activeViewId = (activeObj as any).activeViewId || activeObj.id;
        if (activeViewId && objects[activeViewId]) {
          return { rawObj, activeObj: objects[activeViewId], targetId: activeViewId };
        }
        return { rawObj, activeObj, targetId: activeObj.id };
      }
      return { rawObj, activeObj: rawObj, targetId: rawObj.id };
    } catch (err) {
      console.error("Error resolving active view angle object:", err);
      if (objects[id]) {
        return { rawObj: objects[id], activeObj: objects[id], targetId: id };
      }
      return null;
    }
  };

  const handleExtractPart = (infillColor: string) => {
    try {
      const targetInfo = getActiveTargetObjectInfo(selectedObjectId);
      if (!targetInfo) return;
      const { rawObj, activeObj: sourceObj, targetId } = targetInfo;
      const activeLasso = lassoPoints && lassoPoints.length >= 3 ? lassoPoints : penLassoPoints;
      if (!activeLasso || activeLasso.length < 3) return;

      const pivot = sourceObj.pivots?.[0] || { localX: 0, localY: 0 };
      const localLassoPoints = activeLasso.map(p => worldToLocal(p, sourceObj.transform, pivot));

      const result = isolateAndExtractPNGPart(sourceObj, localLassoPoints, {
        infillColor,
        infillMode: 'color'
      });

      if (!result) return;

      if (rawObj.type === '360_container') {
        result.extractedPartObject = {
          ...result.extractedPartObject,
          associatedViewId: sourceObj.id,
          container360Id: rawObj.id
        } as any;
        if (result.mouthCavityObject) {
          result.mouthCavityObject = {
            ...result.mouthCavityObject,
            associatedViewId: sourceObj.id,
            container360Id: rawObj.id
          } as any;
        }
      }

      setObjects(prev => {
        const updated = { ...prev };
        updated[result.patchedOriginalObject.id] = result.patchedOriginalObject;
        updated[result.extractedPartObject.id] = result.extractedPartObject;
        if (result.mouthCavityObject) {
          updated[result.mouthCavityObject.id] = result.mouthCavityObject;
        }
        return updated;
      });

      setSelectedObjectId(result.extractedPartObject.id);
      setLassoPoints([]);
      setPenLassoPoints([]);
      historyPush();
    } catch (err) {
      console.error("Error extracting part on current view:", err);
    }
  };

  const handleSetupMouthPosing = (cavityColor: string) => {
    try {
      const targetInfo = getActiveTargetObjectInfo(selectedObjectId);
      if (!targetInfo) return;
      const { rawObj, activeObj: sourceObj, targetId } = targetInfo;
      const activeLasso = lassoPoints && lassoPoints.length >= 3 ? lassoPoints : penLassoPoints;
      if (!activeLasso || activeLasso.length < 3) return;

      const pivot = sourceObj.pivots?.[0] || { localX: 0, localY: 0 };
      const localLassoPoints = activeLasso.map(p => worldToLocal(p, sourceObj.transform, pivot));

      const { updatedObjects, mouthGroupIds } = setupPNGMouthPosing(sourceObj, localLassoPoints, {
        mouthCavityColor: cavityColor,
      });

      if (Object.keys(updatedObjects).length === 0) return;

      if (rawObj.type === '360_container') {
        Object.keys(updatedObjects).forEach(k => {
          if (k !== sourceObj.id) {
            (updatedObjects[k] as any).associatedViewId = sourceObj.id;
            (updatedObjects[k] as any).container360Id = rawObj.id;
          }
        });
      }

      setObjects(prev => ({
        ...prev,
        ...updatedObjects
      }));

      if (mouthGroupIds.length > 0) {
        setSelectedObjectId(mouthGroupIds[0]);
      }
      setLassoPoints([]);
      setPenLassoPoints([]);
      historyPush();
    } catch (err) {
      console.error("Error setting up mouth posing on current view:", err);
    }
  };

  const handleSetupEyePosing = (skinColor: string) => {
    try {
      const targetInfo = getActiveTargetObjectInfo(selectedObjectId);
      if (!targetInfo) return;
      const { rawObj, activeObj: sourceObj, targetId } = targetInfo;
      const activeLasso = lassoPoints && lassoPoints.length >= 3 ? lassoPoints : penLassoPoints;
      if (!activeLasso || activeLasso.length < 3) return;

      const pivot = sourceObj.pivots?.[0] || { localX: 0, localY: 0 };
      const localLassoPoints = activeLasso.map(p => worldToLocal(p, sourceObj.transform, pivot));

      const { updatedObjects, eyeGroupIds } = setupPNGEyePosing(sourceObj, localLassoPoints, {
        skinInfillColor: skinColor,
      });

      if (Object.keys(updatedObjects).length === 0) return;

      if (rawObj.type === '360_container') {
        Object.keys(updatedObjects).forEach(k => {
          if (k !== sourceObj.id) {
            (updatedObjects[k] as any).associatedViewId = sourceObj.id;
            (updatedObjects[k] as any).container360Id = rawObj.id;
          }
        });
      }

      setObjects(prev => ({
        ...prev,
        ...updatedObjects
      }));

      if (eyeGroupIds.length > 0) {
        setSelectedObjectId(eyeGroupIds[0]);
      }
      setLassoPoints([]);
      setPenLassoPoints([]);
      historyPush();
    } catch (err) {
      console.error("Error setting up eye posing on current view:", err);
    }
  };

  const handleConvertTo3D = (depth: number) => {
    try {
      const targetInfo = getActiveTargetObjectInfo(selectedObjectId);
      if (!targetInfo) return;
      const { activeObj: sourceObj, targetId } = targetInfo;
      const imgCache = sourceObj.imageUrl ? imagesCacheRef.current[sourceObj.imageUrl] : null;

      const updatedObj = convertPNGTo3DVolumetric(sourceObj, imgCache, depth);

      setObjects(prev => ({
        ...prev,
        [targetId]: updatedObj
      }));
      historyPush();
    } catch (err) {
      console.error("Error converting current view to 3D:", err);
    }
  };

  const handleUpdateTransform3D = (updates: any) => {
    try {
      const targetInfo = getActiveTargetObjectInfo(selectedObjectId);
      if (!targetInfo) return;
      const { activeObj: sourceObj, targetId } = targetInfo;

      const current3D = sourceObj.transform3D || {
        x: sourceObj.transform.x,
        y: sourceObj.transform.y,
        z: sourceObj.z ?? 0,
        rx: 0,
        ry: 0,
        rz: 0,
        sx: sourceObj.transform.scaleX || 1,
        sy: sourceObj.transform.scaleY || 1,
        sz: 1,
        extrusion: { depth: 50, segments: 1, bevel: 2 },
        enabled: true
      };

      const new3D = applyGeometryProtection({
        ...current3D,
        ...updates,
        extrusion: updates.extrusion ? { ...current3D.extrusion, ...updates.extrusion } : current3D.extrusion
      });

      setObjects(prev => ({
        ...prev,
        [targetId]: {
          ...sourceObj,
          transform3D: new3D,
          transform: {
            ...sourceObj.transform,
            scaleY: updates.sy !== undefined ? updates.sy : sourceObj.transform.scaleY
          }
        }
      }));
    } catch (err) {
      console.error("Error updating 3D transform on current view:", err);
    }
  };

  const handleShiftZDepth = (deltaZ: number) => {
    try {
      const targetInfo = getActiveTargetObjectInfo(selectedObjectId);
      if (!targetInfo) return;
      const { activeObj: sourceObj, targetId } = targetInfo;

      const currentZ = sourceObj.z ?? 0;
      const newZ = currentZ + deltaZ;

      setObjects(prev => ({
        ...prev,
        [targetId]: {
          ...sourceObj,
          z: newZ,
          transform3D: sourceObj.transform3D ? { ...sourceObj.transform3D, z: newZ } : undefined
        }
      }));
      historyPush();
    } catch (err) {
      console.error("Error shifting Z depth on current view:", err);
    }
  };

  const handleApplyCustomColor = (color: string) => {
    try {
      const targetInfo = getActiveTargetObjectInfo(selectedObjectId);
      if (!targetInfo) return;
      const { activeObj: sourceObj, targetId } = targetInfo;

      setObjects(prev => ({
        ...prev,
        [targetId]: {
          ...sourceObj,
          fillColor: color,
          subPathFills: { 0: color }
        }
      }));
      historyPush();
    } catch (err) {
      console.error("Error applying color on current view:", err);
    }
  };

  const fitCanvasToViewport = () => {
    try {
      const w = Math.round(dimensions.width);
      const h = Math.round(dimensions.height);
      setArtboardW(w);
      setArtboardH(h);
      setZoomScale(1.0);
      setZoomOffset({ x: 0, y: 0 });
    } catch (err) {
      console.error("Fit canvas to viewport failed", err);
    }
  };

  const paintColorAt = (worldCoords: Point, obj: VectorObject) => {
    if (!obj.smartMeshColor) return;
    
    const localPivot = obj.pivots[0] || { localX: 0, localY: 0 };
    const localPos = worldToLocal(worldCoords, obj.transform, localPivot);
    const smc = obj.smartMeshColor;
    const brushSize = smc.brushSize || 40;
    const brushColor = smc.brushColor || '#10b981';
    const brushOpacity = smc.brushOpacity !== undefined ? smc.brushOpacity : 1.0;
    
    let pointsChanged = false;
    let cellsChanged = false;

    // 1. If paintMode is 'point', update colors of vertices close to the local brush coordinate
    const updatedPoints = smc.points.map(pt => {
      if (smc.paintMode !== 'point') return pt;
      // Warp point dynamically with all active deformations so we check distance to where the point is currently deformed!
      const deformedLocal = deformLocalPoint({ x: pt.originalX, y: pt.originalY }, obj);
      const dist = distance(localPos, deformedLocal);
      
      if (dist <= brushSize) {
        pointsChanged = true;
        return {
          ...pt,
          color: brushColor,
          opacity: brushOpacity
        };
      }
      return pt;
    });

    // 2. If paintMode is 'cell', find cells whose center point is close to the local brush coordinate
    const updatedCells = smc.cells.map(cell => {
      if (smc.paintMode !== 'cell') return cell;
      // Compute the average center point of cell's 4 corner vertices
      let sumX = 0;
      let sumY = 0;
      let valid = true;
      
      cell.pointIds.forEach(pId => {
        const pt = smc.points.find(p => p.id === pId);
        if (pt) {
          const deformedLocal = deformLocalPoint({ x: pt.originalX, y: pt.originalY }, obj);
          sumX += deformedLocal.x;
          sumY += deformedLocal.y;
        } else {
          valid = false;
        }
      });
      
      if (valid) {
        const center = { x: sumX / cell.pointIds.length, y: sumY / cell.pointIds.length };
        const dist = distance(localPos, center);
        if (dist <= brushSize) {
          cellsChanged = true;
          return {
            ...cell,
            color: brushColor,
            opacity: brushOpacity
          };
        }
      }
      return cell;
    });

    if (pointsChanged || cellsChanged) {
      setObjects(prev => {
        const curObj = prev[obj.id];
        if (!curObj || !curObj.smartMeshColor) return prev;
        return {
          ...prev,
          [obj.id]: {
            ...curObj,
            smartMeshColor: {
              ...curObj.smartMeshColor,
              points: updatedPoints,
              cells: updatedCells
            }
          }
        };
      });
    }
  };

  const zoomIn = () => {
    try {
      const currentScale = zoomScale;
      const nextScale = Math.min(10.0, currentScale + 0.15);
      const factor = currentScale > 0 ? nextScale / currentScale : 1;
      const centerX = dimensions.width / 2;
      const centerY = dimensions.height / 2;
      
      setZoomScale(nextScale);
      setZoomOffset(prevOffset => ({
        x: centerX - (centerX - prevOffset.x) * factor,
        y: centerY - (centerY - prevOffset.y) * factor
      }));
    } catch (err) {
      console.error("Zoom in failed", err);
    }
  };

  const zoomOut = () => {
    try {
      const currentScale = zoomScale;
      const nextScale = Math.max(0.15, currentScale - 0.15);
      const factor = currentScale > 0 ? nextScale / currentScale : 1;
      const centerX = dimensions.width / 2;
      const centerY = dimensions.height / 2;
      
      setZoomScale(nextScale);
      setZoomOffset(prevOffset => ({
        x: centerX - (centerX - prevOffset.x) * factor,
        y: centerY - (centerY - prevOffset.y) * factor
      }));
    } catch (err) {
      console.error("Zoom out failed", err);
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      const newW = Math.max(300, Math.floor(width));
      const newH = Math.max(300, Math.floor(height));
      setDimensions(prev => {
        if (prev.width === newW && prev.height === newH) {
          return prev;
        }
        return { width: newW, height: newH };
      });
    });

    resizeObserver.observe(container);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Recenter automatically whenever dimensions, artboardW or artboardH change
  useEffect(() => {
    recenterCanvas();
  }, [dimensions, artboardW, artboardH]);

  // Ensure selected object belongs to active layer; automatically clear selection when switching layers
  useEffect(() => {
    if (selectedObjectId && objects[selectedObjectId]) {
      const selObj = objects[selectedObjectId];
      const effLayerId = selObj.layerId || (layers && layers[0] ? layers[0].id : 'layer_1');
      if (effLayerId !== activeLayerId) {
        setSelectedObjectId(null);
      }
    }
  }, [activeLayerId, selectedObjectId, objects, layers, setSelectedObjectId]);

  const getTargetOr360ActiveObject = (id: string | null): VectorObject | null => {
    if (!id || !objects[id]) return null;
    const raw = objects[id];
    if (raw.type === '360_container') {
      return resolve360Object(raw, objects);
    }
    return raw;
  };

  const resolve360Object = (obj: VectorObject, objectsList: { [id: string]: VectorObject }): VectorObject => {
    if (obj.type !== '360_container') return obj;
    try {
      const rawViews = obj.views360 || [];
      if (rawViews.length === 0) return obj;

      // Sort views by angle to find upper and lower bounds
      const views = [...rawViews].sort((a, b) => a.angle - b.angle);
      const angle = ((obj.currentAngle360 ?? 0) % 360 + 360) % 360;

      let vLower = views[views.length - 1];
      let vUpper = views[0];

      for (let i = 0; i < views.length; i++) {
        if (views[i].angle <= angle) {
          vLower = views[i];
        }
      }
      for (let i = views.length - 1; i >= 0; i--) {
        if (views[i].angle >= angle) {
          vUpper = views[i];
        }
      }

      let angleDiff = vUpper.angle - vLower.angle;
      if (angleDiff < 0) angleDiff += 360;
      let currentDiff = angle - vLower.angle;
      if (currentDiff < 0) currentDiff += 360;

      const t = angleDiff === 0 ? 0 : currentDiff / angleDiff;

      const targetLower = objectsList[vLower.drawingId];
      const targetUpper = objectsList[vUpper.drawingId];
      const anchorDrawingId = views[0]?.drawingId;
      const anchorDrawing = objectsList[anchorDrawingId];

      if (!targetLower || !anchorDrawing) return obj;

      const targetDrawing = t > 0.5 && targetUpper ? targetUpper : targetLower;

      // Linear vertex interpolation if array lengths match
      let interpolatedPoints = targetLower.points;
      if (targetUpper && targetLower.points && targetUpper.points && targetLower.points.length === targetUpper.points.length) {
        interpolatedPoints = targetLower.points.map((p, idx) => {
          const p2 = targetUpper.points[idx];
          return {
            ...p,
            x: p.x + (p2.x - p.x) * t,
            y: p.y + (p2.y - p.y) * t
          };
        });
      }

      let interpolatedSubPaths = targetLower.subPaths;
      if (targetUpper && targetLower.subPaths && targetUpper.subPaths && targetLower.subPaths.length === targetUpper.subPaths.length) {
        interpolatedSubPaths = targetLower.subPaths.map((subLower, sIdx) => {
          const subUpper = targetUpper.subPaths![sIdx];
          if (subLower.length === subUpper.length) {
            return subLower.map((p, pIdx) => {
              const p2 = subUpper[pIdx];
              return {
                ...p,
                x: p.x + (p2.x - p.x) * t,
                y: p.y + (p2.y - p.y) * t
              };
            });
          }
          return subLower;
        });
      }

      const anchorRot = anchorDrawing?.transform?.rotation ?? 0;
      const anchorSX = anchorDrawing?.transform?.scaleX || 1;
      const anchorSY = anchorDrawing?.transform?.scaleY || 1;

      const alignedTransform = {
        ...targetDrawing.transform,
        x: obj.transform.x,
        y: obj.transform.y,
        rotation: obj.transform.rotation + (targetLower.transform.rotation + (targetUpper ? (targetUpper.transform.rotation - targetLower.transform.rotation) * t : 0) - anchorRot),
        scaleX: obj.transform.scaleX * ((targetLower.transform.scaleX + (targetUpper ? (targetUpper.transform.scaleX - targetLower.transform.scaleX) * t : 0)) / anchorSX),
        scaleY: obj.transform.scaleY * ((targetLower.transform.scaleY + (targetUpper ? (targetUpper.transform.scaleY - targetLower.transform.scaleY) * t : 0)) / anchorSY),
      };

      return {
        ...targetDrawing,
        transform: alignedTransform,
        points: interpolatedPoints || targetDrawing.points,
        subPaths: interpolatedSubPaths || targetDrawing.subPaths,
        id: obj.id,
        activeViewId: targetDrawing.id,
        name: obj.name,
        pivots: anchorDrawing?.pivots && anchorDrawing.pivots.length > 0 ? anchorDrawing.pivots : obj.pivots,
      };
    } catch (err) {
      console.error("Error resolving 360 view angle object:", err);
      return obj;
    }
  };

  // Drawing state
  const [isDrawing, setIsPlayingState] = useState(false);
  const [strokePoints, setStrokePoints] = useState<Point[]>([]);
  const strokePointsRef = useRef<Point[]>([]);
  const [isDrawingLasso, setIsDrawingLasso] = useState(false);
  
  // Transform & drag gesture state
  const [dragMode, setDragMode] = useState<'none' | 'move' | 'rotate' | 'scale' | 'pivot' | 'pin' | 'meshPoint' | 'meshGridPoint' | 'puppetPin' | 'lassoControlPoint' | 'directRigBone' | 'zoom' | 'pan' | 'paintColor' | 'smartWarpPin' | 'splineHandle' | 'latticePoint' | 'drag-lasso-selection-point' | 'extrudeBranchPoint'>('none');
  const [dragStartPoint, setDragStartPoint] = useState<Point>({ x: 0, y: 0 });
  const [initialTransform, setInitialTransform] = useState<any>(null);
  const [activeHandleIndex, setActiveHandleIndex] = useState<number | null>(null);
  const [draggedMeshPointIndex, setDraggedMeshPointIndex] = useState<number | null>(null);
  const [extrudeSubPathIndex, setExtrudeSubPathIndex] = useState<number | null>(null);
  const [canvasExtrudeMode, setCanvasExtrudeMode] = useState<boolean>(false);
  const [draggedDirectRigBoneId, setDraggedDirectRigBoneId] = useState<string | null>(null);
  
  // Spline editing states
  const [draggedSplineIndex, setDraggedSplineIndex] = useState<number | null>(null);
  const [draggedSplinePart, setDraggedSplinePart] = useState<'start' | 'end' | 'cp1' | 'cp2' | 'twist' | null>(null);
  const [draggedTwistIndex, setDraggedTwistIndex] = useState<number | null>(null);
  
  // Selection anti-unselect 3-tap counter
  const [tapCount, setTapCount] = useState<number>(0);
  const [lastTapTime, setLastTapTime] = useState<number>(0);

  // Knife tool path state
  const [knifePath, setKnifePath] = useState<Point[]>([]);

  // Pen path creation state
  const [penPoints, setPenPoints] = useState<Point[]>([]);

  // Bone drawing state
  const [boneStartPoint, setBoneStartPoint] = useState<Point | null>(null);
  const [boneStartObject, setBoneStartObject] = useState<VectorObject | null>(null);
  const [boneStartPivot, setBoneStartPivot] = useState<Pivot | null>(null);
  const [snappedPivot, setSnappedPivot] = useState<{ objId: string; pivot: Pivot; worldX: number; worldY: number } | null>(null);
  const [elasticWarningId, setElasticWarningId] = useState<string | null>(null);
  const [currentCursorPos, setCurrentCursorPos] = useState<Point>({ x: 0, y: 0 });
  const currentCursorPosRef = useRef<Point>({ x: 0, y: 0 });

  // 3D Bone and Vertex dragging states
  const [isDrawing3DBone, setIsDrawing3DBone] = useState(false);
  const [bone3DStartVtxIdx, setBone3DStartVtxIdx] = useState<number | null>(null);

  // Zoom & Pan Canvas states (100x zoom capability)
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [zoomOffset, setZoomOffset] = useState<Point>({ x: 0, y: 0 });

  // Touch screen multi-touch pinch gesture tracking refs
  const activePointersRef = useRef<{ [id: number]: Point }>({});
  const lastPinchDistRef = useRef<number>(0);
  const lastPinchMidRef = useRef<Point>({ x: 0, y: 0 });
  const dragStartScreenRef = useRef<Point>({ x: 0, y: 0 });
  const dragStartOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const lastPinchOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const lastPinchScaleRef = useRef<number>(1);
  const selectedObjInitialTransformRef = useRef<Transform | null>(null);
  const lastLiquifyLocalPosRef = useRef<Point | null>(null);

  // Get coordinates relative to canvas bounding box with zoom/pan applied
  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = frontCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const appScale = (window as any).__appScale || 1;
    const screenX = (e.clientX - rect.left) / appScale;
    const screenY = (e.clientY - rect.top) / appScale;
    return {
      x: (screenX - zoomOffset.x) / zoomScale,
      y: (screenY - zoomOffset.y) / zoomScale,
    };
  };

  // Get all points of an object (including its subPaths)
  const getAllObjectPoints = (rawObj: VectorObject): Point[] => {
    const obj = resolve360Object(rawObj, objects);
    let all = [...obj.points];
    if (obj.subPaths && obj.subPaths.length > 0) {
      obj.subPaths.forEach(sub => {
        all = all.concat(sub);
      });
    }
    return all;
  };

  // Get all pivots from all active objects with their world coordinates
  const getAllPivotsWorld = () => {
    const list: { objId: string; pivot: Pivot; worldX: number; worldY: number }[] = [];
    Object.entries(objects).forEach(([objId, obj]) => {
      if (obj.isHidden) return;
      const p = obj.pivots[0] || { id: 'default', name: 'default', localX: 0, localY: 0, locked: false };
      const world = localToWorld({ x: p.localX, y: p.localY }, obj.transform, obj.pivots[0]);
      list.push({
        objId,
        pivot: p,
        worldX: world.x,
        worldY: world.y
      });
    });
    return list;
  };

  // Perform hit testing on any drawing path (including subPaths of merged drawings)
  const performHitTest = (coords: Point): VectorObject | null => {
    const activeObjects = Object.values(objects).filter(o => {
      if (o.isHidden) return false;
      const effLayerId = o.layerId || (layers && layers[0] ? layers[0].id : 'layer_1');
      const layer = layers ? layers.find(l => l.id === effLayerId) : null;
      if (layer && (layer.visible === false || (layer as any).isHidden)) return false;
      return effLayerId === activeLayerId;
    });
    // Prioritize smaller objects or front objects (by rendering layer / creation time)
    const reversed = [...activeObjects].reverse();
    for (const rawObj of reversed) {
      const obj = resolve360Object(rawObj, objects);

      if (obj.type === '3d' && obj.vertices3D && obj.faces3D && obj.transform3D) {
        // Project all vertices
        const transformed3D = transform3DVertices(obj.vertices3D, obj.transform3D!.x, obj.transform3D!.y, obj.transform3D!.z, obj.transform3D!.rx, obj.transform3D!.ry, obj.transform3D!.rz, obj.transform3D!.sx, obj.transform3D!.sy, obj.transform3D!.sz);
        const projected = transformed3D.map(v => {
          const proj = project3DVertex(v, 400);
          return localToWorld(proj, obj.transform, obj.pivots[0] || { localX: 0, localY: 0 });
        });
        
        // Check all faces
        for (const face of obj.faces3D) {
          const poly = face.indices.map(idx => projected[idx]);
          if (isPointInPolygon(coords, poly)) {
            return rawObj; // Return the container/original object
          }
        }
        continue;
      }

      const pivot = obj.pivots[0] || { localX: 0, localY: 0 };
      
      // Hit test main points
      const worldPoints = obj.points.map(p => localToWorld(p, obj.transform, pivot));
      if (obj.fillColor && obj.fillColor !== 'transparent') {
        // Split by gaps to perform accurate polygon hit testing on each individual stroke segment
        const subPolys: Point[][] = [];
        let currentPoly: Point[] = [];
        for (let i = 0; i < worldPoints.length; i++) {
          const pt = worldPoints[i];
          const origPt = obj.points[i];
          if (origPt?.gap && currentPoly.length > 0) {
            subPolys.push(currentPoly);
            currentPoly = [];
          }
          currentPoly.push(pt);
        }
        if (currentPoly.length > 0) {
          subPolys.push(currentPoly);
        }

        for (const poly of subPolys) {
          if (poly.length >= 3 && isPointInPolygon(coords, poly)) {
            return rawObj; // Return the container/original object
          }
        }
      }
      const dist = pointToPolylineDistance(coords, worldPoints);
      if (dist < 18) {
        return rawObj; // Return the container/original object
      }

      // Hit test sub-paths of merged drawings
      if (obj.subPaths && obj.subPaths.length > 0) {
        for (const sub of obj.subPaths) {
          const worldSubPoints = sub.map(p => localToWorld(p, obj.transform, pivot));
          if (obj.fillColor && obj.fillColor !== 'transparent') {
            if (isPointInPolygon(coords, worldSubPoints)) {
              return rawObj; // Return the container/original object
            }
          }
          const subDist = pointToPolylineDistance(coords, worldSubPoints);
          if (subDist < 18) {
            return rawObj; // Return the container/original object
          }
        }
      }
    }
    return null;
  };

  // Enforce locked bone rigid distance constraints!
  const enforceBoneConstraints = (updatedObjects: { [id: string]: VectorObject }) => {
    // Bypassed completely to prevent delayed relaxation, elastic lag, or detachment.
    return;
  };

  // Recursively propagates transforms down the bone / parent-child hierarchy tree
  const propagateRigTransforms = (
    updatedObjects: { [id: string]: VectorObject },
    changedObjectId: string,
    deltaX: number,
    deltaY: number,
    deltaRot: number,
    scaleXRatio: number = 1,
    scaleYRatio: number = 1,
    movedSet: Set<string> = new Set<string>()
  ) => {
    const parent = updatedObjects[changedObjectId];
    if (!parent) return;

    movedSet.add(changedObjectId);

    // Get child IDs from both:
    // 1. Direct parent-child hierarchy (child.parentId === parent.id)
    // 2. Bone connections (bone.startObjectId === parent.id)
    // 3. Attached group drawings (child.attachedGroupId === parent.attachedGroupId)
    const directChildIds = Object.values(updatedObjects)
      .filter(o => o.parentId === changedObjectId)
      .map(o => o.id);
      
    const boneChildIds = bones
      .filter(b => b.startObjectId === changedObjectId)
      .map(b => b.endObjectId);

    const attachedGroupChildIds = parent.attachedGroupId
      ? Object.values(updatedObjects)
          .filter(o => o.id !== changedObjectId && o.attachedGroupId === parent.attachedGroupId)
          .map(o => o.id)
      : [];

    // Union of all unique child IDs
    const uniqueChildIds = Array.from(new Set([...directChildIds, ...boneChildIds, ...attachedGroupChildIds]));

    const parentNewT = parent.transform;
    const parentOrigT: Transform = {
      ...parentNewT,
      x: parentNewT.x - deltaX,
      y: parentNewT.y - deltaY,
      rotation: (parentNewT.rotation ?? 0) - deltaRot,
      scaleX: scaleXRatio !== 0 ? parentNewT.scaleX / scaleXRatio : parentNewT.scaleX,
      scaleY: scaleYRatio !== 0 ? parentNewT.scaleY / scaleYRatio : parentNewT.scaleY,
    };

    const pPivot = parent.pivots?.[0] || { localX: 0, localY: 0 };
    const oldParentPivotWorld = {
      x: parentOrigT.x + pPivot.localX,
      y: parentOrigT.y + pPivot.localY,
    };
    const newParentPivotWorld = {
      x: parentNewT.x + pPivot.localX,
      y: parentNewT.y + pPivot.localY,
    };

    // 3D Pitch (rotateX) ratio for Y offset
    const origRotXRad = ((parentOrigT.rotateX || 0) * Math.PI) / 180;
    const newRotXRad = ((parentNewT.rotateX || 0) * Math.PI) / 180;
    const cosOrigRotX = Math.cos(origRotXRad);
    const cosNewRotX = Math.cos(newRotXRad);
    const pitchScale = Math.abs(cosOrigRotX) > 1e-4 ? cosNewRotX / cosOrigRotX : 1;

    // 3D Yaw (rotateY) ratio for X offset
    const origRotYRad = ((parentOrigT.rotateY || 0) * Math.PI) / 180;
    const newRotYRad = ((parentNewT.rotateY || 0) * Math.PI) / 180;
    const cosOrigRotY = Math.cos(origRotYRad);
    const cosNewRotY = Math.cos(newRotYRad);
    const yawScale = Math.abs(cosOrigRotY) > 1e-4 ? cosNewRotY / cosOrigRotY : 1;

    const dRotX = (parentNewT.rotateX ?? 0) - (parentOrigT.rotateX ?? 0);
    const dRotY = (parentNewT.rotateY ?? 0) - (parentOrigT.rotateY ?? 0);
    const dSkewX = (parentNewT.skewX ?? 0) - (parentOrigT.skewX ?? 0);
    const dSkewY = (parentNewT.skewY ?? 0) - (parentOrigT.skewY ?? 0);
    const dPersp = (parentNewT.perspective ?? 0) - (parentOrigT.perspective ?? 0);
    const dCamX = (parentNewT.cameraAngleX ?? 0) - (parentOrigT.cameraAngleX ?? 0);
    const dCamY = (parentNewT.cameraAngleY ?? 0) - (parentOrigT.cameraAngleY ?? 0);

    for (const childId of uniqueChildIds) {
      if (movedSet.has(childId)) continue; // Prevent double transform

      const child = updatedObjects[childId];
      if (!child) continue;

      const childOrigT = { ...child.transform };

      // Vector from old parent pivot to child old position
      const vecX = childOrigT.x - oldParentPivotWorld.x;
      const vecY = childOrigT.y - oldParentPivotWorld.y;

      // Scale vector (2D scale + 3D pitch/yaw squash)
      const scaledVecX = vecX * scaleXRatio * yawScale;
      const scaledVecY = vecY * scaleYRatio * pitchScale;

      // Rotate vector around origin by deltaRot
      const rotatedVec = rotatePoint({ x: scaledVecX, y: scaledVecY }, deltaRot, { x: 0, y: 0 });

      // Child new world position relative to new parent pivot
      const childNewX = Number((newParentPivotWorld.x + rotatedVec.x).toFixed(2));
      const childNewY = Number((newParentPivotWorld.y + rotatedVec.y).toFixed(2));

      child.transform = {
        ...childOrigT,
        x: childNewX,
        y: childNewY,
        rotation: Number(((childOrigT.rotation ?? 0) + deltaRot).toFixed(2)),
        scaleX: Number(((childOrigT.scaleX ?? 1) * scaleXRatio * yawScale).toFixed(2)),
        scaleY: Number(((childOrigT.scaleY ?? 1) * scaleYRatio * pitchScale).toFixed(2)),
        rotateX: Number(((childOrigT.rotateX ?? 0) + dRotX).toFixed(2)),
        rotateY: Number(((childOrigT.rotateY ?? 0) + dRotY).toFixed(2)),
        skewX: Number(((childOrigT.skewX ?? 0) + dSkewX).toFixed(2)),
        skewY: Number(((childOrigT.skewY ?? 0) + dSkewY).toFixed(2)),
        perspective: Number(((childOrigT.perspective ?? 0) + dPersp).toFixed(2)),
        cameraAngleX: Number(((childOrigT.cameraAngleX ?? 0) + dCamX).toFixed(2)),
        cameraAngleY: Number(((childOrigT.cameraAngleY ?? 0) + dCamY).toFixed(2)),
      };

      // Recursively propagate to grandchild objects!
      const nextDX = child.transform.x - childOrigT.x;
      const nextDY = child.transform.y - childOrigT.y;
      const nextDRot = (child.transform.rotation ?? 0) - (childOrigT.rotation ?? 0);
      const nextSXRatio = childOrigT.scaleX !== 0 ? (child.transform.scaleX ?? 1) / childOrigT.scaleX : 1;
      const nextSYRatio = childOrigT.scaleY !== 0 ? (child.transform.scaleY ?? 1) / childOrigT.scaleY : 1;

      propagateRigTransforms(updatedObjects, childId, nextDX, nextDY, nextDRot, nextSXRatio, nextSYRatio, movedSet);
    }
  };

  // Generate 10 interactive handles for scaling, rotation, and pivot anchoring
  const getHandles = (obj: VectorObject) => {
    const box = calculateBoundingBox(getAllObjectPoints(obj));
    const pivot = (obj.pivots[0] || { id: 'default', name: 'default', localX: 0, localY: 0, locked: false }) as Pivot;
    
    const localHandles = [
      { type: 'scale', index: 0, x: box.x, y: box.y, cursor: 'nwse-resize' }, // Top-Left
      { type: 'scale', index: 1, x: box.x + box.width / 2, y: box.y, cursor: 'ns-resize' }, // Top-Center
      { type: 'scale', index: 2, x: box.x + box.width, y: box.y, cursor: 'nesw-resize' }, // Top-Right
      { type: 'scale', index: 3, x: box.x + box.width, y: box.y + box.height / 2, cursor: 'ew-resize' }, // Middle-Right
      { type: 'scale', index: 4, x: box.x + box.width, y: box.y + box.height, cursor: 'nwse-resize' }, // Bottom-Right
      { type: 'scale', index: 5, x: box.x + box.width / 2, y: box.y + box.height, cursor: 'ns-resize' }, // Bottom-Center
      { type: 'scale', index: 6, x: box.x, y: box.y + box.height, cursor: 'nesw-resize' }, // Bottom-Left
      { type: 'scale', index: 7, x: box.x, y: box.y + box.height / 2, cursor: 'ew-resize' }, // Middle-Left
      { type: 'rotate', index: 8, x: box.x + box.width / 2, y: box.y - 25, cursor: 'grab' }, // Rotation Handle
      { type: 'pivot', index: 9, x: pivot.localX, y: pivot.localY, cursor: 'move' } // Pivot Handle
    ];

    return localHandles.map(h => {
      const world = localToWorld({ x: h.x, y: h.y }, obj.transform, pivot);
      return {
        ...h,
        worldX: world.x,
        worldY: world.y
      };
    });
  };

  // Erase any drawing points under the mouse/pointer
  const erasePointsAt = (pt: Point) => {
    setObjects(prev => {
      const updated = { ...prev };
      let changed = false;
      
      Object.keys(updated).forEach(id => {
        const obj = updated[id];
        // Strictly protect objects on inactive layers from being erased
        const effLayerId = obj.layerId || (layers && layers[0] ? layers[0].id : 'layer_1');
        if (effLayerId !== activeLayerId) return;

        const filteredPoints = obj.points.filter(p => {
          const worldPt = localToWorld(p, obj.transform, obj.pivots[0]);
          return distance(worldPt, pt) > 20; // 20px eraser radius
        });

        if (filteredPoints.length !== obj.points.length) {
          changed = true;
          if (filteredPoints.length < 2) {
            delete updated[id];
          } else {
            updated[id] = {
              ...obj,
              points: filteredPoints
            };
          }
        }
      });

      if (changed) {
        return updated;
      }
      return prev;
    });
  };

  // Pointer Down event handler
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
    // Record active pointer
    activePointersRef.current[e.pointerId] = { x: e.clientX, y: e.clientY };
    const pointerIds = Object.keys(activePointersRef.current);
    
    if (activeTool === 'ZOM') {
      if (pointerIds.length === 2) {
        const p1 = activePointersRef.current[Number(pointerIds[0])];
        const p2 = activePointersRef.current[Number(pointerIds[1])];
        
        const dist = distance(p1, p2);
        lastPinchDistRef.current = dist;
        lastPinchMidRef.current = {
          x: (p1.x + p2.x) / 2,
          y: (p1.y + p2.y) / 2
        };
        lastPinchOffsetRef.current = { ...zoomOffset };
        lastPinchScaleRef.current = zoomScale;
        
        setDragMode('zoom');
      } else if (pointerIds.length === 1) {
        dragStartScreenRef.current = { x: e.clientX, y: e.clientY };
        dragStartOffsetRef.current = { ...zoomOffset };
        setDragMode('pan');
      }
      return;
    }

    if (pointerIds.length === 2) {
      if (activeTool === 'SEL') {
        const p1 = activePointersRef.current[Number(pointerIds[0])];
        const p2 = activePointersRef.current[Number(pointerIds[1])];
        const dist = distance(p1, p2);
        lastPinchDistRef.current = dist;

        if (selectedObjectId && objects[selectedObjectId]) {
          const obj = objects[selectedObjectId];
          selectedObjInitialTransformRef.current = { ...obj.transform };
          setDragMode('pinchScaleObj');
        } else {
          lastPinchMidRef.current = {
            x: (p1.x + p2.x) / 2,
            y: (p1.y + p2.y) / 2
          };
          lastPinchOffsetRef.current = { ...zoomOffset };
          lastPinchScaleRef.current = zoomScale;
          setDragMode('zoom');
        }
      }
      return;
    }

    const coords = getCanvasCoords(e);
    setCurrentCursorPos(coords);

    // Check if we clicked on a Lasso Mesh Control Point!
    if (selectedObjectId && objects[selectedObjectId]) {
      const obj = objects[selectedObjectId];
      if (obj.lassoControlPoints && obj.lassoControlPoints.length > 0) {
        let clickedLcpIdx = -1;
        let minLcpDist = 14 / zoomScale;
        obj.lassoControlPoints.forEach((cp, idx) => {
          const worldPt = localToWorld({ x: cp.currentX, y: cp.currentY }, obj.transform, obj.pivots[0]);
          const d = distance(coords, worldPt);
          if (d < minLcpDist) {
            minLcpDist = d;
            clickedLcpIdx = idx;
          }
        });
        if (clickedLcpIdx !== -1) {
          setDragMode('lassoControlPoint');
          setDraggedMeshPointIndex(clickedLcpIdx);
          setDragStartPoint(coords);
          return;
        }
      }
    }

    // 1.5 Bone tool pointer down handler
    if (activeTool === 'BON') {
      if (selectedObjectId && objects[selectedObjectId]) {
        const obj = objects[selectedObjectId];
        if (obj.type === '3d' && obj.vertices3D && obj.transform3D) {
          // Check if we clicked on a 3D vertex first to start single 3D mesh skeletal rigging!
          const transformed3D = transform3DVertices(obj.vertices3D, obj.transform3D!.x, obj.transform3D!.y, obj.transform3D!.z, obj.transform3D!.rx, obj.transform3D!.ry, obj.transform3D!.rz, obj.transform3D!.sx, obj.transform3D!.sy, obj.transform3D!.sz);
          const projected = transformed3D.map(v => {
            const proj = project3DVertex(v, 400);
            return localToWorld(proj, obj.transform, obj.pivots[0] || { localX: 0, localY: 0 });
          });

          let clickedVtxIdx = -1;
          let minDist = 20; // pixels
          projected.forEach((pt, idx) => {
            const d = distance(coords, pt);
            if (d < minDist) {
              minDist = d;
              clickedVtxIdx = idx;
            }
          });

          if (clickedVtxIdx !== -1) {
            setIsDrawing3DBone(true);
            setBone3DStartVtxIdx(clickedVtxIdx);
            setCurrentCursorPos(coords);
            return;
          }
        }
      }

      // Fallback: draw standard inter-object bone linking pivots!
      const pList = getAllPivotsWorld();
      const clickedPivot = pList.find(item => distance(coords, { x: item.worldX, y: item.worldY }) < 15);
      if (clickedPivot) {
        setBoneStartPoint({ x: clickedPivot.worldX, y: clickedPivot.worldY });
        setBoneStartObject(objects[clickedPivot.objId]);
        setBoneStartPivot(clickedPivot.pivot);
        setSnappedPivot(null);
      } else {
        const clickedObj = performHitTest(coords);
        if (clickedObj) {
          setSelectedObjectId(clickedObj.id);
        }
      }
      return;
    }

    // 2. Add custom pivot point (PVT tool)
    if (activeTool === 'PVT' && selectedObjectId) {
      const obj = objects[selectedObjectId];
      if (obj) {
        const local = worldToLocal(coords, obj.transform, obj.pivots[0]);
        const newPivot: Pivot = {
          id: `pvt_${Date.now()}`,
          name: `Pivot_${obj.pivots.length + 1}`,
          localX: Number(local.x.toFixed(2)),
          localY: Number(local.y.toFixed(2)),
          locked: false,
        };
        updateObjectProperties(obj.id, { pivots: [newPivot, ...obj.pivots] });
        historyPush();
      }
      return;
    }

    // 3. Add puppet pin (PIN tool)
    if (activeTool === 'PIN' && selectedObjectId) {
      const obj = objects[selectedObjectId];
      if (obj) {
        // First check if we clicked on an existing pin to drag it!
        if (obj.pins && obj.pins.length > 0) {
          let clickedPinIndex = -1;
          let minPinDist = 14;
          obj.pins.forEach((pin, idx) => {
            const curX = pin.currentLocalX !== undefined ? pin.currentLocalX : pin.localX;
            const curY = pin.currentLocalY !== undefined ? pin.currentLocalY : pin.localY;
            const worldPin = localToWorld({ x: curX, y: curY }, obj.transform, obj.pivots[0]);
            const d = distance(coords, worldPin);
            if (d < minPinDist) {
              minPinDist = d;
              clickedPinIndex = idx;
            }
          });
          if (clickedPinIndex !== -1) {
            setDragMode('puppetPin');
            setDraggedMeshPointIndex(clickedPinIndex);
            setDragStartPoint(coords);
            return;
          }
        }

        // Otherwise, add a new puppet pin
        const local = worldToLocal(coords, obj.transform, obj.pivots[0]);
        const newPin: Pivot = {
          id: `pin_${Date.now()}`,
          name: `Pin_${(obj.pins || []).length + 1}`,
          localX: Number(local.x.toFixed(2)),
          localY: Number(local.y.toFixed(2)),
          locked: false,
          isActive: true,
        };
        const currentPins = obj.pins || [];
        updateObjectProperties(obj.id, { pins: [...currentPins, newPin] });
        historyPush();
      }
      return;
    }

    // 4. Knife slicing tool logic
    if (activeTool === 'KNF') {
      if (selectedObjectId) {
        setKnifePath([coords]);
        setDragMode('pivot');
      }
      return;
    }

    // Lasso Selection / Vector Part Isolator / Pose Studio tool pointer down
    if (activeTool === 'LSO' || activeTool === 'VEX' || activeTool === 'PSE') {
      if (lassoMode === 'freehand') {
        setIsDrawingLasso(true);
        setLassoPoints([coords]);
      } else {
        // Pen Selection Mode
        // If double click (e.detail === 2) and we have enough points, close it!
        if (e.detail === 2 && penLassoPoints.length >= 3) {
          setLassoPoints([...penLassoPoints]);
          setPenLassoPoints([]);
          return;
        }

        if (penLassoPoints.length > 0) {
          const firstPt = penLassoPoints[0];
          const dist = distance(coords, firstPt);
          const threshold = 15 / zoomScale;
          if (dist < threshold) {
            // Close loop
            if (penLassoPoints.length >= 3) {
              setLassoPoints([...penLassoPoints]);
              setPenLassoPoints([]);
            }
            return;
          }
        }
        setPenLassoPoints(prev => [...prev, coords]);
      }
      return;
    }

    // Free Edit / Crop Selection tool pointer down
    if (activeTool === 'FSL') {
      // 1. Check if clicked near an existing lasso selection point
      if (fslPoints && fslPoints.length > 0) {
        let clickedPtIdx = -1;
        let minDist = 14 / zoomScale;
        fslPoints.forEach((pt, idx) => {
          const d = distance(coords, pt);
          if (d < minDist) {
            minDist = d;
            clickedPtIdx = idx;
          }
        });

        if (clickedPtIdx !== -1) {
          // Double click removes the point
          if (e.detail === 2) {
            const nextLasso = fslPoints.filter((_, idx) => idx !== clickedPtIdx);
            setFslPoints?.(nextLasso);
            return;
          }
          setDragMode('drag-fsl-selection-point');
          setDraggedMeshPointIndex(clickedPtIdx);
          setDragStartPoint(coords);
          return;
        }

        // 2. Check if clicked on a segment to insert a new point
        if (fslPoints.length >= 3) {
          let segmentIdx = -1;
          const segmentThreshold = 10 / zoomScale;
          for (let i = 0; i < fslPoints.length; i++) {
            const p1 = fslPoints[i];
            const p2 = fslPoints[(i + 1) % fslPoints.length];
            const d = pointToSegmentDistance(coords, p1, p2);
            if (d < segmentThreshold) {
              segmentIdx = i;
              break;
            }
          }

          if (segmentIdx !== -1) {
            // Insert coords at index segmentIdx + 1
            const nextLasso = [...fslPoints];
            nextLasso.splice(segmentIdx + 1, 0, coords);
            setFslPoints?.(nextLasso);
            setDragMode('drag-fsl-selection-point');
            setDraggedMeshPointIndex(segmentIdx + 1);
            setDragStartPoint(coords);
            return;
          }
        }
      }

      // 3. Otherwise, if the loop is empty (or < 3 points), start drawing a new lasso
      if (!fslPoints || fslPoints.length < 3) {
        setIsDrawingLasso(true);
        setFslPoints?.([coords]);
      } else {
        // Allow dragging the entire selection loop to prevent accidental loss
        setDragMode('drag-fsl-entire-area');
        setDragStartPoint(coords);
        (window as any)._initialFslPoints = [...fslPoints];
      }
      return;
    }

    // 5. Vector Pen Tool creation logic
    if (activeTool === 'PEN') {
      if (penPoints.length > 0 && distance(coords, penPoints[0]) < 12) {
        if (penPoints.length >= 3) {
          const newId = `obj_${Date.now()}`;
          const name = `PenPath_${Object.keys(objects).length + 1}`;
          const newObj: VectorObject = {
            id: newId,
            name,
            type: 'shape',
            shapeType: 'rectangle',
            points: [...penPoints, penPoints[0]],
            strokeColor: '#E53935',
            strokeWidth: 3.5,
            fillColor: 'transparent',
            opacity: 1,
            transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
            pivots: [{ id: `pvt_${Date.now()}`, name: 'Pivot_1', localX: penPoints[0].x, localY: penPoints[0].y, locked: false }],
            parentId: null,
            childrenIds: [],
            layerId: activeLayerId,
            isLocked: false,
            isHidden: false,
          };
          setObjects(prev => ({ ...prev, [newId]: newObj }));
          setSelectedObjectId(newId);
          historyPush();
        }
        setPenPoints([]);
      } else {
        setPenPoints(prev => [...prev, coords]);
      }
      return;
    }

    // 6. Shapes Tool logic
    if (activeTool === 'SHP') {
      setIsPlayingState(true);
      setDragStartPoint(coords);
      return;
    }

    // 7. Eraser Tool logic
    if (activeTool === 'ERS') {
      setIsPlayingState(true);
      erasePointsAt(coords);
      return;
    }

    // 8. Fill Bucket Tool logic
    if (activeTool === 'FIL') {
      try {
        // If an active lasso loop exists, check if click is inside or on the lasso area
        const activeLasso = (lassoPoints && lassoPoints.length >= 3)
          ? lassoPoints
          : (fslPoints && fslPoints.length >= 3 ? fslPoints : null);

        if (activeLasso) {
          const isInsideLasso = isPointInPolygon(coords, activeLasso);
          let nearLasso = false;
          if (!isInsideLasso) {
            for (let i = 0; i < activeLasso.length; i++) {
              const p1 = activeLasso[i];
              const p2 = activeLasso[(i + 1) % activeLasso.length];
              if (pointToSegmentDistance(coords, p1, p2) < 20) {
                nearLasso = true;
                break;
              }
            }
          }

          if (isInsideLasso || nearLasso) {
            let modifiedAny = false;
            setObjects(prev => {
              const updated = { ...prev };
              (Object.values(updated) as VectorObject[]).forEach(obj => {
                if (obj.isHidden || obj.isLocked || obj.type === '360_container') return;
                const effLayerId = obj.layerId || (layers && layers[0] ? layers[0].id : 'layer-1');
                if (effLayerId !== activeLayerId) return;

                const localPivot = obj.pivots?.[0] || { localX: 0, localY: 0 };
                const worldPts = (obj.points && obj.points.length > 0)
                  ? obj.points.map(p => localToWorld(p, obj.transform, localPivot))
                  : (obj.subPaths ? obj.subPaths.flat().map(p => localToWorld(p, obj.transform, localPivot)) : []);

                if (worldPts.length === 0) return;

                const boundsObj = calculateBoundingBox(worldPts);
                const boundsLasso = calculateBoundingBox(activeLasso);

                const isBoxOverlap = !(boundsObj.x + boundsObj.width < boundsLasso.x ||
                                       boundsLasso.x + boundsLasso.width < boundsObj.x ||
                                       boundsObj.y + boundsObj.height < boundsLasso.y ||
                                       boundsLasso.y + boundsLasso.height < boundsObj.y);

                if (!isBoxOverlap) return;

                const localLassoPoints = activeLasso.map(wp => worldToLocal(wp, obj.transform, localPivot));

                updated[obj.id] = {
                  ...obj,
                  lassoFills: [
                    ...(obj.lassoFills || []),
                    { localLassoPoints, color: fillToolColor }
                  ]
                };
                modifiedAny = true;
              });
              return updated;
            });

            if (modifiedAny) {
              historyPush();
              return;
            }
          }
        }

        const clickedObj = performHitTest(coords);
        if (clickedObj) {
          setSelectedObjectId(clickedObj.id);
          if (clickedObj.type === '3d' && clickedObj.vertices3D && clickedObj.faces3D && clickedObj.transform3D) {
            const transformed3D = transform3DVertices(clickedObj.vertices3D, clickedObj.transform3D!.x, clickedObj.transform3D!.y, clickedObj.transform3D!.z, clickedObj.transform3D!.rx, clickedObj.transform3D!.ry, clickedObj.transform3D!.rz, clickedObj.transform3D!.sx, clickedObj.transform3D!.sy, clickedObj.transform3D!.sz);
            const projected = transformed3D.map(v => {
              const proj = project3DVertex(v, 400);
              return localToWorld(proj, clickedObj.transform, clickedObj.pivots[0] || { localX: 0, localY: 0 });
            });

            const matchedFaces: { idx: number; avgZ: number }[] = [];
            clickedObj.faces3D.forEach((face, idx) => {
              const poly = face.indices.map(i => projected[i]);
              if (isPointInPolygon(coords, poly)) {
                let sumZ = 0;
                face.indices.forEach(i => {
                  sumZ += transformed3D[i].z;
                });
                const avgZ = sumZ / face.indices.length;
                matchedFaces.push({ idx, avgZ });
              }
            });

            if (matchedFaces.length > 0) {
              matchedFaces.sort((a, b) => a.avgZ - b.avgZ);
              const targetFaceIdx = matchedFaces[0].idx;
              const paintColor = fillToolColor;

              setObjects(prev => {
                const updatedObj = { ...prev[clickedObj.id] };
                const updatedFaces = [...(updatedObj.faces3D || [])];
                updatedFaces[targetFaceIdx] = {
                  ...updatedFaces[targetFaceIdx],
                  baseColor: paintColor,
                  fillColor: paintColor
                };
                updatedObj.faces3D = updatedFaces;
                updatedObj.selectedFaceIndex = targetFaceIdx;
                return {
                  ...prev,
                  [clickedObj.id]: updatedObj
                };
              });
              historyPush();
              return;
            }
          } else {
            const pivot = clickedObj.pivots[0] || { localX: 0, localY: 0 };
            const subPathsToUse = (clickedObj.subPaths && clickedObj.subPaths.length > 0)
              ? clickedObj.subPaths
              : extractAllSubPaths(clickedObj);

            let hitSubIdx = -1;
            if (subPathsToUse && subPathsToUse.length > 0) {
              for (let i = subPathsToUse.length - 1; i >= 0; i--) {
                const sub = subPathsToUse[i];
                if (sub && sub.length >= 3) {
                  const worldSubPts = sub.map(p => localToWorld(p, clickedObj.transform, pivot));
                  if (isPointInPolygon(coords, worldSubPts)) {
                    hitSubIdx = i;
                    break;
                  }
                }
              }
            }

            setObjects(prev => {
              const updated = { ...prev };
              const color = fillToolColor;
              const curObj = updated[clickedObj.id] || clickedObj;

              if (hitSubIdx !== -1) {
                const newSubPathFills = { ...(curObj.subPathFills || {}), [hitSubIdx]: color };
                updated[clickedObj.id] = {
                  ...curObj,
                  subPathFills: newSubPathFills,
                  fillColor: color
                };
              } else {
                updated[clickedObj.id] = {
                  ...curObj,
                  fillColor: color
                };
              }

              // Update all group attached drawings so the entire drawing fills in one tap
              if (curObj.attachedGroupId) {
                Object.keys(updated).forEach(k => {
                  if (updated[k].attachedGroupId === curObj.attachedGroupId) {
                    updated[k] = { ...updated[k], fillColor: color };
                  }
                });
              }

              return updated;
            });
            historyPush();
            return;
          }
        }

        // Smart Gap-Closing Flood Fill for sketchy lines / unclosed stroke regions
        const targetLayerId = activeLayerId || (layers && layers[0] ? layers[0].id : 'layer-1');
        const smartFillObj = performSmartFloodFill(coords, objects, targetLayerId, fillToolColor, 20);
        if (smartFillObj) {
          // Link smartFillObj with the active/hovered drawing object so color and drawing NEVER separate
          const parentDrawing = (effectiveSelectedObjectId && objects[effectiveSelectedObjectId])
            ? objects[effectiveSelectedObjectId]
            : Object.values(objects).find(o => ((o.layerId || (layers && layers[0] ? layers[0].id : 'layer-1')) === targetLayerId) && o.id !== smartFillObj.id && !o.isHidden);

          let updatedParent = parentDrawing ? { ...parentDrawing } : null;
          if (updatedParent) {
            const grpId = updatedParent.attachedGroupId || `group_${Date.now()}_${Math.random().toString(36).substring(2,6)}`;
            updatedParent.attachedGroupId = grpId;
            smartFillObj.attachedGroupId = grpId;
            smartFillObj.parentId = updatedParent.id;
            if (!updatedParent.childrenIds) updatedParent.childrenIds = [];
            if (!updatedParent.childrenIds.includes(smartFillObj.id)) {
              updatedParent.childrenIds = [...updatedParent.childrenIds, smartFillObj.id];
            }
          }

          setObjects(prev => ({
            ...prev,
            ...(updatedParent ? { [updatedParent.id]: updatedParent } : {}),
            [smartFillObj.id]: smartFillObj
          }));
          setSelectedObjectId(smartFillObj.id);
          historyPush();
        }
      } catch (err: any) {
        console.error("Fill tool error:", err);
      }
      return;
    }

    // 9. Eyedropper Tool logic
    if (activeTool === 'EYE') {
      const sampleAndSetColor = async () => {
        let sampledColor = '#ffffff';
        let found = false;

        if ((window as any).EyeDropper) {
          try {
            const eyeDropper = new (window as any).EyeDropper();
            const result = await eyeDropper.open();
            sampledColor = result.sRGBHex;
            found = true;
          } catch (err) {
            console.log("EyeDropper cancelled or failed, falling back to canvas pixel picker:", err);
          }
        }

        if (!found) {
          const canvas = frontCanvasRef.current;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const appScale = (window as any).__appScale || 1;
            const x = Math.round((e.clientX - rect.left) / appScale * (canvas.width / rect.width));
            const y = Math.round((e.clientY - rect.top) / appScale * (canvas.height / rect.height));
            const ctx = canvas.getContext('2d');
            if (ctx) {
              try {
                const pixel = ctx.getImageData(x, y, 1, 1).data;
                const rgbToHex = (r: number, g: number, b: number): string => {
                  const toHex = (val: number) => {
                    const hex = val.toString(16);
                    return hex.length === 1 ? '0' + hex : hex;
                  };
                  return '#' + toHex(r) + toHex(g) + toHex(b);
                };
                sampledColor = rgbToHex(pixel[0], pixel[1], pixel[2]);
                found = true;
              } catch (err) {
                console.error("Canvas getImageData failed:", err);
              }
            }
          }
        }

        if (found) {
          if (setFillToolColor) {
            setFillToolColor(sampledColor);
          }
          if (selectedObjectId && objects[selectedObjectId]) {
            const obj = objects[selectedObjectId];
            // If it's a closed path or has active fill, update fill color. Otherwise update stroke!
            const isClosed = obj.points && obj.points.length >= 3 && 
                             obj.points[0].x === obj.points[obj.points.length - 1].x &&
                             obj.points[0].y === obj.points[obj.points.length - 1].y;
            if (isClosed || (obj.fillColor && obj.fillColor !== 'transparent')) {
              updateObjectProperties(obj.id, { fillColor: sampledColor });
            } else {
              updateObjectProperties(obj.id, { strokeColor: sampledColor });
            }
            historyPush();
          }
        }
      };

      sampleAndSetColor();
      return;
    }

    // 9.5. Geometry Deform Mesh Tool logic
    if (activeTool === 'MSH') {
      if (selectedObjectId && objects[selectedObjectId]) {
        const obj = objects[selectedObjectId];

        // If the object is a 3D model, handle 3D vertex selection
        if (obj.type === '3d' && obj.vertices3D && obj.transform3D) {
          const transformed3D = transform3DVertices(obj.vertices3D, obj.transform3D!.x, obj.transform3D!.y, obj.transform3D!.z, obj.transform3D!.rx, obj.transform3D!.ry, obj.transform3D!.rz, obj.transform3D!.sx, obj.transform3D!.sy, obj.transform3D!.sz);
          const projected = transformed3D.map(v => {
            const proj = project3DVertex(v, 400);
            return localToWorld(proj, obj.transform, obj.pivots[0] || { localX: 0, localY: 0 });
          });

          let clickedVtxIdx = -1;
          let minDist = 20; // pixels
          projected.forEach((pt, idx) => {
            const d = distance(coords, pt);
            if (d < minDist) {
              minDist = d;
              clickedVtxIdx = idx;
            }
          });

          if (clickedVtxIdx !== -1) {
            setDragMode('meshPoint');
            setDraggedMeshPointIndex(clickedVtxIdx);
            setDragStartPoint(coords);
            if (setSelectedDeformPointIndex && setSelectedDeformPointType && setOriginalDeformPointCoords && setDeformPointTransform) {
              setSelectedDeformPointIndex(clickedVtxIdx);
              setSelectedDeformPointType('3d');
              setOriginalDeformPointCoords({
                x: obj.vertices3D[clickedVtxIdx].x,
                y: obj.vertices3D[clickedVtxIdx].y,
                z: obj.vertices3D[clickedVtxIdx].z
              });
              setDeformPointTransform({
                x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, rotateX: 0, rotateY: 0, perspective: 0, cameraAngleX: 0, cameraAngleY: 0
              });
            }
            return;
          }
        }
        
        // 1. If mesh wrap grid is active, prioritize dragging mesh grid control points or lattice points!
        else if (obj.meshState && obj.meshState.active) {
          // Check lattice points first if in lattice mode
          if (obj.meshState.editMode === 'lattice' && obj.meshState.latticePoints && obj.meshState.latticePoints.length > 0) {
            let clickedLptIdx = -1;
            let minLptDist = 14;
            obj.meshState.latticePoints.forEach((lpt: any, idx: number) => {
              const worldPt = localToWorld({ x: lpt.x, y: lpt.y }, obj.transform, obj.pivots[0]);
              const d = distance(coords, worldPt);
              if (d < minLptDist) {
                minLptDist = d;
                clickedLptIdx = idx;
              }
            });
            if (clickedLptIdx !== -1) {
              setDragMode('latticePoint');
              setDraggedMeshPointIndex(clickedLptIdx);
              setDragStartPoint(coords);
              return;
            }
          }

          let clickedMptIndex = -1;
          let minMptDist = 16; // Pixels threshold in world space
          if (obj.meshState && obj.meshState.points) {
            obj.meshState.points.forEach((mpt, idx) => {
              const worldPt = localToWorld({ x: mpt.currentX, y: mpt.currentY }, obj.transform, obj.pivots[0]);
              const d = distance(coords, worldPt);
              if (d < minMptDist) {
                minMptDist = d;
                clickedMptIndex = idx;
              }
            });
          }

          // Check standard drawing outline points
          let clickedVtxIdx = -1;
          let minVtxDist = 16;
          const ptsToUse = (obj.points && obj.points.length > 0) ? obj.points : (obj.subPaths ? obj.subPaths.flat() : []);
          ptsToUse.forEach((pt, idx) => {
            const worldPt = localToWorld(pt, obj.transform, obj.pivots[0]);
            const d = distance(coords, worldPt);
            if (d < minVtxDist) {
              minVtxDist = d;
              clickedVtxIdx = idx;
            }
          });

          const isExtrudeMode = obj.meshState?.pointExtrudeMode || canvasExtrudeMode;

          if (isExtrudeMode && (clickedMptIndex !== -1 || clickedVtxIdx !== -1)) {
            // ⚡ EXTRUDE NEW POINT / BRANCH MODE ACTIVE!
            const pivot = obj.pivots[0] || { localX: 0, localY: 0 };
            const cursorLocal = worldToLocal(coords, obj.transform, pivot);
            
            let anchorLocal: Point;
            if (clickedMptIndex !== -1 && obj.meshState && obj.meshState.points[clickedMptIndex]) {
              const mpt = obj.meshState.points[clickedMptIndex];
              anchorLocal = { x: mpt.currentX, y: mpt.currentY };
            } else if (clickedVtxIdx !== -1 && ptsToUse[clickedVtxIdx]) {
              anchorLocal = { x: ptsToUse[clickedVtxIdx].x, y: ptsToUse[clickedVtxIdx].y };
            } else {
              anchorLocal = { x: cursorLocal.x, y: cursorLocal.y };
            }

            // Create new branch stroke connecting anchorLocal -> cursorLocal
            const newBranch = [
              { x: anchorLocal.x, y: anchorLocal.y },
              { x: cursorLocal.x, y: cursorLocal.y }
            ];

            const existingSubs = obj.subPaths && obj.subPaths.length > 0
              ? [...obj.subPaths]
              : (obj.points && obj.points.length > 0 ? [[...obj.points]] : []);

            const updatedSubPaths = [...existingSubs, newBranch];
            const newSubIdx = updatedSubPaths.length - 1;

            const newMeshPt = {
              id: `mpt_ext_${Date.now()}`,
              originalX: cursorLocal.x,
              originalY: cursorLocal.y,
              currentX: cursorLocal.x,
              currentY: cursorLocal.y,
              pinned: false,
              pinType: null as any
            };

            const existingMeshPoints = obj.meshState?.points || [];
            const updatedMeshPoints = [...existingMeshPoints, newMeshPt];
            const newMeshPtIdx = updatedMeshPoints.length - 1;

            updateObjectProperties(obj.id, {
              subPaths: updatedSubPaths,
              points: updatedSubPaths.flat(),
              meshState: {
                active: true,
                densityX: obj.meshState?.densityX || 5,
                densityY: obj.meshState?.densityY || 5,
                points: updatedMeshPoints,
                originalPoints: [...(obj.meshState?.originalPoints || existingMeshPoints), newMeshPt],
                pointSize: obj.meshState?.pointSize || 30,
                showGrid: obj.meshState?.showGrid ?? true,
                showPoints: true,
                previewMode: true,
                editMode: 'node',
                falloffRadius: obj.meshState?.falloffRadius || 100,
                pointExtrudeMode: true
              }
            });

            setDragMode('extrudeBranchPoint');
            setExtrudeSubPathIndex(newSubIdx);
            setDraggedMeshPointIndex(newMeshPtIdx);
            setDragStartPoint(coords);
            return;
          }

          if (clickedMptIndex !== -1) {
            setDragMode('meshGridPoint');
            setDraggedMeshPointIndex(clickedMptIndex);
            setDragStartPoint(coords);
            if (setSelectedDeformPointIndex && setSelectedDeformPointType && setOriginalDeformPointCoords && setDeformPointTransform) {
              setSelectedDeformPointIndex(clickedMptIndex);
              setSelectedDeformPointType('grid');
              setOriginalDeformPointCoords({
                x: obj.meshState.points[clickedMptIndex].currentX,
                y: obj.meshState.points[clickedMptIndex].currentY
              });
              setDeformPointTransform({
                x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, rotateX: 0, rotateY: 0, perspective: 0, cameraAngleX: 0, cameraAngleY: 0
              });
            }
            return;
          }
        } else {
          // 2. Otherwise, check for standard drawing outline points dragging
          let clickedPointIndex = -1;
          let minPtDist = 14; // Pixels threshold in world space

          const ptsToUse = (obj.points && obj.points.length > 0) ? obj.points : (obj.subPaths ? obj.subPaths.flat() : []);

          ptsToUse.forEach((pt, idx) => {
            const worldPt = localToWorld(pt, obj.transform, obj.pivots[0]);
            const d = distance(coords, worldPt);
            if (d < minPtDist) {
              minPtDist = d;
              clickedPointIndex = idx;
            }
          });

          if (clickedPointIndex !== -1) {
            if (!obj.points || obj.points.length === 0) {
              updateObjectProperties(obj.id, { points: ptsToUse });
            }
            setDragMode('meshPoint');
            setDraggedMeshPointIndex(clickedPointIndex);
            setDragStartPoint(coords);
            if (setSelectedDeformPointIndex && setSelectedDeformPointType && setOriginalDeformPointCoords && setDeformPointTransform) {
              setSelectedDeformPointIndex(clickedPointIndex);
              setSelectedDeformPointType('standard');
              setOriginalDeformPointCoords({
                x: obj.points[clickedPointIndex].x,
                y: obj.points[clickedPointIndex].y
              });
              setDeformPointTransform({
                x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, rotateX: 0, rotateY: 0, perspective: 0, cameraAngleX: 0, cameraAngleY: 0
              });
            }
            return;
          }
        }
      }

      // If we didn't drag any mesh point, select drawing
      const clickedObj = performHitTest(coords);
      if (clickedObj) {
        setSelectedObjectId(clickedObj.id);
      }
      return;
    }

    // 9.6. Spline Reshape Tool pointer down logic
    if (activeTool === 'SPL') {
      if (selectedObjectId && objects[selectedObjectId]) {
        const obj = objects[selectedObjectId];
        const pivot = obj.pivots[0] || { localX: 0, localY: 0 };

        if (!obj.splineActive || !obj.splineControlPoints || obj.splineControlPoints.length === 0) {
          const pts = (obj.points && obj.points.length > 0) ? obj.points : (obj.subPaths ? obj.subPaths.flat() : [{x: 0, y: 0}, {x: 100, y: 100}]);
          const bounds = calculateBoundingBox(pts);
          const startX = bounds.x;
          const stepX = (bounds.width || 100) / 3;
          const midY = bounds.y + (bounds.height || 100) / 2;
          const splineControlPoints = [];
          for (let i = 0; i < 3; i++) {
            const segStart = { x: startX + i * stepX, y: midY };
            const segEnd = { x: startX + (i + 1) * stepX, y: midY };
            splineControlPoints.push({
              start: segStart,
              cp1: { x: segStart.x + stepX * 0.33, y: midY },
              cp2: { x: segEnd.x - stepX * 0.33, y: midY },
              end: segEnd
            });
          }
          const splineTwistPoints = [
            { id: 'twist_0', t: 0.25, rotation: 0, scale: 1.0 },
            { id: 'twist_1', t: 0.5, rotation: 0, scale: 1.0 },
            { id: 'twist_2', t: 0.75, rotation: 0, scale: 1.0 }
          ];
          updateObjectProperties(obj.id, {
            splineActive: true,
            splineControlPoints,
            splineTwistPoints,
            splineUniformStretch: true,
            splineOriginalPoints: JSON.parse(JSON.stringify(pts))
          });
        }
        
        // A. Check if we clicked a Twist Point marker
        if (obj.splineTwistPoints && obj.splineTwistPoints.length > 0 && obj.splineControlPoints) {
          let clickedTwistIdx = -1;
          let minTwistDist = 14;
          obj.splineTwistPoints.forEach((tp: any, idx: number) => {
            const localPos = evaluateSplineCurrent(obj.splineControlPoints!, tp.t);
            const worldPt = localToWorld(localPos, obj.transform, pivot);
            const d = distance(coords, worldPt);
            if (d < minTwistDist) {
              minTwistDist = d;
              clickedTwistIdx = idx;
            }
          });
          if (clickedTwistIdx !== -1) {
            setDragMode('splineHandle');
            setDraggedSplineIndex(clickedTwistIdx);
            setDraggedSplinePart('twist');
            setDragStartPoint(coords);
            return;
          }
        }
        
        // B. Check if we clicked any control points or handles
        if (obj.splineControlPoints && obj.splineControlPoints.length > 0) {
          let clickedSegIdx = -1;
          let clickedPart: 'start' | 'end' | 'cp1' | 'cp2' | null = null;
          let minDist = 14;
          
          obj.splineControlPoints.forEach((seg: any, idx: number) => {
            const worldStart = localToWorld(seg.start, obj.transform, pivot);
            const worldEnd = localToWorld(seg.end, obj.transform, pivot);
            const worldCp1 = localToWorld(seg.cp1, obj.transform, pivot);
            const worldCp2 = localToWorld(seg.cp2, obj.transform, pivot);
            
            const dStart = distance(coords, worldStart);
            const dEnd = distance(coords, worldEnd);
            const dCp1 = distance(coords, worldCp1);
            const dCp2 = distance(coords, worldCp2);
            
            if (dStart < minDist) { minDist = dStart; clickedSegIdx = idx; clickedPart = 'start'; }
            if (dEnd < minDist) { minDist = dEnd; clickedSegIdx = idx; clickedPart = 'end'; }
            if (dCp1 < minDist) { minDist = dCp1; clickedSegIdx = idx; clickedPart = 'cp1'; }
            if (dCp2 < minDist) { minDist = dCp2; clickedSegIdx = idx; clickedPart = 'cp2'; }
          });
          
          if (clickedSegIdx !== -1 && clickedPart) {
            setDragMode('splineHandle');
            setDraggedSplineIndex(clickedSegIdx);
            setDraggedSplinePart(clickedPart);
            setDragStartPoint(coords);
            return;
          }
        }
      }
      
      const clickedObj = performHitTest(coords);
      if (clickedObj) {
        setSelectedObjectId(clickedObj.id);
      }
      return;
    }

    // MCL (Mesh Coloring) tool pointer down logic
    if (activeTool === 'MCL') {
      if (selectedObjectId && objects[selectedObjectId]) {
        const obj = objects[selectedObjectId];
        if (obj.smartMeshColor) {
          setIsPlayingState(true); // set flag to indicate active painting
          setDragMode('paintColor');
          // Paint immediately at first click
          paintColorAt(coords, obj);
          return;
        }
      }
      // If we didn't paint, check if clicking another object
      const clickedObj = performHitTest(coords);
      if (clickedObj) {
        setSelectedObjectId(clickedObj.id);
      }
      return;
    }

    // 🌟 Wireframe Mode Direct Vertex Point Click Handler
    if (selectedObjectId && objects[selectedObjectId] && objects[selectedObjectId].wireframeMode) {
      const obj = objects[selectedObjectId];
      const pivot = obj.pivots[0] || { localX: 0, localY: 0 };
      let clickedVtxIdx = -1;
      let minVtxDist = 16;

      obj.points.forEach((p, idx) => {
        const worldPt = localToWorld(p, obj.transform, pivot);
        const d = distance(coords, worldPt);
        if (d < minVtxDist) {
          minVtxDist = d;
          clickedVtxIdx = idx;
        }
      });

      if (clickedVtxIdx !== -1) {
        const currentSet = new Set(obj.selectedPointIndices || []);
        if (currentSet.has(clickedVtxIdx)) {
          currentSet.delete(clickedVtxIdx);
        } else {
          currentSet.add(clickedVtxIdx);
        }
        setObjects(prev => ({
          ...prev,
          [selectedObjectId]: {
            ...prev[selectedObjectId],
            selectedPointIndices: Array.from(currentSet)
          }
        }));
        return;
      }
    }

    // SWP (Smart Warp Pin) tool pointer down logic
    if (activeTool === 'SWP') {
      if (selectedObjectId && objects[selectedObjectId]) {
        const obj = objects[selectedObjectId];
        if (obj.smartWarp) {
          // 1. Check if we clicked on an existing smart warp pin to drag it!
          let clickedPinIdx = -1;
          let minPinDist = obj.smartWarp.pinSize || 30;
          obj.smartWarp.pins.forEach((pin, idx) => {
            const worldPin = localToWorld({ x: pin.currentX, y: pin.currentY }, obj.transform, obj.pivots[0]);
            const d = distance(coords, worldPin);
            if (d < minPinDist) {
              minPinDist = d;
              clickedPinIdx = idx;
            }
          });

          if (clickedPinIdx !== -1) {
            setDragMode('smartWarpPin');
            setDraggedMeshPointIndex(clickedPinIdx);
            setDragStartPoint(coords);
            return;
          }

          // 2. Otherwise, check if we clicked on the drawing to add a new pin!
          const localPos = worldToLocal(coords, obj.transform, obj.pivots[0]);
          const newPin: SmartWarpPin = {
            id: `swp_pin_${Date.now()}`,
            originalX: Number(localPos.x.toFixed(2)),
            originalY: Number(localPos.y.toFixed(2)),
            currentX: Number(localPos.x.toFixed(2)),
            currentY: Number(localPos.y.toFixed(2)),
            locked: false,
            size: obj.smartWarp.pinSize || 16,
            color: '#0EA5E9',
            influenceRadius: obj.smartWarp.influenceRadius || 120,
            influenceFalloff: obj.smartWarp.influenceFalloff || 'smooth'
          };

          const updatedPins = [...(obj.smartWarp.pins || []), newPin];
          setObjects(prev => {
            const curObj = prev[selectedObjectId];
            if (!curObj) return prev;
            return {
              ...prev,
              [selectedObjectId]: {
                ...curObj,
                smartWarp: {
                  ...curObj.smartWarp!,
                  pins: updatedPins
                }
              }
            };
          });
          historyPush();
          return;
        }
      }
      // If we clicked outside, select another drawing
      const clickedObj = performHitTest(coords);
      if (clickedObj) {
        setSelectedObjectId(clickedObj.id);
      }
      return;
    }

    // CAG (Cage Deform) tool pointer down logic
    if (activeTool === 'CAG') {
      let activeId = selectedObjectId;
      if (!activeId) {
        const clickedObj = performHitTest(coords);
        if (clickedObj) {
          setSelectedObjectId(clickedObj.id);
          activeId = clickedObj.id;
        }
      }

      if (activeId && objects[activeId]) {
        let obj = objects[activeId];
        
        // Auto-initialize cage state if not present or inactive
        if (!obj.cageState || !obj.cageState.active) {
          const cs = initializeCageState(obj);
          setObjects(prev => ({
            ...prev,
            [activeId!]: {
              ...prev[activeId!],
              cageState: cs
            }
          }));
          obj = { ...obj, cageState: cs };
        }

        if (obj.cageState && obj.cageState.points) {
          // Check if we clicked on an existing cage point to drag it
          let clickedPtIdx = -1;
          let minPtDist = 30; // Drag handle click radius
          obj.cageState.points.forEach((pt, idx) => {
            const worldPt = localToWorld({ x: pt.currentX, y: pt.currentY }, obj.transform, obj.pivots[0]);
            const d = distance(coords, worldPt);
            if (d < minPtDist) {
              minPtDist = d;
              clickedPtIdx = idx;
            }
          });

          if (clickedPtIdx !== -1) {
            setDragMode('cagePoint' as any);
            setDraggedMeshPointIndex(clickedPtIdx);
            setDragStartPoint(coords);
            historyPush();
            return;
          }
        }
      }
      return;
    }

    // CPT & CRV (Curve Path & Curve Line Deformer) pointer down logic
    if (activeTool === 'CPT' || activeTool === 'CRV') {
      let activeId = selectedObjectId;
      if (!activeId) {
        const clickedObj = performHitTest(coords);
        if (clickedObj) {
          setSelectedObjectId(clickedObj.id);
          activeId = clickedObj.id;
        }
      }

      if (activeId && objects[activeId]) {
        let obj = objects[activeId];
        
        // Auto-initialize Curve Path state (horizontal & vertical curve lines) if not present or inactive
        if (!obj.curvePathState || !obj.curvePathState.active) {
          const initCps = initializeCurvePathState(obj);
          setObjects(prev => ({
            ...prev,
            [activeId!]: {
              ...prev[activeId!],
              curvePathState: initCps
            }
          }));
          obj = { ...obj, curvePathState: initCps };
        }

        // Auto-initialize Flex Curve state if not present or inactive
        if (!obj.flexCurveState || !obj.flexCurveState.active) {
          const initFcs = initializeFlexCurveState(obj);
          setObjects(prev => ({
            ...prev,
            [activeId!]: {
              ...prev[activeId!],
              flexCurveState: initFcs
            }
          }));
          obj = { ...obj, flexCurveState: initFcs };
        }

        const localPivot = obj.pivots[0] || { localX: 0, localY: 0 };

        // 1. Check Horizontal curve control points (Left-to-Right)
        if (obj.curvePathState) {
          const cps = obj.curvePathState;
          const hCPs = cps.hControlPoints || [];
          const vCPs = cps.vControlPoints || [];
          let clickedIdx = -1;
          let isH = false;
          let minDist = 30 / zoomScale;

          hCPs.forEach((pt, idx) => {
            const worldPt = localToWorld(pt, obj.transform, localPivot);
            const d = distance(coords, worldPt);
            if (d < minDist) {
              minDist = d;
              clickedIdx = idx;
              isH = true;
            }
          });

          // 2. Check Vertical curve control points (Top-to-Bottom)
          if (clickedIdx === -1) {
            vCPs.forEach((pt, idx) => {
              const worldPt = localToWorld(pt, obj.transform, localPivot);
              const d = distance(coords, worldPt);
              if (d < minDist) {
                minDist = d;
                clickedIdx = idx;
                isH = false;
              }
            });
          }

          if (clickedIdx !== -1) {
            setDragMode(isH ? 'curvePathH' : 'curvePathV' as any);
            setDraggedMeshPointIndex(clickedIdx);
            setDragStartPoint(coords);
            historyPush();
            return;
          }
        }

        // 3. Check Flex Curve control points & body
        if (obj.flexCurveState && obj.flexCurveState.points) {
          const fcs = obj.flexCurveState;
          const pts = fcs.points || [];
          let clickedIdx = -1;
          let minDist = 30 / zoomScale;

          pts.forEach((pt, idx) => {
            const worldPt = localToWorld({ x: pt.x, y: pt.y }, obj.transform, localPivot);
            const d = distance(coords, worldPt);
            if (d < minDist) {
              minDist = d;
              clickedIdx = idx;
            }
          });

          if (clickedIdx !== -1) {
            setDragMode('flexCurveHandle' as any);
            setDraggedMeshPointIndex(clickedIdx);
            setDragStartPoint(coords);
            historyPush();
            return;
          }

          const localPos = worldToLocal(coords, obj.transform, localPivot);
          let closeToLine = false;
          for (let i = 0; i < pts.length - 1; i++) {
            const distSeg = distanceToSegment(localPos, { x: pts[i].x, y: pts[i].y }, { x: pts[i+1].x, y: pts[i+1].y });
            if (distSeg < (35 / zoomScale)) {
              closeToLine = true;
              break;
            }
          }

          if (closeToLine) {
            setDragMode('flexCurveBody' as any);
            setDragStartPoint(coords);
            (window as any)._initialFlexCurvePts = JSON.parse(JSON.stringify(pts));
            historyPush();
            return;
          }
        }
      }
      return;
    }

    // PBM, VDF, VPR & RPD (Points Based Movement / Vector Deformation) pointer down logic
    if (activeTool === 'PBM' || activeTool === 'VDF' || activeTool === 'VPR' || activeTool === 'RPD') {
      let activeId = selectedObjectId;
      if (!activeId) {
        const clickedObj = performHitTest(coords);
        if (clickedObj) {
          setSelectedObjectId(clickedObj.id);
          activeId = clickedObj.id;
        }
      }

      if (activeId && objects[activeId]) {
        const obj = objects[activeId];
        const isRpd = activeTool === 'PBM' || activeTool === 'RPD';
        const vdfState: CustomVectorDeformState = obj.customVectorDeformState || {
          active: true,
          isDrawingPhase: true,
          nodes: [],
          stiffness: 50,
          captureRadius: 50,
          rigidLinear: isRpd
        };

        const origPts = vdfState.origObjectPoints || JSON.parse(JSON.stringify(obj.points || []));
        const origSubs = obj.originalSubPathsBackup || (obj.subPaths ? JSON.parse(JSON.stringify(obj.subPaths)) : undefined);

        // Check if user clicked an existing vector node
        let clickedNodeIdx = -1;
        let minDist = 24 / zoomScale;
        (vdfState.nodes || []).forEach((n, idx) => {
          const d = distance(coords, { x: n.x, y: n.y });
          if (d < minDist) {
            minDist = d;
            clickedNodeIdx = idx;
          }
        });

        const isExtrudeOn = !!vdfState.extrudePointMode;

        if (isExtrudeOn) {
          // STRICT EXTRUDE MODE: Extrude new point branching directly from the CURRENTLY SELECTED POINT
          const currentNodes = vdfState.nodes || [];
          const selIdx = (vdfState.selectedNodeIndex !== undefined && vdfState.selectedNodeIndex >= 0 && vdfState.selectedNodeIndex < currentNodes.length)
            ? vdfState.selectedNodeIndex
            : (currentNodes.length - 1);
          
          const parentNode = (selIdx >= 0 && selIdx < currentNodes.length) ? currentNodes[selIdx] : undefined;

          const newNode: CustomVectorDeformNode = {
            id: `vdf_node_${Date.now()}_${currentNodes.length}`,
            x: coords.x,
            y: coords.y,
            origX: coords.x,
            origY: coords.y,
            parentNodeId: parentNode ? parentNode.id : undefined
          };
          const updatedNodes = [...currentNodes, newNode];

          setObjects(prev => ({
            ...prev,
            [activeId!]: {
              ...prev[activeId!],
              originalSubPathsBackup: origSubs,
              customVectorDeformState: {
                ...vdfState,
                active: true,
                nodes: updatedNodes,
                selectedNodeIndex: updatedNodes.length - 1,
                origObjectPoints: origPts,
                rigidLinear: isRpd ? true : vdfState.rigidLinear
              }
            }
          }));

          setDragMode('vdf-node' as any);
          setDraggedMeshPointIndex(updatedNodes.length - 1);
          setDragStartPoint(coords);
          historyPush();
          return;
        } else {
          // EXTRUDE MODE IS OFF: Strictly do NOT extrude or create ANY new points!
          if (clickedNodeIdx !== -1) {
            // Select & drag existing clicked node
            setDragMode('vdf-node' as any);
            setDraggedMeshPointIndex(clickedNodeIdx);
            setDragStartPoint(coords);
            
            setObjects(prev => ({
              ...prev,
              [activeId!]: {
                ...prev[activeId!],
                customVectorDeformState: {
                  ...vdfState,
                  selectedNodeIndex: clickedNodeIdx
                }
              }
            }));

            historyPush();
            return;
          }

          // EXTRUDE MODE IS OFF AND NO EXISTING POINT CLICKED -> STRICTLY DO NOTHING! NO POINTS CREATED!
          return;
        }
      }
      return;
    }

    // LQB (Liquify Brush) tool pointer down logic
    if (activeTool === 'LQB') {
      let activeId = selectedObjectId;
      if (!activeId) {
        const clickedObj = performHitTest(coords);
        if (clickedObj) {
          setSelectedObjectId(clickedObj.id);
          activeId = clickedObj.id;
        }
      }

      if (activeId && objects[activeId]) {
        let obj = objects[activeId];
        
        // Auto-initialize mesh state if not present or inactive for non-destructive keyframeable liquify warping
        if (!obj.meshState || !obj.meshState.active) {
          const ms = initializeMeshState(obj);
          setObjects(prev => ({
            ...prev,
            [activeId!]: {
              ...prev[activeId!],
              meshState: ms
            }
          }));
          obj = { ...obj, meshState: ms };
        }

        const localPos = worldToLocal(coords, obj.transform, obj.pivots[0]);
        lastLiquifyLocalPosRef.current = localPos;
        setDragMode('liquify' as any);
        setDragStartPoint(coords);
        historyPush();
      }
      return;
    }

    // 10. Select & Transform Logic
    if (activeTool === 'SEL') {
      if (selectedObjectId) {
        const obj = objects[selectedObjectId];
        if (obj) {
          // Direct Rig bone joint clicking removed.

          // Check if we clicked on a puppet pin first!
          if (obj.pins && obj.pins.length > 0) {
            let clickedPinIdx = -1;
            let minPinDist = 14;
            obj.pins.forEach((pin, idx) => {
              const curX = pin.currentLocalX !== undefined ? pin.currentLocalX : pin.localX;
              const curY = pin.currentLocalY !== undefined ? pin.currentLocalY : pin.localY;
              const worldPin = localToWorld({ x: curX, y: curY }, obj.transform, obj.pivots[0]);
              const d = distance(coords, worldPin);
              if (d < minPinDist) {
                minPinDist = d;
                clickedPinIdx = idx;
              }
            });
            if (clickedPinIdx !== -1) {
              setDragMode('puppetPin');
              setDraggedMeshPointIndex(clickedPinIdx);
              setDragStartPoint(coords);
              return;
            }
          }

          // Handle click on bounding box handles or move object as a whole
          const handles = getHandles(obj);
          const clickedHandle = handles.find(h => distance(coords, { x: h.worldX, y: h.worldY }) < 12);
          
          if (clickedHandle) {
            if (clickedHandle.type === 'scale') {
              setDragMode('scale');
              setActiveHandleIndex(clickedHandle.index);
            } else if (clickedHandle.type === 'rotate') {
              setDragMode('rotate');
              setActiveHandleIndex(8);
            } else if (clickedHandle.type === 'pivot') {
              setDragMode('pivot');
              setActiveHandleIndex(9);
            }
            setDragStartPoint(coords);
            setInitialTransform({ ...obj.transform });
            return;
          }
        }
      }

      const clickedObj = performHitTest(coords);
      if (clickedObj) {
        setSelectedObjectId(clickedObj.id);
        setDragMode('move');
        setDragStartPoint(coords);
        setInitialTransform({ ...clickedObj.transform });
      } else {
        // Prevent canvas shifting, but preserve active selection per guidelines
        setDragMode('none');
      }
      return;
    }

    // 10.5 3D Proxy Model Tool Logic
    if (activeTool === '3D') {
      const clickedObj = performHitTest(coords);
      if (clickedObj && clickedObj.type === '3d') {
        setSelectedObjectId(clickedObj.id);
        setDragMode('rotate3D' as any);
        setDragStartPoint(coords);
        setInitialTransform({
          rx: clickedObj.transform3D?.rx ?? 0,
          ry: clickedObj.transform3D?.ry ?? 0,
          rz: clickedObj.transform3D?.rz ?? 0,
          x: clickedObj.transform.x,
          y: clickedObj.transform.y,
        });
      } else {
        setDragMode('none');
      }
      return;
    }

    // 11. Vector brush drawing logic
    if (activeTool === 'BRS') {
      setIsPlayingState(true);
      const startPt = createRealismPoint(coords, null, realismSettings);
      strokePointsRef.current = [startPt];
      setStrokePoints([startPt]);
      return;
    }
    } catch (err: any) {
      console.error("Pointer down handler failed:", err);
    }
  };

  // Pointer Move event handler
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
    // Update active pointer tracking coordinate
    if (activePointersRef.current[e.pointerId]) {
      activePointersRef.current[e.pointerId] = { x: e.clientX, y: e.clientY };
    }

    const coords = getCanvasCoords(e);
    currentCursorPosRef.current = coords;
    if (isDrawing || activeTool === 'KNF' || activeTool === 'LQB' || (activeTool === 'LSO' && lassoMode === 'pen') || isDrawing3DBone || boneStartPoint !== null || activeTool === 'PEN' || activeTool === 'BON') {
      setCurrentCursorPos(coords);
    }

    if (activeTool === 'SEL') {
      const pointerIds = Object.keys(activePointersRef.current);
      if (dragMode === 'pinchScaleObj' && pointerIds.length === 2 && selectedObjectId) {
        const p1 = activePointersRef.current[Number(pointerIds[0])];
        const p2 = activePointersRef.current[Number(pointerIds[1])];
        const dist = distance(p1, p2);
        if (lastPinchDistRef.current > 0 && selectedObjInitialTransformRef.current) {
          const ratio = dist / lastPinchDistRef.current;
          let scaleX = Number((selectedObjInitialTransformRef.current.scaleX * ratio).toFixed(4));
          let scaleY = Number((selectedObjInitialTransformRef.current.scaleY * ratio).toFixed(4));
          
          scaleX = Math.min(20.0, Math.max(0.05, scaleX));
          scaleY = Math.min(20.0, Math.max(0.05, scaleY));
          
          const obj = objects[selectedObjectId];
          if (obj) {
            if (obj.parentId && objects[obj.parentId]) {
              const parent = objects[obj.parentId];
              const isParentClosed = parent.type === 'shape' && parent.shapeType !== 'line';
              if (isParentClosed) {
                const testTransform = { ...obj.transform, scaleX, scaleY };
                if (!isChildInsideParent(obj, parent, testTransform, objects)) {
                  scaleX = obj.transform.scaleX;
                  scaleY = obj.transform.scaleY;
                }
              }
            }
            
            setObjects(prev => {
              if (!prev[selectedObjectId]) return prev;
              const updated = { ...prev };
              updated[selectedObjectId] = {
                ...updated[selectedObjectId],
                transform: {
                  ...updated[selectedObjectId].transform,
                  scaleX,
                  scaleY
                }
              };
              return updated;
            });
          }
        }
        return;
      }
      
      if (dragMode === 'zoom' && pointerIds.length === 2) {
        const p1 = activePointersRef.current[Number(pointerIds[0])];
        const p2 = activePointersRef.current[Number(pointerIds[1])];
        const dist = distance(p1, p2);
        if (lastPinchDistRef.current > 0) {
          const scaleChange = dist / lastPinchDistRef.current;
          let nextScale = lastPinchScaleRef.current * scaleChange;
          
          nextScale = Math.min(10.0, Math.max(0.15, nextScale));
          
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          
          const canvas = frontCanvasRef.current;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const appScale = (window as any).__appScale || 1;
            const midCanvasX = (midX - rect.left) / appScale;
            const midCanvasY = (midY - rect.top) / appScale;
            
            const worldX = (midCanvasX - lastPinchOffsetRef.current.x) / lastPinchScaleRef.current;
            const worldY = (midCanvasY - lastPinchOffsetRef.current.y) / lastPinchScaleRef.current;
            
            const nextOffsetX = midCanvasX - worldX * nextScale;
            const nextOffsetY = midCanvasY - worldY * nextScale;
            
            setZoomScale(nextScale);
            setZoomOffset({ x: nextOffsetX, y: nextOffsetY });
          }
        }
        return;
      }
    }

    if (activeTool === 'ZOM') {
      const pointerIds = Object.keys(activePointersRef.current);
      if (dragMode === 'zoom' && pointerIds.length === 2) {
        const p1 = activePointersRef.current[Number(pointerIds[0])];
        const p2 = activePointersRef.current[Number(pointerIds[1])];
        
        const dist = distance(p1, p2);
        if (lastPinchDistRef.current > 0) {
          const scaleChange = dist / lastPinchDistRef.current;
          let nextScale = lastPinchScaleRef.current * scaleChange;
          
          // Clamp scale to standard limits
          nextScale = Math.min(10.0, Math.max(0.15, nextScale));
          
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          
          const canvas = frontCanvasRef.current;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const appScale = (window as any).__appScale || 1;
            const midCanvasX = (midX - rect.left) / appScale;
            const midCanvasY = (midY - rect.top) / appScale;
            
            const worldX = (midCanvasX - lastPinchOffsetRef.current.x) / lastPinchScaleRef.current;
            const worldY = (midCanvasY - lastPinchOffsetRef.current.y) / lastPinchScaleRef.current;
            
            const nextOffsetX = midCanvasX - worldX * nextScale;
            const nextOffsetY = midCanvasY - worldY * nextScale;
            
            setZoomScale(nextScale);
            setZoomOffset({ x: nextOffsetX, y: nextOffsetY });
          }
        }
      } else if (dragMode === 'pan' && pointerIds.length === 1) {
        const appScale = (window as any).__appScale || 1;
        const dx = (e.clientX - dragStartScreenRef.current.x) / appScale;
        const dy = (e.clientY - dragStartScreenRef.current.y) / appScale;
        
        setZoomOffset({
          x: dragStartOffsetRef.current.x + dx,
          y: dragStartOffsetRef.current.y + dy
        });
      }
      return;
    }

    // directRigBone dragging handler removed.

    if (dragMode === 'meshGridPoint' && selectedObjectId && draggedMeshPointIndex !== null) {
      const obj = objects[selectedObjectId];
      if (obj && obj.meshState && obj.meshState.active) {
        const localPos = worldToLocal(coords, obj.transform, obj.pivots[0]);
        setObjects(prev => {
          if (!prev[selectedObjectId]) return prev;
          const originalPoints = prev[selectedObjectId].meshState!.points;
          const updatedMeshStatePoints = originalPoints.map(p => ({ ...p }));
          
          const targetPoint = updatedMeshStatePoints[draggedMeshPointIndex];
          if (targetPoint) {
            const dx = localPos.x - targetPoint.currentX;
            const dy = localPos.y - targetPoint.currentY;
            
            // Direct drag on target
            targetPoint.currentX = Number(localPos.x.toFixed(2));
            targetPoint.currentY = Number(localPos.y.toFixed(2));
            
            // Soft-selection Node mode with falloff
            const editMode = prev[selectedObjectId].meshState!.editMode || 'node';
            const falloffRadius = prev[selectedObjectId].meshState!.falloffRadius || 0;
            if (editMode === 'node' && falloffRadius > 0) {
              const origX = targetPoint.originalX;
              const origY = targetPoint.originalY;
              
              updatedMeshStatePoints.forEach((mpt, idx) => {
                if (idx === draggedMeshPointIndex) return;
                
                const d = Math.sqrt((mpt.originalX - origX) ** 2 + (mpt.originalY - origY) ** 2);
                if (d < falloffRadius) {
                  const weight = Math.pow(1 - d / falloffRadius, 2); // quadratic falloff
                  mpt.currentX = Number((mpt.currentX + dx * weight).toFixed(2));
                  mpt.currentY = Number((mpt.currentY + dy * weight).toFixed(2));
                }
              });
            }
            
            // Symmetry Active Mirroring
            const symmetryActive = prev[selectedObjectId].meshState!.symmetryActive;
            const symmetryAxis = prev[selectedObjectId].meshState!.symmetryAxis || 'horizontal';
            if (symmetryActive) {
              // Estimate center of mesh points
              let sumOrigX = 0, sumOrigY = 0;
              originalPoints.forEach(p => { sumOrigX += p.originalX; sumOrigY += p.originalY; });
              const centerX = sumOrigX / originalPoints.length;
              const centerY = sumOrigY / originalPoints.length;
              
              const origTargetX = targetPoint.originalX;
              const origTargetY = targetPoint.originalY;
              
              // Symmetrical coordinates
              const symOrigX = symmetryAxis === 'horizontal' ? (2 * centerX - origTargetX) : origTargetX;
              const symOrigY = symmetryAxis === 'vertical' ? (2 * centerY - origTargetY) : origTargetY;
              
              // Find the point closest to the symmetrical coordinates
              let closestIdx = -1;
              let minD = Infinity;
              updatedMeshStatePoints.forEach((mpt, idx) => {
                if (idx === draggedMeshPointIndex) return;
                const d = Math.sqrt((mpt.originalX - symOrigX) ** 2 + (mpt.originalY - symOrigY) ** 2);
                if (d < minD) {
                  minD = d;
                  closestIdx = idx;
                }
              });
              
              if (closestIdx !== -1) {
                const symPt = updatedMeshStatePoints[closestIdx];
                const symDx = symmetryAxis === 'horizontal' ? -dx : dx;
                const symDy = symmetryAxis === 'vertical' ? -dy : dy;
                
                symPt.currentX = Number((symPt.currentX + symDx).toFixed(2));
                symPt.currentY = Number((symPt.currentY + symDy).toFixed(2));
              }
            }
          }
          
          return {
            ...prev,
            [selectedObjectId]: {
              ...prev[selectedObjectId],
              meshState: {
                ...prev[selectedObjectId].meshState!,
                points: updatedMeshStatePoints
              }
            }
          };
        });
      }
      return;
    }

    if (dragMode === 'latticePoint' && selectedObjectId && draggedMeshPointIndex !== null) {
      const obj = objects[selectedObjectId];
      if (obj && obj.meshState && obj.meshState.latticePoints) {
        const localPos = worldToLocal(coords, obj.transform, obj.pivots[0]);
        setObjects(prev => {
          if (!prev[selectedObjectId] || !prev[selectedObjectId].meshState?.latticePoints) return prev;
          
          const updatedLatticePoints = prev[selectedObjectId].meshState!.latticePoints!.map(p => ({ ...p }));
          const targetLpt = updatedLatticePoints[draggedMeshPointIndex];
          if (!targetLpt) return prev;
          
          const dx = localPos.x - targetLpt.x;
          const dy = localPos.y - targetLpt.y;
          
          // Update the dragged lattice point
          targetLpt.x = Number(localPos.x.toFixed(2));
          targetLpt.y = Number(localPos.y.toFixed(2));
          
          // Deform underlying mesh points using Inverse Distance Weighting (IDW) from all lattice points
          const updatedMeshPoints = prev[selectedObjectId].meshState!.points.map(mpt => {
            let totalWeight = 0;
            let meshDx = 0;
            let meshDy = 0;
            
            // Check if mesh point is exactly at any lattice point
            for (let k = 0; k < updatedLatticePoints.length; k++) {
              const lpt = updatedLatticePoints[k];
              const dist = Math.sqrt((mpt.originalX - lpt.originalX) ** 2 + (mpt.originalY - lpt.originalY) ** 2);
              if (dist < 1.0) {
                const curLptDx = lpt.x - lpt.originalX;
                const curLptDy = lpt.y - lpt.originalY;
                return {
                  ...mpt,
                  currentX: Number((mpt.originalX + curLptDx).toFixed(2)),
                  currentY: Number((mpt.originalY + curLptDy).toFixed(2))
                };
              }
            }
            
            for (let k = 0; k < updatedLatticePoints.length; k++) {
              const lpt = updatedLatticePoints[k];
              const dist = Math.sqrt((mpt.originalX - lpt.originalX) ** 2 + (mpt.originalY - lpt.originalY) ** 2);
              const w = 1.0 / Math.pow(dist, 2); // inverse distance squared weight
              totalWeight += w;
              meshDx += (lpt.x - lpt.originalX) * w;
              meshDy += (lpt.y - lpt.originalY) * w;
            }
            
            if (totalWeight > 0) {
              meshDx /= totalWeight;
              meshDy /= totalWeight;
            }
            
            return {
              ...mpt,
              currentX: Number((mpt.originalX + meshDx).toFixed(2)),
              currentY: Number((mpt.originalY + meshDy).toFixed(2))
            };
          });
          
          return {
            ...prev,
            [selectedObjectId]: {
              ...prev[selectedObjectId],
              meshState: {
                ...prev[selectedObjectId].meshState!,
                latticePoints: updatedLatticePoints,
                points: updatedMeshPoints
              }
            }
          };
        });
      }
      return;
    }

    if (dragMode === 'vdf-node' && selectedObjectId && draggedMeshPointIndex !== null && draggedMeshPointIndex !== undefined) {
      pendingCoordsRef.current = coords;
      if (!dragRafRef.current) {
        dragRafRef.current = requestAnimationFrame(() => {
          dragRafRef.current = null;
          const latestCoords = pendingCoordsRef.current;
          if (!latestCoords) return;

          setObjects(prev => {
            const targetObj = prev[selectedObjectId];
            if (!targetObj) return prev;
            const vdfState = targetObj.customVectorDeformState;
            if (!vdfState || !vdfState.nodes || !vdfState.nodes[draggedMeshPointIndex]) return prev;

            const nodeIdx = draggedMeshPointIndex;
            const updatedNodes = vdfState.nodes.map((node, idx) => {
              if (idx === nodeIdx) {
                return {
                  ...node,
                  x: latestCoords.x,
                  y: latestCoords.y
                };
              }
              return node;
            });

            let updatedPoints = targetObj.points;
            let updatedSubPaths = targetObj.subPaths;
            const origPts = vdfState.origObjectPoints || targetObj.points;
            const origSubs = targetObj.originalSubPathsBackup || targetObj.subPaths;

            const isRigid = activeTool === 'PBM' || activeTool === 'RPD' || vdfState.rigidLinear;

            if (updatedNodes.length >= 2 && origPts && origPts.length > 0) {
              if (isRigid) {
                updatedPoints = calculateRigidLinearDeformedPoints(origPts, updatedNodes);
                if (origSubs && origSubs.length > 0) {
                  updatedSubPaths = origSubs.map(sub => calculateRigidLinearDeformedPoints(sub, updatedNodes));
                }
              } else {
                updatedPoints = calculateCustomVectorDeformedPoints(origPts, updatedNodes, vdfState.captureRadius || vdfState.stiffness || 50);
                if (origSubs && origSubs.length > 0) {
                  updatedSubPaths = origSubs.map(sub => calculateCustomVectorDeformedPoints(sub, updatedNodes, vdfState.captureRadius || vdfState.stiffness || 50));
                }
              }
            }

            let updated3DFields: Partial<VectorObject> = {};
            if (targetObj.type === '3d' || targetObj.vertices3D) {
              const res = extrude2DTo3D(
                updatedPoints,
                targetObj.fillColor,
                targetObj.strokeColor,
                targetObj.depth3D || 40,
                !!targetObj.hollowEnabled,
                targetObj.innerSpace3D || 10,
                !!targetObj.fillGaps3D,
                targetObj.strokeWidth || 5
              );
              updated3DFields = {
                vertices3D: res.vertices,
                faces3D: res.faces
              };
            }

            return {
              ...prev,
              [selectedObjectId]: {
                ...targetObj,
                points: updatedPoints,
                subPaths: updatedSubPaths,
                ...updated3DFields,
                customVectorDeformState: {
                  ...vdfState,
                  nodes: updatedNodes,
                  origObjectPoints: origPts
                }
              }
            };
          });
        });
      }
      return;
    }

    if (dragMode === 'splineHandle' && selectedObjectId && draggedSplineIndex !== null && draggedSplinePart) {
      const obj = objects[selectedObjectId];
      if (obj && obj.splineControlPoints) {
        const localPos = worldToLocal(coords, obj.transform, obj.pivots[0]);
        setObjects(prev => {
          if (!prev[selectedObjectId] || !prev[selectedObjectId].splineControlPoints) return prev;
          
          const updatedSplineCPs = prev[selectedObjectId].splineControlPoints!.map(cp => ({
            start: { ...cp.start },
            cp1: { ...cp.cp1 },
            cp2: { ...cp.cp2 },
            end: { ...cp.end }
          }));
          
          // Twist point dragging
          if (draggedSplinePart === 'twist') {
            const updatedTwists = prev[selectedObjectId].splineTwistPoints!.map(tp => ({ ...tp }));
            const tp = updatedTwists[draggedSplineIndex];
            if (tp) {
              const dx = coords.x - dragStartPoint.x;
              const dy = coords.y - dragStartPoint.y;
              tp.rotation = Number((tp.rotation + dx * 0.5).toFixed(1));
              tp.scale = Number(Math.max(0.1, tp.scale - dy * 0.01).toFixed(2));
            }
            return {
              ...prev,
              [selectedObjectId]: {
                ...prev[selectedObjectId],
                splineTwistPoints: updatedTwists
              }
            };
          }
          
          const seg = updatedSplineCPs[draggedSplineIndex];
          if (!seg) return prev;
          
          // Uniform stretch logic on dragging end point of last segment
          if (prev[selectedObjectId].splineUniformStretch && draggedSplinePart === 'end' && draggedSplineIndex === updatedSplineCPs.length - 1) {
            const startPt = updatedSplineCPs[0].start;
            const oldEndPt = seg.end;
            const newEndPt = localPos;
            
            const dOld = { x: oldEndPt.x - startPt.x, y: oldEndPt.y - startPt.y };
            const dNew = { x: newEndPt.x - startPt.x, y: newEndPt.y - startPt.y };
            
            const lenOld = Math.sqrt(dOld.x * dOld.x + dOld.y * dOld.y);
            const lenNew = Math.sqrt(dNew.x * dNew.x + dNew.y * dNew.y);
            
            if (lenOld > 1) {
              const scale = lenNew / lenOld;
              const angleOld = Math.atan2(dOld.y, dOld.x);
              const angleNew = Math.atan2(dNew.y, dNew.x);
              const dAngle = angleNew - angleOld;
              
              for (let i = 0; i < updatedSplineCPs.length; i++) {
                const transformPt = (pt: Point) => {
                  const dx = pt.x - startPt.x;
                  const dy = pt.y - startPt.y;
                  const r = Math.sqrt(dx * dx + dy * dy) * scale;
                  const a = Math.atan2(dy, dx) + dAngle;
                  return { x: startPt.x + r * Math.cos(a), y: startPt.y + r * Math.sin(a) };
                };
                
                updatedSplineCPs[i] = {
                  start: i === 0 ? startPt : transformPt(updatedSplineCPs[i].start),
                  cp1: transformPt(updatedSplineCPs[i].cp1),
                  cp2: transformPt(updatedSplineCPs[i].cp2),
                  end: transformPt(updatedSplineCPs[i].end)
                };
              }
            }
          } else {
            // Standard point/handle update
            if (draggedSplinePart === 'start') {
              seg.start = localPos;
              if (draggedSplineIndex > 0) {
                updatedSplineCPs[draggedSplineIndex - 1].end = localPos;
              }
            } else if (draggedSplinePart === 'end') {
              seg.end = localPos;
              if (draggedSplineIndex < updatedSplineCPs.length - 1) {
                updatedSplineCPs[draggedSplineIndex + 1].start = localPos;
              }
            } else if (draggedSplinePart === 'cp1') {
              seg.cp1 = localPos;
            } else if (draggedSplinePart === 'cp2') {
              seg.cp2 = localPos;
            }
          }
          
          return {
            ...prev,
            [selectedObjectId]: {
              ...prev[selectedObjectId],
              splineControlPoints: updatedSplineCPs
            }
          };
        });
      }
      return;
    }

    if (dragMode === 'drag-lasso-selection-point' && draggedMeshPointIndex !== null) {
      setLassoPoints(prev => {
        const next = [...prev];
        if (next[draggedMeshPointIndex]) {
          next[draggedMeshPointIndex] = coords;
        }
        return next;
      });
      return;
    }

    if (dragMode === 'drag-fsl-selection-point' && draggedMeshPointIndex !== null) {
      setFslPoints?.(prev => {
        const next = [...prev];
        if (next[draggedMeshPointIndex]) {
          next[draggedMeshPointIndex] = coords;
        }
        return next;
      });
      return;
    }

    if (dragMode === 'drag-fsl-entire-area') {
      const dx = coords.x - dragStartPoint.x;
      const dy = coords.y - dragStartPoint.y;
      const initialPoints = (window as any)._initialFslPoints || [];
      if (initialPoints.length > 0) {
        setFslPoints?.(initialPoints.map((p: Point) => ({
          x: p.x + dx,
          y: p.y + dy
        })));
      }
      return;
    }

    if ((dragMode === 'curvePathH' || dragMode === 'curvePathV') && selectedObjectId && draggedMeshPointIndex !== null) {
      const obj = objects[selectedObjectId];
      if (obj && obj.curvePathState) {
        const localPos = worldToLocal(coords, obj.transform, obj.pivots[0]);
        setObjects(prev => {
          if (!prev[selectedObjectId]) return prev;
          const cps = prev[selectedObjectId].curvePathState;
          if (!cps) return prev;
          
          if (dragMode === 'curvePathH') {
            const hCPs = [...(cps.hControlPoints || [])];
            if (hCPs[draggedMeshPointIndex]) {
              hCPs[draggedMeshPointIndex] = {
                ...hCPs[draggedMeshPointIndex],
                x: Number(localPos.x.toFixed(2)),
                y: Number(localPos.y.toFixed(2))
              };
            }
            return {
              ...prev,
              [selectedObjectId]: {
                ...prev[selectedObjectId],
                curvePathState: {
                  ...cps,
                  hControlPoints: hCPs
                }
              }
            };
          } else {
            const vCPs = [...(cps.vControlPoints || [])];
            if (vCPs[draggedMeshPointIndex]) {
              vCPs[draggedMeshPointIndex] = {
                ...vCPs[draggedMeshPointIndex],
                x: Number(localPos.x.toFixed(2)),
                y: Number(localPos.y.toFixed(2))
              };
            }
            return {
              ...prev,
              [selectedObjectId]: {
                ...prev[selectedObjectId],
                curvePathState: {
                  ...cps,
                  vControlPoints: vCPs
                }
              }
            };
          }
        });
      }
      return;
    }

    if ((dragMode === 'flexCurveHandle' || dragMode === 'flexCurveBody') && selectedObjectId) {
      const obj = objects[selectedObjectId];
      if (obj && obj.flexCurveState) {
        const localPos = worldToLocal(coords, obj.transform, obj.pivots[0]);
        setObjects(prev => {
          if (!prev[selectedObjectId]) return prev;
          const fcs = prev[selectedObjectId].flexCurveState;
          if (!fcs || !fcs.points) return prev;

          if (dragMode === 'flexCurveHandle' && draggedMeshPointIndex !== null) {
            const newPts = [...fcs.points];
            if (newPts[draggedMeshPointIndex]) {
              const nx = Number(localPos.x.toFixed(2));
              const ny = Number(localPos.y.toFixed(2));
              if (!fcs.isAttached) {
                // Placement mode: update both current and resting position
                newPts[draggedMeshPointIndex] = {
                  ...newPts[draggedMeshPointIndex],
                  x: nx,
                  y: ny,
                  origX: nx,
                  origY: ny
                };
              } else {
                // Attached mode: update current position only
                newPts[draggedMeshPointIndex] = {
                  ...newPts[draggedMeshPointIndex],
                  x: nx,
                  y: ny
                };
              }
            }
            return {
              ...prev,
              [selectedObjectId]: {
                ...prev[selectedObjectId],
                flexCurveState: {
                  ...fcs,
                  points: newPts
                }
              }
            };
          } else if (dragMode === 'flexCurveBody') {
            const initialPts = (window as any)._initialFlexCurvePts || fcs.points;
            const startLocal = worldToLocal(dragStartPoint, obj.transform, obj.pivots[0]);
            const dx = localPos.x - startLocal.x;
            const dy = localPos.y - startLocal.y;

            const newPts = initialPts.map((pt: FlexCurveControlPoint) => {
              const nx = Number((pt.x + dx).toFixed(2));
              const ny = Number((pt.y + dy).toFixed(2));
              if (!fcs.isAttached) {
                const norigX = Number((pt.origX + dx).toFixed(2));
                const norigY = Number((pt.origY + dy).toFixed(2));
                return { ...pt, x: nx, y: ny, origX: norigX, origY: norigY };
              } else {
                return { ...pt, x: nx, y: ny };
              }
            });

            return {
              ...prev,
              [selectedObjectId]: {
                ...prev[selectedObjectId],
                flexCurveState: {
                  ...fcs,
                  points: newPts
                }
              }
            };
          }
          return prev;
        });
      }
      return;
    }

    if (dragMode === 'puppetPin' && selectedObjectId && draggedMeshPointIndex !== null) {
      const obj = objects[selectedObjectId];
      if (obj) {
        const localPos = worldToLocal(coords, obj.transform, obj.pivots[0]);
        setObjects(prev => {
          if (!prev[selectedObjectId]) return prev;
          const updatedPins = [...(prev[selectedObjectId].pins || [])];
          if (updatedPins[draggedMeshPointIndex]) {
            updatedPins[draggedMeshPointIndex] = {
              ...updatedPins[draggedMeshPointIndex],
              currentLocalX: Number(localPos.x.toFixed(2)),
              currentLocalY: Number(localPos.y.toFixed(2))
            };
          }
          return {
            ...prev,
            [selectedObjectId]: {
              ...prev[selectedObjectId],
              pins: updatedPins
            }
          };
        });
      }
      return;
    }

    if (dragMode === 'lassoControlPoint' && selectedObjectId && draggedMeshPointIndex !== null) {
      const obj = objects[selectedObjectId];
      if (obj && obj.lassoControlPoints) {
        const localPos = worldToLocal(coords, obj.transform, obj.pivots[0]);
        setObjects(prev => {
          if (!prev[selectedObjectId]) return prev;
          const updatedLcp = [...(prev[selectedObjectId].lassoControlPoints || [])];
          if (updatedLcp[draggedMeshPointIndex]) {
            updatedLcp[draggedMeshPointIndex] = {
              ...updatedLcp[draggedMeshPointIndex],
              currentX: Number(localPos.x.toFixed(2)),
              currentY: Number(localPos.y.toFixed(2))
            };
          }
          return {
            ...prev,
            [selectedObjectId]: {
              ...prev[selectedObjectId],
              lassoControlPoints: updatedLcp
            }
          };
        });
      }
      return;
    }

    if (dragMode === 'paintColor' && selectedObjectId) {
      const obj = objects[selectedObjectId];
      if (obj && obj.smartMeshColor) {
        paintColorAt(coords, obj);
      }
      return;
    }

    if (dragMode === 'smartWarpPin' && selectedObjectId && draggedMeshPointIndex !== null) {
      const obj = objects[selectedObjectId];
      if (obj && obj.smartWarp) {
        const localPos = worldToLocal(coords, obj.transform, obj.pivots[0]);
        setObjects(prev => {
          if (!prev[selectedObjectId]) return prev;
          const sw = prev[selectedObjectId].smartWarp;
          if (!sw) return prev;
          const updatedPins = [...sw.pins];
          if (updatedPins[draggedMeshPointIndex]) {
            updatedPins[draggedMeshPointIndex] = {
              ...updatedPins[draggedMeshPointIndex],
              currentX: Number(localPos.x.toFixed(2)),
              currentY: Number(localPos.y.toFixed(2))
            };
          }
          return {
            ...prev,
            [selectedObjectId]: {
              ...prev[selectedObjectId],
              smartWarp: {
                ...sw,
                pins: updatedPins
              }
            }
          };
        });
      }
      return;
    }

    if (dragMode === ('cagePoint' as any) && selectedObjectId && draggedMeshPointIndex !== null) {
      const obj = objects[selectedObjectId];
      if (obj && obj.cageState) {
        const localPos = worldToLocal(coords, obj.transform, obj.pivots[0]);
        setObjects(prev => {
          if (!prev[selectedObjectId] || !prev[selectedObjectId].cageState) return prev;
          const cs = prev[selectedObjectId].cageState;
          const updatedPoints = [...cs.points];
          if (updatedPoints[draggedMeshPointIndex]) {
            updatedPoints[draggedMeshPointIndex] = {
              ...updatedPoints[draggedMeshPointIndex],
              currentX: Number(localPos.x.toFixed(2)),
              currentY: Number(localPos.y.toFixed(2))
            };
          }
          return {
            ...prev,
            [selectedObjectId]: {
              ...prev[selectedObjectId],
              cageState: {
                ...cs,
                points: updatedPoints
              }
            }
          };
        });
      }
      return;
    }

    if (dragMode === ('liquify' as any) && selectedObjectId) {
      const obj = objects[selectedObjectId];
      if (obj && obj.meshState && obj.meshState.points && lastLiquifyLocalPosRef.current) {
        const currentLocal = worldToLocal(coords, obj.transform, obj.pivots[0]);
        const prevLocal = lastLiquifyLocalPosRef.current;
        
        // Compute displacement vector in local space
        const vx = currentLocal.x - prevLocal.x;
        const vy = currentLocal.y - prevLocal.y;
        
        // Brush parameters
        const bSize = liquifySettings?.brushSize ?? 60;
        const bStrength = liquifySettings?.brushStrength ?? 0.3;
        const bMode = liquifySettings?.brushMode ?? 'push';

        let pointsCopy = [...obj.meshState.points];
        
        const stepDist = Math.sqrt(vx * vx + vy * vy);
        // Step size is 15% of brush size, but at least 5px, to prevent too many steps.
        const stepSize = Math.max(5, bSize * 0.15);
        const stepsCount = Math.max(1, Math.min(10, Math.ceil(stepDist / stepSize)));
        
        for (let step = 1; step <= stepsCount; step++) {
          const t = step / stepsCount;
          const interLocal = {
            x: prevLocal.x + (currentLocal.x - prevLocal.x) * t,
            y: prevLocal.y + (currentLocal.y - prevLocal.y) * t
          };
          const subVx = vx / stepsCount;
          const subVy = vy / stepsCount;
          
          pointsCopy = pointsCopy.map((pt: any) => {
            const dx = pt.currentX - interLocal.x;
            const dy = pt.currentY - interLocal.y;
            const distVal = Math.sqrt(dx * dx + dy * dy);
            
            if (distVal < bSize) {
              const w = Math.pow(1 - distVal / bSize, 2);
              let nx = pt.currentX;
              let ny = pt.currentY;

              if (bMode === 'push') {
                nx += subVx * w * bStrength;
                ny += subVy * w * bStrength;
              } else if (bMode === 'pinch') {
                const pvx = interLocal.x - pt.currentX;
                const pvy = interLocal.y - pt.currentY;
                nx += pvx * w * bStrength * 0.4 / stepsCount;
                ny += pvy * w * bStrength * 0.4 / stepsCount;
              } else if (bMode === 'bulge') {
                const bvx = pt.currentX - interLocal.x;
                const bvy = pt.currentY - interLocal.y;
                nx += bvx * w * bStrength * 0.4 / stepsCount;
                ny += bvy * w * bStrength * 0.4 / stepsCount;
              } else if (bMode === 'twist-cw') {
                const rx = pt.currentX - interLocal.x;
                const ry = pt.currentY - interLocal.y;
                nx += -ry * w * bStrength * 0.15 / stepsCount;
                ny += rx * w * bStrength * 0.15 / stepsCount;
              } else if (bMode === 'twist-ccw') {
                const rx = pt.currentX - interLocal.x;
                const ry = pt.currentY - interLocal.y;
                nx += ry * w * bStrength * 0.15 / stepsCount;
                ny += -rx * w * bStrength * 0.15 / stepsCount;
              } else if (bMode === 'restore') {
                const ox = pt.originalX - pt.currentX;
                const oy = pt.originalY - pt.currentY;
                nx += ox * w * bStrength * 0.4 / stepsCount;
                ny += oy * w * bStrength * 0.4 / stepsCount;
              }

              return {
                ...pt,
                currentX: Number(nx.toFixed(2)),
                currentY: Number(ny.toFixed(2))
              };
            }
            return pt;
          });
        }

        setObjects(prev => {
          if (!prev[selectedObjectId] || !prev[selectedObjectId].meshState) return prev;
          return {
            ...prev,
            [selectedObjectId]: {
              ...prev[selectedObjectId],
              meshState: {
                ...prev[selectedObjectId].meshState!,
                points: pointsCopy
              }
            }
          };
        });

        lastLiquifyLocalPosRef.current = currentLocal;
      }
      return;
    }

    if (dragMode === ('rotate3D' as any) && selectedObjectId) {
      const obj = objects[selectedObjectId];
      if (obj && obj.type === '3d' && obj.transform3D) {
        const dx = coords.x - dragStartPoint.x;
        const dy = coords.y - dragStartPoint.y;
        
        const nextRy = (initialTransform.ry + dx * 0.7) % 360;
        const nextRx = (initialTransform.rx - dy * 0.7) % 360;
        
        setObjects(prev => ({
          ...prev,
          [selectedObjectId]: {
            ...prev[selectedObjectId],
            transform3D: {
              ...prev[selectedObjectId].transform3D!,
              ry: Math.round(nextRy),
              rx: Math.round(nextRx)
            }
          }
        }));
      }
      return;
    }

    if (dragMode === 'extrudeBranchPoint' && selectedObjectId && draggedMeshPointIndex !== null && extrudeSubPathIndex !== null) {
      const obj = objects[selectedObjectId];
      if (obj && obj.subPaths && obj.subPaths[extrudeSubPathIndex]) {
        const pivot = obj.pivots[0] || { localX: 0, localY: 0 };
        const localPos = worldToLocal(coords, obj.transform, pivot);

        setObjects(prev => {
          if (!prev[selectedObjectId]) return prev;
          const targetObj = prev[selectedObjectId];
          if (!targetObj.subPaths || !targetObj.subPaths[extrudeSubPathIndex]) return prev;

          const updatedSubs = targetObj.subPaths.map((sub, sIdx) => {
            if (sIdx === extrudeSubPathIndex) {
              const subCopy = [...sub];
              subCopy[1] = { x: Number(localPos.x.toFixed(2)), y: Number(localPos.y.toFixed(2)) };
              return subCopy;
            }
            return sub;
          });

          let updatedMeshPoints = targetObj.meshState?.points;
          if (updatedMeshPoints && updatedMeshPoints[draggedMeshPointIndex]) {
            updatedMeshPoints = updatedMeshPoints.map((mpt, idx) => {
              if (idx === draggedMeshPointIndex) {
                return {
                  ...mpt,
                  currentX: Number(localPos.x.toFixed(2)),
                  currentY: Number(localPos.y.toFixed(2)),
                  originalX: Number(localPos.x.toFixed(2)),
                  originalY: Number(localPos.y.toFixed(2))
                };
              }
              return mpt;
            });
          }

          return {
            ...prev,
            [selectedObjectId]: {
              ...targetObj,
              subPaths: updatedSubs,
              points: updatedSubs.flat(),
              ...(updatedMeshPoints ? {
                meshState: {
                  ...targetObj.meshState!,
                  points: updatedMeshPoints
                }
              } : {})
            }
          };
        });
      }
    }

    if (dragMode === 'meshPoint' && selectedObjectId && draggedMeshPointIndex !== null) {
      const obj = objects[selectedObjectId];
      if (obj) {
        if (obj.type === '3d' && obj.vertices3D) {
          // Deform 3D vertex coordinate!
          // Calculate movement delta in canvas coordinates
          const dx = coords.x - currentCursorPos.x;
          const dy = coords.y - currentCursorPos.y;
          
          setObjects(prev => {
            if (!prev[selectedObjectId]) return prev;
            const updatedVtx = [...(prev[selectedObjectId].vertices3D || [])];
            if (updatedVtx[draggedMeshPointIndex]) {
              const scaleFactor = 1.0 / (obj.transform3D?.sx || 1.0);
              const P_curr = {
                x: Number((updatedVtx[draggedMeshPointIndex].x + dx * scaleFactor).toFixed(2)),
                y: Number((updatedVtx[draggedMeshPointIndex].y + dy * scaleFactor).toFixed(2)),
                z: updatedVtx[draggedMeshPointIndex].z
              };
              updatedVtx[draggedMeshPointIndex] = P_curr;

              return {
                ...prev,
                [selectedObjectId]: {
                  ...prev[selectedObjectId],
                  vertices3D: updatedVtx
                }
              };
            }
            return prev;
          });
        } else {
          const localPos = worldToLocal(coords, obj.transform, obj.pivots[0]);
          setObjects(prev => {
            if (!prev[selectedObjectId]) return prev;
            const updatedPoints = [...prev[selectedObjectId].points];
            const P_curr = {
              x: Number(localPos.x.toFixed(2)),
              y: Number(localPos.y.toFixed(2))
            };
            updatedPoints[draggedMeshPointIndex] = P_curr;

            // --- Adaptive Subdivision for 2D Drawings ---
            // If an edge exceeds 55.0 pixels, dynamically split it and insert new points!
            const N = updatedPoints.length;
            const THRESHOLD_2D = 55.0;
            let finalPoints = [...updatedPoints];
            let nextDraggedIndex = draggedMeshPointIndex;

            if (adaptiveSubdivisionEnabled && N >= 2) {
              const numPoints = Math.min(adaptiveSubdivisionPoints, 3); // strictly 1 to 3
              const leftIdx = (draggedMeshPointIndex - 1 + N) % N;
              const rightIdx = (draggedMeshPointIndex + 1) % N;

              const P_left = updatedPoints[leftIdx];
              const P_right = updatedPoints[rightIdx];

              const distLeft = distance(P_curr, P_left);

              // 1. Check Left Edge
              if (distLeft > THRESHOLD_2D) {
                const newPoints: { x: number, y: number }[] = [];
                for (let k = 1; k <= numPoints; k++) {
                  const t = k / (numPoints + 1);
                  newPoints.push({
                    x: Number((P_left.x * (1 - t) + P_curr.x * t).toFixed(2)),
                    y: Number((P_left.y * (1 - t) + P_curr.y * t).toFixed(2))
                  });
                }

                if (leftIdx === N - 1 && draggedMeshPointIndex === 0) {
                  finalPoints.push(...newPoints);
                } else {
                  finalPoints.splice(draggedMeshPointIndex, 0, ...newPoints);
                  nextDraggedIndex += numPoints;
                }
              }

              // 2. Check Right Edge
              const N2 = finalPoints.length;
              const currentP = finalPoints[nextDraggedIndex];
              const curRightIdx = (nextDraggedIndex + 1) % N2;
              const P_curRight = finalPoints[curRightIdx];
              const distRightSec = distance(currentP, P_curRight);

              if (distRightSec > THRESHOLD_2D) {
                const newPoints: { x: number, y: number }[] = [];
                for (let k = 1; k <= numPoints; k++) {
                  const t = k / (numPoints + 1);
                  newPoints.push({
                    x: Number((currentP.x * (1 - t) + P_curRight.x * t).toFixed(2)),
                    y: Number((currentP.y * (1 - t) + P_curRight.y * t).toFixed(2))
                  });
                }

                if (nextDraggedIndex === N2 - 1 && curRightIdx === 0) {
                  finalPoints.push(...newPoints);
                } else {
                  finalPoints.splice(nextDraggedIndex + 1, 0, ...newPoints);
                }
              }
            }

            if (nextDraggedIndex !== draggedMeshPointIndex) {
              setTimeout(() => setDraggedMeshPointIndex(nextDraggedIndex), 0);
            }

            const targetObj = prev[selectedObjectId];
            let updatedSubPaths = targetObj.subPaths;
            if (targetObj.subPaths && targetObj.subPaths.length > 0) {
              if (targetObj.subPaths.length === 1) {
                updatedSubPaths = [finalPoints];
              } else {
                updatedSubPaths = targetObj.subPaths.map((sub, sIdx) => {
                  let acc = 0;
                  for (let i = 0; i < sIdx; i++) acc += targetObj.subPaths![i].length;
                  if (draggedMeshPointIndex >= acc && draggedMeshPointIndex < acc + sub.length) {
                    const localI = draggedMeshPointIndex - acc;
                    const subCopy = [...sub];
                    subCopy[localI] = P_curr;
                    return subCopy;
                  }
                  return sub;
                });
              }
            }

            return {
              ...prev,
              [selectedObjectId]: {
                ...targetObj,
                points: finalPoints,
                ...(updatedSubPaths ? { subPaths: updatedSubPaths } : {})
              }
            };
          });
        }
      }
      return;
    }

    if (activeTool === 'BON' && boneStartPoint) {
      const pList = getAllPivotsWorld();
      const nearPivot = pList.find(item => item.objId !== boneStartObject?.id && distance(coords, { x: item.worldX, y: item.worldY }) < 15);
      if (nearPivot) {
        setSnappedPivot(nearPivot);
        setCurrentCursorPos({ x: nearPivot.worldX, y: nearPivot.worldY });
      } else {
        setSnappedPivot(null);
        setCurrentCursorPos(coords);
      }
      return;
    }

    if (isDrawing && activeTool === 'BRS') {
      const lastPt = strokePointsRef.current[strokePointsRef.current.length - 1] || null;
      const nextPt = createRealismPoint(coords, lastPt, realismSettings);
      strokePointsRef.current.push(nextPt);
      setStrokePoints([...strokePointsRef.current]);

      // Direct canvas context paint for 0ms lag!
      const canvas = frontCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          // Align with active zoom & pan settings
          ctx.translate(zoomOffset.x, zoomOffset.y);
          ctx.scale(zoomScale, zoomScale);

          // Configure active brush context style
          applyBrushSettingsToCtx(ctx, brushSettings || {}, brushSettings?.strokeColor ?? '#000000', brushSettings?.strokeWidth ?? 5);

          ctx.beginPath();
          if (lastPt) {
            ctx.moveTo(lastPt.x, lastPt.y);
            ctx.lineTo(nextPt.x, nextPt.y);
          } else {
            ctx.arc(nextPt.x, nextPt.y, (brushSettings?.strokeWidth ?? 5) / 2, 0, Math.PI * 2);
          }

          ctx.strokeStyle = brushSettings?.strokeColor ?? '#000000';
          ctx.lineWidth = brushSettings?.strokeWidth ?? 5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          if (lastPt) {
            ctx.stroke();
          } else {
            ctx.fillStyle = brushSettings?.strokeColor ?? '#000000';
            ctx.fill();
          }

          ctx.restore();
        }
      }
      return;
    }

    if (isDrawingLasso) {
      if (activeTool === 'LSO' || activeTool === 'VEX' || activeTool === 'PSE') {
        setLassoPoints(prev => [...prev, coords]);
        return;
      } else if (activeTool === 'FSL') {
        setFslPoints?.(prev => [...prev, coords]);
        return;
      }
    }

    if (isDrawing && activeTool === 'ERS') {
      erasePointsAt(coords);
      return;
    }

    if (selectedObjectId) {
      const obj = objects[selectedObjectId];
      if (!obj) return;

      if (dragMode === 'move') {
        const dx = coords.x - dragStartPoint.x;
        const dy = coords.y - dragStartPoint.y;

        let nextX = Number((initialTransform.x + dx).toFixed(2));
        let nextY = Number((initialTransform.y + dy).toFixed(2));

        setElasticWarningId(null);

        setObjects(prev => {
          const updated = { ...prev };
          const activeObj = updated[selectedObjectId];
          if (!activeObj) return prev;

          const deltaX = nextX - activeObj.transform.x;
          const deltaY = nextY - activeObj.transform.y;

          updated[selectedObjectId] = {
            ...activeObj,
            transform: {
              ...activeObj.transform,
              x: nextX,
              y: nextY,
            }
          };

          const movedSet = new Set<string>();
          movedSet.add(selectedObjectId);

          // Relative translation for permanently attached drawings
          if (activeObj.attachedGroupId) {
            (Object.values(updated) as VectorObject[]).forEach(otherObj => {
              if (otherObj.id !== selectedObjectId && otherObj.attachedGroupId === activeObj.attachedGroupId) {
                updated[otherObj.id] = {
                  ...otherObj,
                  transform: {
                    ...otherObj.transform,
                    x: Number((otherObj.transform.x + deltaX).toFixed(2)),
                    y: Number((otherObj.transform.y + deltaY).toFixed(2))
                  }
                };
                movedSet.add(otherObj.id);
              }
            });
          }

          propagateRigTransforms(updated, selectedObjectId, deltaX, deltaY, 0, 1, 1, movedSet);
          return updated;
        });
      }

      else if (dragMode === 'rotate') {
        const pivotObj = obj.pivots?.[0] || { localX: 0, localY: 0 };
        const pivotWorld = localToWorld(
          { x: pivotObj.localX, y: pivotObj.localY },
          obj.transform,
          pivotObj
        );
        const angleStart = Math.atan2(dragStartPoint.y - pivotWorld.y, dragStartPoint.x - pivotWorld.x);
        const angleCurrent = Math.atan2(coords.y - pivotWorld.y, coords.x - pivotWorld.x);
        const deltaRad = angleCurrent - angleStart;
        const deltaDeg = (deltaRad * 180) / Math.PI;

        let nextRotation = Number((initialTransform.rotation + deltaDeg).toFixed(2));

        if (obj.parentId && objects[obj.parentId]) {
          const parent = objects[obj.parentId];
          const isParentClosed = parent.type === 'shape' && parent.shapeType !== 'line';
          if (isParentClosed) {
            const testTransform = { ...obj.transform, rotation: nextRotation };
            if (!isChildInsideParent(obj, parent, testTransform, objects)) {
              nextRotation = obj.transform.rotation; // block rotation outside parent
            }
          }
        }
        const deltaRot = nextRotation - obj.transform.rotation;

        setObjects(prev => {
          const updated = { ...prev };
          updated[selectedObjectId] = {
            ...updated[selectedObjectId],
            transform: {
              ...updated[selectedObjectId].transform,
              rotation: nextRotation
            }
          };

          propagateRigTransforms(updated, selectedObjectId, 0, 0, deltaRot);
          return updated;
        });
      }

      else if (dragMode === 'scale') {
        const pivotObj = obj.pivots?.[0] || { localX: 0, localY: 0 };
        const pivotWorld = localToWorld(
          { x: pivotObj.localX, y: pivotObj.localY },
          obj.transform,
          pivotObj
        );
        const initialDist = distance(dragStartPoint, pivotWorld) || 1;
        const currentDist = distance(coords, pivotWorld);
        const scaleFactor = currentDist / initialDist;

        const nextScaleX = Number((initialTransform.scaleX * scaleFactor).toFixed(2));
        const nextScaleY = Number((initialTransform.scaleY * scaleFactor).toFixed(2));

        setObjects(prev => {
          const updated = { ...prev };
          const idx = activeHandleIndex;
          
          let scaleX = nextScaleX;
          let scaleY = nextScaleY;

          if (idx === 1 || idx === 5) {
            scaleX = initialTransform.scaleX;
          } else if (idx === 3 || idx === 7) {
            scaleY = initialTransform.scaleY;
          }

          if (obj.parentId && objects[obj.parentId]) {
            const parent = objects[obj.parentId];
            const isParentClosed = parent.type === 'shape' && parent.shapeType !== 'line';
            if (isParentClosed) {
              const testTransform = { ...obj.transform, scaleX, scaleY };
              if (!isChildInsideParent(obj, parent, testTransform, objects)) {
                scaleX = obj.transform.scaleX;
                scaleY = obj.transform.scaleY;
              }
            }
          }

          updated[selectedObjectId] = {
            ...updated[selectedObjectId],
            transform: {
              ...updated[selectedObjectId].transform,
              scaleX,
              scaleY
            }
          };

          const sXRatio = obj.transform.scaleX !== 0 ? scaleX / obj.transform.scaleX : 1;
          const sYRatio = obj.transform.scaleY !== 0 ? scaleY / obj.transform.scaleY : 1;
          propagateRigTransforms(updated, selectedObjectId, 0, 0, 0, sXRatio, sYRatio);
          return updated;
        });
      }

      else if (dragMode === 'pivot') {
        const localPos = worldToLocal(coords, obj.transform, obj.pivots[0]);
        // Snap to nearest drawing point in local space if within 15px (world space converted to local threshold)
        let snappedLocal = { ...localPos };
        let minDistance = 15 / (obj.transform.scaleX || 1); // 15px threshold in local space
        obj.points.forEach(pt => {
          const dist = distance(localPos, pt);
          if (dist < minDistance) {
            minDistance = dist;
            snappedLocal = { ...pt };
          }
        });

        setObjects(prev => {
          const updated = { ...prev };
          const updatedPivots = [...updated[selectedObjectId].pivots];
          updatedPivots[0] = {
            ...updatedPivots[0],
            localX: Number(snappedLocal.x.toFixed(2)),
            localY: Number(snappedLocal.y.toFixed(2))
          };
          updated[selectedObjectId].pivots = updatedPivots;
          return updated;
        });
      }
    }

    if (dragMode === 'pivot' && activeTool === 'KNF') {
      setKnifePath(prev => [...prev, coords]);
    }
    } catch (err: any) {
      console.error("Pointer move handler failed:", err);
    }
  };

  // Pointer Up event handler
  const handlePointerUp = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    try {
    if (e && e.pointerId !== undefined) {
      delete activePointersRef.current[e.pointerId];
    } else {
      activePointersRef.current = {};
    }

    if (dragMode === 'pinchScaleObj') {
      const pointerIds = Object.keys(activePointersRef.current);
      if (pointerIds.length === 1) {
        const pt = activePointersRef.current[Number(pointerIds[0])];
        if (pt && selectedObjectId && objects[selectedObjectId]) {
          const coords = getCanvasCoords({ clientX: pt.x, clientY: pt.y } as any);
          setDragStartPoint(coords);
          setInitialTransform({ ...objects[selectedObjectId].transform });
          setDragMode('move');
        } else {
          setDragMode('none');
        }
      } else {
        setDragMode('none');
      }
      historyPush();
      return;
    }

    if (dragMode === 'zoom' || dragMode === 'pan') {
      const pointerIds = Object.keys(activePointersRef.current);
      if (pointerIds.length === 1 && activeTool === 'ZOM') {
        const pt = activePointersRef.current[Number(pointerIds[0])];
        if (pt) {
          dragStartScreenRef.current = { x: pt.x, y: pt.y };
          dragStartOffsetRef.current = { ...zoomOffset };
          setDragMode('pan');
        }
      } else {
        setDragMode('none');
      }
      return;
    }

    if (dragMode === ('rotate3D' as any)) {
      setDragMode('none');
      historyPush();
      return;
    }

    if (isDrawing && activeTool === 'BRS' && strokePointsRef.current.length > 1) {
      const pts = [...strokePointsRef.current];
      
      if (continuousDrawActive) {
        if (activeContinuousDrawingId && objects[activeContinuousDrawingId]) {
          const existingObj = objects[activeContinuousDrawingId];
          const currentSubPaths = (existingObj.subPaths && existingObj.subPaths.length > 0)
            ? existingObj.subPaths
            : [existingObj.points];
          const updatedSubPaths = [...currentSubPaths, pts];
          const unifiedPoints = unifyStrokesToSinglePath(updatedSubPaths);

          const updatedObj: VectorObject = {
            ...existingObj,
            points: unifiedPoints,
            isContinuousDrawing: true,
            subPaths: updatedSubPaths,
            joinedStrokesDemo: [...unifiedPoints],
          };
          setObjects(prev => ({ ...prev, [activeContinuousDrawingId]: updatedObj }));
          setSelectedObjectId(activeContinuousDrawingId);
          historyPush();
        } else {
          const newId = `obj_${Date.now()}`;
          const name = `Stroke_${Object.keys(objects).length + 1}`;
          const unifiedPoints = unifyStrokesToSinglePath([pts]);
          
          const newObj: VectorObject = {
            id: newId,
            name,
            type: 'stroke',
            points: unifiedPoints,
            subPaths: [pts],
            joinedStrokesDemo: [...unifiedPoints],
            strokeColor: brushSettings?.strokeColor ?? '#000000',
            strokeWidth: brushSettings?.strokeWidth ?? 3.5,
            fillColor: 'transparent',
            opacity: 1,
            transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
            pivots: [{ id: `pvt_${Date.now()}`, name: 'Pivot_1', localX: pts[0].x, localY: pts[0].y, locked: false }],
            parentId: null,
            childrenIds: [],
            layerId: activeLayerId,
            isLocked: false,
            isHidden: false,
            isContinuousDrawing: true,
            brushType: brushSettings?.brushType ?? 'solid',
            strokeOpacity: brushSettings?.strokeOpacity ?? 1.0,
            hardness: brushSettings?.hardness ?? 0.8,
            blur: brushSettings?.blur ?? 0,
            shadowEnabled: brushSettings?.shadowEnabled ?? false,
            shadowColor: brushSettings?.shadowColor ?? '#000000',
            shadowBlur: brushSettings?.shadowBlur ?? 4,
            shadowOffsetX: brushSettings?.shadowOffsetX ?? 2,
            shadowOffsetY: brushSettings?.shadowOffsetY ?? 2,
          };
          
          setObjects(prev => ({ ...prev, [newId]: newObj }));
          setSelectedObjectId(newId);
          if (setActiveContinuousDrawingId) {
            setActiveContinuousDrawingId(newId);
          }
          historyPush();
        }
      } else {
        const newId = `obj_${Date.now()}`;
        const name = `Stroke_${Object.keys(objects).length + 1}`;
        
        const newObj: VectorObject = {
          id: newId,
          name,
          type: 'stroke',
          points: pts,
          strokeColor: brushSettings?.strokeColor ?? '#000000',
          strokeWidth: brushSettings?.strokeWidth ?? 3.5,
          fillColor: 'transparent',
          opacity: 1,
          transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
          pivots: [{ id: `pvt_${Date.now()}`, name: 'Pivot_1', localX: pts[0].x, localY: pts[0].y, locked: false }],
          parentId: null,
          childrenIds: [],
          layerId: activeLayerId,
          isLocked: false,
          isHidden: false,
          brushType: brushSettings?.brushType ?? 'solid',
          strokeOpacity: brushSettings?.strokeOpacity ?? 1.0,
          hardness: brushSettings?.hardness ?? 0.8,
          blur: brushSettings?.blur ?? 0,
          shadowEnabled: brushSettings?.shadowEnabled ?? false,
          shadowColor: brushSettings?.shadowColor ?? '#000000',
          shadowBlur: brushSettings?.shadowBlur ?? 4,
          shadowOffsetX: brushSettings?.shadowOffsetX ?? 2,
          shadowOffsetY: brushSettings?.shadowOffsetY ?? 2,
        };

        setObjects(prev => ({ ...prev, [newId]: newObj }));
        setSelectedObjectId(newId);
        historyPush();
      }
    }

    if (isDrawing && activeTool === 'SHP') {
      const minX = Math.min(dragStartPoint.x, currentCursorPos.x);
      const maxX = Math.max(dragStartPoint.x, currentCursorPos.x);
      const minY = Math.min(dragStartPoint.y, currentCursorPos.y);
      const maxY = Math.max(dragStartPoint.y, currentCursorPos.y);
      const w = maxX - minX;
      const h = maxY - minY;

      if (w > 5 && h > 5) {
        const newId = `obj_${Date.now()}`;
        const name = `Rectangle_${Object.keys(objects).length + 1}`;
        const points = [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
          { x: minX, y: minY }
        ];

        const newObj: VectorObject = {
          id: newId,
          name,
          type: 'shape',
          shapeType: 'rectangle',
          points,
          strokeColor: '#1B5E20',
          strokeWidth: 3,
          fillColor: '#FFE082',
          opacity: 1,
          transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
          pivots: [{ id: `pvt_${Date.now()}`, name: 'Pivot_1', localX: minX + w/2, localY: minY + h/2, locked: false }],
          parentId: null,
          childrenIds: [],
          layerId: activeLayerId,
          isLocked: false,
          isHidden: false,
        };

        setObjects(prev => ({ ...prev, [newId]: newObj }));
        setSelectedObjectId(newId);
        historyPush();
      }
    }

    if (dragMode === 'pivot' && activeTool === 'KNF' && selectedObjectId && knifePath.length > 1) {
      const originalObj = objects[selectedObjectId];
      if (originalObj) {
        if (originalObj.type === '3d' && originalObj.vertices3D && originalObj.transform3D) {
          // 3D Knife deform / split gap
          const lineStart = knifePath[0];
          const lineEnd = knifePath[knifePath.length - 1];
          const scaleFactor = 1.0 / (originalObj.transform3D.sx || 1.0);

          setObjects(prev => {
            if (!prev[selectedObjectId]) return prev;
            const updatedVtx = [...(prev[selectedObjectId].vertices3D || [])];
            
            // Project vertices to find close ones
            const transformed3D = transform3DVertices(updatedVtx, originalObj.transform3D!.x, originalObj.transform3D!.y, originalObj.transform3D!.z, originalObj.transform3D!.rx, originalObj.transform3D!.ry, originalObj.transform3D!.rz, originalObj.transform3D!.sx, originalObj.transform3D!.sy, originalObj.transform3D!.sz);
            const projected = transformed3D.map(v => {
              const proj = project3DVertex(v, 400);
              return localToWorld(proj, originalObj.transform, originalObj.pivots[0] || { localX: 0, localY: 0 });
            });

            updatedVtx.forEach((v, idx) => {
              const proj = projected[idx];
              if (!proj) return;
              
              // Distance helper
              const dx = lineEnd.x - lineStart.x;
              const dy = lineEnd.y - lineStart.y;
              const len2 = dx * dx + dy * dy;
              let t = len2 === 0 ? 0 : ((proj.x - lineStart.x) * dx + (proj.y - lineStart.y) * dy) / len2;
              t = Math.max(0, Math.min(1, t));
              const closestPoint = { x: lineStart.x + t * dx, y: lineStart.y + t * dy };
              const dist = distance(proj, closestPoint);

              if (dist < 25) {
                // Calculate push vector (normal to segment)
                const segmentLength = Math.hypot(dx, dy) || 1;
                const normalX = -dy / segmentLength;
                const normalY = dx / segmentLength;
                
                // Check side
                const val = (lineEnd.x - lineStart.x) * (proj.y - lineStart.y) - (lineEnd.y - lineStart.y) * (proj.x - lineStart.x);
                const side = val >= 0 ? 1 : -1;
                
                // Offset vertices away from line to create a beautiful separation gap
                const pushDist = (25 - dist) * 0.7 * side;
                v.x = Number((v.x + normalX * pushDist * scaleFactor).toFixed(2));
                v.y = Number((v.y + normalY * pushDist * scaleFactor).toFixed(2));
              }
            });

            return {
              ...prev,
              [selectedObjectId]: {
                ...prev[selectedObjectId],
                vertices3D: updatedVtx
              }
            };
          });
          historyPush();
          setKnifePath([]);
          return;
        }

        const box = calculateBoundingBox(originalObj.points);
        const p1Points: Point[] = [];
        const p2Points: Point[] = [];
        
        const lineStart = knifePath[0];
        const lineEnd = knifePath[knifePath.length - 1];

        for (const p of originalObj.points) {
          const val = (lineEnd.x - lineStart.x) * (p.y - lineStart.y) - (lineEnd.y - lineStart.y) * (p.x - lineStart.x);
          if (val >= 0) {
            p1Points.push(p);
          } else {
            p2Points.push(p);
          }
        }

        if (p1Points.length > 2 && p2Points.length > 2) {
          const id1 = `obj_${Date.now()}_1`;
          const id2 = `obj_${Date.now()}_2`;

          const piece1: VectorObject = {
            ...originalObj,
            id: id1,
            name: `${originalObj.name}_part_1`,
            points: p1Points,
          };

          const piece2: VectorObject = {
            ...originalObj,
            id: id2,
            name: `${originalObj.name}_part_2`,
            points: p2Points,
          };

          setObjects(prev => {
            const updated = { ...prev };
            delete updated[selectedObjectId];
            updated[id1] = piece1;
            updated[id2] = piece2;
            return updated;
          });

          setSelectedObjectId(id1);
          historyPush();
        }
      }
      setKnifePath([]);
    }

    setElasticWarningId(null);

    if (dragMode === 'vdf-node') {
      if (dragRafRef.current) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      pendingCoordsRef.current = null;
      setDragMode('none');
      setDraggedMeshPointIndex(null);
      historyPush();
      return;
    }

    if (dragMode === 'meshPoint' || dragMode === 'meshGridPoint' || dragMode === 'puppetPin' || dragMode === 'lassoControlPoint' || dragMode === 'smartWarpPin' || dragMode === 'paintColor' || dragMode === 'latticePoint' || dragMode === 'splineHandle' || dragMode === 'extrudeBranchPoint') {
      if (dragMode === 'meshPoint' && selectedObjectId && draggedMeshPointIndex !== null) {
        const obj = objects[selectedObjectId];
        if (obj && obj.type === '3d' && obj.vertices3D && adaptiveSubdivisionEnabled) {
          const updatedVtx = [...obj.vertices3D];
          const P_curr = updatedVtx[draggedMeshPointIndex];
          if (P_curr) {
            const THRESHOLD_3D = 40.0;
            const faces = obj.faces3D || [];
            
            // Find neighbors of dragged vertex
            const neighborIndices = new Set<number>();
            faces.forEach(face => {
              const len = face.indices.length;
              for (let i = 0; i < len; i++) {
                const cur = face.indices[i];
                const next = face.indices[(i + 1) % len];
                if (cur === draggedMeshPointIndex) {
                  neighborIndices.add(next);
                } else if (next === draggedMeshPointIndex) {
                  neighborIndices.add(cur);
                }
              }
            });

            let nextFaces = [...faces];
            let nextVtx = [...updatedVtx];
            let changed = false;

            neighborIndices.forEach(neighIdx => {
              const P_neigh = nextVtx[neighIdx];
              if (P_neigh) {
                const dist = Math.sqrt(
                  Math.pow(P_curr.x - P_neigh.x, 2) +
                  Math.pow(P_curr.y - P_neigh.y, 2) +
                  Math.pow(P_curr.z - P_neigh.z, 2)
                );
                if (dist > THRESHOLD_3D) {
                  const numPoints = Math.min(adaptiveSubdivisionPoints, 2); // strictly max 2 points for 3D deformation as requested
                  const newVtxIndices: number[] = [];
                  for (let k = 1; k <= numPoints; k++) {
                    const t = k / (numPoints + 1);
                    const newV = {
                      x: Number((P_curr.x * (1 - t) + P_neigh.x * t).toFixed(2)),
                      y: Number((P_curr.y * (1 - t) + P_neigh.y * t).toFixed(2)),
                      z: Number((P_curr.z * (1 - t) + P_neigh.z * t).toFixed(2))
                    };
                    newVtxIndices.push(nextVtx.length);
                    nextVtx.push(newV);
                  }

                  // Update all faces containing this split edge
                  nextFaces = nextFaces.map(face => {
                    const indices = face.indices;
                    const len = indices.length;
                    let containsBoth = false;

                    for (let i = 0; i < len; i++) {
                      const cur = indices[i];
                      const next = indices[(i + 1) % len];
                      if (cur === draggedMeshPointIndex && next === neighIdx) {
                        containsBoth = true;
                        break;
                      } else if (cur === neighIdx && next === draggedMeshPointIndex) {
                        containsBoth = true;
                        break;
                      }
                    }

                    if (containsBoth) {
                      const nextIndices: number[] = [];
                      for (let i = 0; i < len; i++) {
                        const cur = indices[i];
                        const next = indices[(i + 1) % len];
                        nextIndices.push(cur);
                        if (cur === draggedMeshPointIndex && next === neighIdx) {
                          nextIndices.push(...newVtxIndices);
                        } else if (cur === neighIdx && next === draggedMeshPointIndex) {
                          nextIndices.push(...[...newVtxIndices].reverse());
                        }
                      }
                      return {
                        ...face,
                        indices: nextIndices
                      };
                    }
                    return face;
                  });
                  changed = true;
                }
              }
            });

            if (changed) {
              setObjects(prev => ({
                ...prev,
                [selectedObjectId]: {
                  ...prev[selectedObjectId],
                  vertices3D: nextVtx,
                  faces3D: nextFaces
                }
              }));
            }
          }
        }
      }

      if ((dragMode === 'meshPoint' || dragMode === 'meshGridPoint') && selectedObjectId && draggedMeshPointIndex !== null) {
        const obj = objects[selectedObjectId];
        if (obj) {
          let updatedCoords = null;
          if (dragMode === 'meshPoint' && obj.type === '3d' && obj.vertices3D) {
            updatedCoords = obj.vertices3D[draggedMeshPointIndex];
          } else if (dragMode === 'meshGridPoint' && obj.meshState && obj.meshState.points) {
            const pt = obj.meshState.points[draggedMeshPointIndex];
            updatedCoords = pt ? { x: pt.currentX, y: pt.currentY } : null;
          } else {
            updatedCoords = obj.points[draggedMeshPointIndex];
          }

          if (updatedCoords && setOriginalDeformPointCoords && setDeformPointTransform) {
            setOriginalDeformPointCoords(updatedCoords);
            setDeformPointTransform({
              x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, rotateX: 0, rotateY: 0, perspective: 0, cameraAngleX: 0, cameraAngleY: 0
            });
          }
        }
      }

      setDragMode('none');
      setDraggedMeshPointIndex(null);
      setExtrudeSubPathIndex(null);
      setDraggedSplineIndex(null);
      setDraggedSplinePart(null);
      setDraggedTwistIndex(null);
      setIsPlayingState(false);
      historyPush();
    }

    if (activeTool === 'BON' && boneStartPoint && boneStartObject) {
      const pList = getAllPivotsWorld();
      const targetPivot = snappedPivot || pList.find(item => item.objId !== boneStartObject.id && distance(currentCursorPos, { x: item.worldX, y: item.worldY }) < 20);

      if (targetPivot) {
        const targetObj = objects[targetPivot.objId];
        const startLocal = worldToLocal(boneStartPoint, boneStartObject.transform, boneStartObject.pivots[0]);
        const endLocal = worldToLocal({ x: targetPivot.worldX, y: targetPivot.worldY }, targetObj.transform, targetObj.pivots[0]);
        const len = distance(boneStartPoint, { x: targetPivot.worldX, y: targetPivot.worldY });

        // Circular checks
        let circularDetected = false;
        let current: VectorObject | null = boneStartObject;
        while (current && current.parentId) {
          if (current.parentId === targetObj.id) {
            circularDetected = true;
            break;
          }
          current = objects[current.parentId];
        }

        if (circularDetected) {
          alert(`Circular dependency detected! Cannot connect bone.`);
        } else {
          const newBone: Bone = {
            id: `bone_${Date.now()}`,
            name: `Bone_${bones.length + 1}`,
            startObjectId: boneStartObject.id,
            endObjectId: targetObj.id,
            startLocalX: startLocal.x,
            startLocalY: startLocal.y,
            endLocalX: endLocal.x,
            endLocalY: endLocal.y,
            lockedDistance: Number(len.toFixed(2)) || 100,
            allowDetach: false,
            minAngle: -180,
            maxAngle: 180,
            enableConstraints: true,
          };

          setBones(prev => [...prev, newBone]);

          setObjects(prev => {
            const updated = { ...prev };
            updated[targetObj.id] = {
              ...updated[targetObj.id],
              parentId: boneStartObject.id,
            };
            if (!updated[boneStartObject.id].childrenIds.includes(targetObj.id)) {
              updated[boneStartObject.id].childrenIds = [...updated[boneStartObject.id].childrenIds, targetObj.id];
            }
            return updated;
          });

          historyPush();
        }
      }

      setBoneStartPoint(null);
      setBoneStartObject(null);
      setBoneStartPivot(null);
      setSnappedPivot(null);
    }

    if (isDrawing3DBone && bone3DStartVtxIdx !== null && selectedObjectId) {
      const obj = objects[selectedObjectId];
      if (obj && obj.type === '3d' && obj.vertices3D && obj.transform3D) {
        // Project all its vertices
        const transformed3D = transform3DVertices(obj.vertices3D, obj.transform3D!.x, obj.transform3D!.y, obj.transform3D!.z, obj.transform3D!.rx, obj.transform3D!.ry, obj.transform3D!.rz, obj.transform3D!.sx, obj.transform3D!.sy, obj.transform3D!.sz);
        const projected = transformed3D.map(v => {
          const proj = project3DVertex(v, 400);
          return localToWorld(proj, obj.transform, obj.pivots[0] || { localX: 0, localY: 0 });
        });

        let releasedVtxIdx = -1;
        let minDist = 20; // pixels
        projected.forEach((pt, idx) => {
          if (idx === bone3DStartVtxIdx) return;
          const d = distance(currentCursorPos, pt);
          if (d < minDist) {
            minDist = d;
            releasedVtxIdx = idx;
          }
        });

        if (releasedVtxIdx !== -1) {
          const newBone3D = {
            id: `bone3d_${Date.now()}`,
            name: `Bone3D_${((obj as any).bones3D || []).length + 1}`,
            rx: 0,
            ry: 0,
            rz: 0,
            startVertexIdx: bone3DStartVtxIdx,
            endVertexIdx: releasedVtxIdx
          };

          setObjects(prev => {
            const updated = { ...prev };
            const existingBones = (updated[selectedObjectId] as any).bones3D || [];
            updated[selectedObjectId] = {
              ...updated[selectedObjectId],
              bones3D: [...existingBones, newBone3D]
            } as any;
            return updated;
          });
          historyPush();
        }
      }
      setIsDrawing3DBone(false);
      setBone3DStartVtxIdx(null);
    }

    setIsPlayingState(false);
    setDragMode('none');
    setDraggedDirectRigBoneId(null);
    strokePointsRef.current = [];
    setStrokePoints([]);
    if (isDrawingLasso && lassoPoints && lassoPoints.length >= 3 && selectedObjectId && objects[selectedObjectId]) {
      const obj = objects[selectedObjectId];
      if (obj.wireframeMode && obj.points && obj.points.length > 0) {
        const pivot = obj.pivots[0] || { localX: 0, localY: 0 };
        const currentSet = new Set(obj.selectedPointIndices || []);
        
        obj.points.forEach((p, idx) => {
          const worldPt = localToWorld(p, obj.transform, pivot);
          if (isPointInPolygon(worldPt, lassoPoints)) {
            currentSet.add(idx);
          }
        });

        setObjects(prev => ({
          ...prev,
          [selectedObjectId]: {
            ...prev[selectedObjectId],
            selectedPointIndices: Array.from(currentSet)
          }
        }));
      }
    }

    setIsDrawingLasso(false);
    } catch (err: any) {
      console.error("Pointer up handler failed:", err);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    // Only zoom on scroll wheel if the Zoom & Pan tool is active
    if (activeTool !== 'ZOM') return;
    
    e.preventDefault();
    
    // Zoom amount depending on deltaY
    const zoomFactor = 1.08;
    const isZoomIn = e.deltaY < 0;
    const currentScale = zoomScale;
    let nextScale = isZoomIn ? currentScale * zoomFactor : currentScale / zoomFactor;
    
    // Clamp scale to limits (0.15 to 10.0)
    nextScale = Math.min(10.0, Math.max(0.15, nextScale));
    
    const canvas = frontCanvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const appScale = (window as any).__appScale || 1;
      const cursorX = (e.clientX - rect.left) / appScale;
      const cursorY = (e.clientY - rect.top) / appScale;
      
      const worldX = (cursorX - zoomOffset.x) / currentScale;
      const worldY = (cursorY - zoomOffset.y) / currentScale;
      
      const nextOffsetX = cursorX - worldX * nextScale;
      const nextOffsetY = cursorY - worldY * nextScale;
      
      setZoomScale(nextScale);
      setZoomOffset({ x: nextOffsetX, y: nextOffsetY });
    }
  };

  const updateObjectProperties = (id: string, updates: Partial<VectorObject>) => {
    try {
      const targetInfo = getActiveTargetObjectInfo(id);
      const targetId = targetInfo ? targetInfo.targetId : id;
      setObjects(prev => {
        if (!prev[targetId]) return prev;
        return {
          ...prev,
          [targetId]: { ...prev[targetId], ...updates }
        };
      });
      if (updateObject) {
        updateObject(targetId, updates);
      }
    } catch (err) {
      console.error("Error updating object properties on active view:", err);
    }
  };

  // Dynamic canvas drawing loop
  useEffect(() => {
    let animId: number;

    animId = requestAnimationFrame(() => {
      const frontCanvas = frontCanvasRef.current;
      if (!frontCanvas) return;
      const ctx = frontCanvas.getContext('2d');
      if (!ctx) return;

    // Clear and Redraw physical viewport with slate workspace background (pasteboard)
    ctx.fillStyle = '#17171a';
    ctx.fillRect(0, 0, frontCanvas.width, frontCanvas.height);

    // Apply viewport zoom and pan offset transformation
    ctx.save();
    ctx.translate(zoomOffset.x, zoomOffset.y);
    ctx.scale(zoomScale, zoomScale);

    // DRAW ARTBOARD (The active drawing and vector canvas sheet)
    const artboardX = 0;
    const artboardY = 0;

    // Fill white page area representing the active animation stage
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(artboardX, artboardY, artboardW, artboardH);

    if (!isRecording && !isPlaying) {
      // Draw active artboard boundaries (Border lines showing canvas start/end)
      ctx.strokeStyle = '#f59e0b'; // Prominent Amber outline indicating the exact canvas boundary
      ctx.lineWidth = 3;
      ctx.strokeRect(artboardX, artboardY, artboardW, artboardH);



      // Add visual crosshair corner marks to assist precision drawing alignment
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      // Top-Left Cross
      ctx.beginPath();
      ctx.moveTo(artboardX - 12, artboardY); ctx.lineTo(artboardX + 24, artboardY);
      ctx.moveTo(artboardX, artboardY - 12); ctx.lineTo(artboardX, artboardY + 24);
      ctx.stroke();

      // Bottom-Right Cross
      ctx.beginPath();
      ctx.moveTo(artboardX + artboardW - 24, artboardY + artboardH); ctx.lineTo(artboardX + artboardW + 12, artboardY + artboardH);
      ctx.moveTo(artboardX + artboardW, artboardY + artboardH - 24); ctx.lineTo(artboardX + artboardW, artboardY + artboardH + 12);
      ctx.stroke();
    }

    // STRICT ARTBOARD CLIPPING - Prevents any artwork, deform, or other elements from leaking outside the canvas boundaries
    ctx.save();
    ctx.beginPath();
    ctx.rect(artboardX, artboardY, artboardW, artboardH);
    ctx.clip();

    // Pre-build layer maps for O(1) lookup during sorting and rendering
    const layerZMap = new Map<string, number>();
    const layerMap = new Map<string, Layer>();
    if (layers) {
      for (let i = 0; i < layers.length; i++) {
        const l = layers[i];
        layerZMap.set(l.id, l.zIndex ?? 0);
        layerMap.set(l.id, l);
      }
    }
    
    // Sort all objects based on their layers zIndex, and then by their own zIndex
    const sortedObjects = Object.values(objects).sort((a, b) => {
      const zA = a.layerId ? (layerZMap.get(a.layerId) ?? 0) : 0;
      const zB = b.layerId ? (layerZMap.get(b.layerId) ?? 0) : 0;
      if (zA !== zB) {
        return zA - zB;
      }
      return (a.zIndex ?? 0) - (b.zIndex ?? 0);
    });

    // Calculate viewport boundaries for fast bounding-box culling (skip off-screen objects)
    const viewportMinX = (0 - zoomOffset.x) / zoomScale;
    const viewportMinY = (0 - zoomOffset.y) / zoomScale;
    const viewportMaxX = (frontCanvas.width - zoomOffset.x) / zoomScale;
    const viewportMaxY = (frontCanvas.height - zoomOffset.y) / zoomScale;

    // Expand cull boundaries by 150px safety padding
    const cullMinX = viewportMinX - 150;
    const cullMinY = viewportMinY - 150;
    const cullMaxX = viewportMaxX + 150;
    const cullMaxY = viewportMaxY + 150;

    // Draw active layer drawings in sorted order
    sortedObjects.forEach((obj) => {
      try {
        const isDraftView = is360WizardActive && draft360Views.some(v => v.drawingId === obj.id);
        if (obj.isHidden && (!isDraftView || !onionSkinEnabled360)) return;

        if ((obj as any).associatedViewId) {
          let assocContainer: VectorObject | null = null;
          if ((obj as any).container360Id && objects[(obj as any).container360Id]) {
            assocContainer = objects[(obj as any).container360Id];
          } else {
            assocContainer = Object.values(objects).find(o => o.type === '360_container' && o.views360?.some(v => v.drawingId === (obj as any).associatedViewId)) || null;
          }
          if (assocContainer && assocContainer.views360) {
            const currentActiveView = findClosestView360(assocContainer.views360, assocContainer.currentAngle360 ?? 0);
            if (currentActiveView && currentActiveView.drawingId !== (obj as any).associatedViewId) {
              return; // Skip rendering if this part belongs to a non-active 360 view
            }
          }
        }
      
        const effLayerId = obj.layerId || (layers && layers[0] ? layers[0].id : 'layer_1');
      const layer = layerMap.get(effLayerId);
      if (layer && (layer.visible === false || (layer as any).isHidden || layer.opacity === 0)) return; // Skip if layer is hidden or opacity 0

      let drawObj = resolve360Object(obj, objects);

      // Fast Viewport Culling: Skip rendering objects completely outside the active viewport
      const t = drawObj.transform || { x: 0, y: 0, scaleX: 1, scaleY: 1 };
      const objX = t.x;
      const objY = t.y;
      let minX = objX, maxX = objX, minY = objY, maxY = objY;

      if (drawObj.type === '3d' && drawObj.vertices3D && drawObj.vertices3D.length > 0) {
        const rad = 600 * Math.max(Math.abs(t.scaleX || 1), Math.abs(t.scaleY || 1));
        minX = objX - rad; maxX = objX + rad;
        minY = objY - rad; maxY = objY + rad;
      } else if (drawObj.points && drawObj.points.length > 0) {
        const pts = drawObj.points;
        let lMinX = pts[0].x, lMaxX = pts[0].x, lMinY = pts[0].y, lMaxY = pts[0].y;
        const step = pts.length > 20 ? Math.floor(pts.length / 10) : 1;
        for (let pIdx = 0; pIdx < pts.length; pIdx += step) {
          const px = pts[pIdx].x, py = pts[pIdx].y;
          if (px < lMinX) lMinX = px;
          if (px > lMaxX) lMaxX = px;
          if (py < lMinY) lMinY = py;
          if (py > lMaxY) lMaxY = py;
        }
        const sx = Math.abs(t.scaleX ?? 1);
        const sy = Math.abs(t.scaleY ?? 1);
        const pad = 80;
        minX = objX + lMinX * sx - pad;
        maxX = objX + lMaxX * sx + pad;
        minY = objY + lMinY * sy - pad;
        maxY = objY + lMaxY * sy + pad;
      } else {
        minX = objX - 400; maxX = objX + 400;
        minY = objY - 400; maxY = objY + 400;
      }

      const isObjSelected = selectedObjectId === obj.id || (obj as any).isSelected;
      if (!isObjSelected && (maxX < cullMinX || minX > cullMaxX || maxY < cullMinY || minY > cullMaxY)) {
        return; // CULLED! Instantly skip off-screen objects
      }

      const hasLassoDeform = !!(drawObj.lassoDeformState && drawObj.lassoDeformState.active && drawObj.lassoDeformState.lassoPoints && drawObj.lassoDeformState.lassoPoints.length >= 3);
      const localPivot = drawObj.pivots[0] || { localX: 0, localY: 0 };
      const polygon = drawObj.lassoDeformState?.lassoPoints || [];
      
      let lassoCenter = { localX: 0, localY: 0 };
      if (polygon.length > 0) {
        let sumX = 0;
        let sumY = 0;
        polygon.forEach(pt => {
          sumX += pt.x;
          sumY += pt.y;
        });
        lassoCenter = { localX: sumX / polygon.length, localY: sumY / polygon.length };
      }

      ctx.save();

      // Apply Toon Boom 3D Multiplane Depth transform if layer depth is set
      const layerDepth = layer?.depth ?? 0;
      if (layerDepth !== 0) {
        const focalLength = 500;
        const depthScale = focalLength / Math.max(50, focalLength - layerDepth);
        const centerX = artboardW / 2;
        const centerY = artboardH / 2;
        ctx.translate(centerX, centerY);
        ctx.scale(depthScale, depthScale);
        ctx.translate(-centerX, -centerY);
      }

      // Apply non-destructive inverse clipping for hidden lasso regions (making the lassoed area's opacity exactly 0)
      if (drawObj.hiddenLassoRegions && drawObj.hiddenLassoRegions.length > 0) {
        const pivotForClip = drawObj.pivots?.[0] || { localX: 0, localY: 0 };
        drawObj.hiddenLassoRegions.forEach(region => {
          ctx.beginPath();
          // Draw giant rectangle covering the entire artboard space
          ctx.rect(-20000, -20000, 40000, 40000);
          // Draw the local lasso polygon converted to world coordinates
          const worldLassoPoints = region.localLassoPoints.map(p => localToWorld(p, drawObj.transform, pivotForClip));
          if (worldLassoPoints.length > 0) {
            ctx.moveTo(worldLassoPoints[0].x, worldLassoPoints[0].y);
            for (let i = 1; i < worldLassoPoints.length; i++) {
              ctx.lineTo(worldLassoPoints[i].x, worldLassoPoints[i].y);
            }
            ctx.closePath();
          }
          ctx.clip('evenodd');
        });
      }

      // Apply non-destructive keep-only clipping for separated lasso regions (only rendering area inside lasso)
      if (drawObj.keepOnlyLassoRegions && drawObj.keepOnlyLassoRegions.length > 0) {
        const pivotForClip = drawObj.pivots?.[0] || { localX: 0, localY: 0 };
        ctx.beginPath();
        drawObj.keepOnlyLassoRegions.forEach((region, regionIdx) => {
          const worldLassoPoints = region.localLassoPoints.map(p => localToWorld(p, drawObj.transform, pivotForClip));
          if (worldLassoPoints.length > 0) {
            if (regionIdx === 0) {
              ctx.moveTo(worldLassoPoints[0].x, worldLassoPoints[0].y);
            } else {
              ctx.moveTo(worldLassoPoints[0].x, worldLassoPoints[0].y);
            }
            for (let i = 1; i < worldLassoPoints.length; i++) {
              ctx.lineTo(worldLassoPoints[i].x, worldLassoPoints[i].y);
            }
            ctx.closePath();
          }
        });
        ctx.clip();
      }

      // Check if object actually has any active deformation before calling deformLocalPoint
      const isDeformed = !!(
        (drawObj.lassoControlPoints && drawObj.lassoControlPoints.length > 0) ||
        (drawObj.lassoDeformState && drawObj.lassoDeformState.active) ||
        (drawObj.cageState && drawObj.cageState.active) ||
        (drawObj.meshState && drawObj.meshState.active) ||
        (drawObj.splineActive && drawObj.splineControlPoints && drawObj.splineControlPoints.length > 0) ||
        (drawObj.pins && drawObj.pins.length > 0) ||
        (drawObj.smartWarp && drawObj.smartWarp.pins && drawObj.smartWarp.pins.length > 0) ||
        (drawObj.curvePathState && drawObj.curvePathState.active) ||
        (drawObj.flexCurveState && drawObj.flexCurveState.active)
      );

      // Calculate local points (bypass deformLocalPoint if object has no deformations)
      const localPoints = isDeformed
        ? drawObj.points.map((p, idx) => deformLocalPoint(p, drawObj, idx))
        : drawObj.points;

      // Get pivot and project points to world space
      const pivot = drawObj.pivots[0] || { localX: 0, localY: 0 };
      const worldPoints = localPoints.map(p => localToWorld(p, drawObj.transform, pivot));

      // Draw all paths (main points + subPaths of merged drawings)
      const drawAllPaths = (forceClosePaths: boolean = false) => {
        ctx.beginPath();
        if (worldPoints.length > 0) {
          let penDown = false;
          for (let i = 0; i < worldPoints.length; i++) {
            const isHidden = drawObj.hiddenPoints?.includes(i);
            const isGap = localPoints[i]?.gap;
            if (isHidden) {
              penDown = false;
            } else if (isGap) {
              ctx.moveTo(worldPoints[i].x, worldPoints[i].y);
              penDown = true;
            } else {
              if (!penDown) {
                ctx.moveTo(worldPoints[i].x, worldPoints[i].y);
                penDown = true;
              } else {
                ctx.lineTo(worldPoints[i].x, worldPoints[i].y);
              }
            }
          }
          if (forceClosePaths && (drawObj.fillGaps || drawObj.autoFillGaps)) {
            ctx.closePath();
          }
        }
        if (drawObj.subPaths && drawObj.subPaths.length > 0) {
          drawObj.subPaths.forEach((sub, subIdx) => {
            const localSubPoints = sub.map((p, idx) => deformLocalPoint(p, drawObj, idx, subIdx));
            const worldSubPoints = localSubPoints.map(p => localToWorld(p, drawObj.transform, pivot));
            if (worldSubPoints.length > 0) {
              let penDown = false;
              const hiddenSubIndices = drawObj.hiddenSubPaths?.[subIdx] || [];
              for (let i = 0; i < worldSubPoints.length; i++) {
                const isHidden = hiddenSubIndices.includes(i);
                const isGap = localSubPoints[i]?.gap;
                if (isHidden) {
                  penDown = false;
                } else if (isGap) {
                  ctx.moveTo(worldSubPoints[i].x, worldSubPoints[i].y);
                  penDown = true;
                } else {
                  if (!penDown) {
                    ctx.moveTo(worldSubPoints[i].x, worldSubPoints[i].y);
                    penDown = true;
                  } else {
                    ctx.lineTo(worldSubPoints[i].x, worldSubPoints[i].y);
                  }
                }
              }
              if (forceClosePaths && (drawObj.fillGaps || drawObj.autoFillGaps)) {
                ctx.closePath();
              }
            }
          });
        }
      };

      // Apply filter effects (depth blur, opacity)
      let combinedAlpha = drawObj.opacity !== undefined ? drawObj.opacity : 1;
      if (obj.isHidden && isDraftView) {
        combinedAlpha *= 0.25; // ghost onion skin!
      }
      if (layer) {
        combinedAlpha *= layer.opacity !== undefined ? layer.opacity : 1;
      }
      
      // Combine layer blur amount and per-object blur value
      let totalBlur = 0;
      if (layer && (layer as any).blurAmount && (layer as any).blurAmount > 0) {
        totalBlur += (layer as any).blurAmount;
      }
      if (drawObj.blur && drawObj.blur > 0) {
        totalBlur += drawObj.blur;
      }

      if (totalBlur > 0) {
        ctx.filter = `blur(${totalBlur}px)`;
      } else {
        ctx.filter = 'none';
      }
      ctx.globalAlpha = combinedAlpha;

      // 1. Drop Shadow Effect
      if (drawObj.shadow && drawObj.shadow.enabled) {
        ctx.shadowColor = drawObj.shadow.color || 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = drawObj.shadow.blur ?? 10;
        ctx.shadowOffsetX = drawObj.shadow.offsetX ?? 5;
        ctx.shadowOffsetY = drawObj.shadow.offsetY ?? 5;
      } else {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }

      // Draw vector paths, 3D proxy or image
      if (drawObj.type === '3d' && drawObj.vertices3D && drawObj.faces3D && drawObj.transform3D) {
        // Apply bone-based rigging deformation only if bones are present
        const bones3D = (drawObj as any).bones3D;
        const skinnedVertices = (bones3D && bones3D.length > 0)
          ? deformVertices3D(drawObj.vertices3D, bones3D)
          : drawObj.vertices3D;
        
        const transformed3D = transform3DVertices(skinnedVertices, drawObj.transform3D!.x, drawObj.transform3D!.y, drawObj.transform3D!.z, drawObj.transform3D!.rx, drawObj.transform3D!.ry, drawObj.transform3D!.rz, drawObj.transform3D!.sx, drawObj.transform3D!.sy, drawObj.transform3D!.sz);
        const projected = transformed3D.map(v => {
          const proj = project3DVertex(v, 400);
          return localToWorld(proj, drawObj.transform, drawObj.pivots[0] || { localX: 0, localY: 0 });
        });

        const facesWithDepth = drawObj.faces3D.map((face, index) => {
          let sumZ = 0;
          face.indices.forEach(idx => {
            if (transformed3D[idx]) {
              sumZ += transformed3D[idx].z;
            }
          });
          const avgZ = sumZ / face.indices.length;
          return {
            face,
            avgZ,
            index
          };
        });

        facesWithDepth.sort((a, b) => b.avgZ - a.avgZ);

        // Build unique edges list for rendering and highlight tracking
        const edgesList: [number, number][] = [];
        const edgeSet = new Set<string>();
        drawObj.faces3D.forEach(face => {
          const len = face.indices.length;
          for (let i = 0; i < len; i++) {
            const v0 = face.indices[i];
            const v1 = face.indices[(i + 1) % len];
            const min = Math.min(v0, v1);
            const max = Math.max(v0, v1);
            const key = `${min}_${max}`;
            if (!edgeSet.has(key)) {
              edgeSet.add(key);
              edgesList.push([min, max]);
            }
          }
        });

        facesWithDepth.forEach(({ face, index }) => {
          if (face.indices.length < 3) return;
          
          ctx.beginPath();
          if (projected[face.indices[0]]) {
            ctx.moveTo(projected[face.indices[0]].x, projected[face.indices[0]].y);
          }
          for (let i = 1; i < face.indices.length; i++) {
            const idx = face.indices[i];
            if (projected[idx]) {
              ctx.lineTo(projected[idx].x, projected[idx].y);
            }
          }
          ctx.closePath();

          const v0 = transformed3D[face.indices[0]] || { x: 0, y: 0, z: 0 };
          const v1 = transformed3D[face.indices[1]] || { x: 0, y: 0, z: 0 };
          const v2 = transformed3D[face.indices[2]] || { x: 0, y: 0, z: 0 };
          
          // Use dynamic real-time fillColor or fall back to pre-defined face baseColor
          const rawBaseColor = (drawObj.fillColor && drawObj.fillColor !== 'transparent') ? drawObj.fillColor : (face.baseColor || '#8D6E63');
          const litColor = getFaceLightColor(v0, v1, v2, rawBaseColor, 45);

          ctx.fillStyle = litColor;
          ctx.fill();

          ctx.lineWidth = drawObj.strokeWidth || 1.2;
          ctx.strokeStyle = drawObj.strokeColor || 'rgba(0,0,0,0.2)';
          if (!drawObj.hide3DGrid) {
            ctx.stroke();
          }

          // Golden face highlight overlay
          if (drawObj.selectedFaceIndex === index) {
            ctx.lineWidth = 3.0;
            ctx.strokeStyle = '#F59E0B'; // Bright Amber/Gold
            ctx.stroke();
          }
        });

        // Project and Draw 3D subpaths (like eyes/mouth detail strokes on the face)
        if (drawObj.subPaths3D && drawObj.subPaths3D.length > 0) {
          drawObj.subPaths3D.forEach((sub, subIdx) => {
            // Apply bone-based rigging deformation to the sub-path vertices
            const skinnedSub = deformVertices3D(sub, (drawObj as any).bones3D || []);
            const transformedSub = transform3DVertices(skinnedSub, drawObj.transform3D!.x, drawObj.transform3D!.y, drawObj.transform3D!.z, drawObj.transform3D!.rx, drawObj.transform3D!.ry, drawObj.transform3D!.rz, drawObj.transform3D!.sx, drawObj.transform3D!.sy, drawObj.transform3D!.sz);
            const projectedSub = transformedSub.map(v => {
              const proj = project3DVertex(v, 400);
              return localToWorld(proj, drawObj.transform, drawObj.pivots[0] || { localX: 0, localY: 0 });
            });

            if (projectedSub.length > 0) {
              ctx.beginPath();
              ctx.moveTo(projectedSub[0].x, projectedSub[0].y);
              for (let i = 1; i < projectedSub.length; i++) {
                ctx.lineTo(projectedSub[i].x, projectedSub[i].y);
              }
              
              const subFillColor = drawObj.subPathFills?.[subIdx];
              if (subFillColor && subFillColor !== 'transparent') {
                ctx.closePath();
                ctx.fillStyle = subFillColor;
                ctx.fill('evenodd');
              }

              ctx.lineWidth = (drawObj.strokeWidth || 1.2) * (drawObj.transform3D?.sx || 1.0);
              ctx.strokeStyle = drawObj.strokeColor || '#000000';
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.stroke();
            }
          });
        }

        // Golden edge highlight overlay
        if (drawObj.selectedEdgeIndex !== undefined && drawObj.selectedEdgeIndex >= 0 && drawObj.selectedEdgeIndex < edgesList.length) {
          const [v0Idx, v1Idx] = edgesList[drawObj.selectedEdgeIndex];
          const p0 = projected[v0Idx];
          const p1 = projected[v1Idx];
          if (p0 && p1) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.lineWidth = 4.0;
            ctx.strokeStyle = '#F59E0B'; // Glowing Gold
            ctx.shadowColor = '#F59E0B';
            ctx.shadowBlur = 4;
            ctx.stroke();
            ctx.restore();
          }
        }

        // Draw lasso fills for 3D model!
        if (drawObj.lassoFills && drawObj.lassoFills.length > 0) {
          drawObj.lassoFills.forEach(fill => {
            ctx.save();
            
            // Clip 1: Only draw inside the faces of the 3D drawing
            ctx.beginPath();
            facesWithDepth.forEach(({ face }) => {
              if (face.indices.length < 3) return;
              if (projected[face.indices[0]]) {
                ctx.moveTo(projected[face.indices[0]].x, projected[face.indices[0]].y);
              }
              for (let i = 1; i < face.indices.length; i++) {
                const idx = face.indices[i];
                if (projected[idx]) {
                  ctx.lineTo(projected[idx].x, projected[idx].y);
                }
              }
              ctx.closePath();
            });
            ctx.clip();
            
            // Clip 2: Only draw inside the lasso selection path
            ctx.beginPath();
            const localPivot = drawObj.pivots[0] || { localX: 0, localY: 0 };
            const worldLassoPoints = getWorldLassoPointsForObject(fill, drawObj, localPivot);
            if (worldLassoPoints.length > 0) {
              ctx.moveTo(worldLassoPoints[0].x, worldLassoPoints[0].y);
              for (let i = 1; i < worldLassoPoints.length; i++) {
                ctx.lineTo(worldLassoPoints[i].x, worldLassoPoints[i].y);
              }
              ctx.closePath();
            }
            ctx.clip();
            
            // Fill the clipped region with the lasso color
            ctx.fillStyle = fill.color;
            ctx.fillRect(artboardX - 100, artboardY - 100, artboardW + 200, artboardH + 200);
            ctx.restore();
          });
        }

        // Render Rigged Skeletal Bones on top of selected 3D Model
        if (effectiveSelectedObjectId === drawObj.id && (drawObj as any).bones3D && (drawObj as any).bones3D.length > 0) {
          ctx.save();
          (drawObj as any).bones3D.forEach((bone: any) => {
            const startP = projected[bone.startVertexIdx];
            const endP = projected[bone.endVertexIdx];
            if (!startP || !endP) return;

            // Draw bone link
            ctx.beginPath();
            ctx.moveTo(startP.x, startP.y);
            ctx.lineTo(endP.x, endP.y);
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#22C55E'; // green-500
            ctx.shadowColor = '#22C55E';
            ctx.shadowBlur = 6;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Inner connector bone line
            ctx.beginPath();
            ctx.moveTo(startP.x, startP.y);
            ctx.lineTo(endP.x, endP.y);
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#FFFFFF';
            ctx.stroke();

            // Draw Joint handles
            ctx.beginPath();
            ctx.arc(startP.x, startP.y, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#EAB308'; // yellow-500
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1.5;
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(endP.x, endP.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#22C55E'; // green-500
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1.5;
            ctx.fill();
            ctx.stroke();
          });
          ctx.restore();
        }

        // Draw vertex handles for deforming/cutting/bone adding in MSH/BON tools
        if (effectiveSelectedObjectId === drawObj.id && (activeTool === 'MSH' || activeTool === 'BON')) {
          ctx.save();
          projected.forEach((p, idx) => {
            const isSelected = selectedDeformPointIndex === idx && selectedDeformPointType === '3d';
            ctx.beginPath();
            ctx.arc(p.x, p.y, (idx === draggedMeshPointIndex || isSelected) ? 7 : 4, 0, Math.PI * 2);
            ctx.fillStyle = (idx === draggedMeshPointIndex || isSelected) ? '#F59E0B' : '#3B82F6';
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1;
            ctx.fill();
            ctx.stroke();
          });
          ctx.restore();
        }

        // Draw active drawing bone guide if isDrawing3DBone is true
        if (isDrawing3DBone && bone3DStartVtxIdx !== null && effectiveSelectedObjectId === drawObj.id) {
          const startP = projected[bone3DStartVtxIdx];
          if (startP) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(startP.x, startP.y);
            ctx.lineTo(currentCursorPos.x, currentCursorPos.y);
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = '#F59E0B';
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.restore();
          }
        }

        ctx.restore();
        return;
      }

      // Draw vector paths or image
      if (drawObj.type === 'image' && drawObj.imageUrl) {
        if (drawObj.transform3D?.enabled) {
          Renderer3D.render(drawObj, ctx);
          ctx.restore();
          return;
        }
        // Render image
        let img = imagesCacheRef.current[drawObj.imageUrl];
        if (!img) {
          img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = drawObj.imageUrl;
          img.onload = () => {
            imagesCacheRef.current[drawObj.imageUrl!] = img;
            setForceRender(n => n + 1);
          };
          imagesCacheRef.current[drawObj.imageUrl] = img;
        }
        
        if (img.complete && img.naturalWidth > 0) {
          const localPivot = drawObj.pivots[0] || { localX: 0, localY: 0 };
          const imgBounds = calculateBoundingBox(drawObj.points);
          
          const hasLassoDeformImage = !!(drawObj.lassoDeformState && drawObj.lassoDeformState.active && drawObj.lassoDeformState.lassoPoints && drawObj.lassoDeformState.lassoPoints.length >= 3);
          const hasMeshState = drawObj.meshState && drawObj.meshState.active;
          const hasPuppetPins = drawObj.pins && drawObj.pins.length > 0;
          const hasCageState = !!(drawObj.cageState && drawObj.cageState.active && drawObj.cageState.points && drawObj.cageState.points.length > 0);
          const hasSmartWarp = !!(drawObj.smartWarp && drawObj.smartWarp.pins && drawObj.smartWarp.pins.length > 0);
          const hasLcp = !!(drawObj.lassoControlPoints && drawObj.lassoControlPoints.length > 0);
          const hasVdf = !!(drawObj.customVectorDeformState && drawObj.customVectorDeformState.active && drawObj.customVectorDeformState.nodes && drawObj.customVectorDeformState.nodes.length > 0);
          const hasFlexCurve = !!(drawObj.flexCurveState && drawObj.flexCurveState.active);
          const hasCurvePath = !!(drawObj.curvePathState && drawObj.curvePathState.active);
          
          if (hasLassoDeformImage || hasMeshState || hasPuppetPins || hasCageState || hasSmartWarp || hasLcp || hasVdf || hasFlexCurve || hasCurvePath) {
            // Draw textured mesh deformation with high-density grid for deep pixel-level control!
            const COLS = 40;
            const ROWS = 40;
            
            const vertices: Point[][] = [];
            const worldVertices: Point[][] = [];

            for (let r = 0; r <= ROWS; r++) {
              vertices[r] = [];
              worldVertices[r] = [];
              const ty = r / ROWS;
              const py = imgBounds.y + ty * imgBounds.height;

              for (let c = 0; c <= COLS; c++) {
                const tx = c / COLS;
                const px = imgBounds.x + tx * imgBounds.width;
                const p = { x: px, y: py };
                
                const dp = deformImagePoint(p, drawObj, imgBounds);
                
                vertices[r][c] = dp;
                // Project local deformed point to world space
                const wp = localToWorld(dp, drawObj.transform, localPivot);
                worldVertices[r][c] = wp;
              }
            }

            // Render each grid cell as 2 textured triangles
            for (let r = 0; r < ROWS; r++) {
              for (let c = 0; c < COLS; c++) {
                // Local fraction coords
                const tx0 = c / COLS;
                const tx1 = (c + 1) / COLS;
                const ty0 = r / ROWS;
                const ty1 = (r + 1) / ROWS;

                // Source UV coordinates on image
                const u0 = tx0 * img.naturalWidth;
                const u1 = tx1 * img.naturalWidth;
                const v0 = ty0 * img.naturalHeight;
                const v1 = ty1 * img.naturalHeight;

                // Destination World coords
                const d_tl = worldVertices[r][c];       // top-left
                const d_tr = worldVertices[r][c + 1];   // top-right
                const d_bl = worldVertices[r + 1][c];   // bottom-left
                const d_br = worldVertices[r + 1][c + 1]; // bottom-right

                // Triangle 1: top-left, top-right, bottom-left
                drawTexturedTriangle(
                  ctx,
                  img,
                  u0, v0,
                  u1, v0,
                  u0, v1,
                  d_tl.x, d_tl.y,
                  d_tr.x, d_tr.y,
                  d_bl.x, d_bl.y
                );

                // Triangle 2: top-right, bottom-right, bottom-left
                drawTexturedTriangle(
                  ctx,
                  img,
                  u1, v0,
                  u1, v1,
                  u0, v1,
                  d_tr.x, d_tr.y,
                  d_br.x, d_br.y,
                  d_bl.x, d_bl.y
                );
              }
            }
          } else {
            ctx.save();
            // Aligned Transformation Matrix matching localToWorld order perfectly!
            ctx.translate(drawObj.transform.x + localPivot.localX, drawObj.transform.y + localPivot.localY);
            
            // 2D Rotation around Pivot
            ctx.rotate((drawObj.transform.rotation * Math.PI) / 180);
            
            // 3D simulated rotation or standard Skew
            const skewX = drawObj.transform.skewX || 0;
            const skewY = drawObj.transform.skewY || 0;
            if (skewX !== 0 || skewY !== 0) {
              ctx.transform(1, Math.tan((skewY * Math.PI) / 180), Math.tan((skewX * Math.PI) / 180), 1, 0, 0);
            }
            
            // 3D rotation flips
            const rotateX = drawObj.transform.rotateX || 0;
            const rotateY = drawObj.transform.rotateY || 0;
            const cosRotX = Math.cos((rotateX * Math.PI) / 180);
            const cosRotY = Math.cos((rotateY * Math.PI) / 180);
            
            // Apply Scale (with 3D perspective / flip reduction factors matching localToWorld)
            ctx.scale(drawObj.transform.scaleX * cosRotY, drawObj.transform.scaleY * cosRotX);
            
            // Offset back to local coordinates
            ctx.translate(-localPivot.localX, -localPivot.localY);
            
            ctx.drawImage(img, imgBounds.x, imgBounds.y, imgBounds.width, imgBounds.height);
            ctx.restore();
          }
        }
      } else if (drawObj.transform3D?.enabled) {
        // Render 2D extruded 3D drawing
        Renderer3D.render(drawObj, ctx);
      } else {
        // Render vector drawing
        const isStartEndClosed2D = worldPoints.length >= 3 && Math.hypot(worldPoints[worldPoints.length - 1].x - worldPoints[0].x, worldPoints[worldPoints.length - 1].y - worldPoints[0].y) < 15;
        const hasExplicitFillColor = !!(drawObj.fillColor && drawObj.fillColor !== 'transparent');
        const shouldFill2D = (drawObj.autoFillInnerRegion && hasExplicitFillColor) || drawObj.type === 'shape' || hasExplicitFillColor || (isStartEndClosed2D && hasExplicitFillColor);
        const active2DFillColor = hasExplicitFillColor ? drawObj.fillColor! : (drawObj.strokeColor || '#F59E0B');

        if (shouldFill2D) {
          ctx.save();
          const subPathsToUse = (drawObj.subPaths && drawObj.subPaths.length > 0) ? drawObj.subPaths : extractAllSubPaths(drawObj);
          if (subPathsToUse && subPathsToUse.length > 0) {
            subPathsToUse.forEach((sub, subIdx) => {
              const localSubPoints = sub.map((p, idx) => deformLocalPoint(p, drawObj, idx, subIdx));
              const worldSubPoints = localSubPoints.map(p => localToWorld(p, drawObj.transform, pivot));
              if (worldSubPoints.length >= 3) {
                ctx.beginPath();
                ctx.moveTo(worldSubPoints[0].x, worldSubPoints[0].y);
                for (let i = 1; i < worldSubPoints.length; i++) {
                  ctx.lineTo(worldSubPoints[i].x, worldSubPoints[i].y);
                }
                ctx.closePath();
                const subColor = drawObj.subPathFills?.[subIdx] || active2DFillColor;
                if (subColor && subColor !== 'transparent') {
                  ctx.fillStyle = subColor;
                  ctx.fill('evenodd');
                }
              }
            });
          } else {
            drawAllPaths(true);
            ctx.fillStyle = active2DFillColor;
            ctx.fill('evenodd');
          }

          // Dilation bleed ONLY when autoFillGaps/fillGaps/autoFillInnerRegion is explicitly active
          const expansion = drawObj.gapFillExpansion ?? ((drawObj.autoFillGaps || drawObj.fillGaps || drawObj.autoFillInnerRegion) ? 4 : 0);
          if (expansion > 0) {
            ctx.strokeStyle = active2DFillColor;
            ctx.lineWidth = expansion * 2;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.stroke();
          }
          ctx.restore();
        }

        // Render individual sub-path custom fills if present (when shouldFill2D is false)
        if (!shouldFill2D && drawObj.subPathFills && Object.keys(drawObj.subPathFills).length > 0) {
          ctx.save();
          const subPathsToUse = (drawObj.subPaths && drawObj.subPaths.length > 0) ? drawObj.subPaths : extractAllSubPaths(drawObj);
          Object.entries(drawObj.subPathFills).forEach(([subIdxStr, subColor]) => {
            const subIdx = parseInt(subIdxStr, 10);
            const sub = subPathsToUse?.[subIdx];
            if (sub && sub.length >= 3 && subColor && subColor !== 'transparent') {
              const localSubPoints = sub.map((p, idx) => deformLocalPoint(p, drawObj, idx, subIdx));
              const worldSubPoints = localSubPoints.map(p => localToWorld(p, drawObj.transform, pivot));
              if (worldSubPoints.length >= 3) {
                ctx.beginPath();
                ctx.moveTo(worldSubPoints[0].x, worldSubPoints[0].y);
                for (let i = 1; i < worldSubPoints.length; i++) {
                  ctx.lineTo(worldSubPoints[i].x, worldSubPoints[i].y);
                }
                ctx.closePath();
                ctx.fillStyle = subColor;
                ctx.fill('evenodd');
              }
            }
          });
          ctx.restore();
        }

        // Render Lasso Fills BEFORE strokes so drawing strokes remain crisp on top!
        if (drawObj.lassoFills && drawObj.lassoFills.length > 0) {
          drawObj.lassoFills.forEach(fill => {
            ctx.save();
            drawAllPaths(true);
            if (drawObj.autoFillGaps || drawObj.fillGaps || (drawObj.gapFillExpansion && drawObj.gapFillExpansion > 0)) {
              const exp = drawObj.gapFillExpansion ?? 4;
              ctx.strokeStyle = fill.color;
              ctx.lineWidth = exp * 2;
              ctx.lineJoin = 'round';
              ctx.lineCap = 'round';
              ctx.stroke();
            }
            ctx.clip('evenodd');
            
            ctx.beginPath();
            const localPivot = drawObj.pivots[0] || { localX: 0, localY: 0 };
            const worldLassoPoints = getWorldLassoPointsForObject(fill, drawObj, localPivot);
            if (worldLassoPoints.length > 0) {
              ctx.moveTo(worldLassoPoints[0].x, worldLassoPoints[0].y);
              for (let i = 1; i < worldLassoPoints.length; i++) {
                ctx.lineTo(worldLassoPoints[i].x, worldLassoPoints[i].y);
              }
              ctx.closePath();
              ctx.fillStyle = fill.color;
              ctx.fill();
            }

            const fillExp = drawObj.gapFillExpansion ?? (drawObj.autoFillGaps || drawObj.fillGaps ? 4 : 2);
            if (fillExp > 0) {
              ctx.strokeStyle = fill.color;
              ctx.lineWidth = fillExp * 2;
              ctx.lineJoin = 'round';
              ctx.lineCap = 'round';
              ctx.stroke();
            }
            ctx.restore();
          });
        }

        if (drawObj.type === 'stroke') {
          const strokeBrush: Partial<BrushSettings> = {
            brushType: drawObj.brushType as any ?? 'solid',
            strokeWidth: drawObj.strokeWidth,
            strokeOpacity: drawObj.strokeOpacity ?? 1.0,
            hardness: drawObj.hardness ?? 0.8,
            blur: (drawObj.blur ?? 0) + ((layer as any)?.blurAmount ?? 0),
            shadowEnabled: drawObj.shadowEnabled ?? false,
            shadowColor: drawObj.shadowColor ?? '#000000',
            shadowBlur: drawObj.shadowBlur ?? 4,
            shadowOffsetX: drawObj.shadowOffsetX ?? 2,
            shadowOffsetY: drawObj.shadowOffsetY ?? 2,
          };

          if (drawObj.subPaths && drawObj.subPaths.length > 0) {
            drawObj.subPaths.forEach((sub, subIdx) => {
              const localSubPoints = sub.map((p, idx) => deformLocalPoint(p, drawObj, idx, subIdx));
              const worldSubPoints = localSubPoints.map((p) => {
                const wp = localToWorld(p, drawObj.transform, pivot);
                return {
                  ...wp,
                  w: p.w,
                  t: p.t,
                  angle: p.angle,
                  jitterX: p.jitterX,
                  jitterY: p.jitterY,
                  grainOpacity: p.grainOpacity,
                  gap: p.gap
                };
              });
              const subStrokeColor = drawObj.subPathStrokes?.[subIdx]?.strokeColor || drawObj.strokeColor;
              const subStrokeWidth = drawObj.subPathStrokes?.[subIdx]?.strokeWidth ?? drawObj.strokeWidth;
              const subBrush = {
                ...strokeBrush,
                strokeWidth: subStrokeWidth
              };
              drawVariableWidthStroke(ctx, worldSubPoints, subStrokeColor, realismSettings, subBrush);
            });
          } else {
            const worldStrokePoints = localPoints.map((p) => {
              const wp = localToWorld(p, drawObj.transform, pivot);
              return {
                ...wp,
                w: p.w,
                t: p.t,
                angle: p.angle,
                jitterX: p.jitterX,
                jitterY: p.jitterY,
                grainOpacity: p.grainOpacity,
                gap: p.gap
              };
            });
            drawVariableWidthStroke(ctx, worldStrokePoints, drawObj.strokeColor, realismSettings, strokeBrush);
          }
        } else {
          if (drawObj.subPaths && drawObj.subPaths.length > 0) {
            drawObj.subPaths.forEach((sub, subIdx) => {
              const localSubPoints = sub.map((p, idx) => deformLocalPoint(p, drawObj, idx, subIdx));
              const worldSubPoints = localSubPoints.map(p => localToWorld(p, drawObj.transform, pivot));
              if (worldSubPoints.length > 0) {
                ctx.beginPath();
                ctx.moveTo(worldSubPoints[0].x, worldSubPoints[0].y);
                for (let i = 1; i < worldSubPoints.length; i++) {
                  ctx.lineTo(worldSubPoints[i].x, worldSubPoints[i].y);
                }
                ctx.lineWidth = drawObj.subPathStrokes?.[subIdx]?.strokeWidth ?? drawObj.strokeWidth;
                ctx.strokeStyle = drawObj.subPathStrokes?.[subIdx]?.strokeColor || drawObj.strokeColor;
                ctx.stroke();
              }
            });
          } else {
            drawAllPaths();
            
            ctx.lineWidth = drawObj.strokeWidth;
            ctx.strokeStyle = drawObj.strokeColor;
            ctx.stroke();
          }
        }
      }

      // 2. Inner Shadow Effect
      if (obj.innerShadow && obj.innerShadow.enabled && obj.type !== 'image') {
        ctx.save();
        
        // Clip to current vector path
        drawAllPaths();
        ctx.clip();
        
        ctx.shadowColor = obj.innerShadow.color || 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = obj.innerShadow.blur ?? 15;
        
        const angleRad = (((obj.innerShadow.angle ?? 120)) * Math.PI) / 180;
        ctx.shadowOffsetX = Math.cos(angleRad) * (obj.innerShadow.distance ?? 8);
        ctx.shadowOffsetY = Math.sin(angleRad) * (obj.innerShadow.distance ?? 8);
        
        ctx.globalCompositeOperation = 'source-atop';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        ctx.restore();
      }

      // 3. Color Overlay Effect
      if (obj.overlay && obj.overlay.enabled && obj.type !== 'image') {
        ctx.save();
        
        // Clip to current path
        drawAllPaths();
        ctx.clip();
        
        ctx.globalCompositeOperation = (obj.overlay.blendMode as any) || 'source-atop';
        ctx.fillStyle = obj.overlay.color || '#ff0055';
        ctx.globalAlpha = obj.overlay.opacity ?? 0.5;
        ctx.fill();
        
        ctx.restore();
      }

      // 4. Rim Light Effect
      if (obj.rimLight && obj.rimLight.enabled && obj.type !== 'image') {
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = obj.rimLight.color || '#ffffff';
        ctx.lineWidth = obj.rimLight.thickness ?? 4;
        ctx.shadowColor = obj.rimLight.color || '#ffffff';
        ctx.shadowBlur = obj.rimLight.softness ?? 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        drawAllPaths();
        ctx.stroke();
        
        ctx.restore();
      }

      // 4.6 Smart Mesh Coloring
      if (obj.smartMeshColor && obj.type !== 'image') {
        const smc = obj.smartMeshColor;
        const localPivot = obj.pivots[0] || { localX: 0, localY: 0 };
        
        ctx.save();
        // Clip to the shape boundary so paint doesn't bleed outside the drawing
        drawAllPaths();
        ctx.clip();

        // 1. Draw each cell that has a color
        smc.cells.forEach(cell => {
          if (!cell.color) return;
          
          // Get the 4 corners of the cell
          const cellPoints = cell.pointIds.map(pId => {
            const pt = smc.points.find(p => p.id === pId);
            if (!pt) return null;
            // Apply all active deformations dynamically!
            const finalLocal = deformLocalPoint({ x: pt.originalX, y: pt.originalY }, obj);
            return localToWorld(finalLocal, obj.transform, localPivot);
          });

          if (cellPoints.every(p => p !== null)) {
            ctx.save();
            ctx.globalAlpha = cell.opacity !== undefined ? cell.opacity : 1.0;
            ctx.beginPath();
            ctx.moveTo(cellPoints[0]!.x, cellPoints[0]!.y);
            for (let i = 1; i < cellPoints.length; i++) {
              ctx.lineTo(cellPoints[i]!.x, cellPoints[i]!.y);
            }
            ctx.closePath();
            ctx.fillStyle = cell.color;
            ctx.fill();
            ctx.restore();
          }
        });

        // 2. Draw each point that has a color (soft radial glow bleed, non-isotropically stretching and turning with object transform)
        const scaleX = Math.abs(obj.transform.scaleX || 1);
        const scaleY = Math.abs(obj.transform.scaleY || 1);

        smc.points.forEach(pt => {
          if (!pt.color) return;

          // Apply all active deformations dynamically!
          const finalLocal = deformLocalPoint({ x: pt.originalX, y: pt.originalY }, obj);
          const worldPt = localToWorld(finalLocal, obj.transform, localPivot);
          const baseBrushSize = smc.brushSize || 40;

          ctx.save();
          ctx.globalAlpha = pt.opacity !== undefined ? pt.opacity : 1.0;
          ctx.translate(worldPt.x, worldPt.y);
          ctx.rotate((obj.transform.rotation * Math.PI) / 180);
          ctx.scale(scaleX, scaleY);

          const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, baseBrushSize);
          grad.addColorStop(0, pt.color);
          grad.addColorStop(1, getTransparentColor(pt.color));
          
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, baseBrushSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });

        ctx.restore();
      }

      ctx.restore();
      } catch (err) {
        console.error("Safely caught canvas drawing exception for object:", obj.id, err);
        try {
          ctx.restore();
        } catch (_) {}
      }
    });

    // Draw select overlay bounding boxes & 10+ handles
    if (effectiveSelectedObjectId && objects[effectiveSelectedObjectId] && activeTool !== 'ZOM') {
      const rawObj = objects[effectiveSelectedObjectId];
      const obj = resolve360Object(rawObj, objects);
      const box = calculateBoundingBox(getAllObjectPoints(obj));
      const pivot = obj.pivots[0] || { localX: 0, localY: 0 };
      
      const tl = localToWorld({ x: box.x, y: box.y }, obj.transform, pivot);
      const tr = localToWorld({ x: box.x + box.width, y: box.y }, obj.transform, pivot);
      const br = localToWorld({ x: box.x + box.width, y: box.y + box.height }, obj.transform, pivot);
      const bl = localToWorld({ x: box.x, y: box.y + box.height }, obj.transform, pivot);
      
      const tc = localToWorld({ x: box.x + box.width / 2, y: box.y }, obj.transform, pivot);
      const trRot = localToWorld({ x: box.x + box.width / 2, y: box.y - 25 }, obj.transform, pivot);

      // 1. Draw outer boundary box in world space
      ctx.strokeStyle = '#2196F3';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y);
      ctx.lineTo(bl.x, bl.y);
      ctx.closePath();
      ctx.stroke();

      // 1.5. Draw Vertical (Top-to-Bottom) and Horizontal (Left-to-Right) Axis Guide Lines on Drawing (only when Curve Tool is active)
      if (activeTool === 'CRV' || activeTool === 'CPT') {
        const vTop = localToWorld({ x: box.x + box.width / 2, y: box.y }, obj.transform, pivot);
        const vBottom = localToWorld({ x: box.x + box.width / 2, y: box.y + box.height }, obj.transform, pivot);
        const hLeft = localToWorld({ x: box.x, y: box.y + box.height / 2 }, obj.transform, pivot);
        const hRight = localToWorld({ x: box.x + box.width, y: box.y + box.height / 2 }, obj.transform, pivot);
        const centerPt = localToWorld({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, obj.transform, pivot);

        ctx.save();
        // Subtle dark outline for high contrast against any background color
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(vTop.x, vTop.y);
        ctx.lineTo(vBottom.x, vBottom.y);
        ctx.moveTo(hLeft.x, hLeft.y);
        ctx.lineTo(hRight.x, hRight.y);
        ctx.stroke();

        // Main crisp dashed guide lines (emerald cyan)
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(vTop.x, vTop.y);
        ctx.lineTo(vBottom.x, vBottom.y);
        ctx.moveTo(hLeft.x, hLeft.y);
        ctx.lineTo(hRight.x, hRight.y);
        ctx.stroke();

        // Center crosshair marker
        ctx.setLineDash([]);
        ctx.fillStyle = '#10B981';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(centerPt.x, centerPt.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // 2. Draw line connecting to Top Rotation Handle
      ctx.beginPath();
      ctx.moveTo(tc.x, tc.y);
      ctx.lineTo(trRot.x, trRot.y);
      ctx.strokeStyle = '#2196F3';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 3. Draw the 10 interactive handles in world space
      const handles = getHandles(obj);
      handles.forEach(h => {
        ctx.save();
        ctx.strokeStyle = '#1E88E5';
        ctx.lineWidth = 1.5;

        if (h.type === 'scale') {
          ctx.fillStyle = '#FFFFFF';
          const size = (h.index % 2 === 0) ? 10 : 8;
          ctx.fillRect(h.worldX - size / 2, h.worldY - size / 2, size, size);
          ctx.strokeRect(h.worldX - size / 2, h.worldY - size / 2, size, size);
        } else if (h.type === 'rotate') {
          ctx.fillStyle = '#FF9800'; // Amber/orange for rotation!
          ctx.beginPath();
          ctx.arc(h.worldX, h.worldY, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else if (h.type === 'pivot') {
          ctx.fillStyle = '#E53935'; // Red for anchor/pivot joint!
          ctx.beginPath();
          ctx.arc(h.worldX, h.worldY, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.moveTo(h.worldX - 4, h.worldY);
          ctx.lineTo(h.worldX + 4, h.worldY);
          ctx.moveTo(h.worldX, h.worldY - 4);
          ctx.lineTo(h.worldX, h.worldY + 4);
          ctx.stroke();
        }
        ctx.restore();
      });
    }

    // Render active Geometry Mesh deform wireframe/handles
    if (activeTool === 'MSH' && effectiveSelectedObjectId && objects[effectiveSelectedObjectId]) {
      const obj = objects[effectiveSelectedObjectId];
      
      if (obj.meshState && obj.meshState.active) {
        const { densityX, densityY, points, showGrid, showPoints } = obj.meshState;
        ctx.save();
        
        // Convert all mesh points to world space
        const worldMeshPoints = points.map(mpt => {
          return localToWorld({ x: mpt.currentX, y: mpt.currentY }, obj.transform, obj.pivots[0]);
        });
        
        // 1. Draw Mesh Contour Guide line (if enabled)
        if (showGrid && worldMeshPoints.length > 1) {
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
          ctx.lineWidth = 1.2;
          for (let i = 0; i < worldMeshPoints.length - 1; i++) {
            const p1 = worldMeshPoints[i];
            const p2 = worldMeshPoints[i + 1];
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
          }
          ctx.stroke();
        }
        
        // 2. Draw Mesh Grid points (only in node mode)
        if (showPoints && obj.meshState.editMode !== 'lattice') {
          worldMeshPoints.forEach((mpt, idx) => {
            const isSelected = selectedDeformPointIndex === idx && selectedDeformPointType === 'grid';
            ctx.beginPath();
            ctx.arc(mpt.x, mpt.y, (dragMode === 'meshGridPoint' && draggedMeshPointIndex === idx || isSelected) ? 7 : 5, 0, Math.PI * 2);
            ctx.fillStyle = (dragMode === 'meshGridPoint' && draggedMeshPointIndex === idx || isSelected) ? '#F59E0B' : '#3B82F6';
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1;
            ctx.stroke();
          });
        }

        // 3. Render Lattice Overlay Grid & Handles (if in lattice mode)
        if (obj.meshState.editMode === 'lattice' && obj.meshState.latticePoints && obj.meshState.latticePoints.length > 0) {
          const lpts = obj.meshState.latticePoints;
          const worldLatticePoints = lpts.map((lpt: any) => {
            return localToWorld({ x: lpt.x, y: lpt.y }, obj.transform, obj.pivots[0]);
          });

          // Draw green grid for lattice
          ctx.beginPath();
          ctx.strokeStyle = '#10B981'; // Green-500
          ctx.lineWidth = 1.8;
          ctx.setLineDash([4, 4]);
          
          // Connect standard lattice boundaries (assuming a grid based on density or density-like layout)
          // For general stability, we connect points that are closely aligned or simply connect all lattice points in sequence
          for (let i = 0; i < worldLatticePoints.length; i++) {
            for (let j = i + 1; j < worldLatticePoints.length; j++) {
              // Draw line if they are adjacent in the original grid
              const origDist = Math.sqrt((lpts[i].originalX - lpts[j].originalX) ** 2 + (lpts[i].originalY - lpts[j].originalY) ** 2);
              if (origDist < 80) { // arbitrary connection threshold for lattice grid adjacency
                ctx.moveTo(worldLatticePoints[i].x, worldLatticePoints[i].y);
                ctx.lineTo(worldLatticePoints[j].x, worldLatticePoints[j].y);
              }
            }
          }
          ctx.stroke();
          ctx.setLineDash([]); // Reset

          // Draw lattice handle dots
          worldLatticePoints.forEach((lpt, idx) => {
            const isSelected = dragMode === 'latticePoint' && draggedMeshPointIndex === idx;
            ctx.beginPath();
            ctx.arc(lpt.x, lpt.y, isSelected ? 9 : 7, 0, Math.PI * 2);
            ctx.fillStyle = '#10B981'; // Emerald Green
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          });
        }

        // 4. Draw Symmetry Axis Guide
        if (obj.meshState.symmetryActive) {
          // Find center of current bounding box
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          worldMeshPoints.forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
          });
          const midX = (minX + maxX) / 2;
          const midY = (minY + maxY) / 2;

          ctx.beginPath();
          ctx.strokeStyle = '#EF4444'; // Red Symmetry line
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 5]);
          if (obj.meshState.symmetryAxis === 'horizontal') {
            // Vertical symmetry line (mirrors left to right)
            ctx.moveTo(midX, minY - 30);
            ctx.lineTo(midX, maxY + 30);
          } else {
            // Horizontal symmetry line (mirrors top to bottom)
            ctx.moveTo(minX - 30, midY);
            ctx.lineTo(maxX + 30, midY);
          }
          ctx.stroke();
          ctx.setLineDash([]); // Reset
        }

        ctx.restore();
      } else {
        // Draw standard vector outline if no active mesh grid
        ctx.save();
        const worldPts = obj.points.map(p => localToWorld(p, obj.transform, obj.pivots[0]));
        if (worldPts.length > 1) {
          ctx.beginPath();
          ctx.moveTo(worldPts[0].x, worldPts[0].y);
          for (let i = 1; i < worldPts.length; i++) {
            ctx.lineTo(worldPts[i].x, worldPts[i].y);
          }
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
          ctx.lineWidth = 1.8;
          ctx.setLineDash([2, 3]);
          ctx.stroke();
        }
        
        worldPts.forEach((pt, i) => {
          const isSelected = selectedDeformPointIndex === i && selectedDeformPointType === 'standard';
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, (dragMode === 'meshPoint' && draggedMeshPointIndex === i || isSelected) ? 8 : 6, 0, Math.PI * 2);
          ctx.fillStyle = (dragMode === 'meshPoint' && draggedMeshPointIndex === i || isSelected) ? '#F59E0B' : '#3B82F6';
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Small inner point
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 1.8, 0, Math.PI * 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();
        });
        ctx.restore();
      }
    }

    // 🌟 Render Wireframe Mesh Vertices & Selection Overlay
    if (effectiveSelectedObjectId && objects[effectiveSelectedObjectId]) {
      const obj = objects[effectiveSelectedObjectId];
      if (obj.wireframeMode && obj.points && obj.points.length > 0) {
        ctx.save();
        const pivot = obj.pivots[0] || { localX: 0, localY: 0 };
        const worldPts = obj.points.map(p => localToWorld(p, obj.transform, pivot));
        const selectedSet = new Set(obj.selectedPointIndices || []);

        // 1. Connecting Wireframe lines (Front)
        if (worldPts.length > 1) {
          ctx.beginPath();
          ctx.moveTo(worldPts[0].x, worldPts[0].y);
          for (let i = 1; i < worldPts.length; i++) {
            ctx.lineTo(worldPts[i].x, worldPts[i].y);
          }
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 1.8;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // 1b. Render 3D Volumetric Inner Space / Wall Struts if innerSpace3D exists
        const depth = obj.innerSpace3D || 0;
        if (depth !== 0 && worldPts.length > 1) {
          const depthOffsetX = depth * 0.25;
          const depthOffsetY = -depth * 0.25;

          const backWorldPts = worldPts.map(pt => ({
            x: pt.x + depthOffsetX,
            y: pt.y + depthOffsetY
          }));

          // Back Wireframe Ring
          ctx.beginPath();
          ctx.moveTo(backWorldPts[0].x, backWorldPts[0].y);
          for (let i = 1; i < backWorldPts.length; i++) {
            ctx.lineTo(backWorldPts[i].x, backWorldPts[i].y);
          }
          ctx.strokeStyle = '#38BDF8'; // Cyan 3D depth wire
          ctx.lineWidth = 1.2;
          ctx.setLineDash([2, 4]);
          ctx.stroke();
          ctx.setLineDash([]);

          // Connecting Depth Struts
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 1;
          ctx.setLineDash([1, 3]);
          worldPts.forEach((frontPt, i) => {
            const backPt = backWorldPts[i];
            ctx.beginPath();
            ctx.moveTo(frontPt.x, frontPt.y);
            ctx.lineTo(backPt.x, backPt.y);
            ctx.stroke();
          });
          ctx.setLineDash([]);
        }

        // 2. Vertices (black dots by default; bright yellow glowing dots when selected)
        worldPts.forEach((pt, i) => {
          const isSelected = selectedSet.has(i);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, isSelected ? 8 : 5, 0, Math.PI * 2);

          if (isSelected) {
            ctx.fillStyle = '#FFE600'; // Vibrant Yellow
            ctx.shadowColor = '#FEF08A';
            ctx.shadowBlur = 12;
          } else {
            ctx.fillStyle = '#111827'; // Dark Black/Gray
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
          }
          ctx.fill();

          ctx.strokeStyle = isSelected ? '#FFFFFF' : '#9CA3AF';
          ctx.lineWidth = isSelected ? 2 : 1;
          ctx.stroke();

          if (isSelected) {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
          }
        });
        ctx.restore();
      }
    }

    // Render active Spline Reshape overlay (Bezier curve path, control handles, Twist points)
    if (activeTool === 'SPL' && effectiveSelectedObjectId && objects[effectiveSelectedObjectId]) {
      const obj = objects[effectiveSelectedObjectId];
      if (obj.splineActive && obj.splineControlPoints && obj.splineControlPoints.length > 0) {
        const pivot = obj.pivots[0] || { localX: 0, localY: 0 };
        ctx.save();
        
        // 1. Draw spline control segments and handles
        obj.splineControlPoints.forEach((seg: any, idx: number) => {
          const worldStart = localToWorld(seg.start, obj.transform, pivot);
          const worldEnd = localToWorld(seg.end, obj.transform, pivot);
          const worldCp1 = localToWorld(seg.cp1, obj.transform, pivot);
          const worldCp2 = localToWorld(seg.cp2, obj.transform, pivot);
          
          // Draw dashed lines from points to control handles
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 3]);
          ctx.moveTo(worldStart.x, worldStart.y);
          ctx.lineTo(worldCp1.x, worldCp1.y);
          ctx.moveTo(worldEnd.x, worldEnd.y);
          ctx.lineTo(worldCp2.x, worldCp2.y);
          ctx.stroke();
          ctx.setLineDash([]); // Reset
          
          // Draw on-curve spline points
          ctx.beginPath();
          ctx.arc(worldStart.x, worldStart.y, (dragMode === 'splineHandle' && draggedSplineIndex === idx && draggedSplinePart === 'start') ? 8 : 6, 0, Math.PI * 2);
          ctx.fillStyle = '#06B6D4'; // Cyan
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(worldEnd.x, worldEnd.y, (dragMode === 'splineHandle' && draggedSplineIndex === idx && draggedSplinePart === 'end') ? 8 : 6, 0, Math.PI * 2);
          ctx.fillStyle = '#06B6D4'; // Cyan
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          
          // Draw control handles (cp1, cp2) as small squares
          const drawHandleSquare = (pt: Point, active: boolean) => {
            const size = active ? 8 : 6;
            ctx.beginPath();
            ctx.rect(pt.x - size / 2, pt.y - size / 2, size, size);
            ctx.fillStyle = '#E11D48'; // Rose
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1.2;
            ctx.stroke();
          };
          
          drawHandleSquare(worldCp1, dragMode === 'splineHandle' && draggedSplineIndex === idx && draggedSplinePart === 'cp1');
          drawHandleSquare(worldCp2, dragMode === 'splineHandle' && draggedSplineIndex === idx && draggedSplinePart === 'cp2');
        });
        
        // 2. Draw Twist Points
        if (obj.splineTwistPoints && obj.splineTwistPoints.length > 0) {
          obj.splineTwistPoints.forEach((tp: any, twistIdx: number) => {
            const localPos = evaluateSplineCurrent(obj.splineControlPoints!, tp.t);
            const worldPt = localToWorld(localPos, obj.transform, pivot);
            
            const isDragged = (dragMode === 'splineHandle' && draggedSplineIndex === twistIdx && draggedSplinePart === 'twist');
            ctx.beginPath();
            ctx.arc(worldPt.x, worldPt.y, isDragged ? 10 : 8, 0, Math.PI * 2);
            ctx.fillStyle = '#A855F7'; // Purple
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            
            // Draw a tiny line indicating twist angle
            ctx.beginPath();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#FFFFFF';
            const rad = (tp.rotation * Math.PI / 180);
            ctx.moveTo(worldPt.x, worldPt.y);
            ctx.lineTo(worldPt.x + Math.cos(rad) * 12, worldPt.y + Math.sin(rad) * 12);
            ctx.stroke();
          });
        }
        
        ctx.restore();
      }
    }

    // CPT & CRV (Curve Path & Curve Line Deformer) overlay rendering
    if ((activeTool === 'CPT' || activeTool === 'CRV') && effectiveSelectedObjectId && objects[effectiveSelectedObjectId]) {
      const obj = objects[effectiveSelectedObjectId];
      if (obj.curvePathState && obj.curvePathState.active) {
        const cps = obj.curvePathState;
        const hCPs = cps.hControlPoints || [];
        const vCPs = cps.vControlPoints || [];
        const localPivot = obj.pivots[0] || { localX: 0, localY: 0 };
        
        ctx.save();
        
        // Convert local control points to world space
        const worldH = hCPs.map(pt => localToWorld(pt, obj.transform, localPivot));
        const worldV = vCPs.map(pt => localToWorld(pt, obj.transform, localPivot));

        // 1. Draw horizontal spline curve line
        if (worldH.length > 1) {
          ctx.beginPath();
          ctx.moveTo(worldH[0].x, worldH[0].y);
          for (let i = 1; i < worldH.length; i++) {
            ctx.lineTo(worldH[i].x, worldH[i].y);
          }
          ctx.strokeStyle = '#06B6D4'; // cyan-500
          ctx.lineWidth = 2.5 / zoomScale;
          ctx.stroke();
        }

        // 2. Draw vertical spline curve line
        if (worldV.length > 1) {
          ctx.beginPath();
          ctx.moveTo(worldV[0].x, worldV[0].y);
          for (let j = 1; j < worldV.length; j++) {
            ctx.lineTo(worldV[j].x, worldV[j].y);
          }
          ctx.strokeStyle = '#F59E0B'; // amber-500
          ctx.lineWidth = 2.5 / zoomScale;
          ctx.stroke();
        }

        // 3. Draw horizontal control point handles
        worldH.forEach((pt, idx) => {
          ctx.beginPath();
          const r = (dragMode === 'curvePathH' && draggedMeshPointIndex === idx) ? 8 : 5;
          ctx.arc(pt.x, pt.y, r / zoomScale, 0, Math.PI * 2);
          ctx.fillStyle = (dragMode === 'curvePathH' && draggedMeshPointIndex === idx) ? '#22D3EE' : '#06B6D4';
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5 / zoomScale;
          ctx.fill();
          ctx.stroke();
        });

        // 4. Draw vertical control point handles
        worldV.forEach((pt, idx) => {
          ctx.beginPath();
          const r = (dragMode === 'curvePathV' && draggedMeshPointIndex === idx) ? 8 : 5;
          ctx.arc(pt.x, pt.y, r / zoomScale, 0, Math.PI * 2);
          ctx.fillStyle = (dragMode === 'curvePathV' && draggedMeshPointIndex === idx) ? '#FBBF24' : '#F59E0B';
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5 / zoomScale;
          ctx.fill();
          ctx.stroke();
        });

        ctx.restore();
      }
    }

    // CRV (Curve Line Deformer) overlay rendering
    if (activeTool === 'CRV' && effectiveSelectedObjectId && objects[effectiveSelectedObjectId]) {
      const obj = objects[effectiveSelectedObjectId];
      if (obj.flexCurveState && obj.flexCurveState.active && obj.flexCurveState.points) {
        const fcs = obj.flexCurveState;
        const pts = fcs.points || [];
        const localPivot = obj.pivots[0] || { localX: 0, localY: 0 };
        
        ctx.save();
        
        // Convert local control points to world space
        const worldPts = pts.map(pt => localToWorld({ x: pt.x, y: pt.y }, obj.transform, localPivot));
        const isAttached = fcs.isAttached;

        // Draw influence radius circles
        if (worldPts.length > 0) {
          worldPts.forEach(pt => {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, (fcs.influenceRadius || 120) * obj.transform.scaleX, 0, Math.PI * 2);
            ctx.strokeStyle = isAttached ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.15)';
            ctx.lineWidth = 1 / zoomScale;
            ctx.setLineDash([4 / zoomScale, 4 / zoomScale]);
            ctx.stroke();
            ctx.setLineDash([]);
          });
        }

        // Draw curve line stroke
        if (worldPts.length > 1) {
          ctx.beginPath();
          ctx.moveTo(worldPts[0].x, worldPts[0].y);
          if (worldPts.length === 2) {
            ctx.lineTo(worldPts[1].x, worldPts[1].y);
          } else {
            for (let i = 0; i < worldPts.length - 1; i++) {
              const curr = worldPts[i];
              const next = worldPts[i + 1];
              const midX = (curr.x + next.x) / 2;
              const midY = (curr.y + next.y) / 2;
              if (i === 0) {
                ctx.lineTo(midX, midY);
              } else {
                ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
              }
            }
            ctx.lineTo(worldPts[worldPts.length - 1].x, worldPts[worldPts.length - 1].y);
          }
          
          ctx.strokeStyle = isAttached ? '#10B981' : '#F59E0B';
          ctx.lineWidth = 3.5 / zoomScale;
          if (!isAttached) {
            ctx.setLineDash([6 / zoomScale, 4 / zoomScale]);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Draw control node handles
        worldPts.forEach((pt, idx) => {
          ctx.beginPath();
          const isDragging = (dragMode === 'flexCurveHandle' && draggedMeshPointIndex === idx);
          const r = isDragging ? 9 : 6;
          ctx.arc(pt.x, pt.y, r / zoomScale, 0, Math.PI * 2);
          ctx.fillStyle = isDragging 
            ? (isAttached ? '#34D399' : '#FBBF24') 
            : (isAttached ? '#10B981' : '#F59E0B');
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2 / zoomScale;
          ctx.fill();
          ctx.stroke();

          // Node number text
          ctx.fillStyle = '#FFFFFF';
          ctx.font = `bold ${Math.max(9, Math.min(12, 10 / zoomScale))}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText((idx + 1).toString(), pt.x, pt.y - (14 / zoomScale));
        });

        ctx.restore();
      }
    }

    // PBM, VDF, VPR & RPD (Vector Deformer) overlay rendering
    if ((activeTool === 'PBM' || activeTool === 'VDF' || activeTool === 'VPR' || activeTool === 'RPD') && effectiveSelectedObjectId && objects[effectiveSelectedObjectId]) {
      const obj = objects[effectiveSelectedObjectId];
      if (obj.customVectorDeformState && obj.customVectorDeformState.active && obj.customVectorDeformState.nodes) {
        const vdfState = obj.customVectorDeformState;
        const nodes = vdfState.nodes || [];
        const isDrawingPhase = vdfState.isDrawingPhase;

        ctx.save();

        // 1. Draw backbone connecting vector nodes
        if (nodes.length > 1) {
          const nodeMap = new Map<string, CustomVectorDeformNode>();
          nodes.forEach(n => nodeMap.set(n.id, n));

          ctx.beginPath();
          nodes.forEach((node, idx) => {
            let parentNode: CustomVectorDeformNode | undefined;
            if (node.parentNodeId && nodeMap.has(node.parentNodeId)) {
              parentNode = nodeMap.get(node.parentNodeId);
            } else if (idx > 0) {
              parentNode = nodes[idx - 1];
            }

            if (parentNode && parentNode.id !== node.id) {
              ctx.moveTo(parentNode.x, parentNode.y);
              ctx.lineTo(node.x, node.y);
            }
          });

          ctx.strokeStyle = (activeTool === 'PBM' || activeTool === 'RPD') ? '#3B82F6' : '#F59E0B'; // Vibrant Blue for PBM/RPD joint bones
          ctx.lineWidth = 3.5 / zoomScale;
          ctx.shadowColor = (activeTool === 'PBM' || activeTool === 'RPD') ? '#3B82F6' : '#F59E0B';
          ctx.shadowBlur = 8 / zoomScale;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        // 2. Draw handles for each vector node
        nodes.forEach((node, idx) => {
          const isDragging = (dragMode === 'vdf-node' && draggedMeshPointIndex === idx);
          const isSelected = vdfState.selectedNodeIndex === idx || isDragging;
          const r = isSelected ? 12 : 8;

          // If selected, draw Translucent Capture Area Radius circle
          if (isSelected) {
            const capRadius = vdfState.captureRadius || vdfState.stiffness || 50;
            ctx.save();
            ctx.beginPath();
            ctx.arc(node.x, node.y, capRadius, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(250, 204, 21, 0.7)';
            ctx.lineWidth = 1.5 / zoomScale;
            ctx.setLineDash([6 / zoomScale, 4 / zoomScale]);
            ctx.fillStyle = 'rgba(250, 204, 21, 0.08)';
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }

          // Outer halo
          ctx.beginPath();
          ctx.arc(node.x, node.y, (r + 6) / zoomScale, 0, Math.PI * 2);
          ctx.fillStyle = isSelected 
            ? 'rgba(250, 204, 21, 0.5)' // Yellow halo when selected
            : 'rgba(59, 130, 246, 0.35)'; // Blue halo when unselected
          ctx.fill();

          // Main circle
          ctx.beginPath();
          ctx.arc(node.x, node.y, r / zoomScale, 0, Math.PI * 2);
          ctx.fillStyle = isSelected
            ? '#FACC15' // Bright Yellow for selected point
            : '#3B82F6'; // Default Vibrant Blue for unselected points
          ctx.strokeStyle = isSelected ? '#000000' : '#FFFFFF';
          ctx.lineWidth = (isSelected ? 3 : 2) / zoomScale;
          ctx.fill();
          ctx.stroke();

          // Draw node index label badge above node
          ctx.fillStyle = isSelected ? '#FACC15' : '#60A5FA';
          ctx.shadowColor = '#000000';
          ctx.shadowBlur = 4 / zoomScale;
          ctx.font = `bold ${Math.max(10, Math.min(14, (isSelected ? 13 : 11) / zoomScale))}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(isSelected ? `⭐ Pt #${idx + 1}` : `Pt #${idx + 1}`, node.x, node.y - (14 / zoomScale));
          ctx.shadowBlur = 0;
        });

        ctx.restore();
      }
    }

    // Render active Smart Mesh Coloring overlay (mesh grid, dots, brush cursor preview)
    if (activeTool === 'MCL' && effectiveSelectedObjectId && objects[effectiveSelectedObjectId]) {
      const obj = objects[effectiveSelectedObjectId];
      if (obj.smartMeshColor) {
        const { densityX, densityY, points } = obj.smartMeshColor;
        const localPivot = obj.pivots[0] || { localX: 0, localY: 0 };
        ctx.save();
        
        // 1. Draw Mesh Grid lines
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.55)'; // Emerald line
        ctx.lineWidth = 1.2;
        
        // Convert all points to world space
        const worldPoints = points.map(pt => {
          // Deform with smartWarp pins if present
          const localWarped = deformWithSmartWarp({ x: pt.originalX, y: pt.originalY }, obj.smartWarp);
          return localToWorld(localWarped, obj.transform, localPivot);
        });

        // Horizontal lines
        for (let y = 0; y < densityY; y++) {
          for (let x = 0; x < densityX - 1; x++) {
            const p1 = worldPoints[y * densityX + x];
            const p2 = worldPoints[y * densityX + (x + 1)];
            if (p1 && p2) {
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
            }
          }
        }
        
        // Vertical lines
        for (let x = 0; x < densityX; x++) {
          for (let y = 0; y < densityY - 1; y++) {
            const p1 = worldPoints[y * densityX + x];
            const p2 = worldPoints[(y + 1) * densityX + x];
            if (p1 && p2) {
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
            }
          }
        }
        ctx.stroke();

        // 2. Draw points
        worldPoints.forEach(pt => {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#10b981'; // Emerald
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1;
          ctx.stroke();
        });

        // 3. Draw Brush circle overlay cursor preview
        if (currentCursorPos) {
          ctx.beginPath();
          ctx.arc(currentCursorPos.x, currentCursorPos.y, obj.smartMeshColor.brushSize || 40, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          
          // Draw center tiny crosshair
          ctx.beginPath();
          ctx.moveTo(currentCursorPos.x - 5, currentCursorPos.y);
          ctx.lineTo(currentCursorPos.x + 5, currentCursorPos.y);
          ctx.moveTo(currentCursorPos.x, currentCursorPos.y - 5);
          ctx.lineTo(currentCursorPos.x, currentCursorPos.y + 5);
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // CAG (Cage Deform) overlay wireframe/handles
    if (activeTool === 'CAG' && effectiveSelectedObjectId && objects[effectiveSelectedObjectId]) {
      const obj = objects[effectiveSelectedObjectId];
      if (obj.cageState && obj.cageState.active && obj.cageState.points) {
        const { points, showGrid } = obj.cageState;
        const localPivot = obj.pivots[0] || { localX: 0, localY: 0 };
        ctx.save();

        // 1. Convert all cage points to world space
        const worldPts = points.map(pt => localToWorld({ x: pt.currentX, y: pt.currentY }, obj.transform, localPivot));

        // 2. Draw Cage boundary lines
        if (showGrid && worldPts.length === 8) {
          ctx.beginPath();
          ctx.moveTo(worldPts[0].x, worldPts[0].y);
          ctx.lineTo(worldPts[1].x, worldPts[1].y);
          ctx.lineTo(worldPts[2].x, worldPts[2].y);
          ctx.lineTo(worldPts[3].x, worldPts[3].y);
          ctx.lineTo(worldPts[4].x, worldPts[4].y);
          ctx.lineTo(worldPts[5].x, worldPts[5].y);
          ctx.lineTo(worldPts[6].x, worldPts[6].y);
          ctx.lineTo(worldPts[7].x, worldPts[7].y);
          ctx.closePath();
          ctx.strokeStyle = '#10B981'; // Emerald green
          ctx.lineWidth = 1.8;
          ctx.setLineDash([4, 4]);
          ctx.stroke();

          // X cross grid
          ctx.beginPath();
          ctx.moveTo(worldPts[0].x, worldPts[0].y);
          ctx.lineTo(worldPts[4].x, worldPts[4].y);
          ctx.moveTo(worldPts[2].x, worldPts[2].y);
          ctx.lineTo(worldPts[6].x, worldPts[6].y);
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.2)';
          ctx.lineWidth = 1.0;
          ctx.stroke();
        }

        // 3. Draw Cage point handles
        worldPts.forEach((pt, idx) => {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
          ctx.fillStyle = (dragMode === ('cagePoint' as any) && draggedMeshPointIndex === idx) ? '#F59E0B' : '#10B981';
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
        });

        ctx.restore();
      }
    }

    // LQB (Liquify Brush) overlays and circle brush cursor preview
    if (activeTool === 'LQB' && effectiveSelectedObjectId && objects[effectiveSelectedObjectId]) {
      const obj = objects[effectiveSelectedObjectId];
      if (obj.meshState && obj.meshState.active && obj.meshState.showGrid) {
        const { densityX, densityY, points } = obj.meshState;
        ctx.save();
        const worldMeshPoints = points.map(mpt => localToWorld({ x: mpt.currentX, y: mpt.currentY }, obj.transform, obj.pivots[0]));
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(236, 72, 153, 0.25)'; // Soft pink grid
        ctx.lineWidth = 1.0;
        for (let y = 0; y < densityY; y++) {
          for (let x = 0; x < densityX - 1; x++) {
            const p1 = worldMeshPoints[y * densityX + x];
            const p2 = worldMeshPoints[y * densityX + (x + 1)];
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
          }
        }
        for (let x = 0; x < densityX; x++) {
          for (let y = 0; y < densityY - 1; y++) {
            const p1 = worldMeshPoints[y * densityX + x];
            const p2 = worldMeshPoints[(y + 1) * densityX + x];
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
          }
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    if (activeTool === 'LQB' && currentCursorPos) {
      const bSize = liquifySettings?.brushSize ?? 60;
      ctx.save();
      ctx.beginPath();
      ctx.arc(currentCursorPos.x, currentCursorPos.y, bSize, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(236, 72, 153, 0.85)'; // Pink/Rose brush circle
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();

      // Inner center crosshair dot
      ctx.beginPath();
      ctx.arc(currentCursorPos.x, currentCursorPos.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(236, 72, 153, 0.85)';
      ctx.fill();
      ctx.restore();
    }

    // Render active Smart Pin Warp overlay (selectable/draggable puppet-like deformation pins)
    if (activeTool === 'SWP' && effectiveSelectedObjectId && objects[effectiveSelectedObjectId]) {
      const obj = objects[effectiveSelectedObjectId];
      if (obj.smartWarp) {
        const { pins, pinSize, influenceRadius, showInfluenceArea } = obj.smartWarp;
        const localPivot = obj.pivots[0] || { localX: 0, localY: 0 };
        ctx.save();

        pins.forEach((pin, idx) => {
          const worldPin = localToWorld({ x: pin.currentX, y: pin.currentY }, obj.transform, localPivot);

          // 1. Draw Influence Radius Overlay
          if (showInfluenceArea !== false) {
            ctx.beginPath();
            ctx.arc(worldPin.x, worldPin.y, influenceRadius, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(14, 165, 233, 0.25)'; // Sky blue soft circle
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 6]);
            ctx.stroke();
            ctx.fillStyle = 'rgba(14, 165, 233, 0.03)';
            ctx.fill();
          }

          // 2. Draw Pin handle
          ctx.beginPath();
          ctx.arc(worldPin.x, worldPin.y, 8, 0, Math.PI * 2);
          ctx.fillStyle = (dragMode === 'smartWarpPin' && draggedMeshPointIndex === idx) ? '#F59E0B' : '#0EA5E9'; // Amber if dragged, Sky blue otherwise
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.stroke();

          // Inner pin center dot
          ctx.beginPath();
          ctx.arc(worldPin.x, worldPin.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = pin.locked ? '#000000' : '#FFFFFF'; // Black dot if locked
          ctx.fill();
        });
        ctx.restore();
      }
    }

    // Render Puppet Pins overlay for selected object if PIN tool is active
    if (activeTool === 'PIN' && effectiveSelectedObjectId && objects[effectiveSelectedObjectId]) {
      const obj = objects[effectiveSelectedObjectId];
      if (obj.pins && obj.pins.length > 0) {
        ctx.save();
        obj.pins.forEach((pin, idx) => {
          const curX = pin.currentLocalX !== undefined ? pin.currentLocalX : pin.localX;
          const curY = pin.currentLocalY !== undefined ? pin.currentLocalY : pin.localY;
          const worldPin = localToWorld({ x: curX, y: curY }, obj.transform, obj.pivots[0]);
          
          ctx.beginPath();
          ctx.arc(worldPin.x, worldPin.y, 7, 0, Math.PI * 2);
          ctx.fillStyle = (dragMode === 'puppetPin' && draggedMeshPointIndex === idx) ? '#F59E0B' : '#EF4444';
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          
          // Inner core dot
          ctx.beginPath();
          ctx.arc(worldPin.x, worldPin.y, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();
        });
        ctx.restore();
      }
    }

    // Render Lasso Deform Selection region polygon overlay for selected object if LSO tool is active
    if (activeTool === 'LSO' && effectiveSelectedObjectId && objects[effectiveSelectedObjectId]) {
      const obj = objects[effectiveSelectedObjectId];
      if (obj.lassoDeformState && obj.lassoDeformState.lassoPoints && obj.lassoDeformState.lassoPoints.length >= 3) {
        ctx.save();
        
        const localPivot = obj.pivots[0] || { localX: 0, localY: 0 };
        const worldLassoPoints = obj.lassoDeformState.lassoPoints.map(p => localToWorld(p, obj.transform, localPivot));
        
        ctx.beginPath();
        ctx.moveTo(worldLassoPoints[0].x, worldLassoPoints[0].y);
        for (let i = 1; i < worldLassoPoints.length; i++) {
          ctx.lineTo(worldLassoPoints[i].x, worldLassoPoints[i].y);
        }
        ctx.closePath();
        
        ctx.strokeStyle = '#F59E0B'; // Amber orange
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(245, 158, 11, 0.1)'; // Soft amber fill
        ctx.fill();
        
        ctx.restore();
      }
    }

    // Render Lasso Mesh Control Points overlay for selected object if LSO tool is active
    if (activeTool === 'LSO' && effectiveSelectedObjectId && objects[effectiveSelectedObjectId]) {
      const obj = objects[effectiveSelectedObjectId];
      if (obj.lassoControlPoints && obj.lassoControlPoints.length > 0) {
        ctx.save();
        const localPivot = obj.pivots[0] || { localX: 0, localY: 0 };
        obj.lassoControlPoints.forEach((cp, idx) => {
          const worldPt = localToWorld({ x: cp.currentX, y: cp.currentY }, obj.transform, localPivot);
          
          ctx.beginPath();
          ctx.arc(worldPt.x, worldPt.y, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = (dragMode === 'lassoControlPoint' && draggedMeshPointIndex === idx) ? '#F59E0B' : '#3B82F6'; // Amber if dragging, else elegant blue
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1;
          ctx.stroke();
        });
        ctx.restore();
      }
    }

    // Render active Pen path points & lines
    if (activeTool === 'PEN' && penPoints.length > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(penPoints[0].x, penPoints[0].y);
      for (let i = 1; i < penPoints.length; i++) {
        ctx.lineTo(penPoints[i].x, penPoints[i].y);
      }
      ctx.lineTo(currentCursorPos.x, currentCursorPos.y); // Dynamic rubberband line
      ctx.strokeStyle = '#E53935';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();

      // Draw little control point circles
      penPoints.forEach((pt, i) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? '#4CAF50' : '#FFEB3B';
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
      ctx.restore();
    }

    // Render Rectangle/Shapes Creation preview
    if (isDrawing && activeTool === 'SHP') {
      ctx.save();
      ctx.strokeStyle = '#FF9800';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      const w = currentCursorPos.x - dragStartPoint.x;
      const h = currentCursorPos.y - dragStartPoint.y;
      ctx.strokeRect(dragStartPoint.x, dragStartPoint.y, w, h);
      ctx.restore();
    }

    // Render active bones list linkage overlays
    if (!isRecording && !isPlaying && (showBones || activeTool === 'BON')) {
      bones.forEach((bone) => {
        const startObj = objects[bone.startObjectId];
        const endObj = objects[bone.endObjectId];
        if (!startObj || !endObj) return;

        const p1 = localToWorld({ x: bone.startLocalX, y: bone.startLocalY }, startObj.transform, startObj.pivots[0]);
        const p2 = localToWorld({ x: bone.endLocalX, y: bone.endLocalY }, endObj.transform, endObj.pivots[0]);

        const isElasticWarning = (elasticWarningId === bone.endObjectId);

        // Render bone linkage line
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineWidth = isElasticWarning ? 5 : 4;
        ctx.strokeStyle = isElasticWarning ? '#FF1744' : '#2196F3'; // Red if elastic constraint warnings are triggered!
        ctx.stroke();

        // Render joint connection dots
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, 6, 0, Math.PI * 2);
        ctx.arc(p2.x, p2.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = isElasticWarning ? '#FF1744' : '#1B5E20';
        ctx.fill();

        // Draw beautiful warning badge if stretched to limit!
        if (isElasticWarning) {
          ctx.beginPath();
          ctx.arc((p1.x + p2.x) / 2, (p1.y + p2.y) / 2 - 20, 10, 0, Math.PI * 2);
          ctx.fillStyle = '#FF1744';
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('!', (p1.x + p2.x) / 2, (p1.y + p2.y) / 2 - 20);
        }
        ctx.restore();
      });
    }

    // Render active bone tool drawing / rubberband snapping preview
    if (!isRecording && !isPlaying && activeTool === 'BON' && boneStartPoint) {
      ctx.save();
      // Rubberband connection line
      ctx.beginPath();
      ctx.moveTo(boneStartPoint.x, boneStartPoint.y);
      ctx.lineTo(currentCursorPos.x, currentCursorPos.y);
      ctx.lineWidth = 3;
      ctx.strokeStyle = snappedPivot ? '#4CAF50' : '#FFEB3B'; // Snap green vs draft yellow!
      ctx.stroke();

      // Start Joint Anchor
      ctx.beginPath();
      ctx.arc(boneStartPoint.x, boneStartPoint.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#E53935';
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Magnetic Snapping Glow Flash!
      if (snappedPivot) {
        ctx.beginPath();
        ctx.arc(snappedPivot.worldX, snappedPivot.worldY, 15, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(76, 175, 80, 0.25)';
        ctx.fill();
        ctx.strokeStyle = '#4CAF50';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(snappedPivot.worldX, snappedPivot.worldY, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#4CAF50';
        ctx.fill();
      }
      ctx.restore();
    }

    // Render current active brush line
    if (isDrawing && strokePoints.length > 0) {
      ctx.save();
      const previewColor = brushSettings?.strokeColor ?? '#000000';
      drawVariableWidthStroke(ctx, strokePoints, previewColor, realismSettings, brushSettings);
      ctx.restore();
    }

    // Render Knife slice trace line
    if (knifePath.length > 0 && activeTool === 'KNF') {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(knifePath[0].x, knifePath[0].y);
      for (let i = 1; i < knifePath.length; i++) {
        ctx.lineTo(knifePath[i].x, knifePath[i].y);
      }
      ctx.strokeStyle = '#2196F3';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }

    // Render current active Lasso selection path (LSO)
    if (!isRecording && !isPlaying && lassoPoints && lassoPoints.length > 0 && !hideLassoSelection) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
      for (let i = 1; i < lassoPoints.length; i++) {
        ctx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
      }
      ctx.closePath();
      
      // Beautiful amber glow fill
      ctx.fillStyle = 'rgba(245, 158, 11, 0.08)';
      ctx.fill();
      
      // Beautiful neon-amber dashed outline
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.restore();
    }

    // Render current active Free Selection Lasso path (FSL)
    if (!isRecording && !isPlaying && fslPoints && fslPoints.length > 0 && !hideFslSelection) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(fslPoints[0].x, fslPoints[0].y);
      for (let i = 1; i < fslPoints.length; i++) {
        ctx.lineTo(fslPoints[i].x, fslPoints[i].y);
      }
      ctx.closePath();
      
      // Beautiful violet glow fill for FSL
      ctx.fillStyle = 'rgba(139, 92, 246, 0.08)'; // violet-500
      ctx.fill();
      
      // Beautiful neon-violet dashed outline
      ctx.strokeStyle = '#8B5CF6'; // violet-500
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.restore();

      // Render draggable control point handles if in Free Selection mode
      if (activeTool === 'FSL') {
        ctx.save();
        fslPoints.forEach((pt, idx) => {
          const isDraggingThis = dragMode === 'drag-fsl-selection-point' && draggedMeshPointIndex === idx;
          
          // Outer glow/ring
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, (isDraggingThis ? 8 : 6) / zoomScale, 0, Math.PI * 2);
          ctx.fillStyle = isDraggingThis ? '#8B5CF6' : '#171717';
          ctx.strokeStyle = '#8B5CF6';
          ctx.lineWidth = 1.5 / zoomScale;
          ctx.fill();
          ctx.stroke();

          // Inner dot
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, (isDraggingThis ? 4 : 2) / zoomScale, 0, Math.PI * 2);
          ctx.fillStyle = isDraggingThis ? '#FFFFFF' : '#8B5CF6';
          ctx.fill();
        });
        ctx.restore();
      }
    }

    // Render current in-progress Pen selection path
    if (activeTool === 'LSO' && lassoMode === 'pen' && penLassoPoints && penLassoPoints.length > 0) {
      ctx.save();
      
      // Draw path lines
      ctx.beginPath();
      ctx.moveTo(penLassoPoints[0].x, penLassoPoints[0].y);
      for (let i = 1; i < penLassoPoints.length; i++) {
        ctx.lineTo(penLassoPoints[i].x, penLassoPoints[i].y);
      }
      
      // Draw live rubberband line from last point to current cursor pos
      ctx.lineTo(currentCursorPos.x, currentCursorPos.y);
      
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
      ctx.lineWidth = 2 / zoomScale;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      
      // Draw the dots
      penLassoPoints.forEach((pt, index) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 5 / zoomScale, 0, Math.PI * 2);
        
        if (index === 0) {
          // Accent highlighted circle for first point
          ctx.fillStyle = '#F59E0B';
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2 / zoomScale;
          ctx.fill();
          ctx.stroke();
          
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 9 / zoomScale, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
          ctx.lineWidth = 1.5 / zoomScale;
          ctx.stroke();
        } else {
          ctx.fillStyle = '#374151';
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 1.5 / zoomScale;
          ctx.fill();
          ctx.stroke();
        }
      });
      
      ctx.restore();
    }

    // Restore clipping path state
    ctx.restore();

    // Restore top-level viewport zoom/pan transformation
    ctx.restore();
    });

    return () => cancelAnimationFrame(animId);
  }, [
    objects,
    selectedObjectId,
    bones,
    isDrawing,
    strokePoints,
    knifePath,
    activeTool,
    boneStartPoint,
    currentCursorPos,
    snappedPivot,
    elasticWarningId,
    showBones,
    zoomScale,
    zoomOffset,
    lassoPoints,
    fslPoints,
    hideLassoSelection,
    hideFslSelection,
    lassoMode,
    penLassoPoints,
    artboardW,
    artboardH,
    isRecording
  ]);

  const handleVdfDoneAndBind = (objId: string) => {
    setObjects(prev => {
      const targetObj = prev[objId];
      if (!targetObj || !targetObj.customVectorDeformState) return prev;
      const vdfState = targetObj.customVectorDeformState;
      if (!vdfState.nodes || vdfState.nodes.length < 2) {
        alert("Please place at least 2 vector points on the drawing first.");
        return prev;
      }
      const frozenNodes = vdfState.nodes.map(n => ({
        ...n,
        origX: n.x,
        origY: n.y
      }));
      return {
        ...prev,
        [objId]: {
          ...targetObj,
          customVectorDeformState: {
            ...vdfState,
            isDrawingPhase: false,
            nodes: frozenNodes,
            origObjectPoints: JSON.parse(JSON.stringify(targetObj.points))
          }
        }
      };
    });
  };

  const handleVdfResetNodes = (objId: string) => {
    setObjects(prev => {
      const targetObj = prev[objId];
      if (!targetObj || !targetObj.customVectorDeformState) return prev;
      const vdfState = targetObj.customVectorDeformState;
      if (!vdfState.nodes) return prev;
      const resetNodes = vdfState.nodes.map(n => ({ ...n, x: n.origX, y: n.origY }));
      const restoredPoints = vdfState.origObjectPoints ? JSON.parse(JSON.stringify(vdfState.origObjectPoints)) : targetObj.points;
      return {
        ...prev,
        [objId]: {
          ...targetObj,
          points: restoredPoints,
          customVectorDeformState: {
            ...vdfState,
            nodes: resetNodes
          }
        }
      };
    });
  };

  const handleVdfEditNodes = (objId: string) => {
    setObjects(prev => {
      const targetObj = prev[objId];
      if (!targetObj || !targetObj.customVectorDeformState) return prev;
      const vdfState = targetObj.customVectorDeformState;
      return {
        ...prev,
        [objId]: {
          ...targetObj,
          customVectorDeformState: {
            ...vdfState,
            isDrawingPhase: true
          }
        }
      };
    });
  };

  const handleVdfBakeDeformation = (objId: string) => {
    setObjects(prev => {
      const targetObj = prev[objId];
      if (!targetObj) return prev;
      return {
        ...prev,
        [objId]: {
          ...targetObj,
          customVectorDeformState: undefined
        }
      };
    });
  };

  const handleVdfClearPoints = (objId: string) => {
    setObjects(prev => {
      const targetObj = prev[objId];
      if (!targetObj || !targetObj.customVectorDeformState) return prev;
      return {
        ...prev,
        [objId]: {
          ...targetObj,
          customVectorDeformState: {
            ...targetObj.customVectorDeformState,
            nodes: [],
            isDrawingPhase: true
          }
        }
      };
    });
  };

  return (
    <div ref={containerRef} className="flex-1 bg-white relative overflow-hidden select-none">
      {/* Double canvas layout for background / overlays optimization */}
      <canvas
        ref={backCanvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="absolute inset-0 pointer-events-none"
      />
      <canvas
        ref={frontCanvasRef}
        id="front-vector-canvas"
        width={dimensions.width}
        height={dimensions.height}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        className={`absolute inset-0 touch-none ${
          activeTool === 'ZOM' 
            ? (dragMode === 'pan' ? 'cursor-grabbing' : 'cursor-grab') 
            : 'cursor-crosshair'
        }`}
      />



      {/* Canvas bottom controls (zoom HUD) */}

      {/* Premium Canvas Size Configuration Dialog Modal Overlay */}
      {showCanvasSizePanel && (
        <div 
          id="canvas-size-modal-overlay" 
          className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center z-[100] pointer-events-auto animate-fade-in"
        >
          <div 
            className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl shadow-2xl w-full max-w-sm flex flex-col gap-5 text-white animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-amber-500 font-extrabold tracking-widest uppercase">Canvas Setup</span>
              <h3 className="text-base font-black uppercase tracking-wider text-neutral-100">Adjust Stage Resolution</h3>
              <p className="text-[11px] text-neutral-400 font-semibold leading-relaxed">
                Resize the active drawing sheet. The canvas in the background will adapt instantly to your changes.
              </p>
            </div>

            {/* Live Size Badge */}
            <div className="bg-neutral-950 px-4 py-2 rounded-2xl border border-neutral-800 flex items-center justify-between font-mono">
              <span className="text-[10px] uppercase font-black text-neutral-500">Active Resolution</span>
              <span className="text-xs font-bold text-amber-400">{artboardW} × {artboardH} px</span>
            </div>

            {/* Presets Grid */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] text-neutral-400 uppercase font-black tracking-wide">Presets</span>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: 'HD Stage', w: 1280, h: 720 },
                  { label: 'Full HD', w: 1920, h: 1080 },
                  { label: 'Square Post', w: 1080, h: 1080 },
                  { label: 'Standard', w: 1400, h: 900 }
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setArtboardW(p.w);
                      setArtboardH(p.h);
                      setTempArtboardW(p.w.toString());
                      setTempArtboardH(p.h.toString());
                    }}
                    className={`px-2.5 py-1.5 rounded-xl border text-[10px] font-black uppercase text-left transition-all cursor-pointer ${
                      artboardW === p.w && artboardH === p.h
                        ? 'bg-amber-500/10 border-amber-500/50 text-amber-400'
                        : 'bg-neutral-850 hover:bg-neutral-800 border-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <div>{p.label}</div>
                    <div className="text-[9px] text-neutral-500 font-mono mt-0.5">{p.w}x{p.h}px</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Inputs Grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Width */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[9px] text-neutral-400 uppercase font-black tracking-wide">Width (px)</span>
                <div className="flex items-center bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden h-9">
                  <button
                    type="button"
                    onClick={() => {
                      const current = parseInt(tempArtboardW) || artboardW;
                      const next = Math.max(100, current - 100);
                      setTempArtboardW(next.toString());
                      setArtboardW(next);
                    }}
                    className="w-8 h-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors font-bold text-xs shrink-0 cursor-pointer"
                  >
                    -
                  </button>
                  <input
                    type="text"
                    value={tempArtboardW}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setTempArtboardW(val);
                      const parsed = parseInt(val);
                      if (!isNaN(parsed) && parsed >= 100 && parsed <= 10000) {
                        setArtboardW(parsed);
                      }
                    }}
                    className="w-full h-full bg-transparent text-center text-xs font-mono font-bold focus:outline-none text-amber-400"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const current = parseInt(tempArtboardW) || artboardW;
                      const next = Math.min(10000, current + 100);
                      setTempArtboardW(next.toString());
                      setArtboardW(next);
                    }}
                    className="w-8 h-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors font-bold text-xs shrink-0 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Height */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[9px] text-neutral-400 uppercase font-black tracking-wide">Height (px)</span>
                <div className="flex items-center bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden h-9">
                  <button
                    type="button"
                    onClick={() => {
                      const current = parseInt(tempArtboardH) || artboardH;
                      const next = Math.max(100, current - 100);
                      setTempArtboardH(next.toString());
                      setArtboardH(next);
                    }}
                    className="w-8 h-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors font-bold text-xs shrink-0 cursor-pointer"
                  >
                    -
                  </button>
                  <input
                    type="text"
                    value={tempArtboardH}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setTempArtboardH(val);
                      const parsed = parseInt(val);
                      if (!isNaN(parsed) && parsed >= 100 && parsed <= 10000) {
                        setArtboardH(parsed);
                      }
                    }}
                    className="w-full h-full bg-transparent text-center text-xs font-mono font-bold focus:outline-none text-amber-400"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const current = parseInt(tempArtboardH) || artboardH;
                      const next = Math.min(10000, current + 100);
                      setTempArtboardH(next.toString());
                      setArtboardH(next);
                    }}
                    className="w-8 h-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors font-bold text-xs shrink-0 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  setShowCanvasSizePanel(false);
                  // Trigger a fit/center
                  setTimeout(recenterCanvas, 0);
                }}
                className="flex-1 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-extrabold text-xs rounded-xl uppercase tracking-wider transition-colors cursor-pointer text-center"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const w = Math.max(100, Math.min(10000, parseInt(tempArtboardW) || artboardW));
                  const h = Math.max(100, Math.min(10000, parseInt(tempArtboardH) || artboardH));
                  setArtboardW(w);
                  setArtboardH(h);
                  setTempArtboardW(w.toString());
                  setTempArtboardH(h.toString());
                  setShowCanvasSizePanel(false);
                  
                  // Recenter and lock instantly
                  setTimeout(() => {
                    const scaleX = (dimensions.width - 48) / w;
                    const scaleY = (dimensions.height - 48) / h;
                    const bestScale = Math.min(2.0, Math.max(0.3, Math.min(scaleX, scaleY)));
                    const offsetX = (dimensions.width - w * bestScale) / 2;
                    const offsetY = (dimensions.height - h * bestScale) / 2;
                    setZoomScale(bestScale);
                    setZoomOffset({ x: offsetX, y: offsetY });
                  }, 0);
                }}
                className="flex-1 py-2 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-600 hover:to-amber-500 text-neutral-950 font-black text-xs rounded-xl uppercase tracking-wider transition-all cursor-pointer shadow-md text-center"
              >
                Apply & Fit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Canvas controls HUD */}
      {!isRecording && !isPlaying && (
        <div id="canvas-zoom-hud" className="absolute bottom-4 right-4 flex items-center gap-1 bg-white/95 backdrop-blur-md px-2.5 py-1 rounded-full border border-gray-200 shadow-md pointer-events-auto z-50">
          <button
            id="btn-zoom-out"
            onClick={zoomOut}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors flex items-center justify-center cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          
          <span className="font-mono text-xs font-bold text-gray-700 select-none min-w-[40px] text-center">
            {Math.round(zoomScale * 100)}%
          </span>

          <button
            id="btn-zoom-in"
            onClick={zoomIn}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors flex items-center justify-center cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>

          <div className="h-4 w-[1px] bg-gray-200 mx-1" />

          <button
            id="btn-reset-zoom"
            onClick={recenterCanvas}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors flex items-center justify-center cursor-pointer"
            title="Recenter & Fit Canvas to Viewport"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          <button
            id="btn-fit-workspace"
            onClick={fitCanvasToViewport}
            className="hidden lg:flex p-1.5 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors items-center justify-center cursor-pointer"
            title="Fit Canvas & Resolution to Workspace (strictly PC / Large Screens)"
          >
            <Maximize2 className="h-3.5 w-3.5 text-amber-500" />
          </button>
        </div>
      )}
    </div>
  );
}
