"""SAM segmentation endpoints."""

from __future__ import annotations

import logging
from typing import Any, Dict, List

import numpy as np
import torch
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from models import DEVICE, get_sam_model, get_sam_predictor, get_sam2_model, get_yolo_world_model
from utils import (
    image_from_upload,
    mask_to_polygon,
    mask_to_rle,
    rle_to_mask,
)

logger = logging.getLogger("dataTail.segment")
router = APIRouter(prefix="/segment", tags=["segmentation"])


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class PointPrompt(BaseModel):
    x: int
    y: int


class BoxPrompt(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int


class MaskResult(BaseModel):
    polygon: List[List[int]]
    rle: Dict[str, Any]
    score: float


# ---------------------------------------------------------------------------
# POST /segment/click
# ---------------------------------------------------------------------------

@router.post("/click", response_model=List[MaskResult])
async def segment_click(
    image: UploadFile = File(...),
    points: str = Form(...),
    labels: str = Form(...),
):
    """Segment with point prompts (positive/negative clicks).

    *points*: JSON list of ``{"x": int, "y": int}`` objects.
    *labels*: JSON list of ``0`` (background) / ``1`` (foreground) integers.
    """
    import json

    try:
        point_dicts: list[dict] = json.loads(points)
        label_list: list[int] = json.loads(labels)
    except (json.JSONDecodeError, TypeError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid JSON in points/labels: {exc}")

    if len(point_dicts) != len(label_list):
        raise HTTPException(status_code=422, detail="points and labels must have the same length")
    if len(point_dicts) == 0:
        raise HTTPException(status_code=422, detail="At least one point is required")

    pil_img, np_img = await image_from_upload(image)

    point_coords = np.array([[p["x"], p["y"]] for p in point_dicts], dtype=np.float32)
    point_labels = np.array(label_list, dtype=np.int32)

    predictor = get_sam_predictor()
    predictor.set_image(np_img)

    masks, scores, _ = predictor.predict(
        point_coords=point_coords,
        point_labels=point_labels,
        multimask_output=True,
    )

    results: list[MaskResult] = []
    for mask, score in zip(masks, scores):
        binary = mask.astype(np.uint8)
        results.append(
            MaskResult(
                polygon=mask_to_polygon(binary),
                rle=mask_to_rle(binary),
                score=float(score),
            )
        )

    return sorted(results, key=lambda r: r.score, reverse=True)


# ---------------------------------------------------------------------------
# POST /segment/box
# ---------------------------------------------------------------------------

@router.post("/box", response_model=MaskResult)
async def segment_box(
    image: UploadFile = File(...),
    box: str = Form(...),
):
    """Segment with a bounding-box prompt.

    *box*: JSON object ``{"x1", "y1", "x2", "y2"}``.
    """
    import json

    try:
        box_dict: dict = json.loads(box)
    except (json.JSONDecodeError, TypeError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid JSON in box: {exc}")

    required = {"x1", "y1", "x2", "y2"}
    if not required.issubset(box_dict):
        raise HTTPException(status_code=422, detail=f"box must contain keys {required}")

    pil_img, np_img = await image_from_upload(image)

    input_box = np.array(
        [box_dict["x1"], box_dict["y1"], box_dict["x2"], box_dict["y2"]],
        dtype=np.float32,
    )

    predictor = get_sam_predictor()
    predictor.set_image(np_img)

    masks, scores, _ = predictor.predict(
        box=input_box[None, :],
        multimask_output=True,
    )

    # Return the mask with the highest score.
    best_idx = int(np.argmax(scores))
    binary = masks[best_idx].astype(np.uint8)
    return MaskResult(
        polygon=mask_to_polygon(binary),
        rle=mask_to_rle(binary),
        score=float(scores[best_idx]),
    )


# ---------------------------------------------------------------------------
# POST /segment/everything
# ---------------------------------------------------------------------------

COCO_CLASSES = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck",
    "boat", "traffic light", "fire hydrant", "stop sign", "parking meter", "bench",
    "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra",
    "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
    "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove",
    "skateboard", "surfboard", "tennis racket", "bottle", "wine glass", "cup",
    "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange",
    "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch",
    "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse",
    "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
    "refrigerator", "book", "clock", "vase", "scissors", "teddy bear",
    "hair drier", "toothbrush",
]


@router.post("/everything")
async def segment_everything(
    image: UploadFile = File(...),
    points_per_side: int = Form(16),
):
    """Detect and segment all objects in the image using YOLO-World + SAM2.

    Returns a list of segments, each with ``area``, ``bbox``, ``stability_score``,
    ``polygon``, ``rle``, and ``label``.
    """
    import tempfile, os

    pil_img, np_img = await image_from_upload(image)
    img_h, img_w = np_img.shape[:2]
    img_area = img_h * img_w

    yolo = get_yolo_world_model()
    sam2 = get_sam2_model()

    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        pil_img.save(f, format="JPEG")
        tmp_path = f.name

    try:
        yolo.set_classes(COCO_CLASSES)
        det_results = yolo.predict(tmp_path, conf=0.15, verbose=False)[0]

        if len(det_results.boxes) == 0:
            return []

        bboxes = det_results.boxes.xyxy.cpu().numpy().tolist()
        seg_results = sam2.predict(tmp_path, bboxes=bboxes, verbose=False)[0]

        results = []
        for i, box in enumerate(det_results.boxes):
            cls_idx = int(box.cls[0])
            confidence = float(box.conf[0])
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            x, y, w, h = int(x1), int(y1), int(x2 - x1), int(y2 - y1)
            area = w * h

            if area < max(500, img_area * 0.01):
                continue

            binary = seg_results.masks.data[i].cpu().numpy().astype(np.uint8)
            polygon = mask_to_polygon(binary)
            if len(polygon) < 3:
                continue

            results.append({
                "area": area,
                "bbox": [x, y, w, h],
                "stability_score": confidence,
                "predicted_iou": confidence,
                "polygon": polygon,
                "rle": mask_to_rle(binary),
                "label": yolo.names[cls_idx],
            })

        results.sort(key=lambda r: r["area"], reverse=True)
        return results
    finally:
        os.unlink(tmp_path)


# ---------------------------------------------------------------------------
# POST /segment/refine
# ---------------------------------------------------------------------------

@router.post("/refine", response_model=MaskResult)
async def segment_refine(
    image: UploadFile = File(...),
    existing_mask: str = Form(...),
    positive_points: str = Form("[]"),
    negative_points: str = Form("[]"),
):
    """Refine an existing mask with additional point prompts.

    *existing_mask*: JSON RLE dict ``{"counts": [...], "size": [H, W]}``.
    *positive_points*: JSON list of ``{"x", "y"}`` foreground points.
    *negative_points*: JSON list of ``{"x", "y"}`` background points.
    """
    import json

    try:
        rle_dict: dict = json.loads(existing_mask)
        pos_pts: list[dict] = json.loads(positive_points)
        neg_pts: list[dict] = json.loads(negative_points)
    except (json.JSONDecodeError, TypeError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid JSON: {exc}")

    if not pos_pts and not neg_pts:
        raise HTTPException(status_code=422, detail="At least one point is required for refinement")

    pil_img, np_img = await image_from_upload(image)

    # Decode existing mask.
    prev_mask = rle_to_mask(rle_dict)
    mask_input = prev_mask.astype(np.float32)[None, :, :]  # (1, H, W)

    # Build point arrays.
    all_pts = pos_pts + neg_pts
    point_coords = np.array([[p["x"], p["y"]] for p in all_pts], dtype=np.float32)
    point_labels = np.array(
        [1] * len(pos_pts) + [0] * len(neg_pts), dtype=np.int32
    )

    predictor = get_sam_predictor()
    predictor.set_image(np_img)

    # Convert mask_input to the low-res logit shape SAM expects (256x256).
    mask_input_tensor = torch.from_numpy(mask_input).unsqueeze(0).float()
    mask_input_resized = torch.nn.functional.interpolate(
        mask_input_tensor, size=(256, 256), mode="bilinear", align_corners=False
    )
    mask_input_np = mask_input_resized.squeeze(0).numpy()  # (1, 256, 256)

    masks, scores, _ = predictor.predict(
        point_coords=point_coords,
        point_labels=point_labels,
        mask_input=mask_input_np,
        multimask_output=False,
    )

    binary = masks[0].astype(np.uint8)
    return MaskResult(
        polygon=mask_to_polygon(binary),
        rle=mask_to_rle(binary),
        score=float(scores[0]),
    )
