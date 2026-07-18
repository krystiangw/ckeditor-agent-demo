# ClaimDesk — demo spec (v1)

Insurance claims correspondence workbench. An AI agent drafts and reviews claim
letters; every agent edit lands as a **Track Changes suggestion** a human must
accept or reject. Governance-first AI editing, built on CKEditor 5.

## Architecture

```
browser (web/)  ──HTTP──  Express (server/)  ──MCP stdio──  ckeditor-mcp (headless CKEditor 5)
CKEditor 5 CDN                                               at ../ckeditor-mcp/dist/index.js
Track Changes UI
```

- **Runtime MCP (`ckeditor-mcp`)** does the heavy document work server-side:
  drafting (set-content), content normalization (get-content), stats
  (get-stats), audit screenshots (screenshot).
- **Compliance/PII rules** run server-side (deterministic rule engine) and
  return an *edit plan*; the frontend applies each step through the browser
  editor's commands with `trackChanges` mode ON → native suggestions.
- Documents persist as CKEditor-native HTML in `data/*.json`.

## Files

```
server/index.mjs          Express app (static web/ + API)
server/mcp-client.mjs     lazy singleton MCP client -> ckeditor-mcp over stdio
server/rules.mjs          deterministic compliance/PII/plain-language rule engine
server/case-data.mjs      seed case (claim KIN-2024-0847) + letter template
web/index.html            3-column UI, CKEditor 5 CDN 48.3.1 (core+premium UMD)
web/app.js                editor boot, task buttons, edit-plan applier, audit UI
web/style.css             layout (left case rail / center editor / right agent rail)
```

## API

- `GET /api/config` → `{ licenseKey }` (from env `CKEDITOR_LICENSE_KEY`, fallback `'GPL'`).
- `GET /api/case` → seed case data (id, claimant, policy, amounts, status).
- `GET /api/document` / `PUT /api/document` → `{ html, savedAt }` persisted to `data/document.json`.
- `POST /api/agent/draft` → server merges template+case, calls MCP `ckeditor-set-content`,
  then `ckeditor-get-content` + `ckeditor-get-stats` + `ckeditor-screenshot`;
  returns `{ html, stats, screenshot (dataURL), mcpCalls: [names...] }`.
- `POST /api/agent/review` body `{ html, mode: 'compliance'|'pii'|'plain' }` →
  runs rule engine on the HTML, returns `{ plan: EditStep[], mcpCalls }`.
  Also calls MCP `ckeditor-get-stats` on the html (real call for the log).
- `POST /api/agent/table` → builds settlement table HTML from case data, calls MCP
  `ckeditor-insert-html` (position end) on current doc html sent in body; returns
  `{ html, mcpCalls }`.
- `POST /api/agent/snapshot` body `{ html }` → MCP set-content + screenshot →
  returns `{ screenshot }`; frontend appends to audit trail.
- `GET /api/audit` / `POST /api/audit` → audit entries `{ ts, actor, action, thumb? }`
  persisted to `data/audit.json`.

## EditStep (edit plan) shape

```js
{ kind: 'replace', find: 'we guarantee', replacement: 'we expect', ruleId: 'COMP-03',
  reason: 'Absolute commitments are forbidden in claim correspondence.' }
{ kind: 'insertParagraphBefore', anchor: 'Sincerely', html: '<p>...disclosure...</p>',
  ruleId: 'COMP-01', reason: 'Mandatory fraud disclosure missing.' }
```

Rules (server/rules.mjs), all deterministic:
- COMP-01: mandatory disclosure paragraph present? (search for marker phrase) → insert if missing.
- COMP-02/03: forbidden phrases lexicon → replacement suggestions
  ("we guarantee"→"we expect", "no fault of ours"→"our review indicates", "final and non-negotiable"→"our current assessment").
- PII-01: policy numbers (`PL-\d{6}`), emails, SSN-shaped `\d{3}-\d{2}-\d{4}` → replace with `[REDACTED]`.
- PLAIN-01: jargon dictionary ("subrogation"→"recovery from the responsible party", "indemnification"→"compensation", "pursuant to"→"under").

## Frontend behavior

- Boot CKEditor from CDN UMD (core + premium), plugins incl. TrackChanges, Comments,
  FormatPainter + the usual (Heading, List, Link, Table, Bold, Italic, Essentials, Paragraph).
  **After create: set up Users plugin — addUser({id:'agent', name:'Claims Agent (AI)'}),
  addUser({id:'marta', name:'M. Kowalska'}), defineMe('marta')** (required for TrackChanges).
- Applying an edit plan: for each step — enable `trackChanges` command as user 'agent'
  is not possible client-side (me=marta), so: **before applying agent steps call
  `editor.execute('trackChanges')` to turn suggestion mode ON**, apply steps via
  `editor.model.change` + findText→replace (build ranges by searching the model for the
  target string; use editor.execute('input')/model writer ops so TrackChanges intercepts),
  then turn suggestion mode OFF. Practical approach for replace: use the built-in
  FindAndReplace plugin commands (`editor.execute('find', text)` then `editor.execute('replace'/'replaceAll', ...)`)
  while trackChanges is on — replacements become suggestions. For inserts: place selection
  at anchor and `model.insertContent` a parsed fragment while trackChanges on.
- Right rail: task buttons (Draft response · Compliance pass · Redact PII ·
  Plain-language rewrite · Insert settlement table · Snapshot for audit),
  engine selector `Deterministic rules ▾` (option "Claude API" visible, disabled,
  title="extension point"), live activity log (each API/MCP call appended),
  usage meter: `Editor loads: N · Agent ops: N · Suggestions pending: N`
  (suggestions count from TrackChanges plugin: `editor.plugins.get('TrackChanges')` markers
  or count of `.ck-suggestion` annotations — simplest reliable source).
- Left rail: case card (claim id, claimant, policy, amount, status chip) + audit trail
  list with screenshot thumbnails (click → lightbox overlay).
- "⚙ Built with" footer link → modal rendering docs/INTEGRATION_LOG.md summary
  (fetch as text, show the validate-setup section) — the MCP-B dogfood proof.

## Constraints

- No external LLM calls. No build step (plain JS, ES modules OK in browser).
- License key NEVER hardcoded — fetched from `/api/config`.
- `npm start` runs server on PORT (default 4600). `npm run validate` runs
  scripts/dogfood-integration.mjs (already exists — do not modify).
- ckeditor-mcp path: env `CKEDITOR_MCP_PATH` fallback `../ckeditor-mcp/dist/index.js`
  (resolve relative to repo root). Pass `CKEDITOR_LICENSE_KEY` through to its env.
- Keep the MCP client a lazy singleton; reconnect on failure once.
- Errors: agent endpoints return 500 with `{ error }`; frontend shows toast + logs.

## Acceptance (verified by running)

1. `npm start` → page loads, editor boots licensed (no license errors in console).
2. "Draft response" fills the editor with the merged letter; audit gets an entry
   with a server-side screenshot; activity log lists real MCP calls.
3. "Compliance pass" on the drafted letter produces ≥3 pending Track Changes
   suggestions (1 inserted disclosure + ≥2 phrase replacements); each is
   accept/rejectable via the native UI; suggestions-pending counter updates.
4. "Redact PII" produces replacement suggestions for the seeded policy number/email.
5. "Insert settlement table" adds a table with case line items (via MCP insert-html).
6. Accept/reject works; "Save" persists; reload restores the saved document.
7. Usage meter counts editor loads (1 per boot) and agent ops (1 per API call).
