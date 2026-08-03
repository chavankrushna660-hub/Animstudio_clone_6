import { Point } from '../types';

/**
 * Extracts the silhouette/contour points of a non-transparent PNG object image.
 * Traces the boundary of non-transparent alpha pixels (alpha > 25) so that
 * PNG-to-3D conversion extrudes the actual object geometry rather than a box frame.
 */
export function extractPNGSilhouetteContour(
  img: HTMLImageElement,
  targetWidth: number,
  targetHeight: number
): Point[] {
  try {
    const canvas = document.createElement('canvas');
    const gridW = 180;
    const gridH = Math.max(30, Math.round(180 * (targetHeight / Math.max(1, targetWidth))));
    canvas.width = gridW;
    canvas.height = gridH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return defaultBoxPoints(targetWidth, targetHeight);

    ctx.drawImage(img, 0, 0, gridW, gridH);
    const imgData = ctx.getImageData(0, 0, gridW, gridH);
    const pixels = imgData.data;

    // Build binary mask where pixel is solid if alpha > 15
    const mask: boolean[][] = [];
    let solidCount = 0;
    let minX = gridW, maxX = -1, minY = gridH, maxY = -1;
    let startX = -1, startY = -1;

    for (let y = 0; y < gridH; y++) {
      mask[y] = [];
      for (let x = 0; x < gridW; x++) {
        const alpha = pixels[(y * gridW + x) * 4 + 3];
        const isSolid = alpha > 15;
        mask[y][x] = isSolid;
        if (isSolid) {
          solidCount++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          if (startX === -1) {
            startX = x;
            startY = y;
          }
        }
      }
    }

    if (solidCount === 0 || startX === -1) {
      return defaultBoxPoints(targetWidth, targetHeight);
    }

    // Moore-Neighbor Tracing Algorithm
    const dx = [1, 1, 0, -1, -1, -1, 0, 1];
    const dy = [0, 1, 1, 1, 0, -1, -1, -1];

    let currX = startX;
    let currY = startY;
    let dir = 7;
    const boundaryPoints: { x: number; y: number }[] = [];
    const maxSteps = gridW * gridH * 2;
    let steps = 0;

    while (steps < maxSteps) {
      boundaryPoints.push({ x: currX, y: currY });
      let foundNext = false;
      const startDir = (dir + 6) % 8;
      for (let i = 0; i < 8; i++) {
        const checkDir = (startDir + i) % 8;
        const nx = currX + dx[checkDir];
        const ny = currY + dy[checkDir];

        if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH && mask[ny][nx]) {
          currX = nx;
          currY = ny;
          dir = checkDir;
          foundNext = true;
          break;
        }
      }

      if (!foundNext || (currX === startX && currY === startY)) {
        break;
      }
      steps++;
    }

    if (boundaryPoints.length < 3) {
      return defaultBoxPoints(targetWidth, targetHeight);
    }

    // Downsample contour smoothly
    const targetPointCount = Math.min(64, Math.max(20, Math.floor(boundaryPoints.length / 2)));
    const stepSize = boundaryPoints.length / targetPointCount;
    const sampledPoints: Point[] = [];

    for (let i = 0; i < targetPointCount; i++) {
      const idx = Math.floor(i * stepSize);
      const p = boundaryPoints[idx];
      const worldX = (p.x / gridW - 0.5) * targetWidth;
      const worldY = (p.y / gridH - 0.5) * targetHeight;
      sampledPoints.push({ x: Number(worldX.toFixed(2)), y: Number(worldY.toFixed(2)) });
    }

    if (sampledPoints.length > 0) {
      sampledPoints.push({ ...sampledPoints[0] });
    }

    return sampledPoints;
  } catch (err) {
    console.error("PNG silhouette contour extraction error:", err);
    return defaultBoxPoints(targetWidth, targetHeight);
  }
}

function defaultBoxPoints(w: number, h: number): Point[] {
  return [
    { x: -w / 2, y: -h / 2 },
    { x: w / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 },
    { x: -w / 2, y: h / 2 },
    { x: -w / 2, y: -h / 2 }
  ];
}
