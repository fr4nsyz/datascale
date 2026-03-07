import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsBase = path.join(__dirname, '..', '..', 'uploads');

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const projectDir = path.join(uploadsBase, req.params.projectId);
    fs.mkdirSync(projectDir, { recursive: true });
    cb(null, projectDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = uuidv4() + ext;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|bmp|webp|tiff?)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

/**
 * Try to read image dimensions from file header bytes.
 * Supports PNG and JPEG. Returns { width, height } or { width: 0, height: 0 }.
 */
function getImageDimensions(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(32);
    fs.readSync(fd, header, 0, 32, 0);

    // PNG: bytes 16-23 contain width and height as 4-byte big-endian
    if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) {
      const width = header.readUInt32BE(16);
      const height = header.readUInt32BE(20);
      fs.closeSync(fd);
      return { width, height };
    }

    // JPEG: need to scan for SOF markers
    if (header[0] === 0xFF && header[1] === 0xD8) {
      const buf = Buffer.alloc(64 * 1024);
      fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);

      let offset = 2;
      while (offset < buf.length - 9) {
        if (buf[offset] !== 0xFF) break;
        const marker = buf[offset + 1];
        // SOF markers: C0-C3, C5-C7, C9-CB, CD-CF
        if (
          (marker >= 0xC0 && marker <= 0xC3) ||
          (marker >= 0xC5 && marker <= 0xC7) ||
          (marker >= 0xC9 && marker <= 0xCB) ||
          (marker >= 0xCD && marker <= 0xCF)
        ) {
          const height = buf.readUInt16BE(offset + 5);
          const width = buf.readUInt16BE(offset + 7);
          return { width, height };
        }
        const segLen = buf.readUInt16BE(offset + 2);
        offset += 2 + segLen;
      }
      return { width: 0, height: 0 };
    }

    fs.closeSync(fd);
  } catch {
    // Fall through
  }
  return { width: 0, height: 0 };
}

const router = Router({ mergeParams: true });

// GET /api/projects/:projectId/images — list images for a project
router.get('/', (req, res) => {
  const images = db.prepare(`
    SELECT i.*,
      (SELECT COUNT(*) FROM annotations WHERE image_id = i.id) AS annotation_count
    FROM images i
    WHERE i.project_id = ?
    ORDER BY i.created_at DESC
  `).all(req.params.projectId);
  res.json(images);
});

// POST /api/projects/:projectId/images/upload — upload image(s)
router.post('/upload', upload.array('images', 50), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const now = new Date().toISOString();
  const insertStmt = db.prepare(`
    INSERT INTO images (id, project_id, filename, original_name, width, height, uploaded_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const inserted = [];
  const insertAll = db.transaction((files) => {
    for (const file of files) {
      const id = uuidv4();
      const dims = getImageDimensions(file.path);
      insertStmt.run(
        id,
        req.params.projectId,
        file.filename,
        file.originalname,
        dims.width,
        dims.height,
        req.user || 'local-user',
        now
      );
      inserted.push({
        id,
        project_id: req.params.projectId,
        filename: file.filename,
        original_name: file.originalname,
        width: dims.width,
        height: dims.height,
        uploaded_by: req.user || 'local-user',
        created_at: now,
      });
    }
  });

  insertAll(req.files);
  res.status(201).json(inserted);
});

// GET /api/projects/:projectId/images/:id — get single image with annotations
router.get('/:id', (req, res) => {
  const image = db.prepare('SELECT * FROM images WHERE id = ? AND project_id = ?')
    .get(req.params.id, req.params.projectId);
  if (!image) {
    return res.status(404).json({ error: 'Image not found' });
  }

  const annotations = db.prepare(
    'SELECT * FROM annotations WHERE image_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);

  res.json({ ...image, annotations });
});

// DELETE /api/projects/:projectId/images/:id — delete image and annotations
router.delete('/:id', (req, res) => {
  const image = db.prepare('SELECT * FROM images WHERE id = ? AND project_id = ?')
    .get(req.params.id, req.params.projectId);
  if (!image) {
    return res.status(404).json({ error: 'Image not found' });
  }

  // Delete file from disk
  const filePath = path.join(uploadsBase, req.params.projectId, image.filename);
  try {
    fs.unlinkSync(filePath);
  } catch {
    // File may already be gone
  }

  db.prepare('DELETE FROM images WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
