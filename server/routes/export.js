import { Router } from 'express';
import archiver from 'archiver';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

const router = Router({ mergeParams: true });

// ── Bbox / polygon extraction ────────────────────────────

function extractBbox(ann) {
  let d = typeof ann.data === 'string' ? JSON.parse(ann.data) : ann.data;

  // Manual bbox: {x1, y1, x2, y2}
  if (d.x1 != null && d.y1 != null && d.x2 != null && d.y2 != null) {
    return { x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2 };
  }

  // AI bbox: {x, y, w, h}
  if (d.x != null && d.y != null && d.w != null && d.h != null) {
    return { x1: d.x, y1: d.y, x2: d.x + d.w, y2: d.y + d.h };
  }

  // Nested bbox: {bbox: {x, y, w, h}}
  if (d.bbox) {
    const b = d.bbox;
    if (b.x != null && b.y != null && b.w != null && b.h != null) {
      return { x1: b.x, y1: b.y, x2: b.x + b.w, y2: b.y + b.h };
    }
  }

  // Polygon: [[x,y], ...] or {polygon: [[x,y], ...]}
  const poly = extractPolygon(ann);
  if (poly && poly.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of poly) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return { x1: minX, y1: minY, x2: maxX, y2: maxY };
  }

  return null;
}

function extractPolygon(ann) {
  let d = typeof ann.data === 'string' ? JSON.parse(ann.data) : ann.data;

  // Direct array of [x,y] pairs
  if (Array.isArray(d) && d.length > 0 && Array.isArray(d[0])) {
    return d;
  }

  // {polygon: [[x,y], ...]}
  if (d.polygon && Array.isArray(d.polygon)) {
    return d.polygon;
  }

  // {points: [[x,y], ...]}
  if (d.points && Array.isArray(d.points)) {
    return d.points;
  }

  return null;
}

// ── COCO format builder ──────────────────────────────────

function buildCocoJson(images, annotations, labelClasses) {
  const categories = labelClasses.map((lc, idx) => ({
    id: idx + 1,
    name: lc.name,
  }));
  const categoryMap = Object.fromEntries(categories.map((c) => [c.name, c.id]));

  const cocoImages = [];
  const imageIdMap = {};
  images.forEach((img, idx) => {
    const cocoId = idx + 1;
    imageIdMap[img.id] = cocoId;
    cocoImages.push({
      id: cocoId,
      file_name: img.deduped_name || img.original_name,
      width: img.width || 0,
      height: img.height || 0,
    });
  });

  const cocoAnnotations = [];
  let annId = 1;
  for (const ann of annotations) {
    if (!ann.label || !categoryMap[ann.label]) continue;
    const imgCocoId = imageIdMap[ann.image_id];
    if (!imgCocoId) continue;

    const bbox = extractBbox(ann);
    if (!bbox) continue;

    const w = bbox.x2 - bbox.x1;
    const h = bbox.y2 - bbox.y1;

    const cocoAnn = {
      id: annId++,
      image_id: imgCocoId,
      category_id: categoryMap[ann.label],
      bbox: [bbox.x1, bbox.y1, w, h],
      area: w * h,
      iscrowd: 0,
    };

    const poly = extractPolygon(ann);
    if (poly && poly.length >= 3) {
      cocoAnn.segmentation = [poly.flat()];
    }

    cocoAnnotations.push(cocoAnn);
  }

  return {
    images: cocoImages,
    annotations: cocoAnnotations,
    categories,
  };
}

// ── YOLO format builder ──────────────────────────────────

function buildYoloData(images, annotations, labelClasses) {
  const classNames = labelClasses.map((lc) => lc.name);
  const classIndex = Object.fromEntries(classNames.map((n, i) => [n, i]));

  const perImage = {};
  for (const ann of annotations) {
    if (!ann.label || classIndex[ann.label] == null) continue;

    const img = images.find((i) => i.id === ann.image_id);
    if (!img || !img.width || !img.height) continue;

    const bbox = extractBbox(ann);
    if (!bbox) continue;

    const w = bbox.x2 - bbox.x1;
    const h = bbox.y2 - bbox.y1;
    const xCenter = (bbox.x1 + w / 2) / img.width;
    const yCenter = (bbox.y1 + h / 2) / img.height;
    const nw = w / img.width;
    const nh = h / img.height;

    const key = img.id;
    if (!perImage[key]) perImage[key] = [];
    perImage[key].push(`${classIndex[ann.label]} ${xCenter.toFixed(6)} ${yCenter.toFixed(6)} ${nw.toFixed(6)} ${nh.toFixed(6)}`);
  }

  return { classNames, perImage };
}

// ── Deduplicate original_name ────────────────────────────

function deduplicateNames(images) {
  const counts = {};
  return images.map((img) => {
    const name = img.original_name;
    if (!counts[name]) {
      counts[name] = 1;
      return { ...img, deduped_name: name };
    }
    const ext = path.extname(name);
    const base = path.basename(name, ext);
    const deduped = `${base}_${counts[name]}${ext}`;
    counts[name]++;
    return { ...img, deduped_name: deduped };
  });
}

// ── GET / — export endpoint ──────────────────────────────

router.get('/', (req, res) => {
  const { projectId } = req.params;
  const format = (req.query.format || 'coco').toLowerCase();
  const includeImages = req.query.includeImages === 'true';

  if (format !== 'coco' && format !== 'yolo') {
    return res.status(400).json({ error: 'format must be "coco" or "yolo"' });
  }

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  let images = db.prepare('SELECT * FROM images WHERE project_id = ?').all(projectId);
  const annotations = db.prepare('SELECT * FROM annotations WHERE project_id = ?').all(projectId);
  const labelClasses = db.prepare('SELECT * FROM label_classes WHERE project_id = ?').all(projectId);

  images = deduplicateNames(images);

  const safeName = project.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const zipName = `${safeName}_${format}.zip`;

  res.set('Content-Type', 'application/zip');
  res.set('Content-Disposition', `attachment; filename="${zipName}"`);

  const archive = archiver('zip', { zlib: { level: 5 } });
  archive.on('error', (err) => {
    console.error('[export] archiver error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Export failed' });
  });
  archive.pipe(res);

  if (format === 'coco') {
    const coco = buildCocoJson(images, annotations, labelClasses);
    archive.append(JSON.stringify(coco, null, 2), { name: 'annotations.json' });
  } else {
    const yolo = buildYoloData(images, annotations, labelClasses);
    archive.append(yolo.classNames.join('\n'), { name: 'classes.txt' });
    for (const img of images) {
      const lines = yolo.perImage[img.id] || [];
      const ext = path.extname(img.deduped_name);
      const labelName = path.basename(img.deduped_name, ext) + '.txt';
      archive.append(lines.join('\n'), { name: `labels/${labelName}` });
    }
  }

  if (includeImages) {
    for (const img of images) {
      const filePath = path.join(uploadsDir, img.project_id, img.filename);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: `images/${img.deduped_name}` });
      }
    }
  }

  archive.finalize();
});

// ── GET /summary — lightweight stats for the UI ──────────

router.get('/summary', (req, res) => {
  const { projectId } = req.params;

  const imageCount = db.prepare('SELECT COUNT(*) as count FROM images WHERE project_id = ?').get(projectId).count;
  const annotationCount = db.prepare('SELECT COUNT(*) as count FROM annotations WHERE project_id = ?').get(projectId).count;
  const classCount = db.prepare('SELECT COUNT(*) as count FROM label_classes WHERE project_id = ?').get(projectId).count;

  res.json({ images: imageCount, annotations: annotationCount, classes: classCount });
});

export default router;
