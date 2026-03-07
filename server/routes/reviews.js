import { Router } from 'express';
import db from '../db.js';

const router = Router();

// GET /api/reviews/project/:projectId — list all review issues for project
router.get('/project/:projectId', (req, res) => {
  const severityOrder = `
    CASE severity
      WHEN 'error' THEN 1
      WHEN 'warning' THEN 2
      WHEN 'info' THEN 3
    END
  `;
  const issues = db.prepare(`
    SELECT * FROM review_issues
    WHERE project_id = ?
    ORDER BY ${severityOrder}, created_at DESC
  `).all(req.params.projectId);
  res.json(issues);
});

// PUT /api/reviews/:id — update issue status
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM review_issues WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Review issue not found' });
  }

  const { status } = req.body;
  if (!status || !['open', 'accepted', 'dismissed'].includes(status)) {
    return res.status(400).json({ error: 'Valid status is required: open, accepted, dismissed' });
  }

  db.prepare('UPDATE review_issues SET status = ? WHERE id = ?')
    .run(status, req.params.id);

  const issue = db.prepare('SELECT * FROM review_issues WHERE id = ?').get(req.params.id);
  res.json(issue);
});

// DELETE /api/reviews/:id — delete issue
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM review_issues WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Review issue not found' });
  }

  db.prepare('DELETE FROM review_issues WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// GET /api/reviews/stats/:projectId — issue counts by status
router.get('/stats/:projectId', (req, res) => {
  const stats = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open,
      SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted,
      SUM(CASE WHEN status = 'dismissed' THEN 1 ELSE 0 END) AS dismissed,
      COUNT(*) AS total
    FROM review_issues
    WHERE project_id = ?
  `).get(req.params.projectId);

  res.json({
    open: stats.open || 0,
    accepted: stats.accepted || 0,
    dismissed: stats.dismissed || 0,
    total: stats.total || 0,
  });
});

export default router;
