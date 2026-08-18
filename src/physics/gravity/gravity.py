"""2D rigid-body gravity with Euler and Verlet integration."""

import math
from pathlib import Path

import numpy as np
import yaml

from src.physics.com.com import apply_rho, map_com, shape_mask
from src.physics.entities import (
    IntegrationMode,
    Point,
    RigidBody,
    Shape,
    ShapeType,
    SimConfig,
)


# ═══════════════════════════════════════════════════════════
#  Configuration
# ═══════════════════════════════════════════════════════════

def load_config(path: str | Path = "config/config.yaml") -> SimConfig:
    """Load simulation parameters from a YAML file."""

    with open(path) as f:
        return SimConfig(**yaml.safe_load(f))


# ═══════════════════════════════════════════════════════════
#  Body creation
# ═══════════════════════════════════════════════════════════

def compute_inertia(mass_map: np.ndarray, com: tuple[float, float]) -> float:
    """Compute moment of inertia about the centre of mass.

    ┌─────────────────────────────────────────────────────┐
    │  I = Σ  m(x, y) × r²                               │
    │                                                     │
    │  where r² = (x - x_com)² + (y - y_com)²            │
    │                                                     │
    │  I is the resistance to angular acceleration.       │
    │  Larger I  →  harder to spin.                       │
    └─────────────────────────────────────────────────────┘
    """

    ys, xs = np.indices(mass_map.shape)
    dx = xs - com[0]
    dy = ys - com[1]
    r_squared = dx ** 2 + dy ** 2                       # distance² from COM
    return float((mass_map * r_squared).sum())


def _rect_vertices(coord: list[Point]) -> list[Point]:
    """Expand two opposite corners into four rectangle vertices."""

    (x1, y1), (x2, y2) = coord
    return [(x1, y1), (x2, y1), (x2, y2), (x1, y2)]


from src.physics.com.com import map_com, apply_rho, _draw_filled

def create_body(group: list[Shape], width: int, height: int, rho: float = 1.0) -> RigidBody:
    """Build a rigid body from a group of shapes — computes mass, COM, inertia, and unified local vertices."""

    # Rasterise all shapes in the group → mass map → COM
    mask = np.zeros((height, width), dtype=np.uint8)
    for shape in group:
        _draw_filled(shape, mask)
        
    mass_map = apply_rho(mask, rho).astype(np.float64)
    com_x, com_y = map_com(mass_map)

    mass = float(mass_map.sum())
    inertia = compute_inertia(mass_map, (com_x, com_y))

    # Aggregate all vertices from all shapes in the group
    world_verts = []
    for shape in group:
        if shape.kind is ShapeType.RECTANGLE:
            world_verts.extend(_rect_vertices(shape.coord))
        elif shape.kind is ShapeType.POLYGON:
            world_verts.extend(shape.coord)
        elif shape.kind is ShapeType.CIRCLE:
            # Discretize circle into 16 points for collision
            cx, cy = shape.coord[0]
            r = shape.radius or 0.0
            for i in range(16):
                theta = i * (2.0 * math.pi / 16)
                world_verts.append((cx + r * math.cos(theta), cy + r * math.sin(theta)))

    local_verts = [(x - com_x, y - com_y) for x, y in world_verts]

    return RigidBody(
        name="+".join(s.name for s in group),
        kind=group[0].kind,
        vertices=local_verts,
        radius=None,
        mass=mass,
        inertia=max(inertia, 1e-6),  # guard against zero
        x=com_x,
        y=com_y,
        prev_x=com_x,
        prev_y=com_y,
    )


# ═══════════════════════════════════════════════════════════
#  Coordinate transforms
# ═══════════════════════════════════════════════════════════

def rotate_point(px: float, py: float, angle: float) -> tuple[float, float]:
    """Rotate (px, py) around the origin by *angle* radians.

    ┌─────────────────────────────────────────────┐
    │  x' = x cos θ  −  y sin θ                  │
    │  y' = x sin θ  +  y cos θ                  │
    └─────────────────────────────────────────────┘
    """

    c, s = math.cos(angle), math.sin(angle)
    return px * c - py * s, px * s + py * c


def world_points(body: RigidBody) -> list[Point]:
    """Transform local vertices to world space (rotate + translate)."""

    return [
        (body.x + rx, body.y + ry)
        for rx, ry in (rotate_point(lx, ly, body.angle) for lx, ly in body.vertices)
    ]


# ═══════════════════════════════════════════════════════════
#  Ground collision
# ═══════════════════════════════════════════════════════════

def _lowest_contact(body: RigidBody, cfg: SimConfig) -> tuple[Point, float]:
    """Return the world-space point with the largest y (closest to ground)."""

    pts = world_points(body)
    if not pts:
        return (body.x, body.y), body.y

    max_y = max(p[1] for p in pts)
    
    # Collect all points resting on the ground (within contact_tolerance of lowest point)
    contact_pts = [p for p in pts if max_y - p[1] < cfg.physics.contact_tolerance]
    
    # Average them out to simulate a flat surface impact
    avg_x = sum(p[0] for p in contact_pts) / len(contact_pts)
    avg_y = sum(p[1] for p in contact_pts) / len(contact_pts)
    
    return (avg_x, avg_y), max_y


def _resolve_ground_euler(body: RigidBody, cfg: SimConfig) -> None:
    """Handle ground collision for Euler integration."""

    contact, contact_y = _lowest_contact(body, cfg)
    ground_y = cfg.ground_y

    if contact_y < ground_y:
        return  # still airborne

    # ──────────────────────────────────────────────────────
    # Position correction — push shape above the ground
    # ──────────────────────────────────────────────────────
    penetration = contact_y - ground_y
    body.y -= penetration

    # ──────────────────────────────────────────────────────
    # Bounce  (coefficient of restitution)
    #
    #   v_after = −e × v_before
    #
    #   e = 0  →  dead stop
    #   e = 1  →  perfect elastic bounce
    # ──────────────────────────────────────────────────────
    e = cfg.physics.restitution

    vy_impact = abs(body.vy)
    if body.vy > 0:                         # only bounce when falling
        body.vy = -e * body.vy

    # ──────────────────────────────────────────────────────
    # Ground friction slows horizontal slide on contact
    #
    #   vx_after = vx × (1 − μ_ground)
    #
    #   Only applies when touching the ground, unlike
    #   air resistance which acts every frame.
    # ──────────────────────────────────────────────────────
    mu = cfg.physics.ground_friction
    body.vx *= (1.0 - mu)

    # ──────────────────────────────────────────────────────
    # Torque from off-centre ground contact
    #
    #   lever arm :  r = contact − COM
    #   normal F  :  (0, −N)   upward in y-down space
    #
    #   τ = r_x × (−N)
    #
    #   Δω = τ / I         angular impulse directly yields velocity change
    #   ω += Δω            angular velocity update
    #
    # The normal impulse magnitude N approximates the
    # collision strength from the velocity that was just
    # reversed by the bounce.
    # ──────────────────────────────────────────────────────
    lever_x = contact[0] - body.x
    normal_impulse = body.mass * vy_impact * (1.0 + e)

    if abs(lever_x) > 0.5 and normal_impulse > 0:
        torque = -lever_x * normal_impulse
        delta_omega = torque / body.inertia
        body.omega += delta_omega

    # Rest detection
    if abs(body.vy) < 1.0 and abs(body.vx) < 1.0 and abs(body.omega) < 0.01:
        body.vy = 0.0
        body.vx = 0.0
        body.omega = 0.0
        body.resting = True


def _resolve_ground_verlet(body: RigidBody, cfg: SimConfig) -> None:
    """Handle ground collision for Verlet integration."""

    contact, contact_y = _lowest_contact(body, cfg)
    ground_y = cfg.ground_y

    if contact_y < ground_y:
        return

    penetration = contact_y - ground_y
    
    # Calculate impact velocity before positional correction
    dt = cfg.physics.dt
    vy_impact = (body.y - body.prev_y) / dt if dt > 0 else 0.0
    
    body.y -= penetration
    # CRITICAL: Adjust prev_y to prevent the positional push from generating fake upward velocity
    body.prev_y -= penetration

    e = cfg.physics.restitution

    # ──────────────────────────────────────────────────────
    # Verlet implicit velocity:  v ≈ (x − x_prev) / dt
    # ──────────────────────────────────────────────────────
    if vy_impact > 0:
        vy_bounced = -e * vy_impact
        body.prev_y = body.y - vy_bounced * dt

    # Ground friction — damp horizontal implicit velocity on contact
    mu = cfg.physics.ground_friction
    vx_implicit = (body.x - body.prev_x) / dt if dt > 0 else 0.0
    vx_damped = vx_implicit * (1.0 - mu)
    body.prev_x = body.x - vx_damped * dt

    # Torque from off-centre contact (same physics as Euler)
    lever_x = contact[0] - body.x
    normal_impulse = body.mass * abs(vy_impact) * (1.0 + e)

    if abs(lever_x) > 0.5 and normal_impulse > 0:
        torque = -lever_x * normal_impulse
        delta_omega = torque / body.inertia
        # Encode angular impulse into prev_angle
        omega_implicit = (body.angle - body.prev_angle) / dt if dt > 0 else 0.0
        omega_new = omega_implicit + delta_omega
        body.prev_angle = body.angle - omega_new * dt

    # Rest detection
    vy_now = abs(body.y - body.prev_y) / dt if dt > 0 else 0.0
    vx_now = abs(body.x - body.prev_x) / dt if dt > 0 else 0.0
    omega_now = abs(body.angle - body.prev_angle) / dt if dt > 0 else 0.0

    if vy_now < 1.0 and vx_now < 1.0 and omega_now < 0.01:
        body.prev_x = body.x
        body.prev_y = body.y
        body.prev_angle = body.angle
        body.resting = True


# ═══════════════════════════════════════════════════════════
#  Integration — Euler
# ═══════════════════════════════════════════════════════════

def step_euler(body: RigidBody, cfg: SimConfig) -> None:
    """Advance one frame using explicit Euler integration.

    ┌─────────────────────────────────────────────────────────┐
    │  TRANSLATION  (Newton's 2nd law:  F = m a)             │
    │                                                         │
    │    a_y = g                   acceleration = gravity     │
    │    v_y += a_y × dt           velocity accumulates       │
    │    y   += v_y × dt           position follows velocity  │
    │                                                         │
    │  Euler is 1st-order:  error grows as O(dt).             │
    │  Larger dt → less accurate, energy drifts upward.       │
    ├─────────────────────────────────────────────────────────┤
    │  ROTATION                                               │
    │                                                         │
    │    θ += ω × dt               angle follows spin         │
    │    ω *= damping              air drag on spin           │
    └─────────────────────────────────────────────────────────┘
    """

    if body.resting:
        return

    g = cfg.physics.gravity
    dt = cfg.physics.dt

    # ── Air resistance (continuous drag every frame) ──
    #
    #   v_after = v × air_resistance
    #
    #   1.0 = vacuum (no drag)
    #   0.99 = light air
    #   0.95 = heavy drag (underwater feel)
    #
    drag = cfg.physics.air_resistance
    body.vx *= drag
    body.vy *= drag

    # ── Translation ──
    body.vy += g * dt                   # v += a × dt
    body.y += body.vy * dt              # y += v × dt
    body.x += body.vx * dt              # x += v × dt

    # ── Rotation ──
    body.angle += body.omega * dt       # θ += ω × dt
    body.omega *= cfg.physics.angular_damping

    # ── Ground collision ──
    _resolve_ground_euler(body, cfg)


# ═══════════════════════════════════════════════════════════
#  Integration — Verlet
# ═══════════════════════════════════════════════════════════

def step_verlet(body: RigidBody, cfg: SimConfig) -> None:
    """Advance one frame using Störmer-Verlet integration.

    ┌─────────────────────────────────────────────────────────┐
    │  TRANSLATION                                            │
    │                                                         │
    │    x_new = 2x − x_prev + a × dt²                       │
    │                                                         │
    │  Velocity is never stored — it is *implicit* in the     │
    │  gap between current and previous positions:            │
    │                                                         │
    │    v ≈ (x − x_prev) / dt                                │
    │                                                         │
    │  Verlet is 2nd-order:  error grows as O(dt²).           │
    │  More stable than Euler, conserves energy better.        │
    ├─────────────────────────────────────────────────────────┤
    │  ROTATION  (same Verlet formula for angle)              │
    │                                                         │
    │    θ_new = 2θ − θ_prev + α × dt²                       │
    │                                                         │
    │  Damping is applied by scaling the implicit velocity:   │
    │                                                         │
    │    θ_new = θ + (θ − θ_prev) × damping + α × dt²        │
    └─────────────────────────────────────────────────────────┘
    """

    if body.resting:
        return

    g = cfg.physics.gravity
    dt = cfg.physics.dt
    dt2 = dt * dt
    damp = cfg.physics.angular_damping

    # ── Air resistance (continuous drag every frame) ──
    #
    #   For Verlet, drag scales the implicit velocity:
    #   v_implicit = (x − x_prev)   (not divided by dt)
    #   We scale it so:  x_new = x + v_implicit × drag + a × dt²
    #
    drag = cfg.physics.air_resistance

    # ── Translation ──
    vx_implicit = body.x - body.prev_x
    vy_implicit = body.y - body.prev_y

    new_x = body.x + vx_implicit * drag                # inertia + drag
    new_y = body.y + vy_implicit * drag + g * dt2       # + gravity

    body.prev_x = body.x
    body.prev_y = body.y
    body.x = new_x
    body.y = new_y

    # ── Rotation (with damping) ──
    # θ_new = θ + (θ − θ_prev) × damping   (no external torque during freefall)
    omega_implicit = body.angle - body.prev_angle
    new_angle = body.angle + omega_implicit * damp

    body.prev_angle = body.angle
    body.angle = new_angle

    # ── Ground collision ──
    _resolve_ground_verlet(body, cfg)


# ═══════════════════════════════════════════════════════════
#  Main simulation step
# ═══════════════════════════════════════════════════════════

def step(bodies: list[RigidBody], cfg: SimConfig) -> None:
    """Step all bodies by one dt using the configured integrator."""

    integrator = step_verlet if cfg.physics.integration is IntegrationMode.VERLET else step_euler

    for body in bodies:
        if body.resting:
            continue
        integrator(body, cfg)
