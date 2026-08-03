import React, { useState } from 'react';
import CustomColorPicker from './CustomColorPicker';
import PNGDeepEditBar from './PNGDeepEditBar';
import { 
  isolateAndExtractPNGPart, 
  setupPNGMouthPosing, 
  setupPNGEyePosing, 
  convertPNGTo3DVolumetric, 
  applyGeometryProtection 
} from '../utils/pngDeepEdit';
import { 
  ChevronRight, 
  ChevronLeft,
  ChevronDown,
  Settings, 
  Trash2, 
  Plus, 
  Lock, 
  Unlock, 
  Scale, 
  RotateCw, 
  Move,
  CheckSquare,
  CheckCircle,
  Square as SquareIcon,
  Layers,
  Workflow,
  Sparkles,
  Feather,
  GitMerge,
  Maximize2,
  Folder,
  FolderPlus,
  Link,
  Unlink,
  Play,
  Zap,
  Info,
  Box,
  Palette,
  MapPin,
  Scissors,
  GitFork,
  Activity,
  GitCommit,
  RotateCcw
} from 'lucide-react';
import { calculateCustomVectorDeformedPoints, calculateRigidLinearDeformedPoints } from '../utils/vectorDeform';
import { VectorObject, Bone, Layer, Pivot, Transform, Point, Frame, RealismSettings, SmartMeshColorState, SmartWarpState, ColorMeshPoint, ColorMeshCell, BrushSettings, LiquifyBrushSettings, SubExtrusion, CustomVectorDeformNode } from '../types';
import { distance, localToWorld, worldToLocal, calculateBoundingBox, isPointInPolygon, findClosestView360, rotatePoint, finalizeContinuousObject, extractAllSubPaths, unifyStrokesToSinglePath, resamplePointsBySpacing, extrudeVertices, smoothSelectedVertices, flattenSelectedVertices, mirrorSelectedVertices } from '../utils/math';
import { extrude2DTo3D, deleteFace3D, extrudeFace3D, extrudeEdge3D } from '../utils/engine3D';
import CustomSelect from './CustomSelect';

const hslToHex = (h: number, s: number = 100, l: number = 50): string => {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    const hex = Math.round(255 * color).toString(16).padStart(2, '0');
    return hex;
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
};

const hexToHue = (hex: string): number => {
  let r = 0, g = 0, b = 0;
  const hClean = hex.replace('#', '');
  if (hClean.length === 3) {
    r = parseInt(hClean[0] + hClean[0], 16);
    g = parseInt(hClean[1] + hClean[1], 16);
    b = parseInt(hClean[2] + hClean[2], 16);
  } else if (hClean.length === 6) {
    r = parseInt(hClean.substring(0, 2), 16);
    g = parseInt(hClean.substring(2, 4), 16);
    b = parseInt(hClean.substring(4, 6), 16);
  } else {
    return 220; // default to blue hue
  }
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  if (max === min) {
    h = 0;
  } else {
    const d = max - min;
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return Math.round(h * 360);
};

interface RightPanelProps {
  selectedObject: VectorObject | null;
  setSelectedObjectId: (id: string | null) => void;
  updateObject: (id: string, updates: Partial<VectorObject>) => void;
  deleteObject: (id: string) => void;
  objects: { [id: string]: VectorObject };
  bones: Bone[];
  addBone: (bone: Bone) => void;
  deleteBone: (id: string) => void;
  updateBone: (id: string, updates: Partial<Bone>) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  smartPinnedIds: string[]; // List of object IDs pinned to Smart Controls
  toggleSmartPin: (id: string) => void;
  activeTool: string;
  setActiveTool: (tool: string) => void;
  lassoPoints: Point[];
  setLassoPoints: React.Dispatch<React.SetStateAction<Point[]>>;
  lassoMode: 'freehand' | 'pen';
  setLassoMode: (mode: 'freehand' | 'pen') => void;
  penLassoPoints: Point[];
  setPenLassoPoints: React.Dispatch<React.SetStateAction<Point[]>>;
  frames: Frame[];
  setFrames: React.Dispatch<React.SetStateAction<Frame[]>>;
  currentFrameIndex: number;
  setCurrentFrameIndex: React.Dispatch<React.SetStateAction<number>>;
  setObjects: React.Dispatch<React.SetStateAction<{ [id: string]: VectorObject }>>;
  fps: number;
  setFps: (fps: number) => void;
  realismSettings?: RealismSettings;
  setRealismSettings?: React.Dispatch<React.SetStateAction<RealismSettings>>;
  convertTo3D?: (id: string) => void;
  brushSettings?: BrushSettings;
  setBrushSettings?: React.Dispatch<React.SetStateAction<BrushSettings>>;
  selectedDeformPointIndex?: number | null;
  selectedDeformPointType?: 'standard' | 'grid' | '3d' | null;
  deformPointTransform?: Transform;
  updateDeformPointTransform?: (property: string, value: number) => void;
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
  deleteLassoBatch?: () => void;
  separateLassoBatch?: () => void;
  ignoreInnerDrawings?: boolean;
  setIgnoreInnerDrawings?: React.Dispatch<React.SetStateAction<boolean>>;
  applyColorFillToSelected?: () => void;
  inverseDeformPoints?: (pts: Point[], obj: VectorObject) => Point[];
  activeLayerId?: string;
  historyPush?: () => void;
  autoTween?: boolean;
  setAutoTween?: (enabled: boolean) => void;
  toasts?: { id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }[];
  setToasts?: React.Dispatch<React.SetStateAction<{ id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }[]>>;
  dbNotification?: { message: string; type: 'success' | 'error' | 'info' } | null;
  limitNotification?: string | null;
  setLimitNotification?: (val: string | null) => void;
}

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
  const childWorldPoints = child.points.map(p => localToWorld(p, testTransform, childPivot));

  // Check if every child world point is inside the parent polygon
  return childWorldPoints.every(pt => isPointInPolygon(pt, parentWorldPoints));
};

export default function RightPanel({
  selectedObject,
  setSelectedObjectId,
  updateObject,
  deleteObject,
  objects,
  bones,
  addBone,
  deleteBone,
  updateBone,
  open,
  setOpen,
  smartPinnedIds,
  toggleSmartPin,
  activeTool,
  setActiveTool,
  lassoPoints,
  setLassoPoints,
  lassoMode,
  setLassoMode,
  penLassoPoints,
  setPenLassoPoints,
  frames,
  setFrames,
  currentFrameIndex,
  setCurrentFrameIndex,
  setObjects,
  fps,
  setFps,
  realismSettings,
  setRealismSettings,
  convertTo3D,
  brushSettings,
  setBrushSettings,
  selectedDeformPointIndex,
  selectedDeformPointType,
  deformPointTransform,
  updateDeformPointTransform,
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
  deleteLassoBatch,
  separateLassoBatch,
  ignoreInnerDrawings = true,
  setIgnoreInnerDrawings,
  applyColorFillToSelected,
  inverseDeformPoints,
  activeLayerId = 'layer-1',
  historyPush,
  autoTween = false,
  setAutoTween,
  toasts,
  setToasts,
  dbNotification,
  limitNotification,
  setLimitNotification,
}: RightPanelProps) {
  // Active lasso selection points
  const activeLasso = (lassoPoints && lassoPoints.length >= 3) ? lassoPoints : penLassoPoints;

  // Resolve active view drawing if selectedObject is a 360_container so tools strictly operate on the displayed view
  const raw360Container = selectedObject?.type === '360_container' ? selectedObject : null;
  const activeView360 = raw360Container && raw360Container.views360
    ? findClosestView360(raw360Container.views360, raw360Container.currentAngle360 ?? 0)
    : null;
  const activeViewDrawing = (activeView360 && objects[activeView360.drawingId])
    ? objects[activeView360.drawingId]
    : null;

  // targetObject is the actual drawing/PNG object to edit (either active view object or standalone selected object)
  const targetObject = activeViewDrawing || selectedObject;

  // Deep PNG & Vector Studio Handlers
  const handleExtractPart = (infillColor: string) => {
    if (!targetObject) return;
    const pivot = targetObject.pivots?.[0] || { localX: 0, localY: 0 };
    const localLassoPoints = activeLasso.map(p => worldToLocal(p, targetObject.transform, pivot));

    const result = isolateAndExtractPNGPart(targetObject, localLassoPoints, {
      infillColor,
      infillMode: 'color'
    });

    if (!result) return;

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
    if (historyPush) historyPush();
  };

  const handleSetupMouthPosing = (cavityColor: string) => {
    if (!targetObject) return;
    const pivot = targetObject.pivots?.[0] || { localX: 0, localY: 0 };
    const localLassoPoints = activeLasso.map(p => worldToLocal(p, targetObject.transform, pivot));

    const { updatedObjects, mouthGroupIds } = setupPNGMouthPosing(targetObject, localLassoPoints, {
      mouthCavityColor: cavityColor,
    });

    if (Object.keys(updatedObjects).length === 0) return;

    setObjects(prev => ({
      ...prev,
      ...updatedObjects
    }));

    if (mouthGroupIds.length > 0) {
      setSelectedObjectId(mouthGroupIds[0]);
    }
    setLassoPoints([]);
    setPenLassoPoints([]);
    if (historyPush) historyPush();
  };

  const handleSetupEyePosing = (skinColor: string) => {
    if (!targetObject) return;
    const pivot = targetObject.pivots?.[0] || { localX: 0, localY: 0 };
    const localLassoPoints = activeLasso.map(p => worldToLocal(p, targetObject.transform, pivot));

    const { updatedObjects, eyeGroupIds } = setupPNGEyePosing(targetObject, localLassoPoints, {
      skinInfillColor: skinColor,
    });

    if (Object.keys(updatedObjects).length === 0) return;

    setObjects(prev => ({
      ...prev,
      ...updatedObjects
    }));

    if (eyeGroupIds.length > 0) {
      setSelectedObjectId(eyeGroupIds[0]);
    }
    setLassoPoints([]);
    setPenLassoPoints([]);
    if (historyPush) historyPush();
  };

  const handleConvertTo3D = (depth: number) => {
    if (!targetObject) return;
    let imgCache: HTMLImageElement | null = null;
    if (targetObject.imageUrl) {
      imgCache = new Image();
      imgCache.crossOrigin = 'anonymous';
      imgCache.src = targetObject.imageUrl;
    }

    const updatedObj = convertPNGTo3DVolumetric(targetObject, imgCache, depth);

    setObjects(prev => ({
      ...prev,
      [targetObject.id]: updatedObj
    }));
    if (historyPush) historyPush();
  };

  const handleUpdateTransform3D = (updates: any) => {
    if (!targetObject) return;
    const current3D = targetObject.transform3D || {
      x: targetObject.transform.x,
      y: targetObject.transform.y,
      z: targetObject.z ?? 0,
      rx: 0,
      ry: 0,
      rz: 0,
      sx: targetObject.transform.scaleX || 1,
      sy: targetObject.transform.scaleY || 1,
      sz: 1,
      extrusion: { depth: 50, segments: 1, bevel: 2 },
      enabled: true
    };

    const protected3D = applyGeometryProtection({
      rx: updates.rx ?? current3D.rx ?? 0,
      ry: updates.ry ?? current3D.ry ?? 0,
      rz: updates.rz ?? current3D.rz ?? 0,
      sx: updates.sx ?? current3D.sx ?? 1,
      sy: updates.sy ?? current3D.sy ?? 1,
      sz: updates.sz ?? current3D.sz ?? 1,
    });

    const new3D = {
      ...current3D,
      ...updates,
      ...protected3D,
      extrusion: updates.extrusion ? { ...current3D.extrusion, ...updates.extrusion } : current3D.extrusion
    };

    updateObject(targetObject.id, {
      transform3D: new3D,
      transform: {
        ...targetObject.transform,
        scaleY: updates.sy !== undefined ? updates.sy : targetObject.transform.scaleY
      }
    });
  };

  const handleShiftZDepth = (deltaZ: number) => {
    if (!targetObject) return;
    const currentZ = targetObject.z ?? 0;
    const newZ = currentZ + deltaZ;

    updateObject(targetObject.id, {
      z: newZ,
      transform3D: targetObject.transform3D ? { ...targetObject.transform3D, z: newZ } : undefined
    });
    if (historyPush) historyPush();
  };

  const handleApplyCustomColor = (color: string) => {
    if (!targetObject) return;
    updateObject(targetObject.id, {
      fillColor: color,
      subPathFills: { 0: color }
    });
    if (historyPush) historyPush();
  };
  // Batch/Smart Controls check state
  const [smartCheckedIds, setSmartCheckedIds] = useState<{ [id: string]: boolean }>({});
  const [faceExtrudeDist, setFaceExtrudeDist] = useState<number>(30);
  const [edgeExtrudeDist, setEdgeExtrudeDist] = useState<number>(30);
  const [link360DrawingId, setLink360DrawingId] = useState<string>('');
  const [link360Angle, setLink360Angle] = useState<string>('0');

  // 3D Wire Sculpting State
  const [wireSculptActionName, setWireSculptActionName] = useState<string>('Saved Selection');
  const [sculptExtrudeAxis, setSculptExtrudeAxis] = useState<'x' | 'y' | 'z'>('z');
  const [sculptExtrudeDist, setSculptExtrudeDist] = useState<number>(30);
  const [sculptSmoothStrength, setSculptSmoothStrength] = useState<number>(0.5);
  const [sculptFlattenAxis, setSculptFlattenAxis] = useState<'x' | 'y' | 'z'>('z');
  const [sculptMirrorAxis, setSculptMirrorAxis] = useState<'x' | 'y'>('x');
  const [sculptWireSpacing, setSculptWireSpacing] = useState<number>(12);

  // Global Multi-Drawing Lasso states and logic
  const [globalLassoSelectedMap, setGlobalLassoSelectedMap] = useState<{
    [objectId: string]: {
      points: number[];
      subPaths: { [subPathIndex: number]: number[] };
    };
  }>({});

  const [lassoSliders, setLassoSliders] = useState({
    translateX: 0,
    translateY: 0,
    translateZ: 0,
    rotate: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    skewX: 0,
    skewY: 0,
    rotateX: 0,
    rotateY: 0,
    perspective: 0
  });

  const objectsRef = React.useRef(objects);
  React.useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);

  const prevLassoPointsLengthRef = React.useRef(0);

  React.useEffect(() => {
    if (selectedObject?.lassoDeformState?.active && selectedObject.lassoDeformState.transform) {
      const t = selectedObject.lassoDeformState.transform;
      const nextX = t.x || 0;
      const nextY = t.y || 0;
      const nextZ = (t as any).z || 0;
      const nextRot = t.rotation || 0;
      const nextSX = t.scaleX ?? 1;
      const nextSY = t.scaleY ?? 1;
      const nextSZ = (t as any).scaleZ ?? 1;
      const nextSkewX = t.skewX || 0;
      const nextSkewY = t.skewY || 0;
      const nextRotX = t.rotateX || 0;
      const nextRotY = t.rotateY || 0;
      const nextP = t.perspective || 0;

      setLassoSliders(prev => {
        if (prev.translateX === nextX &&
            prev.translateY === nextY &&
            prev.translateZ === nextZ &&
            prev.rotate === nextRot &&
            prev.scaleX === nextSX &&
            prev.scaleY === nextSY &&
            prev.scaleZ === nextSZ &&
            prev.skewX === nextSkewX &&
            prev.skewY === nextSkewY &&
            prev.rotateX === nextRotX &&
            prev.rotateY === nextRotY &&
            prev.perspective === nextP) {
          return prev;
        }
        return {
          translateX: nextX,
          translateY: nextY,
          translateZ: nextZ,
          rotate: nextRot,
          scaleX: nextSX,
          scaleY: nextSY,
          scaleZ: nextSZ,
          skewX: nextSkewX,
          skewY: nextSkewY,
          rotateX: nextRotX,
          rotateY: nextRotY,
          perspective: nextP
        };
      });
    } else {
      setLassoSliders(prev => {
        if (!prev.translateX && !prev.translateY && !prev.translateZ && !prev.rotate &&
            prev.scaleX === 1 && prev.scaleY === 1 && prev.scaleZ === 1 &&
            !prev.skewX && !prev.skewY && !prev.rotateX && !prev.rotateY && !prev.perspective) {
          return prev;
        }
        return {
          translateX: 0,
          translateY: 0,
          translateZ: 0,
          rotate: 0,
          scaleX: 1,
          scaleY: 1,
          scaleZ: 1,
          skewX: 0,
          skewY: 0,
          rotateX: 0,
          rotateY: 0,
          perspective: 0
        };
      });
    }
  }, [
    selectedObject?.id,
    currentFrameIndex,
    selectedObject?.lassoDeformState?.active,
    selectedObject?.lassoDeformState?.transform?.x,
    selectedObject?.lassoDeformState?.transform?.y,
    selectedObject?.lassoDeformState?.transform?.rotation,
    selectedObject?.lassoDeformState?.transform?.scaleX,
    selectedObject?.lassoDeformState?.transform?.scaleY,
    selectedObject?.lassoDeformState?.transform?.skewX,
    selectedObject?.lassoDeformState?.transform?.skewY,
    selectedObject?.lassoDeformState?.transform?.rotateX,
    selectedObject?.lassoDeformState?.transform?.rotateY,
    selectedObject?.lassoDeformState?.transform?.perspective
  ]);

  React.useEffect(() => {
    const activeLasso = (lassoPoints && lassoPoints.length >= 3) ? lassoPoints : (fslPoints && fslPoints.length >= 3 ? fslPoints : null);
    if (activeLasso) {
      if (activeLasso.length !== prevLassoPointsLengthRef.current) {
        setLassoSliders({
          translateX: 0,
          translateY: 0,
          translateZ: 0,
          rotate: 0,
          scaleX: 1,
          scaleY: 1,
          scaleZ: 1,
          skewX: 0,
          skewY: 0,
          rotateX: 0,
          rotateY: 0,
          perspective: 0
        });
      }

      // Compute which points/subPaths of which active/unlocked/visible drawings are strictly inside the lasso
      const map: {
        [objectId: string]: {
          points: number[];
          subPaths: { [subPathIndex: number]: number[] };
        };
      } = {};

      (Object.values(objectsRef.current) as VectorObject[]).forEach(rawObj => {
        let obj = rawObj;
        if (rawObj.type === '360_container' && rawObj.views360) {
          const activeView = findClosestView360(rawObj.views360, rawObj.currentAngle360 ?? 0);
          if (activeView && objectsRef.current[activeView.drawingId]) {
            obj = objectsRef.current[activeView.drawingId];
          }
        }
        if (obj.isHidden || obj.isLocked) return;

        const localPivot = obj.pivots?.[0] || { localX: 0, localY: 0 };
        const insideIndices: number[] = [];
        if (obj.points) {
          obj.points.forEach((p, idx) => {
            const wPt = localToWorld(p, obj.transform, localPivot);
            if (isPointInPolygon(wPt, activeLasso)) {
              insideIndices.push(idx);
            }
          });
        }

        const insideSubPaths: { [subPathIdx: number]: number[] } = {};
        const allSubs = extractAllSubPaths(obj);

        allSubs.forEach((sub, subIdx) => {
          const insideSubIndices: number[] = [];
          const wPts = sub.map(p => localToWorld(p, obj.transform, localPivot));

          wPts.forEach((wPt, idx) => {
            if (isPointInPolygon(wPt, activeLasso)) {
              insideSubIndices.push(idx);
            }
          });

          if (insideSubIndices.length > 0) {
            insideSubPaths[subIdx] = insideSubIndices;
          }
        });

        if (insideIndices.length > 0 || Object.keys(insideSubPaths).length > 0) {
          map[obj.id] = {
            points: insideIndices,
            subPaths: insideSubPaths
          };
        }
      });

      setGlobalLassoSelectedMap(prev => {
        if (JSON.stringify(prev) === JSON.stringify(map)) return prev;
        return map;
      });
    } else {
      setGlobalLassoSelectedMap(prev => Object.keys(prev).length > 0 ? {} : prev);
    }
    prevLassoPointsLengthRef.current = activeLasso ? activeLasso.length : 0;
  }, [lassoPoints, fslPoints, objects]);

  const applyLassoTransformToAllFrames = (type: string, value: number) => {
    const activeLasso = (lassoPoints && lassoPoints.length >= 3) ? lassoPoints : (fslPoints && fslPoints.length >= 3 ? fslPoints : null);
    if (!activeLasso) return;
    const map = globalLassoSelectedMap;
    if (Object.keys(map).length === 0) return;

    // Calculate lasso center in world coordinates
    const sumX = activeLasso.reduce((sum, p) => sum + p.x, 0);
    const sumY = activeLasso.reduce((sum, p) => sum + p.y, 0);
    const lassoCenter = { x: sumX / activeLasso.length, y: sumY / activeLasso.length };

    // Function to transform a single point
    const transformPointWithLasso = (
      p: Point,
      obj: VectorObject,
      center: Point,
      transformType: string,
      val: number
    ): Point => {
      try {
        const localPivot = obj.pivots?.[0] || { localX: 0, localY: 0 };
        const W = localToWorld(p, obj.transform, localPivot);

        let WPrime = { ...W };
        if (transformType === 'translateX') {
          WPrime.x += val;
        } else if (transformType === 'translateY') {
          WPrime.y += val;
        } else if (transformType === 'translateZ') {
          const scaleZFactor = 1 + val / 500;
          WPrime.x = center.x + (W.x - center.x) * scaleZFactor;
          WPrime.y = center.y + (W.y - center.y) * scaleZFactor;
        } else if (transformType === 'rotate') {
          WPrime = rotatePoint(W, val, center);
        } else if (transformType === 'scaleX') {
          WPrime.x = center.x + (W.x - center.x) * val;
        } else if (transformType === 'scaleY') {
          WPrime.y = center.y + (W.y - center.y) * val;
        } else if (transformType === 'scaleZ') {
          WPrime.x = center.x + (W.x - center.x) * val;
          WPrime.y = center.y + (W.y - center.y) * val;
        } else if (transformType === 'skewX') {
          const rad = (val * Math.PI) / 180;
          WPrime.x = W.x + (W.y - center.y) * Math.tan(rad);
        } else if (transformType === 'skewY') {
          const rad = (val * Math.PI) / 180;
          WPrime.y = W.y + (W.x - center.x) * Math.tan(rad);
        } else if (transformType === 'rotateX') {
          const tempT = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, rotateX: val, rotateY: 0, perspective: 0 };
          WPrime = localToWorld(W, tempT, { localX: center.x, localY: center.y });
        } else if (transformType === 'rotateY') {
          const tempT = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, rotateX: 0, rotateY: val, perspective: 0 };
          WPrime = localToWorld(W, tempT, { localX: center.x, localY: center.y });
        } else if (transformType === 'perspective') {
          const tempT = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, rotateX: 0, rotateY: 0, perspective: val };
          WPrime = localToWorld(W, tempT, { localX: center.x, localY: center.y });
        }

        return {
          ...p,
          ...worldToLocal(WPrime, obj.transform, localPivot)
        };
      } catch (err) {
        console.error("Error transforming point with lasso:", err);
        return p;
      }
    };

    // Update current frame's objects state
    setObjects(prev => {
      const updated = { ...prev };
      Object.keys(map).forEach(objId => {
        const obj = updated[objId];
        if (!obj) return;

        const { points: insidePoints, subPaths: insideSubPaths } = map[objId];
        
        let nextPoints = obj.points ? [...obj.points] : [];
        insidePoints.forEach(idx => {
          if (nextPoints[idx]) {
            nextPoints[idx] = transformPointWithLasso(nextPoints[idx], obj, lassoCenter, type, value);
          }
        });

        let nextSubPaths = obj.subPaths ? obj.subPaths.map(sub => [...sub]) : undefined;
        if (nextSubPaths) {
          Object.keys(insideSubPaths).forEach(subIdxStr => {
            const subIdx = parseInt(subIdxStr, 10);
            const indices = insideSubPaths[subIdx];
            if (nextSubPaths[subIdx]) {
              indices.forEach(idx => {
                if (nextSubPaths[subIdx][idx]) {
                  nextSubPaths[subIdx][idx] = transformPointWithLasso(nextSubPaths[subIdx][idx], obj, lassoCenter, type, value);
                }
              });
            }
          });
        }

        updated[objId] = {
          ...obj,
          points: nextPoints,
          subPaths: nextSubPaths
        };
      });
      return updated;
    });

    // Update in all other frames if toggle is enabled, or update current frame keyframe immediately
    if (lassoAllFrames) {
      setFrames(prev => {
        return prev.map(frame => {
          const frameObjects = { ...(frame.objects || {}) };
          let changed = false;

          Object.keys(map).forEach(objId => {
            const obj = frameObjects[objId];
            if (!obj) return;

            changed = true;
            const { points: insidePoints, subPaths: insideSubPaths } = map[objId];
            
            let nextPoints = obj.points ? [...obj.points] : [];
            insidePoints.forEach(idx => {
              if (nextPoints[idx]) {
                nextPoints[idx] = transformPointWithLasso(nextPoints[idx], obj, lassoCenter, type, value);
              }
            });

            let nextSubPaths = obj.subPaths ? obj.subPaths.map(sub => [...sub]) : undefined;
            if (nextSubPaths) {
              Object.keys(insideSubPaths).forEach(subIdxStr => {
                const subIdx = parseInt(subIdxStr, 10);
                const indices = insideSubPaths[subIdx];
                if (nextSubPaths[subIdx]) {
                  indices.forEach(idx => {
                    if (nextSubPaths[subIdx][idx]) {
                      nextSubPaths[subIdx][idx] = transformPointWithLasso(nextSubPaths[subIdx][idx], obj, lassoCenter, type, value);
                    }
                  });
                }
              });
            }

            frameObjects[objId] = {
              ...obj,
              points: nextPoints,
              subPaths: nextSubPaths
            };
          });

          if (changed) {
            return {
              ...frame,
              objects: frameObjects
            };
          }
          return frame;
        });
      });
    } else {
      setFrames(prev => {
        return prev.map((frame, idx) => {
          if (idx !== currentFrameIndex) return frame;
          const frameObjects = { ...(frame.objects || {}) };
          let changed = false;

          Object.keys(map).forEach(objId => {
            const obj = frameObjects[objId];
            if (!obj) return;

            changed = true;
            const { points: insidePoints, subPaths: insideSubPaths } = map[objId];
            
            let nextPoints = obj.points ? [...obj.points] : [];
            insidePoints.forEach(pIdx => {
              if (nextPoints[pIdx]) {
                nextPoints[pIdx] = transformPointWithLasso(nextPoints[pIdx], obj, lassoCenter, type, value);
              }
            });

            let nextSubPaths = obj.subPaths ? obj.subPaths.map(sub => [...sub]) : undefined;
            if (nextSubPaths) {
              Object.keys(insideSubPaths).forEach(subIdxStr => {
                const subIdx = parseInt(subIdxStr, 10);
                const indices = insideSubPaths[subIdx];
                if (nextSubPaths[subIdx]) {
                  indices.forEach(pIdx => {
                    if (nextSubPaths[subIdx][pIdx]) {
                      nextSubPaths[subIdx][pIdx] = transformPointWithLasso(nextSubPaths[subIdx][pIdx], obj, lassoCenter, type, value);
                    }
                  });
                }
              });
            }

            frameObjects[objId] = {
              ...obj,
              points: nextPoints,
              subPaths: nextSubPaths
            };
          });

          if (changed) {
            return {
              ...frame,
              objects: frameObjects
            };
          }
          return frame;
        });
      });
    }
  };

  const handleLassoSliderChange = (type: 'translateX' | 'translateY' | 'translateZ' | 'rotate' | 'scaleX' | 'scaleY' | 'scaleZ' | 'skewX' | 'skewY' | 'rotateX' | 'rotateY' | 'perspective', value: number) => {
    const prevVal = lassoSliders[type];
    let diff = 0;
    if (type === 'scaleX' || type === 'scaleY' || type === 'scaleZ') {
      diff = prevVal !== 0 ? value / prevVal : 1;
    } else {
      diff = value - prevVal;
    }

    if (selectedObject?.lassoDeformState?.active) {
      const currentLassoState = selectedObject.lassoDeformState;
      const currentTransform = currentLassoState.transform || {
        x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, rotateX: 0, rotateY: 0, perspective: 0
      };
      const propMap: Record<string, keyof Transform> = {
        translateX: 'x', translateY: 'y', rotate: 'rotation', scaleX: 'scaleX', scaleY: 'scaleY', skewX: 'skewX', skewY: 'skewY', rotateX: 'rotateX', rotateY: 'rotateY', perspective: 'perspective'
      };
      const targetProp = propMap[type];
      if (targetProp) {
        const updatedTransform = {
          ...currentTransform,
          [targetProp]: value
        };

        if (lassoAllFrames) {
          setFrames(prev => prev.map(frame => {
            if (!frame.objects || !frame.objects[selectedObject.id]) return frame;
            const obj = frame.objects[selectedObject.id];
            if (!obj.lassoDeformState) return frame;
            return {
              ...frame,
              objects: {
                ...frame.objects,
                [selectedObject.id]: {
                  ...obj,
                  lassoDeformState: {
                    ...obj.lassoDeformState,
                    transform: updatedTransform
                  }
                }
              }
            };
          }));
        } else {
          setFrames(prev => prev.map((frame, idx) => {
            if (idx !== currentFrameIndex) return frame;
            if (!frame.objects || !frame.objects[selectedObject.id]) return frame;
            const obj = frame.objects[selectedObject.id];
            return {
              ...frame,
              objects: {
                ...frame.objects,
                [selectedObject.id]: {
                  ...obj,
                  lassoDeformState: {
                    ...(obj.lassoDeformState || currentLassoState),
                    transform: updatedTransform
                  }
                }
              }
            };
          }));
        }

        updateObject(selectedObject.id, {
          lassoDeformState: {
            ...currentLassoState,
            transform: updatedTransform
          }
        });
      }
    } else {
      applyLassoTransformToAllFrames(type, diff);
    }

    setLassoSliders(prev => ({
      ...prev,
      [type]: value
    }));
  };

  const handleLassoNudge = (type: 'translateX' | 'translateY' | 'translateZ' | 'rotate' | 'scaleX' | 'scaleY' | 'scaleZ' | 'skewX' | 'skewY' | 'rotateX' | 'rotateY' | 'perspective', amount: number) => {
    let nextVal = lassoSliders[type] + amount;
    if (type === 'scaleX' || type === 'scaleY' || type === 'scaleZ') {
      nextVal = Math.max(0.01, Number((lassoSliders[type] + amount).toFixed(2)));
    } else {
      nextVal = Number((lassoSliders[type] + amount).toFixed(2));
    }
    handleLassoSliderChange(type, nextVal);
  };

  const handleLassoRecolor = (fillColor?: string, strokeColor?: string) => {
    const activeLasso = (lassoPoints && lassoPoints.length >= 3) ? lassoPoints : (fslPoints && fslPoints.length >= 3 ? fslPoints : null);
    if (!activeLasso) return;

    setObjects(prev => {
      const updated = { ...prev };
      (Object.values(updated) as VectorObject[]).forEach(rawObj => {
        let obj = rawObj;
        if (rawObj.type === '360_container' && rawObj.views360) {
          const activeView = findClosestView360(rawObj.views360, rawObj.currentAngle360 ?? 0);
          if (activeView && updated[activeView.drawingId]) {
            obj = updated[activeView.drawingId];
          }
        }
        if (obj.isHidden || obj.isLocked) return;
        if (obj.layerId && activeLayerId && obj.layerId !== activeLayerId) return;

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
          lassoFills: fillColor ? [
            ...(obj.lassoFills || []),
            { localLassoPoints, color: fillColor }
          ] : obj.lassoFills,
          strokeColor: strokeColor ? strokeColor : obj.strokeColor,
        };
      });
      return updated;
    });
    if (historyPush) historyPush();
  };

  const isLassoActive = (!!lassoPoints && lassoPoints.length >= 3) || !!targetObject?.lassoDeformState?.active;
  const isDeformPointActive = activeTool === 'MSH' && selectedDeformPointIndex !== undefined && selectedDeformPointIndex !== null;
  const vdfState = targetObject?.customVectorDeformState;
  const selNodeIdx = vdfState?.selectedNodeIndex;
  const isMeshPointActive = !!(
    (activeTool === 'PBM' || activeTool === 'VDF' || activeTool === 'VPR' || activeTool === 'RPD' || vdfState?.active) &&
    targetObject &&
    vdfState &&
    selNodeIdx !== undefined &&
    selNodeIdx !== null &&
    vdfState.nodes &&
    vdfState.nodes[selNodeIdx]
  );
  const selNode = isMeshPointActive && vdfState && selNodeIdx !== undefined ? vdfState.nodes[selNodeIdx] : null;

  const currentTransformObj = isLassoActive 
    ? {
        x: lassoSliders.translateX,
        y: lassoSliders.translateY,
        z: lassoSliders.translateZ,
        rotation: lassoSliders.rotate,
        scaleX: lassoSliders.scaleX,
        scaleY: lassoSliders.scaleY,
        scaleZ: lassoSliders.scaleZ,
        skewX: lassoSliders.skewX,
        skewY: lassoSliders.skewY,
        rotateX: lassoSliders.rotateX,
        rotateY: lassoSliders.rotateY,
        perspective: lassoSliders.perspective,
        cameraAngleX: lassoSliders.rotateX,
        cameraAngleY: lassoSliders.rotateY,
      }
    : (targetObject 
        ? (isDeformPointActive
            ? (deformPointTransform || { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, rotateX: 0, rotateY: 0, perspective: 0, cameraAngleX: 0, cameraAngleY: 0 })
            : (isMeshPointActive && selNode
                ? {
                    ...targetObject.transform,
                    x: Number((selNode.x - selNode.origX).toFixed(2)),
                    y: Number((selNode.y - selNode.origY).toFixed(2)),
                    z: selNode.z || 0,
                    rotation: selNode.rotationZ || 0,
                    scaleX: selNode.scaleX ?? 1,
                    scaleY: selNode.scaleY ?? 1,
                    scaleZ: selNode.scaleZ ?? 1,
                    skewX: selNode.skewX || 0,
                    skewY: selNode.skewY || 0,
                    rotateX: selNode.rotationX || 0,
                    rotateY: selNode.rotationY || 0,
                    cameraAngleX: selNode.rotationX || 0,
                    cameraAngleY: selNode.rotationY || 0,
                    width: selNode.width || 100,
                    height: selNode.height || 100,
                    depth: selNode.depth || 40,
                  }
                : targetObject.transform
              )
          )
        : null);

  // AI Smooth Motion & Loop Generator States
  const [animationMode, setAnimationMode] = useState<'single' | 'multi'>('single');
  const [singleStartFrame, setSingleStartFrame] = useState(0);
  const [singleEndFrame, setSingleEndFrame] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(5);
  const [easeType, setEaseType] = useState<'linear' | 'easeIn' | 'easeOut' | 'easeInOut'>('linear');

  const [multiRefStartFrame, setMultiRefStartFrame] = useState(0);
  const [multiRefEndFrame, setMultiRefEndFrame] = useState(0);
  const [multiEndPosFrame, setMultiEndPosFrame] = useState(0);

  // Sync default frame limits when frames length changes
  React.useEffect(() => {
    if (frames.length > 0) {
      const targetSingleEnd = Math.max(0, frames.length - 1);
      if (singleEndFrame >= frames.length && singleEndFrame !== targetSingleEnd) {
        setSingleEndFrame(targetSingleEnd);
      }
      const targetMultiRef = Math.max(0, frames.length - 2);
      if (multiRefEndFrame >= frames.length && multiRefEndFrame !== targetMultiRef) {
        setMultiRefEndFrame(targetMultiRef);
      }
      const targetMultiPos = Math.max(0, frames.length - 1);
      if (multiEndPosFrame >= frames.length && multiEndPosFrame !== targetMultiPos) {
        setMultiEndPosFrame(targetMultiPos);
      }
    } else {
      if (singleEndFrame !== 0) setSingleEndFrame(0);
      if (multiRefEndFrame !== 0) setMultiRefEndFrame(0);
      if (multiEndPosFrame !== 0) setMultiEndPosFrame(0);
    }
  }, [frames.length, singleEndFrame, multiRefEndFrame, multiEndPosFrame]);
  
  // Opposite Controls State
  const [oppositeSection1, setOppositeSection1] = useState<string[]>([]);
  const [oppositeSection2, setOppositeSection2] = useState<string[]>([]);
  const [oppositeMode, setOppositeMode] = useState<'rotation' | 'moveX' | 'moveY'>('rotation');

  // Lasso Color Fill state
  const [lassoColor, setLassoColor] = useState('#E53935');
  const [lassoAllFrames, setLassoAllFrames] = useState(false);

  const handleHideSelected = () => {
    if (!lassoPoints || lassoPoints.length < 3) return;
    
    // Fallback to active selected object if globalLassoSelectedMap is empty but we have a selection
    let targetObjIds = Object.keys(globalLassoSelectedMap);
    if (targetObjIds.length === 0 && selectedObject) {
      targetObjIds = [selectedObject.id];
    }
    
    if (targetObjIds.length === 0) return;

    targetObjIds.forEach(objId => {
      const obj = objects[objId];
      if (!obj) return;

      const localPivot = obj.pivots?.[0] || { localX: 0, localY: 0 };
      const localLassoPoints = lassoPoints.map(wp => worldToLocal(wp, obj.transform, localPivot));
      const currentHiddenLassoRegions = obj.hiddenLassoRegions || [];
      const updatedHiddenLassoRegions = [...currentHiddenLassoRegions, { localLassoPoints }];

      // Also keep point-based hiding for backwards compatibility/fallback
      const mapEntry = globalLassoSelectedMap[objId] || { points: [], subPaths: {} };
      const { points: insidePoints, subPaths: insideSubPaths } = mapEntry;

      const nextHiddenPoints = [...(obj.hiddenPoints || [])];
      insidePoints.forEach(idx => {
        if (!nextHiddenPoints.includes(idx)) {
          nextHiddenPoints.push(idx);
        }
      });

      const nextHiddenSubPaths = { ...(obj.hiddenSubPaths || {}) };
      Object.keys(insideSubPaths).forEach(subIdxStr => {
        const subIdx = parseInt(subIdxStr, 10);
        const indices = insideSubPaths[subIdx];
        const nextSubIndices = [...(nextHiddenSubPaths[subIdx] || [])];
        indices.forEach(idx => {
          if (!nextSubIndices.includes(idx)) {
            nextSubIndices.push(idx);
          }
        });
        nextHiddenSubPaths[subIdx] = nextSubIndices;
      });

      updateObject(objId, {
        hiddenPoints: nextHiddenPoints,
        hiddenSubPaths: nextHiddenSubPaths,
        hiddenLassoRegions: updatedHiddenLassoRegions
      });
    });

    setLassoPoints([]);
  };

  const handleUnhideAll = () => {
    Object.keys(objects).forEach(objId => {
      const obj = objects[objId];
      if (obj && (obj.hiddenPoints?.length || Object.keys(obj.hiddenSubPaths || {}).length || obj.hiddenLassoRegions?.length)) {
        updateObject(objId, {
          hiddenPoints: [],
          hiddenSubPaths: {},
          hiddenLassoRegions: []
        });
      }
    });
  };

  // Smart Mesh Coloring State
  const [brushColor, setBrushColor] = useState('#10b981');

  const handleInitMeshColor = (obj: VectorObject, densityX: number, densityY: number) => {
    const safeDensityX = Math.max(2, Math.min(25, densityX));
    const safeDensityY = Math.max(2, Math.min(25, densityY));
    const bounds = calculateBoundingBox(obj.points.length > 0 ? obj.points : [{ x: -100, y: -100 }, { x: 100, y: 100 }]);
    const w = bounds.width || 200;
    const h = bounds.height || 200;
    const bx = bounds.x;
    const by = bounds.y;

    const cellWidth = w / (safeDensityX - 1);
    const cellHeight = h / (safeDensityY - 1);

    const points: ColorMeshPoint[] = [];
    const cells: ColorMeshCell[] = [];

    for (let y = 0; y < safeDensityY; y++) {
      for (let x = 0; x < safeDensityX; x++) {
        const px = bx + x * cellWidth;
        const py = by + y * cellHeight;
        points.push({
          id: `mcl_pt_${x}_${y}`,
          originalX: px,
          originalY: py,
          currentX: px,
          currentY: py,
          color: null,
          opacity: 1
        });
      }
    }

    for (let y = 0; y < safeDensityY - 1; y++) {
      for (let x = 0; x < safeDensityX - 1; x++) {
        const topLeftIdx = y * safeDensityX + x;
        const topRightIdx = y * safeDensityX + (x + 1);
        const bottomRightIdx = (y + 1) * safeDensityX + (x + 1);
        const bottomLeftIdx = (y + 1) * safeDensityX + x;

        cells.push({
          id: `mcl_cell_${x}_${y}`,
          pointIds: [
            points[topLeftIdx].id,
            points[topRightIdx].id,
            points[bottomRightIdx].id,
            points[bottomLeftIdx].id
          ],
          color: null,
          opacity: 1
        });
      }
    }

    const smartMeshColor: SmartMeshColorState = {
      densityX: safeDensityX,
      densityY: safeDensityY,
      points,
      cells,
      pointSize: 20,
      paintMode: 'cell',
      brushSize: 40,
      brushOpacity: 1.0,
      brushColor: '#10b981',
      activeLayerIndex: 0,
      previewMode: true,
      layers: [
        { id: 'mcl_layer_0', name: 'Base Color Layer', visible: true, locked: false }
      ]
    };

    updateObject(obj.id, { smartMeshColor });
  };

  const handleUpdateMeshColorConfig = (updates: Partial<SmartMeshColorState>) => {
    if (!selectedObject || !selectedObject.smartMeshColor) return;
    updateObject(selectedObject.id, {
      smartMeshColor: {
        ...selectedObject.smartMeshColor,
        ...updates
      }
    });
  };

  const handleAddMeshColorLayer = () => {
    if (!selectedObject || !selectedObject.smartMeshColor) return;
    const layers = [...selectedObject.smartMeshColor.layers];
    const newIdx = layers.length;
    layers.push({
      id: `mcl_layer_${Date.now()}`,
      name: `Layer ${newIdx + 1}`,
      visible: true,
      locked: false
    });
    handleUpdateMeshColorConfig({
      layers,
      activeLayerIndex: newIdx
    });
  };

  const handleDeleteMeshColorLayer = (idx: number) => {
    if (!selectedObject || !selectedObject.smartMeshColor) return;
    const layers = selectedObject.smartMeshColor.layers.filter((_, i) => i !== idx);
    const activeLayerIndex = Math.min(selectedObject.smartMeshColor.activeLayerIndex, layers.length - 1);
    handleUpdateMeshColorConfig({
      layers,
      activeLayerIndex
    });
  };

  const handleToggleMeshColorLayerVis = (idx: number) => {
    if (!selectedObject || !selectedObject.smartMeshColor) return;
    const layers = selectedObject.smartMeshColor.layers.map((l, i) => i === idx ? { ...l, visible: !l.visible } : l);
    handleUpdateMeshColorConfig({ layers });
  };

  const handleClearMeshColors = (obj: VectorObject) => {
    if (!obj.smartMeshColor) return;
    const points = obj.smartMeshColor.points.map(p => ({ ...p, color: null }));
    const cells = obj.smartMeshColor.cells.map(c => ({ ...c, color: null }));
    updateObject(obj.id, {
      smartMeshColor: {
        ...obj.smartMeshColor,
        points,
        cells
      }
    });
  };

  const handleInitSmartWarp = (obj: VectorObject) => {
    const smartWarp: SmartWarpState = {
      pins: [],
      pinSize: 30,
      influenceRadius: 120,
      influenceFalloff: 'smooth',
      showInfluenceArea: true,
      previewMode: true
    };
    updateObject(obj.id, { smartWarp });
  };

  const handleUpdateSmartWarpConfig = (updates: Partial<SmartWarpState>) => {
    if (!selectedObject || !selectedObject.smartWarp) return;
    updateObject(selectedObject.id, {
      smartWarp: {
        ...selectedObject.smartWarp,
        ...updates
      }
    });
  };

  const handleTogglePinLock = (pinId: string) => {
    if (!selectedObject || !selectedObject.smartWarp) return;
    const pins = selectedObject.smartWarp.pins.map(p => p.id === pinId ? { ...p, locked: !p.locked } : p);
    handleUpdateSmartWarpConfig({ pins });
  };

  const handleDeletePin = (pinId: string) => {
    if (!selectedObject || !selectedObject.smartWarp) return;
    const pins = selectedObject.smartWarp.pins.filter(p => p.id !== pinId);
    handleUpdateSmartWarpConfig({ pins });
  };

  const handleResetWarpPins = (obj: VectorObject) => {
    if (!obj.smartWarp) return;
    const updates: Partial<VectorObject> = {
      smartWarp: {
        ...obj.smartWarp,
        pins: []
      }
    };
    if (obj.originalPointsBackup) {
      updates.points = [...obj.originalPointsBackup];
    }
    if (obj.originalSubPathsBackup) {
      updates.subPaths = [...obj.originalSubPathsBackup];
    }
    updateObject(obj.id, updates);
  };

  // Cage Deform helpers
  const handleInitCage = (obj: VectorObject) => {
    let pts = obj.points;
    if (!pts || pts.length === 0) {
      if (obj.subPaths && obj.subPaths.length > 0) {
        pts = obj.subPaths.flat();
      }
    }
    const box = calculateBoundingBox(pts && pts.length > 0 ? pts : [{ x: -100, y: -100 }, { x: 100, y: 100 }]);
    const padX = box.width * 0.15 || 15;
    const padY = box.height * 0.15 || 15;
    const minX = box.x - padX;
    const maxX = box.x + box.width + padX;
    const minY = box.y - padY;
    const maxY = box.y + box.height + padY;
    const midX = box.x + box.width / 2;
    const midY = box.y + box.height / 2;

    const points = [
      { id: 'c0', originalX: minX, originalY: minY, currentX: minX, currentY: minY },
      { id: 'c1', originalX: midX, originalY: minY, currentX: midX, currentY: minY },
      { id: 'c2', originalX: maxX, originalY: minY, currentX: maxX, currentY: minY },
      { id: 'c3', originalX: maxX, originalY: midY, currentX: maxX, currentY: midY },
      { id: 'c4', originalX: maxX, originalY: maxY, currentX: maxX, currentY: maxY },
      { id: 'c5', originalX: midX, originalY: maxY, currentX: midX, currentY: maxY },
      { id: 'c6', originalX: minX, originalY: maxY, currentX: minX, currentY: maxY },
      { id: 'c7', originalX: minX, originalY: midY, currentX: minX, currentY: midY }
    ];
    updateObject(obj.id, {
      cageState: {
        active: true,
        points,
        showGrid: true
      }
    });
  };

  const handleUpdateCageConfig = (updates: Partial<any>) => {
    if (!selectedObject || !selectedObject.cageState) return;
    updateObject(selectedObject.id, {
      cageState: {
        ...selectedObject.cageState,
        ...updates
      }
    });
  };

  const handleResetCage = (obj: VectorObject) => {
    if (!obj.cageState) return;
    const resetPoints = obj.cageState.points.map((pt: any) => ({
      ...pt,
      currentX: pt.originalX,
      currentY: pt.originalY
    }));
    updateObject(obj.id, {
      cageState: {
        ...obj.cageState,
        points: resetPoints
      }
    });
  };

  const handleDisableCage = (obj: VectorObject) => {
    updateObject(obj.id, {
      cageState: {
        active: false,
        points: [],
        showGrid: false
      }
    });
  };

  // Liquify helpers
  const handleInitLiquifyMesh = (obj: VectorObject) => {
    const box = calculateBoundingBox(obj.points && obj.points.length > 0 ? obj.points : [{ x: -50, y: -50 }, { x: 50, y: 50 }]);
    const densityX = 10;
    const densityY = 10;
    const cellW = (box.width || 100) / (densityX - 1);
    const cellH = (box.height || 100) / (densityY - 1);

    const mPoints = [];
    for (let y = 0; y < densityY; y++) {
      for (let x = 0; x < densityX; x++) {
        const px = box.x + x * cellW;
        const py = box.y + y * cellH;
        mPoints.push({
          id: `pt_${x}_${y}`,
          originalX: px,
          originalY: py,
          currentX: px,
          currentY: py,
          pinned: false,
          pinType: null as any
        });
      }
    }

    updateObject(obj.id, {
      meshState: {
        active: true,
        densityX,
        densityY,
        points: mPoints,
        originalPoints: JSON.parse(JSON.stringify(mPoints)),
        pointSize: 10,
        showGrid: true,
        showPoints: false,
        previewMode: true
      }
    });
  };

  const handleResetLiquify = (obj: VectorObject) => {
    if (!obj.meshState) return;
    const resetPoints = obj.meshState.points.map((pt: any) => ({
      ...pt,
      currentX: pt.originalX,
      currentY: pt.originalY
    }));
    updateObject(obj.id, {
      meshState: {
        ...obj.meshState,
        points: resetPoints
      }
    });
  };

  const handleDisableLiquify = (obj: VectorObject) => {
    updateObject(obj.id, {
      meshState: {
        active: false,
        densityX: 10,
        densityY: 10,
        points: [],
        originalPoints: [],
        pointSize: 10,
        showGrid: false,
        showPoints: false,
        previewMode: false
      }
    });
  };

  // Permanent Attachment state
  const [attachmentPieces, setAttachmentPieces] = useState<string[]>([]);
  const [attachSelectedId, setAttachSelectedId] = useState('');
  const [gapFillFeedback, setGapFillFeedback] = useState<string | null>(null);

  // Deep Gap Filler handler
  const handleDeepFillGaps = () => {
    if (!selectedObject) {
      setGapFillFeedback('Please select a drawing on the canvas first.');
      setTimeout(() => setGapFillFeedback(null), 3500);
      return;
    }

    let targetObjects = [selectedObject];

    let count = 0;
    targetObjects.forEach(obj => {
      count++;
      let fillColor = obj.fillColor;
      if (!fillColor || fillColor === 'transparent') {
        if (obj.lassoFills && obj.lassoFills.length > 0) {
          fillColor = obj.lassoFills[obj.lassoFills.length - 1].color;
        } else if (lassoColor && lassoColor !== 'transparent') {
          fillColor = lassoColor;
        } else if (obj.strokeColor && obj.strokeColor !== 'transparent') {
          fillColor = obj.strokeColor;
        } else {
          fillColor = '#E53935';
        }
      }

      let updatedPoints = obj.points ? [...obj.points] : [];
      if (updatedPoints.length >= 3) {
        const first = updatedPoints[0];
        const last = updatedPoints[updatedPoints.length - 1];
        const dist = Math.hypot(last.x - first.x, last.y - first.y);
        if (dist > 1.0) {
          updatedPoints.push({ x: first.x, y: first.y });
        }
      }

      let updatedSubPaths = obj.subPaths ? obj.subPaths.map(sp => {
        let sub = [...sp];
        if (sub.length >= 3) {
          const f = sub[0];
          const l = sub[sub.length - 1];
          if (Math.hypot(l.x - f.x, l.y - f.y) > 1.0) {
            sub.push({ x: f.x, y: f.y });
          }
        }
        return sub;
      }) : undefined;

      const bounds = updatedPoints.length > 0 ? calculateBoundingBox(updatedPoints) : { x: 0, y: 0, width: 100, height: 100 };
      const origBounds = {
        minX: bounds.x,
        minY: bounds.y,
        width: Math.max(1, bounds.width),
        height: Math.max(1, bounds.height)
      };
      const origPoints = updatedPoints.map(p => ({ x: p.x, y: p.y }));

      const updatedFills = obj.lassoFills ? obj.lassoFills.map(f => ({
        ...f,
        color: f.color || fillColor,
        origBounds: f.origBounds || origBounds,
        origPoints: f.origPoints || origPoints
      })) : [];

      updateObject(obj.id, {
        fillColor,
        fillGaps: true,
        autoFillGaps: true,
        deepGapCorrected: true,
        gapFillExpansion: obj.gapFillExpansion || 4,
        points: updatedPoints,
        subPaths: updatedSubPaths,
        lassoFills: updatedFills
      });
    });

    setGapFillFeedback(`✨ Deep Gap Analysis Complete: Sealed and filled all gaps in ${count} drawing(s)!`);
    setTimeout(() => setGapFillFeedback(null), 4000);
  };

  // Lasso handlers
  const handleApplyLassoFill = () => {
    if (lassoPoints.length < 3) {
      alert("Please draw a closed lasso region on the canvas first!");
      return;
    }
    
    // If selectedObject exists, fill it. Otherwise fill all drawings!
    let targetObjects = selectedObject ? [selectedObject] : Object.values(objects);
    
    if (targetObjects.length === 0) {
      alert("No drawings available to fill.");
      return;
    }

    targetObjects.forEach(obj => {
      const localPivot = obj.pivots[0] || { localX: 0, localY: 0 };
      const localDeformedPoints = lassoPoints.map(wp => worldToLocal(wp, obj.transform, localPivot));
      const localLassoPoints = inverseDeformPoints ? inverseDeformPoints(localDeformedPoints, obj) : localDeformedPoints;
      
      const bounds = calculateBoundingBox(obj.points && obj.points.length > 0 ? obj.points : localLassoPoints);
      const origBounds = {
        minX: bounds.x,
        minY: bounds.y,
        width: Math.max(1, bounds.width),
        height: Math.max(1, bounds.height)
      };

      const origPoints = obj.points && obj.points.length > 0 ? obj.points.map(p => ({ x: p.x, y: p.y })) : [];
      const currentFills = obj.lassoFills || [];
      const updatedFills = [...currentFills, { localLassoPoints, color: lassoColor, origBounds, origPoints }];

      const allSubs = extractAllSubPaths(obj);
      const selectedSubMap = globalLassoSelectedMap[obj.id]?.subPaths || {};
      const nextSubPathFills = { ...(obj.subPathFills || {}) };

      Object.keys(selectedSubMap).forEach(subIdxStr => {
        const subIdx = parseInt(subIdxStr, 10);
        nextSubPathFills[subIdx] = lassoColor;
      });

      if (Object.keys(selectedSubMap).length === 0 && allSubs.length >= 1) {
        let lassoSumX = 0, lassoSumY = 0;
        lassoPoints.forEach(p => { lassoSumX += p.x; lassoSumY += p.y; });
        const lassoCentroid = { x: lassoSumX / (lassoPoints.length || 1), y: lassoSumY / (lassoPoints.length || 1) };

        const matchingSubIndices: { idx: number; area: number }[] = [];

        allSubs.forEach((sub, subIdx) => {
          const wPts = sub.map(p => localToWorld(p, obj.transform, localPivot));
          const isLassoInSub = wPts.length >= 3 && isPointInPolygon(lassoCentroid, wPts);
          const isSubInLasso = wPts.some(pt => isPointInPolygon(pt, lassoPoints));
          const isLassoPtInSub = lassoPoints.some(lp => isPointInPolygon(lp, wPts));

          if (isLassoInSub || isSubInLasso || isLassoPtInSub) {
            let area = 0;
            for (let i = 0; i < wPts.length; i++) {
              const j = (i + 1) % wPts.length;
              area += wPts[i].x * wPts[j].y - wPts[j].x * wPts[i].y;
            }
            matchingSubIndices.push({ idx: subIdx, area: Math.abs(area) / 2 });
          }
        });

        if (matchingSubIndices.length > 0) {
          // Sort by area ascending so the innermost (smallest) matching sub-path is chosen
          matchingSubIndices.sort((a, b) => a.area - b.area);
          const targetSubIdx = matchingSubIndices[0].idx;
          nextSubPathFills[targetSubIdx] = lassoColor;
        }
      }
      
      updateObject(obj.id, {
        lassoFills: updatedFills,
        subPaths: obj.subPaths && obj.subPaths.length > 0 ? obj.subPaths : (allSubs.length > 0 ? allSubs : obj.subPaths),
        subPathFills: Object.keys(nextSubPathFills).length > 0 ? nextSubPathFills : obj.subPathFills,
        fillGaps: true,
        autoFillGaps: true,
        gapFillExpansion: obj.gapFillExpansion || 4
      });
    });

    setLassoPoints([]);
    setActiveTool('SEL');
  };

  const handleClearLassoFills = () => {
    if (selectedObject) {
      updateObject(selectedObject.id, { lassoFills: [] });
    } else {
      Object.values(objects).forEach(obj => {
        if (obj.lassoFills && obj.lassoFills.length > 0) {
          updateObject(obj.id, { lassoFills: [] });
        }
      });
    }
  };

  const handleRemoveLassoArea = () => {
    setLassoPoints([]);
    if (setHideLassoSelection) {
      setHideLassoSelection(false);
    }
  };

  // Attachment Handlers
  const handleAddAttachmentPiece = (id: string) => {
    if (!id) return;
    if (attachmentPieces.includes(id)) return;
    setAttachmentPieces(prev => [...prev, id]);
    setAttachSelectedId('');
  };

  const handleExecuteAttach = () => {
    const allIdsToAttach = [...attachmentPieces];
    if (selectedObject && !allIdsToAttach.includes(selectedObject.id)) {
      allIdsToAttach.push(selectedObject.id);
    }

    if (allIdsToAttach.length < 2) {
      alert("Please add at least 2 drawings to attach.");
      return;
    }

    const newGroupId = `attach_gp_${Date.now()}`;

    allIdsToAttach.forEach(id => {
      updateObject(id, { attachedGroupId: newGroupId });
    });

    setAttachmentPieces([]);
    alert(`Successfully attached ${allIdsToAttach.length} drawings together! They are now locked to move as a group.`);
  };

  const handleDetachObject = () => {
    if (!selectedObject) return;
    if (selectedObject.type === '3d' || (selectedObject.parentId && objects[selectedObject.parentId]?.type === '3d')) {
      alert("Rigged 3D objects are permanently locked for safety and performance to prevent physics and skinning decoupling.");
      return;
    }
    updateObject(selectedObject.id, { attachedGroupId: undefined });
    alert(`Successfully detached ${selectedObject.name}.`);
  };

  // AI Smooth Motion & Loop Generator handlers
  const [hasBackup, setHasBackup] = useState(!!localStorage.getItem('generator_original_frames_backup'));

  const handleRestoreBackup = () => {
    const backup = localStorage.getItem('generator_original_frames_backup');
    if (backup) {
      const parsed = JSON.parse(backup);
      setFrames(parsed);
      if (parsed[0]) {
        setObjects(parsed[0].objects);
      }
      setCurrentFrameIndex(0);
      alert("Successfully restored original reference frames!");
    }
  };

  const interpolateTransform = (tStart: Transform, tEnd: Transform, t: number): Transform => {
    const rotStart = tStart.rotation ?? 0;
    const rotEnd = tEnd.rotation ?? 0;
    const rotation = rotStart + t * (rotEnd - rotStart);

    return {
      x: Number((tStart.x + t * (tEnd.x - tStart.x)).toFixed(2)),
      y: Number((tStart.y + t * (tEnd.y - tStart.y)).toFixed(2)),
      rotation: Number(rotation.toFixed(2)),
      scaleX: Number(((tStart.scaleX ?? 1) + t * ((tEnd.scaleX ?? 1) - (tStart.scaleX ?? 1))).toFixed(2)),
      scaleY: Number(((tStart.scaleY ?? 1) + t * ((tEnd.scaleY ?? 1) - (tStart.scaleY ?? 1))).toFixed(2)),
      skewX: tStart.skewX !== undefined && tEnd.skewX !== undefined ? Number((tStart.skewX + t * (tEnd.skewX - tStart.skewX)).toFixed(2)) : tStart.skewX,
      skewY: tStart.skewY !== undefined && tEnd.skewY !== undefined ? Number((tStart.skewY + t * (tEnd.skewY - tStart.skewY)).toFixed(2)) : tStart.skewY,
      rotateX: tStart.rotateX !== undefined && tEnd.rotateX !== undefined ? Number((tStart.rotateX + t * (tEnd.rotateX - tStart.rotateX)).toFixed(2)) : tStart.rotateX,
      rotateY: tStart.rotateY !== undefined && tEnd.rotateY !== undefined ? Number((tStart.rotateY + t * (tEnd.rotateY - tStart.rotateY)).toFixed(2)) : tStart.rotateY,
      perspective: tStart.perspective !== undefined && tEnd.perspective !== undefined ? Number((tStart.perspective + t * (tEnd.perspective - tStart.perspective)).toFixed(2)) : tStart.perspective,
    };
  };

  const handleGenerateSingleStep = () => {
    if (frames.length < 2) {
      alert("Please add at least 2 frames (Start & End) to generate an animation.");
      return;
    }
    
    let F = Math.round(durationSeconds * fps);
    if (F < 2) {
      alert("Please select a longer duration or higher FPS to generate at least 2 frames.");
      return;
    }
    if (F > 500) {
      alert("App Safety Guard: Animation generation capped at 500 frames max to ensure high performance.");
      F = 500;
    }

    const startIdx = Math.max(0, Math.min(singleStartFrame, frames.length - 1));
    const endIdx = Math.max(0, Math.min(singleEndFrame, frames.length - 1));

    if (startIdx === endIdx) {
      alert("Start and End frames must be different.");
      return;
    }

    // Save backup first
    localStorage.setItem('generator_original_frames_backup', JSON.stringify(frames));
    setHasBackup(true);

    const startFrameObjects = frames[startIdx].objects;
    const endFrameObjects = frames[endIdx].objects;

    const newFrames: Frame[] = [];

    for (let i = 0; i < F; i++) {
      const rawT = i / (F - 1);
      
      // Apply Easing
      let t = rawT;
      if (easeType === 'easeIn') {
        t = rawT * rawT;
      } else if (easeType === 'easeOut') {
        t = rawT * (2 - rawT);
      } else if (easeType === 'easeInOut') {
        t = rawT < 0.5 ? 2 * rawT * rawT : -1 + (4 - 2 * rawT) * rawT;
      }

      const frameObjects: { [objectId: string]: any } = {};

      const allObjIds = Array.from(new Set([
        ...Object.keys(startFrameObjects),
        ...Object.keys(endFrameObjects)
      ]));

      allObjIds.forEach(objId => {
        const startObj = startFrameObjects[objId];
        const endObj = endFrameObjects[objId];

        if (startObj && endObj) {
          const interpolatedTransform = interpolateTransform(startObj.transform, endObj.transform, t);

          let points = startObj.points;
          if (startObj.points && endObj.points && startObj.points.length === endObj.points.length) {
            points = startObj.points.map((p, pIdx) => {
              const ep = endObj.points[pIdx];
              return {
                x: Number((p.x + t * (ep.x - p.x)).toFixed(2)),
                y: Number((p.y + t * (ep.y - p.y)).toFixed(2))
              };
            });
          }

          let subPaths = startObj.subPaths;
          if (startObj.subPaths && endObj.subPaths && startObj.subPaths.length === endObj.subPaths.length) {
            subPaths = startObj.subPaths.map((path, pathIdx) => {
              const ePath = endObj.subPaths[pathIdx];
              if (path.length === ePath.length) {
                return path.map((pt, ptIdx) => {
                  const ePt = ePath[ptIdx];
                  return {
                    x: Number((pt.x + t * (ePt.x - pt.x)).toFixed(2)),
                    y: Number((pt.y + t * (ePt.y - pt.y)).toFixed(2))
                  };
                });
              }
              return path;
            });
          }

          let pivots = startObj.pivots;
          if (startObj.pivots && endObj.pivots && startObj.pivots.length === endObj.pivots.length) {
            pivots = startObj.pivots.map((pvt, pvtIdx) => {
              const ePvt = endObj.pivots[pvtIdx];
              return {
                ...pvt,
                localX: Number((pvt.localX + t * (ePvt.localX - pvt.localX)).toFixed(2)),
                localY: Number((pvt.localY + t * (ePvt.localY - pvt.localY)).toFixed(2)),
              };
            });
          }

          const opacity = startObj.opacity !== undefined && endObj.opacity !== undefined
            ? Number((startObj.opacity + t * (endObj.opacity - startObj.opacity)).toFixed(2))
            : startObj.opacity;

          // Interpolate Puppet pins if lengths match
          let pins = startObj.pins;
          if (startObj.pins && endObj.pins && startObj.pins.length === endObj.pins.length) {
            pins = startObj.pins.map((pin, pIdx) => {
              const ep = endObj.pins[pIdx];
              const curX = pin.currentLocalX !== undefined ? pin.currentLocalX : pin.localX;
              const curY = pin.currentLocalY !== undefined ? pin.currentLocalY : pin.localY;
              const eCurX = ep.currentLocalX !== undefined ? ep.currentLocalX : ep.localX;
              const eCurY = ep.currentLocalY !== undefined ? ep.currentLocalY : ep.localY;
              return {
                ...pin,
                currentLocalX: Number((curX + t * (eCurX - curX)).toFixed(2)),
                currentLocalY: Number((curY + t * (eCurY - curY)).toFixed(2)),
              };
            });
          }

          // Interpolate SmartWarp pins if lengths match
          let smartWarp = startObj.smartWarp;
          if (startObj.smartWarp && endObj.smartWarp && startObj.smartWarp.pins && endObj.smartWarp.pins && startObj.smartWarp.pins.length === endObj.smartWarp.pins.length) {
            const interpolatedSmartWarpPins = startObj.smartWarp.pins.map((pin, pIdx) => {
              const ep = endObj.smartWarp.pins[pIdx];
              return {
                ...pin,
                x: Number((pin.x + t * (ep.x - pin.x)).toFixed(2)),
                y: Number((pin.y + t * (ep.y - pin.y)).toFixed(2)),
              };
            });
            smartWarp = {
              ...startObj.smartWarp,
              pins: interpolatedSmartWarpPins
            };
          }

          // Interpolate Mesh Deformation Grid points if active on both
          let meshState = startObj.meshState;
          if (startObj.meshState && endObj.meshState && startObj.meshState.active && endObj.meshState.active) {
            let meshPoints = startObj.meshState.points;
            if (startObj.meshState.points && endObj.meshState.points && startObj.meshState.points.length === endObj.meshState.points.length) {
              meshPoints = startObj.meshState.points.map((p, pIdx) => {
                const ep = endObj.meshState.points[pIdx];
                return {
                  ...p,
                  currentX: Number((p.currentX + t * (ep.currentX - p.currentX)).toFixed(2)),
                  currentY: Number((p.currentY + t * (ep.currentY - p.currentY)).toFixed(2))
                };
              });
            }
            meshState = {
              ...startObj.meshState,
              points: meshPoints
            };
          }

          frameObjects[objId] = {
            ...startObj,
            transform: interpolatedTransform,
            points,
            subPaths,
            pivots,
            opacity,
            pins,
            smartWarp,
            meshState,
          };
        } else if (startObj) {
          frameObjects[objId] = JSON.parse(JSON.stringify(startObj));
        } else if (endObj) {
          frameObjects[objId] = JSON.parse(JSON.stringify(endObj));
        }
      });

      newFrames.push({
        index: i,
        objects: frameObjects,
      });
    }

    setFrames(newFrames);
    setObjects(JSON.parse(JSON.stringify(newFrames[0].objects)));
    setCurrentFrameIndex(0);
    alert(`Successfully generated smooth single-step animation with ${F} frames! Click Play to view.`);
  };

  const handleGenerateMultiStep = () => {
    if (frames.length < 2) {
      alert("Please add at least 2 frames to generate a walk cycle/loop.");
      return;
    }

    let F = Math.round(durationSeconds * fps);
    if (F < 2) {
      alert("Please select a longer duration or higher FPS to generate at least 2 frames.");
      return;
    }
    if (F > 500) {
      alert("App Safety Guard: Animation generation capped at 500 frames max to ensure high performance.");
      F = 500;
    }

    const refStart = Math.max(0, Math.min(multiRefStartFrame, frames.length - 1));
    const refEnd = Math.max(0, Math.min(multiRefEndFrame, frames.length - 1));
    const endPosIdx = Math.max(0, Math.min(multiEndPosFrame, frames.length - 1));

    if (refStart > refEnd) {
      alert("Walk cycle reference Start Frame must be less than or equal to End Frame.");
      return;
    }

    const M = refEnd - refStart + 1;

    // Save backup first
    localStorage.setItem('generator_original_frames_backup', JSON.stringify(frames));
    setHasBackup(true);

    const startFrameObjects = frames[refStart].objects;
    const endFrameObjects = frames[endPosIdx].objects;

    const journeyVectors: { [objId: string]: { dx: number; dy: number } } = {};
    let totalDx = 0;
    let totalDy = 0;
    let countMatched = 0;

    Object.keys(startFrameObjects).forEach(objId => {
      const startObj = startFrameObjects[objId];
      const endObj = endFrameObjects[objId];
      if (startObj && endObj) {
        const dx = endObj.transform.x - startObj.transform.x;
        const dy = endObj.transform.y - startObj.transform.y;
        journeyVectors[objId] = { dx, dy };
        totalDx += dx;
        totalDy += dy;
        countMatched++;
      }
    });

    const avgDx = countMatched > 0 ? totalDx / countMatched : 0;
    const avgDy = countMatched > 0 ? totalDy / countMatched : 0;

    const newFrames: Frame[] = [];

    for (let i = 0; i < F; i++) {
      const rawT = i / (F - 1);
      
      let t = rawT;
      if (easeType === 'easeIn') {
        t = rawT * rawT;
      } else if (easeType === 'easeOut') {
        t = rawT * (2 - rawT);
      } else if (easeType === 'easeInOut') {
        t = rawT < 0.5 ? 2 * rawT * rawT : -1 + (4 - 2 * rawT) * rawT;
      }

      const refIdx = refStart + (i % M);
      const refObjects = frames[refIdx].objects;

      const frameObjects: { [objId: string]: any } = {};

      Object.keys(refObjects).forEach(objId => {
        const refObj = refObjects[objId];
        if (!refObj) return;

        const jVec = journeyVectors[objId] || { dx: avgDx, dy: avgDy };

        const translatedTransform = {
          ...refObj.transform,
          x: Number((refObj.transform.x + t * jVec.dx).toFixed(2)),
          y: Number((refObj.transform.y + t * jVec.dy).toFixed(2))
        };

        frameObjects[objId] = {
          ...JSON.parse(JSON.stringify(refObj)),
          transform: translatedTransform
        };
      });

      newFrames.push({
        index: i,
        objects: frameObjects
      });
    }

    setFrames(newFrames);
    setObjects(JSON.parse(JSON.stringify(newFrames[0].objects)));
    setCurrentFrameIndex(0);
    alert(`Successfully generated walk cycle loop with ${F} frames! Poses repeat, and position glides seamlessly to the target location.`);
  };

  // Hierarchy Management & Auto-Rigging
  const [expandedNodes, setExpandedNodes] = useState<{ [id: string]: boolean }>({});
  const [activeMenuObjectId, setActiveMenuObjectId] = useState<string | null>(null);
  const [activeMenuType, setActiveMenuType] = useState<'options' | 'addChild' | 'addSibling' | null>(null);

  // Merge pieces state (Make Single Drawing)
  const [mergePieces, setMergePieces] = useState<string[]>([]);
  const [isMergeDropdownOpen, setIsMergeDropdownOpen] = useState(false);

  React.useEffect(() => {
    setMergePieces([]);
    setIsMergeDropdownOpen(false);
  }, [selectedObject?.id]);

  const handleMakeSingle = () => {
    if (!selectedObject || mergePieces.length === 0) return;

    const primary = selectedObject;
    const primaryPivot = primary.pivots[0] || { localX: 0, localY: 0 };

    let newSubPaths: Point[][] = [];
    let newSubPathStrokes: { [subPathIdx: number]: { strokeColor?: string; strokeWidth?: number } } = {};
    let newSubPathFills: { [subPathIdx: number]: string } = {};
    let newLassoFills: VectorObject['lassoFills'] = [];
    let newChildrenIds = [...(primary.childrenIds || [])];

    // 1. Collect Primary's own subpaths and properties
    const primarySubs = (primary.subPaths && primary.subPaths.length > 0)
      ? primary.subPaths
      : (primary.points && primary.points.length > 0 ? [primary.points] : []);

    primarySubs.forEach((sub, idx) => {
      newSubPaths.push([...sub]);

      const strokeCol = primary.subPathStrokes?.[idx]?.strokeColor || primary.strokeColor;
      const strokeW = primary.subPathStrokes?.[idx]?.strokeWidth ?? primary.strokeWidth;
      newSubPathStrokes[idx] = { strokeColor: strokeCol, strokeWidth: strokeW };

      const fillCol = primary.subPathFills?.[idx] || (primary.fillColor && primary.fillColor !== 'transparent' ? primary.fillColor : undefined);
      if (fillCol) {
        newSubPathFills[idx] = fillCol;
      }
    });

    if (primary.lassoFills && primary.lassoFills.length > 0) {
      newLassoFills.push(...primary.lassoFills);
    }

    // 2. Merge each secondary object into primary preserving position and individual styles
    mergePieces.forEach(secondaryId => {
      const secondary = objects[secondaryId];
      if (!secondary) return;

      const secondaryPivot = secondary.pivots[0] || { localX: 0, localY: 0 };

      const secSubs = (secondary.subPaths && secondary.subPaths.length > 0)
        ? secondary.subPaths
        : (secondary.points && secondary.points.length > 0 ? [secondary.points] : []);

      secSubs.forEach((sub, secIdx) => {
        const currentIdx = newSubPaths.length;

        // Convert secondary points from secondary local space to primary local space
        const convertedSub = sub.map(p => {
          const worldPt = localToWorld(p, secondary.transform, secondaryPivot);
          const localPt = worldToLocal(worldPt, primary.transform, primaryPivot);
          return {
            ...localPt,
            w: p.w,
            t: p.t,
            angle: p.angle,
            jitterX: p.jitterX,
            jitterY: p.jitterY,
            grainOpacity: p.grainOpacity,
            gap: p.gap
          };
        });

        newSubPaths.push(convertedSub);

        const strokeCol = secondary.subPathStrokes?.[secIdx]?.strokeColor || secondary.strokeColor;
        const strokeW = secondary.subPathStrokes?.[secIdx]?.strokeWidth ?? secondary.strokeWidth;
        newSubPathStrokes[currentIdx] = { strokeColor: strokeCol, strokeWidth: strokeW };

        const fillCol = secondary.subPathFills?.[secIdx] || (secondary.fillColor && secondary.fillColor !== 'transparent' ? secondary.fillColor : undefined);
        if (fillCol) {
          newSubPathFills[currentIdx] = fillCol;
        }
      });

      // Convert secondary subPathFills mapping if extra keys exist
      if (secondary.subPathFills) {
        Object.entries(secondary.subPathFills).forEach(([oldIdxStr, fillVal]) => {
          const oldIdx = parseInt(oldIdxStr, 10);
          if (fillVal && oldIdx < secSubs.length) {
            const newIdx = (newSubPaths.length - secSubs.length) + oldIdx;
            newSubPathFills[newIdx] = fillVal;
          }
        });
      }

      // Convert secondary lassoFills
      if (secondary.lassoFills && secondary.lassoFills.length > 0) {
        secondary.lassoFills.forEach(fill => {
          const convertedPts = (fill.localLassoPoints || []).map(p => {
            const worldPt = localToWorld(p, secondary.transform, secondaryPivot);
            return worldToLocal(worldPt, primary.transform, primaryPivot);
          });
          const convertedOrigPts = fill.origPoints ? fill.origPoints.map(p => {
            const worldPt = localToWorld(p, secondary.transform, secondaryPivot);
            return worldToLocal(worldPt, primary.transform, primaryPivot);
          }) : undefined;

          newLassoFills.push({
            ...fill,
            localLassoPoints: convertedPts,
            origPoints: convertedOrigPts
          });
        });
      }

      // Re-parent children of secondary to primary so hierarchy stays unbroken
      Object.values(objects).forEach(o => {
        if (o.parentId === secondaryId) {
          updateObject(o.id, { parentId: primary.id });
          if (!newChildrenIds.includes(o.id)) {
            newChildrenIds.push(o.id);
          }
        }
      });

      // Inherit parent if primary didn't have one
      if (secondary.parentId && !primary.parentId && secondary.parentId !== primary.id) {
        updateObject(primary.id, { parentId: secondary.parentId });
      }

      // Delete secondary object
      deleteObject(secondaryId);
    });

    // Unify all subpaths into single continuous point array with gap flags
    const unifiedPoints = unifyStrokesToSinglePath(newSubPaths);

    // Update primary object with merged data
    updateObject(primary.id, {
      points: unifiedPoints,
      subPaths: newSubPaths,
      subPathStrokes: newSubPathStrokes,
      subPathFills: newSubPathFills,
      lassoFills: newLassoFills,
      childrenIds: newChildrenIds,
      isContinuousDrawing: true
    });

    // Reset local merge state
    setMergePieces([]);
    setIsMergeDropdownOpen(false);
  };

  // Mesh wrap generator helper
  const handleInitMesh = (densityX: number, densityY: number) => {
    if (!selectedObject) return;
    const safeDensityX = Math.max(2, Math.min(25, densityX));
    const safeDensityY = Math.max(2, Math.min(25, densityY));

    // Collect all stroke points on the drawing (main points + subPaths)
    const strokePts: Point[] = [];
    if (selectedObject.points && selectedObject.points.length > 0) {
      strokePts.push(...selectedObject.points);
    }
    if (selectedObject.subPaths && selectedObject.subPaths.length > 0) {
      selectedObject.subPaths.forEach(sub => strokePts.push(...sub));
    }

    const points: any[] = [];

    // Sample mesh points strictly along the exact contour and stroke curves of the drawing!
    if (strokePts.length > 0) {
      const targetCount = Math.max(16, safeDensityX * 3);
      const sampleStep = Math.max(1, Math.floor(strokePts.length / targetCount));
      strokePts.forEach((pt, idx) => {
        if (idx % sampleStep === 0) {
          const exists = points.some(mp => Math.hypot(mp.originalX - pt.x, mp.originalY - pt.y) < 4);
          if (!exists) {
            points.push({
              id: `mpt_stroke_${Date.now()}_${idx}`,
              originalX: pt.x,
              originalY: pt.y,
              currentX: pt.x,
              currentY: pt.y,
              pinned: false,
              pinType: null
            });
          }
        }
      });
    } else {
      // Fallback: rounded perimeter points along shape contour
      const bounds = calculateBoundingBox([{ x: -50, y: -50 }, { x: 50, y: 50 }]);
      const cx = bounds.x + (bounds.width || 100) / 2;
      const cy = bounds.y + (bounds.height || 100) / 2;
      const rx = (bounds.width || 100) / 2;
      const ry = (bounds.height || 100) / 2;
      const count = safeDensityX * 3;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const px = cx + Math.cos(angle) * rx;
        const py = cy + Math.sin(angle) * ry;
        points.push({
          id: `mpt_circle_${Date.now()}_${i}`,
          originalX: px,
          originalY: py,
          currentX: px,
          currentY: py,
          pinned: false,
          pinType: null
        });
      }
    }

    updateObject(selectedObject.id, {
      meshState: {
        active: true,
        densityX: safeDensityX,
        densityY: safeDensityY,
        points,
        originalPoints: JSON.parse(JSON.stringify(points)),
        pointSize: 30,
        showGrid: false,
        showPoints: true,
        previewMode: true,
        editMode: 'node',
        falloffRadius: 100,
        symmetryActive: false,
        symmetryAxis: 'horizontal',
        pointExtrudeMode: selectedObject.meshState?.pointExtrudeMode ?? false
      }
    });
  };

  const handleInitSpline = (segmentsCount: number = 3) => {
    if (!selectedObject) return;
    const bounds = calculateBoundingBox(selectedObject.points);
    const startX = bounds.x;
    const endX = bounds.x + bounds.width;
    const midY = bounds.y + bounds.height / 2;
    
    const splineControlPoints: any[] = [];
    const stepX = bounds.width / segmentsCount;
    
    for (let i = 0; i < segmentsCount; i++) {
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
    
    updateObject(selectedObject.id, {
      splineActive: true,
      splineControlPoints,
      splineTwistPoints,
      splineUniformStretch: true,
      splineOriginalPoints: JSON.parse(JSON.stringify(selectedObject.points))
    });
  };

  const handleInitLattice = (densityX: number = 4, densityY: number = 4) => {
    if (!selectedObject || !selectedObject.meshState) return;
    const safeDensityX = Math.max(2, Math.min(25, densityX));
    const safeDensityY = Math.max(2, Math.min(25, densityY));
    const bounds = calculateBoundingBox(selectedObject.points);
    const stepX = bounds.width / (safeDensityX - 1);
    const stepY = bounds.height / (safeDensityY - 1);
    const latticePoints: any[] = [];
    
    for (let y = 0; y < safeDensityY; y++) {
      for (let x = 0; x < safeDensityX; x++) {
        const px = bounds.x + x * stepX;
        const py = bounds.y + y * stepY;
        latticePoints.push({
          id: `lpt_${Date.now()}_${y}_${x}`,
          originalX: px,
          originalY: py,
          x: px,
          y: py
        });
      }
    }
    
    updateObject(selectedObject.id, {
      meshState: {
        ...selectedObject.meshState,
        editMode: 'lattice',
        latticePoints
      }
    });
  };

  const handleStyleChange = (effect: 'shadow' | 'innerShadow' | 'rimLight' | 'overlay', updates: any) => {
    if (!selectedObject) return;
    const currentEffect = selectedObject[effect] || {};
    updateObject(selectedObject.id, {
      [effect]: {
        ...currentEffect,
        ...updates
      }
    });
  };

  const relateChildToParent = (parentId: string, childId: string) => {
    if (parentId === childId) return;
    const parentObj = objects[parentId];
    const childObj = objects[childId];
    if (!parentObj || !childObj) return;

    // Detect Circular reference
    let current: VectorObject | null = parentObj;
    while (current) {
      if (current.id === childId) {
        alert(`Circular dependency detected! ${childObj.name} is already an ancestor of ${parentObj.name}.`);
        return;
      }
      current = current.parentId ? objects[current.parentId] : null;
    }

    // Auto-create pivots if missing for parent
    let parentPivot = parentObj.pivots?.[0];
    if (!parentPivot) {
      const pBox = calculateBoundingBox(parentObj.points);
      const pLocalX = pBox.x + pBox.width / 2;
      const pLocalY = pBox.y + pBox.height / 2;
      parentPivot = {
        id: `pvt_${Date.now()}_p`,
        name: `Pivot_1`,
        localX: Number(pLocalX.toFixed(2)),
        localY: Number(pLocalY.toFixed(2)),
        locked: false
      };
      updateObject(parentObj.id, { pivots: [parentPivot] });
    }

    let childPivot = childObj.pivots?.[0];
    if (!childPivot) {
      const cBox = calculateBoundingBox(childObj.points);
      const cLocalX = cBox.x + cBox.width / 2;
      const cLocalY = cBox.y + cBox.height / 2;
      childPivot = {
        id: `pvt_${Date.now()}_c`,
        name: `Pivot_1`,
        localX: Number(cLocalX.toFixed(2)),
        localY: Number(cLocalY.toFixed(2)),
        locked: false
      };
      updateObject(childObj.id, { pivots: [childPivot] });
    }

    // Relate child to parent in state
    updateObject(childObj.id, { parentId: parentObj.id });

    // Also update parent's childrenIds to include childId
    const currentChildren = parentObj.childrenIds || [];
    if (!currentChildren.includes(childId)) {
      updateObject(parentObj.id, { childrenIds: [...currentChildren, childId] });
    }

    // Check if there is already a bone between them. If not, create one!
    const boneExists = bones.some(b => 
      (b.startObjectId === parentObj.id && b.endObjectId === childObj.id) ||
      (b.startObjectId === childObj.id && b.endObjectId === parentObj.id)
    );

    if (!boneExists) {
      // Determine lock joint connection points
      const startWorld = localToWorld({ x: parentPivot.localX, y: parentPivot.localY }, parentObj.transform, parentPivot);
      const childLocalJoint = worldToLocal(startWorld, childObj.transform, childPivot);

      const newBone: Bone = {
        id: `bone_${Date.now()}`,
        name: `${parentObj.name}_to_${childObj.name}`,
        startObjectId: parentObj.id,
        endObjectId: childObj.id,
        startLocalX: parentPivot.localX,
        startLocalY: parentPivot.localY,
        endLocalX: Number(childLocalJoint.x.toFixed(2)),
        endLocalY: Number(childLocalJoint.y.toFixed(2)),
        lockedDistance: 0, // perfect joint lock at 0 distance in world space
        allowDetach: false,
        minAngle: -180,
        maxAngle: 180,
        enableConstraints: true,
      };

      addBone(newBone);
    }
  };

  const handleRemoveFromParent = (childId: string) => {
    const child = objects[childId];
    if (!child) return;
    const pId = child.parentId;
    
    // Once a 3D model is rigged or has parent-child relationships, they cannot be detached!
    if (child.type === '3d' || (pId && objects[pId]?.type === '3d')) {
      alert("Rigged 3D objects are permanently locked for safety and performance to prevent physics and skinning decoupling.");
      return;
    }
    
    // Update child
    updateObject(childId, { parentId: null });

    // Update parent's childrenIds list
    if (pId && objects[pId]) {
      const parent = objects[pId];
      updateObject(pId, {
        childrenIds: (parent.childrenIds || []).filter(id => id !== childId)
      });
    }

    // Delete associated bones
    const bonesToDelete = bones.filter(b => 
      (b.startObjectId === pId && b.endObjectId === childId) ||
      (b.startObjectId === childId && b.endObjectId === pId)
    );
    bonesToDelete.forEach(b => deleteBone(b.id));
  };

  // Direct connection creation state
  const [connDrawingA, setConnDrawingA] = useState<string>('');
  const [connDrawingB, setConnDrawingB] = useState<string>('');
  const [parentSelection, setParentSelection] = useState<'A_is_parent' | 'B_is_parent'>('A_is_parent');

  const handleCreateDirectConnection = () => {
    if (!connDrawingA || !connDrawingB) {
      alert('Please select both drawings first.');
      return;
    }
    if (connDrawingA === connDrawingB) {
      alert('Cannot connect a drawing to itself.');
      return;
    }

    const objA = objects[connDrawingA];
    const objB = objects[connDrawingB];
    if (!objA || !objB) return;

    const parentObj = parentSelection === 'A_is_parent' ? objA : objB;
    const childObj = parentSelection === 'A_is_parent' ? objB : objA;

    // Check circular dependencies
    let current: VectorObject | null = parentObj;
    while (current && current.parentId) {
      if (current.parentId === childObj.id) {
        alert(`Circular dependency detected! ${childObj.name} is already an ancestor of ${parentObj.name}.`);
        return;
      }
      current = objects[current.parentId];
    }

    // Auto-create pivots if missing
    let parentPivot = parentObj.pivots[0];
    if (!parentPivot) {
      const pBox = calculateBoundingBox(parentObj.points);
      const pLocalX = pBox.x + pBox.width / 2;
      const pLocalY = pBox.y + pBox.height / 2;
      parentPivot = {
        id: `pvt_${Date.now()}_p`,
        name: `Pivot_1`,
        localX: Number(pLocalX.toFixed(2)),
        localY: Number(pLocalY.toFixed(2)),
        locked: false
      };
      updateObject(parentObj.id, { pivots: [parentPivot] });
    }

    let childPivot = childObj.pivots[0];
    if (!childPivot) {
      const cBox = calculateBoundingBox(childObj.points);
      const cLocalX = cBox.x + cBox.width / 2;
      const cLocalY = cBox.y + cBox.height / 2;
      childPivot = {
        id: `pvt_${Date.now()}_c`,
        name: `Pivot_1`,
        localX: Number(cLocalX.toFixed(2)),
        localY: Number(cLocalY.toFixed(2)),
        locked: false
      };
      updateObject(childObj.id, { pivots: [childPivot] });
    }

    // Relate child to parent
    updateObject(childObj.id, { parentId: parentObj.id });

    // Determine lock distance in world space
    const startWorld = localToWorld({ x: parentPivot.localX, y: parentPivot.localY }, parentObj.transform, parentPivot);
    const endWorld = localToWorld({ x: childPivot.localX, y: childPivot.localY }, childObj.transform, childPivot);
    const len = distance(startWorld, endWorld);

    // Create the connection bone
    const newBone: Bone = {
      id: `bone_${Date.now()}`,
      name: `Bone_${bones.length + 1}`,
      startObjectId: parentObj.id,
      endObjectId: childObj.id,
      startLocalX: parentPivot.localX,
      startLocalY: parentPivot.localY,
      endLocalX: childPivot.localX,
      endLocalY: childPivot.localY,
      lockedDistance: Number(len.toFixed(2)) || 100,
      allowDetach: false,
      minAngle: -180,
      maxAngle: 180,
      enableConstraints: true,
    };

    addBone(newBone);
    setConnDrawingA('');
    setConnDrawingB('');
  };

  const handleBreakConnection = (boneId: string) => {
    const bone = bones.find(b => b.id === boneId);
    if (!bone) return;
    
    // Clear the parent child hierarchy linkage
    updateObject(bone.endObjectId, { parentId: null });
    deleteBone(boneId);
  };

  const updateSelectedMeshNode = (property: string, value: number) => {
    if (!selectedObject || !vdfState || selNodeIdx === undefined || !vdfState.nodes) return;
    const currentNodes = [...vdfState.nodes];
    const node = { ...currentNodes[selNodeIdx] };

    if (property === 'x' || property === 'translateX') {
      node.x = node.origX + value;
    } else if (property === 'y' || property === 'translateY') {
      node.y = node.origY + value;
    } else if (property === 'z' || property === 'translateZ') {
      node.z = value;
    } else if (property === 'scaleX') {
      node.scaleX = value;
    } else if (property === 'scaleY') {
      node.scaleY = value;
    } else if (property === 'scaleZ') {
      node.scaleZ = value;
    } else if (property === 'rotation' || property === 'rotateZ') {
      node.rotationZ = value;
    } else if (property === 'rotateX' || property === 'cameraAngleX') {
      node.rotationX = value;
    } else if (property === 'rotateY' || property === 'cameraAngleY') {
      node.rotationY = value;
    } else if (property === 'skewX') {
      node.skewX = value;
    } else if (property === 'skewY') {
      node.skewY = value;
    } else if (property === 'width') {
      node.width = value;
    } else if (property === 'height') {
      node.height = value;
    } else if (property === 'depth') {
      node.depth = value;
    }

    currentNodes[selNodeIdx] = node;
    updateObject(selectedObject.id, {
      customVectorDeformState: {
        ...vdfState,
        nodes: currentNodes
      }
    });
  };

  // Handle value increments/decrements (sliders tap +/- buttons)
  const handleNudge = (property: string, amount: number) => {
    if (isLassoActive) {
      const propertyToLassoMap: Record<string, 'translateX' | 'translateY' | 'translateZ' | 'rotate' | 'scaleX' | 'scaleY' | 'scaleZ' | 'skewX' | 'skewY' | 'rotateX' | 'rotateY' | 'perspective'> = {
        x: 'translateX',
        y: 'translateY',
        z: 'translateZ',
        rotation: 'rotate',
        scaleX: 'scaleX',
        scaleY: 'scaleY',
        scaleZ: 'scaleZ',
        skewX: 'skewX',
        skewY: 'skewY',
        rotateX: 'rotateX',
        rotateY: 'rotateY',
        cameraAngleX: 'rotateX',
        cameraAngleY: 'rotateY',
        perspective: 'perspective',
        translateX: 'translateX',
        translateY: 'translateY',
        translateZ: 'translateZ'
      };
      const lassoType = propertyToLassoMap[property];
      if (lassoType) {
        handleLassoNudge(lassoType, amount);
        return;
      }
    }

    if (!selectedObject) return;

    if (isDeformPointActive && updateDeformPointTransform) {
      const val = (deformPointTransform as any)[property] || 0;
      const nextVal = Number((val + amount).toFixed(2));
      updateDeformPointTransform(property, nextVal);
      return;
    }

    if (isMeshPointActive && selNode) {
      let currentVal = 0;
      if (property === 'x') currentVal = selNode.x - selNode.origX;
      else if (property === 'y') currentVal = selNode.y - selNode.origY;
      else if (property === 'z') currentVal = selNode.z || 0;
      else if (property === 'rotation') currentVal = selNode.rotationZ || 0;
      else if (property === 'scaleX') currentVal = selNode.scaleX ?? 1;
      else if (property === 'scaleY') currentVal = selNode.scaleY ?? 1;
      else if (property === 'scaleZ') currentVal = selNode.scaleZ ?? 1;
      else if (property === 'skewX') currentVal = selNode.skewX || 0;
      else if (property === 'skewY') currentVal = selNode.skewY || 0;
      else if (property === 'width') currentVal = selNode.width || 100;
      else if (property === 'height') currentVal = selNode.height || 100;
      else if (property === 'depth') currentVal = selNode.depth || 40;

      updateSelectedMeshNode(property, currentVal + amount);
      return;
    }

    // Apply to selected drawing's active lasso region if active
    if (selectedObject.lassoDeformState?.active) {
      const currentLassoState = selectedObject.lassoDeformState;
      const currentTransform = currentLassoState.transform || {
        x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, rotateX: 0, rotateY: 0, perspective: 0
      };
      const val = (currentTransform as any)[property] || 0;
      const nextVal = Number((val + amount).toFixed(2));
      const transformUpdate = { ...currentTransform, [property]: nextVal };
      updateObject(selectedObject.id, {
        lassoDeformState: {
          ...currentLassoState,
          transform: transformUpdate
        }
      });
      return;
    }

    // Apply to selected drawing
    const val = (selectedObject.transform as any)[property] || 0;
    const nextVal = Number((val + amount).toFixed(2));

    // Enforce parent closed edges constraint if rigged and parent has closed edges
    if ((property === 'x' || property === 'y') && selectedObject.parentId && objects[selectedObject.parentId]) {
      const parent = objects[selectedObject.parentId];
      const isParentClosed = parent.type === 'shape' && parent.shapeType !== 'line';
      if (isParentClosed) {
        const testTransform = { ...selectedObject.transform, [property]: nextVal };
        if (!isChildInsideParent(selectedObject, parent, testTransform, objects)) {
          return; // reject move
        }
      }
    }

    const transformUpdate = { ...selectedObject.transform, [property]: nextVal };
    updateObject(selectedObject.id, { transform: transformUpdate });

    // BATCH APPLY to checked Smart Control drawings
    const checkedIds = Object.keys(smartCheckedIds).filter(id => smartCheckedIds[id] && objects[id]);
    checkedIds.forEach(id => {
      if (id === selectedObject.id) return; // Already updated
      const obj = objects[id];
      const oVal = (obj.transform as any)[property] || 0;
      const nextOVal = Number((oVal + amount).toFixed(2));
      updateObject(id, { transform: { ...obj.transform, [property]: nextOVal } });
    });

    // OPPOSITE CONTROLS BATCH APPLY
    if (property === 'rotation') {
      oppositeSection1.forEach(id => {
        if (id === selectedObject.id) return;
        const obj = objects[id];
        const currentRot = obj.transform.rotation;
        updateObject(id, { transform: { ...obj.transform, rotation: Number((currentRot + amount).toFixed(2)) } });
      });
      oppositeSection2.forEach(id => {
        if (id === selectedObject.id) return;
        const obj = objects[id];
        const currentRot = obj.transform.rotation;
        updateObject(id, { transform: { ...obj.transform, rotation: Number((currentRot - amount).toFixed(2)) } });
      });
    }
  };

  const handleSliderChange = (property: string, value: number) => {
    if (isLassoActive) {
      const propertyToLassoMap: Record<string, 'translateX' | 'translateY' | 'translateZ' | 'rotate' | 'scaleX' | 'scaleY' | 'scaleZ' | 'skewX' | 'skewY' | 'rotateX' | 'rotateY' | 'perspective'> = {
        x: 'translateX',
        y: 'translateY',
        z: 'translateZ',
        rotation: 'rotate',
        scaleX: 'scaleX',
        scaleY: 'scaleY',
        scaleZ: 'scaleZ',
        skewX: 'skewX',
        skewY: 'skewY',
        rotateX: 'rotateX',
        rotateY: 'rotateY',
        cameraAngleX: 'rotateX',
        cameraAngleY: 'rotateY',
        perspective: 'perspective',
        translateX: 'translateX',
        translateY: 'translateY',
        translateZ: 'translateZ'
      };
      const lassoType = propertyToLassoMap[property];
      if (lassoType) {
        handleLassoSliderChange(lassoType, value);
        return;
      }
    }

    if (!selectedObject) return;

    if (isDeformPointActive && updateDeformPointTransform) {
      updateDeformPointTransform(property, value);
      return;
    }

    if (isMeshPointActive) {
      updateSelectedMeshNode(property, value);
      return;
    }

    // Apply to selected drawing's active lasso region if active
    if (selectedObject.lassoDeformState?.active) {
      const currentLassoState = selectedObject.lassoDeformState;
      const currentTransform = currentLassoState.transform || {
        x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, rotateX: 0, rotateY: 0, perspective: 0
      };
      const transformUpdate = { ...currentTransform, [property]: value };
      updateObject(selectedObject.id, {
        lassoDeformState: {
          ...currentLassoState,
          transform: transformUpdate
        }
      });
      return;
    }

    // Enforce parent closed edges constraint if rigged and parent has closed edges
    if ((property === 'x' || property === 'y') && selectedObject.parentId && objects[selectedObject.parentId]) {
      const parent = objects[selectedObject.parentId];
      const isParentClosed = parent.type === 'shape' && parent.shapeType !== 'line';
      if (isParentClosed) {
        const testTransform = { ...selectedObject.transform, [property]: value };
        if (!isChildInsideParent(selectedObject, parent, testTransform, objects)) {
          return; // reject move
        }
      }
    }

    const delta = value - ((selectedObject.transform as any)[property] || 0);

    const transformUpdate = { ...selectedObject.transform, [property]: value };
    updateObject(selectedObject.id, { transform: transformUpdate });

    // Batch Apply
    const checkedIds = Object.keys(smartCheckedIds).filter(id => smartCheckedIds[id] && objects[id]);
    checkedIds.forEach(id => {
      if (id === selectedObject.id) return;
      const obj = objects[id];
      updateObject(id, { transform: { ...obj.transform, [property]: value } });
    });
  };

  const handleSmartCheckboxToggle = (id: string) => {
    setSmartCheckedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Add selected drawing to Opposite Section 1/2
  const handleAddToOpposite = (section: 1 | 2) => {
    if (!selectedObject) return;
    const id = selectedObject.id;
    if (section === 1) {
      if (!oppositeSection1.includes(id)) {
        setOppositeSection1([...oppositeSection1, id]);
        setOppositeSection2(oppositeSection2.filter(x => x !== id));
      }
    } else {
      if (!oppositeSection2.includes(id)) {
        setOppositeSection2([...oppositeSection2, id]);
        setOppositeSection1(oppositeSection1.filter(x => x !== id));
      }
    }
  };

  // Find bones associated with the selected object
  const selectedObjectBones = selectedObject 
    ? bones.filter(b => b.startObjectId === selectedObject.id || b.endObjectId === selectedObject.id)
    : [];

  // Recursive Tree Node Renderer for VS Code style directory parenting tree
  const renderTreeNode = (obj: VectorObject, depth: number): React.ReactNode => {
    const hasChildren = obj.childrenIds && obj.childrenIds.length > 0;
    const isExpanded = expandedNodes[obj.id] !== false; // expanded by default
    const isSelected = selectedObject?.id === obj.id;

    // Recursive search for direct child objects
    const childObjects = Object.values(objects).filter(o => o.parentId === obj.id);

    return (
      <div key={obj.id} className="space-y-1">
        {/* Node Label Row */}
        <div 
          className={`group flex items-center justify-between py-1.5 px-2 rounded-xl transition-all cursor-pointer ${
            isSelected 
              ? 'bg-amber-500/20 text-white border border-amber-500/20 font-bold shadow shadow-amber-500/5' 
              : 'hover:bg-neutral-800/40 text-neutral-350'
          }`}
          style={{ paddingLeft: `${Math.max(8, depth * 12)}px` }}
          onClick={(e) => {
            e.stopPropagation();
            const effLayerId = obj.layerId || 'layer_1';
            if (effLayerId !== activeLayerId) return;
            setSelectedObjectId(obj.id);
          }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Collapse / Expand Toggle for folder nodes */}
            {childObjects.length > 0 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedNodes(prev => ({ ...prev, [obj.id]: !isExpanded }));
                }}
                className="p-0.5 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300 transition-all flex items-center justify-center"
              >
                {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
            ) : (
              <span className="w-4 h-4" /> // spacing indent
            )}

            {/* Icon */}
            <Folder className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-amber-400' : 'text-neutral-500'}`} />

            {/* Object Name */}
            <span className="truncate text-xs font-bold leading-none tracking-tight">{obj.name}</span>
          </div>

          {/* Actions Hover Rail */}
          <div className="flex items-center gap-1 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
            {/* Add Child / Sibling Action */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveMenuObjectId(obj.id);
                setActiveMenuType('options');
              }}
              className="p-1 rounded bg-neutral-800/80 hover:bg-amber-500 hover:text-neutral-950 text-neutral-400 transition-all flex items-center justify-center"
              title="Add Child / Sibling"
            >
              <Plus className="w-3 h-3" />
            </button>

            {/* Break Relationship Action (if not a root parent) */}
            {obj.parentId && obj.type !== '3d' && objects[obj.parentId]?.type !== '3d' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveFromParent(obj.id);
                }}
                className="p-1 rounded bg-neutral-800/80 hover:bg-rose-500/20 hover:text-rose-400 text-neutral-500 transition-all flex items-center justify-center"
                title="Detach from parent"
              >
                <Unlink className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Inline Actions Selector Dropdown Overlay */}
        {activeMenuObjectId === obj.id && (
          <div 
            className="p-2.5 bg-neutral-950/95 border border-neutral-800/95 rounded-xl space-y-2 text-xs"
            style={{ marginLeft: `${Math.max(12, (depth + 1) * 12)}px` }}
          >
            {activeMenuType === 'options' && (
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveMenuType('addChild')}
                  className="w-full text-left py-1.5 px-2 bg-neutral-900 hover:bg-amber-500/10 text-amber-400 hover:text-amber-300 font-bold rounded-lg transition-all flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-500" />
                  Add Child Drawing
                </button>
                {obj.parentId && (
                  <button
                    type="button"
                    onClick={() => setActiveMenuType('addSibling')}
                    className="w-full text-left py-1.5 px-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-neutral-200 font-bold rounded-lg transition-all flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5 text-neutral-400" />
                    Add Sibling Drawing
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setActiveMenuObjectId(null);
                    setActiveMenuType(null);
                  }}
                  className="w-full text-center py-1.5 text-neutral-500 hover:text-neutral-400 font-bold rounded-lg hover:bg-neutral-900/60 transition-all"
                >
                  Cancel
                </button>
              </div>
            )}

            {activeMenuType === 'addChild' && (
              <div className="space-y-1.5">
                <span className="text-[10px] text-neutral-400 block font-bold uppercase tracking-wide">Add Child to {obj.name}</span>
                <div className="flex gap-1.5">
                  <CustomSelect
                    value=""
                    onChange={(val) => {
                      if (val) {
                        relateChildToParent(obj.id, val);
                        setActiveMenuObjectId(null);
                        setActiveMenuType(null);
                      }
                    }}
                    options={Object.values(objects)
                      .filter(o => {
                        // Cannot be itself
                        if (o.id === obj.id) return false;
                        // Cannot be its parent already
                        if (o.id === obj.parentId) return false;
                        // Avoid circular reference
                        let temp: VectorObject | null = obj;
                        while (temp) {
                          if (temp.id === o.id) return false;
                          temp = temp.parentId ? objects[temp.parentId] : null;
                        }
                        return true;
                      })
                      .map(o => ({ value: o.id, label: o.name }))
                    }
                    placeholder="-- Choose Drawing --"
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMenuObjectId(null);
                      setActiveMenuType(null);
                    }}
                    className="px-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 font-bold rounded-lg transition-all text-xs"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {activeMenuType === 'addSibling' && (
              <div className="space-y-1.5">
                <span className="text-[10px] text-neutral-400 block font-bold uppercase tracking-wide">Add Sibling to {obj.name}</span>
                <div className="flex gap-1.5">
                  <CustomSelect
                    value=""
                    onChange={(val) => {
                      if (val) {
                        if (obj.parentId) {
                          relateChildToParent(obj.parentId, val);
                        }
                        setActiveMenuObjectId(null);
                        setActiveMenuType(null);
                      }
                    }}
                    options={Object.values(objects)
                      .filter(o => {
                        if (o.id === obj.id) return false;
                        if (obj.parentId) {
                          if (o.id === obj.parentId) return false;
                          let temp: VectorObject | null = objects[obj.parentId];
                          while (temp) {
                            if (temp.id === o.id) return false;
                            temp = temp.parentId ? objects[temp.parentId] : null;
                          }
                        }
                        return true;
                      })
                      .map(o => ({ value: o.id, label: o.name }))
                    }
                    placeholder="-- Choose Drawing --"
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMenuObjectId(null);
                      setActiveMenuType(null);
                    }}
                    className="px-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 font-bold rounded-lg transition-all text-xs"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recursive rendering of children node rows */}
        {hasChildren && isExpanded && (
          <div className="space-y-1">
            {childObjects.map(childObj => renderTreeNode(childObj, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={`absolute right-0 h-full transition-all duration-200 shrink-0 z-30 ${
        open ? 'w-80' : 'w-0'
      }`}
    >
      {/* Slider Open Close Handle Button */}
      <button
        onClick={() => setOpen(!open)}
        className="absolute -left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-16 bg-neutral-800 hover:bg-amber-500 border-y border-l border-neutral-700 hover:border-amber-400 rounded-l-lg flex items-center justify-center text-neutral-400 hover:text-neutral-950 transition-all cursor-pointer z-50 shadow-lg shadow-black/20"
      >
        {open ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      <div className={`w-full h-full bg-neutral-900/95 backdrop-blur-md border-l border-neutral-800 flex flex-col overflow-hidden ${
        open ? 'w-80' : 'w-0 border-l-0'
      }`}>
        {open && (
        <div className="flex-1 flex flex-col h-full overflow-hidden select-none font-semibold">
          {/* Header */}
          <div className="h-14 border-b border-neutral-800 flex items-center justify-between px-4 shrink-0">
            <span className="text-xs uppercase tracking-widest font-black text-neutral-400 flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5 text-amber-500" />
              PROPERTIES PANEL
            </span>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-850 text-neutral-400 hover:text-rose-400 transition-all lg:hidden"
              title="Close Sidebar"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-thin">
            {/* RIGHT PANEL SYSTEM NOTIFICATION & CONFIRMATION HUD */}
            <div className="space-y-1.5 bg-neutral-950/90 p-3 rounded-2xl border border-neutral-800 shadow-xl min-w-0">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5 min-w-0">
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5 font-mono truncate">
                  <Activity className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />
                  Status & Confirmations
                </span>
                <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                  ACTIVE
                </span>
              </div>

              {/* Active Toasts */}
              {toasts && toasts.length > 0 ? (
                <div className="flex flex-col gap-1.5 mt-1.5">
                  {toasts.map(t => (
                    <div key={t.id} className={`p-2 rounded-xl border flex items-start justify-between gap-2 text-xs ${
                      t.type === 'success' ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-200' :
                      t.type === 'error' ? 'bg-rose-950/60 border-rose-500/30 text-rose-200' :
                      t.type === 'warning' ? 'bg-amber-950/60 border-amber-500/30 text-amber-200' :
                      'bg-neutral-900 border-neutral-700 text-neutral-200'
                    }`}>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <CheckCircle className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                        <span className="font-medium text-[10px] leading-tight truncate">{t.message}</span>
                      </div>
                      {setToasts && (
                        <button 
                          onClick={() => setToasts(prev => prev.filter(item => item.id !== t.id))}
                          className="text-neutral-400 hover:text-white p-0.5 text-[10px] shrink-0"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : dbNotification ? (
                <div className="p-2 rounded-xl border bg-emerald-950/60 border-emerald-500/30 text-emerald-200 text-xs mt-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="font-medium text-[10px] truncate">{dbNotification.message}</span>
                  </div>
                </div>
              ) : limitNotification ? (
                <div className="p-2 rounded-xl border bg-rose-950/60 border-rose-500/30 text-rose-200 text-xs mt-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Info className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span className="font-medium text-[10px] truncate">{limitNotification}</span>
                  </div>
                  {setLimitNotification && (
                    <button onClick={() => setLimitNotification(null)} className="text-rose-400 text-[10px] shrink-0">✕</button>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-neutral-400 font-normal mt-1 flex items-center gap-1.5 truncate">
                  <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                  Engine Active. Confirmations visible here.
                </p>
              )}
            </div>

            {/* DEEP PNG & VECTOR STUDIO SIDEBAR PANEL */}
            {targetObject && (
              <div className="space-y-2 min-w-0 w-full overflow-hidden">
                <PNGDeepEditBar
                  selectedObject={targetObject}
                  activeTool={activeTool}
                  setActiveTool={setActiveTool}
                  onExtractPart={handleExtractPart}
                  onSetupMouthPosing={handleSetupMouthPosing}
                  onSetupEyePosing={handleSetupEyePosing}
                  onConvertTo3D={handleConvertTo3D}
                  onUpdateTransform3D={handleUpdateTransform3D}
                  onShiftZDepth={handleShiftZDepth}
                  onApplyCustomColor={handleApplyCustomColor}
                  freeSelectionPoints={activeLasso}
                  inline={true}
                />
              </div>
            )}
            {/* CONTINUOUS DRAWING CONTROL PANEL */}
            <div className="space-y-4 bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/30 shadow-lg shadow-black/30">
              <div className="flex items-center justify-between border-b border-emerald-500/25 pb-2.5">
                <span className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 font-mono">
                  <Feather className="w-4 h-4 text-emerald-400 animate-pulse" />
                  Continuous Drawing
                </span>
                <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full ${continuousDrawActive ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse' : 'bg-neutral-850 text-neutral-500 border border-neutral-800'}`}>
                  {continuousDrawActive ? 'ACTIVE' : 'OFF'}
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-neutral-300 font-bold uppercase tracking-wider">Merge Multiple Strokes</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (continuousDrawActive) {
                        if (activeContinuousDrawingId && objects[activeContinuousDrawingId]) {
                          const curObj = objects[activeContinuousDrawingId];
                          const finalized = finalizeContinuousObject(curObj);
                          setObjects(prev => ({
                            ...prev,
                            [activeContinuousDrawingId!]: finalized
                          }));
                        }
                        if (setActiveContinuousDrawingId) {
                          setActiveContinuousDrawingId(null);
                        }
                      }
                      if (setContinuousDrawActive) {
                        setContinuousDrawActive(!continuousDrawActive);
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      continuousDrawActive ? 'bg-emerald-500' : 'bg-neutral-800'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        continuousDrawActive ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <p className="text-[10px] text-neutral-400 leading-normal font-semibold">
                  Draw multiple separate lines on the canvas; they will automatically be grouped into a single drawing object instead of separate strokes.
                </p>

                {continuousDrawActive && (
                  <div className="bg-neutral-950/40 p-3 rounded-xl border border-neutral-850 space-y-2.5 animate-fade-in text-[10px] text-neutral-300 font-bold font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400">Current Composite:</span>
                      <span className="text-neutral-200 font-bold font-mono">
                        {activeContinuousDrawingId && objects[activeContinuousDrawingId]
                          ? `${objects[activeContinuousDrawingId].name}`
                          : 'Ready - Start drawing'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400">Sub-strokes Count:</span>
                      <span className="text-emerald-400 font-bold font-mono">
                        {activeContinuousDrawingId && objects[activeContinuousDrawingId]
                          ? ((objects[activeContinuousDrawingId].subPaths?.length ?? 0) > 0 
                              ? objects[activeContinuousDrawingId].subPaths!.length 
                              : (objects[activeContinuousDrawingId].points ? 1 : 0))
                          : 0}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={!activeContinuousDrawingId || !objects[activeContinuousDrawingId]}
                      onClick={() => {
                        if (activeContinuousDrawingId && objects[activeContinuousDrawingId]) {
                          const curObj = objects[activeContinuousDrawingId];
                          const finalized = finalizeContinuousObject(curObj);
                          setObjects(prev => ({
                            ...prev,
                            [activeContinuousDrawingId!]: finalized
                          }));
                        }
                        if (setActiveContinuousDrawingId) {
                          setActiveContinuousDrawingId(null);
                        }
                      }}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-black uppercase text-xs rounded-xl tracking-wider shadow-lg shadow-emerald-500/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Complete Current Drawing
                    </button>
                  </div>
                )}

                {!continuousDrawActive && selectedObject && selectedObject.type === 'stroke' && (
                  <div className="bg-neutral-950/40 p-3 rounded-xl border border-neutral-850 space-y-2 animate-fade-in text-[10px] text-neutral-300 font-bold font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400 font-bold">Selected Completed:</span>
                      <span className="text-emerald-400 font-black">{selectedObject.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        updateObject(selectedObject.id, { isContinuousDrawing: true });
                        if (setContinuousDrawActive && setActiveContinuousDrawingId) {
                          setContinuousDrawActive(true);
                          setActiveContinuousDrawingId(selectedObject.id);
                        }
                      }}
                      className="w-full py-2 bg-emerald-700 hover:bg-emerald-600 text-white font-black uppercase text-xs rounded-xl tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/10"
                      title="Continue drawing or add strokes to this drawing"
                    >
                      <Feather className="w-3.5 h-3.5" />
                      Edit / Resume Drawing
                    </button>
                  </div>
                )}

                {/* 1-Click Merge All Loose Strokes on Active Layer */}
                <div className="pt-2 border-t border-emerald-500/20">
                  <button
                    type="button"
                    onClick={() => {
                      const layerStrokes = Object.values(objects).filter(
                        obj => (!obj.layerId || obj.layerId === activeLayerId) && (obj.type === 'stroke' || obj.type === 'shape')
                      );
                      if (layerStrokes.length <= 1) {
                        alert("Need at least 2 stroke objects on active layer to merge.");
                        return;
                      }

                      const allSubPaths: Point[][] = [];
                      layerStrokes.forEach(s => {
                        if (s.subPaths && s.subPaths.length > 0) {
                          allSubPaths.push(...s.subPaths);
                        } else if (s.points && s.points.length > 0) {
                          allSubPaths.push(s.points);
                        }
                      });

                      if (allSubPaths.length === 0) return;

                      const first = layerStrokes[0];
                      const unifiedPoints = unifyStrokesToSinglePath(allSubPaths);

                      const mergedObj: VectorObject = {
                        ...first,
                        id: `merged_${Date.now()}`,
                        name: `Merged_Drawing_${Date.now().toString().slice(-4)}`,
                        points: unifiedPoints,
                        subPaths: allSubPaths,
                        joinedStrokesDemo: [...unifiedPoints],
                        isContinuousDrawing: true,
                      };

                      setObjects(prev => {
                        const updated = { ...prev };
                        layerStrokes.forEach(s => delete updated[s.id]);
                        updated[mergedObj.id] = mergedObj;
                        return updated;
                      });
                      if (setSelectedObjectId) setSelectedObjectId(mergedObj.id);
                      if (historyPush) historyPush();
                    }}
                    className="w-full py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black uppercase text-[11px] rounded-xl tracking-wider shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    title="Combine all small sketching strokes on current layer into 1 single drawing object for easy coloring & deformation!"
                  >
                    <GitMerge className="w-3.5 h-3.5" />
                    Merge All Layer Strokes into Single Drawing
                  </button>
                </div>
              </div>
            </div>

            {/* GLOBAL MULTI-DRAWING LASSO TRANSFORMER PANEL */}
            {lassoPoints && lassoPoints.length >= 3 && (
              <div className="space-y-4 bg-amber-500/10 p-4 rounded-2xl border border-amber-500/30 shadow-lg shadow-black/30">
                <div className="flex items-center justify-between border-b border-amber-500/20 pb-2.5">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5 font-mono animate-pulse">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    Multi-Drawing Lasso Transform
                  </span>
                  <div className="flex items-center flex-wrap gap-1.5">
                    <button
                      onClick={handleHideSelected}
                      className="text-[10px] font-black px-2 py-1 rounded-lg border bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/35 transition-all font-mono cursor-pointer"
                      title="Hide selected region vertices from drawing"
                    >
                      HIDE SELECTED
                    </button>
                    <button
                      onClick={handleUnhideAll}
                      className="text-[10px] font-black px-2 py-1 rounded-lg border bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-755 transition-all font-mono cursor-pointer"
                      title="Unhide all hidden vertices"
                    >
                      UNHIDE ALL
                    </button>
                    <button
                      onClick={() => {
                        if (lassoPoints && lassoPoints.length > 0) {
                          setHideLassoSelection?.(!hideLassoSelection);
                        }
                      }}
                      className={`text-[10px] font-black px-2 py-1 rounded-lg border transition-all font-mono cursor-pointer ${
                        hideLassoSelection
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/30'
                          : 'bg-neutral-850 text-neutral-300 border-neutral-700 hover:bg-neutral-800'
                      }`}
                      title="Hide or show the lasso outline on canvas"
                    >
                      {hideLassoSelection ? 'SHOW L.A.' : 'HIDE L.A.'}
                    </button>
                    <button
                      onClick={() => setLassoPoints([])}
                      className="text-[10px] font-black px-2 py-1 rounded-lg border bg-rose-500/10 text-rose-300 border-rose-500/30 hover:bg-rose-500/20 hover:text-rose-200 transition-all font-mono cursor-pointer"
                      title="Clear Selection Loop"
                    >
                      CLEAR
                    </button>
                  </div>
                </div>

                {/* Lasso Delete and Lasso Separate col row */}
                <div className="grid grid-cols-2 gap-2 pb-1.5">
                  <button
                    onClick={deleteLassoBatch}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 bg-rose-600/20 hover:bg-rose-600/35 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-black uppercase tracking-wider transition-all font-mono shadow-lg shadow-black/20 cursor-pointer"
                    title="Delete exact drawing part inside lasso area"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Lasso Delete
                  </button>
                  <button
                    onClick={separateLassoBatch}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-black uppercase tracking-wider transition-all font-mono shadow-lg shadow-black/20 cursor-pointer"
                    title="Separate drawing part inside lasso as a new drawing"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    Lasso Separate
                  </button>
                </div>

                {/* Apply to All Frames toggle */}
                <div className="flex items-center justify-between bg-neutral-900/40 border border-neutral-800/40 rounded-xl px-3 py-1.5 text-xs font-sans">
                  <span className="text-neutral-300 font-medium">Apply transform to all frames</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={lassoAllFrames} 
                      onChange={(e) => setLassoAllFrames(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4.5 bg-neutral-750 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>

                {/* Lasso Selective Editing Toggle */}
                <div className="flex items-center justify-between bg-neutral-900/40 border border-neutral-800/40 rounded-xl px-3 py-2 text-xs font-sans">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-neutral-200 font-bold tracking-wide">Lasso Selective Editing</span>
                    <span className="text-[10px] text-neutral-400 font-medium leading-tight">Restrict Warp, CAG, Reshape & Liquify to lasso area</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={lassoRestrictActive} 
                      onChange={(e) => setLassoRestrictActive?.(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4.5 bg-neutral-750 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>

                {/* Info HUD */}
                <div className="bg-neutral-900/60 border border-neutral-800/60 rounded-xl p-3 text-[10.5px] leading-relaxed text-neutral-300 space-y-1">
                  <div className="font-bold text-amber-400 flex items-center gap-1 font-mono">
                    <Info className="w-3.5 h-3.5" /> Lasso Region Active
                  </div>
                  <p className="text-neutral-400">
                    {lassoAllFrames 
                      ? "Transforming all vertices inside the lasso simultaneously across all frames."
                      : "Transforming all vertices inside the lasso on the current frame only (Keyframeable Animation)."}
                  </p>
                  <div className="flex gap-2 pt-1 font-mono text-[9px] text-neutral-400">
                    <span>Drawings: <strong className="text-amber-400 font-bold">{Object.keys(globalLassoSelectedMap).length}</strong></span>
                    <span>•</span>
                    <span>Vertices: <strong className="text-amber-400 font-bold">
                      {(Object.values(globalLassoSelectedMap) as { points: number[], subPaths: { [key: number]: number[] } }[]).reduce((total, sel) => {
                        const subCount = Object.values(sel.subPaths || {}).reduce((subTotal, indices) => subTotal + (indices ? indices.length : 0), 0);
                        return total + (sel.points ? sel.points.length : 0) + subCount;
                      }, 0)}
                    </strong></span>
                  </div>
                </div>

                {/* Area Recoloring Section */}
                <div className="pt-3 border-t border-neutral-800/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 font-mono flex items-center gap-1">
                      <Palette className="w-3.5 h-3.5" /> Area Color Fill
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5 pt-1">
                    {['#E53935', '#F59E0B', '#10B981', '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899', '#FFFFFF', '#171717', 'transparent'].map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => handleLassoRecolor(color, undefined)}
                        className="h-6 rounded-lg border border-neutral-700/80 hover:scale-105 transition-transform cursor-pointer relative shadow-sm"
                        style={{ backgroundColor: color === 'transparent' ? '#262626' : color }}
                        title={`Recolor area fill to ${color}`}
                      >
                        {color === 'transparent' && (
                          <span className="absolute inset-0 flex items-center justify-center text-[9px] text-neutral-500 font-bold">Ø</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <CustomColorPicker
                      label="Custom Fill"
                      color="#4CAF50"
                      onChange={(c) => handleLassoRecolor(c, undefined)}
                    />
                    <CustomColorPicker
                      label="Custom Stroke"
                      color="#E53935"
                      onChange={(c) => handleLassoRecolor(undefined, c)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* GLOBAL FREE SELECTION LASSO PANEL */}
            {fslPoints && fslPoints.length >= 3 && (
              <div className="space-y-4 bg-violet-500/10 p-4 rounded-2xl border border-violet-500/30 shadow-lg shadow-black/30">
                <div className="flex items-center justify-between border-b border-violet-500/20 pb-2.5">
                  <span className="text-xs font-black uppercase tracking-wider text-violet-400 flex items-center gap-1.5 font-mono animate-pulse">
                    <Sparkles className="w-4 h-4 text-violet-400" />
                    Adjustable Selection (FSL)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        if (fslPoints && fslPoints.length > 0) {
                          setHideFslSelection?.(!hideFslSelection);
                        }
                      }}
                      className={`text-[10px] font-black px-2 py-1 rounded-lg border transition-all font-mono cursor-pointer ${
                        hideFslSelection
                          ? 'bg-violet-500/20 text-violet-300 border-violet-500/30 hover:bg-violet-500/30'
                          : 'bg-neutral-850 text-neutral-300 border-neutral-700 hover:bg-neutral-800'
                      }`}
                      title="Hide or show the FSL outline on canvas"
                    >
                      {hideFslSelection ? 'SHOW FSL' : 'HIDE FSL'}
                    </button>
                    <button
                      onClick={() => setFslPoints?.([])}
                      className="text-[10px] font-black px-2 py-1 rounded-lg border bg-rose-500/10 text-rose-300 border-rose-500/30 hover:bg-rose-500/20 hover:text-rose-200 transition-all font-mono cursor-pointer"
                      title="Clear FSL Loop"
                    >
                      CLEAR FSL
                    </button>
                  </div>
                </div>

                {/* FSL Info HUD */}
                <div className="bg-neutral-900/60 border border-neutral-800/60 rounded-xl p-3 text-[10.5px] leading-relaxed text-neutral-300 space-y-1">
                  <div className="font-bold text-violet-400 flex items-center gap-1 font-mono">
                    <Info className="w-3.5 h-3.5" /> Free Selection Active
                  </div>
                  <p className="text-neutral-400">
                    You can drag the control points to adjust the area, drag the background to move it, or insert new points by clicking on the edges.
                  </p>
                  <div className="flex justify-between items-center pt-2 border-t border-neutral-800/40">
                    <span className="font-mono text-[9px] text-neutral-400">Points: <strong className="text-violet-400 font-bold">{fslPoints.length}</strong></span>
                  </div>
                </div>
              </div>
            )}

            {!selectedObject ? (
              (!lassoPoints || lassoPoints.length < 3) && (
                <div className="text-center py-12 text-xs text-neutral-600 font-bold border border-dashed border-neutral-800/80 rounded-2xl p-4">
                  Select a drawing from the canvas or left hierarchy tree to inspect and transform.
                </div>
              )
            ) : (
              <>
                {/* LASSO DEFORM & SELECTION PANEL */}
                {selectedObject && (
                  <div className="space-y-4 bg-amber-500/5 p-4 rounded-2xl border border-amber-500/20 shadow-lg shadow-black/20">
                    <div className="flex items-center justify-between border-b border-amber-500/10 pb-2.5">
                      <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5 font-mono">
                        <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                        Lasso Deform Selection
                      </span>
                      <button
                        id="toggle-lasso-deform"
                        disabled={!selectedObject.lassoDeformState?.lassoPoints || selectedObject.lassoDeformState.lassoPoints.length === 0}
                        onClick={() => {
                          const currentlyActive = selectedObject.lassoDeformState?.active ?? false;
                          const currentDeform = selectedObject.lassoDeformState || {
                            active: false,
                            lassoPoints: [],
                            transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, rotateX: 0, rotateY: 0, perspective: 0 }
                          };
                          updateObject(selectedObject.id, {
                            lassoDeformState: {
                              ...currentDeform,
                              active: !currentlyActive
                            }
                          });
                        }}
                        className={`text-[10px] font-black px-2.5 py-1 rounded-lg border transition-all ${
                          selectedObject.lassoDeformState?.active 
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold' 
                            : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white disabled:opacity-40 disabled:pointer-events-none'
                        }`}
                      >
                        {selectedObject.lassoDeformState?.active ? 'TRANSFORM SELECTED' : 'APPLY TO LASSO'}
                      </button>
                    </div>

                    {/* Selection Mode Toggle */}
                    <div className="flex bg-neutral-900/60 p-1 rounded-xl border border-neutral-800/60 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setLassoMode('freehand');
                          setPenLassoPoints([]);
                        }}
                        className={`flex-1 py-1.5 px-2 text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-all ${
                          lassoMode === 'freehand'
                            ? 'bg-amber-500 text-neutral-950 font-black shadow shadow-amber-500/20'
                            : 'text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Freehand Lasso
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLassoMode('pen');
                        }}
                        className={`flex-1 py-1.5 px-2 text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-all ${
                          lassoMode === 'pen'
                            ? 'bg-amber-500 text-neutral-950 font-black shadow shadow-amber-500/20'
                            : 'text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        <Feather className="w-3.5 h-3.5" />
                        Vector Pen
                      </button>
                    </div>

                    {/* Short instruction HUD */}
                    <div className="bg-neutral-900/40 border border-neutral-800/40 rounded-xl p-3 text-[10.5px] leading-relaxed text-neutral-300 space-y-2">
                      <div className="font-bold text-amber-400 flex items-center gap-1 font-mono">
                        <Info className="w-3.5 h-3.5 animate-bounce" /> Guide: Lasso Selection Deform
                      </div>
                      <p>
                        1. Select the <strong className="text-amber-400">Lasso tool (Sparkles)</strong> on the left toolbar and draw a closed region over the canvas.
                      </p>
                      <p>
                        2. Click <span className="text-white font-semibold">"Set Selected Region"</span> to assign the lasso area to this drawing.
                      </p>
                      <p>
                        3. Click <span className="text-white font-semibold">"APPLY TO LASSO"</span> above to transform ONLY the selected area using the sliders below.
                      </p>
                    </div>

                    <div className="space-y-3">
                      {/* Controls Row */}
                      <div className="flex gap-2">
                        <button
                          id="set-lasso-deform-region"
                          disabled={lassoPoints.length === 0}
                          onClick={() => {
                            // Find local center pivot of the selected object
                            const localPivot = selectedObject.pivots[0] || { localX: 0, localY: 0 };
                            // Convert world lassoPoints to local coordinates of the selected object
                            const localLassoPoints = lassoPoints.map(wp => worldToLocal(wp, selectedObject.transform, localPivot));
                            
                            const newDeformState = {
                              active: true,
                              lassoPoints: localLassoPoints,
                              transform: selectedObject.lassoDeformState?.transform || {
                                x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, rotateX: 0, rotateY: 0, perspective: 0
                              }
                            };
                            updateObject(selectedObject.id, {
                              lassoDeformState: newDeformState
                            });
                            setFrames(prev => prev.map((frame, idx) => {
                              if (idx !== currentFrameIndex) return frame;
                              if (!frame.objects || !frame.objects[selectedObject.id]) return frame;
                              return {
                                ...frame,
                                objects: {
                                  ...frame.objects,
                                  [selectedObject.id]: {
                                    ...frame.objects[selectedObject.id],
                                    lassoDeformState: newDeformState
                                  }
                                }
                              };
                            }));
                          }}
                          className="flex-1 py-2 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 hover:text-white text-[10px] font-black rounded-lg transition-all uppercase tracking-wider disabled:opacity-30 disabled:pointer-events-none"
                        >
                          Set Selected Region ({lassoPoints.length} PTS)
                        </button>

                        {(selectedObject.lassoDeformState?.lassoPoints?.length ?? 0) > 0 && (
                          <button
                            onClick={() => {
                              updateObject(selectedObject.id, {
                                lassoDeformState: undefined
                              });
                            }}
                            className="px-3 bg-neutral-900 border border-neutral-800 hover:border-rose-950 text-neutral-400 hover:text-rose-400 rounded-lg transition-all"
                            title="Clear Deform Region"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Display current region status */}
                      <div className="flex items-center justify-between text-[10px] bg-neutral-900/40 px-3 py-2 rounded-xl border border-neutral-800/40">
                        <span className="text-neutral-400 font-mono">Assigned Region:</span>
                        <span className="text-neutral-200 font-bold font-mono">
                          {selectedObject.lassoDeformState?.lassoPoints 
                            ? `${selectedObject.lassoDeformState.lassoPoints.length} Points` 
                            : 'None'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* MESH TRANSFORM OPTIONS */}
                {activeTool === 'MSH' && (
                  <div className="space-y-4 bg-amber-500/5 p-4 rounded-2xl border border-amber-400/20 shadow-lg shadow-black/20">
                    <div className="flex items-center justify-between border-b border-amber-500/10 pb-2.5">
                      <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
                        MESH TRANSFORM OPTIONS
                      </span>
                    </div>

                    {!selectedObject.meshState ? (
                      <div className="space-y-3">
                        <p className="text-[10px] text-neutral-400 leading-normal font-bold">
                          Create a 2D control point mesh to wrap and warp this object's geometry fluidly!
                        </p>
                        <div className="space-y-1.5">
                          <label className="text-[10px] text-neutral-400 block font-black uppercase tracking-wide">Grid Density Preset:</label>
                          <div className="grid grid-cols-3 gap-1.5">
                            <button
                              onClick={() => handleInitMesh(5, 5)}
                              className="py-1.5 bg-neutral-800 hover:bg-amber-500 hover:text-neutral-950 text-neutral-300 text-[10px] font-black rounded-lg transition-all"
                            >
                              LOW (5x5)
                            </button>
                            <button
                              onClick={() => handleInitMesh(10, 10)}
                              className="py-1.5 bg-neutral-800 hover:bg-amber-500 hover:text-neutral-950 text-neutral-300 text-[10px] font-black rounded-lg transition-all"
                            >
                              MED (10x10)
                            </button>
                            <button
                              onClick={() => handleInitMesh(20, 20)}
                              className="py-1.5 bg-neutral-800 hover:bg-amber-500 hover:text-neutral-950 text-neutral-300 text-[10px] font-black rounded-lg transition-all"
                            >
                              HIGH (20x20)
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4 text-xs">
                        {/* Edit Mode Selector (Node vs Lattice) */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] text-neutral-400 block font-black uppercase tracking-wide">Deformation Edit Mode:</label>
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              onClick={() => updateObject(selectedObject.id, {
                                meshState: {
                                  ...selectedObject.meshState!,
                                  editMode: 'node'
                                }
                              })}
                              className={`py-1.5 text-[10px] font-black rounded-lg transition-all ${
                                (selectedObject.meshState.editMode || 'node') === 'node'
                                  ? 'bg-amber-500 text-neutral-950'
                                  : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                              }`}
                            >
                              DIRECT NODE
                            </button>
                            <button
                              onClick={() => {
                                handleInitLattice(4, 4);
                              }}
                              className={`py-1.5 text-[10px] font-black rounded-lg transition-all ${
                                selectedObject.meshState.editMode === 'lattice'
                                  ? 'bg-amber-500 text-neutral-950'
                                  : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                              }`}
                            >
                              LATTICE CAGE
                            </button>
                          </div>
                        </div>

                        {/* Node-specific controls */}
                        {(selectedObject.meshState.editMode || 'node') === 'node' && (
                          <div className="space-y-3 bg-neutral-900/40 p-3 rounded-xl border border-neutral-800/60">
                            {/* Falloff Radius */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-neutral-400">
                                <span className="font-bold">Soft Selection Falloff</span>
                                <span className="text-amber-400 font-bold">{selectedObject.meshState.falloffRadius ?? 100}px</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="400"
                                value={selectedObject.meshState.falloffRadius ?? 100}
                                onChange={(e) => updateObject(selectedObject.id, {
                                  meshState: {
                                    ...selectedObject.meshState!,
                                    falloffRadius: parseInt(e.target.value)
                                  }
                                })}
                                className="w-full accent-amber-500"
                              />
                            </div>

                            {/* Symmetry */}
                            <div className="space-y-2 pt-1 border-t border-neutral-800/40">
                              <label className="flex items-center gap-2 text-[10px] text-neutral-300 select-none cursor-pointer font-bold">
                                <input
                                  type="checkbox"
                                  checked={selectedObject.meshState.symmetryActive ?? false}
                                  onChange={(e) => updateObject(selectedObject.id, {
                                    meshState: {
                                      ...selectedObject.meshState!,
                                      symmetryActive: e.target.checked
                                    }
                                  })}
                                  className="accent-amber-500 rounded border-neutral-800"
                                />
                                <span>Enable Symmetry Mapping</span>
                              </label>

                              {selectedObject.meshState.symmetryActive && (
                                <div className="flex items-center gap-3 pl-5">
                                  <span className="text-[9px] text-neutral-400 uppercase font-black">Axis:</span>
                                  <label className="flex items-center gap-1 text-[10px] text-neutral-300 cursor-pointer">
                                    <input
                                      type="radio"
                                      name="symmetryAxis"
                                      checked={(selectedObject.meshState.symmetryAxis || 'horizontal') === 'horizontal'}
                                      onChange={() => updateObject(selectedObject.id, {
                                        meshState: {
                                          ...selectedObject.meshState!,
                                          symmetryAxis: 'horizontal'
                                        }
                                      })}
                                      className="accent-amber-500"
                                    />
                                    <span>Horizontal (X)</span>
                                  </label>
                                  <label className="flex items-center gap-1 text-[10px] text-neutral-300 cursor-pointer">
                                    <input
                                      type="radio"
                                      name="symmetryAxis"
                                      checked={selectedObject.meshState.symmetryAxis === 'vertical'}
                                      onChange={() => updateObject(selectedObject.id, {
                                        meshState: {
                                          ...selectedObject.meshState!,
                                          symmetryAxis: 'vertical'
                                        }
                                      })}
                                      className="accent-amber-500"
                                    />
                                    <span>Vertical (Y)</span>
                                  </label>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Lattice Mode Indicator */}
                        {selectedObject.meshState.editMode === 'lattice' && (
                          <div className="bg-emerald-950/20 border border-emerald-500/20 p-2.5 rounded-xl text-[10px] text-neutral-400 font-medium leading-relaxed">
                            <span className="text-emerald-400 font-bold block mb-1">Lattice Control Active:</span>
                            Drag the green lattice guide points on the canvas to warp the underlying geometry grid smoothly!
                          </div>
                        )}

                        {/* Point Size */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-neutral-400">
                            <span>Control Point Size</span>
                            <span className="text-amber-400 font-bold">{selectedObject.meshState.pointSize}px</span>
                          </div>
                          <input
                            type="range"
                            min="15"
                            max="50"
                            value={selectedObject.meshState.pointSize}
                            onChange={(e) => updateObject(selectedObject.id, {
                              meshState: {
                                ...selectedObject.meshState!,
                                pointSize: parseInt(e.target.value)
                              }
                            })}
                            className="w-full accent-amber-500"
                          />
                        </div>

                        {/* Checkboxes */}
                        <div className="space-y-2 pt-1 border-t border-neutral-800/40">
                          <label className="flex items-center gap-2 text-xs text-neutral-300 select-none cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedObject.meshState.showGrid}
                              onChange={(e) => updateObject(selectedObject.id, {
                                meshState: {
                                  ...selectedObject.meshState!,
                                  showGrid: e.target.checked
                                }
                              })}
                              className="accent-amber-500 rounded border-neutral-800"
                            />
                            <span>Show Grid Lines</span>
                          </label>

                          <label className="flex items-center gap-2 text-xs text-neutral-300 select-none cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedObject.meshState.showPoints}
                              onChange={(e) => updateObject(selectedObject.id, {
                                meshState: {
                                  ...selectedObject.meshState!,
                                  showPoints: e.target.checked
                                }
                              })}
                              className="accent-amber-500 rounded border-neutral-800"
                            />
                            <span>Show Grid Points</span>
                          </label>

                          <label className="flex items-center gap-2 text-xs text-neutral-300 select-none cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedObject.meshState.previewMode}
                              onChange={(e) => updateObject(selectedObject.id, {
                                meshState: {
                                  ...selectedObject.meshState!,
                                  previewMode: e.target.checked
                                }
                              })}
                              className="accent-amber-500 rounded border-neutral-800"
                            />
                            <span>Deform Live Preview</span>
                          </label>

                          <label className="flex items-start gap-2 text-xs text-amber-300 font-bold select-none cursor-pointer p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl hover:bg-amber-500/20 transition-all mt-2">
                            <input
                              type="checkbox"
                              checked={selectedObject.meshState.pointExtrudeMode ?? false}
                              onChange={(e) => updateObject(selectedObject.id, {
                                meshState: {
                                  ...selectedObject.meshState!,
                                  pointExtrudeMode: e.target.checked
                                }
                              })}
                              className="accent-amber-500 rounded border-neutral-800 mt-0.5"
                            />
                            <div className="flex flex-col gap-0.5">
                              <span className="text-amber-400 font-extrabold uppercase text-[10px] tracking-wider">⚡ Extrude Point / Branch Mode</span>
                              <span className="text-[9px] text-neutral-300 font-normal leading-normal">
                                Click & drag any mesh point or stroke vertex to pull out a new connected stroke branch from the drawing!
                              </span>
                            </div>
                          </label>

                          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex flex-col gap-1.5 mt-2">
                            <div className="flex items-center justify-between">
                              <span className="text-emerald-400 font-extrabold uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                                <GitCommit className="w-3.5 h-3.5" /> Vector Pen Curve Reshape
                              </span>
                              <button
                                onClick={() => setActiveTool('VPR')}
                                className="px-2 py-1 bg-emerald-500 text-neutral-950 font-black text-[10px] rounded-lg hover:bg-emerald-400 transition-all shadow-sm"
                              >
                                Activate Pen Points
                              </button>
                            </div>
                            <span className="text-[9px] text-neutral-300 leading-relaxed font-normal">
                              Place custom vector points anywhere on drawing strokes to capture local stroke areas and bend or reshape straight lines into circles, curves, or custom arcs!
                            </span>
                          </div>
                        </div>

                        {/* Done & Cancel buttons */}
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-800/40">
                          <button
                            onClick={() => {
                              // Bake the deformation permanently into geometry points!
                              const bounds = calculateBoundingBox(selectedObject.points);
                              const deformedPoints = selectedObject.points.map(p => {
                                const { densityX, densityY, points } = selectedObject.meshState!;
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
                                return {
                                  x: topLeft.currentX * (1 - tx) * (1 - ty) + topRight.currentX * tx * (1 - ty) + bottomLeft.currentX * (1 - tx) * ty + bottomRight.currentX * tx * ty,
                                  y: topLeft.currentY * (1 - tx) * (1 - ty) + topRight.currentY * tx * (1 - ty) + bottomLeft.currentY * (1 - tx) * ty + bottomRight.currentY * tx * ty,
                                };
                              });
                              updateObject(selectedObject.id, {
                                points: deformedPoints,
                                meshState: undefined
                              });
                              setActiveTool('SEL');
                            }}
                            className="py-2 bg-emerald-500 text-neutral-950 hover:bg-emerald-400 font-bold rounded-xl transition-all shadow-md shadow-emerald-500/10"
                          >
                            Bake & Done
                          </button>
                          <button
                            onClick={() => {
                              // Cancel deformation
                              updateObject(selectedObject.id, {
                                meshState: undefined
                              });
                              setActiveTool('SEL');
                            }}
                            className="py-2 bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700 font-bold rounded-xl transition-all"
                          >
                            Discard
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* SPLINE RESHAPE OPTIONS */}
                {activeTool === 'SPL' && (
                  <div className="space-y-4 bg-cyan-500/5 p-4 rounded-2xl border border-cyan-400/20 shadow-lg shadow-black/20">
                    <div className="flex items-center justify-between border-b border-cyan-500/10 pb-2.5">
                      <span className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-cyan-500 animate-pulse" />
                        SPLINE RESHAPE SYSTEM
                      </span>
                    </div>

                    {!selectedObject.splineActive ? (
                      <div className="space-y-3 text-xs">
                        <p className="text-[10px] text-neutral-400 leading-normal font-bold">
                          Convert target vectors into a parametric Bezier curve to deform, stretch, rotate, and twist vectors along the curve dynamically!
                        </p>
                        <div className="space-y-1.5">
                          <label className="text-[10px] text-neutral-400 block font-black uppercase tracking-wide">Spline Density Preset:</label>
                          <div className="grid grid-cols-3 gap-1.5">
                            <button
                              onClick={() => handleInitSpline(2)}
                              className="py-1.5 bg-neutral-800 hover:bg-cyan-500 hover:text-neutral-950 text-neutral-300 text-[10px] font-black rounded-lg transition-all"
                            >
                              LOW (2 SEG)
                            </button>
                            <button
                              onClick={() => handleInitSpline(3)}
                              className="py-1.5 bg-neutral-800 hover:bg-cyan-500 hover:text-neutral-950 text-neutral-300 text-[10px] font-black rounded-lg transition-all"
                            >
                              MED (3 SEG)
                            </button>
                            <button
                              onClick={() => handleInitSpline(4)}
                              className="py-1.5 bg-neutral-800 hover:bg-cyan-500 hover:text-neutral-950 text-neutral-300 text-[10px] font-black rounded-lg transition-all"
                            >
                              HIGH (4 SEG)
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4 text-xs">
                        {/* Uniform stretch toggle */}
                        <label className="flex items-center gap-2 text-xs text-neutral-300 select-none cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedObject.splineUniformStretch ?? true}
                            onChange={(e) => updateObject(selectedObject.id, {
                              splineUniformStretch: e.target.checked
                            })}
                            className="accent-cyan-500 rounded border-neutral-800"
                          />
                          <span>Uniform Conformal Stretch</span>
                        </label>

                        {/* Twist points display / sliders */}
                        <div className="space-y-2.5 pt-1.5 border-t border-neutral-800/40">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase text-neutral-400">Twist & Scale Points:</span>
                            <button
                              onClick={() => {
                                const twists = [...(selectedObject.splineTwistPoints || [])];
                                twists.push({ id: 'twist_' + Date.now(), t: 0.5, rotation: 45, scale: 1.2 });
                                updateObject(selectedObject.id, { splineTwistPoints: twists });
                              }}
                              className="text-[9px] font-black text-cyan-400 hover:text-cyan-300 uppercase tracking-wide bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/30 transition-all"
                            >
                              + Add Twist Point
                            </button>
                          </div>

                          <div className="max-h-[140px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                            {(selectedObject.splineTwistPoints || []).map((tp, idx) => (
                              <div key={idx} className="bg-neutral-900/60 p-2 rounded-xl border border-neutral-800/60 space-y-1.5">
                                <div className="flex items-center justify-between text-[9px] text-neutral-400 font-bold uppercase">
                                  <span>Twist Point #{idx+1} (t: {tp.t.toFixed(2)})</span>
                                  <button
                                    onClick={() => {
                                      const twists = (selectedObject.splineTwistPoints || []).filter((_, i) => i !== idx);
                                      updateObject(selectedObject.id, { splineTwistPoints: twists });
                                    }}
                                    className="text-rose-500 hover:text-rose-400"
                                  >
                                    Delete
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  {/* Rotation */}
                                  <div className="space-y-0.5">
                                    <div className="flex justify-between text-[8px] text-neutral-400">
                                      <span>Rotation:</span>
                                      <span className="text-cyan-400 font-bold">{tp.rotation}°</span>
                                    </div>
                                    <input
                                      type="range"
                                      min="-180"
                                      max="180"
                                      value={tp.rotation}
                                      onChange={(e) => {
                                        const twists = (selectedObject.splineTwistPoints || []).map((item, i) => 
                                          i === idx ? { ...item, rotation: parseInt(e.target.value) } : item
                                        );
                                        updateObject(selectedObject.id, { splineTwistPoints: twists });
                                      }}
                                      className="w-full accent-cyan-500 scale-90"
                                    />
                                  </div>
                                  {/* Scale */}
                                  <div className="space-y-0.5">
                                    <div className="flex justify-between text-[8px] text-neutral-400">
                                      <span>Thickness:</span>
                                      <span className="text-cyan-400 font-bold">{tp.scale.toFixed(1)}x</span>
                                    </div>
                                    <input
                                      type="range"
                                      min="10"
                                      max="300"
                                      value={tp.scale * 100}
                                      onChange={(e) => {
                                        const twists = (selectedObject.splineTwistPoints || []).map((item, i) => 
                                          i === idx ? { ...item, scale: parseInt(e.target.value) / 100 } : item
                                        );
                                        updateObject(selectedObject.id, { splineTwistPoints: twists });
                                      }}
                                      className="w-full accent-cyan-500 scale-90"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Done & Cancel buttons */}
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-800/40">
                          <button
                            onClick={() => {
                              // Permanent baking logic of Spline warp
                              const bounds = calculateBoundingBox(selectedObject.splineOriginalPoints || selectedObject.points);
                              const minX = bounds.x;
                              const maxX = bounds.x + bounds.width;
                              const midY = bounds.y + bounds.height / 2;

                              const evaluateCubicBezierLocal = (p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point => {
                                const mt = 1 - t;
                                return {
                                  x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
                                  y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y
                                };
                              };

                              const evaluateCubicBezierDerivativeLocal = (p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point => {
                                const mt = 1 - t;
                                return {
                                  x: 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
                                  y: 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y)
                                };
                              };

                              const getSplineWarpedLocal = (p: Point): Point => {
                                if (!selectedObject.splineControlPoints || selectedObject.splineControlPoints.length === 0) return p;
                                
                                const width = bounds.width || 1;
                                const t = Math.max(0, Math.min(1, (p.x - minX) / width));
                                const perpOffset = p.y - midY;
                                
                                const segmentsCount = selectedObject.splineControlPoints.length;
                                const rawSegmentT = t * segmentsCount;
                                let segIndex = Math.floor(rawSegmentT);
                                if (segIndex >= segmentsCount) segIndex = segmentsCount - 1;
                                const localT = rawSegmentT - segIndex;
                                
                                const seg = selectedObject.splineControlPoints[segIndex];
                                if (!seg) return p;
                                
                                const curvePt = evaluateCubicBezierLocal(seg.start, seg.cp1, seg.cp2, seg.end, localT);
                                const tangent = evaluateCubicBezierDerivativeLocal(seg.start, seg.cp1, seg.cp2, seg.end, localT);
                                const len = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y) || 1;
                                const normal = { x: -tangent.y / len, y: tangent.x / len };
                                
                                let interpolatedRotation = 0;
                                let interpolatedScale = 1.0;
                                
                                const twists = selectedObject.splineTwistPoints || [];
                                if (twists.length > 0) {
                                  const sortedTwists = [...twists].sort((a, b) => a.t - b.t);
                                  if (t <= sortedTwists[0].t) {
                                    interpolatedRotation = sortedTwists[0].rotation;
                                    interpolatedScale = sortedTwists[0].scale;
                                  } else if (t >= sortedTwists[sortedTwists.length - 1].t) {
                                    interpolatedRotation = sortedTwists[sortedTwists.length - 1].rotation;
                                    interpolatedScale = sortedTwists[sortedTwists.length - 1].scale;
                                  } else {
                                    for (let i = 0; i < sortedTwists.length - 1; i++) {
                                      const tp0 = sortedTwists[i];
                                      const tp1 = sortedTwists[i + 1];
                                      if (t >= tp0.t && t <= tp1.t) {
                                        const ratio = (t - tp0.t) / (tp1.t - tp0.t);
                                        interpolatedRotation = tp0.rotation + (tp1.rotation - tp0.rotation) * ratio;
                                        interpolatedScale = tp0.scale + (tp1.scale - tp0.scale) * ratio;
                                        break;
                                      }
                                    }
                                  }
                                }
                                
                                const angleRad = interpolatedRotation * Math.PI / 180;
                                const rotatedNormalX = normal.x * Math.cos(angleRad) - normal.y * Math.sin(angleRad);
                                const rotatedNormalY = normal.x * Math.sin(angleRad) + normal.y * Math.cos(angleRad);
                                
                                return {
                                  x: curvePt.x + perpOffset * interpolatedScale * rotatedNormalX,
                                  y: curvePt.y + perpOffset * interpolatedScale * rotatedNormalY
                                };
                              };

                              const deformedPoints = (selectedObject.splineOriginalPoints || selectedObject.points).map(p => {
                                return getSplineWarpedLocal(p);
                              });

                              updateObject(selectedObject.id, {
                                points: deformedPoints,
                                splineActive: undefined,
                                splineControlPoints: undefined,
                                splineTwistPoints: undefined,
                                splineOriginalPoints: undefined
                              });
                              setActiveTool('SEL');
                            }}
                            className="py-2 bg-emerald-500 text-neutral-950 hover:bg-emerald-400 font-bold rounded-xl transition-all shadow-md shadow-emerald-500/10"
                          >
                            Bake & Done
                          </button>
                          <button
                            onClick={() => {
                              // Cancel deformation
                              updateObject(selectedObject.id, {
                                splineActive: undefined,
                                splineControlPoints: undefined,
                                splineTwistPoints: undefined,
                                splineOriginalPoints: undefined
                              });
                              setActiveTool('SEL');
                            }}
                            className="py-2 bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700 font-bold rounded-xl transition-all"
                          >
                            Discard
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* SMART MESH COLORING OPTIONS */}
                {activeTool === 'MCL' && (
                  <div className="space-y-4 bg-emerald-500/5 p-4 rounded-2xl border border-emerald-400/20 shadow-lg shadow-black/20">
                    <div className="flex items-center justify-between border-b border-emerald-500/10 pb-2.5">
                      <span className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                        <Palette className="w-4 h-4 text-emerald-500 animate-pulse" />
                        SMART MESH COLORING
                      </span>
                    </div>

                    {!selectedObject ? (
                      <p className="text-[10px] text-neutral-400 font-bold leading-normal">
                        Select a drawing on the canvas first to paint on its mesh!
                      </p>
                    ) : !selectedObject.smartMeshColor ? (
                      <div className="space-y-3">
                        <p className="text-[10px] text-neutral-400 leading-normal font-bold">
                          Create a simplified mesh grid over this drawing. You can directly brush color onto mesh cells or points, and colors will warp automatically with your deformations!
                        </p>
                        <div className="space-y-1.5">
                          <label className="text-[10px] text-neutral-400 block font-black uppercase tracking-wide">Grid Density Preset:</label>
                          <div className="grid grid-cols-3 gap-1.5">
                            <button
                              onClick={() => handleInitMeshColor(selectedObject, 6, 6)}
                              className="py-1.5 bg-neutral-800 hover:bg-emerald-500 hover:text-neutral-950 text-neutral-300 text-[10px] font-black rounded-lg transition-all"
                            >
                              LOW (6x6)
                            </button>
                            <button
                              onClick={() => handleInitMeshColor(selectedObject, 10, 10)}
                              className="py-1.5 bg-neutral-800 hover:bg-emerald-500 hover:text-neutral-950 text-neutral-300 text-[10px] font-black rounded-lg transition-all"
                            >
                              MED (10x10)
                            </button>
                            <button
                              onClick={() => handleInitMeshColor(selectedObject, 16, 16)}
                              className="py-1.5 bg-neutral-800 hover:bg-emerald-500 hover:text-neutral-950 text-neutral-300 text-[10px] font-black rounded-lg transition-all"
                            >
                              HIGH (16x16)
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4 text-xs">
                        {/* Color Picker & Mode */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-black">Brush Color</span>
                            <span className="text-[10px] text-emerald-400 font-bold">Mode</span>
                          </div>
                          
                          <div className="flex gap-2">
                            <CustomColorPicker 
                              color={brushColor} 
                              onChange={(val) => {
                                setBrushColor(val);
                                handleUpdateMeshColorConfig({ brushColor: val });
                              }}
                            />
                            <div className="flex-1 grid grid-cols-2 gap-1 bg-neutral-950 p-0.5 rounded-lg border border-neutral-800/40">
                              <button
                                onClick={() => handleUpdateMeshColorConfig({ paintMode: 'cell' })}
                                className={`py-1 text-[10px] font-bold rounded-md transition-all ${
                                  selectedObject.smartMeshColor.paintMode === 'cell' 
                                    ? 'bg-emerald-500 text-neutral-950' 
                                    : 'text-neutral-400 hover:text-white'
                                }`}
                              >
                                Fill Cell
                              </button>
                              <button
                                onClick={() => handleUpdateMeshColorConfig({ paintMode: 'point' })}
                                className={`py-1 text-[10px] font-bold rounded-md transition-all ${
                                  selectedObject.smartMeshColor.paintMode === 'point' 
                                    ? 'bg-emerald-500 text-neutral-950' 
                                    : 'text-neutral-400 hover:text-white'
                                }`}
                              >
                                Glow Point
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Brush Settings */}
                        <div className="space-y-2 border-t border-neutral-800/40 pt-2.5">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span className="font-bold uppercase tracking-wider">Brush Radius</span>
                            <span className="text-emerald-400 font-bold font-mono">{selectedObject.smartMeshColor.brushSize}px</span>
                          </div>
                          <input
                            type="range"
                            min="10"
                            max="120"
                            value={selectedObject.smartMeshColor.brushSize}
                            onChange={(e) => handleUpdateMeshColorConfig({ brushSize: parseInt(e.target.value) })}
                            className="w-full accent-emerald-500"
                          />

                          <div className="flex items-center justify-between text-[10px] text-neutral-400 mt-2">
                            <span className="font-bold uppercase tracking-wider">Paint Opacity</span>
                            <span className="text-emerald-400 font-bold font-mono">{Math.round(selectedObject.smartMeshColor.brushOpacity * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min="10"
                            max="100"
                            value={Math.round(selectedObject.smartMeshColor.brushOpacity * 100)}
                            onChange={(e) => handleUpdateMeshColorConfig({ brushOpacity: parseFloat(e.target.value) / 100 })}
                            className="w-full accent-emerald-500"
                          />
                        </div>

                        {/* Layers & View Settings */}
                        <div className="space-y-2 border-t border-neutral-800/40 pt-2.5">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span className="font-bold uppercase tracking-wider">Color Layers</span>
                            <button 
                              onClick={handleAddMeshColorLayer}
                              className="px-2 py-0.5 bg-neutral-800 hover:bg-emerald-500 hover:text-neutral-950 text-[9px] font-bold rounded transition-all flex items-center gap-1"
                            >
                              <Plus className="w-2.5 h-2.5" /> Add Layer
                            </button>
                          </div>
                          
                          <div className="space-y-1 max-h-28 overflow-y-auto bg-neutral-950/60 rounded-xl border border-neutral-800/40 p-1.5 scrollbar-thin">
                            {selectedObject.smartMeshColor.layers.map((layer, idx) => (
                              <div 
                                key={layer.id} 
                                onClick={() => handleUpdateMeshColorConfig({ activeLayerIndex: idx })}
                                className={`flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition-all ${
                                  selectedObject.smartMeshColor?.activeLayerIndex === idx 
                                    ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold' 
                                    : 'text-neutral-400 hover:text-white border border-transparent hover:bg-neutral-800/40'
                                }`}
                              >
                                <span className="text-[10px] truncate">{layer.name}</span>
                                <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                  <button 
                                    onClick={() => handleToggleMeshColorLayerVis(idx)}
                                    className="p-0.5 hover:text-emerald-400 text-neutral-500 transition-colors"
                                  >
                                    {layer.visible ? '👁' : '👁‍c'}
                                  </button>
                                  {selectedObject.smartMeshColor.layers.length > 1 && (
                                    <button 
                                      onClick={() => handleDeleteMeshColorLayer(idx)}
                                      className="p-0.5 hover:text-rose-400 text-neutral-500 transition-colors"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Action Controls */}
                        <div className="space-y-1.5 border-t border-neutral-800/40 pt-2.5">
                          <label className="flex items-center gap-2 text-xs text-neutral-300 select-none cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedObject.smartMeshColor.previewMode}
                              onChange={(e) => handleUpdateMeshColorConfig({ previewMode: e.target.checked })}
                              className="accent-emerald-500 rounded border-neutral-800"
                            />
                            <span>Mesh Live Overlay Preview</span>
                          </label>

                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <button
                              onClick={async () => {
                                if (await window.customConfirm("Clear all mesh colors on this object?", "Clear Colors")) {
                                  handleClearMeshColors(selectedObject);
                                }
                              }}
                              className="py-1.5 bg-neutral-900 hover:bg-rose-950 text-neutral-400 hover:text-rose-300 text-[10px] font-black rounded-lg border border-neutral-800 hover:border-rose-900 transition-all uppercase tracking-wider"
                            >
                              Clear Colors
                            </button>
                            <button
                              onClick={() => {
                                setActiveTool('SEL');
                              }}
                              className="py-1.5 bg-emerald-500 text-neutral-950 hover:bg-emerald-400 text-[10px] font-black rounded-lg transition-all uppercase tracking-wider text-center"
                            >
                              ✓ Complete
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* SMART PIN WARP */}
                {activeTool === 'SWP' && (
                  <div className="space-y-4 bg-sky-500/5 p-4 rounded-2xl border border-sky-400/20 shadow-lg shadow-black/20">
                    <div className="flex items-center justify-between border-b border-sky-500/10 pb-2.5">
                      <span className="text-xs font-black uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-sky-500 animate-pulse" />
                        SMART PIN WARPING
                      </span>
                    </div>

                    {!selectedObject ? (
                      <p className="text-[10px] text-neutral-400 font-bold leading-normal">
                        Select a drawing on the canvas first to place deformation pins!
                      </p>
                    ) : !selectedObject.smartWarp ? (
                      <div className="space-y-3">
                        <p className="text-[10px] text-neutral-400 leading-normal font-bold">
                          Add custom warp pins directly onto your drawing! Drag pins to deform the body part smoothly. This offers extremely precise puppet-like control with zero mesh clutter.
                        </p>
                        <button
                          onClick={() => handleInitSmartWarp(selectedObject)}
                          className="w-full py-2 bg-sky-500 text-neutral-950 hover:bg-sky-400 text-[10px] font-black rounded-lg transition-all uppercase tracking-wider"
                        >
                          Initialize Smart Warp Pins
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4 text-xs">
                        {/* Pin Options */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span className="font-bold uppercase tracking-wider">Pin Grab Size</span>
                            <span className="text-sky-400 font-bold font-mono">{selectedObject.smartWarp.pinSize}px</span>
                          </div>
                          <input
                            type="range"
                            min="20"
                            max="60"
                            value={selectedObject.smartWarp.pinSize}
                            onChange={(e) => handleUpdateSmartWarpConfig({ pinSize: parseInt(e.target.value) })}
                            className="w-full accent-sky-500"
                          />
                        </div>

                        {/* Influence Area Settings */}
                        <div className="space-y-2 border-t border-neutral-800/40 pt-2.5">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span className="font-bold uppercase tracking-wider">Influence Radius</span>
                            <span className="text-sky-400 font-bold font-mono">{selectedObject.smartWarp.influenceRadius}px</span>
                          </div>
                          <input
                            type="range"
                            min="30"
                            max="300"
                            value={selectedObject.smartWarp.influenceRadius}
                            onChange={(e) => handleUpdateSmartWarpConfig({ influenceRadius: parseInt(e.target.value) })}
                            className="w-full accent-sky-500"
                          />

                          <div className="space-y-1 mt-2">
                            <label className="text-[10px] text-neutral-400 block font-black uppercase tracking-wide">Deformation Falloff:</label>
                            <div className="grid grid-cols-3 gap-1">
                              {(['linear', 'smooth', 'sharp'] as const).map((falloff) => (
                                <button
                                  key={falloff}
                                  onClick={() => handleUpdateSmartWarpConfig({ influenceFalloff: falloff })}
                                  className={`py-1 text-[9px] font-black rounded-md uppercase transition-all ${
                                    selectedObject.smartWarp?.influenceFalloff === falloff
                                      ? 'bg-sky-500 text-neutral-950'
                                      : 'bg-neutral-800 text-neutral-400 hover:text-white'
                                  }`}
                                >
                                  {falloff}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Active Pins List */}
                        <div className="space-y-2 border-t border-neutral-800/40 pt-2.5">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span className="font-bold uppercase tracking-wider">Active Warp Pins ({selectedObject.smartWarp.pins.length})</span>
                          </div>
                          {selectedObject.smartWarp.pins.length === 0 ? (
                            <p className="text-[10px] text-neutral-500 italic">
                              Click anywhere directly on the drawing to add warp pins!
                            </p>
                          ) : (
                            <div className="space-y-1 max-h-24 overflow-y-auto bg-neutral-950/60 rounded-xl border border-neutral-800/40 p-1.5 scrollbar-thin">
                              {selectedObject.smartWarp.pins.map((pin, pIdx) => (
                                <div
                                  key={pin.id}
                                  className="flex items-center justify-between px-2 py-1.5 rounded-lg text-neutral-300 bg-neutral-900/40 border border-neutral-800/40"
                                >
                                  <span className="text-[10px] font-mono">Pin #{pIdx + 1} ({Math.round(pin.currentX)}, {Math.round(pin.currentY)})</span>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => handleTogglePinLock(pin.id)}
                                      className="p-0.5 hover:text-sky-400 text-neutral-500 transition-colors"
                                      title={pin.locked ? "Unlock Pin" : "Lock Pin Position"}
                                    >
                                      {pin.locked ? '🔒' : '🔓'}
                                    </button>
                                    <button
                                      onClick={() => handleDeletePin(pin.id)}
                                      className="p-0.5 hover:text-rose-400 text-neutral-500 transition-colors"
                                      title="Delete Pin"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Controls */}
                        <div className="space-y-1.5 border-t border-neutral-800/40 pt-2.5">
                          <label className="flex items-center gap-2 text-xs text-neutral-300 select-none cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedObject.smartWarp.showInfluenceArea}
                              onChange={(e) => handleUpdateSmartWarpConfig({ showInfluenceArea: e.target.checked })}
                              className="accent-sky-500 rounded border-neutral-800"
                            />
                            <span>Show Influence Radii Overlays</span>
                          </label>

                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <button
                              onClick={async () => {
                                if (await window.customConfirm("Reset all warp pins on this object?", "Reset Pins")) {
                                  handleResetWarpPins(selectedObject);
                                }
                              }}
                              className="py-1.5 bg-neutral-900 hover:bg-rose-950 text-neutral-400 hover:text-rose-300 text-[10px] font-black rounded-lg border border-neutral-800 hover:border-rose-900 transition-all uppercase tracking-wider"
                            >
                              Reset Pins
                            </button>
                            <button
                              onClick={() => {
                                setActiveTool('SEL');
                              }}
                              className="py-1.5 bg-sky-500 text-neutral-950 hover:bg-sky-400 text-[10px] font-black rounded-lg transition-all uppercase tracking-wider text-center"
                            >
                              ✓ Complete
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* PUPPET PIN WARP */}
                {activeTool === 'PIN' && (
                  <div className="space-y-4 bg-red-500/5 p-4 rounded-2xl border border-red-400/20 shadow-lg shadow-black/20 animate-fade-in">
                    <div className="flex items-center justify-between border-b border-red-500/10 pb-2.5">
                      <span className="text-xs font-black uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-red-500 animate-pulse" />
                        PUPPET PIN WARPING (WRAP)
                      </span>
                    </div>

                    {!selectedObject ? (
                      <p className="text-[10px] text-neutral-400 font-bold leading-normal">
                        Select a drawing or uploaded PNG on the canvas first to place puppet pins!
                      </p>
                    ) : (
                      <div className="space-y-4 text-xs">
                        <p className="text-[10px] text-neutral-400 leading-normal font-bold">
                          Click anywhere directly on the drawing or uploaded PNG to place deformation pins. Drag these pins on the canvas using the <strong>PIN</strong> or <strong>SEL</strong> tool to smoothly warp and stretch the artwork!
                        </p>

                        {/* Active Pins List */}
                        <div className="space-y-2 border-t border-neutral-800/40 pt-2.5">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span className="font-bold uppercase tracking-wider">Active Puppet Pins ({(selectedObject.pins || []).length})</span>
                          </div>
                          {(!selectedObject.pins || selectedObject.pins.length === 0) ? (
                            <p className="text-[10px] text-neutral-500 italic">
                              No pins placed yet. Click on the drawing to add your first puppet pin!
                            </p>
                          ) : (
                            <div className="space-y-1 max-h-32 overflow-y-auto bg-neutral-950/60 rounded-xl border border-neutral-800/40 p-1.5 scrollbar-thin">
                              {selectedObject.pins.map((pin, pIdx) => {
                                const curX = pin.currentLocalX !== undefined ? pin.currentLocalX : pin.localX;
                                const curY = pin.currentLocalY !== undefined ? pin.currentLocalY : pin.localY;
                                return (
                                  <div
                                    key={pin.id}
                                    className="flex items-center justify-between px-2 py-1.5 rounded-lg text-neutral-300 bg-neutral-900/40 border border-neutral-800/40"
                                  >
                                    <span className="text-[10px] font-mono">Pin #{pIdx + 1} ({Math.round(curX)}, {Math.round(curY)})</span>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        onClick={() => {
                                          const nextPins = (selectedObject.pins || []).map(p => p.id === pin.id ? { ...p, locked: !p.locked } : p);
                                          updateObject(selectedObject.id, { pins: nextPins });
                                        }}
                                        className="p-0.5 hover:text-red-400 text-neutral-500 transition-colors"
                                        title={pin.locked ? "Unlock Pin" : "Lock Pin Position"}
                                      >
                                        {pin.locked ? '🔒' : '🔓'}
                                      </button>
                                      <button
                                        onClick={() => {
                                          const nextPins = (selectedObject.pins || []).filter(p => p.id !== pin.id);
                                          updateObject(selectedObject.id, { pins: nextPins });
                                        }}
                                        className="p-0.5 hover:text-rose-400 text-neutral-500 transition-colors"
                                        title="Delete Pin"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Controls */}
                        <div className="space-y-2 border-t border-neutral-800/40 pt-2.5">
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={async () => {
                                if (await window.customConfirm("Reset all puppet pins on this object?", "Reset Pins")) {
                                  const resetPins = (selectedObject.pins || []).map(p => ({
                                    ...p,
                                    currentLocalX: undefined,
                                    currentLocalY: undefined
                                  }));
                                  updateObject(selectedObject.id, { pins: resetPins });
                                }
                              }}
                              className="py-1.5 bg-neutral-900 hover:bg-rose-950 text-neutral-400 hover:text-rose-300 text-[10px] font-black rounded-lg border border-neutral-800 hover:border-rose-900 transition-all uppercase tracking-wider"
                            >
                              Reset Pins
                            </button>
                            <button
                              onClick={async () => {
                                if (await window.customConfirm("Clear all puppet pins on this object?", "Clear Pins")) {
                                  updateObject(selectedObject.id, { pins: [] });
                                }
                              }}
                              className="py-1.5 bg-neutral-900 hover:bg-rose-950 text-neutral-400 hover:text-rose-300 text-[10px] font-black rounded-lg border border-neutral-800 hover:border-rose-900 transition-all uppercase tracking-wider"
                            >
                              Clear All
                            </button>
                          </div>
                          <button
                            onClick={() => {
                              setActiveTool('SEL');
                            }}
                            className="w-full py-1.5 bg-red-500 text-neutral-950 hover:bg-red-400 text-[10px] font-black rounded-lg transition-all uppercase tracking-wider text-center"
                          >
                            ✓ Complete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* CAGE DEFORM PANEL */}
                {activeTool === 'CAG' && (
                  <div className="space-y-4 bg-emerald-500/5 p-4 rounded-2xl border border-emerald-400/20 shadow-lg shadow-black/20 animate-fade-in">
                    <div className="flex items-center justify-between border-b border-emerald-500/10 pb-2.5">
                      <span className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                        <Box className="w-4 h-4 text-emerald-500 animate-pulse" />
                        CAGE DEFORMATION
                      </span>
                    </div>

                    {!selectedObject ? (
                      <p className="text-[10px] text-neutral-400 font-bold leading-normal">
                        Select a drawing on the canvas first to activate cage deformation!
                      </p>
                    ) : !selectedObject.cageState || !selectedObject.cageState.active ? (
                      <div className="space-y-3">
                        <p className="text-[10px] text-neutral-400 leading-normal font-bold">
                          Create an outer boundary control cage (8 handles) surrounding your selected object. Moving handles deforms the entire shape smoothly like a modern high-end vector program!
                        </p>
                        <button
                          onClick={() => handleInitCage(selectedObject)}
                          className="w-full py-2 bg-emerald-500 text-neutral-950 hover:bg-emerald-400 text-[10px] font-black rounded-lg transition-all uppercase tracking-wider"
                        >
                          Initialize Control Cage
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4 text-xs">
                        {/* Show Grid option */}
                        <div className="space-y-1.5 pt-1">
                          <label className="flex items-center gap-2 text-xs text-neutral-300 select-none cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedObject.cageState.showGrid}
                              onChange={(e) => handleUpdateCageConfig({ showGrid: e.target.checked })}
                              className="accent-emerald-500 rounded border-neutral-800"
                            />
                            <span>Show Cage Grid Wireframe</span>
                          </label>
                        </div>

                        {/* List Cage Points for reference */}
                        <div className="space-y-2 border-t border-neutral-800/40 pt-2.5">
                          <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">
                            Control Handles ({selectedObject.cageState.points.length})
                          </div>
                          <p className="text-[10px] text-neutral-500 italic">
                            Drag any green corner or edge handle on the canvas to deform your shape in real-time!
                          </p>
                        </div>

                        {/* Cage controls */}
                        <div className="space-y-2 border-t border-neutral-800/40 pt-2.5">
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={async () => {
                                if (await window.customConfirm("Reset control cage handles?", "Reset Cage")) {
                                  handleResetCage(selectedObject);
                                }
                              }}
                              className="py-1.5 bg-neutral-900 hover:bg-rose-950 text-neutral-400 hover:text-rose-300 text-[10px] font-black rounded-lg border border-neutral-800 hover:border-rose-900 transition-all uppercase tracking-wider"
                            >
                              Reset Cage
                            </button>
                            <button
                              onClick={async () => {
                                if (await window.customConfirm("Disable control cage? This clears all cage-deformed states.", "Disable Cage")) {
                                  handleDisableCage(selectedObject);
                                }
                              }}
                              className="py-1.5 bg-neutral-900 hover:bg-rose-950 text-neutral-400 hover:text-rose-300 text-[10px] font-black rounded-lg border border-neutral-800 hover:border-rose-900 transition-all uppercase tracking-wider"
                            >
                              Clear Cage
                            </button>
                          </div>

                          <button
                            onClick={() => setActiveTool('SEL')}
                            className="w-full py-1.5 bg-emerald-500 text-neutral-950 hover:bg-emerald-400 text-[10px] font-black rounded-lg transition-all uppercase tracking-wider text-center block mt-2"
                          >
                            ✓ Complete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* LIQUIFY BRUSH PANEL */}
                {activeTool === 'LQB' && (
                  <div className="space-y-4 bg-pink-500/5 p-4 rounded-2xl border border-pink-400/20 shadow-lg shadow-black/20 animate-fade-in">
                    <div className="flex items-center justify-between border-b border-pink-500/10 pb-2.5">
                      <span className="text-xs font-black uppercase tracking-wider text-pink-400 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-pink-500 animate-pulse" />
                        LIQUIFY WARP BRUSH
                      </span>
                    </div>

                    {!selectedObject ? (
                      <p className="text-[10px] text-neutral-400 font-bold leading-normal">
                        Select a drawing on the canvas first to use the Liquify Brush!
                      </p>
                    ) : !selectedObject.meshState || !selectedObject.meshState.active ? (
                      <div className="space-y-3">
                        <p className="text-[10px] text-neutral-400 leading-normal font-bold">
                          The Liquify Brush lets you warp, push, pinch, twist or expand areas of your shape directly. Initializes a smooth high-density geometry warp mesh first!
                        </p>
                        <button
                          onClick={() => handleInitLiquifyMesh(selectedObject)}
                          className="w-full py-2 bg-pink-500 text-neutral-950 hover:bg-pink-400 text-[10px] font-black rounded-lg transition-all uppercase tracking-wider"
                        >
                          Initialize Warp Mesh
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4 text-xs">
                        {/* Brush settings */}
                        <div className="space-y-3">
                          {/* Size */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px] text-neutral-400">
                              <span className="font-bold uppercase tracking-wider">Brush Size</span>
                              <span className="text-pink-400 font-bold font-mono">{(liquifySettings?.brushSize) ?? 60}px</span>
                            </div>
                            <input
                              type="range"
                              min="20"
                              max="150"
                              value={(liquifySettings?.brushSize) ?? 60}
                              onChange={(e) => setLiquifySettings?.(prev => ({ ...prev, brushSize: parseInt(e.target.value) }))}
                              className="w-full accent-pink-500"
                            />
                          </div>

                          {/* Strength */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px] text-neutral-400">
                              <span className="font-bold uppercase tracking-wider">Brush Strength</span>
                              <span className="text-pink-400 font-bold font-mono">{Math.round(((liquifySettings?.brushStrength) ?? 0.3) * 100)}%</span>
                            </div>
                            <input
                              type="range"
                              min="5"
                              max="100"
                              value={Math.round(((liquifySettings?.brushStrength) ?? 0.3) * 100)}
                              onChange={(e) => setLiquifySettings?.(prev => ({ ...prev, brushStrength: parseFloat((parseInt(e.target.value) / 100).toFixed(2)) }))}
                              className="w-full accent-pink-500"
                            />
                          </div>
                        </div>

                        {/* Brush Modes */}
                        <div className="space-y-2 border-t border-neutral-800/40 pt-2.5">
                          <label className="text-[10px] text-neutral-400 block font-black uppercase tracking-wide">Liquify Mode:</label>
                          <div className="grid grid-cols-2 gap-1.5">
                            {[
                              { id: 'push', name: 'Push (Forward)' },
                              { id: 'pinch', name: 'Pinch (Shrink)' },
                              { id: 'bulge', name: 'Bulge (Bloat)' },
                              { id: 'twist-cw', name: 'Twist (CW)' },
                              { id: 'twist-ccw', name: 'Twist (CCW)' },
                              { id: 'restore', name: 'Reconstruct' }
                            ].map((mode) => (
                              <button
                                key={mode.id}
                                onClick={() => setLiquifySettings?.(prev => ({ ...prev, brushMode: mode.id as any }))}
                                className={`py-1.5 px-1 text-[9px] font-black rounded-lg uppercase transition-all ${
                                  ((liquifySettings?.brushMode) ?? 'push') === mode.id
                                    ? 'bg-pink-500 text-neutral-950 shadow-md shadow-pink-500/20'
                                    : 'bg-neutral-800 text-neutral-400 hover:text-white'
                                }`}
                              >
                                {mode.name}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Show Mesh wireframe check */}
                        <div className="space-y-1.5 border-t border-neutral-800/40 pt-2.5">
                          <label className="flex items-center gap-2 text-xs text-neutral-300 select-none cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedObject.meshState.showGrid}
                              onChange={(e) => updateObject(selectedObject.id, { meshState: { ...selectedObject.meshState, showGrid: e.target.checked } })}
                              className="accent-pink-500 rounded border-neutral-800"
                            />
                            <span>Show Deformation Mesh Grid</span>
                          </label>
                        </div>

                        {/* Controls */}
                        <div className="space-y-2 border-t border-neutral-800/40 pt-2.5">
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={async () => {
                                if (await window.customConfirm("Reset warp mesh? This reverses all brush strokes.", "Reset Warp Mesh")) {
                                  handleResetLiquify(selectedObject);
                                }
                              }}
                              className="py-1.5 bg-neutral-900 hover:bg-rose-950 text-neutral-400 hover:text-rose-300 text-[10px] font-black rounded-lg border border-neutral-800 hover:border-rose-900 transition-all uppercase tracking-wider"
                            >
                              Restore Original
                            </button>
                            <button
                              onClick={async () => {
                                if (await window.customConfirm("Clear warp mesh? This deletes the mesh entirely.", "Clear Warp Mesh")) {
                                  handleDisableLiquify(selectedObject);
                                }
                              }}
                              className="py-1.5 bg-neutral-900 hover:bg-rose-950 text-neutral-400 hover:text-rose-300 text-[10px] font-black rounded-lg border border-neutral-800 hover:border-rose-900 transition-all uppercase tracking-wider"
                            >
                              Clear Mesh
                            </button>
                          </div>

                          <button
                            onClick={() => setActiveTool('SEL')}
                            className="w-full py-1.5 bg-pink-500 text-neutral-950 hover:bg-pink-400 text-[10px] font-black rounded-lg transition-all uppercase tracking-wider text-center block mt-2"
                          >
                            ✓ Complete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* CURVE PATH DEFORMATION PANEL */}
                {activeTool === 'CPT' && (
                  <div className="space-y-4 bg-cyan-500/5 p-4 rounded-2xl border border-cyan-400/20 shadow-lg shadow-black/20 animate-fade-in">
                    <div className="flex items-center justify-between border-b border-cyan-500/10 pb-2.5">
                      <span className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                        <GitFork className="w-4 h-4 text-cyan-500 rotate-90" />
                        CURVE PATH WARP
                      </span>
                    </div>

                    {!selectedObject ? (
                      <p className="text-[10px] text-neutral-400 font-bold leading-normal">
                        Select a drawing on the canvas first to warp it using the Curve Path Tool!
                      </p>
                    ) : (
                      <div className="space-y-4 text-xs">
                        <p className="text-[10px] text-neutral-400 leading-normal font-bold">
                          The Curve Path Tool lets you smoothly blend, stretch, bend, or rotate your drawings by dragging the cyan (horizontal) and yellow (vertical) control lines.
                        </p>

                        {/* Controls for horizontal points */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span className="font-bold uppercase tracking-wider">Horizontal Spine Points</span>
                            <span className="text-cyan-400 font-bold font-mono">
                              {selectedObject.curvePathState?.hPointsCount || 10}
                            </span>
                          </div>
                          <input
                            type="range"
                            min="3"
                            max="20"
                            value={selectedObject.curvePathState?.hPointsCount || 10}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              // Re-initialize with new horizontal points count
                              const hControlPoints: Point[] = [];
                              const hControlPoints0: Point[] = [];
                              
                              // Helper to calculate bounds locally
                              let pts = [...(selectedObject.points || [])];
                              if (selectedObject.subPaths && selectedObject.subPaths.length > 0) {
                                selectedObject.subPaths.forEach((sub: any) => {
                                  pts = pts.concat(sub);
                                });
                              }
                              if (pts.length > 0) {
                                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                                pts.forEach(p => {
                                  if (p.x < minX) minX = p.x;
                                  if (p.x > maxX) maxX = p.x;
                                  if (p.y < minY) minY = p.y;
                                  if (p.y > maxY) maxY = p.y;
                                });
                                const bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
                                const yMid = bounds.y + bounds.height * 0.5;
                                for (let i = 0; i < val; i++) {
                                  const x = bounds.x + (bounds.width > 0 ? (i / (val - 1)) * bounds.width : 0);
                                  const pt = { x, y: yMid };
                                  hControlPoints.push({ ...pt });
                                  hControlPoints0.push({ ...pt });
                                }
                              }
                              
                              updateObject(selectedObject.id, {
                                curvePathState: {
                                  active: true,
                                  hPointsCount: val,
                                  vPointsCount: selectedObject.curvePathState?.vPointsCount || 10,
                                  hControlPoints,
                                  hControlPoints0,
                                  vControlPoints: selectedObject.curvePathState?.vControlPoints || [],
                                  vControlPoints0: selectedObject.curvePathState?.vControlPoints0 || []
                                }
                              });
                            }}
                            className="w-full accent-cyan-500 bg-neutral-900 rounded-lg appearance-none h-1.5 cursor-pointer"
                          />
                        </div>

                        {/* Controls for vertical points */}
                        <div className="space-y-1 border-t border-neutral-800/40 pt-2.5">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span className="font-bold uppercase tracking-wider">Vertical Spine Points</span>
                            <span className="text-amber-400 font-bold font-mono">
                              {selectedObject.curvePathState?.vPointsCount || 10}
                            </span>
                          </div>
                          <input
                            type="range"
                            min="3"
                            max="20"
                            value={selectedObject.curvePathState?.vPointsCount || 10}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              // Re-initialize with new vertical points count
                              const vControlPoints: Point[] = [];
                              const vControlPoints0: Point[] = [];
                              
                              // Helper to calculate bounds locally
                              let pts = [...(selectedObject.points || [])];
                              if (selectedObject.subPaths && selectedObject.subPaths.length > 0) {
                                selectedObject.subPaths.forEach((sub: any) => {
                                  pts = pts.concat(sub);
                                });
                              }
                              if (pts.length > 0) {
                                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                                pts.forEach(p => {
                                  if (p.x < minX) minX = p.x;
                                  if (p.x > maxX) maxX = p.x;
                                  if (p.y < minY) minY = p.y;
                                  if (p.y > maxY) maxY = p.y;
                                });
                                const bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
                                const xMid = bounds.x + bounds.width * 0.5;
                                for (let j = 0; j < val; j++) {
                                  const y = bounds.y + (bounds.height > 0 ? (j / (val - 1)) * bounds.height : 0);
                                  const pt = { x: xMid, y };
                                  vControlPoints.push({ ...pt });
                                  vControlPoints0.push({ ...pt });
                                }
                              }
                              
                              updateObject(selectedObject.id, {
                                curvePathState: {
                                  active: true,
                                  hPointsCount: selectedObject.curvePathState?.hPointsCount || 10,
                                  vPointsCount: val,
                                  hControlPoints: selectedObject.curvePathState?.hControlPoints || [],
                                  hControlPoints0: selectedObject.curvePathState?.hControlPoints0 || [],
                                  vControlPoints,
                                  vControlPoints0
                                }
                              });
                            }}
                            className="w-full accent-amber-500 bg-neutral-900 rounded-lg appearance-none h-1.5 cursor-pointer"
                          />
                        </div>

                        {/* Action buttons */}
                        <div className="space-y-2 border-t border-neutral-800/40 pt-2.5">
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => {
                                // Reset control points to their straight/undeformed state
                                if (selectedObject.curvePathState) {
                                  const hCount = selectedObject.curvePathState.hPointsCount;
                                  const vCount = selectedObject.curvePathState.vPointsCount;
                                  
                                  let pts = [...(selectedObject.points || [])];
                                  if (selectedObject.subPaths && selectedObject.subPaths.length > 0) {
                                    selectedObject.subPaths.forEach((sub: any) => {
                                      pts = pts.concat(sub);
                                    });
                                  }
                                  if (pts.length > 0) {
                                    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                                    pts.forEach(p => {
                                      if (p.x < minX) minX = p.x;
                                      if (p.x > maxX) maxX = p.x;
                                      if (p.y < minY) minY = p.y;
                                      if (p.y > maxY) maxY = p.y;
                                    });
                                    const bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
                                    
                                    const yMid = bounds.y + bounds.height * 0.5;
                                    const hControlPoints: Point[] = [];
                                    const hControlPoints0: Point[] = [];
                                    for (let i = 0; i < hCount; i++) {
                                      const x = bounds.x + (bounds.width > 0 ? (i / (hCount - 1)) * bounds.width : 0);
                                      const pt = { x, y: yMid };
                                      hControlPoints.push({ ...pt });
                                      hControlPoints0.push({ ...pt });
                                    }

                                    const xMid = bounds.x + bounds.width * 0.5;
                                    const vControlPoints: Point[] = [];
                                    const vControlPoints0: Point[] = [];
                                    for (let j = 0; j < vCount; j++) {
                                      const y = bounds.y + (bounds.height > 0 ? (j / (vCount - 1)) * bounds.height : 0);
                                      const pt = { x: xMid, y };
                                      vControlPoints.push({ ...pt });
                                      vControlPoints0.push({ ...pt });
                                    }

                                    updateObject(selectedObject.id, {
                                      curvePathState: {
                                        active: true,
                                        hPointsCount: hCount,
                                        vPointsCount: vCount,
                                        hControlPoints,
                                        hControlPoints0,
                                        vControlPoints,
                                        vControlPoints0
                                      }
                                    });
                                  }
                                }
                              }}
                              className="py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white text-[10px] font-black rounded-lg border border-neutral-800 transition-all uppercase tracking-wider"
                            >
                              Reset Curve
                            </button>
                            <button
                              onClick={() => {
                                if (selectedObject.curvePathState) {
                                  updateObject(selectedObject.id, {
                                    curvePathState: {
                                      ...selectedObject.curvePathState,
                                      active: false
                                    }
                                  });
                                }
                              }}
                              className="py-1.5 bg-neutral-900 hover:bg-rose-950 text-neutral-400 hover:text-rose-300 text-[10px] font-black rounded-lg border border-neutral-800 hover:border-rose-900 transition-all uppercase tracking-wider"
                            >
                              Disable Warp
                            </button>
                          </div>

                          <button
                            onClick={() => setActiveTool('SEL')}
                            className="w-full py-1.5 bg-cyan-500 text-neutral-950 hover:bg-cyan-400 text-[10px] font-black rounded-lg transition-all uppercase tracking-wider text-center block mt-2"
                          >
                            ✓ Complete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* FLEXIBLE CURVE LINE DEFORMER PANEL */}
                {activeTool === 'CRV' && (
                  <div className="space-y-4 bg-emerald-500/5 p-4 rounded-2xl border border-emerald-400/20 shadow-lg shadow-black/20 animate-fade-in">
                    <div className="flex items-center justify-between border-b border-emerald-500/10 pb-2.5">
                      <span className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-emerald-500" />
                        CURVE LINE DEFORMER
                      </span>
                    </div>

                    {!selectedObject ? (
                      <p className="text-[10px] text-neutral-400 font-bold leading-normal">
                        Select a drawing on the canvas first to attach a flexible curve line to bend parts like a dog's tail, limb, or arm!
                      </p>
                    ) : (
                      <div className="space-y-4 text-xs">
                        <p className="text-[10px] text-neutral-300 leading-normal font-medium">
                          Overlay a flexible curve line on any drawing region. Position it over a tail or limb, click <strong className="text-emerald-400">Done</strong> to link it, then bend the line handles to flex that part flawlessly without stretching!
                        </p>

                        {/* Attach / Detach Action Button */}
                        <div className="pt-1">
                          {!selectedObject.flexCurveState?.isAttached ? (
                            <button
                              type="button"
                              id="rightpanel-crv-attach-btn"
                              onClick={() => {
                                if (!selectedObject) return;
                                const fcs = selectedObject.flexCurveState;
                                if (!fcs || !fcs.points) return;
                                const attachedPts = fcs.points.map(pt => ({
                                  ...pt,
                                  origX: pt.x,
                                  origY: pt.y
                                }));
                                updateObject(selectedObject.id, {
                                  flexCurveState: {
                                    ...fcs,
                                    isAttached: true,
                                    points: attachedPts
                                  }
                                });
                              }}
                              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/20 cursor-pointer flex items-center justify-center gap-2"
                            >
                              <Sparkles className="w-4 h-4" />
                              Done / Attach Curve to Drawing
                            </button>
                          ) : (
                            <div className="space-y-2">
                              <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-[10.5px] font-bold text-emerald-300 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                                Curve Line Attached & Linked to Drawing!
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  id="rightpanel-crv-detach-btn"
                                  onClick={() => {
                                    if (!selectedObject) return;
                                    const fcs = selectedObject.flexCurveState;
                                    if (!fcs) return;
                                    updateObject(selectedObject.id, {
                                      flexCurveState: {
                                        ...fcs,
                                        isAttached: false
                                      }
                                    });
                                  }}
                                  className="py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold rounded-xl text-[10px] uppercase tracking-wider transition-all cursor-pointer"
                                >
                                  🔓 Detach Line
                                </button>

                                <button
                                  type="button"
                                  id="rightpanel-crv-reset-btn"
                                  onClick={() => {
                                    if (!selectedObject) return;
                                    const fcs = selectedObject.flexCurveState;
                                    if (!fcs || !fcs.points) return;
                                    const resetPts = fcs.points.map(pt => ({
                                      ...pt,
                                      x: pt.origX,
                                      y: pt.origY
                                    }));
                                    updateObject(selectedObject.id, {
                                      flexCurveState: {
                                        ...fcs,
                                        points: resetPts
                                      }
                                    });
                                  }}
                                  className="py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold rounded-xl text-[10px] uppercase tracking-wider transition-all cursor-pointer border border-amber-500/30"
                                >
                                  🔄 Reset Bend
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Influence Radius Slider */}
                        <div className="space-y-1 border-t border-neutral-800/60 pt-3">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span className="font-bold uppercase tracking-wider">Bend Influence Radius</span>
                            <span className="text-emerald-400 font-bold font-mono">
                              {selectedObject.flexCurveState?.influenceRadius || 120}px
                            </span>
                          </div>
                          <input
                            type="range"
                            min="30"
                            max="350"
                            value={selectedObject.flexCurveState?.influenceRadius || 120}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              const fcs = selectedObject.flexCurveState;
                              if (fcs) {
                                updateObject(selectedObject.id, {
                                  flexCurveState: {
                                    ...fcs,
                                    influenceRadius: val
                                  }
                                });
                              }
                            }}
                            className="w-full accent-emerald-500 bg-neutral-900 rounded-lg appearance-none h-1.5 cursor-pointer"
                          />
                          <p className="text-[8.5px] text-neutral-500 italic">
                            Controls how far around the curve line drawing vertices bend (smaller for tail/fingers, larger for entire limb/body).
                          </p>
                        </div>

                        <button
                          onClick={() => setActiveTool('SEL')}
                          className="w-full py-2 bg-emerald-500 text-neutral-950 hover:bg-emerald-400 text-[10px] font-black rounded-xl transition-all uppercase tracking-wider text-center block mt-3"
                        >
                          ✓ Complete & Return to Select
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* VECTOR CURVE, PBM AND RIGID POINT DEFORMER PANEL */}
                {(activeTool === "PBM" || activeTool === "VDF" || activeTool === "VPR" || activeTool === "RPD") && (
                  <div className="space-y-4 bg-blue-500/5 p-4 rounded-2xl border border-blue-400/20 shadow-lg shadow-black/20 animate-fade-in">
                    <div className="flex items-center justify-between border-b border-blue-500/10 pb-2.5">
                      <span className="text-xs font-black uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                        <GitCommit className="w-4 h-4 text-blue-500" />
                        {activeTool === "PBM" ? "POINTS-BASED MOVEMENT (PBM)" : activeTool === "RPD" ? "RIGID POINT DEFORM (RPD)" : activeTool === "VPR" ? "VECTOR PEN RESHAPE (VPR)" : "VECTOR CURVE DEFORMER"}
                      </span>
                    </div>

                    {!selectedObject ? (
                      <p className="text-[10px] text-neutral-400 font-bold leading-normal">
                        Select a drawing on canvas to place custom points!
                      </p>
                    ) : (
                      <div className="space-y-3 text-xs">
                        <p className="text-[10px] text-neutral-300 leading-normal font-medium">
                          Click anywhere on drawing to place <b>Blue Points</b>. When 2 or more points are placed, drag points to move drawing sections strictly as-is without stroke distortion or overlap.
                        </p>

                        {(() => {
                          const vdfState = selectedObject.customVectorDeformState || {
                            active: true,
                            isDrawingPhase: true,
                            nodes: [],
                            stiffness: 50,
                            captureRadius: 50,
                            rigidLinear: activeTool === "PBM" || activeTool === "RPD"
                          };

                          const nodeCount = vdfState.nodes ? vdfState.nodes.length : 0;
                          const isRigid = activeTool === "PBM" || activeTool === "RPD" || vdfState.rigidLinear;

                          return (
                            <div className="space-y-3">
                              {/* 2-Point Requirement Status Banner */}
                              {nodeCount < 2 ? (
                                <div className="bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-xl text-[10px] text-amber-300 font-bold text-center space-y-1">
                                  <span className="text-amber-400 font-black block uppercase tracking-wider flex items-center justify-center gap-1">
                                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                                    Add 2 or More Points to Rigid Deform
                                  </span>
                                  <p className="text-[9px] text-neutral-300 font-medium leading-normal">
                                    Click on drawing (e.g. shoulder start point &amp; hand end point). Minimum 2 points are strictly required!
                                  </p>
                                </div>
                              ) : (
                                <div className="bg-emerald-500/10 border border-emerald-500/30 p-2.5 rounded-xl text-[10px] text-emerald-300 font-bold text-center space-y-1">
                                  <span className="text-emerald-400 font-black block uppercase tracking-wider flex items-center justify-center gap-1">
                                    ✅ {nodeCount} Joint Points Active
                                  </span>
                                  <p className="text-[9px] text-neutral-300 font-medium leading-normal">
                                    Drag points to move drawing as-is. Stroke shapes, widths &amp; details are strictly preserved without overlap or distortion!
                                  </p>
                                </div>
                              )}

                              {/* Capture Area Radius Slider */}
                              <div className="space-y-1.5 bg-neutral-900/80 p-2.5 rounded-xl border border-neutral-800">
                                <div className="flex justify-between items-center text-[10px]">
                                  <span className="text-neutral-300 font-bold uppercase tracking-wider flex items-center gap-1">
                                    🎯 Point Area Capture Radius
                                  </span>
                                  <span className="font-mono text-yellow-400 font-black">
                                    {vdfState.captureRadius || vdfState.stiffness || 50}px
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min="10"
                                  max="300"
                                  step="5"
                                  value={vdfState.captureRadius || vdfState.stiffness || 50}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    updateObject(selectedObject.id, {
                                      customVectorDeformState: {
                                        ...vdfState,
                                        captureRadius: val,
                                        stiffness: val,
                                        extrudePointMode: vdfState.extrudePointMode ?? false
                                      }
                                    });
                                  }}
                                  className="w-full accent-yellow-400 cursor-pointer h-1.5 bg-neutral-800 rounded-lg"
                                />
                              </div>

                              {/* Extrude Point Toggle */}
                              <div className="flex items-center justify-between bg-neutral-900/80 p-2.5 rounded-xl border border-neutral-800">
                                <div className="flex flex-col pr-2">
                                  <span className="text-[10px] text-yellow-400 font-bold uppercase tracking-wider flex items-center gap-1">
                                    🌱 Extrude Point Mode
                                  </span>
                                  <span className="text-[8.5px] text-neutral-400">
                                    Click/drag from point to spawn connected joint points (vector chain)
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateObject(selectedObject.id, {
                                      customVectorDeformState: {
                                        ...vdfState,
                                        extrudePointMode: !vdfState.extrudePointMode
                                      }
                                    });
                                  }}
                                  className={`px-3 py-1 rounded-lg text-[9.5px] font-black uppercase transition-all cursor-pointer ${
                                    vdfState.extrudePointMode
                                      ? "bg-emerald-500 text-neutral-950 shadow-md shadow-emerald-500/20"
                                      : "bg-neutral-800 text-neutral-400 hover:text-white"
                                  }`}
                                >
                                  {vdfState.extrudePointMode ? "ON" : "OFF"}
                                </button>
                              </div>

                              {/* Node Selector Quick Switcher */}
                              {nodeCount > 0 && (
                                <div className="space-y-1.5 bg-neutral-900/90 p-2.5 rounded-xl border border-blue-500/30 shadow-inner">
                                  <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-yellow-400 font-black uppercase tracking-wider flex items-center gap-1">
                                      ⭐ Active Point: #{ (vdfState.selectedNodeIndex ?? 0) + 1 } (Yellow)
                                    </span>
                                    <span className="text-blue-400 font-mono text-[9px] font-bold">
                                      {nodeCount} Blue Points
                                    </span>
                                  </div>

                                  <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto pr-1 pt-1">
                                    {vdfState.nodes.map((n, idx) => {
                                      const isSelected = (vdfState.selectedNodeIndex ?? 0) === idx;
                                      return (
                                        <button
                                          key={n.id || idx}
                                          type="button"
                                          onClick={() => {
                                            updateObject(selectedObject.id, {
                                              customVectorDeformState: {
                                                ...vdfState,
                                                selectedNodeIndex: idx
                                              }
                                            });
                                          }}
                                          className={`px-2.5 py-1 rounded-lg text-[9.5px] font-bold transition-all cursor-pointer ${
                                            isSelected
                                              ? "bg-yellow-400 text-neutral-950 font-black shadow-md shadow-yellow-500/30 scale-105"
                                              : "bg-blue-600/30 border border-blue-400/40 text-blue-300 hover:bg-blue-600 hover:text-white"
                                          }`}
                                        >
                                          {isSelected ? `⭐ Pt #${idx + 1}` : `Pt #${idx + 1}`}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Action Buttons */}
                              <div className="space-y-1.5">
                                <button
                                  type="button"
                                  id="rightpanel-vdf-autonodes-btn"
                                  onClick={() => {
                                    const contourPts = selectedObject.points && selectedObject.points.length >= 3 
                                      ? selectedObject.points 
                                      : (selectedObject.originalPointsBackup || []);
                                    if (!contourPts || contourPts.length === 0) return;

                                    const targetCount = Math.min(10, Math.max(4, Math.floor(contourPts.length / 4)));
                                    const step = contourPts.length / targetCount;
                                    const autoNodes: CustomVectorDeformNode[] = [];
                                    for (let i = 0; i < targetCount; i++) {
                                      const idx = Math.floor(i * step);
                                      const pt = contourPts[idx];
                                      if (pt) {
                                        autoNodes.push({
                                          id: `vdf_autonode_${Date.now()}_${i}`,
                                          x: pt.x,
                                          y: pt.y,
                                          origX: pt.x,
                                          origY: pt.y
                                        });
                                      }
                                    }

                                    updateObject(selectedObject.id, {
                                      customVectorDeformState: {
                                        ...vdfState,
                                        active: true,
                                        nodes: autoNodes,
                                        selectedNodeIndex: 0,
                                        rigidLinear: true
                                      }
                                    });
                                  }}
                                  className="w-full py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold rounded-xl text-[10px] uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                  Auto-Detect Joint Skeleton
                                </button>

                                {nodeCount > 0 && (
                                  <button
                                    type="button"
                                    id="rightpanel-vdf-clear-btn"
                                    onClick={() => {
                                      const origPts = vdfState.origObjectPoints || selectedObject.points;
                                      const origSubs = selectedObject.originalSubPathsBackup || selectedObject.subPaths;
                                      updateObject(selectedObject.id, {
                                        ...(origPts ? { points: origPts } : {}),
                                        ...(origSubs ? { subPaths: origSubs } : {}),
                                        customVectorDeformState: {
                                          ...vdfState,
                                          nodes: [],
                                          isDrawingPhase: true
                                        }
                                      });
                                    }}
                                    className="w-full py-1.5 bg-neutral-800 hover:bg-red-500/20 text-neutral-300 hover:text-red-300 font-bold rounded-xl text-[10px] uppercase tracking-wider transition-all cursor-pointer"
                                  >
                                    Clear Placed Points &amp; Reset
                                  </button>
                                )}
                              </div>

                              <button
                                type="button"
                                id="rightpanel-vdf-reset-btn"
                                onClick={() => {
                                  const resetNodes = vdfState.nodes.map(n => ({ ...n, x: n.origX, y: n.origY }));
                                  const restoredPts = vdfState.origObjectPoints ? JSON.parse(JSON.stringify(vdfState.origObjectPoints)) : selectedObject.points;
                                  const restoredSubs = selectedObject.originalSubPathsBackup ? JSON.parse(JSON.stringify(selectedObject.originalSubPathsBackup)) : selectedObject.subPaths;
                                  updateObject(selectedObject.id, {
                                    points: restoredPts,
                                    subPaths: restoredSubs,
                                    customVectorDeformState: {
                                      ...vdfState,
                                      nodes: resetNodes
                                    }
                                  });
                                }}
                                className="w-full py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold rounded-xl text-[10px] uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Reset Original Position
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
                

                {/* ADVANCED STYLING EFFECTS */}
                <div className="space-y-4 bg-neutral-950/40 p-4 rounded-2xl border border-neutral-800/50">
                  <div className="text-[10px] text-amber-400 font-black uppercase tracking-wider block border-b border-neutral-800/40 pb-2 flex items-center gap-1.5 font-bold">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    ADVANCED EFFECTS PIPELINE
                  </div>

                  {/* 1. DROP SHADOW */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-300">1. Drop Shadow</span>
                      <button
                        onClick={() => handleStyleChange('shadow', { enabled: !(selectedObject.shadow?.enabled ?? false) })}
                        className={`text-[9px] font-black px-2 py-0.5 rounded-lg border transition-all ${
                          selectedObject.shadow?.enabled 
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' 
                            : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                        }`}
                      >
                        {selectedObject.shadow?.enabled ? 'ACTIVE' : 'INACTIVE'}
                      </button>
                    </div>

                    {(selectedObject.shadow?.enabled ?? false) && (
                      <div className="bg-neutral-950/50 p-3 rounded-xl border border-neutral-900 space-y-3 text-[10px]">
                        {/* Blur */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Blur Size</span>
                            <span className="text-amber-400 font-bold">{selectedObject.shadow?.blur ?? 15}px</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="80"
                            value={selectedObject.shadow?.blur ?? 15}
                            onChange={(e) => handleStyleChange('shadow', { blur: parseInt(e.target.value) })}
                            className="w-full h-1 accent-amber-500 bg-neutral-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Offset X */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Offset X</span>
                            <span className="text-amber-400 font-bold">{selectedObject.shadow?.offsetX ?? 0}px</span>
                          </div>
                          <input
                            type="range"
                            min="-50"
                            max="50"
                            value={selectedObject.shadow?.offsetX ?? 0}
                            onChange={(e) => handleStyleChange('shadow', { offsetX: parseInt(e.target.value) })}
                            className="w-full h-1 accent-amber-500 bg-neutral-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Offset Y */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Offset Y</span>
                            <span className="text-amber-400 font-bold">{selectedObject.shadow?.offsetY ?? 10}px</span>
                          </div>
                          <input
                            type="range"
                            min="-50"
                            max="50"
                            value={selectedObject.shadow?.offsetY ?? 10}
                            onChange={(e) => handleStyleChange('shadow', { offsetY: parseInt(e.target.value) })}
                            className="w-full h-1 accent-amber-500 bg-neutral-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Opacity */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Opacity</span>
                            <span className="text-amber-400 font-bold">{Math.round((selectedObject.shadow?.opacity ?? 0.3) * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={selectedObject.shadow?.opacity ?? 0.3}
                            onChange={(e) => handleStyleChange('shadow', { opacity: parseFloat(e.target.value) })}
                            className="w-full h-1 accent-amber-500 bg-neutral-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Color */}
                        <div className="flex items-center justify-between gap-3 pt-1 border-t border-neutral-900">
                          <span className="text-neutral-500">Shadow Color</span>
                          <CustomColorPicker
                            color={selectedObject.shadow?.color ?? '#000000'}
                            onChange={(c) => handleStyleChange('shadow', { color: c })}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 2. INNER SHADOW */}
                  <div className="space-y-2.5 pt-2 border-t border-neutral-800/40">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-300">2. Inner Shadow</span>
                      <button
                        onClick={() => handleStyleChange('innerShadow', { enabled: !(selectedObject.innerShadow?.enabled ?? false) })}
                        className={`text-[9px] font-black px-2 py-0.5 rounded-lg border transition-all ${
                          selectedObject.innerShadow?.enabled 
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' 
                            : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                        }`}
                      >
                        {selectedObject.innerShadow?.enabled ? 'ACTIVE' : 'INACTIVE'}
                      </button>
                    </div>

                    {(selectedObject.innerShadow?.enabled ?? false) && (
                      <div className="bg-neutral-950/50 p-3 rounded-xl border border-neutral-900 space-y-3 text-[10px]">
                        {/* Size/Blur */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Blur Size</span>
                            <span className="text-amber-400 font-bold">{selectedObject.innerShadow?.size ?? 15}px</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="80"
                            value={selectedObject.innerShadow?.size ?? 15}
                            onChange={(e) => handleStyleChange('innerShadow', { size: parseInt(e.target.value) })}
                            className="w-full h-1 accent-amber-500 bg-neutral-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Angle */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Lighting Angle</span>
                            <span className="text-amber-400 font-bold">{selectedObject.innerShadow?.angle ?? 120}°</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="360"
                            value={selectedObject.innerShadow?.angle ?? 120}
                            onChange={(e) => handleStyleChange('innerShadow', { angle: parseInt(e.target.value) })}
                            className="w-full h-1 accent-amber-500 bg-neutral-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Distance */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Offset Distance</span>
                            <span className="text-amber-400 font-bold">{selectedObject.innerShadow?.distance ?? 10}px</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="60"
                            value={selectedObject.innerShadow?.distance ?? 10}
                            onChange={(e) => handleStyleChange('innerShadow', { distance: parseInt(e.target.value) })}
                            className="w-full h-1 accent-amber-500 bg-neutral-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Opacity */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Opacity</span>
                            <span className="text-amber-400 font-bold">{Math.round((selectedObject.innerShadow?.opacity ?? 0.5) * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={selectedObject.innerShadow?.opacity ?? 0.5}
                            onChange={(e) => handleStyleChange('innerShadow', { opacity: parseFloat(e.target.value) })}
                            className="w-full h-1 accent-amber-500 bg-neutral-800 rounded-lg cursor-pointer"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 3. COLOR OVERLAY */}
                  <div className="space-y-2.5 pt-2 border-t border-neutral-800/40">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-300">3. Color Overlay</span>
                      <button
                        onClick={() => handleStyleChange('overlay', { enabled: !(selectedObject.overlay?.enabled ?? false) })}
                        className={`text-[9px] font-black px-2 py-0.5 rounded-lg border transition-all ${
                          selectedObject.overlay?.enabled 
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' 
                            : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                        }`}
                      >
                        {selectedObject.overlay?.enabled ? 'ACTIVE' : 'INACTIVE'}
                      </button>
                    </div>

                    {(selectedObject.overlay?.enabled ?? false) && (
                      <div className="bg-neutral-950/50 p-3 rounded-xl border border-neutral-900 space-y-3 text-[10px]">
                        {/* Blend Mode */}
                        <div className="space-y-1.5">
                          <span className="text-neutral-500">Blend Mode</span>
                          <CustomSelect
                            value={selectedObject.overlay?.blendMode ?? 'normal'}
                            onChange={(val) => handleStyleChange('overlay', { blendMode: val })}
                            options={[
                              { value: "normal", label: "Normal (Tint)" },
                              { value: "multiply", label: "Multiply (Darken)" },
                              { value: "screen", label: "Screen (Lighten)" },
                              { value: "overlay", label: "Overlay (Contrast)" }
                            ]}
                            placeholder="Select Blend Mode"
                            className="w-full"
                          />
                        </div>

                        {/* Opacity */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Tint Intensity</span>
                            <span className="text-amber-400 font-bold">{Math.round((selectedObject.overlay?.opacity ?? 0.5) * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={selectedObject.overlay?.opacity ?? 0.5}
                            onChange={(e) => handleStyleChange('overlay', { opacity: parseFloat(e.target.value) })}
                            className="w-full h-1 accent-amber-500 bg-neutral-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Color */}
                        <div className="flex items-center justify-between gap-3 pt-1 border-t border-neutral-900">
                          <span className="text-neutral-500">Tint Color</span>
                          <CustomColorPicker
                            color={selectedObject.overlay?.color ?? '#ff0055'}
                            onChange={(c) => handleStyleChange('overlay', { color: c })}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 4. RIM LIGHT */}
                  <div className="space-y-2.5 pt-2 border-t border-neutral-800/40">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-300">4. Rim Light</span>
                      <button
                        onClick={() => handleStyleChange('rimLight', { enabled: !(selectedObject.rimLight?.enabled ?? false) })}
                        className={`text-[9px] font-black px-2 py-0.5 rounded-lg border transition-all ${
                          selectedObject.rimLight?.enabled 
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' 
                            : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                        }`}
                      >
                        {selectedObject.rimLight?.enabled ? 'ACTIVE' : 'INACTIVE'}
                      </button>
                    </div>

                    {(selectedObject.rimLight?.enabled ?? false) && (
                      <div className="bg-neutral-950/50 p-3 rounded-xl border border-neutral-900 space-y-3 text-[10px]">
                        {/* Thickness */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Thickness</span>
                            <span className="text-amber-400 font-bold">{selectedObject.rimLight?.thickness ?? 4}px</span>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="20"
                            value={selectedObject.rimLight?.thickness ?? 4}
                            onChange={(e) => handleStyleChange('rimLight', { thickness: parseInt(e.target.value) })}
                            className="w-full h-1 accent-amber-500 bg-neutral-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Softness */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Glow Softness</span>
                            <span className="text-amber-400 font-bold">{selectedObject.rimLight?.softness ?? 10}px</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="30"
                            value={selectedObject.rimLight?.softness ?? 10}
                            onChange={(e) => handleStyleChange('rimLight', { softness: parseInt(e.target.value) })}
                            className="w-full h-1 accent-amber-500 bg-neutral-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Color */}
                        <div className="flex items-center justify-between gap-3 pt-1 border-t border-neutral-900">
                          <span className="text-neutral-500">Light Color</span>
                          <CustomColorPicker
                            color={selectedObject.rimLight?.color ?? '#ffffff'}
                            onChange={(c) => handleStyleChange('rimLight', { color: c })}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Object Metadata & Style */}
                <div className="space-y-3 bg-neutral-950/40 p-3.5 rounded-2xl border border-neutral-800/50">
                  <div className="flex items-center justify-between border-b border-neutral-800/40 pb-2">
                    <div className="text-[10px] text-amber-400 font-black uppercase tracking-wider font-black">
                      Style & Metadata
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        deleteObject(selectedObject.id);
                        setSelectedObjectId(null);
                      }}
                      className="flex items-center gap-1.5 px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white transition-all text-[10px] font-black cursor-pointer"
                      title="Delete selected drawing completely"
                    >
                      <Trash2 className="w-3 h-3" />
                      DELETE
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <span className="text-xs text-neutral-400">Object Name</span>
                    <input
                      type="text"
                      value={selectedObject.name}
                      onChange={(e) => updateObject(selectedObject.id, { name: e.target.value })}
                      className="bg-neutral-950 border border-neutral-800 text-xs px-2.5 py-1.5 rounded-xl text-white font-bold w-40 outline-none focus:border-amber-500"
                    />
                  </div>

                  {/* 360° MASTER SLIDER CONTROLLER */}
                  {selectedObject.type === '360_container' && (
                    <div className="space-y-4 bg-amber-500/5 p-4 rounded-2xl border border-amber-400/20 shadow-lg shadow-black/20 mt-3 animate-fade-in">
                      <div className="flex items-center justify-between border-b border-amber-500/10 pb-2.5">
                        <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                          <RotateCw className="w-4 h-4 text-amber-400 animate-spin-slow" />
                          360° Pseudo-3D Rotation
                        </span>
                        <span className="text-[9px] text-amber-500 font-extrabold bg-amber-500/10 px-1.5 py-0.5 rounded uppercase">
                          360 Master
                        </span>
                      </div>

                      <p className="text-[10px] text-neutral-400 leading-normal font-medium">
                        Drag the master slider to smoothly rotate the pseudo-3D object in 360 degrees. The engine instantly resolves to the closest camera angle.
                      </p>

                      {/* Rotation Slider */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-neutral-400">
                          <span>360° Camera Yaw</span>
                          <span className="text-amber-400 font-bold font-mono">{(selectedObject.currentAngle360 ?? 0)}°</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="359"
                          value={selectedObject.currentAngle360 ?? 0}
                          disabled={selectedObject.lockAngle360}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            updateObject(selectedObject.id, {
                              currentAngle360: val
                            });
                          }}
                          className={`w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer ${selectedObject.lockAngle360 ? 'opacity-50 cursor-not-allowed' : ''}`}
                        />
                      </div>

                      {/* Lock & Preview Controls */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            updateObject(selectedObject.id, {
                              lockAngle360: !selectedObject.lockAngle360
                            });
                          }}
                          className={`flex-1 text-[10px] py-1.5 rounded-lg border font-bold flex items-center justify-center gap-1 transition-all ${
                            selectedObject.lockAngle360 
                              ? 'bg-red-500/10 border-red-500/35 text-red-400' 
                              : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:text-white'
                          }`}
                        >
                          {selectedObject.lockAngle360 ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                          {selectedObject.lockAngle360 ? 'Unlock Angle' : 'Lock Angle'}
                        </button>
                        
                        <button
                          onClick={() => {
                            // Toggle spin preview
                            if ((window as any)._spin_timer) {
                              clearInterval((window as any)._spin_timer);
                              (window as any)._spin_timer = null;
                              // Force update
                              updateObject(selectedObject.id, { _isSpinning: false } as any);
                            } else {
                              const timer = setInterval(() => {
                                const currentObj = objects[selectedObject.id];
                                if (currentObj) {
                                  const nextAngle = ((currentObj.currentAngle360 ?? 0) + 3) % 360;
                                  updateObject(selectedObject.id, { currentAngle360: nextAngle });
                                }
                              }, 30);
                              (window as any)._spin_timer = timer;
                              updateObject(selectedObject.id, { _isSpinning: true } as any);
                            }
                          }}
                          className={`flex-1 text-[10px] py-1.5 rounded-lg border font-bold flex items-center justify-center gap-1 transition-all ${
                            (selectedObject as any)._isSpinning
                              ? 'bg-amber-500 text-black border-amber-500 font-extrabold'
                              : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:text-white'
                          }`}
                        >
                          <Play className="w-3.5 h-3.5" />
                          {(selectedObject as any)._isSpinning ? 'Stop Tour' : 'Preview Tour'}
                        </button>
                      </div>

                      {/* Views Management */}
                      <div className="border-t border-neutral-800/40 pt-3 space-y-3">
                        <span className="text-[10px] text-neutral-400 block font-black uppercase tracking-wider">Angle View Registry</span>
                        
                        {/* List of registered views */}
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {(selectedObject.views360 || []).map((view, idx) => {
                            const isCurrent = findClosestView360(selectedObject.views360, selectedObject.currentAngle360 ?? 0)?.id === view.id;
                            return (
                              <div 
                                key={view.id} 
                                onClick={() => {
                                  updateObject(selectedObject.id, { currentAngle360: view.angle });
                                }}
                                className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer border transition-all ${
                                  isCurrent 
                                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' 
                                    : 'bg-neutral-950 border-neutral-900 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <div className={`w-1.5 h-1.5 rounded-full ${isCurrent ? 'bg-amber-400 animate-pulse' : 'bg-neutral-700'}`} />
                                  <span className="font-bold">{view.name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono bg-neutral-900 px-1.5 py-0.5 rounded text-neutral-400">
                                    {view.angle}°
                                  </span>
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const nextAngle = await window.customPrompt(`Enter new angle for "${view.name}" (0-359):`, view.angle.toString(), "Edit View Angle");
                                      if (nextAngle !== null) {
                                        const parsed = parseInt(nextAngle);
                                        if (!isNaN(parsed)) {
                                          const updatedViews = (selectedObject.views360 || []).map(v => 
                                            v.id === view.id ? { ...v, angle: parsed % 360 } : v
                                          );
                                          updateObject(selectedObject.id, { views360: updatedViews });
                                        }
                                      }
                                    }}
                                    className="p-1 text-neutral-500 hover:text-white rounded-md hover:bg-neutral-800 transition-colors"
                                    title="Edit Angle"
                                  >
                                    <Settings className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const confirmed = await window.customConfirm(`Are you sure you want to remove view "${view.name}"?`, "Remove View");
                                      if (confirmed) {
                                        const updatedViews = (selectedObject.views360 || []).filter(v => v.id !== view.id);
                                        updateObject(selectedObject.id, { views360: updatedViews });
                                        // Unhide drawing so the user doesn't lose it
                                        updateObject(view.drawingId, { isHidden: false });
                                      }
                                    }}
                                    className="p-1 text-red-500 hover:text-red-400 rounded-md hover:bg-red-500/10 transition-colors"
                                    title="Delete View"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Add View Form */}
                        <div className="bg-neutral-950 p-2.5 rounded-xl border border-neutral-900 space-y-2">
                          <span className="text-[9px] font-black uppercase text-neutral-500 block">Link Drawing as View</span>
                          <div className="flex gap-2">
                            <CustomSelect
                              value={link360DrawingId}
                              onChange={(val) => setLink360DrawingId(val)}
                              options={Object.values(objects)
                                .filter(obj => obj.id !== selectedObject.id && obj.type !== '360_container')
                                .map(obj => ({ value: obj.id, label: obj.name }))
                              }
                              placeholder="Select Drawing..."
                              className="flex-1"
                            />
                            <input
                              value={link360Angle}
                              onChange={(e) => setLink360Angle(e.target.value)}
                              type="number"
                              placeholder="Angle"
                              min="0"
                              max="359"
                              className="bg-neutral-900 border border-neutral-800 rounded-lg text-xs p-1.5 text-neutral-300 w-16 outline-none text-center"
                            />
                            <button
                              onClick={async () => {
                                const drawingId = link360DrawingId;
                                const angle = parseInt(link360Angle || '0');
                                if (!drawingId) {
                                  await window.customAlert("Please select a drawing first.", "Selection Required");
                                  return;
                                }
                                const existingViews = selectedObject.views360 || [];
                                const newView = {
                                  id: `view_${Date.now()}`,
                                  angle: angle % 360,
                                  drawingId,
                                  name: objects[drawingId]?.name || `View ${existingViews.length + 1}`,
                                };
                                updateObject(selectedObject.id, {
                                  views360: [...existingViews, newView]
                                });
                                // Hide original drawing
                                updateObject(drawingId, { isHidden: true });
                                setLink360DrawingId("");
                                setLink360Angle("0");
                              }}
                              className="bg-amber-500 hover:bg-amber-600 text-black text-xs font-bold px-3 py-1.5 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CONVERT SELECTED DRAWING TO 3D PROXY */}
                  {(selectedObject.type === 'stroke' || selectedObject.type === 'shape' || selectedObject.type === 'image') && (
                    <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 p-4 rounded-2xl border border-amber-500/30 shadow-lg mt-3 space-y-2.5 animate-fade-in">
                      <div className="flex items-center gap-2">
                        <Box className="w-5 h-5 text-amber-400" />
                        <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                          ✨ 2D to 3D Extrusion Engine
                        </span>
                      </div>
                      <p className="text-[10px] text-neutral-300 leading-relaxed font-medium">
                        Instantly convert this 2D drawing or PNG image into a fully-functional <b>3D object mesh</b> based on its coordinates!
                      </p>
                      <button
                        type="button"
                        onClick={() => convertTo3D && convertTo3D(selectedObject.id)}
                        className="w-full bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-black text-xs font-black py-2.5 px-4 rounded-xl shadow-md transition-all duration-200 flex items-center justify-center gap-1.5 active:scale-[0.98] cursor-pointer uppercase tracking-wider font-sans"
                      >
                        💫 Convert to 3D Object
                      </button>
                    </div>
                  )}

                  {/* ✨ 2D TO 3D DRAWING EXTRUSION STUDIO */}
                  {(selectedObject.type === 'stroke' || selectedObject.type === 'shape' || selectedObject.type === 'image') && (
                    <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 p-4 rounded-2xl border border-indigo-500/30 shadow-lg mt-3 space-y-3 animate-fade-in">
                      <div className="flex items-center justify-between border-b border-indigo-500/20 pb-2">
                        <div className="flex items-center gap-2">
                          <Box className="w-5 h-5 text-indigo-400 animate-spin-slow" />
                          <span className="text-xs font-black uppercase tracking-wider text-indigo-300">
                            📐 2D to 3D Extrusion Studio
                          </span>
                        </div>
                        
                        {/* TOGGLE SWITCH */}
                        <button
                          id="toggle-3d-extrusion"
                          onClick={() => {
                            const isCurrentlyEnabled = !!selectedObject.transform3D?.enabled;
                            const defaultFaces = {
                              front: { color: (selectedObject.fillColor && selectedObject.fillColor !== 'transparent') ? selectedObject.fillColor : (selectedObject.strokeColor || '#6366F1'), opacity: 1.0, visible: true },
                              back: { color: (selectedObject.fillColor && selectedObject.fillColor !== 'transparent') ? selectedObject.fillColor : (selectedObject.strokeColor || '#4F46E5'), opacity: 1.0, visible: true },
                              sides: { color: selectedObject.strokeColor || '#4338CA', opacity: 1.0, visible: true }
                            };
                            
                            updateObject(selectedObject.id, {
                              transform3D: {
                                x: 0, y: 0, z: 0,
                                rx: 0, ry: 0, rz: 0,
                                sx: 1, sy: 1, sz: 1,
                                ...selectedObject.transform3D,
                                enabled: !isCurrentlyEnabled,
                                rotateX: selectedObject.transform3D?.rotateX ?? 25,
                                rotateY: selectedObject.transform3D?.rotateY ?? -30,
                                rotateZ: selectedObject.transform3D?.rotateZ ?? 0,
                                scaleX: selectedObject.transform3D?.scaleX ?? 1,
                                scaleY: selectedObject.transform3D?.scaleY ?? 1,
                                scaleZ: selectedObject.transform3D?.scaleZ ?? 1,
                                translateZ: selectedObject.transform3D?.translateZ ?? 0,
                                perspective: selectedObject.transform3D?.perspective ?? 800,
                                extrusion: selectedObject.transform3D?.extrusion ?? { depth: 40, segments: 1, bevel: 0 },
                                faces: selectedObject.transform3D?.faces ?? defaultFaces,
                                isMeshDirty: true
                              }
                            });
                          }}
                          className={`w-10 h-5.5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none ${
                            selectedObject.transform3D?.enabled ? 'bg-indigo-500' : 'bg-neutral-800'
                          }`}
                        >
                          <div
                            className={`bg-white w-4.5 h-4.5 rounded-full shadow-md transform transition-transform duration-200 ${
                              selectedObject.transform3D?.enabled ? 'translate-x-4.5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      <p className="text-[10px] text-neutral-300 leading-relaxed font-medium">
                        Extrude this 2D drawing along the Z-axis to transform it into a 3D mesh with real perspective projection, independent face styling, and lighting depth!
                      </p>

                      {selectedObject.transform3D?.enabled && (
                        <div className="space-y-3.5 pt-2 animate-fade-in">
                          {/* QUICK 3D STYLE PRESETS */}
                          <div className="bg-neutral-900/80 p-2.5 rounded-xl border border-indigo-500/30 space-y-2">
                            <span className="text-[9.5px] text-amber-400 font-extrabold uppercase tracking-wider block">
                              ⚡ Instant 3D Presets
                            </span>
                            <div className="grid grid-cols-3 gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  updateObject(selectedObject.id, {
                                    autoFillInnerRegion: true,
                                    fillGaps3D: true,
                                    transform3D: {
                                      ...selectedObject.transform3D!,
                                      scaleX: 1, scaleY: 1, scaleZ: 1,
                                      rotateX: 25, rotateY: -30, rotateZ: 0,
                                      bevelProfile: 'flat',
                                      extrusion: { depth: 60, segments: 1, bevel: 0 }
                                    }
                                  });
                                }}
                                className="px-2 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-[9px] font-bold text-neutral-200 rounded-lg border border-neutral-700/60 transition text-center"
                              >
                                📦 Solid Block
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  updateObject(selectedObject.id, {
                                    autoFillInnerRegion: true,
                                    fillGaps3D: true,
                                    transform3D: {
                                      ...selectedObject.transform3D!,
                                      scaleX: 1, scaleY: 1, scaleZ: 1.2,
                                      rotateX: 30, rotateY: -25, rotateZ: 0,
                                      bevelProfile: 'dome',
                                      extrusion: { depth: 55, segments: 1, bevel: 0 }
                                    }
                                  });
                                }}
                                className="px-2 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-[9px] font-bold text-neutral-200 rounded-lg border border-neutral-700/60 transition text-center"
                              >
                                🛡️ Dome Cushion
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  updateObject(selectedObject.id, {
                                    autoFillInnerRegion: true,
                                    fillGaps3D: true,
                                    transform3D: {
                                      ...selectedObject.transform3D!,
                                      scaleX: 1, scaleY: 1, scaleZ: 1,
                                      rotateX: 25, rotateY: -35, rotateZ: 0,
                                      bevelProfile: 'taper',
                                      extrusion: { depth: 75, segments: 1, bevel: 0 }
                                    }
                                  });
                                }}
                                className="px-2 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-[9px] font-bold text-neutral-200 rounded-lg border border-neutral-700/60 transition text-center"
                              >
                                📐 Cone Taper
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  updateObject(selectedObject.id, {
                                    autoFillInnerRegion: true,
                                    fillGaps3D: true,
                                    transform3D: {
                                      ...selectedObject.transform3D!,
                                      scaleX: 1, scaleY: 1, scaleZ: 1,
                                      rotateX: 20, rotateY: -30, rotateZ: 0,
                                      bevelProfile: 'bevel',
                                      extrusion: { depth: 50, segments: 1, bevel: 0 }
                                    }
                                  });
                                }}
                                className="px-2 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-[9px] font-bold text-neutral-200 rounded-lg border border-neutral-700/60 transition text-center"
                              >
                                🏛️ Chamfer Bevel
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  updateObject(selectedObject.id, {
                                    autoFillInnerRegion: true,
                                    fillGaps3D: true,
                                    transform3D: {
                                      ...selectedObject.transform3D!,
                                      scaleX: 1, scaleY: 1, scaleZ: 1,
                                      rotateX: 35, rotateY: 45, rotateZ: 0,
                                      perspective: 2000,
                                      bevelProfile: 'flat',
                                      extrusion: { depth: 35, segments: 1, bevel: 0 }
                                    }
                                  });
                                }}
                                className="px-2 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-[9px] font-bold text-neutral-200 rounded-lg border border-neutral-700/60 transition text-center"
                              >
                                🎨 Isometric
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  updateObject(selectedObject.id, {
                                    transform3D: {
                                      ...selectedObject.transform3D!,
                                      rotateX: 0, rotateY: 0, rotateZ: 0,
                                      scaleX: 1, scaleY: 1, scaleZ: 1
                                    }
                                  });
                                }}
                                className="px-2 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-[9px] font-bold text-indigo-300 rounded-lg border border-indigo-500/40 transition text-center"
                              >
                                🔄 Reset Angles
                              </button>
                            </div>
                          </div>

                          {/* 🕸️ WIREFRAME MESH & SUB-EXTRUSION STUDIO */}
                          <div className="bg-amber-950/30 p-3 rounded-xl border border-amber-500/40 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-amber-400 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                                Wireframe Vertices & Sub-3D
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const nextWf = !selectedObject.wireframeMode;
                                  updateObject(selectedObject.id, {
                                    wireframeMode: nextWf,
                                    selectedPointIndices: nextWf ? (selectedObject.selectedPointIndices || []) : []
                                  });
                                }}
                                className={`px-2.5 py-1 text-[9px] font-black rounded-lg uppercase tracking-wider border transition ${
                                  selectedObject.wireframeMode
                                    ? 'bg-amber-500 text-neutral-950 border-amber-400 shadow-md shadow-amber-500/20'
                                    : 'bg-neutral-800 text-amber-300 border-amber-500/30 hover:bg-neutral-700'
                                }`}
                              >
                                {selectedObject.wireframeMode ? '🟢 Wireframe ON' : '🕸️ Enable Wireframe'}
                              </button>
                            </div>

                            {selectedObject.wireframeMode && (
                              <div className="space-y-2.5 pt-1 animate-fade-in">
                                <div className="bg-neutral-900/90 p-2.5 rounded-lg border border-amber-500/20 text-[10px] space-y-2.5">
                                  <div className="flex items-center justify-between text-neutral-200 font-bold">
                                    <span>Selected Vertices:</span>
                                    <span className="text-amber-400 font-black font-mono text-xs">
                                      {(selectedObject.selectedPointIndices || []).length} / {selectedObject.points.length}
                                    </span>
                                  </div>
                                  <p className="text-[9px] text-neutral-400 leading-tight">
                                    Click vertices or use <b>Lasso Tool</b> on canvas to select drawing region points. Selected vertices turn <b>yellow</b>!
                                  </p>

                                  {/* Selection Controls */}
                                  <div className="grid grid-cols-3 gap-1 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        updateObject(selectedObject.id, {
                                          selectedPointIndices: selectedObject.points.map((_, i) => i)
                                        });
                                      }}
                                      className="py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-[9px] font-bold border border-neutral-700"
                                    >
                                      Select All
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        updateObject(selectedObject.id, {
                                          selectedPointIndices: []
                                        });
                                      }}
                                      className="py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-[9px] font-bold border border-neutral-700"
                                    >
                                      Deselect
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const current = new Set(selectedObject.selectedPointIndices || []);
                                        const inverted = selectedObject.points.map((_, i) => i).filter(i => !current.has(i));
                                        updateObject(selectedObject.id, {
                                          selectedPointIndices: inverted
                                        });
                                      }}
                                      className="py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-[9px] font-bold border border-neutral-700"
                                    >
                                      Invert
                                    </button>
                                  </div>

                                  {/* 1. Wire Density / Resampling */}
                                  <div className="space-y-1.5 pt-2 border-t border-neutral-800">
                                    <div className="flex items-center justify-between text-[9.5px] text-amber-300 font-bold">
                                      <span>🕸️ Wire Density / Spacing</span>
                                      <span className="font-mono text-amber-400">{sculptWireSpacing}px</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="range"
                                        min="4"
                                        max="50"
                                        value={sculptWireSpacing}
                                        onChange={(e) => setSculptWireSpacing(parseInt(e.target.value))}
                                        className="flex-1 h-1 bg-neutral-950 rounded appearance-none accent-amber-500 cursor-pointer"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const resampled = resamplePointsBySpacing(selectedObject.points, sculptWireSpacing);
                                          updateObject(selectedObject.id, {
                                            points: resampled,
                                            selectedPointIndices: []
                                          });
                                        }}
                                        className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-[9px] rounded uppercase border border-amber-400 transition"
                                      >
                                        Resample
                                      </button>
                                    </div>
                                  </div>

                                  {/* 2. Inner Space (Volumetric 3D Depth) */}
                                  <div className="space-y-1 pt-2 border-t border-neutral-800">
                                    <div className="flex items-center justify-between text-[9.5px] text-amber-300 font-bold">
                                      <span>📦 Inner Space (3D Volume Depth)</span>
                                      <span className="font-mono text-amber-400">{selectedObject.innerSpace3D || 0}px</span>
                                    </div>
                                    <input
                                      type="range"
                                      min="-300"
                                      max="1000"
                                      step="5"
                                      value={selectedObject.innerSpace3D || 0}
                                      onChange={(e) => {
                                        updateObject(selectedObject.id, {
                                          innerSpace3D: parseFloat(e.target.value)
                                        });
                                      }}
                                      className="w-full h-1 bg-neutral-950 rounded appearance-none accent-amber-500 cursor-pointer"
                                    />
                                  </div>

                                  {/* 3. Sculpting Actions (Extrude, Smooth, Flatten, Mirror, Delete) */}
                                  <div className="space-y-2 pt-2 border-t border-neutral-800">
                                    <span className="text-[9.5px] text-amber-300 font-black uppercase tracking-wider block">
                                      🛠️ Sculpting Tools & Modifiers
                                    </span>

                                    {/* Extrude Vertices */}
                                    <div className="bg-neutral-950/80 p-2 rounded border border-neutral-800 space-y-1.5">
                                      <div className="flex items-center justify-between text-[9px] text-neutral-300 font-bold">
                                        <span>Extrude Selected Vertices</span>
                                        <div className="flex gap-1">
                                          {(['x', 'y', 'z'] as const).map(ax => (
                                            <button
                                              key={ax}
                                              type="button"
                                              onClick={() => setSculptExtrudeAxis(ax)}
                                              className={`px-1.5 py-0.5 text-[8.5px] font-black rounded uppercase ${
                                                sculptExtrudeAxis === ax ? 'bg-amber-500 text-neutral-950' : 'bg-neutral-800 text-neutral-400'
                                              }`}
                                            >
                                              {ax.toUpperCase()}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="range"
                                          min="-200"
                                          max="200"
                                          step="2"
                                          value={sculptExtrudeDist}
                                          onChange={(e) => setSculptExtrudeDist(parseInt(e.target.value))}
                                          className="flex-1 h-1 bg-neutral-900 rounded appearance-none accent-amber-500 cursor-pointer"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const indices = selectedObject.selectedPointIndices || [];
                                            if (indices.length === 0) {
                                              alert("Select vertices first to extrude!");
                                              return;
                                            }
                                            const result = extrudeVertices(selectedObject.points, indices, sculptExtrudeAxis, sculptExtrudeDist);
                                            updateObject(selectedObject.id, {
                                              points: result.points,
                                              selectedPointIndices: result.newSelection
                                            });
                                          }}
                                          className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[9px] rounded border border-indigo-400/50"
                                        >
                                          Extrude ({sculptExtrudeDist}px)
                                        </button>
                                      </div>
                                    </div>

                                    {/* Smooth & Flatten */}
                                    <div className="grid grid-cols-2 gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const indices = selectedObject.selectedPointIndices || [];
                                          if (indices.length === 0) {
                                            alert("Select vertices first to smooth!");
                                            return;
                                          }
                                          const smoothed = smoothSelectedVertices(selectedObject.points, indices, sculptSmoothStrength);
                                          updateObject(selectedObject.id, { points: smoothed });
                                        }}
                                        className="py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-[9px] rounded border border-neutral-700 text-center"
                                      >
                                        ✨ Smooth Vertices
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const indices = selectedObject.selectedPointIndices || [];
                                          if (indices.length === 0) {
                                            alert("Select vertices first to flatten!");
                                            return;
                                          }
                                          const flattened = flattenSelectedVertices(selectedObject.points, indices, sculptFlattenAxis);
                                          updateObject(selectedObject.id, { points: flattened });
                                        }}
                                        className="py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-[9px] rounded border border-neutral-700 text-center"
                                      >
                                        📐 Flatten ({sculptFlattenAxis.toUpperCase()})
                                      </button>
                                    </div>

                                    {/* Mirror & Delete */}
                                    <div className="grid grid-cols-2 gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const indices = selectedObject.selectedPointIndices || [];
                                          if (indices.length === 0) {
                                            alert("Select vertices first to mirror!");
                                            return;
                                          }
                                          const mirrored = mirrorSelectedVertices(selectedObject.points, indices, sculptMirrorAxis);
                                          updateObject(selectedObject.id, { points: mirrored });
                                        }}
                                        className="py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-[9px] rounded border border-neutral-700 text-center"
                                      >
                                        🪞 Mirror ({sculptMirrorAxis.toUpperCase()})
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const indices = selectedObject.selectedPointIndices || [];
                                          if (indices.length === 0) return;
                                          const selectedSet = new Set(indices);
                                          const filtered = selectedObject.points.filter((_, i) => !selectedSet.has(i));
                                          updateObject(selectedObject.id, {
                                            points: filtered.length > 0 ? filtered : selectedObject.points,
                                            selectedPointIndices: []
                                          });
                                        }}
                                        className="py-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 font-bold text-[9px] rounded border border-rose-800/80 text-center"
                                      >
                                        🗑️ Delete Vertices
                                      </button>
                                    </div>
                                  </div>

                                  {/* 4. Prebuilt Actions / Saved Selections ("Make Action") */}
                                  <div className="space-y-2 pt-2 border-t border-neutral-800">
                                    <span className="text-[9.5px] text-amber-300 font-black uppercase tracking-wider block">
                                      🏷️ Saved Selections (Macro Actions)
                                    </span>
                                    <div className="flex gap-1.5">
                                      <input
                                        type="text"
                                        value={wireSculptActionName}
                                        onChange={(e) => setWireSculptActionName(e.target.value)}
                                        placeholder="Selection name (e.g. Head, Arm)"
                                        className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-[10px] text-white focus:outline-none focus:border-amber-500"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const indices = selectedObject.selectedPointIndices || [];
                                          if (indices.length === 0) {
                                            alert("Please select vertices to save as action!");
                                            return;
                                          }
                                          const name = wireSculptActionName.trim() || `Selection_${(selectedObject.savedSelections || []).length + 1}`;
                                          const newMacro = {
                                            id: `macro_${Date.now()}`,
                                            name,
                                            vertexIndices: [...indices],
                                            color: '#F59E0B'
                                          };
                                          const currentSaved = selectedObject.savedSelections || [];
                                          updateObject(selectedObject.id, {
                                            savedSelections: [...currentSaved, newMacro]
                                          });
                                          setWireSculptActionName('');
                                        }}
                                        className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-[9.5px] rounded border border-amber-400 transition"
                                      >
                                        Save Macro
                                      </button>
                                    </div>

                                    {/* Saved Selections List */}
                                    {selectedObject.savedSelections && selectedObject.savedSelections.length > 0 && (
                                      <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-thin pr-1 pt-1">
                                        {selectedObject.savedSelections.map((macro, idx) => (
                                          <div
                                            key={macro.id || idx}
                                            className="flex items-center justify-between bg-neutral-950/90 p-1.5 rounded border border-neutral-800 text-[9px]"
                                          >
                                            <button
                                              type="button"
                                              onClick={() => {
                                                updateObject(selectedObject.id, {
                                                  selectedPointIndices: macro.vertexIndices || []
                                                });
                                              }}
                                              className="font-bold text-amber-300 hover:underline text-left truncate flex-1"
                                            >
                                              🎯 {macro.name} ({macro.vertexIndices?.length || 0} pts)
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const filtered = selectedObject.savedSelections!.filter((_, i) => i !== idx);
                                                updateObject(selectedObject.id, { savedSelections: filtered });
                                              }}
                                              className="text-neutral-500 hover:text-rose-400 font-bold px-1"
                                            >
                                              ✕
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  {/* DONE SELECTION BUTTON */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if ((selectedObject.selectedPointIndices || []).length === 0) {
                                        alert("Please select at least 2 vertices on the drawing first!");
                                        return;
                                      }
                                      const subExtrusions = selectedObject.subExtrusions || [];
                                      const newSub: SubExtrusion = {
                                        id: `sub_${Date.now()}`,
                                        name: `SubExtrude_${subExtrusions.length + 1}`,
                                        pointIndices: [...selectedObject.selectedPointIndices!],
                                        extrudeX: 0,
                                        extrudeY: 0,
                                        extrudeZ: 40,
                                        scaleX: 1,
                                        scaleY: 1,
                                        scaleZ: 1,
                                        rotateX: 0,
                                        rotateY: 0,
                                        rotateZ: 0,
                                        color: selectedObject.fillColor && selectedObject.fillColor !== 'transparent' ? selectedObject.fillColor : (selectedObject.strokeColor || '#F59E0B')
                                      };
                                      updateObject(selectedObject.id, {
                                        wireframeSelectionDone: true,
                                        subExtrusions: [...subExtrusions, newSub],
                                        activeSubExtrusionId: newSub.id
                                      });
                                    }}
                                    className="w-full py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 font-black uppercase text-xs rounded-lg shadow-md transition-all text-center tracking-wider cursor-pointer"
                                  >
                                    ✅ Done Selection (Apply 3D Extrusion)
                                  </button>
                                </div>

                                {/* SUB-EXTRUSION & TRANSFORM CONTROLS */}
                                {selectedObject.wireframeSelectionDone && selectedObject.subExtrusions && selectedObject.subExtrusions.length > 0 && (
                                  <div className="bg-neutral-900/90 p-3 rounded-lg border border-amber-500/40 space-y-3">
                                    {(() => {
                                      const activeSubIdx = selectedObject.subExtrusions.findIndex(s => s.id === selectedObject.activeSubExtrusionId);
                                      const activeSub = activeSubIdx !== -1 ? selectedObject.subExtrusions[activeSubIdx] : selectedObject.subExtrusions[selectedObject.subExtrusions.length - 1];
                                      if (!activeSub) return null;

                                      const updateActiveSub = (fieldChanges: Partial<SubExtrusion>) => {
                                        const updatedSubs = selectedObject.subExtrusions!.map(s => {
                                          if (s.id === activeSub.id) {
                                            return { ...s, ...fieldChanges };
                                          }
                                          return s;
                                        });
                                        updateObject(selectedObject.id, { subExtrusions: updatedSubs });
                                      };

                                      return (
                                        <div className="space-y-2.5">
                                          <div className="flex items-center justify-between text-[10px] font-bold text-amber-300 border-b border-amber-500/20 pb-1.5">
                                            <span>✨ Active 3D Part ({activeSub.pointIndices.length} Vertices)</span>
                                            <span className="font-mono text-neutral-400">{activeSub.name}</span>
                                          </div>

                                          {/* Extrude Z (+Z, -Z depth) up to 2000px */}
                                          <div className="space-y-1">
                                            <div className="flex items-center justify-between text-[10px] text-neutral-300 font-bold">
                                              <span>Extrude Z Axis (+Z / -Z)</span>
                                              <span className="text-amber-400 font-mono">{activeSub.extrudeZ}px</span>
                                            </div>
                                            <input
                                              type="range"
                                              min="-500"
                                              max="2000"
                                              step="5"
                                              value={activeSub.extrudeZ}
                                              onChange={(e) => updateActiveSub({ extrudeZ: parseFloat(e.target.value) })}
                                              className="w-full h-1 bg-neutral-950 rounded appearance-none accent-amber-500 cursor-pointer"
                                            />
                                          </div>

                                          {/* Extrude X & Y Shift up to 2000px */}
                                          <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1">
                                              <div className="flex items-center justify-between text-[9px] text-neutral-400">
                                                <span>Shift X (+X / -X)</span>
                                                <span className="text-amber-400 font-mono">{activeSub.extrudeX}px</span>
                                              </div>
                                              <input
                                                type="range"
                                                min="-1000"
                                                max="1000"
                                                step="5"
                                                value={activeSub.extrudeX}
                                                onChange={(e) => updateActiveSub({ extrudeX: parseFloat(e.target.value) })}
                                                className="w-full h-1 bg-neutral-950 rounded appearance-none accent-amber-500 cursor-pointer"
                                              />
                                            </div>
                                            <div className="space-y-1">
                                              <div className="flex items-center justify-between text-[9px] text-neutral-400">
                                                <span>Shift Y (+Y / -Y)</span>
                                                <span className="text-amber-400 font-mono">{activeSub.extrudeY}px</span>
                                              </div>
                                              <input
                                                type="range"
                                                min="-1000"
                                                max="1000"
                                                step="5"
                                                value={activeSub.extrudeY}
                                                onChange={(e) => updateActiveSub({ extrudeY: parseFloat(e.target.value) })}
                                                className="w-full h-1 bg-neutral-950 rounded appearance-none accent-amber-500 cursor-pointer"
                                              />
                                            </div>
                                          </div>

                                          {/* Scale X, Y, Z */}
                                          <div className="grid grid-cols-3 gap-1.5 pt-1">
                                            <div className="space-y-1">
                                              <div className="text-[9px] text-neutral-400 text-center">Scale X ({activeSub.scaleX}x)</div>
                                              <input
                                                type="range"
                                                min="0.1"
                                                max="5"
                                                step="0.1"
                                                value={activeSub.scaleX}
                                                onChange={(e) => updateActiveSub({ scaleX: parseFloat(e.target.value) })}
                                                className="w-full h-1 bg-neutral-950 rounded appearance-none accent-amber-500 cursor-pointer"
                                              />
                                            </div>
                                            <div className="space-y-1">
                                              <div className="text-[9px] text-neutral-400 text-center">Scale Y ({activeSub.scaleY}x)</div>
                                              <input
                                                type="range"
                                                min="0.1"
                                                max="5"
                                                step="0.1"
                                                value={activeSub.scaleY}
                                                onChange={(e) => updateActiveSub({ scaleY: parseFloat(e.target.value) })}
                                                className="w-full h-1 bg-neutral-950 rounded appearance-none accent-amber-500 cursor-pointer"
                                              />
                                            </div>
                                            <div className="space-y-1">
                                              <div className="text-[9px] text-neutral-400 text-center">Scale Z ({activeSub.scaleZ}x)</div>
                                              <input
                                                type="range"
                                                min="0.1"
                                                max="5"
                                                step="0.1"
                                                value={activeSub.scaleZ}
                                                onChange={(e) => updateActiveSub({ scaleZ: parseFloat(e.target.value) })}
                                                className="w-full h-1 bg-neutral-950 rounded appearance-none accent-amber-500 cursor-pointer"
                                              />
                                            </div>
                                          </div>

                                          {/* Rotate X, Y, Z */}
                                          <div className="grid grid-cols-3 gap-1.5 pt-1">
                                            <div className="space-y-1">
                                              <div className="text-[9px] text-neutral-400 text-center">Rot X ({activeSub.rotateX}°)</div>
                                              <input
                                                type="range"
                                                min="-180"
                                                max="180"
                                                step="5"
                                                value={activeSub.rotateX}
                                                onChange={(e) => updateActiveSub({ rotateX: parseFloat(e.target.value) })}
                                                className="w-full h-1 bg-neutral-950 rounded appearance-none accent-amber-500 cursor-pointer"
                                              />
                                            </div>
                                            <div className="space-y-1">
                                              <div className="text-[9px] text-neutral-400 text-center">Rot Y ({activeSub.rotateY}°)</div>
                                              <input
                                                type="range"
                                                min="-180"
                                                max="180"
                                                step="5"
                                                value={activeSub.rotateY}
                                                onChange={(e) => updateActiveSub({ rotateY: parseFloat(e.target.value) })}
                                                className="w-full h-1 bg-neutral-950 rounded appearance-none accent-amber-500 cursor-pointer"
                                              />
                                            </div>
                                            <div className="space-y-1">
                                              <div className="text-[9px] text-neutral-400 text-center">Rot Z ({activeSub.rotateZ}°)</div>
                                              <input
                                                type="range"
                                                min="-180"
                                                max="180"
                                                step="5"
                                                value={activeSub.rotateZ}
                                                onChange={(e) => updateActiveSub({ rotateZ: parseFloat(e.target.value) })}
                                                className="w-full h-1 bg-neutral-950 rounded appearance-none accent-amber-500 cursor-pointer"
                                              />
                                            </div>
                                          </div>

                                          {/* Color for selected sub-region */}
                                          <div className="flex items-center justify-between pt-1">
                                            <span className="text-[10px] text-neutral-300 font-bold">Sub-Region Color</span>
                                            <CustomColorPicker
                                              color={activeSub.color || '#F59E0B'}
                                              onChange={(c) => updateActiveSub({ color: c })}
                                            />
                                          </div>

                                          {/* CHAINED SUB-EXTRUSION BUTTON */}
                                          <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-neutral-800">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const newChildSub: SubExtrusion = {
                                                  id: `sub_${Date.now()}`,
                                                  name: `Branch_${(activeSub.subExtrusions || []).length + 1}`,
                                                  pointIndices: [...activeSub.pointIndices],
                                                  extrudeX: 0,
                                                  extrudeY: 0,
                                                  extrudeZ: 40,
                                                  scaleX: 1,
                                                  scaleY: 1,
                                                  scaleZ: 1,
                                                  rotateX: 0,
                                                  rotateY: 0,
                                                  rotateZ: 0,
                                                  color: activeSub.color || '#F59E0B'
                                                };
                                                const updatedSubExtrusions = selectedObject.subExtrusions!.map(s => {
                                                  if (s.id === activeSub.id) {
                                                    return {
                                                      ...s,
                                                      subExtrusions: [...(s.subExtrusions || []), newChildSub]
                                                    };
                                                  }
                                                  return s;
                                                });
                                                updateObject(selectedObject.id, {
                                                  subExtrusions: updatedSubExtrusions,
                                                  activeSubExtrusionId: newChildSub.id
                                                });
                                              }}
                                              className="py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[9.5px] rounded-lg border border-indigo-400/50 text-center transition cursor-pointer"
                                            >
                                              ➕ Chain Next Part
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() => {
                                                updateObject(selectedObject.id, {
                                                  wireframeSelectionDone: false,
                                                  selectedPointIndices: []
                                                });
                                              }}
                                              className="py-1.5 bg-neutral-800 hover:bg-neutral-700 text-amber-300 font-bold text-[9.5px] rounded-lg border border-amber-500/30 text-center transition cursor-pointer"
                                            >
                                              🔄 New Vertices
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* 1. GEOMETRY EXTRUSION & FOV */}
                          <div className="bg-neutral-900/60 p-3 rounded-xl border border-neutral-800/80 space-y-3">
                            <span className="text-[9.5px] text-indigo-400 font-extrabold uppercase tracking-wider block">
                              📦 Mesh Geometry & Bevel Curves
                            </span>

                            {/* Extrusion Depth */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-neutral-400">
                                <span>Thickness / Extrusion Depth</span>
                                <span className="text-indigo-400 font-bold font-mono">
                                  {selectedObject.transform3D.extrusion?.depth ?? 40}px
                                </span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="300"
                                step="2"
                                value={selectedObject.transform3D.extrusion?.depth ?? 40}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  const oldExtrusion = selectedObject.transform3D!.extrusion ?? { depth: 40, segments: 1, bevel: 0 };
                                  updateObject(selectedObject.id, {
                                    transform3D: {
                                      ...selectedObject.transform3D!,
                                      extrusion: { ...oldExtrusion, depth: val },
                                      isMeshDirty: true
                                    }
                                  });
                                }}
                                className="w-full accent-indigo-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                              />
                            </div>

                            {/* Blend Curve / Bevel Profile Selector */}
                            <div className="space-y-1.5 pt-1">
                              <span className="text-[10px] text-neutral-400 font-bold uppercase block">
                                Blend Curve / Bevel Shape
                              </span>
                              <div className="grid grid-cols-3 gap-1">
                                {[
                                  { id: 'flat', label: 'Flat' },
                                  { id: 'bevel', label: 'Bevel' },
                                  { id: 'dome', label: 'Dome' },
                                  { id: 'taper', label: 'Taper' },
                                  { id: 'scurve', label: 'S-Curve' },
                                  { id: 'hourglass', label: 'Hourglass' }
                                ].map((prof) => {
                                  const isSel = (selectedObject.transform3D?.bevelProfile || 'flat') === prof.id;
                                  return (
                                    <button
                                      key={prof.id}
                                      type="button"
                                      onClick={() => {
                                        updateObject(selectedObject.id, {
                                          transform3D: {
                                            ...selectedObject.transform3D!,
                                            bevelProfile: prof.id as any
                                          }
                                        });
                                      }}
                                      className={`py-1 text-[9px] font-bold rounded-md border transition text-center ${
                                        isSel
                                          ? 'bg-indigo-600 text-white border-indigo-400 shadow-sm'
                                          : 'bg-neutral-800/80 text-neutral-400 border-neutral-700/60 hover:text-neutral-200'
                                      }`}
                                    >
                                      {prof.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Perspective Field of View */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-neutral-400">
                                <span>Perspective (FOV)</span>
                                <span className="text-indigo-400 font-bold font-mono">
                                  {selectedObject.transform3D.perspective ?? 800}px
                                </span>
                              </div>
                              <input
                                type="range"
                                min="100"
                                max="2000"
                                step="50"
                                value={selectedObject.transform3D.perspective ?? 800}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  updateObject(selectedObject.id, {
                                    transform3D: {
                                      ...selectedObject.transform3D!,
                                      perspective: val,
                                      isMeshDirty: true
                                    }
                                  });
                                }}
                                className="w-full accent-indigo-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                              />
                            </div>

                            {/* Auto-Fill Inner Enclosed Region Toggle */}
                            <div className="flex items-center justify-between pt-1.5 border-t border-neutral-800/40">
                              <span className="text-[10px] text-amber-300 font-bold uppercase flex flex-col">
                                <span>✨ Auto-Fill Inner Region</span>
                                <span className="text-[8px] text-neutral-400 font-normal normal-case leading-tight">Automatically fills enclosed path interior</span>
                              </span>
                              <button
                                id="toggle-extrusion-autofillinner"
                                type="button"
                                onClick={() => {
                                  const newVal = !selectedObject.autoFillInnerRegion;
                                  updateObject(selectedObject.id, {
                                    autoFillInnerRegion: newVal,
                                    fillGaps3D: newVal,
                                    autoFillGaps: newVal,
                                    fillGaps: newVal,
                                    fillColor: newVal ? (selectedObject.fillColor && selectedObject.fillColor !== 'transparent' ? selectedObject.fillColor : (selectedObject.strokeColor || '#6366F1')) : selectedObject.fillColor
                                  });
                                }}
                                className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none ${
                                  (selectedObject.autoFillInnerRegion || selectedObject.fillGaps3D) ? 'bg-amber-500' : 'bg-neutral-800'
                                }`}
                              >
                                <div
                                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                                    (selectedObject.autoFillInnerRegion || selectedObject.fillGaps3D) ? 'translate-x-4' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                            </div>
                          </div>

                          {/* 2. 3D EULER ROTATION */}
                          <div className="bg-neutral-900/60 p-3 rounded-xl border border-neutral-800/80 space-y-3">
                            <span className="text-[9.5px] text-indigo-400 font-extrabold uppercase tracking-wider block">
                              🔄 3D Space Rotation
                            </span>

                            {/* Rotate X */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-neutral-400">
                                <span>Rotate X (Pitch)</span>
                                <span className="text-indigo-400 font-bold font-mono">
                                  {selectedObject.transform3D.rotateX ?? 0}°
                                </span>
                              </div>
                              <input
                                type="range"
                                min="-180"
                                max="180"
                                value={selectedObject.transform3D.rotateX ?? 0}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  updateObject(selectedObject.id, {
                                    transform3D: { ...selectedObject.transform3D!, rotateX: val }
                                  });
                                }}
                                className="w-full accent-indigo-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                              />
                            </div>

                            {/* Rotate Y */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-neutral-400">
                                <span>Rotate Y (Yaw)</span>
                                <span className="text-indigo-400 font-bold font-mono">
                                  {selectedObject.transform3D.rotateY ?? 0}°
                                </span>
                              </div>
                              <input
                                type="range"
                                min="-180"
                                max="180"
                                value={selectedObject.transform3D.rotateY ?? 0}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  updateObject(selectedObject.id, {
                                    transform3D: { ...selectedObject.transform3D!, rotateY: val }
                                  });
                                }}
                                className="w-full accent-indigo-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                              />
                            </div>

                            {/* Rotate Z */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-neutral-400">
                                <span>Rotate Z (Roll)</span>
                                <span className="text-indigo-400 font-bold font-mono">
                                  {selectedObject.transform3D.rotateZ ?? 0}°
                                </span>
                              </div>
                              <input
                                type="range"
                                min="-180"
                                max="180"
                                value={selectedObject.transform3D.rotateZ ?? 0}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  updateObject(selectedObject.id, {
                                    transform3D: { ...selectedObject.transform3D!, rotateZ: val }
                                  });
                                }}
                                className="w-full accent-indigo-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                              />
                            </div>
                          </div>

                          {/* 3. 3D AXIS SCALE & TRANS */}
                          <div className="bg-neutral-900/60 p-3 rounded-xl border border-neutral-800/80 space-y-3">
                            <span className="text-[9.5px] text-indigo-400 font-extrabold uppercase tracking-wider block">
                              📐 3D Axis Transformations
                            </span>

                            {/* Scale X */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-neutral-400">
                                <span>Scale X Axis</span>
                                <span className="text-indigo-400 font-bold font-mono">
                                  {selectedObject.transform3D.scaleX ?? 1}x
                                </span>
                              </div>
                              <input
                                type="range"
                                min="0.1"
                                max="4"
                                step="0.05"
                                value={selectedObject.transform3D.scaleX ?? 1}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  updateObject(selectedObject.id, {
                                    transform3D: { ...selectedObject.transform3D!, scaleX: val }
                                  });
                                }}
                                className="w-full accent-indigo-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                              />
                            </div>

                            {/* Scale Y */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-neutral-400">
                                <span>Scale Y Axis</span>
                                <span className="text-indigo-400 font-bold font-mono">
                                  {selectedObject.transform3D.scaleY ?? 1}x
                                </span>
                              </div>
                              <input
                                type="range"
                                min="0.1"
                                max="4"
                                step="0.05"
                                value={selectedObject.transform3D.scaleY ?? 1}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  updateObject(selectedObject.id, {
                                    transform3D: { ...selectedObject.transform3D!, scaleY: val }
                                  });
                                }}
                                className="w-full accent-indigo-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                              />
                            </div>

                            {/* Scale Z */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-neutral-400">
                                <span>Scale Z Axis (Extrusion Height)</span>
                                <span className="text-indigo-400 font-bold font-mono">
                                  {selectedObject.transform3D.scaleZ ?? 1}x
                                </span>
                              </div>
                              <input
                                type="range"
                                min="0.1"
                                max="4"
                                step="0.05"
                                value={selectedObject.transform3D.scaleZ ?? 1}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  updateObject(selectedObject.id, {
                                    transform3D: { ...selectedObject.transform3D!, scaleZ: val }
                                  });
                                }}
                                className="w-full accent-indigo-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                              />
                            </div>

                            {/* Translate Z */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-neutral-400">
                                <span>Translation Z (Depth Plane)</span>
                                <span className="text-indigo-400 font-bold font-mono">
                                  {selectedObject.transform3D.translateZ ?? 0}px
                                </span>
                              </div>
                              <input
                                type="range"
                                min="-250"
                                max="500"
                                value={selectedObject.transform3D.translateZ ?? 0}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  updateObject(selectedObject.id, {
                                    transform3D: { ...selectedObject.transform3D!, translateZ: val }
                                  });
                                }}
                                className="w-full accent-indigo-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                              />
                            </div>
                          </div>

                          {/* 4. 🌊 5 EXTRA 3D TRANSFORM DEPTH SLIDERS */}
                          <div className="bg-gradient-to-r from-amber-950/40 to-indigo-950/40 p-3 rounded-xl border border-amber-500/40 space-y-3 shadow-md">
                            <div className="flex items-center justify-between">
                              <span className="text-[9.5px] text-amber-300 font-extrabold uppercase tracking-wider block">
                                ✨ Advanced 3D Depth & Deformation Controls (5 Controls)
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  updateObject(selectedObject.id, {
                                    transform3D: {
                                      ...selectedObject.transform3D!,
                                      depthTaper: 0,
                                      depthCurvature: 0,
                                      twistZ: 0,
                                      shearZ: 0,
                                      inflateDepth: 0
                                    }
                                  });
                                }}
                                className="px-1.5 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-[8.5px] font-bold text-amber-400 rounded border border-amber-500/30 transition cursor-pointer"
                              >
                                Reset 3D Depth
                              </button>
                            </div>

                            {/* 1. Depth Taper */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-neutral-300">
                                <span className="flex items-center gap-1 font-semibold">
                                  <span>📐 Depth Taper (Conical Width)</span>
                                </span>
                                <span className="text-amber-400 font-bold font-mono">
                                  {selectedObject.transform3D.depthTaper ?? 0}%
                                </span>
                              </div>
                              <input
                                type="range"
                                min="-100"
                                max="100"
                                step="1"
                                value={selectedObject.transform3D.depthTaper ?? 0}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  updateObject(selectedObject.id, {
                                    transform3D: { ...selectedObject.transform3D!, depthTaper: val }
                                  });
                                }}
                                className="w-full accent-amber-400 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                              />
                            </div>

                            {/* 2. Depth Curvature Bend */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-neutral-300">
                                <span className="flex items-center gap-1 font-semibold">
                                  <span>🌊 Depth Curvature (3D Z-Arc Bend)</span>
                                </span>
                                <span className="text-amber-400 font-bold font-mono">
                                  {selectedObject.transform3D.depthCurvature ?? 0}°
                                </span>
                              </div>
                              <input
                                type="range"
                                min="-180"
                                max="180"
                                step="1"
                                value={selectedObject.transform3D.depthCurvature ?? 0}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  updateObject(selectedObject.id, {
                                    transform3D: { ...selectedObject.transform3D!, depthCurvature: val }
                                  });
                                }}
                                className="w-full accent-amber-400 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                              />
                            </div>

                            {/* 3. Twist Z */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-neutral-300">
                                <span className="flex items-center gap-1 font-semibold">
                                  <span>🌀 3D Twist Z (Helical Ribbon)</span>
                                </span>
                                <span className="text-amber-400 font-bold font-mono">
                                  {selectedObject.transform3D.twistZ ?? 0}°
                                </span>
                              </div>
                              <input
                                type="range"
                                min="-360"
                                max="360"
                                step="5"
                                value={selectedObject.transform3D.twistZ ?? 0}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  updateObject(selectedObject.id, {
                                    transform3D: { ...selectedObject.transform3D!, twistZ: val }
                                  });
                                }}
                                className="w-full accent-amber-400 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                              />
                            </div>

                            {/* 4. Shear Z Skew */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-neutral-300">
                                <span className="flex items-center gap-1 font-semibold">
                                  <span>↗️ Depth Shear Z (Diagonal Skew)</span>
                                </span>
                                <span className="text-amber-400 font-bold font-mono">
                                  {selectedObject.transform3D.shearZ ?? 0}px
                                </span>
                              </div>
                              <input
                                type="range"
                                min="-100"
                                max="100"
                                step="1"
                                value={selectedObject.transform3D.shearZ ?? 0}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  updateObject(selectedObject.id, {
                                    transform3D: { ...selectedObject.transform3D!, shearZ: val }
                                  });
                                }}
                                className="w-full accent-amber-400 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                              />
                            </div>

                            {/* 5. Inflate Bulge Puff Depth */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-neutral-300">
                                <span className="flex items-center gap-1 font-semibold">
                                  <span>🎈 Inflate Bulge (Puff 3D Volume)</span>
                                </span>
                                <span className="text-amber-400 font-bold font-mono">
                                  {selectedObject.transform3D.inflateDepth ?? 0}px
                                </span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                step="1"
                                value={selectedObject.transform3D.inflateDepth ?? 0}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  updateObject(selectedObject.id, {
                                    transform3D: { ...selectedObject.transform3D!, inflateDepth: val }
                                  });
                                }}
                                className="w-full accent-amber-400 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                              />
                            </div>
                          </div>

                          {/* 5. CHRONO FACES PAINT STATION */}
                          <div className="bg-neutral-900/60 p-3 rounded-xl border border-neutral-800/80 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-[9.5px] text-indigo-400 font-extrabold uppercase tracking-wider flex items-center gap-1">
                                <Palette className="w-3.5 h-3.5" />
                                🎨 3D Face Paint Workbench
                              </span>
                            </div>

                            {/* Front Face */}
                            <div className="space-y-1.5 p-2 bg-neutral-950 rounded-lg border border-neutral-800/50">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-neutral-300 font-bold uppercase">Front Face Color</span>
                                <CustomColorPicker
                                  color={selectedObject.transform3D.faces?.front?.color ?? '#6366F1'}
                                  onChange={(c) => {
                                    const currentFaces = selectedObject.transform3D!.faces ?? {
                                      front: { color: '#6366F1', opacity: 1.0, visible: true },
                                      back: { color: '#4F46E5', opacity: 1.0, visible: true },
                                      sides: { color: '#4338CA', opacity: 1.0, visible: true }
                                    };
                                    updateObject(selectedObject.id, {
                                      transform3D: {
                                        ...selectedObject.transform3D!,
                                        faces: {
                                          front: { color: c, opacity: currentFaces.front.opacity, visible: true },
                                          back: currentFaces.back,
                                          sides: currentFaces.sides
                                        }
                                      }
                                    });
                                  }}
                                />
                              </div>
                              {/* Front Opacity */}
                              <div className="space-y-0.5">
                                <div className="flex justify-between text-[8px] text-neutral-500">
                                  <span>Opacity</span>
                                  <span>{Math.round((selectedObject.transform3D.faces?.front?.opacity ?? 1.0) * 100)}%</span>
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.05"
                                  value={selectedObject.transform3D.faces?.front?.opacity ?? 1.0}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    const currentFaces = selectedObject.transform3D!.faces ?? {
                                      front: { color: '#6366F1', opacity: 1.0, visible: true },
                                      back: { color: '#4F46E5', opacity: 1.0, visible: true },
                                      sides: { color: '#4338CA', opacity: 1.0, visible: true }
                                    };
                                    updateObject(selectedObject.id, {
                                      transform3D: {
                                        ...selectedObject.transform3D!,
                                        faces: {
                                          front: { color: currentFaces.front.color, opacity: val, visible: true },
                                          back: currentFaces.back,
                                          sides: currentFaces.sides
                                        }
                                      }
                                    });
                                  }}
                                  className="w-full accent-indigo-500 h-1 bg-neutral-800 rounded appearance-none cursor-pointer"
                                />
                              </div>
                            </div>

                            {/* Back Face */}
                            <div className="space-y-1.5 p-2 bg-neutral-950 rounded-lg border border-neutral-800/50">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-neutral-300 font-bold uppercase">Back Face Color</span>
                                <CustomColorPicker
                                  color={selectedObject.transform3D.faces?.back?.color ?? '#4F46E5'}
                                  onChange={(c) => {
                                    const currentFaces = selectedObject.transform3D!.faces ?? {
                                      front: { color: '#6366F1', opacity: 1.0, visible: true },
                                      back: { color: '#4F46E5', opacity: 1.0, visible: true },
                                      sides: { color: '#4338CA', opacity: 1.0, visible: true }
                                    };
                                    updateObject(selectedObject.id, {
                                      transform3D: {
                                        ...selectedObject.transform3D!,
                                        faces: {
                                          front: currentFaces.front,
                                          back: { color: c, opacity: currentFaces.back.opacity, visible: true },
                                          sides: currentFaces.sides
                                        }
                                      }
                                    });
                                  }}
                                />
                              </div>
                              {/* Back Opacity */}
                              <div className="space-y-0.5">
                                <div className="flex justify-between text-[8px] text-neutral-500">
                                  <span>Opacity</span>
                                  <span>{Math.round((selectedObject.transform3D.faces?.back?.opacity ?? 1.0) * 100)}%</span>
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.05"
                                  value={selectedObject.transform3D.faces?.back?.opacity ?? 1.0}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    const currentFaces = selectedObject.transform3D!.faces ?? {
                                      front: { color: '#6366F1', opacity: 1.0, visible: true },
                                      back: { color: '#4F46E5', opacity: 1.0, visible: true },
                                      sides: { color: '#4338CA', opacity: 1.0, visible: true }
                                    };
                                    updateObject(selectedObject.id, {
                                      transform3D: {
                                        ...selectedObject.transform3D!,
                                        faces: {
                                          front: currentFaces.front,
                                          back: { color: currentFaces.back.color, opacity: val, visible: true },
                                          sides: currentFaces.sides
                                        }
                                      }
                                    });
                                  }}
                                  className="w-full accent-indigo-500 h-1 bg-neutral-800 rounded appearance-none cursor-pointer"
                                />
                              </div>
                            </div>

                            {/* Side Extrusions */}
                            <div className="space-y-1.5 p-2 bg-neutral-950 rounded-lg border border-neutral-800/50">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-neutral-300 font-bold uppercase">Sides (Extruded Body) Color</span>
                                <CustomColorPicker
                                  color={selectedObject.transform3D.faces?.sides?.color ?? '#4338CA'}
                                  onChange={(c) => {
                                    const currentFaces = selectedObject.transform3D!.faces ?? {
                                      front: { color: '#6366F1', opacity: 1.0, visible: true },
                                      back: { color: '#4F46E5', opacity: 1.0, visible: true },
                                      sides: { color: '#4338CA', opacity: 1.0, visible: true }
                                    };
                                    updateObject(selectedObject.id, {
                                      transform3D: {
                                        ...selectedObject.transform3D!,
                                        faces: {
                                          front: currentFaces.front,
                                          back: currentFaces.back,
                                          sides: { color: c, opacity: currentFaces.sides.opacity, visible: true }
                                        }
                                      }
                                    });
                                  }}
                                />
                              </div>
                              {/* Side Opacity */}
                              <div className="space-y-0.5">
                                <div className="flex justify-between text-[8px] text-neutral-500">
                                  <span>Opacity</span>
                                  <span>{Math.round((selectedObject.transform3D.faces?.sides?.opacity ?? 1.0) * 100)}%</span>
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.05"
                                  value={selectedObject.transform3D.faces?.sides?.opacity ?? 1.0}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    const currentFaces = selectedObject.transform3D!.faces ?? {
                                      front: { color: '#6366F1', opacity: 1.0, visible: true },
                                      back: { color: '#4F46E5', opacity: 1.0, visible: true },
                                      sides: { color: '#4338CA', opacity: 1.0, visible: true }
                                    };
                                    updateObject(selectedObject.id, {
                                      transform3D: {
                                        ...selectedObject.transform3D!,
                                        faces: {
                                          front: currentFaces.front,
                                          back: currentFaces.back,
                                          sides: { color: currentFaces.sides.color, opacity: val, visible: true }
                                        }
                                      }
                                    });
                                  }}
                                  className="w-full accent-indigo-500 h-1 bg-neutral-800 rounded appearance-none cursor-pointer"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 3D PROXY CONTROLLER MATRIX */}
                  {(selectedObject.type === '3d' || selectedObject.transform3D?.enabled) && (
                    <div className="space-y-4 bg-amber-500/5 p-4 rounded-2xl border border-amber-400/20 shadow-lg shadow-black/20 mt-3 animate-fade-in">
                      <div className="flex items-center justify-between border-b border-amber-500/10 pb-2.5">
                        <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                          <Layers className="w-4 h-4 text-amber-400" />
                          3D Proxy Transform Matrix
                        </span>
                        <span className="text-[9px] text-amber-500 font-extrabold bg-amber-500/10 px-1.5 py-0.5 rounded uppercase">
                          {selectedObject.shape3DType}
                        </span>
                      </div>

                      <p className="text-[10px] text-neutral-400 leading-normal font-medium">
                        Manipulate coordinates directly across both 2D and 3D viewport metrics. Changes resolve to the projection layer in real-time.
                      </p>

                      {/* HIDE 3D GRID LINES TOGGLE */}
                      <div className="flex items-center justify-between bg-neutral-950/40 p-2.5 rounded-xl border border-neutral-800/50">
                        <span className="text-[10px] text-neutral-300 font-bold uppercase tracking-wider">
                          Hide 3D Grid Lines
                        </span>
                        <button
                          id="toggle-hide-3d-grid"
                          onClick={() => {
                            updateObject(selectedObject.id, {
                              hide3DGrid: !selectedObject.hide3DGrid
                            });
                          }}
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none ${
                            selectedObject.hide3DGrid ? 'bg-amber-500' : 'bg-neutral-800'
                          }`}
                        >
                          <div
                            className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                              selectedObject.hide3DGrid ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      {/* 🎲 3D ADVANCED MODELING STUDIO */}
                      <div className="space-y-3 bg-neutral-900/60 p-3.5 rounded-xl border border-neutral-800/80">
                        <div className="flex items-center justify-between border-b border-neutral-800/60 pb-2">
                          <span className="text-[10px] text-amber-400 font-extrabold uppercase tracking-wider flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5" />
                            3D Modeling Studio
                          </span>
                          <span className="text-[8px] bg-amber-500/10 text-amber-400 font-bold px-1.5 py-0.5 rounded uppercase">
                            Mesh Sandbox
                          </span>
                        </div>

                        {/* HOLLOW (ANDAR SPACE) & DEPTH CONTROLS */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-neutral-300 font-bold uppercase">Make Model Hollow</span>
                            <button
                              id="toggle-3d-hollow"
                              onClick={() => {
                                const newHollow = !selectedObject.hollowEnabled;
                                const currentDepth = selectedObject.depth3D || 40;
                                const currentInner = selectedObject.innerSpace3D !== undefined ? selectedObject.innerSpace3D : 10;
                                const pts = selectedObject.originalPointsBackup || selectedObject.points;
                                if (pts) {
                                  const res = extrude2DTo3D(pts, selectedObject.fillColor, selectedObject.strokeColor, currentDepth, newHollow, currentInner, !!selectedObject.fillGaps3D, selectedObject.strokeWidth || 5);
                                  updateObject(selectedObject.id, {
                                    vertices3D: res.vertices,
                                    faces3D: res.faces,
                                    hollowEnabled: newHollow,
                                    innerSpace3D: currentInner
                                  });
                                }
                              }}
                              className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none ${
                                selectedObject.hollowEnabled ? 'bg-amber-500' : 'bg-neutral-800'
                              }`}
                            >
                              <div
                                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                                  selectedObject.hollowEnabled ? 'translate-x-4' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>

                          {/* FILL GAPS & INNER AREA */}
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-neutral-300 font-bold uppercase flex flex-col">
                              <span>Fill Gaps & Inner Area</span>
                              <span className="text-[8px] text-neutral-500 font-normal normal-case leading-tight">Closes and fills disjoint 3D regions</span>
                            </span>
                            <button
                              id="toggle-3d-fillgaps"
                              onClick={() => {
                                const newFillGaps = !selectedObject.fillGaps3D;
                                const currentDepth = selectedObject.depth3D || 40;
                                const currentInner = selectedObject.innerSpace3D !== undefined ? selectedObject.innerSpace3D : 10;
                                const pts = selectedObject.originalPointsBackup || selectedObject.points;
                                if (pts) {
                                  const res = extrude2DTo3D(pts, selectedObject.fillColor, selectedObject.strokeColor, currentDepth, !!selectedObject.hollowEnabled, currentInner, newFillGaps, selectedObject.strokeWidth || 5);
                                  updateObject(selectedObject.id, {
                                    vertices3D: res.vertices,
                                    faces3D: res.faces,
                                    fillGaps3D: newFillGaps
                                  });
                                }
                              }}
                              className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none ${
                                selectedObject.fillGaps3D ? 'bg-amber-500' : 'bg-neutral-800'
                              }`}
                            >
                              <div
                                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                                  selectedObject.fillGaps3D ? 'translate-x-4' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>

                          {/* Inner Wall Space Slider */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px] text-neutral-400">
                              <span>Wall Thickness (Inner Space)</span>
                              <span className="text-amber-400 font-bold font-mono">
                                {selectedObject.innerSpace3D !== undefined ? selectedObject.innerSpace3D : 10}px
                              </span>
                            </div>
                            <input
                              type="range"
                              min="2"
                              max="60"
                              step="1"
                              disabled={!selectedObject.hollowEnabled}
                              value={selectedObject.innerSpace3D !== undefined ? selectedObject.innerSpace3D : 10}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                const currentDepth = selectedObject.depth3D || 40;
                                const pts = selectedObject.originalPointsBackup || selectedObject.points;
                                if (pts) {
                                  const res = extrude2DTo3D(pts, selectedObject.fillColor, selectedObject.strokeColor, currentDepth, !!selectedObject.hollowEnabled, val, !!selectedObject.fillGaps3D, selectedObject.strokeWidth || 5);
                                  updateObject(selectedObject.id, {
                                    vertices3D: res.vertices,
                                    faces3D: res.faces,
                                    innerSpace3D: val
                                  });
                                }
                              }}
                              className="w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer disabled:opacity-30"
                            />
                          </div>

                          {/* Extrusion Depth Slider */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px] text-neutral-400">
                              <span>3D Extrusion Depth</span>
                              <span className="text-amber-400 font-bold font-mono">
                                {selectedObject.depth3D !== undefined ? selectedObject.depth3D : 40}px
                              </span>
                            </div>
                            <input
                              type="range"
                              min="5"
                              max="300"
                              step="5"
                              value={selectedObject.depth3D !== undefined ? selectedObject.depth3D : 40}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                const pts = selectedObject.originalPointsBackup || selectedObject.points;
                                const currentInner = selectedObject.innerSpace3D !== undefined ? selectedObject.innerSpace3D : 10;
                                if (pts) {
                                  const res = extrude2DTo3D(pts, selectedObject.fillColor, selectedObject.strokeColor, val, !!selectedObject.hollowEnabled, currentInner, !!selectedObject.fillGaps3D, selectedObject.strokeWidth || 5);
                                  updateObject(selectedObject.id, {
                                    vertices3D: res.vertices,
                                    faces3D: res.faces,
                                    depth3D: val
                                  });
                                }
                              }}
                              className="w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                        </div>

                        {/* FACE WORKBENCH */}
                        <div className="space-y-3.5 border-t border-neutral-800/60 pt-3">
                          <span className="text-[10px] text-amber-500 font-extrabold uppercase tracking-wider block">
                            Face Workbench
                          </span>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] text-neutral-400 shrink-0">Select Face</span>
                              <CustomSelect
                                value={String(selectedObject.selectedFaceIndex !== undefined ? selectedObject.selectedFaceIndex : -1)}
                                onChange={(val) => {
                                  const num = parseInt(val);
                                  updateObject(selectedObject.id, {
                                    selectedFaceIndex: num === -1 ? undefined : num
                                  });
                                }}
                                options={[
                                  { value: "-1", label: "None (Highlight Disabled)" },
                                  ...(selectedObject.faces3D || []).map((face, idx) => ({
                                    value: String(idx),
                                    label: `Face #${idx} (${face.indices.length}-sided, Color: ${face.fillColor})`
                                  }))
                                ]}
                                placeholder="None (Highlight Disabled)"
                                className="w-full"
                              />
                            </div>

                            {selectedObject.selectedFaceIndex !== undefined && (
                              <div className="bg-neutral-950/60 p-2.5 rounded-lg border border-amber-500/20 space-y-3 animate-fade-in">
                                <div className="text-[10px] text-amber-400 font-bold flex items-center justify-between">
                                  <span>Active Face: Face #{selectedObject.selectedFaceIndex}</span>
                                  <span className="text-[9px] text-neutral-500">Live Gold Outline</span>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  {/* Delete Face */}
                                  <button
                                    id="delete-face-btn"
                                    onClick={() => {
                                      const currentFaceIndex = selectedObject.selectedFaceIndex;
                                      if (currentFaceIndex === undefined || !selectedObject.faces3D) return;
                                      const updatedFaces = deleteFace3D(selectedObject.faces3D, currentFaceIndex);
                                      updateObject(selectedObject.id, {
                                        faces3D: updatedFaces,
                                        selectedFaceIndex: undefined
                                      });
                                    }}
                                    className="flex items-center justify-center gap-1 bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900/50 rounded-lg py-1.5 text-[10px] font-bold uppercase transition"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Delete Face
                                  </button>

                                  {/* Extrude Face */}
                                  <button
                                    id="extrude-face-btn"
                                    onClick={() => {
                                      const currentFaceIndex = selectedObject.selectedFaceIndex;
                                      if (currentFaceIndex === undefined || !selectedObject.vertices3D || !selectedObject.faces3D) return;
                                      const res = extrudeFace3D(selectedObject.vertices3D, selectedObject.faces3D, currentFaceIndex, faceExtrudeDist);
                                      updateObject(selectedObject.id, {
                                        vertices3D: res.vertices,
                                        faces3D: res.faces,
                                        selectedFaceIndex: undefined
                                      });
                                    }}
                                    className="flex items-center justify-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg py-1.5 text-[10px] font-bold uppercase transition"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    Extrude Face
                                  </button>
                                </div>

                                {/* Face Extrude Slider */}
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[9px] text-neutral-400">
                                    <span>Face Extrude Distance</span>
                                    <span className="text-amber-400 font-bold font-mono">{faceExtrudeDist}px</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="5"
                                    max="150"
                                    step="5"
                                    value={faceExtrudeDist}
                                    onChange={(e) => setFaceExtrudeDist(parseInt(e.target.value))}
                                    className="w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                                  />
                                </div>

                                {/* Face Color Palette */}
                                <div className="space-y-1.5">
                                  <span className="text-[9px] text-neutral-400 block">Paint Selected Face</span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F3F4F6', '#1F2937', '#B45309', '#111827'].map((color) => (
                                      <button
                                        key={color}
                                        onClick={() => {
                                          const currentFaceIndex = selectedObject.selectedFaceIndex;
                                          if (currentFaceIndex === undefined || !selectedObject.faces3D) return;
                                          const nextFaces = [...selectedObject.faces3D];
                                          nextFaces[currentFaceIndex] = {
                                            ...nextFaces[currentFaceIndex],
                                            baseColor: color,
                                            fillColor: color
                                          };
                                          updateObject(selectedObject.id, {
                                            faces3D: nextFaces
                                          });
                                        }}
                                        className="w-5 h-5 rounded border border-neutral-700/50 hover:scale-110 active:scale-95 transition"
                                        style={{ backgroundColor: color }}
                                        title={color}
                                      />
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* EDGE WORKBENCH */}
                        <div className="space-y-3.5 border-t border-neutral-800/60 pt-3">
                          <span className="text-[10px] text-amber-500 font-extrabold uppercase tracking-wider block">
                            Edge Workbench
                          </span>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] text-neutral-400 shrink-0">Select Edge</span>
                              {(() => {
                                const edgesList: [number, number][] = [];
                                if (selectedObject.faces3D) {
                                  const edgeSet = new Set<string>();
                                  selectedObject.faces3D.forEach(face => {
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
                                }
                                const selectOptions = [
                                  { value: "-1", label: "None (Highlight Disabled)" },
                                  ...edgesList.map((edge, idx) => ({
                                    value: String(idx),
                                    label: `Edge #${idx} (Vertices ${edge[0]}-${edge[1]})`
                                  }))
                                ];
                                return (
                                  <CustomSelect
                                    value={String(selectedObject.selectedEdgeIndex !== undefined ? selectedObject.selectedEdgeIndex : -1)}
                                    onChange={(val) => {
                                      const num = parseInt(val);
                                      updateObject(selectedObject.id, {
                                        selectedEdgeIndex: num === -1 ? undefined : num
                                      });
                                    }}
                                    options={selectOptions}
                                    placeholder="None (Highlight Disabled)"
                                    className="w-full"
                                  />
                                );
                              })()}
                            </div>

                            {selectedObject.selectedEdgeIndex !== undefined && (
                              <div className="bg-neutral-950/60 p-2.5 rounded-lg border border-amber-500/20 space-y-3 animate-fade-in">
                                {(() => {
                                  const edgesList: [number, number][] = [];
                                  if (selectedObject.faces3D) {
                                    const edgeSet = new Set<string>();
                                    selectedObject.faces3D.forEach(face => {
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
                                  }
                                  const currentEdge = edgesList[selectedObject.selectedEdgeIndex];
                                  if (!currentEdge) return null;

                                  return (
                                    <>
                                      <div className="text-[10px] text-amber-400 font-bold flex items-center justify-between">
                                        <span>Active Edge: Edge #{selectedObject.selectedEdgeIndex} (Verts {currentEdge[0]}-{currentEdge[1]})</span>
                                        <span className="text-[9px] text-neutral-500">Live Gold Line</span>
                                      </div>

                                      <button
                                        id="extrude-edge-btn"
                                        onClick={() => {
                                          const currentEdgeIndex = selectedObject.selectedEdgeIndex;
                                          if (currentEdgeIndex === undefined || !selectedObject.vertices3D || !selectedObject.faces3D) return;
                                          const [v0Idx, v1Idx] = currentEdge;
                                          const res = extrudeEdge3D(
                                            selectedObject.vertices3D,
                                            selectedObject.faces3D,
                                            v0Idx,
                                            v1Idx,
                                            edgeExtrudeDist,
                                            selectedObject.fillColor || '#F59E0B'
                                          );
                                          updateObject(selectedObject.id, {
                                            vertices3D: res.vertices,
                                            faces3D: res.faces,
                                            selectedEdgeIndex: undefined
                                          });
                                        }}
                                        className="w-full flex items-center justify-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg py-1.5 text-[10px] font-bold uppercase transition"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                        Extrude Selected Edge
                                      </button>

                                      {/* Edge Extrude Slider */}
                                      <div className="space-y-1">
                                        <div className="flex items-center justify-between text-[9px] text-neutral-400">
                                          <span>Edge Extrude Distance</span>
                                          <span className="text-amber-400 font-bold font-mono">{edgeExtrudeDist}px</span>
                                        </div>
                                        <input
                                          type="range"
                                          min="5"
                                          max="150"
                                          step="5"
                                          value={edgeExtrudeDist}
                                          onChange={(e) => setEdgeExtrudeDist(parseInt(e.target.value))}
                                          className="w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                                        />
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 3D TRANSLATION (X, Y, Z) */}
                      <div className="space-y-2.5">
                        <span className="text-[10px] text-neutral-400 block font-black uppercase tracking-wider">3D Translation</span>
                        
                        {/* Translation X */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span>Translation X (Horizontal)</span>
                            <span className="text-amber-400 font-bold font-mono">{selectedObject.transform3D.x}px</span>
                          </div>
                          <input
                            type="range"
                            min="-500"
                            max="500"
                            value={selectedObject.transform3D.x}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              updateObject(selectedObject.id, {
                                transform3D: { ...selectedObject.transform3D!, x: val }
                              });
                            }}
                            className="w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Translation Y */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span>Translation Y (Vertical)</span>
                            <span className="text-amber-400 font-bold font-mono">{selectedObject.transform3D.y}px</span>
                          </div>
                          <input
                            type="range"
                            min="-500"
                            max="500"
                            value={selectedObject.transform3D.y}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              updateObject(selectedObject.id, {
                                transform3D: { ...selectedObject.transform3D!, y: val }
                              });
                            }}
                            className="w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Translation Z (Depth) */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span>Translation Z (Depth Plane)</span>
                            <span className="text-amber-400 font-bold font-mono">{selectedObject.transform3D.z}px</span>
                          </div>
                          <input
                            type="range"
                            min="-250"
                            max="500"
                            value={selectedObject.transform3D.z}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              updateObject(selectedObject.id, {
                                transform3D: { ...selectedObject.transform3D!, z: val }
                              });
                            }}
                            className="w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                      </div>

                      {/* 3D EULER ROTATION (X, Y, Z) */}
                      <div className="space-y-2.5 border-t border-neutral-800/40 pt-3">
                        <span className="text-[10px] text-neutral-400 block font-black uppercase tracking-wider">3D Euler Rotation (Angles)</span>
                        
                        {/* Rotation X (Pitch) */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span>Pitch Angle (X Axis)</span>
                            <span className="text-amber-400 font-bold font-mono">{selectedObject.transform3D.rx}°</span>
                          </div>
                          <input
                            type="range"
                            min="-180"
                            max="180"
                            value={selectedObject.transform3D.rx}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              updateObject(selectedObject.id, {
                                transform3D: { ...selectedObject.transform3D!, rx: val }
                              });
                            }}
                            className="w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Rotation Y (Yaw) */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span>Yaw Angle (Y Axis)</span>
                            <span className="text-amber-400 font-bold font-mono">{selectedObject.transform3D.ry}°</span>
                          </div>
                          <input
                            type="range"
                            min="-180"
                            max="180"
                            value={selectedObject.transform3D.ry}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              updateObject(selectedObject.id, {
                                transform3D: { ...selectedObject.transform3D!, ry: val }
                              });
                            }}
                            className="w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Rotation Z (Roll) */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span>Roll Angle (Z Axis)</span>
                            <span className="text-amber-400 font-bold font-mono">{selectedObject.transform3D.rz}°</span>
                          </div>
                          <input
                            type="range"
                            min="-180"
                            max="180"
                            value={selectedObject.transform3D.rz}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              updateObject(selectedObject.id, {
                                transform3D: { ...selectedObject.transform3D!, rz: val }
                              });
                            }}
                            className="w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                      </div>

                      {/* 3D SCALE (X, Y, Z) */}
                      <div className="space-y-2.5 border-t border-neutral-800/40 pt-3">
                        <span className="text-[10px] text-neutral-400 block font-black uppercase tracking-wider">3D Mesh Scale Factor</span>
                        
                        {/* Scale X */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span>Scale X Factor</span>
                            <span className="text-amber-400 font-bold font-mono">{selectedObject.transform3D.sx}x</span>
                          </div>
                          <input
                            type="range"
                            min="0.1"
                            max="4"
                            step="0.05"
                            value={selectedObject.transform3D.sx}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              updateObject(selectedObject.id, {
                                transform3D: { ...selectedObject.transform3D!, sx: val }
                              });
                            }}
                            className="w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Scale Y */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span>Scale Y Factor</span>
                            <span className="text-amber-400 font-bold font-mono">{selectedObject.transform3D.sy}x</span>
                          </div>
                          <input
                            type="range"
                            min="0.1"
                            max="4"
                            step="0.05"
                            value={selectedObject.transform3D.sy}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              updateObject(selectedObject.id, {
                                transform3D: { ...selectedObject.transform3D!, sy: val }
                              });
                            }}
                            className="w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Scale Z */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span>Scale Z Factor</span>
                            <span className="text-amber-400 font-bold font-mono">{selectedObject.transform3D.sz}x</span>
                          </div>
                          <input
                            type="range"
                            min="0.1"
                            max="4"
                            step="0.05"
                            value={selectedObject.transform3D.sz}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              updateObject(selectedObject.id, {
                                transform3D: { ...selectedObject.transform3D!, sz: val }
                              });
                            }}
                            className="w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                      </div>

                      {/* 🌊 5 EXTRA 3D TRANSFORM DEPTH SLIDERS FOR 3D MESH */}
                      <div className="bg-gradient-to-r from-amber-950/40 to-indigo-950/40 p-3 rounded-xl border border-amber-500/40 space-y-3 shadow-md">
                        <div className="flex items-center justify-between">
                          <span className="text-[9.5px] text-amber-300 font-extrabold uppercase tracking-wider block">
                            ✨ 3D Depth & Organic Deformation (5 Sliders)
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              updateObject(selectedObject.id, {
                                transform3D: {
                                  ...selectedObject.transform3D!,
                                  depthTaper: 0,
                                  depthCurvature: 0,
                                  twistZ: 0,
                                  shearZ: 0,
                                  inflateDepth: 0
                                }
                              });
                            }}
                            className="px-1.5 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-[8.5px] font-bold text-amber-400 rounded border border-amber-500/30 transition cursor-pointer"
                          >
                            Reset
                          </button>
                        </div>

                        {/* 1. Depth Taper */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-neutral-300">
                            <span className="flex items-center gap-1 font-semibold">
                              <span>📐 Depth Taper (Conical Width)</span>
                            </span>
                            <span className="text-amber-400 font-bold font-mono">
                              {selectedObject.transform3D.depthTaper ?? 0}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min="-100"
                            max="100"
                            step="1"
                            value={selectedObject.transform3D.depthTaper ?? 0}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              updateObject(selectedObject.id, {
                                transform3D: { ...selectedObject.transform3D!, depthTaper: val }
                              });
                            }}
                            className="w-full accent-amber-400 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* 2. Depth Curvature Bend */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-neutral-300">
                            <span className="flex items-center gap-1 font-semibold">
                              <span>🌊 Depth Curvature (3D Z-Arc Bend)</span>
                            </span>
                            <span className="text-amber-400 font-bold font-mono">
                              {selectedObject.transform3D.depthCurvature ?? 0}°
                            </span>
                          </div>
                          <input
                            type="range"
                            min="-180"
                            max="180"
                            step="1"
                            value={selectedObject.transform3D.depthCurvature ?? 0}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              updateObject(selectedObject.id, {
                                transform3D: { ...selectedObject.transform3D!, depthCurvature: val }
                              });
                            }}
                            className="w-full accent-amber-400 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* 3. Twist Z */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-neutral-300">
                            <span className="flex items-center gap-1 font-semibold">
                              <span>🌀 3D Twist Z (Helical Ribbon)</span>
                            </span>
                            <span className="text-amber-400 font-bold font-mono">
                              {selectedObject.transform3D.twistZ ?? 0}°
                            </span>
                          </div>
                          <input
                            type="range"
                            min="-360"
                            max="360"
                            step="5"
                            value={selectedObject.transform3D.twistZ ?? 0}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              updateObject(selectedObject.id, {
                                transform3D: { ...selectedObject.transform3D!, twistZ: val }
                              });
                            }}
                            className="w-full accent-amber-400 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* 4. Shear Z Skew */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-neutral-300">
                            <span className="flex items-center gap-1 font-semibold">
                              <span>↗️ Depth Shear Z (Diagonal Skew)</span>
                            </span>
                            <span className="text-amber-400 font-bold font-mono">
                              {selectedObject.transform3D.shearZ ?? 0}px
                            </span>
                          </div>
                          <input
                            type="range"
                            min="-100"
                            max="100"
                            step="1"
                            value={selectedObject.transform3D.shearZ ?? 0}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              updateObject(selectedObject.id, {
                                transform3D: { ...selectedObject.transform3D!, shearZ: val }
                              });
                            }}
                            className="w-full accent-amber-400 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* 5. Inflate Bulge Puff Depth */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-neutral-300">
                            <span className="flex items-center gap-1 font-semibold">
                              <span>🎈 Inflate Bulge (Puff 3D Volume)</span>
                            </span>
                            <span className="text-amber-400 font-bold font-mono">
                              {selectedObject.transform3D.inflateDepth ?? 0}px
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={selectedObject.transform3D.inflateDepth ?? 0}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              updateObject(selectedObject.id, {
                                transform3D: { ...selectedObject.transform3D!, inflateDepth: val }
                              });
                            }}
                            className="w-full accent-amber-400 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                      </div>

                      {/* SKELETAL BONE RIGGING STUDIO */}
                      <div className="space-y-3.5 border-t border-neutral-800/40 pt-3.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-amber-400 font-black uppercase tracking-wider flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                            Skeletal Mesh Rigging Studio
                          </span>
                          <span className="text-[8px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded font-bold uppercase">
                            Single Mesh LBS
                          </span>
                        </div>

                        <p className="text-[10px] text-neutral-400 leading-normal font-medium">
                          Rig your custom single 3D mesh by adding skeletal bones between vertices. Vertices will deform organically around joints based on bones' angles!
                        </p>

                        {/* List Active Bones */}
                        <div className="space-y-3">
                          <span className="text-[9px] text-neutral-400 font-black uppercase block tracking-wider">Active Bone Joints</span>
                          
                          {!selectedObject.bones3D || selectedObject.bones3D.length === 0 ? (
                            <div className="text-center py-4 bg-neutral-950/60 rounded-xl border border-neutral-850 border-dashed text-[10px] font-bold text-neutral-500">
                              No skeletal bone joints rigged yet. Add bone joints below!
                            </div>
                          ) : (
                            selectedObject.bones3D.map((bone: any, bIdx: number) => (
                              <div key={bone.id || bIdx} className="bg-neutral-950/80 p-3 rounded-xl border border-neutral-850 space-y-2.5">
                                <div className="flex items-center justify-between border-b border-neutral-900/60 pb-1.5">
                                  <span className="text-[10px] font-black text-amber-300 uppercase truncate">
                                    🦴 {bone.name || `Bone_${bIdx + 1}`}
                                  </span>
                                  <span className="text-[8.5px] font-mono text-neutral-500">
                                    Verts: {bone.startVertexIdx} ➔ {bone.endVertexIdx}
                                  </span>
                                </div>

                                {/* Slider for pitch */}
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[9px] text-neutral-400">
                                    <span>Joint Pitch (rx)</span>
                                    <span className="text-amber-400 font-bold font-mono">{bone.rx}°</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="-180"
                                    max="180"
                                    value={bone.rx || 0}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value);
                                      const newBones = [...(selectedObject.bones3D || [])];
                                      newBones[bIdx] = { ...newBones[bIdx], rx: val };
                                      updateObject(selectedObject.id, { bones3D: newBones });
                                    }}
                                    className="w-full accent-amber-500 h-1 bg-neutral-800 rounded appearance-none cursor-pointer"
                                  />
                                </div>

                                {/* Slider for yaw */}
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[9px] text-neutral-400">
                                    <span>Joint Yaw (ry)</span>
                                    <span className="text-amber-400 font-bold font-mono">{bone.ry || 0}°</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="-180"
                                    max="180"
                                    value={bone.ry || 0}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value);
                                      const newBones = [...(selectedObject.bones3D || [])];
                                      newBones[bIdx] = { ...newBones[bIdx], ry: val };
                                      updateObject(selectedObject.id, { bones3D: newBones });
                                    }}
                                    className="w-full accent-amber-500 h-1 bg-neutral-800 rounded appearance-none cursor-pointer"
                                  />
                                </div>

                                {/* Slider for roll */}
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[9px] text-neutral-400">
                                    <span>Joint Roll (rz)</span>
                                    <span className="text-amber-400 font-bold font-mono">{bone.rz || 0}°</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="-180"
                                    max="180"
                                    value={bone.rz || 0}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value);
                                      const newBones = [...(selectedObject.bones3D || [])];
                                      newBones[bIdx] = { ...newBones[bIdx], rz: val };
                                      updateObject(selectedObject.id, { bones3D: newBones });
                                    }}
                                    className="w-full accent-amber-500 h-1 bg-neutral-800 rounded appearance-none cursor-pointer"
                                  />
                                </div>

                                <button
                                  onClick={() => {
                                    const newBones = (selectedObject.bones3D || []).filter((_: any, idx: number) => idx !== bIdx);
                                    updateObject(selectedObject.id, { bones3D: newBones });
                                  }}
                                  className="w-full py-1 text-[8.5px] bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-black rounded-lg transition-all active:scale-95"
                                >
                                  REMOVE BONE
                                </button>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Add New Bone Controller */}
                        <div className="bg-neutral-900/50 p-3 rounded-xl border border-neutral-850 space-y-3">
                          <span className="text-[9.5px] text-amber-400 font-black uppercase block tracking-wider">
                            + ADD NEW BONE SEGMENT
                          </span>

                          {/* Bone Name */}
                          <div className="space-y-1">
                            <label className="text-[8.5px] text-neutral-500 font-bold uppercase block">Bone Label / Part Name</label>
                            <input
                              type="text"
                              id="new-bone-name"
                              placeholder="e.g. Right Arm Joint"
                              className="w-full px-2.5 py-1.5 bg-neutral-950 border border-neutral-850 rounded-lg text-[10px] font-bold text-neutral-200 outline-none focus:border-amber-500/60"
                            />
                          </div>

                          {/* Choose start & end vertices dynamically based on total vertices of model */}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[8px] text-neutral-500 font-bold uppercase block">Start Joint Vert</label>
                              <input
                                type="number"
                                id="new-bone-start"
                                min="0"
                                max={Math.max(0, (selectedObject.vertices3D?.length || 1) - 1)}
                                defaultValue="0"
                                className="w-full px-2 py-1 bg-neutral-950 border border-neutral-850 rounded text-[10px] font-mono text-amber-400 font-bold"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[8px] text-neutral-500 font-bold uppercase block">End Joint Vert</label>
                              <input
                                type="number"
                                id="new-bone-end"
                                min="0"
                                max={Math.max(0, (selectedObject.vertices3D?.length || 1) - 1)}
                                defaultValue="3"
                                className="w-full px-2 py-1 bg-neutral-950 border border-neutral-850 rounded text-[10px] font-mono text-amber-400 font-bold"
                              />
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              const nameInput = document.getElementById('new-bone-name') as HTMLInputElement;
                              const startInput = document.getElementById('new-bone-start') as HTMLInputElement;
                              const endInput = document.getElementById('new-bone-end') as HTMLInputElement;

                              const name = nameInput?.value || `Bone_${(selectedObject.bones3D || []).length + 1}`;
                              const startVal = parseInt(startInput?.value || '0');
                              const endVal = parseInt(endInput?.value || '3');

                              const newBone = {
                                id: `bone_${Date.now()}`,
                                name,
                                rx: 0,
                                ry: 0,
                                rz: 0,
                                startVertexIdx: startVal,
                                endVertexIdx: endVal
                              };

                              const existingBones = [...(selectedObject.bones3D || [])];
                              existingBones.push(newBone);
                              updateObject(selectedObject.id, { bones3D: existingBones });

                              if (nameInput) nameInput.value = '';
                              alert(`Organically rigged "${name}" bone joint connecting vertices ${startVal} ➔ ${endVal}! Use the bone sliders above to rotate & deform the 3D mesh.`);
                            }}
                            className="w-full py-1.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black rounded-lg transition-all active:scale-95 text-[10px]"
                          >
                            CONNECT SKELETAL BONE
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Color Picker Sub-section */}
                  <div className="pt-2 border-t border-neutral-800/40 space-y-2">
                    <span className="text-xs text-neutral-400 block font-bold">Stroke & Fill Colors</span>
                    
                    {/* Stroke Color */}
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-neutral-500">Stroke Color</span>
                      <div className="flex items-center gap-2">
                        <CustomColorPicker
                          color={selectedObject.strokeColor || '#000000'}
                          onChange={(c) => updateObject(selectedObject.id, { strokeColor: c })}
                        />
                        <input
                          type="text"
                          value={selectedObject.strokeColor || ''}
                          onChange={(e) => updateObject(selectedObject.id, { strokeColor: e.target.value })}
                          className="bg-neutral-950 border border-neutral-800 text-[10px] px-2 py-1 rounded text-white font-mono w-20 outline-none"
                        />
                      </div>
                    </div>

                    {/* Fill Color */}
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-neutral-500">Fill Color</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedObject) {
                              const selectedSubMap = globalLassoSelectedMap[selectedObject.id]?.subPaths || {};
                              if (Object.keys(selectedSubMap).length > 0) {
                                const allSubs = extractAllSubPaths(selectedObject);
                                const nextSubPathFills = { ...(selectedObject.subPathFills || {}) };
                                Object.keys(selectedSubMap).forEach(subIdxStr => {
                                  delete nextSubPathFills[parseInt(subIdxStr, 10)];
                                });
                                updateObject(selectedObject.id, {
                                  subPaths: selectedObject.subPaths && selectedObject.subPaths.length > 0 ? selectedObject.subPaths : allSubs,
                                  subPathFills: nextSubPathFills
                                });
                              } else {
                                updateObject(selectedObject.id, { fillColor: 'transparent' });
                              }
                            }
                          }}
                          className={`text-[9px] px-1.5 py-1 rounded font-bold border ${
                            selectedObject.fillColor === 'transparent'
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                              : 'bg-neutral-900 text-neutral-400 border-neutral-800'
                          }`}
                        >
                          None
                        </button>
                        <CustomColorPicker
                          disabled={selectedObject.fillColor === 'transparent'}
                          color={selectedObject.fillColor === 'transparent' ? '#ffffff' : (selectedObject.fillColor || '#ffffff')}
                          onChange={(color) => {
                            if (!selectedObject) return;
                            const selectedSubMap = globalLassoSelectedMap[selectedObject.id]?.subPaths || {};
                            if (Object.keys(selectedSubMap).length > 0) {
                              const allSubs = extractAllSubPaths(selectedObject);
                              const nextSubPathFills = { ...(selectedObject.subPathFills || {}) };
                              Object.keys(selectedSubMap).forEach(subIdxStr => {
                                nextSubPathFills[parseInt(subIdxStr, 10)] = color;
                              });
                              updateObject(selectedObject.id, {
                                subPaths: selectedObject.subPaths && selectedObject.subPaths.length > 0 ? selectedObject.subPaths : allSubs,
                                subPathFills: nextSubPathFills
                              });
                            } else {
                              updateObject(selectedObject.id, { fillColor: color });
                            }
                          }}
                        />
                        <input
                          type="text"
                          value={selectedObject.fillColor || ''}
                          onChange={(e) => {
                            if (!selectedObject) return;
                            const color = e.target.value;
                            const selectedSubMap = globalLassoSelectedMap[selectedObject.id]?.subPaths || {};
                            if (Object.keys(selectedSubMap).length > 0) {
                              const allSubs = extractAllSubPaths(selectedObject);
                              const nextSubPathFills = { ...(selectedObject.subPathFills || {}) };
                              Object.keys(selectedSubMap).forEach(subIdxStr => {
                                nextSubPathFills[parseInt(subIdxStr, 10)] = color;
                              });
                              updateObject(selectedObject.id, {
                                subPaths: selectedObject.subPaths && selectedObject.subPaths.length > 0 ? selectedObject.subPaths : allSubs,
                                subPathFills: nextSubPathFills
                              });
                            } else {
                              updateObject(selectedObject.id, { fillColor: color });
                            }
                          }}
                          className="bg-neutral-950 border border-neutral-800 text-[10px] px-2 py-1 rounded text-white font-mono w-20 outline-none"
                        />
                      </div>
                    </div>

                    {/* Preset Swatches for Fill Color */}
                    <div className="flex flex-wrap gap-1.5 pt-1 justify-end">
                      {['#FF5722', '#4CAF50', '#2196F3', '#9C27B0', '#FFEB3B', '#FF9800', '#000000', '#ffffff'].map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => {
                            if (!selectedObject) return;
                            const selectedSubMap = globalLassoSelectedMap[selectedObject.id]?.subPaths || {};
                            if (Object.keys(selectedSubMap).length > 0) {
                              const allSubs = extractAllSubPaths(selectedObject);
                              const nextSubPathFills = { ...(selectedObject.subPathFills || {}) };
                              Object.keys(selectedSubMap).forEach(subIdxStr => {
                                nextSubPathFills[parseInt(subIdxStr, 10)] = color;
                              });
                              updateObject(selectedObject.id, {
                                subPaths: selectedObject.subPaths && selectedObject.subPaths.length > 0 ? selectedObject.subPaths : allSubs,
                                subPathFills: nextSubPathFills
                              });
                            } else {
                              updateObject(selectedObject.id, { fillColor: color });
                            }
                          }}
                          style={{ backgroundColor: color }}
                          className="w-4 h-4 rounded-full border border-neutral-700 hover:scale-110 active:scale-90 transition-transform"
                          title={`Set Fill to ${color}`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Selected Object / Active Point Adjustments & Effects Sub-section */}
                  <div className="pt-3 border-t border-neutral-800/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-amber-400 font-black uppercase tracking-wider flex items-center gap-1.5">
                        <Feather className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                        {selNode ? `Adjust Selected Point #${(selNodeIdx ?? 0) + 1} Style` : 'Adjust Selected Drawing Style'}
                      </span>
                      {selNode && (
                        <span className="text-[9px] bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.5 rounded border border-amber-500/30">
                          Local Stroke Area
                        </span>
                      )}
                    </div>

                    {/* Thickness / Stroke Width Slider */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wide">
                          {selNode ? 'Captured Area Stroke Thickness' : 'Drawing Thickness / Width'}
                        </span>
                        <span className="text-amber-400 font-black text-[10px]">
                          {selNode ? (selNode.width || selNode.radius || selectedObject.strokeWidth || 5) : selectedObject.strokeWidth}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="500"
                        step="0.5"
                        value={selNode ? (selNode.width || selNode.radius || selectedObject.strokeWidth || 5) : (selectedObject.strokeWidth || 5)}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (selNode && vdfState && selNodeIdx !== undefined && vdfState.nodes) {
                            const updatedNodes = [...vdfState.nodes];
                            updatedNodes[selNodeIdx] = {
                              ...updatedNodes[selNodeIdx],
                              width: val,
                              radius: val
                            };
                            updateObject(selectedObject.id, {
                              customVectorDeformState: { ...vdfState, nodes: updatedNodes }
                            });
                          } else {
                            updateObject(selectedObject.id, { strokeWidth: val });
                          }
                        }}
                        className="w-full h-1 bg-neutral-950 rounded-lg appearance-none cursor-pointer accent-amber-500"
                      />
                      <div className="flex items-center gap-1 pt-1">
                        {[2, 10, 30, 80, 150, 300, 500].map((w) => (
                          <button
                            key={w}
                            type="button"
                            onClick={() => {
                              if (selNode && vdfState && selNodeIdx !== undefined && vdfState.nodes) {
                                const updatedNodes = [...vdfState.nodes];
                                updatedNodes[selNodeIdx] = {
                                  ...updatedNodes[selNodeIdx],
                                  width: w,
                                  radius: w
                                };
                                updateObject(selectedObject.id, {
                                  customVectorDeformState: { ...vdfState, nodes: updatedNodes }
                                });
                              } else {
                                updateObject(selectedObject.id, { strokeWidth: w });
                              }
                            }}
                            className={`flex-1 py-0.5 text-[8.5px] font-mono font-bold rounded border ${
                              (selNode ? (selNode.width || selNode.radius || selectedObject.strokeWidth) : selectedObject.strokeWidth) === w
                                ? 'bg-amber-500 text-neutral-950 border-amber-400'
                                : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-neutral-200'
                            }`}
                          >
                            {w}px
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Opacity Slider */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wide">
                          {selNode ? 'Captured Area Opacity' : 'Drawing Opacity'}
                        </span>
                        <span className="text-amber-400 font-black text-[10px]">
                          {Math.round(((selNode && selNode.opacity !== undefined ? selNode.opacity : (selectedObject.opacity !== undefined ? selectedObject.opacity : 1))) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.05"
                        max="1"
                        step="0.01"
                        value={selNode && selNode.opacity !== undefined ? selNode.opacity : (selectedObject.opacity !== undefined ? selectedObject.opacity : 1)}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (selNode && vdfState && selNodeIdx !== undefined && vdfState.nodes) {
                            const updatedNodes = [...vdfState.nodes];
                            updatedNodes[selNodeIdx] = {
                              ...updatedNodes[selNodeIdx],
                              opacity: val
                            };
                            updateObject(selectedObject.id, {
                              customVectorDeformState: { ...vdfState, nodes: updatedNodes }
                            });
                          } else {
                            updateObject(selectedObject.id, { opacity: val });
                          }
                        }}
                        className="w-full h-1 bg-neutral-950 rounded-lg appearance-none cursor-pointer accent-amber-500"
                      />
                    </div>

                    {/* Stroke / Color Opacity Slider */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wide">Drawing Color Opacity</span>
                        <span className="text-amber-400 font-black text-[10px]">{Math.round((selectedObject.strokeOpacity !== undefined ? selectedObject.strokeOpacity : 1) * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.05"
                        max="1"
                        step="0.01"
                        value={selectedObject.strokeOpacity !== undefined ? selectedObject.strokeOpacity : 1}
                        onChange={(e) => updateObject(selectedObject.id, { strokeOpacity: parseFloat(e.target.value) })}
                        className="w-full h-1 bg-neutral-950 rounded-lg appearance-none cursor-pointer accent-amber-500"
                      />
                    </div>

                    {/* Blur Effect Slider */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-neutral-400 font-bold uppercase">
                          {selNode ? 'Captured Area Blur Effect' : 'Blur Effect'}
                        </span>
                        <span className="text-amber-400 font-black text-[10px]">
                          {selNode ? (selNode.blur || 0) : (selectedObject.blur || 0)}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="30"
                        step="0.5"
                        value={selNode ? (selNode.blur || 0) : (selectedObject.blur || 0)}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (selNode && vdfState && selNodeIdx !== undefined && vdfState.nodes) {
                            const updatedNodes = [...vdfState.nodes];
                            updatedNodes[selNodeIdx] = {
                              ...updatedNodes[selNodeIdx],
                              blur: val
                            };
                            updateObject(selectedObject.id, {
                              customVectorDeformState: { ...vdfState, nodes: updatedNodes }
                            });
                          } else {
                            updateObject(selectedObject.id, { blur: val });
                          }
                        }}
                        className="w-full h-1 bg-neutral-950 rounded-lg appearance-none cursor-pointer accent-amber-500"
                      />
                    </div>

                    {/* Fill Color Active Toggle */}
                    <div className="flex items-center justify-between py-1.5 bg-neutral-950/30 px-2 rounded-lg border border-neutral-800/40">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-neutral-300 font-bold uppercase">Apply Fill Color</span>
                        <span className="text-[8px] text-neutral-500">If disabled, drawing fill is transparent</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedObject.fillColor !== 'transparent'}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            updateObject(selectedObject.id, {
                              fillColor: isChecked ? '#ffffff' : 'transparent'
                            });
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-400 after:border-neutral-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500 peer-checked:after:bg-white" />
                      </label>
                    </div>


                  </div>

                  {/* Pin to Smart Controls Switch */}
                  <div className="flex items-center justify-between pt-2 border-t border-neutral-800/40">
                    <span className="text-xs text-neutral-400 font-bold">Pin to Smart Controls</span>
                    <button
                      onClick={() => toggleSmartPin(selectedObject.id)}
                      className={`text-[10px] uppercase font-black px-2.5 py-1 rounded-lg transition-colors border ${
                        smartPinnedIds.includes(selectedObject.id)
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          : 'bg-neutral-950 text-neutral-500 border-neutral-800'
                      }`}
                    >
                      {smartPinnedIds.includes(selectedObject.id) ? 'PINNED' : 'PIN SC'}
                    </button>
                  </div>
                </div>

                {/* MAKE SINGLE / MERGE DRAWINGS CARD */}
                <div className="space-y-3 bg-neutral-950/40 p-3.5 rounded-2xl border border-neutral-800/50 relative">
                  <div className="flex items-center justify-between border-b border-neutral-800/40 pb-2">
                    <div className="text-[10px] text-amber-400 font-black uppercase tracking-wider flex items-center gap-1.5 font-bold">
                      <GitMerge className="w-3.5 h-3.5 text-amber-500" />
                      <span>MAKE SINGLE</span>
                    </div>
                    
                    <div className="relative">
                      <button
                        id="btn-add-merge-piece"
                        onClick={() => setIsMergeDropdownOpen(!isMergeDropdownOpen)}
                        className="p-1 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 text-amber-500 hover:text-amber-400 transition-all flex items-center justify-center cursor-pointer"
                        title="Add Drawing Piece to Merge"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>

                      {isMergeDropdownOpen && (
                        <div className="absolute right-0 mt-1 w-56 bg-neutral-950 border border-neutral-800 rounded-xl shadow-xl z-50 overflow-hidden py-1 max-h-48 overflow-y-auto">
                          {(() => {
                            const availableDrawings = Object.values(objects).filter(obj => 
                              obj.id !== selectedObject.id && 
                              !mergePieces.includes(obj.id)
                            );
                            
                            if (availableDrawings.length === 0) {
                              return (
                                <div className="text-[10px] text-neutral-500 py-2 px-3 text-center">
                                  No other drawings available on canvas.
                                </div>
                              );
                            }
                            
                            return availableDrawings.map(obj => (
                              <button
                                key={obj.id}
                                onClick={() => {
                                  setMergePieces([...mergePieces, obj.id]);
                                  setIsMergeDropdownOpen(false);
                                }}
                                className="w-full text-left px-3 py-1.5 hover:bg-neutral-900 text-neutral-300 hover:text-white text-[11px] transition-colors flex items-center gap-1.5 font-semibold"
                              >
                                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: obj.strokeColor || '#000000' }} />
                                <span className="truncate">{obj.name || `Drawing (${obj.id.slice(-4)})`}</span>
                              </button>
                            ));
                          })()}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] text-neutral-500 block uppercase font-bold tracking-wide">Selected Pieces:</span>
                    {mergePieces.length === 0 ? (
                      <div className="text-[10px] text-neutral-400 italic py-1">
                        No pieces added yet. Click + to add other drawing pieces.
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                        {mergePieces.map(pieceId => {
                          const piece = objects[pieceId];
                          if (!piece) return null;
                          return (
                            <div key={pieceId} className="flex items-center justify-between bg-neutral-900/60 border border-neutral-800/40 px-2 py-1 rounded-lg text-[11px]">
                              <span className="text-neutral-300 font-medium truncate max-w-[150px]">{piece.name}</span>
                              <button
                                onClick={() => setMergePieces(mergePieces.filter(id => id !== pieceId))}
                                className="text-neutral-500 hover:text-rose-400 transition-colors"
                                title="Remove piece"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {mergePieces.length > 0 && (
                    <button
                      id="btn-execute-make-single"
                      onClick={handleMakeSingle}
                      className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black rounded-xl transition-all shadow-md shadow-amber-500/10 text-xs flex items-center justify-center gap-1.5 mt-2 cursor-pointer animate-fade-in"
                    >
                      <GitMerge className="w-3.5 h-3.5" />
                      MAKE SINGLE DRAWING
                    </button>
                  )}
                </div>

                {/* Smooth X, Y Sliders (always visible, disabled if not independent or closed rigged) */}
                {(selectedObject || isLassoActive) && (() => {
                  const isRigged = selectedObject ? (!!selectedObject.parentId || bones.some(b => b.startObjectId === selectedObject.id || b.endObjectId === selectedObject.id)) : false;
                  const hasClosedEdgesSelf = selectedObject ? (selectedObject.type === 'shape' && selectedObject.shapeType !== 'line') : false;
                  const hasClosedEdgesParent = selectedObject ? !!(selectedObject.parentId && objects[selectedObject.parentId] && objects[selectedObject.parentId].type === 'shape' && objects[selectedObject.parentId].shapeType !== 'line') : false;
                  const isSmoothMoveEnabled = isLassoActive || !isRigged || hasClosedEdgesSelf || hasClosedEdgesParent;

                  return (
                    <div className={`space-y-4 bg-amber-500/5 p-4 rounded-2xl border transition-all duration-300 shadow-lg shadow-black/20 ${
                      isSmoothMoveEnabled ? 'border-amber-400/20' : 'border-neutral-800 opacity-60'
                    }`}>
                      <div className="text-[10px] text-amber-400 font-black uppercase tracking-wider flex items-center justify-between pb-2 border-b border-amber-500/10">
                        <div className="flex items-center gap-1.5">
                          <Move className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                          <span>SMOOTH POSITION</span>
                        </div>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-black ${
                          !isRigged 
                            ? 'bg-emerald-500/20 text-emerald-400' 
                            : isSmoothMoveEnabled 
                              ? 'bg-amber-500/20 text-amber-400 font-black' 
                              : 'bg-neutral-800 text-neutral-500 font-bold'
                        }`}>
                          {!isRigged 
                            ? 'INDEPENDENT' 
                            : isSmoothMoveEnabled 
                              ? 'RIGGED (CLOSED EDGES)' 
                              : 'DISABLED FOR RIGGED'}
                        </span>
                      </div>

                      {/* Slider: Translate X */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-neutral-400">{isLassoActive ? 'Lasso Region X Nudge' : isDeformPointActive ? 'Point Translate X' : 'Smooth Translate X'}</span>
                          <span className="text-white font-bold">{currentTransformObj ? currentTransformObj.x.toFixed(1) : '0.0'}px</span>
                        </div>
                        <input
                          type="range"
                          min="-500"
                          max="1500"
                          step="0.5"
                          disabled={!isLassoActive && !isSmoothMoveEnabled && !isDeformPointActive}
                          value={currentTransformObj ? currentTransformObj.x : 0}
                          onChange={(e) => handleSliderChange('x', Number(e.target.value))}
                          className="w-full accent-amber-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        />
                        <div className="flex items-center justify-between gap-1.5 pt-0.5">
                          <button
                            disabled={!isLassoActive && !isSmoothMoveEnabled && !isDeformPointActive}
                            onClick={() => handleNudge('x', -10)}
                            className="flex-1 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
                          >
                            -10px
                          </button>
                          <button
                            disabled={!isLassoActive && !isSmoothMoveEnabled && !isDeformPointActive}
                            onClick={() => handleNudge('x', -1)}
                            className="flex-1 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
                          >
                            -1px
                          </button>
                          <button
                            disabled={!isLassoActive && !isSmoothMoveEnabled && !isDeformPointActive}
                            onClick={() => handleNudge('x', 1)}
                            className="flex-1 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
                          >
                            +1px
                          </button>
                          <button
                            disabled={!isLassoActive && !isSmoothMoveEnabled && !isDeformPointActive}
                            onClick={() => handleNudge('x', 10)}
                            className="flex-1 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
                          >
                            +10px
                          </button>
                        </div>
                      </div>

                      {/* Slider: Translate Y */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-neutral-400">{isLassoActive ? 'Lasso Region Y Nudge' : isDeformPointActive ? 'Point Translate Y' : 'Smooth Translate Y'}</span>
                          <span className="text-white font-bold">{currentTransformObj ? currentTransformObj.y.toFixed(1) : '0.0'}px</span>
                        </div>
                        <input
                          type="range"
                          min="-500"
                          max="1500"
                          step="0.5"
                          disabled={!isLassoActive && !isSmoothMoveEnabled && !isDeformPointActive}
                          value={currentTransformObj ? currentTransformObj.y : 0}
                          onChange={(e) => handleSliderChange('y', Number(e.target.value))}
                          className="w-full accent-amber-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        />
                        <div className="flex items-center justify-between gap-1.5 pt-0.5">
                          <button
                            disabled={!isLassoActive && !isSmoothMoveEnabled && !isDeformPointActive}
                            onClick={() => handleNudge('y', -10)}
                            className="flex-1 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
                          >
                            -10px
                          </button>
                          <button
                            disabled={!isLassoActive && !isSmoothMoveEnabled && !isDeformPointActive}
                            onClick={() => handleNudge('y', -1)}
                            className="flex-1 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
                          >
                            -1px
                          </button>
                          <button
                            disabled={!isLassoActive && !isSmoothMoveEnabled && !isDeformPointActive}
                            onClick={() => handleNudge('y', 1)}
                            className="flex-1 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
                          >
                            +1px
                          </button>
                          <button
                            disabled={!isLassoActive && !isSmoothMoveEnabled && !isDeformPointActive}
                            onClick={() => handleNudge('y', 10)}
                            className="flex-1 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
                          >
                            +10px
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Transform Sliders & Click Buttons */}
                <div className="space-y-4">
                  <div className="text-[10px] text-neutral-500 font-black uppercase tracking-wider flex items-center gap-1">
                    <Maximize2 className="w-3.5 h-3.5 text-amber-500" />
                    TRANSFORMS (PRECISION){' '}
                    {isDeformPointActive ? (
                      <span className="text-[9px] text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded ml-auto">
                        POINT #{selectedDeformPointIndex} ({selectedDeformPointType?.toUpperCase()}) SELECTED
                      </span>
                    ) : isLassoActive ? (
                      <span className="text-[9px] text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded ml-auto">
                        LASSO SELECTED
                      </span>
                    ) : null}
                  </div>

                  {/* Slider: Rotate */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-400">Rotation</span>
                      <span className="text-white font-bold">{(currentTransformObj?.rotation ?? 0)}°</span>
                    </div>
                    <input
                      type="range"
                      min="-360"
                      max="360"
                      value={currentTransformObj?.rotation ?? 0}
                      onChange={(e) => handleSliderChange('rotation', Number(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                    <div className="flex items-center justify-between gap-1.5 pt-0.5">
                      <button
                        onClick={() => handleNudge('rotation', -5)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        -5°
                      </button>
                      <button
                        onClick={() => handleNudge('rotation', -1)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        -1°
                      </button>
                      <button
                        onClick={() => handleNudge('rotation', 1)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        +1°
                      </button>
                      <button
                        onClick={() => handleNudge('rotation', 5)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        +5°
                      </button>
                    </div>
                  </div>

                  {/* Slider: Scale X */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-400">Scale X (Width)</span>
                      <span className="text-white font-bold">{(currentTransformObj?.scaleX ?? 1).toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="4"
                      step="0.05"
                      value={currentTransformObj?.scaleX ?? 1}
                      onChange={(e) => handleSliderChange('scaleX', Number(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                    <div className="flex items-center justify-between gap-1.5 pt-0.5">
                      <button
                        onClick={() => handleNudge('scaleX', -0.1)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        -0.1
                      </button>
                      <button
                        onClick={() => handleNudge('scaleX', 0.1)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        +0.1
                      </button>
                    </div>
                  </div>

                  {/* Slider: Scale Y */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-400">Scale Y (Height)</span>
                      <span className="text-white font-bold">{(currentTransformObj?.scaleY ?? 1).toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="4"
                      step="0.05"
                      value={currentTransformObj?.scaleY ?? 1}
                      onChange={(e) => handleSliderChange('scaleY', Number(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                    <div className="flex items-center justify-between gap-1.5 pt-0.5">
                      <button
                        onClick={() => handleNudge('scaleY', -0.1)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        -0.1
                      </button>
                      <button
                        onClick={() => handleNudge('scaleY', 0.1)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        +0.1
                      </button>
                    </div>
                  </div>

                  {/* Slider: Skew X */}
                  <div className="space-y-1 pt-1 border-t border-neutral-800/30">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-400">Skew X (horizontal skew)</span>
                      <span className="text-white font-bold">{(currentTransformObj?.skewX ?? 0)}°</span>
                    </div>
                    <input
                      type="range"
                      min="-60"
                      max="60"
                      step="1"
                      value={currentTransformObj?.skewX ?? 0}
                      onChange={(e) => handleSliderChange('skewX', Number(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                    <div className="flex items-center justify-between gap-1.5 pt-0.5">
                      <button
                        onClick={() => handleNudge('skewX', -5)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        -5°
                      </button>
                      <button
                        onClick={() => handleNudge('skewX', 5)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        +5°
                      </button>
                    </div>
                  </div>

                  {/* Slider: Skew Y */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-400">Skew Y (vertical skew)</span>
                      <span className="text-white font-bold">{(currentTransformObj?.skewY ?? 0)}°</span>
                    </div>
                    <input
                      type="range"
                      min="-60"
                      max="60"
                      step="1"
                      value={currentTransformObj?.skewY ?? 0}
                      onChange={(e) => handleSliderChange('skewY', Number(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                    <div className="flex items-center justify-between gap-1.5 pt-0.5">
                      <button
                        onClick={() => handleNudge('skewY', -5)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        -5°
                      </button>
                      <button
                        onClick={() => handleNudge('skewY', 5)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        +5°
                      </button>
                    </div>
                  </div>

                  {/* 🎥 3D VIEW & DUAL-AXIS ROTATION SECTION */}
                  <div className="space-y-3 pt-2 border-t border-neutral-800/30">
                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-400">
                      <span>🎥 3D View & Rotation System</span>
                    </div>

                    {/* Camera Angle X (Up/Down View) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-400">Camera Angle View (Up-Down Tilt)</span>
                        <span className="text-white font-bold">{(currentTransformObj?.cameraAngleX ?? 0)}°</span>
                      </div>
                      <input
                        type="range"
                        min="-90"
                        max="90"
                        step="1"
                        value={currentTransformObj?.cameraAngleX ?? 0}
                        onChange={(e) => handleSliderChange('cameraAngleX', Number(e.target.value))}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                      <div className="flex items-center justify-between gap-1.5 pt-0.5">
                        <button
                          onClick={() => handleNudge('cameraAngleX', -5)}
                          className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                        >
                          -5°
                        </button>
                        <button
                          onClick={() => handleNudge('cameraAngleX', 5)}
                          className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                        >
                          +5°
                        </button>
                      </div>
                    </div>

                    {/* Camera Angle Y (Left/Right View) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-400">Camera Angle View (Left-Right Parallax)</span>
                        <span className="text-white font-bold">{(currentTransformObj?.cameraAngleY ?? 0)}°</span>
                      </div>
                      <input
                        type="range"
                        min="-90"
                        max="90"
                        step="1"
                        value={currentTransformObj?.cameraAngleY ?? 0}
                        onChange={(e) => handleSliderChange('cameraAngleY', Number(e.target.value))}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                      <div className="flex items-center justify-between gap-1.5 pt-0.5">
                        <button
                          onClick={() => handleNudge('cameraAngleY', -5)}
                          className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                        >
                          -5°
                        </button>
                        <button
                          onClick={() => handleNudge('cameraAngleY', 5)}
                          className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                        >
                          +5°
                        </button>
                      </div>
                    </div>

                    {/* Rotate Vertical (0 to 360) */}
                    <div className="space-y-1 pt-1.5 border-t border-neutral-800/20">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-400">Rotate Vertical (3D Pitch 0-360°)</span>
                        <span className="text-white font-bold">{(currentTransformObj?.rotateX ?? 0)}°</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="360"
                        step="1"
                        value={currentTransformObj?.rotateX ?? 0}
                        onChange={(e) => handleSliderChange('rotateX', Number(e.target.value))}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                      <div className="flex items-center justify-between gap-1.5 pt-0.5">
                        <button
                          onClick={() => handleNudge('rotateX', -10)}
                          className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                        >
                          -10°
                        </button>
                        <button
                          onClick={() => handleNudge('rotateX', 10)}
                          className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                        >
                          +10°
                        </button>
                      </div>
                    </div>

                    {/* Rotate Horizontal (0 to 360) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-400">Rotate Horizontal (3D Yaw 0-360°)</span>
                        <span className="text-white font-bold">{(currentTransformObj?.rotateY ?? 0)}°</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="360"
                        step="1"
                        value={currentTransformObj?.rotateY ?? 0}
                        onChange={(e) => handleSliderChange('rotateY', Number(e.target.value))}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                      <div className="flex items-center justify-between gap-1.5 pt-0.5">
                        <button
                          onClick={() => handleNudge('rotateY', -10)}
                          className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                        >
                          -10°
                        </button>
                        <button
                          onClick={() => handleNudge('rotateY', 10)}
                          className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                        >
                          +10°
                        </button>
                      </div>
                    </div>

                    {/* Perspective Depth */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-400">Perspective Depth</span>
                        <span className="text-white font-bold">{(currentTransformObj?.perspective ?? 0)}px</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="800"
                        step="10"
                        value={currentTransformObj?.perspective ?? 0}
                        onChange={(e) => handleSliderChange('perspective', Number(e.target.value))}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                      <div className="flex items-center justify-between gap-1.5 pt-0.5">
                        <button
                          onClick={() => handleSliderChange('perspective', 0)}
                          className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                        >
                          Disable
                        </button>
                        <button
                          onClick={() => handleNudge('perspective', 50)}
                          className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                        >
                          +50px
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Batch Transformations / Smart Controls Panel */}
                {smartPinnedIds.length > 0 && (
                  <div className="space-y-3 bg-neutral-950/40 p-3.5 rounded-2xl border border-neutral-800/50">
                    <div className="text-[10px] text-amber-400 font-black uppercase tracking-wider block">
                      Smart Controls Batch
                    </div>
                    <div className="space-y-1.5">
                      {smartPinnedIds.map(id => {
                        const obj = objects[id];
                        if (!obj) return null;
                        const isChecked = !!smartCheckedIds[id];
                        return (
                          <div 
                            key={id} 
                            onClick={() => handleSmartCheckboxToggle(id)}
                            className="flex items-center justify-between p-2 rounded-xl bg-neutral-900 border border-neutral-800/80 cursor-pointer text-xs select-none hover:border-neutral-700 transition-colors"
                          >
                            <span className="truncate text-neutral-300 font-bold">{obj.name}</span>
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 text-amber-400" />
                            ) : (
                              <SquareIcon className="w-4 h-4 text-neutral-600" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <span className="text-[10px] text-neutral-500 font-bold block pt-1 leading-normal">
                      Note: Adjusting any transforms above applies to all checked batch drawings instantly.
                    </span>
                  </div>
                )}

                {/* Opposite Smart Controls */}
                <div className="space-y-3 bg-neutral-950/40 p-3.5 rounded-2xl border border-neutral-800/50">
                  <div className="text-[10px] text-amber-400 font-black uppercase tracking-wider block">
                    Opposite Smart Sync
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleAddToOpposite(1)}
                      className="flex-1 py-1 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-neutral-900 text-neutral-300 hover:text-white border border-neutral-800 active:scale-95 transition-all"
                    >
                      + Add to Section 1
                    </button>
                    <button
                      onClick={() => handleAddToOpposite(2)}
                      className="flex-1 py-1 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-neutral-900 text-neutral-300 hover:text-white border border-neutral-800 active:scale-95 transition-all"
                    >
                      + Add to Section 2
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1.5">
                    <div className="space-y-1">
                      <span className="text-[10px] text-neutral-500 font-black uppercase block">Section 1</span>
                      <div className="bg-neutral-950/60 p-2 rounded-xl text-[10px] text-neutral-400 min-h-12 border border-neutral-900 flex flex-col gap-1">
                        {oppositeSection1.length === 0 ? 'Empty' : oppositeSection1.map(id => (
                          <div key={id} className="flex items-center justify-between">
                            <span className="truncate">{objects[id]?.name || 'Unknown'}</span>
                            <button onClick={() => setOppositeSection1(prev => prev.filter(x => x !== id))} className="text-neutral-600 hover:text-rose-400">✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-neutral-500 font-black uppercase block">Section 2</span>
                      <div className="bg-neutral-950/60 p-2 rounded-xl text-[10px] text-neutral-400 min-h-12 border border-neutral-900 flex flex-col gap-1">
                        {oppositeSection2.length === 0 ? 'Empty' : oppositeSection2.map(id => (
                          <div key={id} className="flex items-center justify-between">
                            <span className="truncate">{objects[id]?.name || 'Unknown'}</span>
                            <button onClick={() => setOppositeSection2(prev => prev.filter(x => x !== id))} className="text-neutral-600 hover:text-rose-400">✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-neutral-500 font-bold block pt-1 leading-normal">
                    Limb Syncing: Section 1 rotates forward, Section 2 rotates backward in opposite directions on Rotation adjustments!
                  </span>
                </div>

                {/* Associated Rigging Bones list */}
                {selectedObjectBones.length > 0 && (
                  <div className="space-y-3 bg-neutral-950/40 p-3.5 rounded-2xl border border-neutral-800/50">
                    <div className="text-[10px] text-amber-400 font-black uppercase tracking-wider block flex items-center gap-1">
                      <Workflow className="w-3.5 h-3.5 text-amber-500" />
                      Associated Rigging Bones
                    </div>
                    <div className="space-y-2">
                      {selectedObjectBones.map((bone) => (
                        <div key={bone.id} className="bg-neutral-900 p-2.5 rounded-xl border border-neutral-800 text-xs">
                          <div className="flex items-center justify-between font-bold">
                            <span className="text-neutral-200">{bone.name}</span>
                            <button 
                              onClick={() => deleteBone(bone.id)}
                              className="p-1 rounded text-neutral-500 hover:text-rose-400"
                              title="Delete bone link"
                            >
                              ✕
                            </button>
                          </div>

                          {/* Detachment Constraints Toggle */}
                          <div className="flex items-center justify-between pt-2 mt-2 border-t border-neutral-800/50">
                            <span className="text-[10px] text-neutral-400 uppercase font-black">Allow Detachments</span>
                            <span className="text-[9px] font-black text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                              LOCKED (RIGID)
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* LASSO AREA COLOR FILL PANEL */}
            <div className="space-y-4 bg-neutral-950/40 p-4 rounded-2xl border border-neutral-800/50 mt-4 animate-fade-in">
              <div className="flex items-center justify-between text-[10px] text-amber-400 font-black uppercase tracking-wider font-black border-b border-neutral-800/40 pb-2.5">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                  Lasso Area Color Fill
                </span>
                {lassoPoints.length > 0 && (
                  <span className="bg-amber-500/10 text-amber-400 text-[8px] font-black px-1.5 py-0.5 rounded-full">
                    {lassoPoints.length} PTS
                  </span>
                )}
              </div>

              <div className="space-y-3.5 text-xs">
                <p className="text-[11px] text-neutral-400 leading-relaxed font-medium">
                  Draw an area around your drawings with the <strong className="text-amber-400">Lasso Fill tool (Sparkles)</strong>, select a color, and tap Fill to color only that section.
                </p>

                {/* Selection Mode Toggle */}
                <div className="flex bg-neutral-900/60 p-1 rounded-xl border border-neutral-800/60 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setLassoMode('freehand');
                      setPenLassoPoints([]);
                    }}
                    className={`flex-1 py-1.5 px-2 text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-all ${
                      lassoMode === 'freehand'
                        ? 'bg-amber-500 text-neutral-950 font-black shadow shadow-amber-500/20'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Freehand Lasso
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLassoMode('pen');
                    }}
                    className={`flex-1 py-1.5 px-2 text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-all ${
                      lassoMode === 'pen'
                        ? 'bg-amber-500 text-neutral-950 font-black shadow shadow-amber-500/20'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <Feather className="w-3.5 h-3.5" />
                    Vector Pen
                  </button>
                </div>

                {/* Lasso Active Tool Button & Area Clears */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTool('LSO')}
                    className={`flex-1 py-2 px-3 text-xs font-black uppercase rounded-xl border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      activeTool === 'LSO'
                        ? 'bg-amber-500 text-neutral-950 border-amber-400 font-black shadow-md shadow-amber-500/20'
                        : 'bg-neutral-900 text-neutral-300 hover:text-white border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Lasso Tool
                  </button>

                  {lassoPoints.length > 0 && (
                    <button
                      type="button"
                      onClick={handleRemoveLassoArea}
                      className="p-2 bg-neutral-900 border border-neutral-800 hover:border-rose-900 text-neutral-400 hover:text-rose-400 rounded-xl transition-all cursor-pointer flex items-center justify-center"
                      title="Remove lasso area outline"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Color Selector & Swatches */}
                <div className="space-y-2 bg-neutral-900/50 p-3 rounded-xl border border-neutral-800/40">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-neutral-400 font-black uppercase tracking-wider">Fill Color</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-neutral-400 font-bold uppercase">{lassoColor}</span>
                      <CustomColorPicker
                        color={lassoColor}
                        onChange={(c) => setLassoColor(c)}
                      />
                    </div>
                  </div>

                  {/* Swatches preset list */}
                  <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-neutral-800/20">
                    {['#E53935', '#D81B60', '#8E24AA', '#5E35B1', '#3949AB', '#1E88E5', '#00ACC1', '#00897B', '#43A047', '#7CB342', '#FDD835', '#FB8C00', '#F4511E', '#FFFFFF', '#000000'].map(swColor => (
                      <button
                        key={swColor}
                        type="button"
                        onClick={() => setLassoColor(swColor)}
                        className={`w-4 h-4 rounded-full border cursor-pointer transition-all ${
                          lassoColor === swColor ? 'scale-125 border-white ring-1 ring-amber-500' : 'border-neutral-950 hover:scale-110'
                        }`}
                        style={{ backgroundColor: swColor }}
                      />
                    ))}
                  </div>
                </div>

                {/* Fill / Clear Buttons */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleApplyLassoFill}
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-xs tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/10 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    FILL LASSO REGION
                  </button>

                  <button
                    type="button"
                    onClick={handleClearLassoFills}
                    className="py-2 px-3 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-rose-400 font-bold rounded-xl text-[10px] uppercase tracking-wide transition-all cursor-pointer flex items-center justify-center gap-1"
                    title="Remove all lasso fills from drawing"
                  >
                    Reset Fills
                  </button>
                </div>
              </div>
            </div>

            {/* DEEP GAP FILL & AUTO-CORRECT PANEL */}
            <div className="space-y-4 bg-neutral-950/40 p-4 rounded-2xl border border-neutral-800/50 mt-4 animate-fade-in">
              <div className="flex items-center justify-between text-[10px] text-amber-400 font-black uppercase tracking-wider border-b border-neutral-800/40 pb-2.5">
                <span className="flex items-center gap-1.5">
                  <Maximize2 className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                  Deep Gap Fill & Auto-Correct
                </span>
                {selectedObject?.autoFillGaps && (
                  <span className="bg-emerald-500/10 text-emerald-400 text-[8px] font-black px-1.5 py-0.5 rounded-full border border-emerald-500/20">
                    AUTO-FILL ACTIVE
                  </span>
                )}
              </div>

              <div className="space-y-3 text-xs">
                <p className="text-[11px] text-neutral-400 leading-relaxed font-medium">
                  Deeply scans drawings to detect and seal unclosed path gaps, missing interior fills, and microscopic hairline seams. Automatically expands and updates as drawings scale, flex, or deform.
                </p>

                {/* Primary Fill Gap Action Button */}
                <button
                  type="button"
                  onClick={handleDeepFillGaps}
                  className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 font-black uppercase text-xs rounded-xl tracking-wider shadow-lg shadow-amber-500/15 transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98]"
                >
                  <Sparkles className="w-4 h-4" />
                  FILL DEEP GAPS NOW
                </button>

                {/* Feedback message banner if gap fill executed */}
                {gapFillFeedback && (
                  <div className="p-2.5 bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold rounded-xl animate-fade-in flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{gapFillFeedback}</span>
                  </div>
                )}

                {/* Auto Fill Gaps Toggle */}
                {selectedObject && (
                  <div className="space-y-2.5 pt-2 border-t border-neutral-800/30">
                    <div className="flex items-center justify-between bg-neutral-900/60 p-2.5 rounded-xl border border-neutral-800/60">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-neutral-200 font-black uppercase tracking-wider">Auto-Fill Gaps on Transform</span>
                        <span className="text-[8px] text-neutral-400">Expands fill continuously as drawing scales or deforms</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!selectedObject.autoFillGaps}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            updateObject(selectedObject.id, {
                              autoFillGaps: isChecked,
                              fillGaps: isChecked,
                              gapFillExpansion: selectedObject.gapFillExpansion || 4
                            });
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-400 after:border-neutral-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500 peer-checked:after:bg-white" />
                      </label>
                    </div>

                    {/* Gap Fill Expansion Slider */}
                    <div className="space-y-1 bg-neutral-900/40 p-2.5 rounded-xl border border-neutral-800/40">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wide">Gap Fill Expansion / Dilation</span>
                        <span className="text-amber-400 font-black text-[10px]">{selectedObject.gapFillExpansion ?? 4}px</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="12"
                        step="0.5"
                        value={selectedObject.gapFillExpansion ?? 4}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          updateObject(selectedObject.id, {
                            gapFillExpansion: val,
                            fillGaps: true,
                            autoFillGaps: true
                          });
                        }}
                        className="w-full h-1 bg-neutral-950 rounded-lg appearance-none cursor-pointer accent-amber-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* PERMANENT DRAWING ATTACHMENTS PANEL */}
            <div className="space-y-4 bg-neutral-950/40 p-4 rounded-2xl border border-neutral-800/50 mt-4 animate-fade-in">
              <div className="flex items-center justify-between text-[10px] text-amber-400 font-black uppercase tracking-wider font-black border-b border-neutral-800/40 pb-2.5">
                <span className="flex items-center gap-1.5">
                  <Link className="w-3.5 h-3.5 text-amber-500" />
                  Permanent Group Attachments
                </span>
                {selectedObject?.attachedGroupId && (
                  <span className="bg-emerald-500/10 text-emerald-400 text-[8px] font-black px-1.5 py-0.5 rounded-full">
                    ATTACHED
                  </span>
                )}
              </div>

              <div className="space-y-3 text-xs">
                <p className="text-[11px] text-neutral-400 leading-relaxed font-medium">
                  Connect multiple separate drawings permanently so they <strong className="text-amber-400">always move together</strong> as a rigid group while keeping individual rotation, scales, colors, and layering.
                </p>

                {/* Dropdown to add drawings */}
                <div className="space-y-2">
                  <label className="text-[10px] text-neutral-400 font-black uppercase block tracking-wide">
                    Select drawings to attach:
                  </label>
                  <div className="flex gap-1.5">
                    <CustomSelect
                      value={attachSelectedId}
                      onChange={(val) => handleAddAttachmentPiece(val)}
                      options={Object.values(objects)
                        .filter(o => !attachmentPieces.includes(o.id) && o.id !== selectedObject?.id)
                        .map(o => ({ value: o.id, label: o.name }))
                      }
                      placeholder="-- Add Drawing to Group --"
                      className="flex-1"
                    />
                  </div>
                </div>

                {/* List of attachment pieces added so far */}
                {(attachmentPieces.length > 0 || selectedObject) && (
                  <div className="space-y-1.5 bg-neutral-900/50 p-3 rounded-xl border border-neutral-800/40">
                    <span className="text-[9px] text-neutral-400 uppercase font-black block pb-1 border-b border-neutral-800/20">
                      Attachments in draft group:
                    </span>
                    <div className="space-y-1 max-h-32 overflow-y-auto pt-1 flex flex-col gap-1">
                      {selectedObject && (
                        <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg text-[11px]">
                          <span className="text-amber-400 font-black truncate">{selectedObject.name} (Selected)</span>
                          <span className="text-[9px] text-amber-500/80 uppercase font-black">Anchor</span>
                        </div>
                      )}

                      {attachmentPieces.map(pieceId => {
                        const piece = objects[pieceId];
                        if (!piece) return null;
                        return (
                          <div key={pieceId} className="flex items-center justify-between bg-neutral-950/60 border border-neutral-800/40 px-2.5 py-1 rounded-lg text-[11px]">
                            <span className="text-neutral-300 font-medium truncate">{piece.name}</span>
                            <button
                              type="button"
                              onClick={() => setAttachmentPieces(attachmentPieces.filter(id => id !== pieceId))}
                              className="text-neutral-500 hover:text-rose-400 transition-colors cursor-pointer"
                              title="Remove"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Attach Button */}
                <button
                  type="button"
                  onClick={handleExecuteAttach}
                  disabled={attachmentPieces.length === 0 && !selectedObject}
                  className="w-full py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-neutral-800 disabled:text-neutral-500 text-neutral-950 font-black uppercase text-xs rounded-xl tracking-wider shadow-lg shadow-amber-500/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Link className="w-3.5 h-3.5" />
                  ATTACH DRAWINGS NOW
                </button>

                {/* Active Group Info, Z-Index Ordering and Detach */}
                {selectedObject && selectedObject.attachedGroupId && (
                  <div className="mt-3 pt-3 border-t border-neutral-800/40 space-y-3">
                    <div className="text-[10px] text-neutral-400 font-black uppercase tracking-wider block">
                      Active Group Layering & Order
                    </div>
                    
                    {/* Z-Index Controls */}
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-[10px] text-neutral-400 font-bold">Individual Depth:</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const curZ = selectedObject.zIndex ?? 0;
                            updateObject(selectedObject.id, { zIndex: curZ - 1 });
                          }}
                          className="px-2.5 py-1 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 rounded-lg text-[10px] text-neutral-300 font-black cursor-pointer active:scale-95 transition-all"
                          title="Move Backwards"
                        >
                          Send Back
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const curZ = selectedObject.zIndex ?? 0;
                            updateObject(selectedObject.id, { zIndex: curZ + 1 });
                          }}
                          className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500 text-amber-400 rounded-lg text-[10px] text-neutral-300 font-black cursor-pointer active:scale-95 transition-all"
                          title="Bring Forwards"
                        >
                          Bring Front
                        </button>
                      </div>
                    </div>

                    {/* Detach Selected button */}
                    <button
                      type="button"
                      onClick={handleDetachObject}
                      className="w-full py-2 bg-rose-950/40 hover:bg-rose-950/70 border border-rose-900/40 hover:border-rose-900 text-rose-300 font-black uppercase text-xs rounded-xl tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                      DETACH FROM GROUP
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* BRUSH CRAFTING STUDIO */}
            {brushSettings && setBrushSettings && (
              <div id="brush-crafting-studio" className="space-y-4 bg-neutral-950/40 p-4 rounded-2xl border border-neutral-800/50 mt-4 animate-fade-in text-xs">
                <div className="flex items-center justify-between text-[10px] text-emerald-400 font-black uppercase tracking-wider border-b border-neutral-800/40 pb-2.5">
                  <span className="flex items-center gap-1.5">
                    <Feather className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                    Brush Crafting Studio
                  </span>
                  <span className="bg-emerald-500/15 text-emerald-400 text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase">
                    Vector Brush
                  </span>
                </div>

                <div className="bg-neutral-900/45 p-2.5 rounded-xl border border-neutral-850 text-[10px] text-neutral-400 leading-relaxed italic text-center">
                  🎨 Choose from 5 lightweight vector brushes below and adjust stroke parameters.
                </div>

                {/* 5 VECTOR BRUSH SELECTOR */}
                <div className="space-y-2">
                  <span className="text-[10px] text-amber-400 font-extrabold uppercase tracking-wide block">
                    Select Vector Brush Style
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'solid', label: 'Solid Monoline', desc: 'Clean vector pen' },
                      { id: 'calligraphy', label: 'Calligraphy Chisel', desc: 'Chisel nib stroke' },
                      { id: 'pencil', label: 'Pencil Sketch', desc: 'Textured graphite' },
                      { id: 'marker', label: 'Marker Highlighter', desc: 'Translucent marker' },
                      { id: 'airbrush', label: 'Airbrush Spray', desc: 'Soft gradient glow' },
                    ].map((b) => {
                      const isActive = (brushSettings.brushType || 'solid') === b.id;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setBrushSettings(prev => ({ ...prev, brushType: b.id as any }))}
                          className={`p-2 rounded-xl text-left border transition-all ${
                            isActive
                              ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-md font-extrabold'
                              : 'bg-neutral-900/80 border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800 font-semibold'
                          }`}
                        >
                          <div className="text-[11px] leading-tight">{b.label}</div>
                          <div className="text-[9px] opacity-70 font-normal leading-none mt-0.5">{b.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Chisel Angle for Calligraphy Brush */}
                {brushSettings.brushType === 'calligraphy' && (
                  <div className="space-y-1 bg-neutral-900/60 p-2.5 rounded-xl border border-neutral-800">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-amber-400 font-bold uppercase">Chisel Nib Angle</span>
                      <span className="text-amber-400 font-black text-[10px]">{brushSettings.chiselAngle ?? 45}°</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="180"
                      step="5"
                      value={brushSettings.chiselAngle ?? 45}
                      onChange={(e) => setBrushSettings(prev => ({ ...prev, chiselAngle: parseFloat(e.target.value) }))}
                      className="w-full h-1 bg-neutral-950 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                  </div>
                )}

                {/* STYLE & EFFECTS CONTROLS */}
                <div className="space-y-3 bg-neutral-900/55 p-3 rounded-xl border border-neutral-850">
                  {/* Size / Thickness */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wide">Stroke Thickness / Width</span>
                      <span className="text-emerald-400 font-black text-[10px]">{brushSettings.strokeWidth}px</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="120"
                      step="0.5"
                      value={brushSettings.strokeWidth}
                      onChange={(e) => setBrushSettings(prev => ({ ...prev, strokeWidth: parseFloat(e.target.value) }))}
                      className="w-full h-1 bg-neutral-950 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>

                  {/* Option: Color Opacity */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wide">Brush Opacity</span>
                      <span className="text-[10px] text-emerald-400 font-black">{Math.round(brushSettings.strokeOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.05"
                      max="1"
                      step="0.01"
                      value={brushSettings.strokeOpacity}
                      onChange={(e) => setBrushSettings(prev => ({ ...prev, strokeOpacity: parseFloat(e.target.value) }))}
                      className="w-full h-1 bg-neutral-950 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>

                  {/* Blur */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-neutral-400 font-bold uppercase">Blur Effect</span>
                      <span className="text-emerald-400 font-black text-[10px]">{brushSettings.blur}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="30"
                      step="0.5"
                      value={brushSettings.blur}
                      onChange={(e) => setBrushSettings(prev => ({ ...prev, blur: parseFloat(e.target.value) }))}
                      className="w-full h-1 bg-neutral-950 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>
                </div>

                {/* Shadow Engine */}
                <div className="space-y-3 bg-neutral-900/55 p-3 rounded-xl border border-neutral-850">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-neutral-300 font-black uppercase tracking-wider">
                      👥 Stroke Drop Shadow
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={brushSettings.shadowEnabled}
                        onChange={(e) => setBrushSettings(prev => ({ ...prev, shadowEnabled: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-400 after:border-neutral-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500 peer-checked:after:bg-white" />
                    </label>
                  </div>

                  {brushSettings.shadowEnabled && (
                    <div className="space-y-2.5 pt-1.5 border-t border-neutral-800/40 animate-fade-in">
                      {/* Shadow Color */}
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-neutral-400 uppercase">Shadow Color</span>
                        <CustomColorPicker
                          color={brushSettings.shadowColor || '#000000'}
                          onChange={(c) => setBrushSettings(prev => ({ ...prev, shadowColor: c }))}
                        />
                      </div>

                      {/* Shadow Blur */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] text-neutral-400 uppercase">Shadow Blur</span>
                          <span className="text-emerald-400 font-bold">{brushSettings.shadowBlur}px</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="40"
                          value={brushSettings.shadowBlur}
                          onChange={(e) => setBrushSettings(prev => ({ ...prev, shadowBlur: parseInt(e.target.value) }))}
                          className="w-full h-1 bg-neutral-950 rounded accent-emerald-500 appearance-none cursor-pointer"
                        />
                      </div>

                      {/* Shadow Offset X */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] text-neutral-400 uppercase">Offset X</span>
                          <span className="text-emerald-400 font-bold">{brushSettings.shadowOffsetX}px</span>
                        </div>
                        <input
                          type="range"
                          min="-30"
                          max="30"
                          value={brushSettings.shadowOffsetX}
                          onChange={(e) => setBrushSettings(prev => ({ ...prev, shadowOffsetX: parseInt(e.target.value) }))}
                          className="w-full h-1 bg-neutral-950 rounded accent-emerald-500 appearance-none cursor-pointer"
                        />
                      </div>

                      {/* Shadow Offset Y */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] text-neutral-400 uppercase">Offset Y</span>
                          <span className="text-emerald-400 font-bold">{brushSettings.shadowOffsetY}px</span>
                        </div>
                        <input
                          type="range"
                          min="-30"
                          max="30"
                          value={brushSettings.shadowOffsetY}
                          onChange={(e) => setBrushSettings(prev => ({ ...prev, shadowOffsetY: parseInt(e.target.value) }))}
                          className="w-full h-1 bg-neutral-950 rounded accent-emerald-500 appearance-none cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}



            {/* AI SMOOTH MOTION & LOOP GENERATOR PANEL */}
            <div id="ai-smooth-motion-panel" className="space-y-4 bg-neutral-950/40 p-4 rounded-2xl border border-neutral-800/50 mt-4 animate-fade-in">
              <div className="flex items-center justify-between text-[10px] text-amber-400 font-black uppercase tracking-wider font-black border-b border-neutral-800/40 pb-2.5">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                  AI Smooth Motion Generator
                </span>
                <span className="bg-amber-500/15 text-amber-400 text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase">
                  Advanced Tweening
                </span>
              </div>

              <div className="space-y-3.5 text-xs">
                <p className="text-[11px] text-neutral-400 leading-relaxed font-medium">
                  Convert a few reference frames into a completed high-framerate animation. Works for rigged limbs, shape morphing, colors, and opacities!
                </p>

                {/* Segmented Mode Selector */}
                <div id="gen-mode-selector" className="grid grid-cols-2 gap-1.5 bg-neutral-950 p-1 rounded-xl border border-neutral-800/60">
                  <button
                    id="btn-mode-single"
                    type="button"
                    onClick={() => setAnimationMode('single')}
                    className={`py-1.5 px-2 text-[10px] font-black uppercase rounded-lg transition-all cursor-pointer ${
                      animationMode === 'single'
                        ? 'bg-amber-500 text-neutral-950 font-black shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Single-Step Tween
                  </button>
                  <button
                    id="btn-mode-multi"
                    type="button"
                    onClick={() => setAnimationMode('multi')}
                    className={`py-1.5 px-2 text-[10px] font-black uppercase rounded-lg transition-all cursor-pointer ${
                      animationMode === 'multi'
                        ? 'bg-amber-500 text-neutral-950 font-black shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Walk Cycle & Loop
                  </button>
                </div>

                {/* Mode-specific Fields */}
                {animationMode === 'single' ? (
                  <div id="single-mode-fields" className="space-y-2.5 bg-neutral-900/50 p-3 rounded-xl border border-neutral-800/40">
                    <span className="text-[9px] text-amber-400 font-black uppercase block pb-1 border-b border-neutral-800/20">
                      Single-Step Tween References
                    </span>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label className="text-[10px] text-neutral-400 block font-bold">Start Frame:</label>
                        <CustomSelect
                          value={String(singleStartFrame)}
                          onChange={(val) => setSingleStartFrame(Number(val))}
                          options={frames.map(f => ({ value: String(f.index), label: `Frame ${f.index + 1}` }))}
                          placeholder="Select Frame"
                          className="w-full"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-neutral-400 block font-bold">End Frame:</label>
                        <CustomSelect
                          value={String(singleEndFrame)}
                          onChange={(val) => setSingleEndFrame(Number(val))}
                          options={frames.map(f => ({ value: String(f.index), label: `Frame ${f.index + 1}` }))}
                          placeholder="Select Frame"
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div id="multi-mode-fields" className="space-y-3 bg-neutral-900/50 p-3 rounded-xl border border-neutral-800/40">
                    <span className="text-[9px] text-amber-400 font-black uppercase block pb-1 border-b border-neutral-800/20">
                      Loop & Walk Cycle Reference Configuration
                    </span>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label className="text-[10px] text-neutral-400 block font-bold">Ref Start (Pose):</label>
                        <CustomSelect
                          value={String(multiRefStartFrame)}
                          onChange={(val) => setMultiRefStartFrame(Number(val))}
                          options={frames.map(f => ({ value: String(f.index), label: `Frame ${f.index + 1}` }))}
                          placeholder="Select Frame"
                          className="w-full"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-neutral-400 block font-bold">Ref End (Pose):</label>
                        <CustomSelect
                          value={String(multiRefEndFrame)}
                          onChange={(val) => setMultiRefEndFrame(Number(val))}
                          options={frames.map(f => ({ value: String(f.index), label: `Frame ${f.index + 1}` }))}
                          placeholder="Select Frame"
                          className="w-full"
                        />
                      </div>
                    </div>

                    <div className="space-y-1 pt-1.5 border-t border-neutral-800/20">
                      <label className="text-[10px] text-neutral-400 block font-bold">Journey Target End-Position Frame:</label>
                      <CustomSelect
                        value={String(multiEndPosFrame)}
                        onChange={(val) => setMultiEndPosFrame(Number(val))}
                        options={frames.map(f => ({ value: String(f.index), label: `Frame ${f.index + 1} (Location Marker)` }))}
                        placeholder="Select Frame"
                        className="w-full"
                      />
                      <p className="text-[9px] text-neutral-500 pt-0.5 leading-normal">
                        Character glides from initial pos in Ref Start Frame to target pos in End-Position Frame while repeating the cycle.
                      </p>
                    </div>
                  </div>
                )}

                {/* Configuration Controls */}
                <div id="generator-shared-configs" className="space-y-3 bg-neutral-900/35 p-3 rounded-xl border border-neutral-800/30">
                  <span className="text-[9px] text-neutral-400 font-black uppercase block pb-1 border-b border-neutral-800/20">
                    Timing & Easing Curve Settings
                  </span>

                  {/* Duration Slider */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-neutral-400 font-bold">Animation Duration:</span>
                      <span className="text-amber-400 font-black">{durationSeconds} Seconds</span>
                    </div>
                    <input
                      id="input-duration-seconds"
                      type="range"
                      min="1"
                      max="30"
                      step="1"
                      value={durationSeconds}
                      onChange={(e) => setDurationSeconds(Number(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                    <div className="flex items-center justify-between text-[9px] text-neutral-500">
                      <span>1s</span>
                      <span>Total: {durationSeconds * fps} frames</span>
                      <span>30s</span>
                    </div>
                  </div>

                  {/* FPS selection dropdown */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[10px] text-neutral-400 block font-bold">Framerate (FPS):</label>
                      <CustomSelect
                        value={String(fps)}
                        onChange={(val) => setFps(Number(val))}
                        options={[
                          { value: "12", label: "12 FPS" },
                          { value: "24", label: "24 FPS" },
                          { value: "30", label: "30 FPS (Standard)" },
                          { value: "60", label: "60 FPS (Ultra Smooth)" }
                        ]}
                        placeholder="Framerate"
                        className="w-full"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-neutral-400 block font-bold">Easing Curve:</label>
                      <CustomSelect
                        value={easeType}
                        onChange={(val) => setEaseType(val as any)}
                        options={[
                          { value: "linear", label: "Linear (Uniform)" },
                          { value: "easeIn", label: "Ease In (Accelerate)" },
                          { value: "easeOut", label: "Ease Out (Decelerate)" },
                          { value: "easeInOut", label: "Ease In Out (Smooth)" }
                        ]}
                        placeholder="Easing Curve"
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* Auto In-between / Tweening Toggle */}
                  {setAutoTween && (
                    <div className="space-y-1.5 pt-2 border-t border-neutral-800/40" id="auto-inbetween-panel">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] text-neutral-300 font-black uppercase tracking-wider flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          Auto In-between Animation
                        </label>
                        <button
                          type="button"
                          onClick={() => setAutoTween(!autoTween)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border ${
                            autoTween
                              ? 'bg-amber-500 text-neutral-950 border-amber-400 shadow-md shadow-amber-500/20'
                              : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
                          }`}
                        >
                          {autoTween ? 'ENABLED' : 'DISABLED'}
                        </button>
                      </div>
                      <p className="text-[9px] text-neutral-500 leading-normal">
                        {autoTween 
                          ? 'Auto in-between interpolation is active: renders smooth transitions between keyframes.'
                          : 'Auto in-between is disabled by default. Enable to render smooth keyframe transitions.'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Generate / Action Buttons */}
                <div id="generator-action-container" className="space-y-2 pt-1.5">
                  <button
                    id="btn-trigger-generate"
                    type="button"
                    onClick={animationMode === 'single' ? handleGenerateSingleStep : handleGenerateMultiStep}
                    className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 font-black uppercase text-xs rounded-xl tracking-wider shadow-lg shadow-amber-500/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98]"
                  >
                    <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                    ⚡ Generate Completed Animation
                  </button>

                  {hasBackup && (
                    <button
                      id="btn-trigger-restore"
                      type="button"
                      onClick={handleRestoreBackup}
                      className="w-full py-2 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-neutral-400 hover:text-amber-400 font-bold rounded-xl text-[10px] uppercase tracking-wide transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      ↩ Restore Original Frames
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Child-Parent System Tree Panel */}
            <div className="space-y-4 bg-neutral-950/40 p-4 rounded-2xl border border-neutral-800/50 mt-4">
              <div className="flex items-center justify-between text-[10px] text-amber-400 font-black uppercase tracking-wider font-black border-b border-neutral-800/40 pb-2.5">
                <span className="flex items-center gap-1.5">
                  <Workflow className="w-3.5 h-3.5 text-amber-500" />
                  Child-Parent System
                </span>
                
                {/* Add Root Parent Drawing Button */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveMenuObjectId('root_add');
                    setActiveMenuType('options');
                  }}
                  className="p-1 rounded bg-amber-500/10 hover:bg-amber-500 hover:text-neutral-950 text-amber-400 transition-all flex items-center justify-center cursor-pointer"
                  title="Add Parent/Root Drawing"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Add Root Selector Dropdown */}
              {activeMenuObjectId === 'root_add' && (
                <div className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-xl space-y-2 text-xs">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-neutral-400 block font-bold uppercase tracking-wide">Select Root Parent Drawing:</label>
                    <div className="flex gap-1.5">
                      <CustomSelect
                        value=""
                        onChange={(val) => {
                          if (val) {
                            updateObject(val, { parentId: null });
                            setActiveMenuObjectId(null);
                            setActiveMenuType(null);
                          }
                        }}
                        options={Object.values(objects)
                          .filter(o => o.parentId !== null)
                          .map(o => ({ value: o.id, label: o.name }))
                        }
                        placeholder="-- Select Drawing --"
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setActiveMenuObjectId(null);
                          setActiveMenuType(null);
                        }}
                        className="px-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 font-bold rounded-lg transition-all text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Collapsible VS Code Nestable Tree */}
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {Object.values(objects).filter(o => o.parentId === null).length === 0 ? (
                  <div className="text-center py-6 text-[10px] text-neutral-600 font-bold italic">
                    No parent drawings configured yet. Click '+' to start.
                  </div>
                ) : (
                  Object.values(objects)
                    .filter(o => o.parentId === null)
                    .filter(o => (o.layerId || 'layer_1') === activeLayerId)
                    .map(rootObj => renderTreeNode(rootObj, 0))
                )}
              </div>
            </div>

            {/* Direct Rigging & Connection Creator Section */}
            <div className="space-y-4 bg-neutral-950/40 p-4 rounded-2xl border border-neutral-800/50 mt-4">
              <div className="text-[10px] text-amber-400 font-black uppercase tracking-wider flex items-center gap-1 font-black">
                <GitMerge className="w-3.5 h-3.5 text-amber-500" />
                Direct Rigging Creator
              </div>

              <div className="space-y-3">
                {/* Drawing A Selection */}
                <div className="space-y-1">
                  <label className="text-[11px] text-neutral-400 font-bold block">First Drawing (A)</label>
                  <CustomSelect
                    value={connDrawingA}
                    onChange={(val) => setConnDrawingA(val)}
                    options={Object.values(objects).map(o => ({ value: o.id, label: o.name }))}
                    placeholder="-- Select Drawing A --"
                    className="w-full"
                  />
                </div>

                {/* Drawing B Selection */}
                <div className="space-y-1">
                  <label className="text-[11px] text-neutral-400 font-bold block">Second Drawing (B)</label>
                  <CustomSelect
                    value={connDrawingB}
                    onChange={(val) => setConnDrawingB(val)}
                    options={Object.values(objects).map(o => ({ value: o.id, label: o.name }))}
                    placeholder="-- Select Drawing B --"
                    className="w-full"
                  />
                </div>

                {/* Hierarchy Direction */}
                <div className="space-y-1 pt-1">
                  <label className="text-[11px] text-neutral-400 font-bold block">Hierarchy Parenting</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setParentSelection('A_is_parent')}
                      className={`text-[10px] font-bold py-1.5 px-2 rounded-lg border transition-all ${
                        parentSelection === 'A_is_parent'
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          : 'bg-neutral-950 text-neutral-500 border-neutral-800'
                      }`}
                    >
                      A is Parent of B
                    </button>
                    <button
                      type="button"
                      onClick={() => setParentSelection('B_is_parent')}
                      className={`text-[10px] font-bold py-1.5 px-2 rounded-lg border transition-all ${
                        parentSelection === 'B_is_parent'
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          : 'bg-neutral-950 text-neutral-500 border-neutral-800'
                      }`}
                    >
                      B is Parent of A
                    </button>
                  </div>
                </div>

                {/* Connect Button */}
                <button
                  type="button"
                  onClick={handleCreateDirectConnection}
                  disabled={!connDrawingA || !connDrawingB || connDrawingA === connDrawingB}
                  className="w-full py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-neutral-800 disabled:text-neutral-500 text-neutral-950 font-black uppercase text-xs rounded-xl tracking-wider shadow-lg shadow-amber-500/10 transition-all flex items-center justify-center gap-1.5"
                >
                  <GitMerge className="w-3.5 h-3.5" />
                  Connect Drawings
                </button>
              </div>
            </div>

            {/* Active Connections List Section */}
            <div className="space-y-3 bg-neutral-950/40 p-4 rounded-2xl border border-neutral-800/50 mt-4">
              <div className="text-[10px] text-amber-400 font-black uppercase tracking-wider flex items-center justify-between font-black">
                <span className="flex items-center gap-1">
                  <Workflow className="w-3.5 h-3.5 text-amber-500" />
                  All Active Connections ({bones.length})
                </span>
              </div>
              
              {bones.length === 0 ? (
                <div className="text-center py-4 text-[10px] text-neutral-600 font-bold italic">
                  No active rig connections found.
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {bones.map(bone => {
                    const startObj = objects[bone.startObjectId];
                    const endObj = objects[bone.endObjectId];
                    if (!startObj || !endObj) return null;
                    return (
                      <div key={bone.id} className="bg-neutral-900/80 border border-neutral-800/60 p-2 rounded-xl flex items-center justify-between text-[11px]">
                        <div className="flex flex-col gap-0.5 truncate">
                          <span className="font-bold text-neutral-300 truncate">
                            {startObj.name} <span className="text-amber-500 text-[9px] font-black mx-1">➔ Parent</span>
                          </span>
                          <span className="text-neutral-500 truncate">
                            {endObj.name} <span className="text-neutral-400 text-[9px] font-bold mx-1">➔ Child</span>
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleBreakConnection(bone.id)}
                          className="p-1 rounded text-neutral-500 hover:text-rose-400 transition-colors shrink-0 font-bold text-xs"
                          title="Break Connection"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
