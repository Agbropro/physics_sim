"""FastAPI application — COM calculation and gravity simulation endpoints."""

import logging
from itertools import combinations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.physics.com.com import group_com, joint_groups, overlap_ratio
from src.physics.entities import (
    BodyState,
    CircleIn,
    ComRequest,
    ComResponse,
    FrameOut,
    GroupOut,
    OverlapOut,
    PolygonIn,
    RectangleIn,
    Shape,
    ShapeIn,
    SimulateRequest,
    SimulateResponse,
)
from src.physics.gravity.gravity import create_body, step


LOGGER = logging.getLogger(__name__)

app = FastAPI(
    title="Physics Simulator API",
    version="1.0.0",
    description="2D center-of-mass and gravity simulation for drawn shapes.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


# ───────────────────────────────────────────────────────────
#  Adapter: convert API input shapes → domain Shape
# ───────────────────────────────────────────────────────────

def _to_shape(data: ShapeIn) -> Shape:
    """Convert a validated API shape into a domain Shape."""

    if isinstance(data, RectangleIn):
        return Shape(
            name=data.id,
            kind="rectangle",
            coord=[data.first_corner, data.opposite_corner],
        )
    if isinstance(data, CircleIn):
        return Shape(
            name=data.id,
            kind="circle",
            coord=[data.center],
            radius=data.radius,
        )
    if isinstance(data, PolygonIn):
        return Shape(
            name=data.id,
            kind="polygon",
            coord=data.points,
        )
    raise TypeError(f"Unsupported shape: {type(data).__name__}")


# ───────────────────────────────────────────────────────────
#  Endpoints
# ───────────────────────────────────────────────────────────

@app.get("/api/health")
def health() -> dict[str, str]:
    """API readiness check."""

    return {"status": "ok"}


@app.post("/api/com", response_model=ComResponse)
def calculate_com(request: ComRequest) -> ComResponse:
    """Compute overlaps and center-of-mass for submitted shapes."""

    shapes = [_to_shape(s) for s in request.shapes]
    overlaps: list[OverlapOut] = []

    for a, b in combinations(shapes, 2):
        ratio = overlap_ratio(a, b, request.width, request.height)
        joined = ratio >= request.overlap_threshold and ratio > 0
        overlaps.append(OverlapOut(
            first_id=a.name,
            second_id=b.name,
            ratio=ratio,
            joined=joined,
        ))

    groups_list = joint_groups(shapes, request.width, request.height, request.overlap_threshold)
    groups: list[GroupOut] = []

    for gid, group in enumerate(groups_list, start=1):
        center = group_com(group, request.width, request.height, request.rho)
        groups.append(GroupOut(
            id=gid,
            shape_ids=[s.name for s in group],
            joined=len(group) > 1,
            center=center,
        ))

    return ComResponse(groups=groups, overlaps=overlaps)


@app.post("/api/simulate", response_model=SimulateResponse)
def simulate(request: SimulateRequest) -> SimulateResponse:
    """Run a gravity simulation and return per-frame body states."""

    cfg = request.to_sim_config()
    shapes = [_to_shape(s) for s in request.shapes]

    # Group overlapping shapes → each group becomes one rigid body
    groups = joint_groups(shapes, cfg.canvas.width, cfg.canvas.height, request.overlap_threshold)
    bodies = [
        create_body(group, cfg.canvas.width, cfg.canvas.height, request.rho)
        for group in groups
    ]

    frames: list[FrameOut] = []

    for tick in range(request.max_frames):
        # Record state before stepping
        frames.append(FrameOut(
            tick=tick,
            bodies=[
                BodyState(name=b.name, x=b.x, y=b.y, angle=b.angle, resting=b.resting)
                for b in bodies
            ],
        ))

        # Stop early if all bodies are at rest
        if all(b.resting for b in bodies):
            LOGGER.info("All bodies at rest at tick %d", tick)
            break

        step(bodies, cfg)

    return SimulateResponse(frames=frames)


if __name__ == "__main__":
    import uvicorn
    import yaml
    from pathlib import Path

    config_path = Path(__file__).parent.parent.parent / "config" / "config.yaml"
    with open(config_path) as f:
        config = yaml.safe_load(f)
    
    be_cfg = config.get("BE", {})
    host = be_cfg.get("host", "0.0.0.0")
    port = be_cfg.get("port", 6980)
    reload = be_cfg.get("reload", True)

    # When run directly with: python3 src/delivery/api.py
    uvicorn.run(
        "src.delivery.api:app",
        host=host,
        port=port,
        reload=reload
    )
