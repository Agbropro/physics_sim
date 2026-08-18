/* Drawing canvas — black board for shapes, COM markers, gravity playback */

import { useRef, useEffect, useCallback, useState } from 'react';
import type { CanvasShape, Point, ShapeKind, ComResponse, FrameOut } from '../types/shapes';

interface Props {
  width: number;
  height: number;
  shapes: CanvasShape[];
  onShapesChange: (shapes: CanvasShape[]) => void;
  activeTool: ShapeKind | 'edit';
  groundOffset: number;
  comResult: ComResponse | null;
  simFrame: FrameOut | null;
  initialFrame: FrameOut | null;
}

let shapeCounter = 0;

const SHAPE_COLOR = import.meta.env.VITE_SHAPE_COLOR || '#ffffff';
const SHAPE_FILL_OPACITY = import.meta.env.VITE_SHAPE_FILL_OPACITY !== undefined 
  ? Number(import.meta.env.VITE_SHAPE_FILL_OPACITY) 
  : 0.15;

const JOINED_COLOR = import.meta.env.VITE_JOINED_COLOR || '#ff4081';
const COM_COLOR = import.meta.env.VITE_COM_COLOR || '#ffea00';
const GROUND_COLOR = import.meta.env.VITE_GROUND_COLOR || '#4caf50';
const POLY_PREVIEW_COLOR = import.meta.env.VITE_POLY_PREVIEW_COLOR || SHAPE_COLOR;

export default function DrawingCanvas({
  width,
  height,
  shapes,
  onShapesChange,
  activeTool,
  groundOffset,
  comResult,
  simFrame,
  initialFrame,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [startPt, setStartPt] = useState<Point | null>(null);
  const [currentPt, setCurrentPt] = useState<Point | null>(null);
  const [polyPoints, setPolyPoints] = useState<Point[]>([]);

  const [draggingShapeId, setDraggingShapeId] = useState<string | null>(null);
  const [draggingPointIndex, setDraggingPointIndex] = useState<number | null>(null);
  const [lastMousePt, setLastMousePt] = useState<Point | null>(null);

  const groundY = height - groundOffset;

  /* ── Coordinate helper ── */
  const canvasCoord = useCallback((e: React.MouseEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const rawY = (e.clientY - rect.top) * scaleY;
    return [
      (e.clientX - rect.left) * scaleX,
      Math.min(rawY, groundY),
    ];
  }, [width, height, groundY]);

  /* ── Mouse handlers ── */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (simFrame) return; // disable drawing during playback
    if (e.button !== 0) return;

    const pt = canvasCoord(e);

    if (activeTool === 'edit') {
      // 1. Check for point hits (grab handles)
      for (let i = shapes.length - 1; i >= 0; i--) {
        const s = shapes[i];
        if (s.kind === 'circle') {
          const cx = s.points[0][0];
          const cy = s.points[0][1];
          const r = s.radius!;
          if (Math.hypot(pt[0] - (cx + r), pt[1] - cy) <= 8) {
            setDraggingShapeId(s.id);
            setDraggingPointIndex(-1); // special case for circle radius
            setLastMousePt(pt);
            return;
          }
        }
        for (let j = 0; j < s.points.length; j++) {
          const p = s.points[j];
          if (Math.hypot(pt[0] - p[0], pt[1] - p[1]) <= 8) {
            setDraggingShapeId(s.id);
            setDraggingPointIndex(j);
            setLastMousePt(pt);
            return;
          }
        }
      }

      // 2. Check for shape hits (translate whole shape)
      for (let i = shapes.length - 1; i >= 0; i--) {
        const s = shapes[i];
        let hit = false;
        if (s.kind === 'rectangle') {
          const [p1, p2] = s.points;
          const minX = Math.min(p1[0], p2[0]), maxX = Math.max(p1[0], p2[0]);
          const minY = Math.min(p1[1], p2[1]), maxY = Math.max(p1[1], p2[1]);
          if (pt[0] >= minX && pt[0] <= maxX && pt[1] >= minY && pt[1] <= maxY) hit = true;
        } else if (s.kind === 'circle') {
          const dx = pt[0] - s.points[0][0];
          const dy = pt[1] - s.points[0][1];
          if (dx * dx + dy * dy <= s.radius! * s.radius!) hit = true;
        } else if (s.kind === 'polygon') {
          const minX = Math.min(...s.points.map(p => p[0]));
          const maxX = Math.max(...s.points.map(p => p[0]));
          const minY = Math.min(...s.points.map(p => p[1]));
          const maxY = Math.max(...s.points.map(p => p[1]));
          if (pt[0] >= minX && pt[0] <= maxX && pt[1] >= minY && pt[1] <= maxY) hit = true;
        }
        
        if (hit) {
          setDraggingShapeId(s.id);
          setDraggingPointIndex(null);
          setLastMousePt(pt);
          return;
        }
      }
      return;
    }

    if (activeTool === 'polygon') {
      setPolyPoints((prev) => [...prev, pt]);
      return;
    }

    if (activeTool === 'free') {
      setDrawing(true);
      setPolyPoints([pt]);
      return;
    }

    setDrawing(true);
    setStartPt(pt);
    setCurrentPt(pt);
  }, [activeTool, shapes, canvasCoord, simFrame]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (activeTool === 'edit' && draggingShapeId && lastMousePt) {
      const pt = canvasCoord(e);
      const dx = pt[0] - lastMousePt[0];
      const dy = pt[1] - lastMousePt[1];
      
      onShapesChange(shapes.map(s => {
        if (s.id !== draggingShapeId) return s;
        if (draggingPointIndex === null) {
          return { ...s, points: s.points.map(p => [p[0] + dx, p[1] + dy] as Point) };
        } else if (draggingPointIndex === -1 && s.kind === 'circle') {
          const cx = s.points[0][0];
          const cy = s.points[0][1];
          const newR = Math.max(2, Math.hypot(pt[0] - cx, pt[1] - cy));
          return { ...s, radius: newR };
        } else {
          return {
             ...s,
             points: s.points.map((p, i) => i === draggingPointIndex ? [p[0] + dx, p[1] + dy] as Point : p)
          };
        }
      }));
      setLastMousePt(pt);
      return;
    }

    if (!drawing) return;
    const pt = canvasCoord(e);
    setCurrentPt(pt);
    
    if (activeTool === 'free') {
      setPolyPoints((prev) => {
        if (prev.length === 0) return [pt];
        const last = prev[prev.length - 1];
        // Only add point if mouse moved more than 3 pixels (simplification)
        if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) > 3) {
          return [...prev, pt];
        }
        return prev;
      });
    }
  }, [drawing, canvasCoord, activeTool, draggingShapeId, lastMousePt, shapes, onShapesChange]);

  const handleMouseUp = useCallback(() => {
    if (activeTool === 'edit') {
      setDraggingShapeId(null);
      setDraggingPointIndex(null);
      setLastMousePt(null);
      return;
    }

    if (activeTool === 'free') {
      setDrawing(false);
      if (polyPoints.length > 2) {
        const id = `s${++shapeCounter}`;
        onShapesChange([
          ...shapes,
          { id, kind: 'polygon', color: SHAPE_COLOR, points: [...polyPoints] },
        ]);
      }
      setPolyPoints([]);
      return;
    }

    if (!drawing || !startPt || !currentPt) return;
    setDrawing(false);

    const id = `s${++shapeCounter}`;

    if (activeTool === 'rectangle') {
      onShapesChange([
        ...shapes,
        { id, kind: 'rectangle', color: SHAPE_COLOR, points: [startPt, currentPt] },
      ]);
    } else if (activeTool === 'circle') {
      const dx = currentPt[0] - startPt[0];
      const dy = currentPt[1] - startPt[1];
      const radius = Math.sqrt(dx * dx + dy * dy);
      if (radius > 2) {
        onShapesChange([
          ...shapes,
          { id, kind: 'circle', color: SHAPE_COLOR, points: [startPt], radius },
        ]);
      }
    }

    setStartPt(null);
    setCurrentPt(null);
  }, [drawing, startPt, currentPt, activeTool, shapes, onShapesChange, polyPoints]);

  /* ── Finish polygon (right-click or Enter) ── */
  const finishPolygon = useCallback(() => {
    if (polyPoints.length < 3) return;
    const id = `s${++shapeCounter}`;
    onShapesChange([
      ...shapes,
      { id, kind: 'polygon', color: SHAPE_COLOR, points: [...polyPoints] },
    ]);
    setPolyPoints([]);
  }, [polyPoints, shapes, onShapesChange]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (activeTool === 'polygon') finishPolygon();
  }, [activeTool, finishPolygon]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && activeTool === 'polygon') finishPolygon();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTool, finishPolygon]);

  /* ── Build joined shape ID set ── */
  const joinedIds = new Set<string>();
  if (comResult) {
    for (const ov of comResult.overlaps) {
      if (ov.joined) {
        joinedIds.add(ov.first_id);
        joinedIds.add(ov.second_id);
      }
    }
  }

  /* ── Load Assets ── */
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [groundImage, setGroundImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const bgSrc = import.meta.env.VITE_BG_ASSET || '/bg.png';
    const groundSrc = import.meta.env.VITE_GROUND_ASSET || '/ground.png';

    const bg = new Image();
    bg.src = bgSrc;
    bg.onload = () => setBgImage(bg);

    const gr = new Image();
    gr.src = groundSrc;
    gr.onload = () => setGroundImage(gr);
  }, []);

  /* ── Render ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    // Background
    if (bgImage) {
      // Draw custom pixel art background
      ctx.drawImage(bgImage, 0, 0, width, height);
    } else {
      // Fallback Black background
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);
    }

    // Ground line / Asset
    if (groundImage) {
      // Tile the custom ground asset starting at groundY, only along the top edge
      const pattern = ctx.createPattern(groundImage, 'repeat-x');
      if (pattern) {
        ctx.save();
        ctx.translate(0, groundY);
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, width, groundImage.height);
        ctx.restore();
      }
    } else {
      // Fallback Ground line
      ctx.fillStyle = GROUND_COLOR;
      ctx.globalAlpha = 0.15;
      ctx.fillRect(0, groundY, width, height - groundY);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = GROUND_COLOR;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.lineTo(width, groundY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    /* ── Draw shapes ── */
    const drawShape = (s: CanvasShape, color: string, alpha = 1, fillOpacity = SHAPE_FILL_OPACITY) => {
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;

      if (s.kind === 'rectangle') {
        const [p1, p2] = s.points;
        const x = Math.min(p1[0], p2[0]);
        const y = Math.min(p1[1], p2[1]);
        const w = Math.abs(p2[0] - p1[0]);
        const h = Math.abs(p2[1] - p1[1]);
        
        ctx.globalAlpha = alpha * fillOpacity;
        ctx.fillRect(x, y, w, h);
        
        ctx.globalAlpha = alpha;
        ctx.strokeRect(x, y, w, h);
      } else if (s.kind === 'circle') {
        ctx.beginPath();
        ctx.arc(s.points[0][0], s.points[0][1], s.radius!, 0, Math.PI * 2);
        
        ctx.globalAlpha = alpha * fillOpacity;
        ctx.fill();
        
        ctx.globalAlpha = alpha;
        ctx.stroke();
      } else if (s.kind === 'polygon') {
        ctx.beginPath();
        s.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
        ctx.closePath();
        
        ctx.globalAlpha = alpha * fillOpacity;
        ctx.fill();
        
        ctx.globalAlpha = alpha;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    if (simFrame && initialFrame) {
      /* ── Gravity playback mode ── */
      for (const body of simFrame.bodies) {
        const initBody = initialFrame.bodies.find(b => b.name === body.name);
        if (!initBody) continue;

        // Find original shape(s) for this body
        const ids = body.name.split('+');
        for (const shape of shapes) {
          if (!ids.includes(shape.id)) continue;

          // For playback, translate and rotate shape around its CURRENT center of mass,
          // then shift it backwards by its INITIAL center of mass so its original
          // absolute coordinates become correctly offset from the origin!
          ctx.save();
          ctx.translate(body.x, body.y);
          ctx.rotate(body.angle);
          ctx.translate(-initBody.x, -initBody.y);

          const color = body.resting ? GROUND_COLOR : SHAPE_COLOR;
          const fillOpacity = body.resting ? 0.15 : SHAPE_FILL_OPACITY;

          drawShape(shape, color, 1, fillOpacity);

          // Draw a small dot for the local COM of this specific shape (optional)
          ctx.fillStyle = COM_COLOR;
          ctx.beginPath();
          ctx.arc(initBody.x, initBody.y, 3, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        }
      }
    } else {
      /* ── Normal drawing mode ── */
      for (const s of shapes) {
        const color = joinedIds.has(s.id) ? JOINED_COLOR : s.color;
        drawShape(s, color);
      }

      // Drawing preview
      if (drawing && startPt && currentPt) {
        if (activeTool === 'rectangle') {
          drawShape(
            { id: '_preview', kind: 'rectangle', color: SHAPE_COLOR, points: [startPt, currentPt] },
            SHAPE_COLOR,
            0.5,
          );
        } else if (activeTool === 'circle') {
          const dx = currentPt[0] - startPt[0];
          const dy = currentPt[1] - startPt[1];
          const r = Math.sqrt(dx * dx + dy * dy);
          drawShape(
            { id: '_preview', kind: 'circle', color: SHAPE_COLOR, points: [startPt], radius: r },
            SHAPE_COLOR,
            0.5,
          );
        }
      }

      // Polygon or Free Draw in-progress preview
      if (polyPoints.length > 0) {
        ctx.strokeStyle = POLY_PREVIEW_COLOR;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 2;
        if (activeTool !== 'free') ctx.setLineDash([4, 4]);
        ctx.beginPath();
        polyPoints.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
        ctx.stroke();
        ctx.setLineDash([]);

        // Vertex dots (only for polygon tool)
        if (activeTool !== 'free') {
          ctx.globalAlpha = 1;
          ctx.fillStyle = SHAPE_COLOR;
          for (const p of polyPoints) {
            ctx.beginPath();
            ctx.arc(p[0], p[1], 4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // COM markers
      if (comResult) {
        for (const group of comResult.groups) {
          const [cx, cy] = group.center;
          // Crosshair
          ctx.strokeStyle = COM_COLOR;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(cx - 10, cy);
          ctx.lineTo(cx + 10, cy);
          ctx.moveTo(cx, cy - 10);
          ctx.lineTo(cx, cy + 10);
          ctx.stroke();
          // Dot
          ctx.fillStyle = COM_COLOR;
          ctx.beginPath();
          ctx.arc(cx, cy, 5, 0, Math.PI * 2);
          ctx.fill();
          // Label
          ctx.fillStyle = COM_COLOR;
          ctx.font = '12px monospace';
          ctx.fillText(
            `COM (${cx.toFixed(0)}, ${cy.toFixed(0)})`,
            cx + 10,
            cy - 10,
          );
        }
      }

      // Edit grab handles
      if (activeTool === 'edit') {
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 1.5;
        for (const s of shapes) {
          if (s.kind === 'circle') {
            const cx = s.points[0][0];
            const cy = s.points[0][1];
            const r = s.radius!;
            ctx.fillRect(cx - 4, cy - 4, 8, 8);
            ctx.strokeRect(cx - 4, cy - 4, 8, 8);
            ctx.fillRect(cx + r - 4, cy - 4, 8, 8);
            ctx.strokeRect(cx + r - 4, cy - 4, 8, 8);
          } else {
            for (const p of s.points) {
              ctx.fillRect(p[0] - 4, p[1] - 4, 8, 8);
              ctx.strokeRect(p[0] - 4, p[1] - 4, 8, 8);
            }
          }
        }
      }
    }

    // Canvas border glow
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);
  }, [
    width, height, shapes, drawing, startPt, currentPt,
    activeTool, polyPoints, groundY, comResult, simFrame, initialFrame, joinedIds, bgImage, groundImage
  ]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="drawing-canvas"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={handleContextMenu}
    />
  );
}
