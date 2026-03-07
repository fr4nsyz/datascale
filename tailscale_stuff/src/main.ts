import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { listDevices, removeDevice, getACL, updateACL, removeUserFromGroup, ACLConfig } from './tail_admin';

const app = express();
app.use(express.json());

const PORT = process.env.ADMIN_PORT || 4000;

// --- Simple auth middleware ---
// For now, just read a Tailscale user header; can later check groups/roles
app.use((req, res, next) => {
  req.user = req.headers['tailscale-user-login'] || 'local-user';
  next();
});

// GET /devices — list all devices
app.get('/devices', async (_req, res) => {
  try {
    const devices = await listDevices();
    res.json({ success: true, devices });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /devices/:id — remove a device
app.delete('/devices/:id', async (req, res) => {
  try {
    await removeDevice(req.params.id);
    res.json({ success: true, message: `Device ${req.params.id} removed.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /acls — get current ACL
app.get('/acls', async (_req, res) => {
  try {
    const { policy } = await getACL();
    res.json({ success: true, policy });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /acls — replace entire ACL
app.post('/acls', async (req, res) => {
  try {
    const policy: ACLConfig = req.body;
    const { etag } = await getACL();
    await updateACL(policy, etag);
    res.json({ success: true, message: 'ACL updated.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /acls/groups/:group/remove — remove a user from a group
app.post('/acls/groups/:group/remove', async (req, res) => {
  try {
    const { user } = req.body;
    if (!user) return res.status(400).json({ success: false, error: 'Missing user in body' });
    await removeUserFromGroup(user, req.params.group);
    res.json({ success: true, message: `Removed ${user} from group ${req.params.group}` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Health check ---
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Tailnet Admin API running at http://localhost:${PORT}`);
});
