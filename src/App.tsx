import React, { useState, useEffect, useRef } from 'react';
import { 
  Undo2, 
  Redo2, 
  Play, 
  Pause, 
  Video, 
  Upload, 
  Download, 
  Plus, 
  Settings, 
  Sparkles,
  Combine,
  ExternalLink,
  GitPullRequest,
  Trash2,
  User,
  UserCheck,
  LogOut,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Lock,
  Mail,
  Sun,
  Moon,
  HelpCircle,
  Megaphone,
  Tv,
  Info,
  AlertCircle,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Toolbar from './components/Toolbar';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';
import CanvasArea from './components/CanvasArea';
import Timeline from './components/Timeline';
import CustomDialog, { CustomDialogConfig } from './components/CustomDialog';
import { VectorObject, Bone, Layer, Frame, Point, RealismSettings, View360, BrushSettings, Transform, LiquifyBrushSettings } from './types';
import { localToWorld, worldToLocal, rotatePoint, calculateBoundingBox, unifyStrokesToSinglePath, isPointInPolygon, findClosestView360 } from './utils/math';
import { 
  validateSimpleAuth, 
  saveUserAnimation, 
  getUserAnimation, 
  deleteUserAnimation, 
  SavedAnimationRecord,
  getSavedAnimationsQuotaStatus
} from './utils/database';
import SavedAnimationsModal from './components/SavedAnimationsModal';
import { 
  generate3DGeometry, 
  getDailyLimitStatus, 
  incrementDailyLimit,
  extrude2DTo3D
} from './utils/engine3D';
import { safeJsonParse } from './utils/securityGuard';
import { extractPNGSilhouetteContour } from './utils/pngSilhouette';
import { getInterpolatedObjects } from './utils/interpolation';

export function transformDeformPoint(
  orig: { x: number; y: number; z?: number },
  t: Transform,
  pivot: { x: number; y: number }
): { x: number; y: number; z?: number } {
  // 1. Pivot translation (move pivot to origin)
  let x = orig.x - pivot.x;
  let y = orig.y - pivot.y;
  let z = orig.z || 0;

  // 2. Scale
  const sx = t.scaleX !== undefined ? t.scaleX : 1;
  const sy = t.scaleY !== undefined ? t.scaleY : 1;
  x *= sx;
  y *= sy;

  // 3. Skew
  const skX = t.skewX || 0;
  const skY = t.skewY || 0;
  if (skX !== 0 || skY !== 0) {
    const originalX = x;
    const originalY = y;
    x = originalX + originalY * Math.tan(skX * Math.PI / 180);
    y = originalY + originalX * Math.tan(skY * Math.PI / 180);
  }

  // 4. 3D Rotations (Euler Angles)
  const rotX = t.rotateX || 0;
  const rotY = t.rotateY || 0;
  const rotZ = t.rotation || 0;

  // Pitch (Rotate around X axis)
  if (rotX !== 0) {
    const radX = rotX * Math.PI / 180;
    const cosX = Math.cos(radX);
    const sinX = Math.sin(radX);
    const newY = y * cosX - z * sinX;
    const newZ = y * sinX + z * cosX;
    y = newY;
    z = newZ;
  }

  // Yaw (Rotate around Y axis)
  if (rotY !== 0) {
    const radY = rotY * Math.PI / 180;
    const cosY = Math.cos(radY);
    const sinY = Math.sin(radY);
    const newX = x * cosY + z * sinY;
    const newZ = -x * sinY + z * cosY;
    x = newX;
    z = newZ;
  }

  // Roll (Rotate around Z axis)
  if (rotZ !== 0) {
    const radZ = rotZ * Math.PI / 180;
    const cosZ = Math.cos(radZ);
    const sinZ = Math.sin(radZ);
    const newX = x * cosZ - y * sinZ;
    const newY = x * sinZ + y * cosZ;
    x = newX;
    y = newY;
  }

  // 5. Perspective
  const perspective = t.perspective || 0;
  if (perspective > 0) {
    const sz = 1 / (1 - z / perspective);
    x *= sz;
    y *= sz;
  }

  // 6. Translation
  x += t.x;
  y += t.y;

  // 7. Pivot translation back
  return {
    x: x + pivot.x,
    y: y + pivot.y,
    z: z
  };
}

interface AdItem {
  id: number;
  title: string;
  tagline: string;
  badge: string;
  actionText: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  adKey?: string;
  format?: 'iframe' | 'script';
  height?: number;
  width?: number;
  scriptUrl?: string;
  containerId?: string;
}

const ADS_DATA: AdItem[] = [
  {
    id: 1,
    title: "Adsterra Display Banner",
    tagline: "Premium High CPM Ad Unit #30347500",
    badge: "Premium Banner",
    actionText: "Visit Ads",
    bgColor: "from-indigo-950/40 to-blue-950/20",
    borderColor: "border-indigo-500/35",
    textColor: "text-indigo-400",
    adKey: "ad94c23f3a1136f1022004bc27ce9d98",
    format: "iframe",
    height: 60,
    width: 468
  },
  {
    id: 2,
    title: "Adsterra Native Recommendation",
    tagline: "Dynamic Grid Ad Unit #30347498",
    badge: "Native Ad",
    actionText: "Learn More",
    bgColor: "from-emerald-950/40 to-teal-950/20",
    borderColor: "border-emerald-500/35",
    textColor: "text-emerald-400",
    scriptUrl: "https://sidewalkboiling.com/4bd5ce90cbeba06a602bd9cb71df2009/invoke.js",
    containerId: "container-4bd5ce90cbeba06a602bd9cb71df2009",
    format: "script"
  },
  {
    id: 3,
    title: "Adsterra Vertical Skyscraper",
    tagline: "Premium Vertical Banner #30347501",
    badge: "Skyscraper",
    actionText: "Explore",
    bgColor: "from-amber-950/40 to-orange-950/20",
    borderColor: "border-amber-500/35",
    textColor: "text-amber-400",
    adKey: "d7bf8efe3e6db8991de45e352fb95bf9",
    format: "iframe",
    height: 300,
    width: 160
  },
  {
    id: 4,
    title: "Adsterra Social Bar Overlay",
    tagline: "Active Dynamic Notification Unit #30347499",
    badge: "Social Bar",
    actionText: "View",
    bgColor: "from-rose-950/40 to-pink-950/20",
    borderColor: "border-rose-500/35",
    textColor: "text-rose-400",
    scriptUrl: "https://sidewalkboiling.com/a0/0d/e5/a00de53aadb43973cceb07c405222316.js",
    format: "script"
  },
  {
    id: 5,
    title: "Adsterra Popunder Engine",
    tagline: "Optimized High Revenue Unit #30347497",
    badge: "Popunder",
    actionText: "Details",
    bgColor: "from-purple-950/40 to-fuchsia-950/20",
    borderColor: "border-purple-500/35",
    textColor: "text-purple-400",
    scriptUrl: "https://sidewalkboiling.com/fc/64/ba/fc64ba6c8e73bd305d3e2b5feca7637c.js",
    format: "script"
  }
];

function AdsterraIframe({ adKey, format, height = 60, width = 468, scriptUrl, containerId, align = 'bottom' }: { adKey?: string; format?: string; height?: number; width?: number; scriptUrl?: string; containerId?: string; key?: string | number; align?: 'top' | 'bottom' }) {
  const adHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body { margin: 0; padding: 0; overflow: hidden; background: transparent; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
  </style>
</head>
<body>
  ${adKey ? `
  <script type="text/javascript">
    atOptions = {
      'key' : '${adKey}',
      'format' : 'iframe',
      'height' : ${height},
      'width' : ${width},
      'params' : {}
    };
  </script>
  <script type="text/javascript" src="//www.highperformanceformat.com/${adKey}/invoke.js"></script>
  ` : ''}
</body>
</html>`;

  return (
    <iframe
      srcDoc={adHtml}
      title={`Adsterra Ad ${adKey || 'Script'}`}
      width="100%"
      height="100%"
      className="border-0 bg-transparent overflow-hidden w-full h-full"
      style={{ border: 'none', outline: 'none' }}
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    />
  );
}

export default function App() {
  // Ads Index State (4 separate, continuous ads changing every 1 minute)
  const [adTick, setAdTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setAdTick(prev => prev + 1);
    }, 60000); // Changes every 1 minute!
    return () => clearInterval(interval);
  }, []);

  const topAdIndex1 = adTick % ADS_DATA.length;
  const topAdIndex2 = (adTick + 1) % ADS_DATA.length;
  const bottomAdIndex1 = (adTick + 2) % ADS_DATA.length;
  const bottomAdIndex2 = (adTick + 3) % ADS_DATA.length;

  // Toast notifications state
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }[]>([]);

  const classifyToast = (msg: string): 'success' | 'error' | 'warning' | 'info' => {
    const lowercase = msg.toLowerCase();
    if (
      lowercase.includes('success') || 
      lowercase.includes('successfully') || 
      lowercase.includes('loaded') || 
      lowercase.includes('grouped') || 
      lowercase.includes('attached') || 
      lowercase.includes('restored') || 
      lowercase.includes('saved')
    ) {
      return 'success';
    }
    if (
      lowercase.includes('blocked') || 
      lowercase.includes('error') || 
      lowercase.includes('failed') || 
      lowercase.includes('limit') || 
      lowercase.includes('safeguard') || 
      lowercase.includes('cannot') || 
      lowercase.includes('circular') || 
      lowercase.includes('must keep') || 
      lowercase.includes('not supported')
    ) {
      return 'error';
    }
    if (
      lowercase.includes('please') || 
      lowercase.includes('ensure') || 
      lowercase.includes('warning') || 
      lowercase.includes('select')
    ) {
      return 'warning';
    }
    return 'info';
  };

  const addToast = (message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    const type = classifyToast(message);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 2000); // automatically close after 2 seconds!
  };

  const [dialogConfig, setDialogConfig] = useState<CustomDialogConfig | null>(null);

  useEffect(() => {
    window.customAlert = (message: string, title: string = "Notice") => {
      return new Promise<void>((resolve) => {
        setDialogConfig({
          type: 'alert',
          title,
          message,
          onConfirm: () => {
            setDialogConfig(null);
            resolve();
          },
          onCancel: () => {
            setDialogConfig(null);
            resolve();
          }
        });
      });
    };

    window.customConfirm = (message: string, title: string = "Confirmation") => {
      return new Promise<boolean>((resolve) => {
        setDialogConfig({
          type: 'confirm',
          title,
          message,
          onConfirm: () => {
            setDialogConfig(null);
            resolve(true);
          },
          onCancel: () => {
            setDialogConfig(null);
            resolve(false);
          }
        });
      });
    };

    window.customPrompt = (message: string, defaultValue: string = "", title: string = "Input Needed") => {
      return new Promise<string | null>((resolve) => {
        setDialogConfig({
          type: 'prompt',
          title,
          message,
          defaultValue,
          onConfirm: (val) => {
            setDialogConfig(null);
            resolve(val || "");
          },
          onCancel: () => {
            setDialogConfig(null);
            resolve(null);
          }
        });
      });
    };
  }, []);

  useEffect(() => {
    const originalAlert = window.alert;
    window.alert = (message: string) => {
      addToast(message);
    };
    return () => {
      window.alert = originalAlert;
    };
  }, []);

  // Topbar Collapse States
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);

  const handleRegisterInverseDeformer = React.useCallback((fn: (pts: Point[], obj: VectorObject) => Point[]) => {
    inverseDeformRef.current = fn;
  }, []);
  const [objects, setObjects] = useState<{ [id: string]: VectorObject }>({});
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string>('SEL');

  // Deform/Mesh point selection and transform state
  const [selectedDeformPointIndex, setSelectedDeformPointIndex] = useState<number | null>(null);
  const [selectedDeformPointType, setSelectedDeformPointType] = useState<'standard' | 'grid' | '3d' | null>(null);
  const [originalDeformPointCoords, setOriginalDeformPointCoords] = useState<{ x: number; y: number; z?: number } | null>(null);
  const [deformPointTransform, setDeformPointTransform] = useState<Transform>({
    x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, rotateX: 0, rotateY: 0, perspective: 0, cameraAngleX: 0, cameraAngleY: 0
  });

  const updateDeformPointTransform = (property: string, value: number) => {
    if (!selectedObjectId || selectedDeformPointIndex === null || !selectedDeformPointType) return;
    const obj = objects[selectedObjectId];
    if (!obj) return;

    const px = obj.pivots[0]?.localX || 0;
    const py = obj.pivots[0]?.localY || 0;

    const nextTransform = {
      ...deformPointTransform,
      [property]: value
    };
    setDeformPointTransform(nextTransform);

    if (!originalDeformPointCoords) return;

    const transformed = transformDeformPoint(originalDeformPointCoords, nextTransform, { x: px, y: py });

    setObjects(prev => {
      const currentObj = prev[selectedObjectId];
      if (!currentObj) return prev;

      if (selectedDeformPointType === '3d' && currentObj.vertices3D) {
        const nextVtx = [...currentObj.vertices3D];
        if (nextVtx[selectedDeformPointIndex]) {
          nextVtx[selectedDeformPointIndex] = {
            x: Number(transformed.x.toFixed(2)),
            y: Number(transformed.y.toFixed(2)),
            z: Number((transformed.z ?? 0).toFixed(2))
          };
        }
        return {
          ...prev,
          [selectedObjectId]: {
            ...currentObj,
            vertices3D: nextVtx
          }
        };
      } else if (selectedDeformPointType === 'grid' && currentObj.meshState?.points) {
        const nextPoints = [...currentObj.meshState.points];
        if (nextPoints[selectedDeformPointIndex]) {
          nextPoints[selectedDeformPointIndex] = {
            ...nextPoints[selectedDeformPointIndex],
            currentX: Number(transformed.x.toFixed(2)),
            currentY: Number(transformed.y.toFixed(2))
          };
        }
        return {
          ...prev,
          [selectedObjectId]: {
            ...currentObj,
            meshState: {
              ...currentObj.meshState,
              points: nextPoints
            }
          }
        };
      } else {
        const nextPoints = [...currentObj.points];
        if (nextPoints[selectedDeformPointIndex]) {
          nextPoints[selectedDeformPointIndex] = {
            ...nextPoints[selectedDeformPointIndex],
            x: Number(transformed.x.toFixed(2)),
            y: Number(transformed.y.toFixed(2))
          };
        }
        return {
          ...prev,
          [selectedObjectId]: {
            ...currentObj,
            points: nextPoints
          }
        };
      }
    });
  };
  const [bones, setBones] = useState<Bone[]>([]);
  const [onionSkinEnabled, setOnionSkinEnabled] = useState(true);
  const [showBones, setShowBones] = useState(true);
  const [activeLayerId, setActiveLayerId] = useState<string>('layer_1');
  const [continuousDrawActive, setContinuousDrawActive] = useState<boolean>(false);
  const [activeContinuousDrawingId, setActiveContinuousDrawingId] = useState<string | null>(null);
  const [lassoRestrictActive, setLassoRestrictActive] = useState<boolean>(false);

  // Timeline State
  const [frames, setFrames] = useState<Frame[]>([
    { index: 0, objects: {} }
  ]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [fps, setFps] = useState(12);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoTween, setAutoTween] = useState(false);

  // Layers list
  const [layers, setLayers] = useState<Layer[]>([
    { id: 'layer_1', name: 'Layer 1', zIndex: 1, visible: true, locked: false, opacity: 1, blendMode: 'normal' }
  ]);

  // Undo/Redo Stacks
  const [undoStack, setUndoStack] = useState<any[]>([]);
  const [redoStack, setRedoStack] = useState<any[]>([]);

  // 360 Studio Interactive Drawing Wizard State
  const [is360WizardActive, setIs360WizardActive] = useState(false);
  const [draft360Views, setDraft360Views] = useState<View360[]>([]);
  const [draftAnchorId, setDraftAnchorId] = useState<string | null>(null);
  const [onionSkinEnabled360, setOnionSkinEnabled360] = useState(true);

  // Smart controls pinned list
  const [smartPinnedIds, setSmartPinnedIds] = useState<string[]>([]);

  // Lasso selection area points state
  const [lassoPoints, setLassoPoints] = useState<Point[]>([]);
  const inverseDeformRef = useRef<null | ((pts: Point[], obj: VectorObject) => Point[])>(null);
  const [fslPoints, setFslPoints] = useState<Point[]>([]);
  const [lassoMode, setLassoMode] = useState<'freehand' | 'pen'>('freehand');
  const [penLassoPoints, setPenLassoPoints] = useState<Point[]>([]);
  const [fillToolColor, setFillToolColor] = useState<string>('#4CAF50');
  const [ignoreInnerDrawings, setIgnoreInnerDrawings] = useState<boolean>(true);
  const [hideLassoSelection, setHideLassoSelection] = useState<boolean>(false);
  const [hideFslSelection, setHideFslSelection] = useState<boolean>(false);

  // Brush Custom Settings for lifelike drawing
  const [brushSettings, setBrushSettings] = useState<BrushSettings>({
    brushType: 'solid',
    strokeColor: '#000000',
    strokeWidth: 5,
    strokeOpacity: 1.0,
    hardness: 0.8,
    blur: 0,
    shadowEnabled: false,
    shadowColor: '#000000',
    shadowBlur: 4,
    shadowOffsetX: 2,
    shadowOffsetY: 2,
  });

  // Liquify brush settings
  const [liquifySettings, setLiquifySettings] = useState<LiquifyBrushSettings>({
    brushSize: 60,
    brushStrength: 0.3,
    brushMode: 'push'
  });

  // Realism Maker Settings
  const [realismSettings, setRealismSettings] = useState<RealismSettings>({
    autoTaperEnabled: false,
    minThickness: 1.5,
    maxThickness: 8.0,
    thinningFactor: 0.3,
    autoShadingEnabled: false,
    shadingLightAngle: 45,
    shadingHighlightOpacity: 0.2,
    shadingShadowOpacity: 0.3,
    microJitterEnabled: false,
    microJitterAmount: 1.5,
    paperGrainEnabled: false,
    paperGrainIntensity: 0.4,
    inkBleedEnabled: false,
    inkBleedBlur: 3,
    inkBleedOpacity: 0.3,
    inkBleedWidthOffset: 6,
  });

  // Simple Authentication & Animation Database states
  const [currentUser, setCurrentUser] = useState<string | null>(() => {
    return localStorage.getItem('animastudio_current_user');
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSavedAnimationsModalOpen, setIsSavedAnimationsModalOpen] = useState(false);
  const [savedRecord, setSavedRecord] = useState<SavedAnimationRecord | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [dbNotification, setDbNotification] = useState<{ type: 'success' | 'info' | 'error'; message: string } | null>(null);
  const [limitNotification, setLimitNotification] = useState<string | null>(null);
  const [timelineHeight, setTimelineHeight] = useState<number>(185);
  
  // Theme states
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('animastudio_theme') as 'dark' | 'light') || 'light';
  });

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('animastudio_theme', next);
  };
  const limitTimeoutRef = useRef<any>(null);

  const triggerLimitNotification = () => {
    if (limitTimeoutRef.current) {
      clearTimeout(limitTimeoutRef.current);
    }
    setLimitNotification("you have reached daily limit for 3D mesh please wait for refresh");
    limitTimeoutRef.current = setTimeout(() => {
      setLimitNotification(null);
    }, 2000);
  };

  const triggerSecurityWarning = (message: string) => {
    if (limitTimeoutRef.current) {
      clearTimeout(limitTimeoutRef.current);
    }
    setLimitNotification(message);
    limitTimeoutRef.current = setTimeout(() => {
      setLimitNotification(null);
    }, 1000);
  };

  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);

  const [shortcutHint, setShortcutHint] = useState<string | null>(null);
  const shortcutHintTimeoutRef = useRef<any>(null);

  const triggerShortcutHint = (message: string) => {
    if (shortcutHintTimeoutRef.current) {
      clearTimeout(shortcutHintTimeoutRef.current);
    }
    setShortcutHint(message);
    shortcutHintTimeoutRef.current = setTimeout(() => {
      setShortcutHint(null);
    }, 1800);
  };

  // Canvas Size States
  const [artboardW, setArtboardW] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Math.max(800, window.innerWidth - 64);
    }
    return 1400;
  });
  const [artboardH, setArtboardH] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Math.max(500, window.innerHeight - 260);
    }
    return 900;
  });
  const [showCanvasSizePanel, setShowCanvasSizePanel] = useState<boolean>(false);

  // Adaptive subdivision control
  const [adaptiveSubdivisionEnabled, setAdaptiveSubdivisionEnabled] = useState<boolean>(false);
  const [adaptiveSubdivisionPoints, setAdaptiveSubdivisionPoints] = useState<number>(3);

  // Apply Fill Forever state (defaults to true)
  const [applyFillForever, setApplyFillForever] = useState<boolean>(true);

  // Window size state for mobile responsive zoom-out container
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800
  });

  // Responsive default setups & exclusive sidebar triggers
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleResize = () => {
        setWindowSize({ width: window.innerWidth, height: window.innerHeight });
        if (window.innerWidth < 1024) {
          setLeftOpen(false);
          setRightOpen(false);
          setToolbarCollapsed(true);
        } else {
          setLeftOpen(true);
          setRightOpen(true);
          setToolbarCollapsed(false);
        }
      };
      // Run once on load
      handleResize();
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }
  }, []);

  // Strict Security Protection Effect (Right-click & DevTools Hotkey block + console warnings)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Prevent context menu (disables right-click)
    const preventContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      triggerSecurityWarning("Security Guard: Right-click is strictly disabled to secure App presets & vector assets.");
    };
    window.addEventListener('contextmenu', preventContextMenu);

    // 2. Prevent Developer tools shortcuts
    const preventDevTools = (e: KeyboardEvent) => {
      // F12
      if (e.key === 'F12' || e.keyCode === 123) {
        e.preventDefault();
        triggerSecurityWarning("Security Guard: Source inspection is locked for safety.");
        return false;
      }
      // Ctrl+Shift+I / J / C or Cmd+Option+I / J / C
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;
      if (isCtrlOrCmd && isShift && (e.key === 'i' || e.key === 'I' || e.key === 'j' || e.key === 'J' || e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        triggerSecurityWarning("Security Guard: Source code inspection and compilation overrides are locked.");
        return false;
      }
      // Ctrl+U / Cmd+Option+U (view source)
      if (isCtrlOrCmd && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        triggerSecurityWarning("Security Guard: View-source operation is blocked.");
        return false;
      }
      // Ctrl+S / Cmd+S (prevent saving page source)
      if (isCtrlOrCmd && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        triggerSecurityWarning("Security Guard: Local file cloning is blocked.");
        return false;
      }
    };
    window.addEventListener('keydown', preventDevTools);

    // 3. Clear console loop or console warn message to prevent script inject hacking
    const warningInterval = setInterval(() => {
      console.clear();
      console.log(
        "%cSECURITY ALERT: CHAVANKRUSHNA ANIMATION WORKSPACE SECURED",
        "color: #f59e0b; font-size: 24px; font-weight: 900; text-shadow: 2px 2px black;"
      );
      console.log(
        "%cAll system compilation tools, bone-riggers, and vector presets are actively secured. Source inspection or unauthorized cloning constitutes a policy violation.",
        "color: #a3a3a3; font-size: 13px;"
      );
    }, 5000);

    return () => {
      window.removeEventListener('contextmenu', preventContextMenu);
      window.removeEventListener('keydown', preventDevTools);
      clearInterval(warningInterval);
    };
  }, []);

  // Windows/Desktop Keyboard Shortcuts Handler
  const shortcutsRef = useRef<any>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. strictly for windows/desktop, not for mobile small screens
      if (typeof window !== 'undefined' && window.innerWidth < 1200) {
        return;
      }

      // 2. Ignore if typing in an input, textarea, or contentEditable element
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (
        activeTag === 'input' || 
        activeTag === 'textarea' || 
        (document.activeElement as any)?.isContentEditable
      ) {
        return;
      }

      const h = shortcutsRef.current;
      if (!h) return;

      const key = e.key.toLowerCase();
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Handle Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y / Ctrl+D
      if (isCtrlOrCmd) {
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            h.handleRedo();
            h.triggerShortcutHint("Redo (Ctrl+Shift+Z)");
          } else {
            h.handleUndo();
            h.triggerShortcutHint("Undo (Ctrl+Z)");
          }
          return;
        }
        if (key === 'y') {
          e.preventDefault();
          h.handleRedo();
          h.triggerShortcutHint("Redo (Ctrl+Y)");
          return;
        }
        if (key === 'd') {
          e.preventDefault();
          if (h.activeTool === 'SEL' && h.selectedObjectId) {
            h.deleteObject(h.selectedObjectId);
            h.triggerShortcutHint("Deleted Selected Drawing (Ctrl+D)");
          } else if (h.activeTool !== 'SEL') {
            h.triggerShortcutHint("Select Tool must be active to delete");
          } else {
            h.triggerShortcutHint("No drawing selected to delete");
          }
          return;
        }
        return;
      }

      // Handle individual keys
      switch (e.key) {
        // Spacebar: Play/Pause animation
        case ' ': {
          e.preventDefault();
          h.setIsPlaying((p: boolean) => {
            const next = !p;
            h.triggerShortcutHint(next ? "Animation Playing (Space)" : "Animation Paused");
            return next;
          });
          break;
        }
        // 's' for select
        case 's':
        case 'S': {
          e.preventDefault();
          h.setActiveTool('SEL');
          h.triggerShortcutHint("Tool: Select & Transform (S)");
          break;
        }
        // 'p' for pen
        case 'p':
        case 'P': {
          e.preventDefault();
          h.setActiveTool('PEN');
          h.triggerShortcutHint("Tool: Vector Pen (P)");
          break;
        }
        // 'b' for brush
        case 'b':
        case 'B': {
          e.preventDefault();
          h.setActiveTool('BRS');
          h.triggerShortcutHint("Tool: Brush (B)");
          break;
        }
        // 'm' for mesh
        case 'm':
        case 'M': {
          e.preventDefault();
          h.setActiveTool('MSH');
          h.triggerShortcutHint("Tool: Geometry Deform Mesh (M)");
          break;
        }
        // 'f' for fill
        case 'f':
        case 'F': {
          e.preventDefault();
          h.setActiveTool('FIL');
          h.triggerShortcutHint("Tool: Fill Bucket (F)");
          break;
        }
        // 'l' for lasso
        case 'l':
        case 'L': {
          e.preventDefault();
          h.setActiveTool('LSO');
          h.triggerShortcutHint("Tool: Lasso Selection (L)");
          break;
        }
        // 'a' for add frame
        case 'a':
        case 'A': {
          e.preventDefault();
          h.addFrame();
          h.triggerShortcutHint("Frame Added (A)");
          break;
        }
        // 'n' for next frame / switch to another frame
        case 'n':
        case 'N': {
          e.preventDefault();
          if (h.frames && h.frames.length > 0) {
            const nextIdx = (h.currentFrameIndex + 1) % h.frames.length;
            h.setCurrentFrameIndex(nextIdx);
            h.triggerShortcutHint(`Switched to Frame ${nextIdx + 1}`);
          }
          break;
        }
        // 'd' for delete frame (when not ctrl/cmd key)
        case 'd':
        case 'D': {
          e.preventDefault();
          if (h.frames && h.frames.length > 1) {
            const frameToDelete = h.currentFrameIndex;
            h.deleteFrame(frameToDelete);
            h.triggerShortcutHint(`Deleted Frame ${frameToDelete + 1}`);
          } else {
            h.triggerShortcutHint("Cannot delete the only frame");
          }
          break;
        }
        // 'e' for eraser
        case 'e':
        case 'E': {
          e.preventDefault();
          h.setActiveTool('ERS');
          h.triggerShortcutHint("Tool: Eraser (E)");
          break;
        }
        // 'v' for pivot point
        case 'v':
        case 'V': {
          e.preventDefault();
          h.setActiveTool('PVT');
          h.triggerShortcutHint("Tool: Pivot Point (V)");
          break;
        }
        // 'k' for knife
        case 'k':
        case 'K': {
          e.preventDefault();
          h.setActiveTool('KNF');
          h.triggerShortcutHint("Tool: Knife (K)");
          break;
        }
        // 'z' for zoom
        case 'z':
        case 'Z': {
          e.preventDefault();
          h.setActiveTool('ZOM');
          h.triggerShortcutHint("Tool: Zoom & Pan (Z)");
          break;
        }
        // 'u' for unselecting selected drawing
        case 'u':
        case 'U': {
          e.preventDefault();
          if (h.setSelectedObjectId) {
            h.setSelectedObjectId(null);
            h.triggerShortcutHint("Unselected Drawing (U)");
          }
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleSetLeftOpen = (val: boolean | ((prev: boolean) => boolean)) => {
    setLeftOpen(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      if (next && typeof window !== 'undefined' && window.innerWidth < 1024) {
        setTimeout(() => setRightOpen(false), 0);
      }
      return next;
    });
  };

  const handleSetRightOpen = (val: boolean | ((prev: boolean) => boolean)) => {
    setRightOpen(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      if (next && typeof window !== 'undefined' && window.innerWidth < 1024) {
        setTimeout(() => setLeftOpen(false), 0);
      }
      return next;
    });
  };

  // Check user saved records on login or on initial render
  useEffect(() => {
    if (currentUser) {
      const { record, wasDeleted } = getUserAnimation(currentUser);
      if (wasDeleted) {
        setSavedRecord(null);
        setDbNotification({
          type: 'info',
          message: 'Notice: Your previously saved animation was deleted automatically because it was more than 1 day old.'
        });
        setTimeout(() => setDbNotification(null), 8000);
      } else if (record) {
        setSavedRecord(record);
      } else {
        setSavedRecord(null);
      }
    } else {
      setSavedRecord(null);
    }
  }, [currentUser]);

  // Periodic age-check (runs every 10 seconds to auto-expire if the page stays open)
  useEffect(() => {
    const interval = setInterval(() => {
      if (currentUser && savedRecord) {
        const { record, wasDeleted } = getUserAnimation(currentUser);
        if (wasDeleted) {
          setSavedRecord(null);
          setDbNotification({
            type: 'info',
            message: 'Your saved animation has just reached the 1-day threshold and was deleted.'
          });
          setTimeout(() => setDbNotification(null), 6000);
        }
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [currentUser, savedRecord]);

  const handleSaveToDatabase = () => {
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }

    try {
      const record = saveUserAnimation(currentUser, {
        fps,
        layers,
        objects,
        frames,
        bones,
      });
      setSavedRecord(record);
      setDbNotification({
        type: 'success',
        message: 'Successfully saved current workspace animation to database!'
      });
      setTimeout(() => setDbNotification(null), 4000);
    } catch (e) {
      setDbNotification({
        type: 'error',
        message: 'Failed to save to database.'
      });
      setTimeout(() => setDbNotification(null), 4000);
    }
  };

  const handleLoadFromDatabase = () => {
    if (!currentUser || !savedRecord) return;

    // Run age check first
    const { record, wasDeleted } = getUserAnimation(currentUser);
    if (wasDeleted) {
      setSavedRecord(null);
      setDbNotification({
        type: 'error',
        message: 'Unable to load: Your saved animation expired (older than 1 day) and was deleted.'
      });
      setTimeout(() => setDbNotification(null), 6000);
      return;
    }

    if (record) {
      historyPush();
      if (record.objects) setObjects(JSON.parse(JSON.stringify(record.objects)));
      if (record.bones) setBones(JSON.parse(JSON.stringify(record.bones)));
      if (record.frames) setFrames(JSON.parse(JSON.stringify(record.frames)));
      if (record.layers) setLayers(JSON.parse(JSON.stringify(record.layers)));
      if (record.fps) setFps(record.fps);
      
      setCurrentFrameIndex(0);
      setSelectedObjectId(null);

      setDbNotification({
        type: 'success',
        message: 'Successfully restored saved animation from the database!'
      });
      setTimeout(() => setDbNotification(null), 4000);
    }
  };

  const handleLoadProjectFromModal = (record: SavedAnimationRecord) => {
    historyPush();
    if (record.objects) setObjects(JSON.parse(JSON.stringify(record.objects)));
    if (record.bones) setBones(JSON.parse(JSON.stringify(record.bones)));
    if (record.frames) setFrames(JSON.parse(JSON.stringify(record.frames)));
    if (record.layers) setLayers(JSON.parse(JSON.stringify(record.layers)));
    if (record.fps) setFps(record.fps);
    
    setCurrentFrameIndex(0);
    setSelectedObjectId(null);

    setDbNotification({
      type: 'success',
      message: `Successfully loaded "${record.title}" into workspace!`
    });
    setTimeout(() => setDbNotification(null), 4000);
  };

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    const res = validateSimpleAuth(authEmail, authPassword);
    if (res.success) {
      const normalizedEmail = authEmail.trim().toLowerCase();
      localStorage.setItem('animastudio_current_user', normalizedEmail);
      setCurrentUser(normalizedEmail);
      setIsAuthModalOpen(false);
      setAuthPassword('');
      
      const { record, wasDeleted } = getUserAnimation(normalizedEmail);
      if (record) {
        setSavedRecord(record);
        setDbNotification({
          type: 'success',
          message: `Logged in as ${normalizedEmail}. Found your saved animation!`
        });
      } else if (wasDeleted) {
        setDbNotification({
          type: 'info',
          message: `Logged in as ${normalizedEmail}. Your previous animation had expired and was auto-deleted.`
        });
      } else {
        setDbNotification({
          type: 'success',
          message: `Logged in as ${normalizedEmail}!`
        });
      }
      setTimeout(() => setDbNotification(null), 5000);
    } else {
      setAuthError(res.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('animastudio_current_user');
    setCurrentUser(null);
    setSavedRecord(null);
    setIsProfileDropdownOpen(false);
    setDbNotification({
      type: 'info',
      message: 'Logged out successfully.'
    });
    setTimeout(() => setDbNotification(null), 3000);
  };

  const handleDeleteSavedAnimation = () => {
    if (currentUser) {
      deleteUserAnimation(currentUser);
      setSavedRecord(null);
      setDbNotification({
        type: 'info',
        message: 'Deleted saved animation from database.'
      });
      setTimeout(() => setDbNotification(null), 3000);
    }
  };

  // Ref to track the currently loaded frame index to prevent race conditions & update loops
  const loadedFrameIndexRef = useRef<number>(-1);
  const lastSyncedObjectsRef = useRef<string>('');
  const isDirtyRef = useRef<boolean>(false);

  const objectsRef = useRef(objects);
  objectsRef.current = objects;

  const autoTweenRef = useRef(autoTween);
  autoTweenRef.current = autoTween;

  // Keep a stable reference to the frames array to break the feedback loop during rapid dragging
  const framesRef = useRef(frames);
  framesRef.current = frames;

  // Synchronize active objects back and forth between active frame and objects dictionary
  useEffect(() => {
    const currentFrames = framesRef.current;

    // 1. If we changed frame index, we MUST load objects from that target frame
    if (currentFrameIndex !== loadedFrameIndexRef.current) {
      const oldFrameIndex = loadedFrameIndexRef.current;
      const currentObjects = objectsRef.current;
      const currentObjectsStr = JSON.stringify(currentObjects);

      // Synchronously save any changes from the frame we are leaving before we load the new frame!
      if (isDirtyRef.current && oldFrameIndex >= 0 && oldFrameIndex < currentFrames.length) {
        setFrames(prev => {
          if (!prev[oldFrameIndex]) return prev;
          const currentFrameObjectsInState = prev[oldFrameIndex].objects || {};
          if (JSON.stringify(currentFrameObjectsInState) !== currentObjectsStr) {
            const updated = [...prev];
            updated[oldFrameIndex] = {
              ...updated[oldFrameIndex],
              objects: JSON.parse(currentObjectsStr)
            };
            return updated;
          }
          return prev;
        });

        isDirtyRef.current = false;
      }

      loadedFrameIndexRef.current = currentFrameIndex;

      // Now fetch and load target frame
      const targetFrame = currentFrames[currentFrameIndex];
      if (targetFrame) {
        const parsed = JSON.parse(JSON.stringify(targetFrame.objects || {}));
        const parsedStr = JSON.stringify(parsed);

        lastSyncedObjectsRef.current = parsedStr;
        objectsRef.current = parsed;
        setObjects(parsed);
        isDirtyRef.current = false;
        return;
      } else if (currentFrameIndex > 0) {
        // Fallback: copy from previous frame if the current frame is empty or undefined
        const prevFrame = currentFrames[currentFrameIndex - 1];
        if (prevFrame && prevFrame.objects && Object.keys(prevFrame.objects).length > 0) {
          const copiedObjects = JSON.parse(JSON.stringify(prevFrame.objects));
          const copiedStr = JSON.stringify(copiedObjects);

          lastSyncedObjectsRef.current = copiedStr;
          objectsRef.current = copiedObjects;
          setObjects(copiedObjects);
          isDirtyRef.current = false;

          setFrames(prev => {
            if (!prev[currentFrameIndex]) return prev;
            const updated = [...prev];
            updated[currentFrameIndex] = {
              ...updated[currentFrameIndex],
              objects: copiedObjects
            };
            return updated;
          });
          return;
        } else {
          lastSyncedObjectsRef.current = '{}';
          objectsRef.current = {};
          setObjects({});
          isDirtyRef.current = false;
          return;
        }
      } else {
        lastSyncedObjectsRef.current = '{}';
        objectsRef.current = {};
        setObjects({});
        isDirtyRef.current = false;
        return;
      }
    } else {
      // 2. Otherwise, we are on the same frame, so sync any changes in 'objects' back to 'frames'
      const currentObjectsStr = JSON.stringify(objects);
      // If it matches our last synchronized string, skip synchronization to prevent loops!
      if (currentObjectsStr === lastSyncedObjectsRef.current) {
        return;
      }

      isDirtyRef.current = true;

      // Debounce updating frames during rapid actions like dragging or drawing to completely eliminate infinite update loops!
      const handler = setTimeout(() => {
        const currentObjects = objectsRef.current;
        const checkStr = JSON.stringify(currentObjects);
        if (checkStr !== lastSyncedObjectsRef.current) {
          lastSyncedObjectsRef.current = checkStr;
          
          setFrames(prev => {
            if (!prev[currentFrameIndex]) return prev;
            const currentFrameObjectsInState = prev[currentFrameIndex].objects || {};
            
            const currentKeys = Object.keys(currentObjects);
            const savedKeys = Object.keys(currentFrameObjectsInState);
            
            const addedKeys = currentKeys.filter(k => !savedKeys.includes(k));
            const deletedKeys = savedKeys.filter(k => !currentKeys.includes(k));
            
            if (addedKeys.length > 0 || deletedKeys.length > 0 || 
                JSON.stringify(currentFrameObjectsInState) !== checkStr) {
              
              if (addedKeys.length === 0 && deletedKeys.length === 0) {
                const updated = [...prev];
                updated[currentFrameIndex] = {
                  ...updated[currentFrameIndex],
                  objects: JSON.parse(checkStr)
                };
                return updated;
              }

              const updated = prev.map((f, idx) => {
                const frameObjects = JSON.parse(JSON.stringify(f.objects || {})); // Deep clone to prevent direct state mutation!
                
                // Delete deleted objects from all frames
                deletedKeys.forEach(k => {
                  delete frameObjects[k];
                });
                
                // Sync new objects to all frames
                addedKeys.forEach(k => {
                  if (currentObjects[k] && !frameObjects[k]) {
                    frameObjects[k] = JSON.parse(JSON.stringify(currentObjects[k]));
                  }
                });

                if (idx === currentFrameIndex) {
                  return {
                    ...f,
                    objects: JSON.parse(checkStr)
                  };
                } else {
                  return {
                    ...f,
                    objects: frameObjects
                  };
                }
              });
              
              return updated;
            }
            return prev;
          });
        }
      }, 150);

      return () => clearTimeout(handler);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFrameIndex, objects]);

  // Export video recorder states
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Push to history helper
  const historyPush = () => {
    const stateSnapshot = {
      objects: JSON.parse(JSON.stringify(objects)),
      bones: JSON.parse(JSON.stringify(bones)),
    };
    setUndoStack(prev => [...prev.slice(-15), stateSnapshot]); // Limit memory stack to 15 actions
    setRedoStack([]);
  };

  // Powerful transform-propagating update helper
  const updateObject = (id: string, updates: Partial<VectorObject>) => {
    setObjects(prev => {
      const updated = { ...prev };
      const obj = updated[id];
      if (!obj) return prev;

      const updatedObj = { ...obj, ...updates };

      // Multi-part drawing one-tap recoloring logic
      if (updates.fillColor !== undefined) {
        const newFill = updates.fillColor;
        if (updatedObj.subPaths && updatedObj.subPaths.length > 0) {
          const nextSubPathFills: { [subPathIdx: number]: string } = {};
          updatedObj.subPaths.forEach((_, idx) => {
            nextSubPathFills[idx] = newFill;
          });
          updatedObj.subPathFills = nextSubPathFills;
        }
        if (updatedObj.lassoFills && updatedObj.lassoFills.length > 0) {
          updatedObj.lassoFills = updatedObj.lassoFills.map(lf => ({ ...lf, color: newFill }));
        }
      }

      if (updates.strokeColor !== undefined) {
        const newStroke = updates.strokeColor;
        if (updatedObj.subPaths && updatedObj.subPaths.length > 0) {
          const nextSubPathStrokes: { [subPathIdx: number]: { strokeColor?: string; strokeWidth?: number } } = {};
          updatedObj.subPaths.forEach((_, idx) => {
            nextSubPathStrokes[idx] = {
              strokeColor: newStroke,
              strokeWidth: updatedObj.strokeWidth
            };
          });
          updatedObj.subPathStrokes = nextSubPathStrokes;
        }
      }

      // Route 360_container drawing/style/deform updates strictly to the currently active view object
      if (obj.type === '360_container' && obj.views360 && obj.views360.length > 0) {
        // R3: Master position drag/move updates stage position for ALL views in the 360 container
        if (updates.transform) {
          obj.views360.forEach(v => {
            if (v.drawingId && updated[v.drawingId]) {
              updated[v.drawingId] = {
                ...updated[v.drawingId],
                transform: {
                  ...updated[v.drawingId].transform,
                  x: updates.transform!.x,
                  y: updates.transform!.y,
                  rotation: updates.transform!.rotation,
                  scaleX: updates.transform!.scaleX,
                  scaleY: updates.transform!.scaleY
                }
              };
            }
          });
        }

        // R5 & R6: Route costume/style/deform/color updates strictly to the currently ACTIVE view object ONLY
        const activeView = findClosestView360(obj.views360, obj.currentAngle360 ?? 0);
        if (activeView && updated[activeView.drawingId]) {
          const activeDrawing = updated[activeView.drawingId];
          const drawingKeys = [
            'points', 'subPaths', 'image', 'imageUrl', 'fillColor', 'strokeColor', 'strokeWidth',
            'opacity', 'strokeOpacity', 'shadowColor', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY',
            'tintColor', 'tintIntensity', 'rimLightColor', 'rimLightIntensity', 'blur', 'blendMode',
            'wireframeMode', 'lightingMode', 'transform3D', 'depth3D', 'extrusionColor', 'subExtrusions',
            'bones3D', 'smartMeshColor', 'pivots', 'pins', 'deform', 'keepOnlyLassoRegions', 'lassoFills',
            'subPathFills', 'subPathStrokes', 'mouthCavityColor', 'customColor', 'lassoDeformState', 'meshState',
            'hiddenLassoRegions', 'pngPatchedCanvas', 'pngPatchedDataUrl', 'parts', 'extractedParts',
            'smartWarp', 'cageState', 'vertices3D', 'subPaths3D', 'faces3D', 'splineActive', 'customVectorDeformState'
          ];
          const drawingUpdates: Partial<VectorObject> = {};
          drawingKeys.forEach(k => {
            if ((updates as any)[k] !== undefined) {
              (drawingUpdates as any)[k] = (updates as any)[k];
            }
          });
          if (Object.keys(drawingUpdates).length > 0) {
            updated[activeView.drawingId] = { ...activeDrawing, ...drawingUpdates };
          }
        }
      }

      // Propagate colors to attached group drawings / multi-part siblings
      if (obj.attachedGroupId && (updates.fillColor !== undefined || updates.strokeColor !== undefined)) {
        Object.keys(updated).forEach(k => {
          if (k !== id && updated[k].attachedGroupId === obj.attachedGroupId) {
            const sibling = updated[k];
            const siblingUpdates: Partial<VectorObject> = {};
            if (updates.fillColor !== undefined) {
              siblingUpdates.fillColor = updates.fillColor;
              if (sibling.subPaths && sibling.subPaths.length > 0) {
                const sFills: { [idx: number]: string } = {};
                sibling.subPaths.forEach((_, idx) => { sFills[idx] = updates.fillColor!; });
                siblingUpdates.subPathFills = sFills;
              }
            }
            if (updates.strokeColor !== undefined) {
              siblingUpdates.strokeColor = updates.strokeColor;
              if (sibling.subPaths && sibling.subPaths.length > 0) {
                const sStrokes: { [idx: number]: any } = {};
                sibling.subPaths.forEach((_, idx) => { sStrokes[idx] = { strokeColor: updates.strokeColor, strokeWidth: sibling.strokeWidth }; });
                siblingUpdates.subPathStrokes = sStrokes;
              }
            }
            updated[k] = { ...sibling, ...siblingUpdates };
          }
        });
      }

      // Automatically update 3D sub-paths if this is a 3D model with 2D subpaths
      if (updatedObj.type === '3d' && updatedObj.subPaths && updatedObj.subPaths.length > 0) {
        const depthVal = updatedObj.depth3D !== undefined ? updatedObj.depth3D : 40;
        let cx = 0, cy = 0;
        const pts = updatedObj.originalPointsBackup || updatedObj.points;
        if (pts && pts.length > 0) {
          const sumX = pts.reduce((sum, p) => sum + p.x, 0);
          const sumY = pts.reduce((sum, p) => sum + p.y, 0);
          cx = sumX / pts.length;
          cy = sumY / pts.length;
        }
        updatedObj.subPaths3D = updatedObj.subPaths.map(sub => {
          return sub.map(p => ({
            x: p.x - cx,
            y: p.y - cy,
            z: -depthVal / 2 - 0.5
          }));
        });
      }

      updated[id] = updatedObj;

      // If transform changed, propagate down the parent-child hierarchy!
      if (updates.transform) {
        const origT = obj.transform;
        const newT = updates.transform;

        // Propagate recursively
        const propagate = (
          parentId: string,
          parentOrigT: Transform,
          parentNewT: Transform,
          movedSet: Set<string> = new Set<string>()
        ) => {
          movedSet.add(parentId);

          const parentObj = updated[parentId];
          if (!parentObj) return;

          const pPivot = parentObj.pivots?.[0] || { localX: 0, localY: 0 };
          const oldParentPivotWorld = {
            x: parentOrigT.x + pPivot.localX,
            y: parentOrigT.y + pPivot.localY,
          };
          const newParentPivotWorld = {
            x: parentNewT.x + pPivot.localX,
            y: parentNewT.y + pPivot.localY,
          };

          // Scale factor changes
          const sXRatio = parentOrigT.scaleX !== 0 ? (parentNewT.scaleX ?? 1) / parentOrigT.scaleX : 1;
          const sYRatio = parentOrigT.scaleY !== 0 ? (parentNewT.scaleY ?? 1) / parentOrigT.scaleY : 1;

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

          const deltaRot = (parentNewT.rotation ?? 0) - (parentOrigT.rotation ?? 0);
          const dRotX = (parentNewT.rotateX ?? 0) - (parentOrigT.rotateX ?? 0);
          const dRotY = (parentNewT.rotateY ?? 0) - (parentOrigT.rotateY ?? 0);
          const dSkewX = (parentNewT.skewX ?? 0) - (parentOrigT.skewX ?? 0);
          const dSkewY = (parentNewT.skewY ?? 0) - (parentOrigT.skewY ?? 0);
          const dPersp = (parentNewT.perspective ?? 0) - (parentOrigT.perspective ?? 0);
          const dCamX = (parentNewT.cameraAngleX ?? 0) - (parentOrigT.cameraAngleX ?? 0);
          const dCamY = (parentNewT.cameraAngleY ?? 0) - (parentOrigT.cameraAngleY ?? 0);

          // Get direct child IDs
          const childIds = Object.keys(updated).filter(k => updated[k].parentId === parentId);

          for (const childId of childIds) {
            if (movedSet.has(childId)) continue; // Prevent double propagation/loops

            const child = updated[childId];
            if (!child) continue;

            const childOrigT = { ...child.transform };

            // Vector from old parent pivot to child old position
            const vecX = childOrigT.x - oldParentPivotWorld.x;
            const vecY = childOrigT.y - oldParentPivotWorld.y;

            // Scale vector (2D scale + 3D pitch/yaw squash)
            const scaledVecX = vecX * sXRatio * yawScale;
            const scaledVecY = vecY * sYRatio * pitchScale;

            // Rotate vector around origin by deltaRot
            const rotatedVec = rotatePoint({ x: scaledVecX, y: scaledVecY }, deltaRot, { x: 0, y: 0 });

            // Child new world position relative to new parent pivot
            const childNewX = Number((newParentPivotWorld.x + rotatedVec.x).toFixed(2));
            const childNewY = Number((newParentPivotWorld.y + rotatedVec.y).toFixed(2));

            const childNewT: Transform = {
              ...childOrigT,
              x: childNewX,
              y: childNewY,
              rotation: Number(((childOrigT.rotation ?? 0) + deltaRot).toFixed(2)),
              scaleX: Number(((childOrigT.scaleX ?? 1) * sXRatio * yawScale).toFixed(2)),
              scaleY: Number(((childOrigT.scaleY ?? 1) * sYRatio * pitchScale).toFixed(2)),
              rotateX: Number(((childOrigT.rotateX ?? 0) + dRotX).toFixed(2)),
              rotateY: Number(((childOrigT.rotateY ?? 0) + dRotY).toFixed(2)),
              skewX: Number(((childOrigT.skewX ?? 0) + dSkewX).toFixed(2)),
              skewY: Number(((childOrigT.skewY ?? 0) + dSkewY).toFixed(2)),
              perspective: Number(((childOrigT.perspective ?? 0) + dPersp).toFixed(2)),
              cameraAngleX: Number(((childOrigT.cameraAngleX ?? 0) + dCamX).toFixed(2)),
              cameraAngleY: Number(((childOrigT.cameraAngleY ?? 0) + dCamY).toFixed(2)),
            };

            updated[childId] = {
              ...child,
              transform: childNewT
            };

            // Recursive propagation down the chain
            propagate(childId, childOrigT, childNewT, movedSet);
          }
        };

        const globalMovedSet = new Set<string>();
        globalMovedSet.add(id);

        // 1. Instantly propagate translation for permanently attached sibling group
        const dX = (newT.x !== undefined ? newT.x : origT.x) - origT.x;
        const dY = (newT.y !== undefined ? newT.y : origT.y) - origT.y;

        if (obj.attachedGroupId && (dX !== 0 || dY !== 0)) {
          Object.keys(updated).forEach(k => {
            if (k !== id && updated[k].attachedGroupId === obj.attachedGroupId) {
              const sibling = updated[k];
              const siblingOrigT = { ...sibling.transform };
              const siblingNewT = {
                ...sibling.transform,
                x: Number((sibling.transform.x + dX).toFixed(2)),
                y: Number((sibling.transform.y + dY).toFixed(2))
              };
              updated[k] = {
                ...sibling,
                transform: siblingNewT
              };
              globalMovedSet.add(k);

              // Propagate hierarchical transformations down from each sibling
              propagate(k, siblingOrigT, siblingNewT, globalMovedSet);
            }
          });
        }

        // 2. Propagate parent-child hierarchies from the modified object
        propagate(id, origT, newT, globalMovedSet);
      }

      return updated;
    });
  };

  const duplicateObject = (id: string, offset = { x: 30, y: 30 }) => {
    try {
      const original = objects[id];
      if (!original) {
        alert("Duplication Error: The selected drawing could not be found.");
        return null;
      }

      historyPush();

      const newId = `obj_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      
      const newPivots = original.pivots.map(p => ({
        ...p,
        id: `pvt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
      }));

      const newPins = original.pins ? original.pins.map(p => ({
        ...p,
        id: `pvt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
      })) : undefined;

      const newObj: VectorObject = {
        ...original,
        id: newId,
        name: `${original.name}_copy`,
        points: original.points ? original.points.map(p => ({ ...p })) : [],
        subPaths: original.subPaths ? original.subPaths.map(path => path.map(p => ({ ...p }))) : undefined,
        pivots: newPivots,
        pins: newPins,
        transform: {
          ...original.transform,
          x: original.transform.x + offset.x,
          y: original.transform.y + offset.y
        },
        parentId: null,
        childrenIds: []
      };

      setObjects(prev => ({
        ...prev,
        [newId]: newObj
      }));

      setSelectedObjectId(newId);
      return newId;
    } catch (err: any) {
      console.error("Duplication error:", err);
      alert(`Failed to duplicate drawing: ${err.message || err}`);
      return null;
    }
  };

  const isPointInPolygonLocal = (p: Point, polygon: Point[]): boolean => {
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
  };

  const getObjectWorldCenterLocal = (obj: VectorObject) => {
    if (obj.pivots && obj.pivots.length > 0) {
      const pvt = obj.pivots[0];
      return {
        x: obj.transform.x + pvt.localX,
        y: obj.transform.y + pvt.localY
      };
    }
    if (obj.points && obj.points.length > 0) {
      let sumX = 0;
      let sumY = 0;
      obj.points.forEach(p => {
        sumX += p.x;
        sumY += p.y;
      });
      return {
        x: obj.transform.x + sumX / obj.points.length,
        y: obj.transform.y + sumY / obj.points.length
      };
    }
    return { x: obj.transform.x, y: obj.transform.y };
  };

  const duplicateLassoBatch = () => {
    try {
      if (!lassoPoints || lassoPoints.length < 3) {
        alert("Please draw a closed lasso loop around the drawings you wish to duplicate.");
        return;
      }

      const targets = (Object.values(objects) as VectorObject[]).filter(obj => {
        if (obj.isHidden || obj.isLocked) return false;
        if (obj.type === '360_container') return false; // skip containers
        const center = getObjectWorldCenterLocal(obj);
        return isPointInPolygonLocal(center, lassoPoints);
      });

      if (targets.length === 0) {
        alert("No active drawings found inside the lasso selection loop! Ensure the target drawings are visible and unlocked.");
        return;
      }

      historyPush();

      const newObjects: { [id: string]: VectorObject } = {};
      const duplicatedIds: string[] = [];

      targets.forEach((original, index) => {
        const newId = `obj_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`;
        const newPivots = original.pivots.map(p => ({
          ...p,
          id: `pvt_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`
        }));
        const newPins = original.pins ? original.pins.map(p => ({
          ...p,
          id: `pvt_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`
        })) : undefined;

        const newObj: VectorObject = {
          ...original,
          id: newId,
          name: `${original.name}_copy`,
          points: original.points ? original.points.map(p => ({ ...p })) : [],
          subPaths: original.subPaths ? original.subPaths.map(path => path.map(p => ({ ...p }))) : undefined,
          pivots: newPivots,
          pins: newPins,
          transform: {
            ...original.transform,
            x: original.transform.x + 40,
            y: original.transform.y + 40
          },
          parentId: null,
          childrenIds: []
        };

        newObjects[newId] = newObj;
        duplicatedIds.push(newId);
      });

      setObjects(prev => ({
        ...prev,
        ...newObjects
      }));

      if (duplicatedIds.length > 0) {
        setSelectedObjectId(duplicatedIds[0]);
      }
      
      // Clear lasso points to complete action
      setLassoPoints([]);
      
      alert(`Successfully duplicated ${targets.length} drawings in batch!`);
    } catch (err: any) {
      console.error("Batch duplication error:", err);
      alert(`Failed to complete batch duplication: ${err.message || err}`);
    }
  };

  const applyColorFillToId = (id: string, color: string, ignoreInner: boolean) => {
    setObjects(prev => {
      const clickedObj = prev[id];
      if (!clickedObj) return prev;

      const updated = { ...prev };

      const updateSingleObjColor = (targetId: string, targetObj: VectorObject) => {
        const newFill = color;
        const newStroke = (targetObj.strokeColor && targetObj.strokeColor !== 'transparent') ? targetObj.strokeColor : color;

        const subFills: { [subPathIdx: number]: string } = {};
        const subStrokes: { [subPathIdx: number]: { strokeColor?: string; strokeWidth?: number } } = {};
        if (targetObj.subPaths && targetObj.subPaths.length > 0) {
          targetObj.subPaths.forEach((_, idx) => {
            subFills[idx] = newFill;
            subStrokes[idx] = { strokeColor: newStroke, strokeWidth: targetObj.strokeWidth };
          });
        }

        return {
          ...targetObj,
          fillColor: newFill,
          strokeColor: newStroke,
          subPathFills: Object.keys(subFills).length > 0 ? subFills : targetObj.subPathFills,
          subPathStrokes: Object.keys(subStrokes).length > 0 ? subStrokes : targetObj.subPathStrokes,
          lassoFills: targetObj.lassoFills ? targetObj.lassoFills.map(lf => ({ ...lf, color: newFill })) : targetObj.lassoFills
        };
      };

      const targetIdsToRecolor = new Set<string>([id]);

      if (clickedObj.type === '360_container' && clickedObj.views360) {
        const activeView = findClosestView360(clickedObj.views360, clickedObj.currentAngle360 ?? 0);
        if (activeView && activeView.drawingId) {
          targetIdsToRecolor.add(activeView.drawingId);
        }
      }

      (Object.values(prev) as VectorObject[]).forEach(container => {
        if (container.type === '360_container' && container.views360) {
          if (container.views360.some(v => v.drawingId === id)) {
            const activeView = findClosestView360(container.views360, container.currentAngle360 ?? 0);
            if (activeView && activeView.drawingId === id) {
              targetIdsToRecolor.add(container.id);
            }
          }
        }
      });

      targetIdsToRecolor.forEach(tId => {
        if (updated[tId]) {
          updated[tId] = updateSingleObjColor(tId, updated[tId]);
        }
      });

      // Apply color to all attached group drawings and child drawings in one tap
      Object.keys(updated).forEach(k => {
        if (!targetIdsToRecolor.has(k) && (
          (clickedObj.attachedGroupId && updated[k].attachedGroupId === clickedObj.attachedGroupId) ||
          updated[k].parentId === id ||
          clickedObj.parentId === k
        )) {
          updated[k] = updateSingleObjColor(k, updated[k]);
        }
      });

      return updated;
    });
  };

  const applyColorFillToSelected = () => {
    if (activeTool !== 'FIL') {
      alert("Please select the Fill Tool (Paint Bucket) first.");
      return;
    }
    if (!selectedObjectId) {
      alert("Please select a drawing on the canvas first.");
      return;
    }
    historyPush();
    applyColorFillToId(selectedObjectId, fillToolColor, ignoreInnerDrawings);
  };

  const deleteLassoBatch = () => {
    try {
      if (!lassoPoints || lassoPoints.length < 3) {
        alert("Please draw a closed lasso loop around the parts you want to delete.");
        return;
      }

      const targets: VectorObject[] = [];
      (Object.values(objects) as VectorObject[]).forEach(rawObj => {
        let obj = rawObj;
        if (rawObj.type === '360_container' && rawObj.views360) {
          const activeView = findClosestView360(rawObj.views360, rawObj.currentAngle360 ?? 0);
          if (activeView && objects[activeView.drawingId]) {
            obj = objects[activeView.drawingId];
          } else {
            return;
          }
        }
        if (obj.isHidden || obj.isLocked) return;
        
        const localPivot = obj.pivots[0] || { localX: 0, localY: 0 };
        const worldPts = (obj.points || []).map(p => localToWorld(p, obj.transform, localPivot));
        const boundsObj = calculateBoundingBox(worldPts);
        const boundsLasso = calculateBoundingBox(lassoPoints);
        
        const overlaps = !(boundsObj.x + boundsObj.width < boundsLasso.x ||
                 boundsLasso.x + boundsLasso.width < boundsObj.x ||
                 boundsObj.y + boundsObj.height < boundsLasso.y ||
                 boundsLasso.y + boundsLasso.height < boundsObj.y);
        if (overlaps) {
          targets.push(obj);
        }
      });

      if (targets.length === 0) {
        alert("No intersecting drawings found inside the lasso area.");
        return;
      }

      historyPush();

      setObjects(prev => {
        const updated = { ...prev };
        targets.forEach(obj => {
          const localPivot = obj.pivots[0] || { localX: 0, localY: 0 };
          const localLassoPoints = lassoPoints.map(wp => worldToLocal(wp, obj.transform, localPivot));
          
          const currentHidden = obj.hiddenLassoRegions || [];
          updated[obj.id] = {
            ...obj,
            hiddenLassoRegions: [...currentHidden, { localLassoPoints }]
          };
        });
        return updated;
      });

      setLassoPoints([]);
      alert(`Successfully deleted lassoed area from ${targets.length} drawings!`);
    } catch (err: any) {
      console.error("Lasso delete error:", err);
      alert(`Failed to perform lasso delete: ${err.message || err}`);
    }
  };

  const separateLassoBatch = () => {
    try {
      if (!lassoPoints || lassoPoints.length < 3) {
        alert("Please draw a closed lasso loop around the area you wish to separate.");
        return;
      }

      const targets = (Object.values(objects) as VectorObject[]).filter(obj => {
        if (obj.isHidden || obj.isLocked) return false;
        if (obj.type === '360_container') return false;
        
        const localPivot = obj.pivots[0] || { localX: 0, localY: 0 };
        const worldPts = (obj.points || []).map(p => localToWorld(p, obj.transform, localPivot));
        const boundsObj = calculateBoundingBox(worldPts);
        const boundsLasso = calculateBoundingBox(lassoPoints);
        
        return !(boundsObj.x + boundsObj.width < boundsLasso.x ||
                 boundsLasso.x + boundsLasso.width < boundsObj.x ||
                 boundsObj.y + boundsObj.height < boundsLasso.y ||
                 boundsLasso.y + boundsLasso.height < boundsObj.y);
      });

      if (targets.length === 0) {
        alert("No intersecting drawings found inside the lasso area to separate.");
        return;
      }

      historyPush();

      setObjects(prev => {
        const updated = { ...prev };
        targets.forEach((obj, index) => {
          const localPivot = obj.pivots[0] || { localX: 0, localY: 0 };
          const localLassoPoints = lassoPoints.map(wp => worldToLocal(wp, obj.transform, localPivot));
          
          const currentHidden = obj.hiddenLassoRegions || [];
          updated[obj.id] = {
            ...obj,
            hiddenLassoRegions: [...currentHidden, { localLassoPoints }]
          };

          const newId = `obj_sep_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`;
          const newPivots = obj.pivots.map(p => ({
            ...p,
            id: `pvt_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`
          }));
          const newPins = obj.pins ? obj.pins.map(p => ({
            ...p,
            id: `pvt_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`
          })) : undefined;

          const currentKeepOnly = obj.keepOnlyLassoRegions || [];

          const separatedObj: VectorObject = {
            ...obj,
            id: newId,
            name: `${obj.name}_separated`,
            points: obj.points ? obj.points.map(p => ({ ...p })) : [],
            subPaths: obj.subPaths ? obj.subPaths.map(path => path.map(p => ({ ...p }))) : undefined,
            pivots: newPivots,
            pins: newPins,
            keepOnlyLassoRegions: [...currentKeepOnly, { localLassoPoints }],
            parentId: null,
            childrenIds: []
          };

          updated[newId] = separatedObj;
        });
        return updated;
      });

      setLassoPoints([]);
      alert(`Successfully separated lassoed area from ${targets.length} drawings!`);
    } catch (err: any) {
      console.error("Lasso separation error:", err);
      alert(`Failed to perform lasso separation: ${err.message || err}`);
    }
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    const current = {
      objects: JSON.parse(JSON.stringify(objects)),
      bones: JSON.parse(JSON.stringify(bones)),
    };
    setRedoStack(prev => [...prev, current]);
    setObjects(previous.objects);
    setBones(previous.bones);
    setUndoStack(prev => prev.slice(0, -1));
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    const current = {
      objects: JSON.parse(JSON.stringify(objects)),
      bones: JSON.parse(JSON.stringify(bones)),
    };
    setUndoStack(prev => [...prev, current]);
    setObjects(next.objects);
    setBones(next.bones);
    setRedoStack(prev => prev.slice(0, -1));
  };

  // Toggle Smart Control Pinned State
  const toggleSmartPin = (id: string) => {
    setSmartPinnedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Add a fully pre-rigged sample character for instant user testing!
  const addSampleCharacter = () => {
    historyPush();
    const torsoId = `torso_${Date.now()}`;
    const headId = `head_${Date.now()}`;
    const leftArmId = `left_arm_${Date.now()}`;
    const rightArmId = `right_arm_${Date.now()}`;
    const leftLegId = `left_leg_${Date.now()}`;
    const rightLegId = `right_leg_${Date.now()}`;

    const sampleObjects: { [id: string]: VectorObject } = {
      [torsoId]: {
        id: torsoId,
        name: 'Torso',
        type: 'shape',
        shapeType: 'rectangle',
        points: [
          { x: 120, y: 180 },
          { x: 180, y: 180 },
          { x: 180, y: 280 },
          { x: 120, y: 280 },
          { x: 120, y: 180 }
        ],
        strokeColor: '#1B5E20',
        strokeWidth: 3,
        fillColor: '#C8E6C9',
        opacity: 1,
        transform: { x: 300, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
        pivots: [{ id: `pvt_${Date.now()}_1`, name: 'BaseJoint', localX: 150, localY: 280, locked: false }],
        parentId: null,
        childrenIds: [headId, leftArmId, rightArmId, leftLegId, rightLegId],
        layerId: 'layer_1',
        isLocked: false,
        isHidden: false,
      },
      [headId]: {
        id: headId,
        name: 'Head',
        type: 'shape',
        shapeType: 'circle',
        points: [
          { x: 130, y: 100 },
          { x: 170, y: 100 },
          { x: 170, y: 140 },
          { x: 130, y: 140 },
          { x: 130, y: 100 }
        ],
        strokeColor: '#1B5E20',
        strokeWidth: 3,
        fillColor: '#FFE082',
        opacity: 1,
        transform: { x: 300, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
        pivots: [{ id: `pvt_${Date.now()}_2`, name: 'NeckJoint', localX: 150, localY: 175, locked: false }],
        parentId: torsoId,
        childrenIds: [],
        layerId: 'layer_1',
        isLocked: false,
        isHidden: false,
      },
      [leftArmId]: {
        id: leftArmId,
        name: 'LeftArm',
        type: 'shape',
        shapeType: 'line',
        points: [
          { x: 100, y: 190 },
          { x: 70, y: 230 },
          { x: 60, y: 270 }
        ],
        strokeColor: '#E65100',
        strokeWidth: 4,
        fillColor: 'transparent',
        opacity: 1,
        transform: { x: 300, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
        pivots: [{ id: `pvt_${Date.now()}_3`, name: 'ShoulderJoint', localX: 115, localY: 190, locked: false }],
        parentId: torsoId,
        childrenIds: [],
        layerId: 'layer_1',
        isLocked: false,
        isHidden: false,
      },
      [rightArmId]: {
        id: rightArmId,
        name: 'RightArm',
        type: 'shape',
        shapeType: 'line',
        points: [
          { x: 200, y: 190 },
          { x: 230, y: 230 },
          { x: 240, y: 270 }
        ],
        strokeColor: '#E65100',
        strokeWidth: 4,
        fillColor: 'transparent',
        opacity: 1,
        transform: { x: 300, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
        pivots: [{ id: `pvt_${Date.now()}_4`, name: 'ShoulderJoint', localX: 185, localY: 190, locked: false }],
        parentId: torsoId,
        childrenIds: [],
        layerId: 'layer_1',
        isLocked: false,
        isHidden: false,
      },
      [leftLegId]: {
        id: leftLegId,
        name: 'LeftLeg',
        type: 'shape',
        shapeType: 'line',
        points: [
          { x: 130, y: 280 },
          { x: 130, y: 340 },
          { x: 125, y: 380 }
        ],
        strokeColor: '#0D47A1',
        strokeWidth: 4.5,
        fillColor: 'transparent',
        opacity: 1,
        transform: { x: 300, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
        pivots: [{ id: `pvt_${Date.now()}_5`, name: 'HipJoint', localX: 130, localY: 280, locked: false }],
        parentId: torsoId,
        childrenIds: [],
        layerId: 'layer_1',
        isLocked: false,
        isHidden: false,
      },
      [rightLegId]: {
        id: rightLegId,
        name: 'RightLeg',
        type: 'shape',
        shapeType: 'line',
        points: [
          { x: 170, y: 280 },
          { x: 170, y: 340 },
          { x: 175, y: 380 }
        ],
        strokeColor: '#0D47A1',
        strokeWidth: 4.5,
        fillColor: 'transparent',
        opacity: 1,
        transform: { x: 300, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
        pivots: [{ id: `pvt_${Date.now()}_6`, name: 'HipJoint', localX: 170, localY: 280, locked: false }],
        parentId: torsoId,
        childrenIds: [],
        layerId: 'layer_1',
        isLocked: false,
        isHidden: false,
      }
    };

    // Pre-create bones links for realistic joint kinematics solver!
    const sampleBones: Bone[] = [
      {
        id: 'bone_spine',
        name: 'Spine_Bone',
        startObjectId: torsoId,
        endObjectId: headId,
        startLocalX: 150,
        startLocalY: 180,
        endLocalX: 150,
        endLocalY: 175,
        lockedDistance: 10,
        allowDetach: false,
        minAngle: -45,
        maxAngle: 45,
        enableConstraints: true,
      },
      {
        id: 'bone_larm',
        name: 'Left_Arm_Bone',
        startObjectId: torsoId,
        endObjectId: leftArmId,
        startLocalX: 120,
        startLocalY: 190,
        endLocalX: 115,
        endLocalY: 190,
        lockedDistance: 10,
        allowDetach: false,
        minAngle: -120,
        maxAngle: 120,
        enableConstraints: true,
      }
    ];

    setObjects(sampleObjects);
    setBones(sampleBones);
    setSmartPinnedIds([leftArmId, rightArmId, leftLegId, rightLegId]);
    setSelectedObjectId(torsoId);
  };

  // Add 3D Proxy Model into the animation canvas with strict limits
  const add3DModel = (type: 'car' | 'character' | 'chair' | 'sphere' | 'box' | 'sword') => {
    // 1. Scene Limit: Max 3 active 3D models to guarantee 60 FPS performance and avoid lagging
    const existing3D = (Object.values(objects) as VectorObject[]).filter(obj => obj.type === '3d');
    if (existing3D.length >= 3) {
      alert("App Safety Safeguard: Maximum of 3 active 3D models allowed per project to ensure optimal 60 FPS rendering and completely prevent browser crash conditions.");
      return;
    }

    // 2. Daily Limit: Max 10 3D models added per day per user/guest
    const email = currentUser || 'guest';
    const limitStatus = getDailyLimitStatus(email);
    if (!limitStatus.allowed) {
      triggerLimitNotification();
      return;
    }

    historyPush();
    incrementDailyLimit(email);

    // Generate local mesh data from library
    const geom = generate3DGeometry(type);

    const modelId = `obj_3d_${Date.now()}`;
    const new3DObj: VectorObject = {
      id: modelId,
      name: `3D_${type.toUpperCase()}_Proxy`,
      type: '3d',
      shape3DType: type,
      points: [
        { x: -50, y: -50 },
        { x: 50, y: -50 },
        { x: 50, y: 50 },
        { x: -50, y: 50 },
        { x: -50, y: -50 }
      ], // 2D proxy projection footprint
      strokeColor: '#F59E0B',
      strokeWidth: 2.5,
      fillColor: '#F59E0B',
      opacity: 1,
      transform: { x: 300, y: 250, rotation: 0, scaleX: 1, scaleY: 1 },
      transform3D: {
        x: 0,
        y: 0,
        z: 0,
        rx: 15, // default pitch
        ry: 45, // default yaw
        rz: 0,  // default roll
        sx: 1.5,
        sy: 1.5,
        sz: 1.5,
      },
      vertices3D: geom.vertices,
      faces3D: geom.faces,
      bones3D: geom.bones,
      pivots: [{ id: `pvt_${Date.now()}_3d`, name: 'CenterJoint', localX: 0, localY: 0, locked: false }],
      parentId: null,
      childrenIds: [],
      layerId: activeLayerId,
      isLocked: false,
      isHidden: false,
    };

    setObjects(prev => ({ ...prev, [modelId]: new3DObj }));
    setSelectedObjectId(modelId);
  };

  const add360Object = (selectedIds: string[]) => {
    if (selectedIds.length === 0) {
      alert("Please select one or more drawings to convert into a Master 360 Object.");
      return;
    }
    
    // Check if some are already 360 containers to avoid nested containers
    const validIds = selectedIds.filter(id => objects[id] && objects[id].type !== '360_container');
    if (validIds.length === 0) {
      alert("Please select valid non-container drawings to combine into a Master 360 Object.");
      return;
    }

    // Master position is defined by the first view (Front view) position
    const firstObj = objects[validIds[0]];
    const masterX = firstObj?.transform?.x ?? 300;
    const masterY = firstObj?.transform?.y ?? 250;
    const containerId = `360_container_${Date.now()}`;

    const views: View360[] = [];
    validIds.forEach((id, idx) => {
      const angle = Math.round((idx * 360) / validIds.length) % 360;
      views.push({
        id: `view_${Date.now()}_${idx}`,
        angle,
        drawingId: id,
        name: idx === 0 ? 'Front' : idx === 1 && validIds.length === 2 ? 'Back' : `Angle ${angle}°`,
        drawingName: objects[id]?.name || `Drawing ${idx + 1}`
      });
      // Set all views to master position and hide on canvas so they render via master container
      if (objects[id]) {
        updateObject(id, {
          isHidden: true,
          container360Id: containerId,
          transform: {
            ...objects[id].transform,
            x: masterX,
            y: masterY
          }
        });
      }
    });
    
    const new360Obj: VectorObject = {
      id: containerId,
      name: `Master_360_Object`,
      type: '360_container',
      views360: views,
      currentAngle360: 0,
      activeViewId360: views[0]?.id || '',
      lockAngle360: false,
      points: [
        { x: -60, y: -60 },
        { x: 60, y: -60 },
        { x: 60, y: 60 },
        { x: -60, y: 60 },
        { x: -60, y: -60 }
      ],
      strokeColor: '#F59E0B',
      strokeWidth: 2,
      fillColor: 'transparent',
      opacity: 1,
      transform: { x: masterX, y: masterY, rotation: 0, scaleX: 1, scaleY: 1 },
      pivots: [{ id: `pvt_${Date.now()}_360`, name: 'RootPivot', localX: 0, localY: 0, locked: false }],
      parentId: null,
      childrenIds: [],
      layerId: activeLayerId,
      isLocked: false,
      isHidden: false,
    };
    
    historyPush();
    setObjects(prev => ({
      ...prev,
      [containerId]: new360Obj
    }));
    setSelectedObjectId(containerId);
  };

  const start360Wizard = () => {
    setIs360WizardActive(true);
    setDraft360Views([]);
    setDraftAnchorId(null);
  };

  const addDraft360View = (drawingId: string, name: string, angle: number) => {
    if (!objects[drawingId]) return;
    const viewId = `view_${Date.now()}`;
    const newView: View360 = {
      id: viewId,
      name,
      angle: angle % 360,
      drawingId,
      drawingName: objects[drawingId].name
    };
    
    // Hide drawing temporarily so they can draw the next one at the exact same spot without clutter
    setObjects(prev => ({
      ...prev,
      [drawingId]: { ...prev[drawingId], isHidden: true }
    }));
    
    setDraft360Views(prev => [...prev, newView]);
    if (!draftAnchorId) {
      setDraftAnchorId(drawingId);
    }
  };

  const cancel360Wizard = () => {
    setObjects(prev => {
      const next = { ...prev };
      draft360Views.forEach(v => {
        if (next[v.drawingId]) {
          next[v.drawingId] = { ...next[v.drawingId], isHidden: false };
        }
      });
      return next;
    });
    setIs360WizardActive(false);
    setDraft360Views([]);
    setDraftAnchorId(null);
  };

  const compile360Wizard = (containerName: string) => {
    if (draft360Views.length === 0) {
      alert("Please add at least one view before compiling.");
      return;
    }
    const anchorId = draftAnchorId || draft360Views[0].drawingId;
    const anchorDrawing = objects[anchorId];
    if (!anchorDrawing) return;

    // Center of anchor
    const boundsAnchor = calculateBoundingBox(anchorDrawing.points);
    const txAnchor = anchorDrawing.transform.x;
    const tyAnchor = anchorDrawing.transform.y;
    const avgX = (boundsAnchor.x + boundsAnchor.width / 2) + txAnchor;
    const avgY = (boundsAnchor.y + boundsAnchor.height / 2) + tyAnchor;

    const containerId = `360_container_${Date.now()}`;
    
    const new360Obj: VectorObject = {
      id: containerId,
      name: containerName || `Master_360_Object`,
      type: '360_container',
      views360: [...draft360Views],
      currentAngle360: 0,
      activeViewId360: draft360Views[0].id,
      lockAngle360: false,
      points: [
        { x: -60, y: -60 },
        { x: 60, y: -60 },
        { x: 60, y: 60 },
        { x: -60, y: 60 },
        { x: -60, y: -60 }
      ],
      strokeColor: '#F59E0B',
      strokeWidth: 2,
      fillColor: 'transparent',
      opacity: 1,
      transform: { x: avgX, y: avgY, rotation: 0, scaleX: 1, scaleY: 1 },
      pivots: [{ id: `pvt_${Date.now()}_360`, name: 'RootPivot', localX: 0, localY: 0, locked: false }],
      parentId: null,
      childrenIds: [],
      layerId: activeLayerId,
      isLocked: false,
      isHidden: false,
    };

    historyPush();
    setObjects(prev => {
      const next = { ...prev };
      draft360Views.forEach(v => {
        if (next[v.drawingId]) {
          next[v.drawingId] = { ...next[v.drawingId], isHidden: true };
        }
      });
      next[containerId] = new360Obj;
      return next;
    });
    setSelectedObjectId(containerId);

    setIs360WizardActive(false);
    setDraft360Views([]);
    setDraftAnchorId(null);
  };

  const addCustom3DModel = (mesh: any, filename: string) => {
    const existing3D = (Object.values(objects) as VectorObject[]).filter(obj => obj.type === '3d');
    if (existing3D.length >= 3) {
      alert("App Safety Safeguard: Maximum of 3 active 3D models allowed per project to ensure optimal 60 FPS rendering and completely prevent browser crash conditions.");
      return;
    }

    const email = currentUser || 'guest';
    const limitStatus = getDailyLimitStatus(email);
    if (!limitStatus.allowed) {
      triggerLimitNotification();
      return;
    }

    historyPush();
    incrementDailyLimit(email);

    const modelId = `obj_3d_${Date.now()}`;
    const new3DObj: VectorObject = {
      id: modelId,
      name: filename.replace(/\.[^/.]+$/, "") + "_Mesh",
      type: '3d',
      shape3DType: 'box',
      points: [
        { x: -50, y: -50 },
        { x: 50, y: -50 },
        { x: 50, y: 50 },
        { x: -50, y: 50 },
        { x: -50, y: -50 }
      ],
      strokeColor: '#F59E0B',
      strokeWidth: 2.0,
      fillColor: '#F59E0B',
      opacity: 1,
      transform: { x: 300, y: 250, rotation: 0, scaleX: 1, scaleY: 1 },
      transform3D: {
        x: 0,
        y: 0,
        z: 0,
        rx: 15,
        ry: 45,
        rz: 0,
        sx: 1.8,
        sy: 1.8,
        sz: 1.8,
      },
      vertices3D: mesh.vertices,
      faces3D: mesh.faces,
      bones3D: mesh.bones || [],
      pivots: [{ id: `pvt_${Date.now()}_3d`, name: 'CenterJoint', localX: 0, localY: 0, locked: false }],
      parentId: null,
      childrenIds: [],
      layerId: activeLayerId,
      isLocked: false,
      isHidden: false,
    };

    setObjects(prev => ({ ...prev, [modelId]: new3DObj }));
    setSelectedObjectId(modelId);
  };

  // Convert 2D Vector Drawing or PNG Image instantly into a real 3D solid wireframe geometry prism
  const convertTo3D = (id: string) => {
    const obj = objects[id];
    if (!obj) return;

    if (obj.type !== 'stroke' && obj.type !== 'shape' && obj.type !== 'image') {
      alert("Please select a 2D drawing, shape, or PNG image to convert.");
      return;
    }

    const email = currentUser || 'guest';
    const limitStatus = getDailyLimitStatus(email);
    if (!limitStatus.allowed) {
      triggerLimitNotification();
      return;
    }

    historyPush();
    incrementDailyLimit(email);

    let pointsToExtrude = obj.points;
    if (obj.type === 'image' || obj.imageUrl) {
      const w = obj.transform?.width || 200;
      const h = obj.transform?.height || 200;
      let cachedImg = (obj as any)._cachedImg as HTMLImageElement | undefined;
      if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
        const contour = extractPNGSilhouetteContour(cachedImg, w, h);
        if (contour && contour.length > 2) {
          pointsToExtrude = contour;
        }
      } else if (obj.imageUrl) {
        const tempImg = new Image();
        tempImg.crossOrigin = 'anonymous';
        tempImg.src = obj.imageUrl;
        if (tempImg.complete && tempImg.naturalWidth > 0) {
          const contour = extractPNGSilhouetteContour(tempImg, w, h);
          if (contour && contour.length > 2) {
            pointsToExtrude = contour;
          }
        }
      }

      if (!pointsToExtrude || pointsToExtrude.length < 2) {
        pointsToExtrude = [
          { x: -w / 2, y: -h / 2 },
          { x: w / 2, y: -h / 2 },
          { x: w / 2, y: h / 2 },
          { x: -w / 2, y: h / 2 },
          { x: -w / 2, y: -h / 2 }
        ];
      }
    }

    // Run extrusion algorithm
    const result = extrude2DTo3D(
      pointsToExtrude,
      obj.fillColor,
      obj.strokeColor,
      40,
      false,
      10,
      !!obj.fillGaps3D,
      obj.strokeWidth || 5
    );

    const subPaths3D: { x: number; y: number; z: number }[][] = [];
    const depthVal = 40;
    if (obj.subPaths && obj.subPaths.length > 0) {
      obj.subPaths.forEach(sub => {
        const sub3D = sub.map(p => {
          return {
            x: p.x - result.center.x,
            y: p.y - result.center.y,
            z: -depthVal / 2 - 0.5
          };
        });
        subPaths3D.push(sub3D);
      });
    }

    const updatedObj: VectorObject = {
      ...obj,
      type: '3d',
      shape3DType: 'box', // Extrusion uses box shading logic
      points: [
        { x: -50, y: -50 },
        { x: 50, y: -50 },
        { x: 50, y: 50 },
        { x: -50, y: 50 },
        { x: -50, y: -50 }
      ], // 2D projection footprint box
      strokeColor: obj.strokeColor !== 'transparent' ? obj.strokeColor : '#F59E0B',
      strokeWidth: obj.strokeWidth || 5.0,
      fillColor: obj.fillColor,
      fillGaps3D: !!obj.fillGaps3D,
      transform: {
        ...obj.transform,
        x: obj.transform.x + result.center.x,
        y: obj.transform.y + result.center.y,
      },
      transform3D: {
        x: 0,
        y: 0,
        z: 0,
        rx: 15,
        ry: 45,
        rz: 0,
        sx: 1.0,
        sy: 1.0,
        sz: 1.0,
      },
      vertices3D: result.vertices,
      faces3D: result.faces,
      subPaths3D,
      bones3D: [],
      originalPointsBackup: obj.points,
      hollowEnabled: false,
      innerSpace3D: 10,
      depth3D: 40,
      pivots: [{ id: `pvt_${Date.now()}_3d`, name: 'CenterJoint', localX: 0, localY: 0, locked: false }],
    };

    setObjects(prev => ({
      ...prev,
      [id]: updatedObj
    }));
    setSelectedObjectId(id);
  };

  // Merge Lasso / Selected strokes into a single continuous drawing (3D ready)
  const handleTopBarMakeSingle = () => {
    let targetObjectIds: string[] = [];

    // 1. Find objects inside lassoPoints
    if (lassoPoints && lassoPoints.length >= 3) {
      (Object.values(objects) as VectorObject[]).forEach(obj => {
        if (obj.isLocked || obj.isHidden) return;
        const localPivot = obj.pivots?.[0] || { localX: 0, localY: 0 };
        const ptsToCheck = (obj.subPaths && obj.subPaths.length > 0)
          ? obj.subPaths.flat()
          : (obj.points || []);

        const hasInsidePoint = ptsToCheck.some(p => {
          const worldPt = localToWorld(p, obj.transform, localPivot);
          return isPointInPolygon(worldPt, lassoPoints);
        });

        if (hasInsidePoint) {
          targetObjectIds.push(obj.id);
        }
      });
    }

    if (selectedObjectId && !targetObjectIds.includes(selectedObjectId)) {
      targetObjectIds.push(selectedObjectId);
    }

    // Fallback: if lasso was drawn over canvas and no target found, collect all unlocked drawing objects
    if (targetObjectIds.length < 2 && lassoPoints && lassoPoints.length >= 3) {
      (Object.values(objects) as VectorObject[]).forEach(obj => {
        if (!obj.isLocked && !obj.isHidden && !targetObjectIds.includes(obj.id) && (obj.type === 'stroke' || obj.type === 'shape' || obj.type === '3d' || !obj.type)) {
          targetObjectIds.push(obj.id);
        }
      });
    }

    if (targetObjectIds.length === 0) {
      alert("Please draw a lasso area around drawing strokes or select strokes to merge into a single drawing.");
      return;
    }

    historyPush();

    const primaryId = targetObjectIds[0];
    const primary = objects[primaryId];
    if (!primary) return;

    const primaryPivot = primary.pivots?.[0] || { localX: 0, localY: 0 };

    let newSubPaths: Point[][] = [];
    let newSubPathStrokes: { [subPathIdx: number]: { strokeColor?: string; strokeWidth?: number } } = {};
    let newSubPathFills: { [subPathIdx: number]: string } = {};
    let newLassoFills: VectorObject['lassoFills'] = [];
    let newChildrenIds = [...(primary.childrenIds || [])];

    targetObjectIds.forEach((objId) => {
      const obj = objects[objId];
      if (!obj) return;

      const objPivot = obj.pivots?.[0] || { localX: 0, localY: 0 };
      const subs = (obj.subPaths && obj.subPaths.length > 0)
        ? obj.subPaths
        : (obj.points && obj.points.length > 0 ? [obj.points] : []);

      subs.forEach((sub, sIdx) => {
        const currentIdx = newSubPaths.length;
        let convertedSub: Point[];

        if (objId === primaryId) {
          convertedSub = sub.map(p => ({ ...p }));
        } else {
          convertedSub = sub.map(p => {
            const worldPt = localToWorld(p, obj.transform, objPivot);
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
        }

        newSubPaths.push(convertedSub);

        const strokeCol = obj.subPathStrokes?.[sIdx]?.strokeColor || obj.strokeColor;
        const strokeW = obj.subPathStrokes?.[sIdx]?.strokeWidth ?? obj.strokeWidth;
        newSubPathStrokes[currentIdx] = { strokeColor: strokeCol, strokeWidth: strokeW };

        const fillCol = obj.subPathFills?.[sIdx] || (obj.fillColor && obj.fillColor !== 'transparent' ? obj.fillColor : undefined);
        if (fillCol) {
          newSubPathFills[currentIdx] = fillCol;
        }
      });

      if (obj.lassoFills && obj.lassoFills.length > 0) {
        if (objId === primaryId) {
          newLassoFills.push(...obj.lassoFills);
        } else {
          obj.lassoFills.forEach(fill => {
            const convertedPts = (fill.localLassoPoints || []).map(p => {
              const worldPt = localToWorld(p, obj.transform, objPivot);
              return worldToLocal(worldPt, primary.transform, primaryPivot);
            });
            const convertedOrigPts = fill.origPoints ? fill.origPoints.map(p => {
              const worldPt = localToWorld(p, obj.transform, objPivot);
              return worldToLocal(worldPt, primary.transform, primaryPivot);
            }) : undefined;

            newLassoFills.push({
              ...fill,
              localLassoPoints: convertedPts,
              origPoints: convertedOrigPts
            });
          });
        }
      }

      if (objId !== primaryId) {
        (Object.values(objects) as VectorObject[]).forEach(o => {
          if (o.parentId === objId) {
            updateObject(o.id, { parentId: primaryId });
            if (!newChildrenIds.includes(o.id)) {
              newChildrenIds.push(o.id);
            }
          }
        });
        deleteObject(objId);
      }
    });

    const unifiedPoints = unifyStrokesToSinglePath(newSubPaths);

    // Re-extrude if 3D
    let updated3DFields: Partial<VectorObject> = {};
    if (primary.type === '3d' || targetObjectIds.some(id => objects[id]?.type === '3d')) {
      const res = extrude2DTo3D(
        unifiedPoints,
        primary.fillColor,
        primary.strokeColor,
        primary.depth3D || 40,
        !!primary.hollowEnabled,
        primary.innerSpace3D || 10,
        !!primary.fillGaps3D,
        primary.strokeWidth || 5
      );

      const subPaths3D: { x: number; y: number; z: number }[][] = [];
      const depthVal = primary.depth3D || 40;
      newSubPaths.forEach(sub => {
        const sub3D = sub.map(p => ({
          x: p.x - res.center.x,
          y: p.y - res.center.y,
          z: -depthVal / 2 - 0.5
        }));
        subPaths3D.push(sub3D);
      });

      updated3DFields = {
        type: '3d',
        vertices3D: res.vertices,
        faces3D: res.faces,
        subPaths3D: subPaths3D,
        depth3D: primary.depth3D || 40,
        transform: {
          ...primary.transform,
          x: primary.transform.x + res.center.x,
          y: primary.transform.y + res.center.y
        }
      };
    }

    updateObject(primaryId, {
      points: unifiedPoints,
      subPaths: newSubPaths,
      subPathStrokes: newSubPathStrokes,
      subPathFills: newSubPathFills,
      lassoFills: newLassoFills,
      childrenIds: newChildrenIds,
      isContinuousDrawing: true,
      ...updated3DFields
    });

    setSelectedObjectId(primaryId);
    setLassoPoints([]);
    setDbNotification("Successfully merged all strokes into 1 Single Drawing!");
    setTimeout(() => setDbNotification(null), 3000);
  };

  // Object and Canvas operations
  const deleteObject = (id: string) => {
    if (!id || !objects[id]) return;
    const targetObj = objects[id];
    const effLayerId = targetObj.layerId || (layers && layers[0] ? layers[0].id : 'layer_1');
    if (effLayerId !== activeLayerId) {
      console.warn("Cannot delete object on inactive layer");
      return;
    }
    historyPush();
    setObjects(prev => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
    setBones(prev => prev.filter(b => b.startObjectId !== id && b.endObjectId !== id));
    if (selectedObjectId === id) {
      setSelectedObjectId(null);
    }
    if (activeContinuousDrawingId === id) {
      setActiveContinuousDrawingId(null);
    }
  };

  const clearCanvas = () => {
    historyPush();
    setObjects(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(id => {
        if (!updated[id].layerId || updated[id].layerId === activeLayerId) {
          delete updated[id];
        }
      });
      return updated;
    });
    setSelectedObjectId(null);
    setActiveContinuousDrawingId(null);
    setLassoPoints([]);
    setFslPoints([]);
    setPenLassoPoints([]);
    setSmartPinnedIds([]);
    setDraft360Views([]);
    setDraftAnchorId(null);
    setIs360WizardActive(false);
    setSelectedDeformPointIndex(null);
    setSelectedDeformPointType(null);
    setOriginalDeformPointCoords(null);
    setHideLassoSelection(false);
    setHideFslSelection(false);
  };

  // Timeline operations
  const addFrame = () => {
    if (frames.length >= 500) {
      setLimitNotification("App safety limit: To guarantee 100% lag-free performance, the maximum limit is 500 animation frames per project.");
      return;
    }
    const newIndex = frames.length;
    setFrames(prev => [...prev, { index: newIndex, objects: JSON.parse(JSON.stringify(objects)) }]);
    setCurrentFrameIndex(newIndex);
  };

  const batchAddFrames = (count: number) => {
    if (frames.length >= 500) {
      setLimitNotification("App safety limit: To guarantee 100% lag-free performance, the maximum limit is 500 animation frames per project.");
      return;
    }
    historyPush();
    setFrames(prev => {
      const updated = [...prev];
      const lastFrame = prev[prev.length - 1];
      const lastFrameObjects = lastFrame ? lastFrame.objects || {} : {};
      
      const spaceLeft = 500 - prev.length;
      const actualToAdd = Math.min(count, spaceLeft);

      if (actualToAdd < count) {
        setLimitNotification(`App safety limit: Truncated batch addition to ${actualToAdd} frames to keep project under the 500-frame ceiling.`);
      }

      for (let i = 0; i < actualToAdd; i++) {
        updated.push({
          index: updated.length,
          objects: JSON.parse(JSON.stringify(lastFrameObjects))
        });
      }
      return updated;
    });
  };

  const deleteFrame = (index: number) => {
    if (frames.length <= 1) return;
    setFrames(prev => prev.filter((_, idx) => idx !== index));
    if (currentFrameIndex >= frames.length - 1) {
      setCurrentFrameIndex(frames.length - 2);
    }
  };

  const duplicateFrame = (index: number) => {
    if (frames.length >= 500) {
      setLimitNotification("App safety limit: To guarantee 100% lag-free performance, the maximum limit is 500 animation frames per project.");
      return;
    }
    const frameToDup = frames[index];
    const newFrame = JSON.parse(JSON.stringify(frameToDup));
    const insertIndex = index + 1;
    setFrames(prev => {
      const updated = [...prev];
      updated.splice(insertIndex, 0, newFrame);
      return updated.map((f, i) => ({ ...f, index: i }));
    });
    setCurrentFrameIndex(insertIndex);
  };

  const copyFrame = (index: number) => {
    localStorage.setItem('copied_frame_data', JSON.stringify(frames[index].objects));
  };

  const pasteFrame = (index: number) => {
    const data = localStorage.getItem('copied_frame_data');
    if (data) {
      const parsed = safeJsonParse(data);
      if (!parsed) return;
      setFrames(prev => {
        const updated = [...prev];
        updated[index].objects = parsed;
        return updated;
      });
      if (index === currentFrameIndex) {
        setObjects(parsed);
      }
    }
  };

  // Video Export recorder
  const startRecording = () => {
    const canvas = (document.getElementById('front-vector-canvas') as HTMLCanvasElement) || (document.querySelector('canvas') as HTMLCanvasElement);
    if (!canvas) {
      alert("Canvas element not found for video export.");
      return;
    }

    recordedChunksRef.current = [];
    const stream = canvas.captureStream ? canvas.captureStream(fps) : (canvas as any).mozCaptureStream ? (canvas as any).mozCaptureStream(fps) : null;
    
    if (!stream) {
      alert("Canvas video stream capture is not supported in this browser environment.");
      return;
    }

    // Check supported types for mp4 vs webm
    let options: MediaRecorderOptions = { mimeType: 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"' };
    let extension = 'mp4';
    
    if (typeof MediaRecorder !== 'undefined') {
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/mp4' };
      }
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm;codecs=h264' };
        extension = 'webm';
      }
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm;codecs=vp9' };
        extension = 'webm';
      }
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm' };
        extension = 'webm';
      }
    } else {
      extension = 'webm';
    }

    let mediaRecorder: MediaRecorder;
    try {
      try {
        mediaRecorder = new MediaRecorder(stream, options);
      } catch (err) {
        console.warn("Failed to initialize MediaRecorder with options, falling back to default constructor", err);
        mediaRecorder = new MediaRecorder(stream);
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4')) {
          extension = 'mp4';
        } else {
          extension = 'webm';
        }
      }

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setIsRecording(false);
        const chunks = recordedChunksRef.current;
        if (!chunks || chunks.length === 0) {
          setLimitNotification("Notice: No video frame data was captured during export.");
          return;
        }

        const mimeType = options.mimeType || 'video/mp4';
        const blob = new Blob(chunks, { type: mimeType });
        const fileName = `AnimStudio_Export_${Date.now()}.${extension}`;

        // 1. Try Native Device File System Access API (showSaveFilePicker)
        if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
          try {
            const handle = await (window as any).showSaveFilePicker({
              suggestedName: fileName,
              types: [{
                description: 'Animation Video File',
                accept: { [mimeType]: [`.${extension}`] }
              }]
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            setLimitNotification("Success: Animation video exported & saved directly to your device file manager location!");
            return;
          } catch (pickerErr: any) {
            if (pickerErr.name === 'AbortError') {
              console.log("User cancelled file save location dialog.");
              return;
            }
            console.warn("Save file picker unavailable or permission denied, falling back to direct browser download:", pickerErr);
          }
        }

        // 2. Direct Device Download Fallback (opens file manager download prompt)
        try {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 1000);
          setLimitNotification("Success: Animation video exported & saved to your device file manager / gallery!");
        } catch (downloadErr) {
          console.error("Export video download error:", downloadErr);
          alert("Failed to export video file. Please check device browser storage permissions.");
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);
      setIsRecording(true);
      setIsPlaying(true); // Auto-start play to capture full sequence
    } catch (e: any) {
      console.error("MediaRecorder start failure:", e);
      alert("Video export recording is not supported in this browser context.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.error("Error stopping media recorder:", err);
      }
    } else {
      setIsRecording(false);
    }
  };

  // Auto-stop video recording when animation playback finishes reaching the end
  useEffect(() => {
    if (isRecording && !isPlaying && currentFrameIndex >= frames.length - 1) {
      stopRecording();
    }
  }, [isRecording, isPlaying, currentFrameIndex, frames.length]);

  // Import local JSON project file
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const project = safeJsonParse(event.target?.result as string);
        if (!project) {
          alert("Blocked corrupted or invalid payload structure for security protection.");
          return;
        }
        if (project.objects) setObjects(project.objects);
        if (project.bones) setBones(project.bones);
        if (project.frames) {
          let loadedFrames = project.frames;
          if (loadedFrames.length > 500) {
            loadedFrames = loadedFrames.slice(0, 500);
            triggerSecurityWarning("Security warning: Project truncated to 500 frames to guarantee system stability and prevent extreme canvas lag.");
          }
          setFrames(loadedFrames);
        }
        alert("Project loaded successfully!");
      } catch (err) {
        alert("Invalid project JSON layout.");
      }
    };
    reader.readAsText(file);
  };

  // Export local JSON project file
  const handleExportJSON = () => {
    const project = {
      id: `proj_${Date.now()}`,
      name: 'Untitled Project',
      canvasSize: { w: artboardW || 1000, h: artboardH || 700 },
      fps,
      layers,
      objects,
      frames,
      bones,
      currentFrameIndex,
    };

    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Animation_Project_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Upload background-removed PNG image
  const handlePNGUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      const imgId = `obj_png_${Date.now()}`;

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const contour = extractPNGSilhouetteContour(img, 200, 200);
        const newObj: VectorObject = {
          id: imgId,
          name: `untitledPNG_${Object.keys(objects).length + 1}`,
          type: 'image',
          points: contour && contour.length > 2 ? contour : [
            { x: -100, y: -100 },
            { x: 100, y: -100 },
            { x: 100, y: 100 },
            { x: -100, y: 100 },
            { x: -100, y: -100 }
          ],
          strokeColor: 'transparent',
          strokeWidth: 0,
          fillColor: 'transparent',
          opacity: 1,
          transform: { x: 200, y: 150, rotation: 0, scaleX: 1, scaleY: 1, width: 200, height: 200 },
          pivots: [{ id: `pvt_${Date.now()}_img`, name: 'BaseJoint', localX: 0, localY: 0, locked: false }],
          parentId: null,
          childrenIds: [],
          layerId: activeLayerId,
          imageUrl: url,
          isLocked: false,
          isHidden: false,
        };
        (newObj as any)._cachedImg = img;

        setObjects(prev => ({ ...prev, [imgId]: newObj }));
        setSelectedObjectId(imgId);
        historyPush();
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
  };

  const isMobile = windowSize.width < 1200;
  const targetWidth = 1280;
  const scale = isMobile ? windowSize.width / targetWidth : 1;

  if (typeof window !== 'undefined') {
    (window as any).__appScale = scale;
  }

  const containerStyle: React.CSSProperties = isMobile ? {
    width: `${targetWidth}px`,
    height: `${windowSize.height / scale}px`,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    position: 'absolute',
    left: 0,
    top: 0,
  } : {};

  const renderAdBox = (item: AdItem, align: 'top' | 'bottom' = 'bottom') => {
    return (
      <div 
        className="w-full h-full bg-transparent flex items-center justify-center overflow-hidden relative group/ad hover:brightness-110 transition-all duration-300"
        style={{ border: 'none', outline: 'none' }}
      >
        {/* Centered Dynamic Adsterra Iframe Loader */}
        <div className="w-full h-full flex items-center justify-center bg-transparent" style={{ border: 'none', outline: 'none' }}>
          <AdsterraIframe 
            key={`${item.id}-${item.adKey || item.scriptUrl || 'ad'}`}
            adKey={item.adKey} 
            format={item.format} 
            height={item.height} 
            width={item.width} 
            scriptUrl={item.scriptUrl} 
            containerId={item.containerId} 
            align={align}
          />
        </div>
      </div>
    );
  };

  shortcutsRef.current = {
    isPlaying,
    setIsPlaying,
    setActiveTool,
    addFrame,
    handleUndo,
    handleRedo,
    triggerShortcutHint,
    currentFrameIndex,
    setCurrentFrameIndex,
    frames,
    deleteFrame,
    selectedObjectId,
    setSelectedObjectId,
    activeTool,
    deleteObject
  };

  return (
    <div className={`w-screen h-screen overflow-hidden bg-neutral-950 relative ${theme === 'light' ? 'light-theme' : ''}`}>
      <div 
        style={containerStyle}
        className={`flex flex-col h-full w-full bg-neutral-950 text-white font-sans text-sm antialiased overflow-hidden select-none ${theme === 'light' ? 'light-theme' : ''}`}
      >

      {/* 1.5 TOP SPONSOR ADS BAR (2 Boxes, Centered, 76px Height, Spacious Margins) */}
      <div className="w-full bg-transparent p-[2px] flex gap-2 items-center select-none shrink-0 mt-1 mb-2 md:mt-0.5 md:mb-1 px-3 animate-fade-in" id="top-ads-bar" style={{ border: 'none', outline: 'none' }}>
        <div className="flex-1 h-[76px] min-w-0" style={{ border: 'none', outline: 'none' }}>
          {renderAdBox(ADS_DATA[topAdIndex1], 'bottom')}
        </div>
        <div className="flex-1 h-[76px] min-w-0" style={{ border: 'none', outline: 'none' }}>
          {renderAdBox(ADS_DATA[topAdIndex2], 'bottom')}
        </div>
      </div>

      {/* 1. TOP NAVIGATION BAR */}
      <header className="h-14 bg-neutral-900 border-b border-neutral-800 px-2 sm:px-4 flex items-center justify-between shrink-0 select-none z-10 overflow-x-auto scrollbar-none flex-nowrap">
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 flex-nowrap">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
            <span className="font-extrabold text-neutral-950 text-xs sm:text-base">A</span>
          </div>
          <div className="block shrink-0">
            <h1 className="font-black text-[9px] sm:text-xs tracking-wider uppercase bg-clip-text text-transparent bg-gradient-to-r from-white to-neutral-400 leading-none">
              Animation
            </h1>
            <p className="text-[7.5px] sm:text-[9px] text-neutral-500 font-extrabold leading-none uppercase tracking-widest mt-0.5">
              VECTOR & RIGGING
            </p>
          </div>
        </div>

        {/* Center Actions: Undo, Redo, Add Sample Character */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0 flex-nowrap mx-2">
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className={`p-1.5 rounded-xl bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 hover:text-white transition-all shrink-0 ${
              undoStack.length === 0 ? 'opacity-30 cursor-not-allowed' : ''
            }`}
            title="Undo Last Action"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className={`p-1.5 rounded-xl bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 hover:text-white transition-all shrink-0 ${
              redoStack.length === 0 ? 'opacity-30 cursor-not-allowed' : ''
            }`}
            title="Redo"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-6 bg-neutral-800 mx-0.5 sm:mx-1 shrink-0"></div>

          {/* MAKE SINGLE DRAWING BUTTON */}
          <button
            type="button"
            id="topbar-make-single-btn"
            onClick={handleTopBarMakeSingle}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-black text-[9px] sm:text-xs transition-all cursor-pointer shrink-0 shadow-lg ${
              (activeTool === 'lasso' || lassoPoints.length > 0)
                ? 'bg-gradient-to-r from-emerald-400 via-teal-400 to-amber-400 text-neutral-950 ring-2 ring-emerald-400/50 shadow-emerald-500/20 animate-pulse'
                : 'bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30'
            }`}
            title="Convert lasso area or selected strokes into a single continuous drawing object (3D ready)"
          >
            <Combine className="w-3.5 h-3.5 shrink-0" />
            <span className="inline uppercase">MAKE SINGLE DRAWING</span>
          </button>

          <button
            onClick={addSampleCharacter}
            className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 font-black text-[9px] sm:text-xs hover:shadow-lg hover:shadow-amber-500/10 active:scale-95 transition-all cursor-pointer shrink-0"
            title="Rig Sample Character"
          >
            <Sparkles className="w-3 h-3 fill-current shrink-0" />
            <span className="inline">RIG SAMPLE CHARACTER</span>
          </button>

          <button
            onClick={clearCanvas}
            className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-600 border border-rose-500/20 hover:border-rose-500 text-rose-400 hover:text-white font-black text-[9px] sm:text-xs active:scale-95 transition-all cursor-pointer shrink-0"
            title="Clear entire canvas, drawings, bones and timelines"
          >
            <Trash2 className="w-3 h-3 shrink-0" />
            <span className="inline">CLEAR CANVAS</span>
          </button>
        </div>

        {/* Right Actions: Import, Export, Record, Database */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 flex-nowrap">
          {/* Upload PNG */}
          <label className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 font-black text-[9px] sm:text-xs cursor-pointer text-neutral-300 hover:text-white transition-all shrink-0">
            <Upload className="w-3 h-3 shrink-0" />
            <span className="inline">UPLOAD</span>
            <input
              type="file"
              accept="image/png"
              onChange={handlePNGUpload}
              className="hidden"
            />
          </label>

          <div className="w-[1px] h-6 bg-neutral-800 mx-0.5 shrink-0"></div>

          {/* Import / Export JSON & Animation Modal */}
          <label className="p-1.5 rounded-xl bg-neutral-850 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 cursor-pointer transition-colors shrink-0" title="Import JSON">
            <Plus className="w-3.5 h-3.5" />
            <input
              type="file"
              accept=".json"
              onChange={handleImportJSON}
              className="hidden"
            />
          </label>


          <div className="w-[1px] h-6 bg-neutral-800 mx-0.5 shrink-0"></div>

          {/* Light/Dark Theme Toggle */}
          <button
            onClick={toggleTheme}
            className={`p-1.5 rounded-xl border transition-all shrink-0 cursor-pointer ${
              theme === 'dark' 
                ? 'bg-neutral-850 hover:bg-neutral-800 text-amber-400 hover:text-amber-300 border-neutral-800' 
                : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-600 hover:text-neutral-900 border-neutral-200'
            }`}
            title={theme === 'dark' ? "Switch to Light Theme" : "Switch to Dark Theme"}
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>

          <div className="w-[1px] h-6 bg-neutral-800 mx-0.5 shrink-0"></div>

          {/* Record Live MP4 Export / Export Video Button */}
          {isRecording ? (
            <button
              onClick={stopRecording}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500 text-white font-black text-[9px] sm:text-xs animate-pulse hover:bg-rose-400 transition-colors cursor-pointer shrink-0 shadow-lg shadow-rose-500/20"
              title="Stop Recording & Save Video to File Manager"
            >
              <Video className="w-3.5 h-3.5 shrink-0" />
              <span className="inline uppercase tracking-wider">STOP & EXPORT</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={startRecording}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 font-black text-[9px] sm:text-xs transition-colors cursor-pointer shrink-0"
                title="Record Animation Canvas"
              >
                <Video className="w-3 h-3 shrink-0" />
                <span className="inline">REC</span>
              </button>

              <button
                onClick={() => {
                  setCurrentFrameIndex(0);
                  setTimeout(() => {
                    startRecording();
                  }, 60);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 font-black text-[9px] sm:text-xs transition-all cursor-pointer shrink-0 shadow-sm"
                title="Export Entire Animation Video directly to Device File Manager / Gallery"
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span className="inline uppercase tracking-wider">EXPORT VIDEO</span>
              </button>
            </div>
          )}

          <div className="w-[1px] h-6 bg-neutral-800 mx-0.5 shrink-0"></div>

          {/* Database Storage Quota Trigger */}
          <button
            onClick={() => setIsSavedAnimationsModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-bold text-[9px] sm:text-xs transition-all cursor-pointer select-none shrink-0"
            title="Open Saved Animations Database (Max 10 Quota)"
          >
            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="hidden md:inline uppercase tracking-wider text-[10px] font-black">Saved Database</span>
            <span className="bg-amber-500/20 px-1.5 py-0.5 rounded text-[9px] font-mono font-black text-amber-300">
              {getSavedAnimationsQuotaStatus(currentUser || 'guest').count}/10
            </span>
          </button>

          <div className="w-[1px] h-6 bg-neutral-800 mx-0.5 shrink-0"></div>

          {/* User Icon Auth Trigger */}
          <div className="relative shrink-0" id="user-profile-menu-container">
            {currentUser ? (
              <button
                onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 font-bold text-[9px] sm:text-xs transition-colors cursor-pointer select-none shrink-0"
                title={`Logged in as ${currentUser}. Click to open database manager.`}
              >
                <UserCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="max-w-[60px] truncate inline">{currentUser.split('@')[0]}</span>
              </button>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 text-neutral-300 hover:text-white font-bold text-[9px] sm:text-xs transition-colors cursor-pointer select-none shrink-0"
                title="Guest Mode. Click here to login to save animations."
              >
                <User className="w-3 h-3 text-neutral-400 shrink-0" />
                <span className="inline">LOGIN</span>
              </button>
            )}

            {/* Profile Dropdown / Saved Animation manager popup */}
            {currentUser && isProfileDropdownOpen && (
              <div className="absolute right-0 mt-2.5 w-72 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl p-4 z-50 text-xs space-y-3.5 animate-fade-in text-neutral-200">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                  <span className="font-extrabold text-neutral-400 uppercase tracking-wider text-[10px]">Your Account</span>
                  <button 
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 text-rose-400 hover:text-rose-300 font-extrabold uppercase text-[9px] bg-rose-500/10 hover:bg-rose-500/20 px-2 py-1 rounded-lg transition-all border border-rose-500/15"
                  >
                    <LogOut className="w-3 h-3 text-rose-400" />
                    Logout
                  </button>
                </div>

                <div className="space-y-1">
                  <span className="text-neutral-500 block font-bold text-[9px] uppercase">Logged in as</span>
                  <span className="text-neutral-200 font-extrabold truncate block text-xs">{currentUser}</span>
                </div>

                {/* Database Animation Section */}
                <div className="bg-neutral-950/60 rounded-xl p-3 border border-neutral-800/60 space-y-2.5">
                  <span className="text-[10px] text-amber-400 font-black uppercase tracking-wider block">💾 Database Storage</span>
                  
                  {savedRecord ? (
                    <div className="space-y-2">
                      <div className="flex items-start gap-2 text-[11px] text-neutral-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-neutral-200">Saved Animation exists</p>
                          <div className="flex items-center gap-1 text-[9px] text-neutral-500 font-medium mt-0.5">
                            <Clock className="w-3 h-3 text-neutral-500" />
                            <span>Saved: {new Date(savedRecord.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div className="text-[9px] text-amber-500 font-black mt-1">
                            ⚠️ Auto-expires in {Math.max(0, Math.ceil((24 * 60 * 60 * 1000 - (Date.now() - savedRecord.savedAt)) / (60 * 60 * 1000)))} hours
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-neutral-900">
                        <button
                          onClick={handleLoadFromDatabase}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black text-[10px] text-center transition-all uppercase cursor-pointer"
                        >
                          LOAD SAVE
                        </button>
                        <button
                          onClick={handleDeleteSavedAnimation}
                          className="px-2.5 py-1.5 rounded-lg bg-neutral-850 hover:bg-neutral-800 border border-neutral-800 hover:border-rose-500/30 text-neutral-400 hover:text-rose-400 font-bold text-[10px] text-center transition-all uppercase cursor-pointer"
                        >
                          DELETE
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-[10px] text-neutral-500 leading-relaxed">
                        No animation currently saved in your database slot. Saving stores your objects, layers, and timelines for exactly 1 day.
                      </p>
                    </div>
                  )}

                  <button
                    onClick={handleSaveToDatabase}
                    className="w-full py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 font-black text-xs text-center hover:shadow-lg hover:shadow-amber-500/10 transition-all uppercase block cursor-pointer"
                  >
                    SAVE CURRENT WORK
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 2. MIDDLE WORKSPACE PANELS AND CANVAS */}
      <div className="flex-1 flex overflow-hidden min-h-0 bg-neutral-950 relative">
        {/* Left Toolbar Column */}
        <Toolbar
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          collapsed={toolbarCollapsed}
          setCollapsed={setToolbarCollapsed}
        />

        {/* Left Collapsible Parenting Hierarchy Tree Panel */}
        <LeftPanel
          objects={objects}
          selectedObjectId={selectedObjectId}
          setSelectedObjectId={setSelectedObjectId}
          updateObject={updateObject}
          deleteObject={deleteObject}
          layers={layers}
          setLayers={setLayers}
          activeLayerId={activeLayerId}
          setActiveLayerId={setActiveLayerId}
          open={leftOpen}
          setOpen={handleSetLeftOpen}
          groupObjects={(ids) => {
            const grpId = `grp_${Date.now()}`;
            alert(`Grouped selected items under parent ID: ${grpId}`);
          }}
          activeTool={activeTool}
          add3DModel={add3DModel}
          addCustom3DModel={addCustom3DModel}
          add360Object={add360Object}
          currentUser={currentUser}
          is360WizardActive={is360WizardActive}
          draft360Views={draft360Views}
          draftAnchorId={draftAnchorId}
          onionSkinEnabled360={onionSkinEnabled360}
          setOnionSkinEnabled360={setOnionSkinEnabled360}
          start360Wizard={start360Wizard}
          addDraft360View={addDraft360View}
          cancel360Wizard={cancel360Wizard}
          compile360Wizard={compile360Wizard}
          adaptiveSubdivisionEnabled={adaptiveSubdivisionEnabled}
          setAdaptiveSubdivisionEnabled={setAdaptiveSubdivisionEnabled}
          adaptiveSubdivisionPoints={adaptiveSubdivisionPoints}
          setAdaptiveSubdivisionPoints={setAdaptiveSubdivisionPoints}
          duplicateObject={duplicateObject}
          duplicateLassoBatch={duplicateLassoBatch}
          lassoPoints={lassoPoints}
          setLassoPoints={setLassoPoints}
          fillToolColor={fillToolColor}
          setFillToolColor={setFillToolColor}
          toolbarCollapsed={toolbarCollapsed}
          applyFillForever={applyFillForever}
          setApplyFillForever={setApplyFillForever}
          ignoreInnerDrawings={ignoreInnerDrawings}
          setIgnoreInnerDrawings={setIgnoreInnerDrawings}
          applyColorFillToSelected={applyColorFillToSelected}
        />

        {/* Central Vector Canvas Area */}
        <CanvasArea
          objects={objects}
          setObjects={setObjects}
          updateObject={updateObject}
          selectedObjectId={selectedObjectId}
          setSelectedObjectId={setSelectedObjectId}
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          frames={frames}
          currentFrameIndex={currentFrameIndex}
          autoTween={autoTween}
          bones={bones}
          setBones={setBones}
          activeLayerId={activeLayerId}
          onionSkinEnabled={onionSkinEnabled}
          showBones={showBones}
          isPlaying={isPlaying}
          historyPush={historyPush}
          layers={layers}
          setLayers={setLayers}
          lassoPoints={lassoPoints}
          setLassoPoints={setLassoPoints}
          fslPoints={fslPoints}
          setFslPoints={setFslPoints}
          lassoMode={lassoMode}
          setLassoMode={setLassoMode}
          penLassoPoints={penLassoPoints}
          setPenLassoPoints={setPenLassoPoints}
          realismSettings={realismSettings}
          is360WizardActive={is360WizardActive}
          draft360Views={draft360Views}
          onionSkinEnabled360={onionSkinEnabled360}
          artboardW={artboardW}
          setArtboardW={setArtboardW}
          artboardH={artboardH}
          setArtboardH={setArtboardH}
          showCanvasSizePanel={showCanvasSizePanel}
          setShowCanvasSizePanel={setShowCanvasSizePanel}
          adaptiveSubdivisionEnabled={adaptiveSubdivisionEnabled}
          adaptiveSubdivisionPoints={adaptiveSubdivisionPoints}
          fillToolColor={fillToolColor}
          setFillToolColor={setFillToolColor}
          ignoreInnerDrawings={ignoreInnerDrawings}
          brushSettings={brushSettings}
          setBrushSettings={setBrushSettings}
          selectedDeformPointIndex={selectedDeformPointIndex}
          setSelectedDeformPointIndex={setSelectedDeformPointIndex}
          selectedDeformPointType={selectedDeformPointType}
          setSelectedDeformPointType={setSelectedDeformPointType}
          setOriginalDeformPointCoords={setOriginalDeformPointCoords}
          setDeformPointTransform={setDeformPointTransform}
          isRecording={isRecording}
          liquifySettings={liquifySettings}
          setLiquifySettings={setLiquifySettings}
          hideLassoSelection={hideLassoSelection}
          setHideLassoSelection={setHideLassoSelection}
          hideFslSelection={hideFslSelection}
          setHideFslSelection={setHideFslSelection}
          continuousDrawActive={continuousDrawActive}
          setContinuousDrawActive={setContinuousDrawActive}
          activeContinuousDrawingId={activeContinuousDrawingId}
          setActiveContinuousDrawingId={setActiveContinuousDrawingId}
          lassoRestrictActive={lassoRestrictActive}
          setLassoRestrictActive={setLassoRestrictActive}
          registerInverseDeformer={handleRegisterInverseDeformer}
        />

        {/* Right Collapsible Properties, Sliders, Smart Pinned Controls */}
        <RightPanel
          activeLayerId={activeLayerId}
          historyPush={historyPush}
          selectedObject={selectedObjectId ? objects[selectedObjectId] : null}
          setSelectedObjectId={setSelectedObjectId}
          updateObject={updateObject}
          deleteObject={deleteObject}
          objects={objects}
          bones={bones}
          brushSettings={brushSettings}
          setBrushSettings={setBrushSettings}
          addBone={(bone) => setBones(prev => [...prev, bone])}
          deleteBone={(id) => {
            const targetBone = bones.find(b => b.id === id);
            if (targetBone) {
              const startObj = objects[targetBone.startObjectId];
              const endObj = objects[targetBone.endObjectId];
              if ((startObj && startObj.type === '3d') || (endObj && endObj.type === '3d')) {
                alert("Rigged 3D bone structures are permanently unified for structural integrity to prevent skeleton decoupling.");
                return;
              }
            }
            setBones(prev => prev.filter(b => b.id !== id));
          }}
          updateBone={(id, updates) => {
            setBones(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
          }}
          open={rightOpen}
          setOpen={handleSetRightOpen}
          smartPinnedIds={smartPinnedIds}
          toggleSmartPin={toggleSmartPin}
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          lassoPoints={lassoPoints}
          setLassoPoints={setLassoPoints}
          fslPoints={fslPoints}
          setFslPoints={setFslPoints}
          lassoMode={lassoMode}
          setLassoMode={setLassoMode}
          penLassoPoints={penLassoPoints}
          setPenLassoPoints={setPenLassoPoints}
          frames={frames}
          setFrames={setFrames}
          currentFrameIndex={currentFrameIndex}
          setCurrentFrameIndex={setCurrentFrameIndex}
          setObjects={setObjects}
          fps={fps}
          setFps={setFps}
          realismSettings={realismSettings}
          setRealismSettings={setRealismSettings}
          convertTo3D={convertTo3D}
          selectedDeformPointIndex={selectedDeformPointIndex}
          selectedDeformPointType={selectedDeformPointType}
          deformPointTransform={deformPointTransform}
          updateDeformPointTransform={updateDeformPointTransform}
          liquifySettings={liquifySettings}
          setLiquifySettings={setLiquifySettings}
          hideLassoSelection={hideLassoSelection}
          setHideLassoSelection={setHideLassoSelection}
          hideFslSelection={hideFslSelection}
          setHideFslSelection={setHideFslSelection}
          continuousDrawActive={continuousDrawActive}
          setContinuousDrawActive={setContinuousDrawActive}
          activeContinuousDrawingId={activeContinuousDrawingId}
          setActiveContinuousDrawingId={setActiveContinuousDrawingId}
          lassoRestrictActive={lassoRestrictActive}
          setLassoRestrictActive={setLassoRestrictActive}
          deleteLassoBatch={deleteLassoBatch}
          separateLassoBatch={separateLassoBatch}
          ignoreInnerDrawings={ignoreInnerDrawings}
          setIgnoreInnerDrawings={setIgnoreInnerDrawings}
          applyColorFillToSelected={applyColorFillToSelected}
          inverseDeformPoints={(pts, obj) => inverseDeformRef.current ? inverseDeformRef.current(pts, obj) : pts}
          autoTween={autoTween}
          setAutoTween={setAutoTween}
          toasts={toasts}
          setToasts={setToasts}
          dbNotification={dbNotification}
          limitNotification={limitNotification}
          setLimitNotification={setLimitNotification}
        />
      </div>

      {/* 2.5 DESKTOP TIMELINE RESIZER BAR */}
      {!isMobile && (
        <div
          className="h-2 bg-neutral-900 hover:bg-amber-500 cursor-ns-resize transition-colors duration-200 flex-shrink-0 relative z-30 select-none group flex items-center justify-center border-t border-b border-neutral-800 hover:border-amber-400"
          onMouseDown={(e) => {
            e.preventDefault();
            const startY = e.clientY;
            const startHeight = timelineHeight;

            const handleMouseMove = (moveEvent: MouseEvent) => {
              const deltaY = moveEvent.clientY - startY;
              const newHeight = Math.max(45, Math.min(550, startHeight - deltaY));
              setTimelineHeight(newHeight);
            };

            const handleMouseUp = () => {
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
        >
          {/* Subtle grab bar accent in the center */}
          <div className="w-14 h-1 rounded-full bg-neutral-700 group-hover:bg-amber-300 transition-colors" />
        </div>
      )}

      {/* 3. BOTTOM FRAMES TIMELINE */}
      <Timeline
        frames={frames}
        currentFrameIndex={currentFrameIndex}
        setCurrentFrameIndex={setCurrentFrameIndex}
        addFrame={addFrame}
        deleteFrame={deleteFrame}
        duplicateFrame={duplicateFrame}
        copyFrame={copyFrame}
        pasteFrame={pasteFrame}
        onionSkinEnabled={onionSkinEnabled}
        setOnionSkinEnabled={setOnionSkinEnabled}
        showBones={showBones}
        setShowBones={setShowBones}
        batchAddFrames={batchAddFrames}
        fps={fps}
        setFps={setFps}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        autoTween={autoTween}
        setAutoTween={setAutoTween}
        showCanvasSizePanel={showCanvasSizePanel}
        setShowCanvasSizePanel={setShowCanvasSizePanel}
        style={!isMobile ? { height: timelineHeight } : undefined}
      />

      {/* 3.5 BOTTOM SPONSOR ADS BAR (2 Boxes, Centered, 76px Height, Spacious Margins) */}
      {isMobile && (
        <div className="w-full bg-transparent p-[2px] flex gap-2 items-center select-none shrink-0 mt-2 mb-1 px-3 animate-fade-in" id="bottom-ads-bar" style={{ border: 'none', outline: 'none' }}>
          <div className="flex-1 h-[76px] min-w-0" style={{ border: 'none', outline: 'none' }}>
            {renderAdBox(ADS_DATA[bottomAdIndex1], 'top')}
          </div>
          <div className="flex-1 h-[76px] min-w-0" style={{ border: 'none', outline: 'none' }}>
            {renderAdBox(ADS_DATA[bottomAdIndex2], 'top')}
          </div>
        </div>
      )}

      {/* 4. NOTIFICATION & TOAST OVERLAYS */}
      {dbNotification && (
        <div 
          id="db-toast-notification"
          className={`fixed bottom-24 right-6 z-50 flex items-start gap-3 p-4 rounded-2xl shadow-2xl border text-xs max-w-sm animate-fade-in ${
            dbNotification.type === 'success' 
              ? 'bg-emerald-950/95 border-emerald-500/30 text-emerald-300' 
              : dbNotification.type === 'error'
              ? 'bg-rose-950/95 border-rose-500/30 text-rose-300'
              : 'bg-amber-950/95 border-amber-500/30 text-amber-300'
          }`}
        >
          {dbNotification.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
          {dbNotification.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />}
          {dbNotification.type === 'info' && <Clock className="w-5 h-5 text-amber-400 shrink-0 animate-pulse" />}
          <div className="space-y-1">
            <p className="font-extrabold uppercase text-[10px] tracking-wider text-neutral-200">
              {dbNotification.type === 'success' ? 'Database Success' : dbNotification.type === 'error' ? 'Database Alert' : 'System Notice'}
            </p>
            <p className="text-neutral-300 font-medium leading-relaxed">{dbNotification.message}</p>
          </div>
        </div>
      )}

      {/* Daily limit alert toast */}
      {limitNotification && (
        <div 
          id="limit-toast-notification"
          className="fixed bottom-24 right-6 z-50 flex items-start justify-between gap-3 p-4 rounded-2xl shadow-2xl border text-xs max-w-sm animate-fade-in bg-rose-950/95 border-rose-500/30 text-rose-300"
        >
          <div className="flex gap-2.5 items-start">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1 pr-2">
              <p className="font-extrabold uppercase text-[10px] tracking-wider text-rose-200">
                {limitNotification.includes("Security") ? "SECURITY ALERT" : "LIMIT REACHED"}
              </p>
              <p className="text-neutral-200 font-medium leading-relaxed">{limitNotification}</p>
            </div>
          </div>
          <button
            onClick={() => setLimitNotification(null)}
            className="text-rose-400 hover:text-white font-bold p-1 hover:bg-rose-900/40 rounded transition-all shrink-0 cursor-pointer text-[11px]"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Sleek HUD Shortcut Hint Overlay */}
      {shortcutHint && (
        <div 
          id="shortcut-hud-hint"
          className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-neutral-900/90 border border-amber-500/30 text-amber-400 font-extrabold px-6 py-2.5 rounded-full shadow-[0_0_25px_rgba(245,158,11,0.25)] text-xs tracking-wider uppercase animate-fade-in pointer-events-none backdrop-blur flex items-center gap-2"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span>{shortcutHint}</span>
        </div>
      )}
      {/* 5. AUTH MODAL OVERLAY */}
      {isAuthModalOpen && (
        <div 
          id="auth-modal-overlay" 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
        >
          <div className="w-full max-w-md bg-white border border-neutral-200 rounded-2xl shadow-2xl overflow-hidden text-neutral-800">
            {/* Header */}
            <div className="p-5 border-b border-neutral-100 flex items-center justify-between bg-neutral-50">
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-amber-600" />
                <h3 className="font-black uppercase tracking-wider text-sm text-neutral-900">Simple Authentication</h3>
              </div>
              <button
                onClick={() => {
                  setIsAuthModalOpen(false);
                  setAuthError('');
                }}
                className="text-neutral-400 hover:text-neutral-700 font-black text-sm p-1.5 hover:bg-neutral-100 rounded-lg transition-all"
              >
                ✕
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleAuthSubmit} className="p-5 space-y-4">
              <p className="text-xs text-neutral-600 leading-relaxed">
                Log in with your Gmail address to access your private storage slot. Your saved work will be retained securely for exactly <strong className="text-amber-600 font-bold">1 day (24 hours)</strong> and then auto-deleted.
              </p>

              {/* Alert info banner */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[10.5px] text-amber-900 leading-relaxed space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-amber-800 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  Simple Credentials Rule:
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-neutral-600">
                  <li>Email must end with <code className="text-amber-800 text-[10px] bg-amber-100 px-1 py-0.5 rounded font-mono font-bold">@gmail.com</code></li>
                  <li>Password: <code className="text-amber-800 text-[10px] bg-amber-100 px-1 py-0.5 rounded font-mono font-bold">123456</code> or <code className="text-amber-800 text-[10px] bg-amber-100 px-1 py-0.5 rounded font-mono font-bold">password</code></li>
                </ul>
              </div>

              {authError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 text-xs font-semibold">
                  ⚠️ {authError}
                </div>
              )}

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-neutral-500 font-black uppercase tracking-wider block">Gmail Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-4 h-4 text-neutral-400" />
                  <input
                    type="email"
                    required
                    placeholder="yourname@gmail.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-200 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl py-2 pl-9 pr-4 text-xs font-medium text-neutral-900 placeholder-neutral-400 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-neutral-500 font-black uppercase tracking-wider block">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-4 h-4 text-neutral-400" />
                  <input
                    type="password"
                    required
                    placeholder="••••••"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-200 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl py-2 pl-9 pr-4 text-xs font-medium text-neutral-900 placeholder-neutral-400 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                className="w-full py-2.5 mt-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-600 hover:to-amber-500 text-neutral-950 font-black text-xs text-center transition-all uppercase cursor-pointer shadow-sm shadow-amber-500/10"
              >
                Log In & Sync
              </button>
            </form>
          </div>
        </div>
      )}

      </div>
      
      <SavedAnimationsModal
        isOpen={isSavedAnimationsModalOpen}
        onClose={() => setIsSavedAnimationsModalOpen(false)}
        currentUser={currentUser}
        currentProjectData={{
          fps,
          layers,
          objects,
          frames,
          bones
        }}
        onLoadProject={handleLoadProjectFromModal}
        onNotification={(msg) => {
          setDbNotification(msg);
          setTimeout(() => setDbNotification(null), 4000);
        }}
      />



      <CustomDialog config={dialogConfig} />
    </div>
  );
}
