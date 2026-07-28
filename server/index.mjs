import express from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callCk, closeCk, mcpCallLog, withEditorLock } from './mcp-client.mjs';
import { seedCase, mergeLetter } from './case-data.mjs';
import { buildPlan } from './rules.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = resolve(root, 'data');
const documentFile = resolve(dataDir, 'document.json');
const auditFile = resolve(dataDir, 'audit.json');
const externalPlanFile = resolve(dataDir, 'external-plan.json');

async function loadEnv() {
  try {
    const source = await readFile(resolve(root, '.env'), 'utf8');
    for (const line of source.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/);
      if (!match || match[1] in process.env) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

await loadEnv();

const app = express();
app.use(express.json({ limit: '8mb' }));

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function textContent(content, toolName) {
  const item = content.find((part) => part.type === 'text');
  if (!item?.text) throw new Error(`${toolName} returned no text content`);
  return item.text;
}

function imageContent(content, toolName) {
  const item = content.find((part) => part.type === 'image');
  if (!item?.data) throw new Error(`${toolName} returned no image content`);
  return `data:${item.mimeType || 'image/png'};base64,${item.data}`;
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(path, value) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function agentRoute(handler) {
  return async (req, res) => {
    try {
      // Each endpoint runs a multi-call sequence against ONE shared headless
      // editor — the lock keeps concurrent transactions from interleaving.
      await withEditorLock(() => handler(req, res));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: messageOf(error) });
    }
  };
}

app.get('/api/config', (_req, res) => {
  res.json({ licenseKey: process.env.CKEDITOR_LICENSE_KEY || 'GPL' });
});

app.get('/api/case', (_req, res) => {
  res.json(seedCase);
});

app.get('/api/document', async (_req, res) => {
  try {
    res.json(await readJson(documentFile, { html: '', savedAt: null }));
  } catch (error) {
    res.status(500).json({ error: messageOf(error) });
  }
});

app.put('/api/document', async (req, res) => {
  try {
    if (typeof req.body?.html !== 'string') return res.status(400).json({ error: 'html must be a string' });
    const document = { html: req.body.html, savedAt: new Date().toISOString() };
    await writeJson(documentFile, document);
    res.json(document);
  } catch (error) {
    res.status(500).json({ error: messageOf(error) });
  }
});

app.get('/api/audit', async (_req, res) => {
  try {
    res.json(await readJson(auditFile, []));
  } catch (error) {
    res.status(500).json({ error: messageOf(error) });
  }
});

app.post('/api/audit', async (req, res) => {
  try {
    const { actor, action, thumb } = req.body || {};
    if (typeof actor !== 'string' || typeof action !== 'string') {
      return res.status(400).json({ error: 'actor and action are required' });
    }
    const entries = await readJson(auditFile, []);
    const entry = { ts: new Date().toISOString(), actor, action, ...(thumb ? { thumb } : {}) };
    entries.unshift(entry);
    await writeJson(auditFile, entries);
    res.status(201).json(entry);
  } catch (error) {
    res.status(500).json({ error: messageOf(error) });
  }
});

function validatePlanStep(step) {
  if (!step || typeof step !== 'object') return 'each plan step must be an object';
  if (step.kind === 'replace') {
    if (typeof step.find !== 'string' || !step.find) return 'replace step requires a non-empty find string';
    if (typeof step.replacement !== 'string') return 'replace step requires a replacement string';
    return null;
  }
  if (step.kind === 'insertParagraphBefore') {
    if (typeof step.anchor !== 'string' || !step.anchor) return 'insertParagraphBefore step requires a non-empty anchor';
    if (typeof step.html !== 'string' || !step.html) return 'insertParagraphBefore step requires html';
    return null;
  }
  return `unknown step kind: ${String(step.kind)}`;
}

// External agents (e.g. an MCP-driven CLI agent) submit proposed changes here
// instead of overwriting the document — the browser applies them as Track
// Changes suggestions so a human accepts or rejects each one.
// All plan reads/writes go through one promise chain: the check-then-write
// pairs below must not interleave across concurrent requests.
let planLock = Promise.resolve();
function withPlanLock(fn) {
  const run = planLock.then(fn, fn);
  planLock = run.catch(() => {});
  return run;
}

// A claimed plan whose consumer died (closed tab, lost response) becomes
// claimable again once its lease expires, so proposals are never lost.
const CLAIM_LEASE_MS = 30_000;
function leaseExpired(entry) {
  return Date.now() - Date.parse(entry.claimedAt || 0) > CLAIM_LEASE_MS;
}
function isClaimable(entry) {
  if (!entry) return false;
  if (entry.status === 'pending') return true;
  return entry.status === 'claimed' && leaseExpired(entry);
}

app.post('/api/agent/external-plan', async (req, res) => {
  try {
    const { plan, summary, actor } = req.body || {};
    if (!Array.isArray(plan) || plan.length === 0) {
      return res.status(400).json({ error: 'plan must be a non-empty array' });
    }
    for (const step of plan) {
      const problem = validatePlanStep(step);
      if (problem) return res.status(400).json({ error: problem });
    }
    await withPlanLock(async () => {
      const pending = await readJson(externalPlanFile, null);
      const busy = pending
        && (pending.status === 'pending' || (pending.status === 'claimed' && !leaseExpired(pending)));
      if (busy) {
        res.status(409).json({ error: 'a pending plan already exists — wait until it is consumed' });
        return;
      }
      const entry = {
        id: randomUUID(),
        actor: typeof actor === 'string' && actor ? actor : 'External agent',
        summary: typeof summary === 'string' ? summary : '',
        plan,
        createdAt: new Date().toISOString(),
        status: 'pending',
      };
      await writeJson(externalPlanFile, entry);
      res.status(201).json(entry);
    });
  } catch (error) {
    res.status(500).json({ error: messageOf(error) });
  }
});

app.get('/api/agent/external-plan', async (_req, res) => {
  try {
    const entry = await readJson(externalPlanFile, null);
    res.json(isClaimable(entry) ? entry : null);
  } catch (error) {
    res.status(500).json({ error: messageOf(error) });
  }
});

// Exclusive, leased claim: exactly one consumer wins; if it dies before the
// final ack, the lease expires and the plan becomes claimable again.
app.post('/api/agent/external-plan/:id/claim', async (req, res) => {
  try {
    await withPlanLock(async () => {
      const entry = await readJson(externalPlanFile, null);
      if (!entry || entry.id !== req.params.id) {
        res.status(404).json({ error: 'plan not found' });
        return;
      }
      if (!isClaimable(entry)) {
        res.status(409).json({ error: `plan not claimable (status: ${entry.status})` });
        return;
      }
      entry.status = 'claimed';
      entry.claimedAt = new Date().toISOString();
      await writeJson(externalPlanFile, entry);
      res.json(entry);
    });
  } catch (error) {
    res.status(500).json({ error: messageOf(error) });
  }
});

app.post('/api/agent/external-plan/:id/ack', async (req, res) => {
  try {
    await withPlanLock(async () => {
      const entry = await readJson(externalPlanFile, null);
      if (!entry || entry.id !== req.params.id) {
        res.status(404).json({ error: 'plan not found' });
        return;
      }
      if (entry.status !== 'claimed') {
        res.status(409).json({ error: `plan is ${entry.status}, expected claimed` });
        return;
      }
      entry.status = 'consumed';
      entry.consumedAt = new Date().toISOString();
      await writeJson(externalPlanFile, entry);
      res.json(entry);
    });
  } catch (error) {
    res.status(500).json({ error: messageOf(error) });
  }
});

app.post('/api/agent/draft', agentRoute(async (_req, res) => {
  const names = mcpCallLog(
    'ckeditor-set-content',
    'ckeditor-get-content',
    'ckeditor-get-stats',
    'ckeditor-screenshot',
  );
  const draft = mergeLetter(seedCase);
  await callCk(names[0], { html: draft });
  const html = textContent(await callCk(names[1]), names[1]);
  const statsText = textContent(await callCk(names[2]), names[2]);
  const screenshot = imageContent(await callCk(names[3]), names[3]);
  let stats;
  try {
    stats = JSON.parse(statsText);
  } catch {
    stats = { raw: statsText };
  }
  res.json({ html, stats, screenshot, mcpCalls: names });
}));

app.post('/api/agent/review', agentRoute(async (req, res) => {
  const { html, mode } = req.body || {};
  if (typeof html !== 'string') return res.status(400).json({ error: 'html must be a string' });
  if (!['compliance', 'pii', 'plain'].includes(mode)) {
    return res.status(400).json({ error: 'mode must be compliance, pii, or plain' });
  }
  const plan = buildPlan(html, mode);
  const mcpCalls = mcpCallLog('ckeditor-get-stats');
  await callCk(mcpCalls[0]);
  res.json({ plan, mcpCalls });
}));

app.post('/api/agent/table', agentRoute(async (req, res) => {
  const currentHtml = req.body?.html;
  if (typeof currentHtml !== 'string') return res.status(400).json({ error: 'html must be a string' });
  const netPayment = seedCase.approvedAmount - seedCase.deductible;
  const rows = [
    ['Claim amount', seedCase.claimAmount],
    ['Deductible', seedCase.deductible],
    ['Approved payout', seedCase.approvedAmount],
    ['Net payment', netPayment],
  ];
  const money = (amount) => `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  const table = `<figure class="table"><table><thead><tr><th>Settlement item</th><th>Amount</th></tr></thead><tbody>${rows
    .map(([label, amount]) => `<tr><td>${label}</td><td>${money(amount)}</td></tr>`)
    .join('')}</tbody></table></figure>`;
  const mcpCalls = mcpCallLog('ckeditor-set-content', 'ckeditor-insert-html', 'ckeditor-get-content');
  await callCk(mcpCalls[0], { html: currentHtml });
  await callCk(mcpCalls[1], { html: table, position: 'end' });
  const html = textContent(await callCk(mcpCalls[2]), mcpCalls[2]);
  res.json({ html, mcpCalls });
}));

app.post('/api/agent/snapshot', agentRoute(async (req, res) => {
  const html = req.body?.html;
  if (typeof html !== 'string') return res.status(400).json({ error: 'html must be a string' });
  const mcpCalls = mcpCallLog('ckeditor-set-content', 'ckeditor-screenshot');
  await callCk(mcpCalls[0], { html });
  const screenshot = imageContent(await callCk(mcpCalls[1]), mcpCalls[1]);
  res.json({ screenshot, mcpCalls });
}));

app.use('/docs', express.static(resolve(root, 'docs'), { index: false, fallthrough: false }));
app.use(express.static(resolve(root, 'web')));

const port = Number(process.env.PORT) || 4600;
const server = app.listen(port, () => {
  console.log(`ClaimDesk listening at http://localhost:${port}`);
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(async () => {
    await closeCk().catch(console.error);
    process.exit(signal ? 0 : undefined);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('beforeExit', () => closeCk().catch(console.error));
