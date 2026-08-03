export interface Point {
  x: number;
  y: number;
  z?: number;
  t?: number;
  w?: number;
  color?: string;
  thickness?: number;
  angle?: number;
  jitterX?: number;
  jitterY?: number;
  grainOpacity?: number;
  gap?: boolean;
}

declare global {
  interface Window {
    customAlert: (message: string, title?: string) => Promise<void>;
    customConfirm: (message: string, title?: string) => Promise<boolean>;
    customPrompt: (message: string, defaultValue?: string, title?: string) => Promise<string | null>;
  }
}

export interface RealismSettings {
  autoTaperEnabled: boolean;
  minThickness: number;
  maxThickness: number;
  thinningFactor: number;
  autoShadingEnabled: boolean;
  shadingLightAngle: number; // degrees (e.g. 45 from top-left)
  shadingHighlightOpacity: number; // e.g. 0.2
  shadingShadowOpacity: number; // e.g. 0.3
  
  microJitterEnabled: boolean;
  microJitterAmount: number; // max jitter pixels
  paperGrainEnabled: boolean;
  paperGrainIntensity: number; // e.g. 0.4
  inkBleedEnabled: boolean;
  inkBleedBlur: number; // e.g. 3
  inkBleedOpacity: number; // e.g. 0.3
  inkBleedWidthOffset: number; // e.g. 6
}

export interface Transform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  width?: number;
  height?: number;
  opacity?: number;
  skewX?: number;
  skewY?: number;
  rotateX?: number;
  rotateY?: number;
  perspective?: number;
  cameraAngleX?: number;
  cameraAngleY?: number;
}

export interface Pivot {
  id: string;
  name: string;
  localX: number;
  localY: number;
  locked: boolean;
  isActive?: boolean;
  currentLocalX?: number;
  currentLocalY?: number;
}

export interface Bone {
  id: string;
  name: string;
  startObjectId: string;
  endObjectId: string;
  startLocalX: number;
  startLocalY: number;
  endLocalX: number;
  endLocalY: number;
  lockedDistance: number;
  allowDetach: boolean;
  minAngle: number;
  maxAngle: number;
  enableConstraints: boolean;
  currentAngle?: number;
  color?: string;
  thickness?: number;
}

export interface MeshPoint {
  id: string;
  originalX: number;
  originalY: number;
  currentX: number;
  currentY: number;
  pinned: boolean;
  pinType: 'fixed' | 'semi-fixed' | 'free' | null;
}

export interface MeshState {
  active: boolean;
  densityX: number;
  densityY: number;
  points: MeshPoint[];
  originalPoints: MeshPoint[];
  pointSize: number;
  showGrid: boolean;
  showPoints: boolean;
  previewMode: boolean;
  
  // HyperGraph fields
  editMode?: 'node' | 'lattice' | 'curve' | 'symmetry';
  latticeDensity?: number;
  latticePoints?: MeshPoint[];
  falloffRadius?: number;
  symmetryActive?: boolean;
  symmetryAxis?: 'horizontal' | 'vertical';
  curvePoints?: Point[];
  selectedLatticeIndex?: number | null;
  linkedClusters?: { [index: number]: number[] }; // mapped master index to connected indices
  pointExtrudeMode?: boolean;
}

export interface ObjectShadow {
  enabled: boolean;
  blur: number;
  offsetX: number;
  offsetY: number;
  color: string;
  opacity: number;
}

export interface ObjectInnerShadow {
  enabled: boolean;
  angle: number;
  distance: number;
  size: number;
  opacity: number;
  color?: string;
  blur?: number;
}

export interface ObjectRimLight {
  enabled: boolean;
  color: string;
  thickness: number;
  softness: number;
  position: 'inner' | 'outer';
}

export interface ObjectOverlay {
  enabled: boolean;
  color: string;
  opacity: number;
  blendMode: 'normal' | 'multiply' | 'screen' | 'overlay';
}

export interface View360 {
  id: string;
  name: string;
  angle: number; // 0 to 360
  drawingId: string; // The original drawing object ID
  drawingName?: string; // The original drawing name
  pivots?: Pivot[];
  bones?: Bone[];
}

export interface LassoDeformState {
  active: boolean; // Is lasso deformation active?
  lassoPoints: Point[]; // Lasso points in LOCAL coordinates of the object
  transform: Transform; // Transform applied exclusively to the vertices inside the lasso
}

export interface SubExtrusion {
  id: string;
  name?: string;
  pointIndices: number[];
  extrudeX: number;
  extrudeY: number;
  extrudeZ: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  color?: string;
  bevelProfile?: 'flat' | 'bevel' | 'dome' | 'taper' | 'scurve' | 'hourglass';
  subExtrusions?: SubExtrusion[];
}

export interface VectorObject {
  id: string;
  name: string;
  type: 'stroke' | 'shape' | 'image' | 'text' | '3d' | '360_container';
  points: Point[]; // Boundary points or stroke path
  shapeType?: 'circle' | 'rectangle' | 'triangle' | 'star' | 'line';
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  opacity: number;
  transform: Transform;
  pivots: Pivot[];
  pins?: Pivot[]; // Puppet pins for deformation
  subPaths?: Point[][]; // Sub-paths for multi-step detailed drawings
  parentId: string | null;
  childrenIds: string[];
  layerId: string;
  imageUrl?: string; // If image type
  text?: string; // If text type
  fontSize?: number;
  fontFamily?: string;
  isLocked: boolean;
  isHidden: boolean;
  isContinuousDrawing?: boolean;
  joinedStrokesDemo?: Point[];
  hiddenPoints?: number[];
  hiddenSubPaths?: { [subPathIdx: number]: number[] };
  subPathFills?: { [subPathIdx: number]: string }; // Individual fill color per sub-path / inner loop
  subPathStrokes?: { [subPathIdx: number]: { strokeColor?: string, strokeWidth?: number } }; // Individual stroke style per sub-path
  hiddenLassoRegions?: { localLassoPoints: Point[] }[];
  keepOnlyLassoRegions?: { localLassoPoints: Point[] }[];
  keepAttachedTo?: string | null; // Drawing ID to keep permanently attached
  attachedGroupId?: string; // Group ID for permanent relative move linking
  lassoFills?: { localLassoPoints: Point[], color: string, origBounds?: { minX: number, minY: number, width: number, height: number }, origPoints?: Point[] }[]; // Sub-areas colored via lasso tool
  zIndex?: number; // Sorting order within the layer
  z?: number; // 3D Layer Depth value (lower = background, higher = foreground)
  shadow?: ObjectShadow;
  innerShadow?: ObjectInnerShadow;
  rimLight?: ObjectRimLight;
  overlay?: ObjectOverlay;
  meshState?: MeshState;
  brushType?: string;
  strokeOpacity?: number;
  hardness?: number;
  blur?: number;
  shadowEnabled?: boolean;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  hide3DGrid?: boolean;
  hollowEnabled?: boolean;
  innerSpace3D?: number;
  depth3D?: number;
  fillGaps3D?: boolean;
  fillGaps?: boolean;
  autoFillGaps?: boolean;
  activeViewId?: string;
  autoFillInnerRegion?: boolean;
  deepGapCorrected?: boolean;
  gapFillExpansion?: number;
  selectedFaceIndex?: number;
  selectedEdgeIndex?: number;
  shape3DType?: 'car' | 'character' | 'chair' | 'sphere' | 'box' | 'sword';
  transform3D?: {
    x: number; // 3D Translation X
    y: number; // 3D Translation Y
    z: number; // 3D Translation Z (Depth)
    rx: number; // Euler Rotation X (Pitch)
    ry: number; // Euler Rotation Y (Yaw)
    rz: number; // Euler Rotation Z (Roll)
    sx: number; // Scale X
    sy: number; // Scale Y
    sz: number; // Scale Z
    enabled?: boolean;
    rotateX?: number;
    rotateY?: number;
    rotateZ?: number;
    scaleX?: number;
    scaleY?: number;
    scaleZ?: number;
    translateZ?: number;
    perspective?: number;
    depthTaper?: number; // 3D Conical Taper (-100 to 100)
    depthCurvature?: number; // 3D Z-Arc Curvature Bend (-180 to 180)
    twistZ?: number; // 3D Helical Twist Z (-360 to 360)
    shearZ?: number; // 3D Diagonal Shear Z Offset (-100 to 100)
    inflateDepth?: number; // 3D Inflate Bulge Puff Depth (0 to 100)
    bevelProfile?: 'flat' | 'bevel' | 'dome' | 'taper' | 'scurve' | 'hourglass';
    wireframe?: boolean;
    faces?: {
      front: { color: string; opacity: number; visible: boolean };
      back: { color: string; opacity: number; visible: boolean };
      sides: { color: string; opacity: number; visible: boolean };
    };
    extrusion?: {
      depth: number;
      segments: number;
      bevel: number;
    };
    cachedMesh?: any;
    isMeshDirty?: boolean;
  };
  vertices3D?: { x: number; y: number; z: number }[]; // Raw local 3D vertices
  subPaths3D?: { x: number; y: number; z: number }[][]; // Projected sub-paths for facial features and details
  faces3D?: { indices: number[]; fillColor: string; baseColor: string }[]; // Indexed polygonal faces
  bones3D?: { id: string; name: string; parentId?: string; rx: number; ry: number; rz: number; startVertexIdx: number; endVertexIdx: number }[]; // 3D Kinematics bones
  views360?: View360[];
  currentAngle360?: number;
  activeViewId360?: string;
  lockAngle360?: boolean;
  lassoDeformState?: LassoDeformState;
  lassoControlPoints?: LassoControlPoint[];
  originalPointsBackup?: Point[];
  originalSubPathsBackup?: Point[][];
  smartMeshColor?: SmartMeshColorState;
  smartWarp?: SmartWarpState;
  cageState?: CageState;
  wireframeMode?: boolean;
  selectedPointIndices?: number[];
  savedSelections?: { id: string; name: string; vertexIndices: number[]; color?: string }[];
  wireframeSelectionDone?: boolean;
  subExtrusions?: SubExtrusion[];
  activeSubExtrusionId?: string | null;
  
  // Spline-Based Stroke fields
  splineActive?: boolean;
  splinePoints?: Point[]; // Bezier curve points
  splineControlPoints?: { start: Point; cp1: Point; cp2: Point; end: Point }[];
  splineTwistPoints?: { t: number; rotation: number; scale: number; id: string }[];
  splineUniformStretch?: boolean;
  splineOriginalPoints?: Point[];
  curvePathState?: CurvePathState;
  flexCurveState?: FlexCurveState;
  customVectorDeformState?: CustomVectorDeformState;
}

export interface CustomVectorDeformNode {
  id: string;
  x: number;
  y: number;
  origX: number;
  origY: number;
  parentNodeId?: string; // ID of the parent point from which this point was extruded
  z?: number;
  origZ?: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  skewX?: number;
  skewY?: number;
  width?: number;
  height?: number;
  depth?: number;
  color?: string;
  radius?: number;
  opacity?: number;
  blur?: number;
}

export interface CustomVectorDeformState {
  active: boolean;
  isDrawingPhase: boolean;
  nodes: CustomVectorDeformNode[];
  selectedNodeIndex?: number;
  origObjectPoints?: Point[];
  stiffness?: number;
  rigidLinear?: boolean;
  extrudePointMode?: boolean; // Extrude connected point mode (vector pen style joint chain)
  captureRadius?: number; // Point captured area radius
}

export interface FlexCurveControlPoint {
  id: string;
  x: number;
  y: number;
  origX: number;
  origY: number;
}

export interface FlexCurveState {
  active: boolean;
  isAttached: boolean;
  points: FlexCurveControlPoint[];
  influenceRadius: number;
  preserveLength: boolean;
}

export interface CurvePathState {
  active: boolean;
  hPointsCount: number;
  vPointsCount: number;
  hControlPoints: Point[];
  vControlPoints: Point[];
  hControlPoints0: Point[];
  vControlPoints0: Point[];
}

export interface CagePoint {
  id: string;
  originalX: number;
  originalY: number;
  currentX: number;
  currentY: number;
}

export interface CageState {
  active: boolean;
  points: CagePoint[];
  showGrid: boolean;
}

export interface LiquifyBrushSettings {
  brushSize: number;
  brushStrength: number;
  brushMode: 'push' | 'pull' | 'pinch' | 'bulge' | 'twist-cw' | 'twist-ccw' | 'restore';
}

export interface ColorMeshPoint {
  id: string;
  originalX: number;
  originalY: number;
  currentX: number;
  currentY: number;
  color: string | null;
  opacity: number;
}

export interface ColorMeshCell {
  id: string;
  pointIds: string[]; // 4 point IDs forming the quad
  color: string | null;
  opacity: number;
}

export interface SmartMeshColorState {
  densityX: number;
  densityY: number;
  points: ColorMeshPoint[];
  cells: ColorMeshCell[];
  pointSize: number;
  paintMode: 'cell' | 'point';
  brushSize: number;
  brushOpacity: number;
  brushColor?: string;
  activeLayerIndex: number;
  previewMode: boolean;
  layers: { id: string; name: string; visible: boolean; locked: boolean }[];
}

export interface SmartWarpPin {
  id: string;
  originalX: number;
  originalY: number;
  currentX: number;
  currentY: number;
  size: number;
  color: string;
  locked: boolean;
  influenceRadius: number;
  influenceFalloff: 'linear' | 'smooth' | 'sharp';
}

export interface SmartWarpState {
  pins: SmartWarpPin[];
  pinSize: number;
  influenceRadius: number;
  influenceFalloff: 'linear' | 'smooth' | 'sharp';
  showInfluenceArea: boolean;
  previewMode: boolean;
}

export interface LassoControlPoint {
  id: string;
  originalX: number;
  originalY: number;
  currentX: number;
  currentY: number;
  pointIndex: number;
  subPathIndex?: number; // if it belongs to subPaths
}

export interface Layer {
  id: string;
  name: string;
  zIndex: number;
  depth?: number; // 3D Multiplane Depth (Z-position, e.g. -500 to +500)
  parallaxFactor?: number; // Parallax motion multiplier (e.g. 0.2 to 2.0)
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: 'normal' | 'multiply' | 'screen' | 'overlay';
}

export interface FrameObjectState {
  transform: Transform;
  fillColor?: string;
  strokeColor?: string;
  opacity?: number;
  pivots?: Pivot[];
  pins?: Pivot[];
  points?: Point[];
  subPaths?: Point[][];
  [key: string]: any;
}

export interface Frame {
  index: number;
  objects: { [objectId: string]: FrameObjectState };
  boneAngles?: { [boneId: string]: number };
}

export interface LoopRule {
  id: string;
  name: string;
  targetVariable: string;
  action: 'add' | 'multiply';
  amountPerStep: number;
  direction: 'clockwise' | 'counter-clockwise' | 'positive' | 'negative';
  stopCondition: {
    type: 'after_n_steps' | 'when_loop_completes';
    steps?: number;
    triggerLoopId?: string;
    triggerCount?: number;
  };
  framesPerStep: number;
  oscillate?: boolean;
  minValue?: number;
  maxValue?: number;
}

export interface Variable {
  id: string;
  name: string;
  linkedObjectId: string;
  property: 'rotation' | 'x' | 'y' | 'scaleX' | 'scaleY' | 'opacity';
  currentValue: number;
}

export interface Project {
  id: string;
  name: string;
  canvasSize: { w: number; h: number };
  fps: number;
  layers: Layer[];
  objects: { [id: string]: VectorObject };
  frames: Frame[];
  bones: Bone[];
}

export interface BrushSettings {
  brushType: 'solid' | 'calligraphy' | 'pencil' | 'marker' | 'airbrush';
  strokeColor: string;
  strokeWidth: number;
  strokeOpacity: number;
  hardness: number;
  blur: number;
  chiselAngle?: number; // Calligraphy angle (0-180 deg)
  textureDensity?: number; // Pencil texture jitter factor
  shadowEnabled: boolean;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
}

