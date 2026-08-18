/* TypeScript types matching backend Pydantic schemas */

export type Point = [number, number];

export type ShapeKind = 'rectangle' | 'circle' | 'polygon' | 'free';

export type IntegrationMode = 'euler' | 'verlet';

/* ── Shapes on the canvas (frontend state) ── */

export interface CanvasShape {
  id: string;
  kind: ShapeKind;
  color: string;
  points: Point[];      // rectangle: 2 corners, circle: 1 center, polygon: N vertices
  radius?: number;      // circle only
}

/* ── API request payloads ── */

export interface RectangleIn {
  id: string;
  kind: 'rectangle';
  first_corner: Point;
  opposite_corner: Point;
}

export interface CircleIn {
  id: string;
  kind: 'circle';
  center: Point;
  radius: number;
}

export interface PolygonIn {
  id: string;
  kind: 'polygon';
  points: Point[];
}

export type ShapeIn = RectangleIn | CircleIn | PolygonIn;

export interface ComRequest {
  width: number;
  height: number;
  shapes: ShapeIn[];
  rho: number;
  overlap_threshold: number;
}

export interface SimulateRequest {
  width: number;
  height: number;
  shapes: ShapeIn[];
  rho: number;
  overlap_threshold: number;
  gravity: number;
  dt: number;
  restitution: number;
  air_resistance: number;
  ground_friction: number;
  angular_damping: number;
  ground_offset: number;
  integration: IntegrationMode;
  max_frames: number;
}

/* ── API response payloads ── */

export interface OverlapOut {
  first_id: string;
  second_id: string;
  ratio: number;
  joined: boolean;
}

export interface GroupOut {
  id: number;
  shape_ids: string[];
  joined: boolean;
  center: Point;
}

export interface ComResponse {
  groups: GroupOut[];
  overlaps: OverlapOut[];
}

export interface BodyState {
  name: string;
  x: number;
  y: number;
  angle: number;
  resting: boolean;
}

export interface FrameOut {
  tick: number;
  bodies: BodyState[];
}

export interface SimulateResponse {
  frames: FrameOut[];
}

/* ── UI config state ── */

export interface SimSettings {
  gravity: number;
  dt: number;
  restitution: number;
  airResistance: number;
  groundFriction: number;
  angularDamping: number;
  groundOffset: number;
  overlapThreshold: number;
  rho: number;
  integration: IntegrationMode;
  maxFrames: number;
}

export const DEFAULT_SETTINGS: SimSettings = {
  gravity: 9.8,
  dt: 0.01667,
  restitution: 0.4,
  airResistance: 0.999,
  groundFriction: 0.3,
  angularDamping: 0.98,
  groundOffset: 50,
  overlapThreshold: 0.3,
  rho: 1.0,
  integration: 'verlet',
  maxFrames: 600,
};
