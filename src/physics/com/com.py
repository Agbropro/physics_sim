"""Simplified center-of-mass physics for 2D shapes on a pixel canvas."""

from collections.abc import Sequence

import cv2
import numpy as np

from src.physics.entities import Shape, ShapeType

# ---------------------------------------------------------------------------
# Type aliases
# ---------------------------------------------------------------------------

Density = float | np.ndarray
BBox = tuple[int, int, int, int]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _draw_filled(shape: Shape, mask: np.ndarray, offset: tuple[int, int] = (0, 0)) -> None:
    """Rasterise one filled shape into *mask* (modifies in place)."""

    ox, oy = offset
    pts = [(round(x) - ox, round(y) - oy) for x, y in shape.coord]

    if shape.kind is ShapeType.RECTANGLE:
        cv2.rectangle(mask, pts[0], pts[1], 1, thickness=-1)
    elif shape.kind is ShapeType.CIRCLE:
        r = round(shape.radius) if shape.radius else 0
        cv2.circle(mask, pts[0], r, 1, thickness=-1)
    elif shape.kind is ShapeType.POLYGON:
        cv2.fillPoly(mask, [np.array(pts, dtype=np.int32)], 1)


def _shape_bbox(shape: Shape, w: int, h: int) -> BBox | None:
    """Return the clipped bounding box, or None if fully off-canvas."""

    pts = [(round(x), round(y)) for x, y in shape.coord]

    if shape.kind is ShapeType.CIRCLE:
        cx, cy = pts[0]
        r = round(shape.radius) if shape.radius else 0
        left, top, right, bottom = cx - r, cy - r, cx + r, cy + r
    else:
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        left, top, right, bottom = min(xs), min(ys), max(xs), max(ys)

    if right < 0 or bottom < 0 or left >= w or top >= h:
        return None

    return max(0, left), max(0, top), min(w - 1, right), min(h - 1, bottom)


def _bbox_overlap(a: BBox | None, b: BBox | None) -> BBox | None:
    """Return the intersection of two bounding boxes."""

    if a is None or b is None:
        return None
    l, t, r, bo = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    return (l, t, r, bo) if l <= r and t <= bo else None


def _crop_mask(shape: Shape, bbox: BBox) -> np.ndarray:
    """Rasterise a shape clipped to *bbox* only."""

    l, t, r, b = bbox
    mask = np.zeros((b - t + 1, r - l + 1), dtype=np.uint8)
    _draw_filled(shape, mask, offset=(l, t))
    return mask


# ---------------------------------------------------------------------------
# Public API — masks and density
# ---------------------------------------------------------------------------

def shape_mask(shape: Shape, width: int, height: int) -> np.ndarray:
    """Return a full-canvas binary mask for one shape."""

    mask = np.zeros((height, width), dtype=np.uint8)
    _draw_filled(shape, mask)
    return mask


def apply_rho(mask: np.ndarray, rho: Density = 1.0) -> np.ndarray:
    """Multiply a binary mask by uniform or per-pixel density."""

    mask = np.asarray(mask, dtype=np.float64)

    if np.isscalar(rho):
        rho_f = float(rho)
        if not np.isfinite(rho_f) or rho_f < 0:
            raise ValueError("rho must be finite and non-negative")
        return mask * rho_f

    rho_map = np.asarray(rho, dtype=np.float64)
    if rho_map.shape != mask.shape:
        raise ValueError(f"rho shape {rho_map.shape} != mask shape {mask.shape}")
    if not np.all(np.isfinite(rho_map)) or np.any(rho_map < 0):
        raise ValueError("rho values must be finite and non-negative")
    return mask * rho_map


# ---------------------------------------------------------------------------
# Public API — center of mass
# ---------------------------------------------------------------------------

def map_com(mass_map: np.ndarray) -> tuple[float, float]:
    """Compute (x, y) center of mass from a 2D mass array."""

    m = np.asarray(mass_map, dtype=np.float64)
    if m.ndim != 2:
        raise ValueError("mass_map must be 2-dimensional")

    m00 = float(m.sum())
    if m00 == 0:
        raise ValueError("COM is undefined when total mass is zero")

    ys, xs = np.indices(m.shape)
    return float((xs * m).sum()) / m00, float((ys * m).sum()) / m00


def shape_com(shape: Shape, width: int, height: int, rho: Density = 1.0) -> tuple[float, float]:
    """Calculate COM for a single shape."""

    return map_com(apply_rho(shape_mask(shape, width, height), rho))


def group_com(shapes: Sequence[Shape], width: int, height: int, rho: Density = 1.0) -> tuple[float, float]:
    """Calculate COM from the filled union of multiple shapes."""

    if not shapes:
        raise ValueError("at least one shape is required")

    union = np.zeros((height, width), dtype=np.uint8)
    for s in shapes:
        _draw_filled(s, union)

    return map_com(apply_rho(union, rho))


# ---------------------------------------------------------------------------
# Public API — overlap and grouping
# ---------------------------------------------------------------------------

def overlap_ratio(a: Shape, b: Shape, width: int, height: int) -> float:
    """Return intersection / min(area_a, area_b)."""

    a_box = _shape_bbox(a, width, height)
    b_box = _shape_bbox(b, width, height)
    shared = _bbox_overlap(a_box, b_box)

    if a_box is None or b_box is None or shared is None:
        return 0.0

    a_area = int(_crop_mask(a, a_box).sum())
    b_area = int(_crop_mask(b, b_box).sum())
    smaller = min(a_area, b_area)
    if smaller == 0:
        return 0.0

    inter = np.logical_and(
        _crop_mask(a, shared).astype(bool),
        _crop_mask(b, shared).astype(bool),
    )
    return float(inter.sum() / smaller)


def joint_groups(
    shapes: Sequence[Shape],
    width: int,
    height: int,
    threshold: float,
) -> list[list[Shape]]:
    """Group overlapping shapes using union-find."""

    if not 0 <= threshold <= 1:
        raise ValueError("threshold must be between 0 and 1")

    n = len(shapes)
    parent = list(range(n))
    size = [1] * n

    def find(i: int) -> int:
        while i != parent[i]:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i: int, j: int) -> None:
        ri, rj = find(i), find(j)
        if ri == rj:
            return
        if size[ri] < size[rj]:
            ri, rj = rj, ri
        parent[rj] = ri
        size[ri] += size[rj]

    for s in shapes:
        s.joint_group = None

    for i in range(n):
        for j in range(i + 1, n):
            r = overlap_ratio(shapes[i], shapes[j], width, height)
            if r >= threshold and r > 0:
                union(i, j)

    groups: dict[int, list[Shape]] = {}
    for idx, s in enumerate(shapes):
        groups.setdefault(find(idx), []).append(s)

    result = list(groups.values())
    for gid, g in enumerate(result, start=1):
        if len(g) > 1:
            for s in g:
                s.joint_group = gid

    return result
