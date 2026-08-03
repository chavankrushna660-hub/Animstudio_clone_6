import { Point, VectorObject } from '../types';
import { localToWorld } from './math';

/**
 * Traces contour of flood-filled 2D mask array using boundary follower
 */
function traceMaskContour(mask: Uint8Array, width: number, height: number, minX: number, minY: number, scaleFactor: number): Point[] {
  // Find first boundary pixel
  let startX = -1, startY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] === 1) {
        startX = x;
        startY = y;
        break;
      }
    }
    if (startX !== -1) break;
  }

  if (startX === -1) return [];

  // Direction vectors (8-connectivity: R, RD, D, LD, L, LU, U, RU)
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];

  const contourPoints: Point[] = [];
  let currX = startX;
  let currY = startY;
  let dir = 0;

  const maxSteps = width * height;
  let steps = 0;

  do {
    contourPoints.push({
      x: Number((minX + currX * scaleFactor).toFixed(2)),
      y: Number((minY + currY * scaleFactor).toFixed(2)),
    });

    let foundNext = false;
    const startDir = (dir + 6) % 8;
    for (let i = 0; i < 8; i++) {
      const nextDir = (startDir + i) % 8;
      const nx = currX + dx[nextDir];
      const ny = currY + dy[nextDir];

      if (nx >= 0 && nx < width && ny >= 0 && ny < height && mask[ny * width + nx] === 1) {
        currX = nx;
        currY = ny;
        dir = nextDir;
        foundNext = true;
        break;
      }
    }

    if (!foundNext) break;
    steps++;
  } while ((currX !== startX || currY !== startY) && steps < maxSteps);

  // Smooth & simplify contour points to make clean vector shape
  if (contourPoints.length > 12) {
    const stepSize = Math.max(1, Math.floor(contourPoints.length / 75));
    const simplified: Point[] = [];
    for (let i = 0; i < contourPoints.length; i += stepSize) {
      simplified.push(contourPoints[i]);
    }
    if (simplified.length > 3) {
      simplified.push({ ...simplified[0] });
      return simplified;
    }
  }

  return contourPoints;
}

/**
 * Performs Smart Gap-Closing Flood Fill across all strokes on active layer
 */
export function performSmartFloodFill(
  clickCoords: Point,
  objects: { [id: string]: VectorObject },
  activeLayerId: string,
  fillColor: string,
  gapClosurePx: number = 18
): VectorObject | null {
  try {
    const layerObjects = Object.values(objects).filter(
      obj => (!obj.layerId || obj.layerId === activeLayerId) && !obj.isHidden
    );

    if (layerObjects.length === 0) return null;

    const sampleRadius = 400; // 800x800 sample area around click
    const minX = clickCoords.x - sampleRadius;
    const minY = clickCoords.y - sampleRadius;

    const canvasWidth = 400;
    const canvasHeight = 400;
    const scaleFactor = (sampleRadius * 2) / canvasWidth;

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    ctx.strokeStyle = '#000000';
    ctx.fillStyle = '#000000';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    layerObjects.forEach(obj => {
      const pivot = obj.pivots?.[0] || { localX: 0, localY: 0 };
      const strokeW = Math.max(3, (obj.strokeWidth || 3.5) + gapClosurePx) / scaleFactor;
      ctx.lineWidth = strokeW;

      const subPaths = (obj.subPaths && obj.subPaths.length > 0)
        ? obj.subPaths
        : (obj.points && obj.points.length > 0 ? [obj.points] : []);

      subPaths.forEach(pts => {
        if (pts.length < 2) return;
        ctx.beginPath();
        pts.forEach((p, idx) => {
          const worldP = localToWorld(p, obj.transform, pivot);
          const imgX = (worldP.x - minX) / scaleFactor;
          const imgY = (worldP.y - minY) / scaleFactor;
          if (idx === 0) ctx.moveTo(imgX, imgY);
          else ctx.lineTo(imgX, imgY);
        });
        ctx.stroke();
      });
    });

    const imgData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    const data = imgData.data;

    const startX = Math.round((clickCoords.x - minX) / scaleFactor);
    const startY = Math.round((clickCoords.y - minY) / scaleFactor);

    if (startX < 3 || startX >= canvasWidth - 3 || startY < 3 || startY >= canvasHeight - 3) {
      return null;
    }

    const startIdx = (startY * canvasWidth + startX) * 4;
    if (data[startIdx] < 60) {
      return null;
    }

    const mask = new Uint8Array(canvasWidth * canvasHeight);
    const queue: number[] = [startX, startY];
    mask[startY * canvasWidth + startX] = 1;

    let isBoundaryTouch = false;
    let filledCount = 0;
    const maxPixels = canvasWidth * canvasHeight * 0.85;

    const dx = [1, -1, 0, 0];
    const dy = [0, 0, 1, -1];

    let head = 0;
    while (head < queue.length) {
      const cx = queue[head++];
      const cy = queue[head++];
      filledCount++;

      if (filledCount > maxPixels) {
        isBoundaryTouch = true;
        break;
      }

      if (cx <= 1 || cx >= canvasWidth - 2 || cy <= 1 || cy >= canvasHeight - 2) {
        isBoundaryTouch = true;
        break;
      }

      for (let i = 0; i < 4; i++) {
        const nx = cx + dx[i];
        const ny = cy + dy[i];

        if (nx >= 0 && nx < canvasWidth && ny >= 0 && ny < canvasHeight) {
          const mIdx = ny * canvasWidth + nx;
          if (mask[mIdx] === 0) {
            const pIdx = mIdx * 4;
            if (data[pIdx] > 180) {
              mask[mIdx] = 1;
              queue.push(nx, ny);
            }
          }
        }
      }
    }

    if (isBoundaryTouch || filledCount < 15) {
      return null;
    }

    const contour = traceMaskContour(mask, canvasWidth, canvasHeight, minX, minY, scaleFactor);
    if (contour.length < 3) return null;

    const newId = `fill_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const centerP = contour[0];

    const fillObj: VectorObject = {
      id: newId,
      name: `SmartFill_${Object.keys(objects).length + 1}`,
      type: 'shape',
      points: contour,
      strokeColor: 'transparent',
      strokeWidth: 0,
      fillColor: fillColor,
      opacity: 1,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      pivots: [{ id: `pvt_${Date.now()}`, name: 'Pivot_1', localX: centerP.x, localY: centerP.y, locked: false }],
      parentId: null,
      childrenIds: [],
      layerId: activeLayerId,
      isLocked: false,
      isHidden: false,
    };

    return fillObj;
  } catch (e) {
    console.error('performSmartFloodFill error:', e);
    return null;
  }
}
