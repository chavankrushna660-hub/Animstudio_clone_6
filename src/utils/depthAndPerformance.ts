import { Point, VectorObject } from '../types';

/**
 * 🏗️ PART 1: 3D DEPTH LAYER SYSTEM
 * Pure Native Implementation for Z-Depth, Parallax, DOF Blur, and Atmospheric Perspective
 */

export interface DepthRenderOptions {
  cameraX: number;
  cameraY: number;
  focalZ: number;
  enableParallax?: boolean;
  enableDOF?: boolean;
  enableAtmosphere?: boolean;
  viewportWidth: number;
  viewportHeight: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Calculates Parallax offset based on Z-depth
 */
export function getParallaxFactor(z: number): number {
  return 1 / (1 + Math.abs(z) * 0.001);
}

/**
 * Depth of Field Blur calculation based on distance from focalZ
 */
export function getDepthOfFieldBlur(z: number, focalZ: number): number {
  const distanceFromFocus = Math.abs(z - focalZ);
  return Math.min(distanceFromFocus * 0.02, 10); // Cap blur at 10px for performance
}

/**
 * Atmospheric Perspective opacity reduction calculation
 */
export function getAtmosphericOpacity(z: number): number {
  if (z >= -100) return 1.0;
  const fadeRatio = Math.min(Math.abs(z) / 1000, 0.6);
  return Math.max(0.4, 1 - fadeRatio);
}

/**
 * Fast AABB Frustum Culling Check
 */
export function isInViewport(
  bounds: BoundingBox,
  cameraX: number,
  cameraY: number,
  viewportWidth: number,
  viewportHeight: number
): boolean {
  const viewportLeft = cameraX;
  const viewportRight = cameraX + viewportWidth;
  const viewportTop = cameraY;
  const viewportBottom = cameraY + viewportHeight;

  return !(
    bounds.x + bounds.w < viewportLeft ||
    bounds.x > viewportRight ||
    bounds.y + bounds.h < viewportTop ||
    bounds.y > viewportBottom
  );
}

/**
 * Sorts objects by Z-Depth (Ascending: furthest first, painter's algorithm)
 */
export function sortObjectsByZDepth<T extends { z?: number; transform3D?: { z?: number } }>(objects: T[]): T[] {
  return [...objects].sort((a, b) => {
    const zA = a.z ?? a.transform3D?.z ?? 0;
    const zB = b.z ?? b.transform3D?.z ?? 0;
    return zA - zB;
  });
}

/**
 * ⚡ PART 2: ADVANCED OPTIMIZATION (10,000+ Objects)
 */

/**
 * 1. Spatial Hash Grid for O(1) Spatial Queries & Hit Testing
 */
export class SpatialHashGrid<T extends { id: string }> {
  private cellSize: number;
  private grid: Map<string, T[]>;

  constructor(cellSize = 100) {
    this.cellSize = cellSize;
    this.grid = new Map();
  }

  clear(): void {
    this.grid.clear();
  }

  insert(obj: T, bounds: BoundingBox): void {
    const startX = Math.floor(bounds.x / this.cellSize);
    const endX = Math.floor((bounds.x + bounds.w) / this.cellSize);
    const startY = Math.floor(bounds.y / this.cellSize);
    const endY = Math.floor((bounds.y + bounds.h) / this.cellSize);

    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        const key = `${x},${y}`;
        if (!this.grid.has(key)) {
          this.grid.set(key, []);
        }
        this.grid.get(key)!.push(obj);
      }
    }
  }

  query(x: number, y: number, width: number, height: number): T[] {
    const startX = Math.floor(x / this.cellSize);
    const endX = Math.floor((x + width) / this.cellSize);
    const startY = Math.floor(y / this.cellSize);
    const endY = Math.floor((y + height) / this.cellSize);

    const resultsSet = new Set<T>();

    for (let cx = startX; cx <= endX; cx++) {
      for (let cy = startY; cy <= endY; cy++) {
        const cell = this.grid.get(`${cx},${cy}`);
        if (cell) {
          for (let i = 0; i < cell.length; i++) {
            resultsSet.add(cell[i]);
          }
        }
      }
    }

    return Array.from(resultsSet);
  }
}

/**
 * 2. Offscreen Canvas Caching (Static Layer Baking)
 */
export class LayerCache {
  public canvas: OffscreenCanvas | HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  public isDirty: boolean = true;

  constructor(width: number, height: number) {
    if (typeof OffscreenCanvas !== 'undefined') {
      this.canvas = new OffscreenCanvas(width, height);
    } else {
      this.canvas = document.createElement('canvas');
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
  }

  resize(width: number, height: number): void {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.isDirty = true;
    }
  }

  markDirty(): void {
    this.isDirty = true;
  }

  bake(drawFn: (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => void): void {
    if (!this.isDirty) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    drawFn(this.ctx);
    this.isDirty = false;
  }

  renderToMain(ctx: CanvasRenderingContext2D, x = 0, y = 0): void {
    ctx.drawImage(this.canvas as CanvasImageSource, x, y);
  }
}

/**
 * 3. Object Pooling (Zero Garbage Collection Spikes)
 */
export class ObjectPool<T> {
  private createFn: () => T;
  private resetFn: (obj: T) => void;
  private pool: T[] = [];
  private active: T[] = [];

  constructor(createFn: () => T, resetFn: (obj: T) => void, initialSize = 500) {
    this.createFn = createFn;
    this.resetFn = resetFn;

    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.createFn());
    }
  }

  acquire(): T {
    const obj = this.pool.length > 0 ? this.pool.pop()! : this.createFn();
    this.resetFn(obj);
    this.active.push(obj);
    return obj;
  }

  release(obj: T): void {
    const index = this.active.indexOf(obj);
    if (index > -1) {
      this.active.splice(index, 1);
      this.pool.push(obj);
    }
  }

  releaseAll(): void {
    while (this.active.length > 0) {
      const obj = this.active.pop()!;
      this.pool.push(obj);
    }
  }
}

/**
 * Dirty Rectangle Tracking
 */
export interface DirtyRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class DirtyRegionManager {
  private dirtyRects: DirtyRect[] = [];

  markDirty(x: number, y: number, width: number, height: number): void {
    this.dirtyRects.push({ x, y, width, height });
  }

  getRegions(): DirtyRect[] {
    return this.dirtyRects;
  }

  clear(): void {
    this.dirtyRects = [];
  }
}
