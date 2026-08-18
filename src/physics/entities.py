"""Pydantic schemas for shapes, canvas, and COM API contracts."""

from enum import Enum
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Primitives
# ---------------------------------------------------------------------------

Point = tuple[float, float]


class ShapeType(str, Enum):
    """Supported 2D shape types."""

    RECTANGLE = "rectangle"
    CIRCLE = "circle"
    POLYGON = "polygon"


# ---------------------------------------------------------------------------
# Domain shape (used internally by the physics engine)
# ---------------------------------------------------------------------------

class Shape(BaseModel):
    """A filled 2D shape in canvas pixel coordinates."""

    name: str
    kind: ShapeType
    coord: list[Point]
    radius: float | None = None
    joint_group: int | None = Field(default=None, exclude=True)

    @field_validator("kind", mode="before")
    @classmethod
    def normalise_kind(cls, v: str | ShapeType) -> ShapeType:
        """Accept lowercase strings like 'rectangle'."""
        if isinstance(v, str):
            return ShapeType(v.lower())
        return v

    @field_validator("coord")
    @classmethod
    def validate_coord(cls, v: list[Point]) -> list[Point]:
        """Ensure every coordinate is an (x, y) pair."""
        for point in v:
            if len(point) != 2:
                raise ValueError("every coordinate must be an (x, y) pair")
        return list(v)


# ---------------------------------------------------------------------------
# API input shapes (discriminated union on `kind`)
# ---------------------------------------------------------------------------

class RectangleIn(BaseModel):
    """Rectangle geometry from the frontend."""

    id: str = Field(min_length=1)
    kind: Literal["rectangle"]
    first_corner: Point
    opposite_corner: Point


class CircleIn(BaseModel):
    """Circle geometry from the frontend."""

    id: str = Field(min_length=1)
    kind: Literal["circle"]
    center: Point
    radius: float = Field(gt=0)


class PolygonIn(BaseModel):
    """Polygon geometry from the frontend."""

    id: str = Field(min_length=1)
    kind: Literal["polygon"]
    points: list[Point]

    @field_validator("points")
    @classmethod
    def min_vertices(cls, v: list[Point]) -> list[Point]:
        """Require at least three vertices."""
        if len(v) < 3:
            raise ValueError("polygon requires at least three points")
        return v


ShapeIn = Annotated[
    Union[RectangleIn, CircleIn, PolygonIn],
    Field(discriminator="kind"),
]


# ---------------------------------------------------------------------------
# API request / response
# ---------------------------------------------------------------------------

class ComRequest(BaseModel):
    """POST /api/com request body."""

    width: int = Field(gt=0)
    height: int = Field(gt=0)
    shapes: list[ShapeIn] = Field(min_length=1)
    rho: float = Field(default=1.0, gt=0)
    overlap_threshold: float = Field(default=0.3, ge=0, le=1)


class OverlapOut(BaseModel):
    """Pairwise overlap result."""

    first_id: str
    second_id: str
    ratio: float
    joined: bool


class GroupOut(BaseModel):
    """Connected shape group and its center of mass."""

    id: int
    shape_ids: list[str]
    joined: bool
    center: Point


class ComResponse(BaseModel):
    """POST /api/com response body."""

    groups: list[GroupOut]
    overlaps: list[OverlapOut]


# ---------------------------------------------------------------------------
# Simulation config (loaded from config/config.yaml)
# ---------------------------------------------------------------------------

class IntegrationMode(str, Enum):
    """Time-stepping algorithm."""

    EULER = "euler"
    VERLET = "verlet"


class PhysicsConfig(BaseModel):
    """Tunable physics constants."""

    gravity: float = Field(gt=0, description="px/s²")
    dt: float = Field(gt=0, description="seconds per tick")
    restitution: float = Field(ge=0, le=1, description="bounce coefficient")
    air_resistance: float = Field(ge=0, le=1, description="velocity decay per tick in air")
    ground_friction: float = Field(ge=0, le=1, description="horizontal friction on ground")
    angular_damping: float = Field(ge=0, le=1, description="spin decay per tick")
    contact_tolerance: float = Field(default=0.5, ge=0, description="px tolerance for flat surface hits")
    integration: IntegrationMode = IntegrationMode.VERLET


class GroundConfig(BaseModel):
    """Ground plane placement."""

    offset: float = Field(ge=0, description="pixels from canvas bottom")


class CanvasConfig(BaseModel):
    """Drawing surface dimensions."""

    width: int = Field(gt=0)
    height: int = Field(gt=0)


class SimConfig(BaseModel):
    """Top-level simulation configuration."""

    physics: PhysicsConfig
    ground: GroundConfig
    canvas: CanvasConfig

    @property
    def ground_y(self) -> float:
        """Y-coordinate of the ground plane (y-down pixel space)."""
        return self.canvas.height - self.ground.offset


# ---------------------------------------------------------------------------
# Rigid body (mutable simulation state)
# ---------------------------------------------------------------------------

class RigidBody(BaseModel):
    """A 2D rigid body with translational and rotational state."""

    # Identity
    name: str
    kind: ShapeType
    vertices: list[Point] = Field(default_factory=list)
    radius: float | None = None

    # Precomputed constants (set once at creation, never change)
    mass: float = 0.0
    inertia: float = 0.0

    # ── Translational state ──
    x: float = 0.0               # COM x position
    y: float = 0.0               # COM y position
    prev_x: float = 0.0          # previous x  (Verlet)
    prev_y: float = 0.0          # previous y  (Verlet)
    vx: float = 0.0              # x velocity   (Euler)
    vy: float = 0.0              # y velocity   (Euler)

    # ── Rotational state ──
    angle: float = 0.0           # current angle (radians)
    prev_angle: float = 0.0      # previous angle (Verlet)
    omega: float = 0.0           # angular velocity (Euler)

    # Status
    resting: bool = False


# ---------------------------------------------------------------------------
# Simulation API request / response
# ---------------------------------------------------------------------------

class SimulateRequest(BaseModel):
    """POST /api/simulate request body."""

    width: int = Field(gt=0)
    height: int = Field(gt=0)
    shapes: list[ShapeIn] = Field(min_length=1)
    rho: float = Field(default=1.0, gt=0)
    overlap_threshold: float = Field(default=0.3, ge=0, le=1)
    gravity: float = Field(default=980.0, gt=0)
    dt: float = Field(default=0.01667, gt=0)
    restitution: float = Field(default=0.4, ge=0, le=1)
    air_resistance: float = Field(default=0.999, ge=0, le=1)
    ground_friction: float = Field(default=0.3, ge=0, le=1)
    angular_damping: float = Field(default=0.98, ge=0, le=1)
    contact_tolerance: float = Field(default=3.0, ge=0)
    ground_offset: float = Field(default=50.0, ge=0)
    integration: IntegrationMode = IntegrationMode.VERLET
    max_frames: int = Field(default=600, gt=0, le=3600)

    def to_sim_config(self) -> SimConfig:
        """Convert flat request fields into a nested SimConfig."""
        return SimConfig(
            physics=PhysicsConfig(
                gravity=self.gravity * 100.0,
                dt=self.dt,
                restitution=self.restitution,
                air_resistance=self.air_resistance,
                ground_friction=self.ground_friction,
                angular_damping=self.angular_damping,
                contact_tolerance=self.contact_tolerance,
                integration=self.integration,
            ),
            ground=GroundConfig(offset=self.ground_offset),
            canvas=CanvasConfig(width=self.width, height=self.height),
        )


class BodyState(BaseModel):
    """Snapshot of one body at one tick."""

    name: str
    x: float
    y: float
    angle: float
    resting: bool


class FrameOut(BaseModel):
    """One simulation tick."""

    tick: int
    bodies: list[BodyState]


class SimulateResponse(BaseModel):
    """POST /api/simulate response body."""

    frames: list[FrameOut]
