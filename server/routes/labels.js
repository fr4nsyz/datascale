import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';

const router = Router({ mergeParams: true });

// Predefined palette for auto-generating colors
const COLOR_PALETTE = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F0B27A', '#82E0AA', '#F1948A', '#85929E', '#73C6B6',
  '#E59866', '#A9CCE3', '#D2B4DE', '#A3E4D7', '#FAD7A0',
];

// GET /api/projects/:projectId/labels — list label classes
router.get('/', (req, res) => {
  const labels = db.prepare(
    'SELECT * FROM label_classes WHERE project_id = ? ORDER BY created_at ASC'
  ).all(req.params.projectId);
  res.json(labels);
});

// POST /api/projects/:projectId/labels — create label class
router.post('/', (req, res) => {
  const { name, color } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Label name is required' });
  }

  // Auto-generate color if not provided
  let labelColor = color;
  if (!labelColor) {
    const existingCount = db.prepare(
      'SELECT COUNT(*) AS cnt FROM label_classes WHERE project_id = ?'
    ).get(req.params.projectId).cnt;
    labelColor = COLOR_PALETTE[existingCount % COLOR_PALETTE.length];
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO label_classes (id, project_id, name, color, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, req.params.projectId, name, labelColor, now);

  const label = db.prepare('SELECT * FROM label_classes WHERE id = ?').get(id);
  res.status(201).json(label);
});

// PUT /api/projects/:projectId/labels/:id — update label class
router.put('/:id', (req, res) => {
  const existing = db.prepare(
    'SELECT * FROM label_classes WHERE id = ? AND project_id = ?'
  ).get(req.params.id, req.params.projectId);
  if (!existing) {
    return res.status(404).json({ error: 'Label class not found' });
  }

  const { name, color } = req.body;
  db.prepare('UPDATE label_classes SET name = ?, color = ? WHERE id = ?')
    .run(name || existing.name, color || existing.color, req.params.id);

  const label = db.prepare('SELECT * FROM label_classes WHERE id = ?').get(req.params.id);
  res.json(label);
});

// DELETE /api/projects/:projectId/labels/:id — delete label class
router.delete('/:id', (req, res) => {
  const existing = db.prepare(
    'SELECT * FROM label_classes WHERE id = ? AND project_id = ?'
  ).get(req.params.id, req.params.projectId);
  if (!existing) {
    return res.status(404).json({ error: 'Label class not found' });
  }

  db.prepare('DELETE FROM label_classes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
