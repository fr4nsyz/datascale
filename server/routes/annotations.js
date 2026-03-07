import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { broadcastToImage } from '../websocket.js';

const router = Router();

// GET /api/annotations/image/:imageId — get all annotations for an image
router.get('/image/:imageId', (req, res) => {
  const annotations = db.prepare(
    'SELECT * FROM annotations WHERE image_id = ? ORDER BY created_at DESC'
  ).all(req.params.imageId);
  res.json(annotations);
});

// POST /api/annotations — create annotation
router.post('/', (req, res) => {
  const { image_id, project_id, label, type, data, confidence, source } = req.body;
  if (!image_id || !project_id || !type || !data) {
    return res.status(400).json({ error: 'image_id, project_id, type, and data are required' });
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  const dataStr = typeof data === 'string' ? data : JSON.stringify(data);

  db.prepare(`
    INSERT INTO annotations (id, image_id, project_id, label, type, data, confidence, source, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, image_id, project_id, label || null, type, dataStr, confidence ?? null, source || 'manual', req.user || 'local-user', now, now);

  const annotation = db.prepare('SELECT * FROM annotations WHERE id = ?').get(id);

  broadcastToImage(image_id, {
    type: 'annotation-created',
    annotation,
  });

  res.status(201).json(annotation);
});

// PUT /api/annotations/:id — update annotation
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM annotations WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Annotation not found' });
  }

  const { label, type, data, confidence } = req.body;
  const now = new Date().toISOString();
  const dataStr = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : existing.data;

  db.prepare(`
    UPDATE annotations SET label = ?, type = ?, data = ?, confidence = ?, updated_at = ? WHERE id = ?
  `).run(
    label ?? existing.label,
    type || existing.type,
    dataStr,
    confidence ?? existing.confidence,
    now,
    req.params.id
  );

  const annotation = db.prepare('SELECT * FROM annotations WHERE id = ?').get(req.params.id);

  broadcastToImage(existing.image_id, {
    type: 'annotation-updated',
    annotation,
  });

  res.json(annotation);
});

// DELETE /api/annotations/:id — delete annotation
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM annotations WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Annotation not found' });
  }

  db.prepare('DELETE FROM annotations WHERE id = ?').run(req.params.id);

  broadcastToImage(existing.image_id, {
    type: 'annotation-deleted',
    annotationId: req.params.id,
  });

  res.json({ success: true });
});

// POST /api/annotations/batch — create multiple annotations at once
router.post('/batch', (req, res) => {
  const { annotations } = req.body;
  if (!Array.isArray(annotations) || annotations.length === 0) {
    return res.status(400).json({ error: 'annotations array is required' });
  }

  const now = new Date().toISOString();
  const insertStmt = db.prepare(`
    INSERT INTO annotations (id, image_id, project_id, label, type, data, confidence, source, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const created = [];
  const insertAll = db.transaction((items) => {
    for (const ann of items) {
      const id = uuidv4();
      const dataStr = typeof ann.data === 'string' ? ann.data : JSON.stringify(ann.data);
      insertStmt.run(
        id,
        ann.image_id,
        ann.project_id,
        ann.label || null,
        ann.type,
        dataStr,
        ann.confidence ?? null,
        ann.source || 'manual',
        req.user || 'local-user',
        now,
        now
      );
      created.push(db.prepare('SELECT * FROM annotations WHERE id = ?').get(id));
    }
  });

  insertAll(annotations);

  // Broadcast to relevant images
  const imageIds = [...new Set(annotations.map((a) => a.image_id))];
  for (const imageId of imageIds) {
    const imageAnnotations = created.filter((a) => a.image_id === imageId);
    broadcastToImage(imageId, {
      type: 'annotation-created',
      annotations: imageAnnotations,
      batch: true,
    });
  }

  res.status(201).json(created);
});

// GET /api/annotations/project/:projectId — get all annotations for a project
router.get('/project/:projectId', (req, res) => {
  const annotations = db.prepare(
    'SELECT * FROM annotations WHERE project_id = ? ORDER BY created_at DESC'
  ).all(req.params.projectId);
  res.json(annotations);
});

export default router;
