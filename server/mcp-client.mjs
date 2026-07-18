import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultMcpPath = resolve(repoRoot, '../ckeditor-mcp/dist/index.js');

let clientPromise;
let activeClient;

function makeClient() {
  return new Client({ name: 'claimdesk', version: '1.0.0' });
}

async function connectOnce() {
  const client = makeClient();
  const transport = new StdioClientTransport({
    command: 'node',
    args: [resolve(process.env.CKEDITOR_MCP_PATH || defaultMcpPath)],
    env: {
      ...process.env,
      CKEDITOR_LICENSE_KEY: process.env.CKEDITOR_LICENSE_KEY || 'GPL',
    },
  });

  await client.connect(transport);
  activeClient = client;
  return client;
}

async function connectWithRetry() {
  let firstError;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await connectOnce();
    } catch (error) {
      firstError ||= error;
      activeClient = undefined;
    }
  }

  throw firstError;
}

async function getClient() {
  if (!clientPromise) {
    clientPromise = connectWithRetry().catch((error) => {
      clientPromise = undefined;
      throw error;
    });
  }
  return clientPromise;
}

async function callOnce(name, args) {
  const client = await getClient();
  const result = await client.callTool({ name, arguments: args });

  if (result.isError) {
    const message = result.content?.find((item) => item.type === 'text')?.text;
    const error = new Error(message || `${name} failed`);
    error.toolError = true; // genuine tool failure — do not retry
    throw error;
  }

  return result.content || [];
}

/**
 * Call a ckeditor-mcp tool and return its raw MCP content array.
 * If the transport died mid-flight (child exited, pipe broke), the dead client
 * is discarded and the call retried once on a fresh connection. Tool-level
 * errors (isError results) are NOT retried — those are real failures.
 */
export async function callCk(name, args = {}) {
  try {
    return await callOnce(name, args);
  } catch (error) {
    if (error?.toolError) throw error;
    // Transport-level failure: drop the dead client and retry once.
    await closeCk().catch(() => {});
    return callOnce(name, args);
  }
}

// A promise-chain mutex: agent endpoints run multi-call sequences against ONE
// shared headless editor, so whole transactions must not interleave.
let queue = Promise.resolve();

/** Run `fn` exclusively — no other withEditorLock section runs concurrently. */
export function withEditorLock(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

export function mcpCallLog(...names) {
  return names.flat();
}

export async function closeCk() {
  const client = activeClient || (clientPromise ? await clientPromise.catch(() => undefined) : undefined);
  activeClient = undefined;
  clientPromise = undefined;
  await client?.close();
}
