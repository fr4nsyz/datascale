import fetch, { Response } from 'node-fetch';

const TAILNET = process.env.TS_NET;
const API_KEY = process.env.TS_KEY;

if (!TAILNET) {
  throw new Error('TAILNET environment variable is not set.');
}

if (!API_KEY) {
  throw new Error('TS_KEY environment variable is not set.');
}

const BASE_URL = `https://api.tailscale.com/api/v2/tailnet/${TAILNET}`;
const DEVICE_BASE_URL = 'https://api.tailscale.com/api/v2/device'


interface Device {
  id: string;
  hostname: string;
  user: string;
  online: boolean;
}

interface DevicesResponse {
  devices: Device[];
}

export interface ACLRule {
  action: "accept" | "deny";
  users: string[];
  ports: string[];
}

export interface ACLConfig {
  acls: ACLRule[];
  groups?: Record<string, string[]>;
  hosts?: Record<string, string>;
}

async function api(path: string, options: any = {}): Promise<any> {
  const res: Response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API Error ${res.status}: ${text}`);
  }

  return res.json();
}

interface ACLState {
  policy: ACLConfig;
  etag: string;
}

export async function getACL(): Promise<ACLState> {
  const res = await fetch(`${BASE_URL}/acl`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: "application/json"
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ACL: ${res.status}`);
  }

  const etag = res.headers.get("etag");
  if (!etag) throw new Error("Missing ETag from ACL response");

  const policy = (await res.json()) as ACLConfig;

  return { policy, etag };
}

export async function listDevices(): Promise<void> {
  const data: DevicesResponse = await api('/devices');
  console.log('Devices in Tailnet:');
  data.devices.forEach(d => {
    console.log(`- ${d.hostname} (${d.id}) [${d.user}] - ${d.online ? 'online' : 'offline'}`);
  });
}

export async function removeDevice(deviceId: string): Promise<void> {
  const url: string = `${DEVICE_BASE_URL}/${deviceId}`;
  const res: Response = await fetch(url, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${API_KEY}` }
  });

  if (res.ok) console.log(`Device ${deviceId} removed successfully.`);
  else console.error(`Failed to remove device ${deviceId}: ${res.status} ${await res.text()}`);
}

export async function updateACL(
  policy: ACLConfig,
  etag: string
): Promise<void> {
  const res = await fetch(`${BASE_URL}/acl`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "If-Match": etag
    },
    body: JSON.stringify(policy)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ACL update failed: ${res.status} ${text}`);
  }
}

export async function removeUserFromGroup(user: string, group: string) {
  const { policy, etag } = await getACL();

  const key = `group:${group}`;
  if (!policy.groups?.[key]) return;

  policy.groups[key] = policy.groups[key].filter(u => u !== user);

  await updateACL(policy, etag);
}

export async function addUserToGroup(user: string, group: string) {
  const { policy, etag } = await getACL();

  const key = `group:${group}`;

  if (!policy.groups) policy.groups = {};
  if (!policy.groups[key]) policy.groups[key] = [];

  if (!policy.groups[key].includes(user)) {
    policy.groups[key].push(user);
  }

  await updateACL(policy, etag);
}

export async function listRoles() {
  const { policy } = await getACL();
  return policy.groups ?? {};
}

export async function getUserRoles(user: string) {
  const { policy } = await getACL();

  const roles: string[] = [];

  if (!policy.groups) return roles;

  for (const [group, users] of Object.entries(policy.groups)) {
    if (users.includes(user)) {
      roles.push(group.replace("group:", ""));
    }
  }

  return roles;
}

export async function revokeUser(user: string) {
  const { policy, etag } = await getACL();

  if (policy.groups) {
    for (const group of Object.keys(policy.groups)) {
      policy.groups[group] = policy.groups[group].filter(u => u !== user);
    }
  }

  await updateACL(policy, etag);

  // Remove their devices
  const data: DevicesResponse = await api('/devices');

  const devices = data.devices.filter(d => d.user === user);

  for (const d of devices) {
    await removeDevice(d.id);
  }
}
