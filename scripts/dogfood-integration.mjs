/**
 * Dogfood script: this app's CKEditor integration is bootstrapped and checked
 * by the ckeditor-integration-mcp server, driven as a real MCP client over
 * stdio. Every call and result is logged to docs/INTEGRATION_LOG.md as proof.
 *
 * Run: CKEDITOR_LICENSE_KEY=... node scripts/dogfood-integration.mjs
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INTEGRATION_MCP = resolve(root, '../ckeditor-integration-mcp/dist/index.js');
const licenseKey = process.env.CKEDITOR_LICENSE_KEY || 'GPL';

const log = [];
function record(title, payload) {
  log.push(`## ${title}\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n`);
}

const client = new Client({ name: 'ckeditor-agent-demo-dogfood', version: '0.1.0' });
await client.connect(new StdioClientTransport({ command: 'node', args: [INTEGRATION_MCP] }));

// 1. Discover what the server can do.
const tools = await client.listTools();
record('tools/list', tools.tools.map((t) => ({ name: t.name, title: t.title })));

// 2. What features exist?
const features = await client.callTool({ name: 'ckeditor-list-features', arguments: {} });
record('ckeditor-list-features', JSON.parse(features.content[0].text));

// 3. Scaffold this app's editor page.
const wanted = ['headings', 'lists', 'links', 'tables', 'track-changes', 'comments', 'format-painter'];
const scaffoldRes = await client.callTool({
  name: 'ckeditor-scaffold-integration',
  arguments: { framework: 'vanilla-cdn', features: wanted, licenseKey },
});
const scaffold = JSON.parse(scaffoldRes.content[0].text);
record('ckeditor-scaffold-integration (vanilla-cdn)', { notes: scaffold.notes, files: Object.keys(scaffold.files) });

await mkdir(resolve(root, 'web'), { recursive: true });
// The committed baseline is a reference artifact — never commit the real key.
await writeFile(
  resolve(root, 'web/scaffold-baseline.html'),
  scaffold.files['index.html'].replaceAll(licenseKey, '<license-key>'),
);

// 4. Validate the scaffold we just received (should be clean).
const validation = await client.callTool({
  name: 'ckeditor-validate-setup',
  arguments: { code: scaffold.files['index.html'] },
});
record('ckeditor-validate-setup (scaffold baseline)', JSON.parse(validation.content[0].text));

// 5. If the real app page already exists, validate that too — the ongoing check.
try {
  const appPage = await readFile(resolve(root, 'web/index.html'), 'utf8');
  const appValidation = await client.callTool({
    name: 'ckeditor-validate-setup',
    arguments: { code: appPage },
  });
  record('ckeditor-validate-setup (web/index.html)', JSON.parse(appValidation.content[0].text));
} catch {
  record('ckeditor-validate-setup (web/index.html)', { skipped: 'web/index.html does not exist yet' });
}

await client.close();

const doc = `# Integration log — dogfooding ckeditor-integration-mcp

This app's CKEditor 5 setup was scaffolded and validated by
[ckeditor-integration-mcp](https://github.com/krystiangw/ckeditor-integration-mcp),
driven as an MCP client over stdio. Generated ${new Date().toISOString().slice(0, 10)}; license key redacted.

${log.join('\n')}
`;
await writeFile(resolve(root, 'docs/INTEGRATION_LOG.md'), doc.replaceAll(licenseKey, '<license-key>'));
console.log('dogfood complete -> docs/INTEGRATION_LOG.md, web/scaffold-baseline.html');
