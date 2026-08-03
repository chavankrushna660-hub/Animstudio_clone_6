import { Point, VectorObject } from '../types';
import { localToWorld, extractAllSubPaths } from './math';

export class Math3D {
    // Degree to Radian conversion
    static degToRad(deg: number): number {
        return (deg * Math.PI) / 180;
    }
    
    // 3D Point rotate around X-axis
    static rotateX(point: { x: number; y: number; z: number }, angle: number): { x: number; y: number; z: number } {
        const rad = this.degToRad(angle);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        return {
            x: point.x,
            y: point.y * cos - point.z * sin,
            z: point.y * sin + point.z * cos
        };
    }
    
    // 3D Point rotate around Y-axis
    static rotateY(point: { x: number; y: number; z: number }, angle: number): { x: number; y: number; z: number } {
        const rad = this.degToRad(angle);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        return {
            x: point.x * cos + point.z * sin,
            y: point.y,
            z: -point.x * sin + point.z * cos
        };
    }
    
    // 3D Point rotate around Z-axis
    static rotateZ(point: { x: number; y: number; z: number }, angle: number): { x: number; y: number; z: number } {
        const rad = this.degToRad(angle);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        return {
            x: point.x * cos - point.y * sin,
            y: point.x * sin + point.y * cos,
            z: point.z
        };
    }
    
    // Get 3x3 rotation matrix for fast batch transformations
    static getRotationMatrix(rx: number, ry: number, rz: number) {
        const radX = (rx * Math.PI) / 180;
        const radY = (ry * Math.PI) / 180;
        const radZ = (rz * Math.PI) / 180;

        const cx = Math.cos(radX), sx = Math.sin(radX);
        const cy = Math.cos(radY), sy = Math.sin(radY);
        const cz = Math.cos(radZ), sz = Math.sin(radZ);

        return {
            m00: cz * cy,
            m01: cz * sy * sx - sz * cx,
            m02: cz * sy * cx + sz * sx,
            m10: sz * cy,
            m11: sz * sy * sx + cz * cx,
            m12: sz * sy * cx - cz * sx,
            m20: -sy,
            m21: cy * sx,
            m22: cy * cx
        };
    }

    // Apply 3x3 matrix rotation
    static applyMatrix(point: { x: number; y: number; z: number }, m: ReturnType<typeof Math3D.getRotationMatrix>): { x: number; y: number; z: number } {
        return {
            x: point.x * m.m00 + point.y * m.m01 + point.z * m.m02,
            y: point.x * m.m10 + point.y * m.m11 + point.z * m.m12,
            z: point.x * m.m20 + point.y * m.m21 + point.z * m.m22
        };
    }

    // Apply all rotations (order: Z -> Y -> X)
    static applyRotation(point: { x: number; y: number; z: number }, rx: number, ry: number, rz: number): { x: number; y: number; z: number } {
        const m = this.getRotationMatrix(rx, ry, rz);
        return this.applyMatrix(point, m);
    }
    
    // Apply scale
    static applyScale(point: { x: number; y: number; z: number }, sx: number, sy: number, sz: number): { x: number; y: number; z: number } {
        return {
            x: point.x * sx,
            y: point.y * sy,
            z: point.z * sz
        };
    }
    
    // Perspective Projection (3D -> 2D screen)
    static project(point: { x: number; y: number; z: number }, perspective: number, centerX: number, centerY: number): { x: number; y: number; scale: number; z: number } {
        const scale = perspective / Math.max(1, perspective + point.z);
        return {
            x: centerX + point.x * scale,
            y: centerY + point.y * scale,
            scale: scale,  // for stroke width calculation
            z: point.z     // for depth sorting
        };
    }
    
    // Calculate face normal (for lighting)
    static calculateNormal(
        p1: { x: number; y: number; z: number },
        p2: { x: number; y: number; z: number },
        p3: { x: number; y: number; z: number }
    ): { x: number; y: number; z: number } {
        const v1 = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };
        const v2 = { x: p3.x - p1.x, y: p3.y - p1.y, z: p3.z - p1.z };
        const nx = v1.y * v2.z - v1.z * v2.y;
        const ny = v1.z * v2.x - v1.x * v2.z;
        const nz = v1.x * v2.y - v1.y * v2.x;
        const len = Math.hypot(nx, ny, nz) || 1;
        return {
            x: nx / len,
            y: ny / len,
            z: nz / len
        };
    }
    
    // Dot product (for lighting calculation)
    static dot(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
        return a.x * b.x + a.y * b.y + a.z * b.z;
    }
}

export class ExtrusionGenerator {
    
    // Main function: 2D drawing -> 3D mesh
    static generateMesh(drawing: VectorObject) {
        const path = drawing.points; // original 2D points
        const t3d = drawing.transform3D;
        
        if (!t3d || !t3d.enabled) {
            return null; // No 3D
        }
        
        const extrusionDepth = t3d.extrusion?.depth ?? 50;
        const scaleZ = t3d.scaleZ ?? 1;
        // Calculate extrusion depth
        const depth = extrusionDepth * scaleZ;
        
        if (path.length < 2) {
            return null;
        }
        
        // Calculate center of the drawing
        const center = this.calculateCenter(path);
        
        // Generate faces
        const frontFace = this.generateFrontFace(path, center, -depth / 2);      // z = -depth/2 (centered)
        const backFace = this.generateFrontFace(path, center, depth / 2);   // z = depth/2
        const sideFaces = this.generateSideFaces(path, center, -depth / 2, depth / 2);  // connecting walls
        
        const frontVerticesCount = frontFace.vertices.length;
        const backVerticesCount = backFace.vertices.length;
        
        // Combine all vertices
        const vertices = [
            ...frontFace.vertices,
            ...backFace.vertices,
            ...sideFaces.vertices
        ];
        
        // Combine all faces with face type and correct index offsets
        const faces = [
            ...frontFace.faces.map(f => ({ vertexIndices: f, type: 'front' })),
            ...backFace.faces.map(f => ({ vertexIndices: f.map(idx => idx + frontVerticesCount), type: 'back' })),
            ...sideFaces.faces.map(f => ({ vertexIndices: f.map(idx => idx + frontVerticesCount + backVerticesCount), type: 'side' }))
        ];
        
        return { vertices, faces };
    }
    
    // Calculate center point of path
    static calculateCenter(points: Point[]): { x: number; y: number; z: number } {
        let sumX = 0, sumY = 0;
        points.forEach(p => { sumX += p.x; sumY += p.y; });
        return {
            x: sumX / points.length,
            y: sumY / points.length,
            z: 0
        };
    }
    
    // Generate front or back face (same shape, different Z)
    static generateFrontFace(path: Point[], center: { x: number; y: number; z: number }, zOffset: number) {
        const vertices = path.map(p => ({
            x: p.x - center.x,
            y: p.y - center.y,
            z: zOffset
        }));
        
        // Triangulate the face (simple fan triangulation)
        const faces: number[][] = [];
        for (let i = 1; i < vertices.length - 1; i++) {
            faces.push([0, i, i + 1]); // triangle indices
        }
        
        return { vertices, faces };
    }
    
    // Generate side faces (walls connecting front to back)
    static generateSideFaces(path: Point[], center: { x: number; y: number; z: number }, zStart: number, zEnd: number) {
        const vertices: { x: number; y: number; z: number }[] = [];
        const faces: number[][] = [];
        
        // For each edge of the path, create a quad (2 triangles)
        for (let i = 0; i < path.length; i++) {
            const next = (i + 1) % path.length;
            const baseIndex = vertices.length;
            
            // 4 corners of the quad
            vertices.push(
                { x: path[i].x - center.x, y: path[i].y - center.y, z: zStart },      // front-top
                { x: path[next].x - center.x, y: path[next].y - center.y, z: zStart },// front-bottom
                { x: path[next].x - center.x, y: path[next].y - center.y, z: zEnd }, // back-bottom
                { x: path[i].x - center.x, y: path[i].y - center.y, z: zEnd }   // back-top
            );
            
            // 2 triangles for the quad
            faces.push([baseIndex, baseIndex + 1, baseIndex + 2]);
            faces.push([baseIndex, baseIndex + 2, baseIndex + 3]);
        }
        
        return { vertices, faces };
    }
}

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
  const cx = (x0 + x1 + x2) / 3;
  const cy = (y0 + y1 + y2) / 3;
  const expand = 0.5;

  let dx0 = x0 - cx; let dy0 = y0 - cy;
  let len0 = Math.sqrt(dx0 * dx0 + dy0 * dy0);
  if (len0 > 0) { x0 += (dx0 / len0) * expand; y0 += (dy0 / len0) * expand; }

  let dx1 = x1 - cx; let dy1 = y1 - cy;
  let len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
  if (len1 > 0) { x1 += (dx1 / len1) * expand; y1 += (dy1 / len1) * expand; }

  let dx2 = x2 - cx; let dy2 = y2 - cy;
  let len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
  if (len2 > 0) { x2 += (dx2 / len2) * expand; y2 += (dy2 / len2) * expand; }

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

export class Renderer3D {
    
    static render(drawing: VectorObject, ctx: CanvasRenderingContext2D) {
        const t3d = drawing.transform3D;
        
        if (!t3d || !t3d.enabled) {
            this.render2D(drawing, ctx);
            return;
        }
        
        let renderingPoints = drawing.points;
        if (!renderingPoints || renderingPoints.length < 2) {
            if (drawing.imageUrl || drawing.type === 'image') {
                const w = drawing.transform?.width || 200;
                const h = drawing.transform?.height || 200;
                renderingPoints = [
                    { x: -w / 2, y: -h / 2 },
                    { x: w / 2, y: -h / 2 },
                    { x: w / 2, y: h / 2 },
                    { x: -w / 2, y: h / 2 },
                    { x: -w / 2, y: -h / 2 }
                ];
            } else {
                this.render2D(drawing, ctx);
                return;
            }
        }
        
        // 1. Calculate drawing center (for rotation pivot)
        const center = ExtrusionGenerator.calculateCenter(renderingPoints);
        
        const scaleX = t3d.scaleX ?? 1;
        const scaleY = t3d.scaleY ?? 1;
        const scaleZ = t3d.scaleZ ?? 1;
        const rotateX = t3d.rotateX ?? 0;
        const rotateY = t3d.rotateY ?? 0;
        const rotateZ = t3d.rotateZ ?? 0;
        const translateZ = t3d.translateZ ?? 0;
        const perspective = t3d.perspective ?? 800;
        const bevelProfile = (t3d as any).bevelProfile ?? 'flat';
        
        // 5 Extra 3D Transform Sliders
        const depthTaperVal = (t3d as any).depthTaper ?? 0;
        const depthCurvatureVal = (t3d as any).depthCurvature ?? 0;
        const twistZVal = (t3d as any).twistZ ?? 0;
        const shearZVal = (t3d as any).shearZ ?? 0;
        const inflateDepthVal = (t3d as any).inflateDepth ?? 0;
        
        const extrusionDepth = t3d.extrusion?.depth ?? 40;
        const totalDepth = extrusionDepth * scaleZ;
        
        const pivot = drawing.pivots[0] || { localX: 0, localY: 0 };
        const rotMatrix = Math3D.getRotationMatrix(rotateX, rotateY, rotateZ);
        
        // Function to project a point at a given Z level with depth progress (0 to 1)
        const projectPointAtZ = (p: Point, z: number, depthProgress: number = 0.5) => {
            // Compute blend curve / bevel factor along extrusion depth
            let bevelFactor = 1.0;
            if (bevelProfile === 'bevel') {
                const edgeDist = Math.min(depthProgress, 1 - depthProgress);
                bevelFactor = 0.8 + 0.4 * Math.min(1, edgeDist * 4);
            } else if (bevelProfile === 'dome') {
                bevelFactor = 0.35 + 0.65 * Math.sin(depthProgress * Math.PI);
            } else if (bevelProfile === 'taper') {
                bevelFactor = 0.25 + 0.75 * depthProgress;
            } else if (bevelProfile === 'scurve') {
                bevelFactor = 0.5 + 0.5 * Math.sin((depthProgress - 0.5) * Math.PI);
            } else if (bevelProfile === 'hourglass') {
                bevelFactor = 0.7 + 0.3 * Math.cos(depthProgress * Math.PI * 2);
            }
            
            // 5 Extra 3D Transform Calculations:
            // 1. Conical Depth Taper
            const taperFactor = 1.0 + (depthProgress - 0.5) * (depthTaperVal / 100);
            
            let lx = (p.x - center.x) * scaleX * bevelFactor * taperFactor;
            let ly = (p.y - center.y) * scaleY * bevelFactor * taperFactor;
            let lz = z * scaleZ;

            // 2. Helical Twist Z
            if (twistZVal !== 0) {
                const twistRad = ((depthProgress - 0.5) * twistZVal * Math.PI) / 180;
                const cosTwist = Math.cos(twistRad);
                const sinTwist = Math.sin(twistRad);
                const tx = lx * cosTwist - ly * sinTwist;
                const ty = lx * sinTwist + ly * cosTwist;
                lx = tx;
                ly = ty;
            }

            // 3. Diagonal Shear Z Offset
            if (shearZVal !== 0) {
                const progressOffset = (depthProgress - 0.5);
                lx += progressOffset * shearZVal;
                ly += progressOffset * (shearZVal * 0.5);
            }

            // 4. Z-Arc Depth Curvature Bend
            const distFromCenter = Math.hypot(p.x - center.x, p.y - center.y);
            if (depthCurvatureVal !== 0) {
                const normDist = Math.min(1.5, distFromCenter / 120);
                lz += Math.cos(normDist * (Math.PI / 2)) * (depthCurvatureVal * 0.75);
            }

            // 5. Inflate Bulge Puff Depth
            if (inflateDepthVal > 0) {
                const bulgeProfile = Math.max(0, 1 - (distFromCenter / 160));
                const depthFaceFactor = 1.0 - Math.abs(depthProgress - 0.5) * 1.5;
                lz += bulgeProfile * inflateDepthVal * Math.max(0, depthFaceFactor);
            }

            const rx = lx * rotMatrix.m00 + ly * rotMatrix.m01 + lz * rotMatrix.m02;
            const ry = lx * rotMatrix.m10 + ly * rotMatrix.m11 + lz * rotMatrix.m12;
            const rz = lx * rotMatrix.m20 + ly * rotMatrix.m21 + lz * rotMatrix.m22 + translateZ;
            
            const scale = perspective / Math.max(1, perspective + rz);
            const projX = center.x + rx * scale;
            const projY = center.y + ry * scale;
            
            // Transform to world coordinates using drawing's main transform
            const worldP = localToWorld({ x: projX, y: projY }, drawing.transform, pivot);
            return {
                x: worldP.x,
                y: worldP.y,
                scale: scale,
                z: rz
            };
        };
        
        // Determine draw direction:
        // Project center at back (z = depth/2) and front (z = -depth/2)
        const testFrontZ = projectPointAtZ(center, -totalDepth / 2, 1).z;
        const testBackZ = projectPointAtZ(center, totalDepth / 2, 0).z;
        
        // Lower Z is closer (larger perspective scale). So we start rendering from the back (farthest) to the front (closest).
        const isFrontInFront = testFrontZ < testBackZ;
        let startZ = isFrontInFront ? totalDepth / 2 : -totalDepth / 2;
        let endZ = isFrontInFront ? -totalDepth / 2 : totalDepth / 2;

        // Strictly guarantee for PNG / image objects that 3D depth is added behind the PNG face
        if (drawing.imageUrl || drawing.type === 'image') {
            startZ = totalDepth;
            endZ = 0;
        }
        
        // Colors from workbench - smart auto-derivation if not explicitly set
        const hasFill = (drawing.fillColor && drawing.fillColor !== 'transparent') || (drawing.subPathFills && Object.keys(drawing.subPathFills).length > 0);
        const baseColor = drawing.fillColor && drawing.fillColor !== 'transparent'
            ? drawing.fillColor
            : (drawing.strokeColor && drawing.strokeColor !== 'transparent' ? drawing.strokeColor : '#6366F1');

        const defaultFrontColor = baseColor;
        const defaultSidesColor = hasFill ? this.applyLighting(baseColor, 0.75) : (drawing.strokeColor || '#4338CA');
        const defaultBackColor = hasFill ? this.applyLighting(baseColor, 0.5) : this.applyLighting(defaultSidesColor, 0.65);
        
        const frontColorObj = t3d.faces?.front ?? { color: defaultFrontColor, opacity: 1.0, visible: true };
        const sidesColorObj = t3d.faces?.sides ?? { color: defaultSidesColor, opacity: 1.0, visible: true };
        const backColorObj = t3d.faces?.back ?? { color: defaultBackColor, opacity: 1.0, visible: true };
        
        ctx.save();
        ctx.lineCap = drawing.strokeWidth > 3 ? 'round' : 'butt';
        ctx.lineJoin = 'round';

        // Extract disjoint segments and subPaths
        const segments: Point[][] = [];
        if (!drawing.fillGaps3D && drawing.points.some(p => p.gap)) {
            let currentSegment: Point[] = [];
            for (let i = 0; i < drawing.points.length; i++) {
                const pt = drawing.points[i];
                if (pt.gap && currentSegment.length > 0) {
                    segments.push(currentSegment);
                    currentSegment = [];
                }
                currentSegment.push(pt);
            }
            if (currentSegment.length > 0) {
                segments.push(currentSegment);
            }
        } else if (drawing.points.length > 0) {
            segments.push(drawing.points);
        }

        if (drawing.subPaths && drawing.subPaths.length > 0) {
            drawing.subPaths.forEach(sub => {
                if (sub.length > 0) {
                    segments.push(sub);
                }
            });
        }

        // Closed path check & auto-fill inner region determination
        const isClosedSeg = (pts: Point[]) => {
            if (pts.length < 3) return false;
            const f = pts[0];
            const l = pts[pts.length - 1];
            return Math.hypot(l.x - f.x, l.y - f.y) < 15;
        };

        const shouldFillInterior = 
            (drawing as any).autoFillInnerRegion ||
            drawing.autoFillGaps ||
            drawing.fillGaps ||
            drawing.fillGaps3D ||
            drawing.type === 'shape' ||
            (drawing.fillColor && drawing.fillColor !== 'transparent') ||
            segments.some(isClosedSeg);

        // Draw back face
        if (backColorObj.visible && totalDepth > 2) {
            ctx.beginPath();
            segments.forEach(seg => {
                const backPoints = seg.map(p => projectPointAtZ(p, startZ, 0));
                backPoints.forEach((pt, idx) => {
                    if (idx === 0) ctx.moveTo(pt.x, pt.y);
                    else ctx.lineTo(pt.x, pt.y);
                });
                if (shouldFillInterior) {
                    ctx.closePath();
                }
            });
            
            if (shouldFillInterior) {
                ctx.fillStyle = backColorObj.color;
                ctx.globalAlpha = backColorObj.opacity * (drawing.opacity ?? 1.0);
                ctx.fill('evenodd');
            }
            
            const allBackPoints = drawing.points.map(p => projectPointAtZ(p, startZ, 0));
            const avgScale = allBackPoints.reduce((sum, pt) => sum + pt.scale, 0) / (allBackPoints.length || 1);
            ctx.strokeStyle = backColorObj.color;
            ctx.lineWidth = (drawing.strokeWidth ?? 2) * avgScale;
            ctx.globalAlpha = backColorObj.opacity * (drawing.opacity ?? 1.0);
            ctx.stroke();
        }
        
        // Draw extrusion side layers using seamless quad surfaces (NO repeating wireframe ring strokes)
        if (sidesColorObj.visible && totalDepth > 1) {
            const steps = Math.min(10, Math.max(1, Math.ceil(totalDepth / 8)));
            const stepDelta = (endZ - startZ) / steps;

            const ringSteps: { x: number; y: number; scale: number; z: number }[][][] = [];
            for (let i = 0; i <= steps; i++) {
                const depthPct = i / steps;
                const currentZ = startZ + i * stepDelta;
                const stepRings: { x: number; y: number; scale: number; z: number }[][] = [];
                segments.forEach(seg => {
                    stepRings.push(seg.map(p => projectPointAtZ(p, currentZ, depthPct)));
                });
                ringSteps.push(stepRings);
            }

            ctx.save();
            ctx.globalAlpha = sidesColorObj.opacity * (drawing.opacity ?? 1.0);

            for (let i = 0; i < steps; i++) {
                const depthPct = (i + 0.5) / steps;
                const brightness = 0.45 + 0.55 * depthPct;
                const litColor = this.applyLighting(sidesColorObj.color, brightness);

                segments.forEach((seg, segIdx) => {
                    const ringA = ringSteps[i][segIdx];
                    const ringB = ringSteps[i + 1][segIdx];
                    if (!ringA || !ringB || ringA.length < 2) return;

                    const isClosed = isClosedSeg(seg);
                    const quadCount = isClosed ? ringA.length : ringA.length - 1;

                    for (let j = 0; j < quadCount; j++) {
                        const nextJ = (j + 1) % ringA.length;
                        const p0 = ringA[j];
                        const p1 = ringA[nextJ];
                        const p2 = ringB[nextJ];
                        const p3 = ringB[j];

                        ctx.beginPath();
                        ctx.moveTo(p0.x, p0.y);
                        ctx.lineTo(p1.x, p1.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.lineTo(p3.x, p3.y);
                        ctx.closePath();

                        ctx.fillStyle = litColor;
                        ctx.fill();

                        if (t3d.wireframe) {
                            ctx.strokeStyle = (drawing.strokeColor && drawing.strokeColor !== 'transparent') ? drawing.strokeColor : '#000000';
                            ctx.lineWidth = 1;
                            ctx.stroke();
                        } else {
                            // Subtle anti-aliasing fill line between quads (prevents transparent seam artifacts)
                            ctx.strokeStyle = litColor;
                            ctx.lineWidth = 0.5;
                            ctx.stroke();
                        }
                    }
                });
            }
            ctx.restore();

            // Draw clean longitudinal outline edge connectors (connecting Back to Front)
            if (!t3d.wireframe && drawing.strokeColor && drawing.strokeColor !== 'transparent') {
                ctx.save();
                const allFrontPoints = drawing.points.map(p => projectPointAtZ(p, endZ, 1));
                const avgScale = allFrontPoints.reduce((sum, pt) => sum + pt.scale, 0) / (allFrontPoints.length || 1);
                ctx.strokeStyle = drawing.strokeColor;
                ctx.lineWidth = (drawing.strokeWidth ?? 2) * avgScale;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.globalAlpha = (drawing.opacity ?? 1.0);

                segments.forEach((seg, segIdx) => {
                    const backRing = ringSteps[0][segIdx];
                    const frontRing = ringSteps[steps][segIdx];
                    if (!backRing || !frontRing) return;

                    const isClosed = isClosedSeg(seg);
                    const stepJump = Math.max(1, Math.floor(seg.length / 10));

                    for (let j = 0; j < seg.length; j++) {
                        const isEndpoint = !isClosed && (j === 0 || j === seg.length - 1);
                        let isCorner = false;
                        if (j > 0 && j < seg.length - 1) {
                            const prev = seg[j - 1];
                            const curr = seg[j];
                            const next = seg[j + 1];
                            const v1 = { x: curr.x - prev.x, y: curr.y - prev.y };
                            const v2 = { x: next.x - curr.x, y: next.y - curr.y };
                            const dot = v1.x * v2.x + v1.y * v2.y;
                            const len1 = Math.hypot(v1.x, v1.y);
                            const len2 = Math.hypot(v2.x, v2.y);
                            if (len1 > 0.1 && len2 > 0.1 && (dot / (len1 * len2)) < 0.85) {
                                isCorner = true;
                            }
                        }

                        if (isEndpoint || isCorner || (j % stepJump === 0 && seg.length <= 16)) {
                            const pBack = backRing[j];
                            const pFront = frontRing[j];
                            if (pBack && pFront) {
                                ctx.beginPath();
                                ctx.moveTo(pBack.x, pBack.y);
                                ctx.lineTo(pFront.x, pFront.y);
                                ctx.stroke();
                            }
                        }
                    }
                });
                ctx.restore();
            }
        }
        
        // Draw front face
        if (frontColorObj.visible) {
            const isImageObj = !!(drawing.imageUrl || drawing.type === 'image');
            const subPathsToRender = (drawing.subPaths && drawing.subPaths.length > 0) ? drawing.subPaths : extractAllSubPaths(drawing);
            const frontFillsToRender = subPathsToRender.length > 0 ? subPathsToRender : segments;

            // Draw 3D Front Face Image Texture (e.g. uploaded PNG / background removed PNG)
            if (isImageObj) {
                let img = (drawing as any)._cachedImg;
                if (!img && drawing.imageUrl) {
                    img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.src = drawing.imageUrl;
                    (drawing as any)._cachedImg = img;
                }

                if (img && img.complete && img.naturalWidth > 0) {
                    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                    renderingPoints.forEach(p => {
                        if (p.x < minX) minX = p.x;
                        if (p.x > maxX) maxX = p.x;
                        if (p.y < minY) minY = p.y;
                        if (p.y > maxY) maxY = p.y;
                    });
                    if (!isFinite(minX)) {
                        const w = drawing.transform?.width || 200;
                        const h = drawing.transform?.height || 200;
                        minX = -w / 2; maxX = w / 2; minY = -h / 2; maxY = h / 2;
                    }

                    ctx.save();
                    ctx.globalAlpha = (drawing.opacity ?? 1.0);

                    // Clip to front face silhouette polygon
                    ctx.beginPath();
                    frontFillsToRender.forEach((sub) => {
                        const frontPoints = sub.map(p => projectPointAtZ(p, endZ, 1));
                        frontPoints.forEach((pt, idx) => {
                            if (idx === 0) ctx.moveTo(pt.x, pt.y);
                            else ctx.lineTo(pt.x, pt.y);
                        });
                        ctx.closePath();
                    });
                    ctx.clip();

                    const fpTL = projectPointAtZ({ x: minX, y: minY }, endZ, 1);
                    const fpTR = projectPointAtZ({ x: maxX, y: minY }, endZ, 1);
                    const fpBR = projectPointAtZ({ x: maxX, y: maxY }, endZ, 1);
                    const fpBL = projectPointAtZ({ x: minX, y: maxY }, endZ, 1);

                    drawTexturedTriangle(
                        ctx, img,
                        0, 0,
                        img.naturalWidth, 0,
                        0, img.naturalHeight,
                        fpTL.x, fpTL.y,
                        fpTR.x, fpTR.y,
                        fpBL.x, fpBL.y
                    );

                    drawTexturedTriangle(
                        ctx, img,
                        img.naturalWidth, 0,
                        img.naturalWidth, img.naturalHeight,
                        0, img.naturalHeight,
                        fpTR.x, fpTR.y,
                        fpBR.x, fpBR.y,
                        fpBL.x, fpBL.y
                    );

                    ctx.restore();
                }
            }

            if (shouldFillInterior && !isImageObj) {
                frontFillsToRender.forEach((sub, subIdx) => {
                    const frontPoints = sub.map(p => projectPointAtZ(p, endZ, 1));
                    if (frontPoints.length >= 3) {
                        ctx.save();
                        ctx.beginPath();
                        frontPoints.forEach((pt, idx) => {
                            if (idx === 0) ctx.moveTo(pt.x, pt.y);
                            else ctx.lineTo(pt.x, pt.y);
                        });
                        ctx.closePath();
                        const subColor = drawing.subPathFills?.[subIdx] || frontColorObj.color;
                        ctx.fillStyle = subColor;
                        ctx.globalAlpha = frontColorObj.opacity * (drawing.opacity ?? 1.0);
                        ctx.fill('evenodd');
                        ctx.restore();
                    }
                });
            }

            // Render subPathFills on 3D front face (if not already handled)
            if (drawing.subPathFills && Object.keys(drawing.subPathFills).length > 0 && !shouldFillInterior) {
                Object.entries(drawing.subPathFills).forEach(([subIdxStr, subColor]) => {
                    const subIdx = parseInt(subIdxStr, 10);
                    const sub = subPathsToRender[subIdx];
                    if (sub && sub.length >= 3 && subColor && subColor !== 'transparent') {
                        const frontSubPoints = sub.map(p => projectPointAtZ(p, endZ, 1));
                        ctx.save();
                        ctx.beginPath();
                        frontSubPoints.forEach((pt, idx) => {
                            if (idx === 0) ctx.moveTo(pt.x, pt.y);
                            else ctx.lineTo(pt.x, pt.y);
                        });
                        ctx.closePath();
                        ctx.fillStyle = subColor;
                        ctx.globalAlpha = (drawing.opacity ?? 1.0);
                        ctx.fill('evenodd');
                        ctx.restore();
                    }
                });
            }

            // Render lassoFills on 3D front face
            if (drawing.lassoFills && drawing.lassoFills.length > 0) {
                drawing.lassoFills.forEach(fill => {
                    if (fill.localLassoPoints && fill.localLassoPoints.length >= 3) {
                        const frontLassoPts = fill.localLassoPoints.map(p => projectPointAtZ(p, endZ, 1));
                        ctx.save();
                        ctx.beginPath();
                        frontLassoPts.forEach((pt, idx) => {
                            if (idx === 0) ctx.moveTo(pt.x, pt.y);
                            else ctx.lineTo(pt.x, pt.y);
                        });
                        ctx.closePath();
                        ctx.fillStyle = fill.color;
                        ctx.globalAlpha = (drawing.opacity ?? 1.0);
                        ctx.fill('evenodd');
                        ctx.restore();
                    }
                });
            }
            
            // Re-stroke Front Face Outlines so black strokes are always sharp on top
            ctx.save();
            ctx.beginPath();
            const frontStrokesToDraw = subPathsToRender.length > 0 ? subPathsToRender : segments;
            frontStrokesToDraw.forEach(seg => {
                const frontPoints = seg.map(p => projectPointAtZ(p, endZ, 1));
                frontPoints.forEach((pt, idx) => {
                    if (idx === 0) ctx.moveTo(pt.x, pt.y);
                    else ctx.lineTo(pt.x, pt.y);
                });
            });
            const allFrontPoints = drawing.points.map(p => projectPointAtZ(p, endZ, 1));
            const avgScale = allFrontPoints.reduce((sum, pt) => sum + pt.scale, 0) / (allFrontPoints.length || 1);
            ctx.strokeStyle = (drawing.strokeColor && drawing.strokeColor !== 'transparent') ? drawing.strokeColor : '#000000';
            ctx.lineWidth = (drawing.strokeWidth ?? 2) * avgScale;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.globalAlpha = (drawing.opacity ?? 1.0);
            ctx.stroke();
            ctx.restore();
        }

        // Render sub-extrusions (face / sub-mesh extrusions)
        if (drawing.subExtrusions && drawing.subExtrusions.length > 0) {
            drawing.subExtrusions.forEach(sub => {
                this.renderSubExtrusion(ctx, drawing, sub, endZ, center, t3d);
            });
        }
        
        ctx.restore();
    }

    // Helper to render sub-extrusions (face & vertex group 3D extrusions)
    static renderSubExtrusion(
        ctx: CanvasRenderingContext2D,
        drawing: VectorObject,
        sub: any,
        parentBaseZ: number,
        parentCenter: { x: number; y: number },
        parentTransform3D: any
    ) {
        if (!sub.pointIndices || sub.pointIndices.length < 2) return;
        const subPts = sub.pointIndices.map((idx: number) => drawing.points[idx]).filter(Boolean);
        if (subPts.length < 2) return;

        const color = sub.color || drawing.fillColor || drawing.strokeColor || '#F59E0B';
        const subDepth = Math.max(1, Math.abs(sub.extrudeZ || 20) * (sub.scaleZ ?? 1));
        const subSteps = Math.min(20, Math.max(1, Math.ceil(subDepth / 3)));

        const projectSubPt = (p: Point, depthPct: number) => {
            const local = {
                x: (p.x - parentCenter.x) + (sub.extrudeX || 0),
                y: (p.y - parentCenter.y) + (sub.extrudeY || 0),
                z: parentBaseZ + (depthPct * (sub.extrudeZ || 20))
            };
            let scaled = Math3D.applyScale(local, (parentTransform3D.scaleX ?? 1) * (sub.scaleX ?? 1), (parentTransform3D.scaleY ?? 1) * (sub.scaleY ?? 1), 1);
            let rotated = Math3D.applyRotation(scaled, (parentTransform3D.rotateX ?? 0) + (sub.rotateX ?? 0), (parentTransform3D.rotateY ?? 0) + (sub.rotateY ?? 0), (parentTransform3D.rotateZ ?? 0) + (sub.rotateZ ?? 0));
            rotated.z += (parentTransform3D.translateZ ?? 0);
            
            const proj = Math3D.project(rotated, parentTransform3D.perspective ?? 800, parentCenter.x, parentCenter.y);
            const pivot = drawing.pivots[0] || { localX: 0, localY: 0 };
            const worldP = localToWorld(proj, drawing.transform, pivot);
            return { x: worldP.x, y: worldP.y, scale: proj.scale };
        };

        // Draw side walls using connected quad quads
        for (let i = 0; i < subSteps; i++) {
            const depthPctA = i / subSteps;
            const depthPctB = (i + 1) / subSteps;
            const ringA = subPts.map(p => projectSubPt(p, depthPctA));
            const ringB = subPts.map(p => projectSubPt(p, depthPctB));
            
            const litColor = this.applyLighting(color, 0.5 + 0.5 * ((i + 0.5) / subSteps));
            ctx.save();
            ctx.fillStyle = litColor;
            ctx.strokeStyle = litColor;
            ctx.lineWidth = 0.5;
            ctx.globalAlpha = (drawing.opacity ?? 1.0);

            for (let j = 0; j < ringA.length - 1; j++) {
                const p0 = ringA[j];
                const p1 = ringA[j + 1];
                const p2 = ringB[j + 1];
                const p3 = ringB[j];

                ctx.beginPath();
                ctx.moveTo(p0.x, p0.y);
                ctx.lineTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.lineTo(p3.x, p3.y);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
            ctx.restore();
        }

        // Draw cap
        ctx.beginPath();
        subPts.forEach((p, idx) => {
            const pt = projectSubPt(p, 1);
            if (idx === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
        });
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.globalAlpha = (drawing.opacity ?? 1.0);
        ctx.fill('evenodd');
        ctx.strokeStyle = drawing.strokeColor || '#ffffff';
        ctx.lineWidth = Math.max(1, (drawing.strokeWidth ?? 2) * 0.8);
        ctx.stroke();

        // Recursively render child sub-extrusions
        if (sub.subExtrusions && sub.subExtrusions.length > 0) {
            const subCenter = subPts.length > 0 
                ? subPts.reduce((acc, pt) => ({ x: acc.x + pt.x / subPts.length, y: acc.y + pt.y / subPts.length }), { x: 0, y: 0 })
                : { x: 0, y: 0 };
            sub.subExtrusions.forEach((childSub: any) => {
                this.renderSubExtrusion(ctx, drawing, childSub, parentBaseZ + (sub.extrudeZ || 20), subCenter, parentTransform3D);
            });
        }
    }
    
    // Apply lighting to color
    static applyLighting(hexColor: string, brightness: number): string {
        const hex = hexColor.replace('#', '');
        let r = 255, g = 255, b = 255;
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length === 6) {
            r = parseInt(hex.slice(0, 2), 16);
            g = parseInt(hex.slice(2, 4), 16);
            b = parseInt(hex.slice(4, 6), 16);
        }
        
        const newR = Math.min(255, Math.floor(r * brightness));
        const newG = Math.min(255, Math.floor(g * brightness));
        const newB = Math.min(255, Math.floor(b * brightness));
        
        return `rgb(${newR}, ${newG}, ${newB})`;
    }
    
    // Fallback: Normal 2D render
    static render2D(drawing: VectorObject, ctx: CanvasRenderingContext2D) {
        if (drawing.points.length < 2) return;
        
        ctx.save();
        ctx.beginPath();
        drawing.points.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        
        ctx.fillStyle = drawing.fillColor;
        ctx.strokeStyle = drawing.strokeColor;
        ctx.lineWidth = drawing.strokeWidth;
        ctx.globalAlpha = drawing.opacity ?? 1.0;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
}
