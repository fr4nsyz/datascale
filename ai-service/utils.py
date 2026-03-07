"""Shared utilities for the dataTail AI service."""

from __future__ import annotations

import io
import math
from typing import Any

import numpy as np
from fastapi import UploadFile
from PIL import Image


# ---------------------------------------------------------------------------
# Image helpers
# ---------------------------------------------------------------------------

async def image_from_upload(file: UploadFile) -> tuple[Image.Image, np.ndarray]:
    """Read an ``UploadFile`` into a PIL Image and a numpy RGB array."""
    data = await file.read()
    pil_image = Image.open(io.BytesIO(data)).convert("RGB")
    np_image = np.array(pil_image)
    return pil_image, np_image


def crop_region(image: Image.Image, bbox: dict[str, int]) -> Image.Image:
    """Crop a PIL image by a bbox dict ``{x, y, w, h}``."""
    x, y, w, h = bbox["x"], bbox["y"], bbox["w"], bbox["h"]
    return image.crop((x, y, x + w, y + h))


# ---------------------------------------------------------------------------
# Mask  -->  polygon  (no OpenCV dependency)
# ---------------------------------------------------------------------------

def mask_to_polygon(mask: np.ndarray, simplify_tolerance: float = 2.0) -> list[list[int]]:
    """Convert a binary mask to an ordered list of ``[x, y]`` boundary points.

    The approach:
    1. Find boundary pixels (mask==1 whose 4-neighbour is 0 or at the image
       edge).
    2. Compute the centroid of those pixels.
    3. Sort boundary pixels by angle from the centroid so they form an ordered
       polygon.
    4. Apply Douglas-Peucker simplification to reduce point count.
    """
    if mask.ndim != 2:
        raise ValueError("mask must be 2-D")

    padded = np.pad(mask.astype(np.uint8), 1, mode="constant", constant_values=0)

    # A boundary pixel has at least one 4-connected neighbour that is 0.
    boundary = (
        (padded[1:-1, 1:-1] == 1)
        & (
            (padded[:-2, 1:-1] == 0)
            | (padded[2:, 1:-1] == 0)
            | (padded[1:-1, :-2] == 0)
            | (padded[1:-1, 2:] == 0)
        )
    )

    ys, xs = np.where(boundary)
    if len(xs) == 0:
        return []

    cx, cy = xs.mean(), ys.mean()
    angles = np.arctan2(ys - cy, xs - cx)
    order = np.argsort(angles)
    points = np.column_stack([xs[order], ys[order]])

    simplified = _douglas_peucker(points, simplify_tolerance)
    return simplified.tolist()


def _douglas_peucker(points: np.ndarray, epsilon: float) -> np.ndarray:
    """Simplify a polyline using the Douglas-Peucker algorithm."""
    if len(points) <= 2:
        return points

    # Find the point with the maximum distance from the line between first and last.
    start, end = points[0].astype(float), points[-1].astype(float)
    line_vec = end - start
    line_len = np.linalg.norm(line_vec)

    if line_len == 0:
        dists = np.linalg.norm(points - start, axis=1)
    else:
        line_unit = line_vec / line_len
        diff = points.astype(float) - start
        proj = np.dot(diff, line_unit)
        proj = np.clip(proj, 0, line_len)
        closest = start + np.outer(proj, line_unit)
        dists = np.linalg.norm(points - closest, axis=1)

    max_idx = int(np.argmax(dists))
    max_dist = dists[max_idx]

    if max_dist > epsilon:
        left = _douglas_peucker(points[: max_idx + 1], epsilon)
        right = _douglas_peucker(points[max_idx:], epsilon)
        return np.vstack([left[:-1], right])
    else:
        return np.array([points[0], points[-1]])


# ---------------------------------------------------------------------------
# Run-Length Encoding
# ---------------------------------------------------------------------------

def mask_to_rle(mask: np.ndarray) -> dict[str, Any]:
    """Encode a binary mask as run-length encoding.

    Returns ``{"counts": [...], "size": [height, width]}``.
    Counts alternate between runs of 0s and 1s, starting with 0.
    """
    flat = mask.astype(np.uint8).ravel(order="C")
    if len(flat) == 0:
        return {"counts": [], "size": list(mask.shape)}

    diffs = np.diff(flat)
    change_indices = np.where(diffs != 0)[0] + 1
    change_indices = np.concatenate([[0], change_indices, [len(flat)]])
    counts = np.diff(change_indices).tolist()

    # Ensure we start with a run of 0s.
    if flat[0] == 1:
        counts = [0] + counts

    return {"counts": counts, "size": [int(mask.shape[0]), int(mask.shape[1])]}


def rle_to_mask(rle: dict[str, Any], shape: tuple[int, int] | None = None) -> np.ndarray:
    """Decode an RLE dict back into a binary mask."""
    if shape is None:
        shape = tuple(rle["size"])
    counts = rle["counts"]
    mask_flat = np.zeros(shape[0] * shape[1], dtype=np.uint8)
    pos = 0
    for i, c in enumerate(counts):
        if i % 2 == 1:
            mask_flat[pos: pos + c] = 1
        pos += c
    return mask_flat.reshape(shape)


# ---------------------------------------------------------------------------
# IoU
# ---------------------------------------------------------------------------

def compute_iou(mask1: np.ndarray, mask2: np.ndarray) -> float:
    """Compute Intersection-over-Union for two binary masks."""
    intersection = np.logical_and(mask1, mask2).sum()
    union = np.logical_or(mask1, mask2).sum()
    if union == 0:
        return 0.0
    return float(intersection / union)
