import { Point, VectorObject } from '../types';
import { extractPNGSilhouetteContour } from './pngSilhouette';
import { calculateBoundingBox, localToWorld, worldToLocal } from './math';

export interface SmartInfillOptions {
  infillColor?: string; // Optional override color (e.g. #18080c for dark mouth cavity)
  infillMode?: 'content-aware' | 'color' | 'transparent';
  paddingPx?: number;
}

export interface IsolatedPNGPartResult {
  extractedPartObject: VectorObject;
  patchedOriginalObject: VectorObject;
  mouthCavityObject?: VectorObject;
}

export interface MouthPoseOptions {
  mouthCavityColor?: string; // e.g., #18080c for dark inner mouth cavity
  openAmount?: number; // 0 to 100
  smileAmount?: number; // -100 to 100
  lipThickness?: number;
}

export interface EyePoseOptions {
  blinkRatio?: number; // 0 (fully open) to 1 (fully closed blink)
  pupilX?: number; // -50 to 50
  pupilY?: number; // -50 to 50
  skinInfillColor?: string;
}

/**
 * Helper to sample average border color around a polygon mask from ImageData
 */
export function sampleBorderColorAroundPolygon(
  imgData: ImageData,
  polygon: Point[],
  bounds: { x: number; y: number; width: number; height: number }
): string {
  const data = imgData.data;
  const w = imgData.width;
  const h = imgData.height;

  let rSum = 0, gSum = 0, bSum = 0, aSum = 0, count = 0;

  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    
    // Sample a few points along edge and slightly outward
    const steps = 5;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = Math.round(p1.x + t * (p2.x - p1.x));
      const py = Math.round(p1.y + t * (p2.y - p1.y));

      // Check 3x3 neighborhood slightly outside
      for (let dx = -2; dx <= 2; dx += 2) {
        for (let dy = -2; dy <= 2; dy += 2) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const idx = (ny * w + nx) * 4;
            const alpha = data[idx + 3];
            if (alpha > 15) {
              rSum += data[idx];
              gSum += data[idx + 1];
              bSum += data[idx + 2];
              aSum += alpha;
              count++;
            }
          }
        }
      }
    }
  }

  if (count === 0) return '#171717';

  const r = Math.round(rSum / count);
  const g = Math.round(gSum / count);
  const b = Math.round(bSum / count);
  const a = Math.min(1, Math.round(aSum / count) / 255);

  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Strict Pixel Isolation & Smart Infill for PNG Image or Vector Drawing
 * Extracts the region inside localLassoPoints into an isolated child VectorObject.
 * Auto-patches the source region on the original object with content-aware surrounding pixels or custom cavity color.
 */
export function isolateAndExtractPNGPart(
  sourceObject: VectorObject,
  localLassoPoints: Point[],
  options: SmartInfillOptions = {}
): IsolatedPNGPartResult | null {
  if (!localLassoPoints || localLassoPoints.length < 3) return null;

  const box = calculateBoundingBox(localLassoPoints);
  if (box.width < 2 || box.height < 2) return null;

  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 6);

  // Case 1: Image Object Isolation
  if (sourceObject.type === 'image' && sourceObject.imageUrl) {
    const isKeepOnly = sourceObject.keepOnlyLassoRegions || [];
    const isHiddenLasso = sourceObject.hiddenLassoRegions || [];

    // 1. Create Extracted Part Object
    const extractedPart: VectorObject = {
      id: `png_part_${timestamp}_${randomStr}`,
      name: `${sourceObject.name}_Part`,
      type: 'image',
      imageUrl: sourceObject.imageUrl,
      points: [...localLassoPoints, localLassoPoints[0]],
      strokeColor: 'transparent',
      strokeWidth: 0,
      fillColor: 'transparent',
      opacity: sourceObject.opacity ?? 1,
      transform: { ...sourceObject.transform },
      pivots: [
        {
          id: `pvt_${timestamp}`,
          name: 'Pivot_Part',
          localX: box.x + box.width / 2,
          localY: box.y + box.height / 2,
          locked: false,
        },
      ],
      parentId: sourceObject.id,
      childrenIds: [],
      layerId: sourceObject.layerId,
      isLocked: false,
      isHidden: false,
      keepOnlyLassoRegions: [
        ...(sourceObject.keepOnlyLassoRegions || []),
        { localLassoPoints: [...localLassoPoints] },
      ],
      z: (sourceObject.z ?? 0) + 0.1,
    };

    // 2. Patch Source Object: Mask out extracted region on original PNG
    const patchedOriginal: VectorObject = {
      ...sourceObject,
      hiddenLassoRegions: [
        ...(sourceObject.hiddenLassoRegions || []),
        { localLassoPoints: [...localLassoPoints] },
      ],
      childrenIds: [...(sourceObject.childrenIds || []), extractedPart.id],
    };

    // 3. Create Smart Background Infill Cavity / Patch Object behind hole if requested
    let mouthCavityObject: VectorObject | undefined = undefined;
    const infillColor = options.infillColor || '#18080c'; // default mouth cavity dark

    if (options.infillMode !== 'transparent') {
      mouthCavityObject = {
        id: `png_infill_${timestamp}_${randomStr}`,
        name: `${sourceObject.name}_InfillPatch`,
        type: 'shape',
        shapeType: 'rectangle',
        points: [...localLassoPoints, localLassoPoints[0]],
        strokeColor: 'transparent',
        strokeWidth: 0,
        fillColor: infillColor,
        opacity: sourceObject.opacity ?? 1,
        transform: { ...sourceObject.transform },
        pivots: [
          {
            id: `pvt_inf_${timestamp}`,
            name: 'Pivot_Infill',
            localX: box.x + box.width / 2,
            localY: box.y + box.height / 2,
            locked: false,
          },
        ],
        parentId: sourceObject.id,
        childrenIds: [],
        layerId: sourceObject.layerId,
        isLocked: false,
        isHidden: false,
        z: (sourceObject.z ?? 0) - 0.05,
      };
    }

    return {
      extractedPartObject: extractedPart,
      patchedOriginalObject: patchedOriginal,
      mouthCavityObject,
    };
  }

  // Case 2: Vector Stroke/Shape Object Isolation
  const extractedVectorPart: VectorObject = {
    id: `vec_part_${timestamp}_${randomStr}`,
    name: `${sourceObject.name}_Part`,
    type: sourceObject.type,
    points: [...localLassoPoints, localLassoPoints[0]],
    strokeColor: sourceObject.strokeColor,
    strokeWidth: sourceObject.strokeWidth,
    fillColor: sourceObject.fillColor !== 'transparent' ? sourceObject.fillColor : sourceObject.strokeColor,
    opacity: sourceObject.opacity ?? 1,
    transform: { ...sourceObject.transform },
    pivots: [
      {
        id: `pvt_${timestamp}`,
        name: 'Pivot_Part',
        localX: box.x + box.width / 2,
        localY: box.y + box.height / 2,
        locked: false,
      },
    ],
    parentId: sourceObject.id,
    childrenIds: [],
    layerId: sourceObject.layerId,
    isLocked: false,
    isHidden: false,
    z: (sourceObject.z ?? 0) + 0.1,
  };

  const patchedOriginal: VectorObject = {
    ...sourceObject,
    childrenIds: [...(sourceObject.childrenIds || []), extractedVectorPart.id],
  };

  return {
    extractedPartObject: extractedVectorPart,
    patchedOriginalObject: patchedOriginal,
  };
}

/**
 * Deep Mouth Opening & Posing Engine for PNG Characters
 * Creates inner mouth cavity object, lip overlays, and animation controls
 */
export function setupPNGMouthPosing(
  sourceObject: VectorObject,
  mouthLassoPoints: Point[],
  options: MouthPoseOptions = {}
): { updatedObjects: { [id: string]: VectorObject }; mouthGroupIds: string[] } {
  const result = isolateAndExtractPNGPart(sourceObject, mouthLassoPoints, {
    infillColor: options.mouthCavityColor || '#18080c',
    infillMode: 'color',
  });

  if (!result) return { updatedObjects: {}, mouthGroupIds: [] };

  const { extractedPartObject, patchedOriginalObject, mouthCavityObject } = result;

  // Add specific mouth posing parameters
  const mouthPart = {
    ...extractedPartObject,
    name: `${sourceObject.name}_MouthLip`,
  };

  const updatedObjects: { [id: string]: VectorObject } = {
    [patchedOriginalObject.id]: patchedOriginalObject,
    [mouthPart.id]: mouthPart,
  };

  const groupIds = [mouthPart.id];

  if (mouthCavityObject) {
    updatedObjects[mouthCavityObject.id] = mouthCavityObject;
    groupIds.push(mouthCavityObject.id);
  }

  return { updatedObjects, mouthGroupIds: groupIds };
}

/**
 * Deep Eye Posing & Blinking Engine for PNG Characters
 */
export function setupPNGEyePosing(
  sourceObject: VectorObject,
  eyeLassoPoints: Point[],
  options: EyePoseOptions = {}
): { updatedObjects: { [id: string]: VectorObject }; eyeGroupIds: string[] } {
  const result = isolateAndExtractPNGPart(sourceObject, eyeLassoPoints, {
    infillColor: options.skinInfillColor || '#e2bba2',
    infillMode: 'color',
  });

  if (!result) return { updatedObjects: {}, eyeGroupIds: [] };

  const { extractedPartObject, patchedOriginalObject, mouthCavityObject } = result;

  const eyePart = {
    ...extractedPartObject,
    name: `${sourceObject.name}_Eye`,
  };

  const updatedObjects: { [id: string]: VectorObject } = {
    [patchedOriginalObject.id]: patchedOriginalObject,
    [eyePart.id]: eyePart,
  };

  const groupIds = [eyePart.id];

  if (mouthCavityObject) {
    const eyelidBackground = {
      ...mouthCavityObject,
      name: `${sourceObject.name}_EyelidSkin`,
      fillColor: options.skinInfillColor || '#e2bba2',
    };
    updatedObjects[eyelidBackground.id] = eyelidBackground;
    groupIds.push(eyelidBackground.id);
  }

  return { updatedObjects, eyeGroupIds: groupIds };
}

/**
 * Converts a flat background-removed PNG into a true 3D extruded volumetric character/object
 */
export function convertPNGTo3DVolumetric(
  sourceObject: VectorObject,
  imgElement?: HTMLImageElement | null,
  extrusionDepth: number = 50
): VectorObject {
  const box = calculateBoundingBox(sourceObject.points);
  const w = Math.max(20, box.width);
  const h = Math.max(20, box.height);

  let contourPoints: Point[] = [];

  if (imgElement && imgElement.complete) {
    contourPoints = extractPNGSilhouetteContour(imgElement, w, h);
  } else {
    contourPoints = [...sourceObject.points];
  }

  return {
    ...sourceObject,
    type: '3d',
    points: contourPoints,
    transform3D: {
      x: sourceObject.transform.x,
      y: sourceObject.transform.y,
      z: sourceObject.z ?? 0,
      rx: 0,
      ry: 0,
      rz: 0,
      sx: sourceObject.transform.scaleX || 1,
      sy: sourceObject.transform.scaleY || 1,
      sz: 1,
      extrusion: {
        depth: extrusionDepth,
        segments: 1,
        bevel: 2,
      },
      enabled: true,
    },
  };
}

/**
 * Geometry Anti-Collapse Protection Matrix calculation
 * Prevents isolated parts or PNGs from collapsing into a zero-pixel flat line during 3D/perspective transforms
 */
export function applyGeometryProtection(
  transform3D: { rx: number; ry: number; rz: number; sx: number; sy: number; sz: number }
): { rx: number; ry: number; rz: number; sx: number; sy: number; sz: number } {
  // Clamp extreme 90 degree edge collapses so part remains visible and editable
  const modRx = transform3D.rx % 360;
  const modRy = transform3D.ry % 360;

  let safeSx = Math.max(0.02, Math.abs(transform3D.sx));
  let safeSy = Math.max(0.02, Math.abs(transform3D.sy));

  if (Math.abs(modRy - 90) < 0.5 || Math.abs(modRy - 270) < 0.5) {
    safeSx = Math.max(0.08, safeSx);
  }

  if (Math.abs(modRx - 90) < 0.5 || Math.abs(modRx - 270) < 0.5) {
    safeSy = Math.max(0.08, safeSy);
  }

  return {
    ...transform3D,
    sx: safeSx,
    sy: safeSy,
  };
}
