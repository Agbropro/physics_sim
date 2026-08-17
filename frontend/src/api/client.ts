/* API client — fetch wrappers for backend endpoints */

import type {
  CanvasShape,
  ComRequest,
  ComResponse,
  SimSettings,
  SimulateRequest,
  SimulateResponse,
  ShapeIn,
} from '../types/shapes';

function shapeToApi(s: CanvasShape): ShapeIn {
  switch (s.kind) {
    case 'rectangle':
      return {
        id: s.id,
        kind: 'rectangle',
        first_corner: s.points[0],
        opposite_corner: s.points[1],
      };
    case 'circle':
      return {
        id: s.id,
        kind: 'circle',
        center: s.points[0],
        radius: s.radius!,
      };
    case 'polygon':
      return {
        id: s.id,
        kind: 'polygon',
        points: s.points,
      };
  }
}

const API_BASE = import.meta.env.VITE_API_URL || '';

export async function fetchCom(
  shapes: CanvasShape[],
  width: number,
  height: number,
  settings: SimSettings,
): Promise<ComResponse> {
  const body: ComRequest = {
    width,
    height,
    shapes: shapes.map(shapeToApi),
    rho: settings.rho,
    overlap_threshold: settings.overlapThreshold,
  };

  const res = await fetch(`${API_BASE}/api/com`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`COM request failed: ${res.status}`);
  return res.json();
}

export async function fetchSimulate(
  shapes: CanvasShape[],
  width: number,
  height: number,
  settings: SimSettings,
): Promise<SimulateResponse> {
  const body: SimulateRequest = {
    width,
    height,
    shapes: shapes.map(shapeToApi),
    rho: settings.rho,
    overlap_threshold: settings.overlapThreshold,
    gravity: settings.gravity,
    dt: settings.dt,
    restitution: settings.restitution,
    air_resistance: settings.airResistance,
    ground_friction: settings.groundFriction,
    angular_damping: settings.angularDamping,
    ground_offset: settings.groundOffset,
    integration: settings.integration,
    max_frames: settings.maxFrames,
  };

  const res = await fetch(`${API_BASE}/api/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Simulate request failed: ${res.status}`);
  return res.json();
}
