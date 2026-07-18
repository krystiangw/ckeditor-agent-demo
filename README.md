# ClaimDesk — governed AI editing for insurance correspondence

**A demo where an AI agent drafts and reviews insurance claim letters in CKEditor 5 — and every single agent edit lands as a Track Changes suggestion a human must accept or reject.**

Built to demonstrate the full "CKEditor × AI agents" loop using two MCP servers:

- [`ckeditor-mcp`](https://github.com/krystiangw/ckeditor-mcp) *(runtime)* — the app's backend is an MCP **client** driving a real headless CKEditor 5 server-side: drafting, document ops, stats, and audit screenshots.
- [`ckeditor-integration-mcp`](https://github.com/krystiangw/ckeditor-integration-mcp) *(build-time)* — this app's frontend editor setup was **scaffolded and validated by MCP** during development; the proof is in [`docs/INTEGRATION_LOG.md`](./docs/INTEGRATION_LOG.md) and re-runnable via `npm run validate`.

## The user story

> **Marta** is a claims adjuster at a mid-size insurer. She writes ~30 near-identical
> claim response letters a day. Templates go stale, mandatory compliance phrases get
> missed — and legal forbids raw AI output from ever reaching a customer.
>
> In ClaimDesk she opens claim **KIN-2024-0847** and clicks **Draft response** — an
> agent composes the letter in a *server-side headless CKEditor* and it appears in her
> browser. She clicks **Compliance pass** — a missing mandatory disclosure and two
> forbidden phrasings appear as **suggestions**, each tagged with the rule that fired.
> She accepts two, rejects one. **Redact PII** catches the policy number and email.
> The audit trail records every agent action with a screenshot of the server-side
> editor. Nothing AI-authored ships without her sign-off.

**Why this shape:** "AI-first with governance" is precisely CKEditor's strategic
narrative — AI output as reviewable suggestions, not silent mutations — applied to
their flagship customer segment (regulated industries / insurance). This demo is that
strategy, running.

## Architecture

```
browser                     Express backend                 headless CKEditor 5
CKEditor 5 (CDN, premium) ⇄ MCP client ────── stdio ──────▶ (ckeditor-mcp server)
Track Changes = the         deterministic rule engine        set-content / insert-html
governance layer            (compliance, PII, plain lang.)   get-stats / screenshot
```

Design decisions worth noting:

- **Suggestions are materialized in the human's editor** (browser, Track Changes mode ON
  while the agent's edit plan is applied) — one source of suggestion state, no fragile
  adapter sync. The server-side MCP editor does the *content work*: drafting,
  table building, stats, and audit screenshots.
- **The agent is deterministic** (rule lexicons + templates) so the demo is fast and
  reproducible. The engine selector shows the extension point where a real LLM plugs in —
  swapping the planner, not the architecture.
- **Usage meter** (editor loads / agent ops / pending suggestions) mirrors CKEditor's
  own usage-based pricing model.

## Run it

```bash
# prerequisites: ../ckeditor-mcp cloned & built (npm install && npm run build)
npm install
cp .env.example .env      # paste your CKEditor license key (trial unlocks Track Changes)
npm start                 # http://localhost:4600
```

2-minute demo path: **Draft response** → **Compliance pass** → accept/reject the
suggestions → **Redact PII** → **Insert settlement table** → **Snapshot for audit** →
open **⚙ Built with** for the MCP-scaffolded-integration proof.

```bash
npm run validate          # re-run the ckeditor-integration-mcp check on this app
```

## License

MIT © Krystian Gwizdała. Demo project; not affiliated with CKSource / CKEditor.
