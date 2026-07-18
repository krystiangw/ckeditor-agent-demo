# Integration log — dogfooding ckeditor-integration-mcp

This app's CKEditor 5 setup was scaffolded and validated by
[ckeditor-integration-mcp](https://github.com/krystiangw/ckeditor-integration-mcp),
driven as an MCP client over stdio. Generated 2026-07-18; license key redacted.

## tools/list

```json
[
  {
    "name": "ckeditor-validate-setup",
    "title": "Validate a CKEditor 5 integration"
  },
  {
    "name": "ckeditor-scaffold-integration",
    "title": "Scaffold a CKEditor 5 integration"
  },
  {
    "name": "ckeditor-list-features",
    "title": "List CKEditor 5 features"
  }
]
```

## ckeditor-list-features

```json
{
  "latestVersion": "48.3.1",
  "features": [
    {
      "key": "headings",
      "plugin": "Heading",
      "premium": false,
      "cloud": false,
      "description": "Section headings (H1–H6)."
    },
    {
      "key": "lists",
      "plugin": "List",
      "premium": false,
      "cloud": false,
      "description": "Bulleted, numbered and to-do lists."
    },
    {
      "key": "links",
      "plugin": "Link",
      "premium": false,
      "cloud": false,
      "description": "Hyperlinks."
    },
    {
      "key": "tables",
      "plugin": "Table",
      "premium": false,
      "cloud": false,
      "description": "Tables with column/row/cell tools."
    },
    {
      "key": "images",
      "plugin": "Image",
      "premium": false,
      "cloud": false,
      "description": "Inline/block images (needs an upload adapter)."
    },
    {
      "key": "code-blocks",
      "plugin": "CodeBlock",
      "premium": false,
      "cloud": false,
      "description": "Fenced code blocks."
    },
    {
      "key": "format-painter",
      "plugin": "FormatPainter",
      "premium": true,
      "cloud": false,
      "description": "Copy formatting between selections."
    },
    {
      "key": "case-change",
      "plugin": "CaseChange",
      "premium": true,
      "cloud": false,
      "description": "Switch text case."
    },
    {
      "key": "track-changes",
      "plugin": "TrackChanges",
      "premium": true,
      "cloud": false,
      "description": "Suggestion mode / review changes."
    },
    {
      "key": "comments",
      "plugin": "Comments",
      "premium": true,
      "cloud": false,
      "description": "Inline comments."
    },
    {
      "key": "revision-history",
      "plugin": "RevisionHistory",
      "premium": true,
      "cloud": false,
      "description": "Named document revisions (needs an adapter)."
    },
    {
      "key": "export-pdf",
      "plugin": "ExportPdf",
      "premium": true,
      "cloud": true,
      "description": "Export to PDF (Cloud Services converter)."
    },
    {
      "key": "export-word",
      "plugin": "ExportWord",
      "premium": true,
      "cloud": true,
      "description": "Export to Word (Cloud Services converter)."
    },
    {
      "key": "import-word",
      "plugin": "ImportWord",
      "premium": true,
      "cloud": true,
      "description": "Import from Word (Cloud Services converter)."
    },
    {
      "key": "ai-assistant",
      "plugin": "AIAssistant",
      "premium": true,
      "cloud": false,
      "description": "In-editor AI assistant (bring your own model endpoint)."
    }
  ]
}
```

## ckeditor-scaffold-integration (vanilla-cdn)

```json
{
  "notes": [],
  "files": [
    "index.html"
  ]
}
```

## ckeditor-validate-setup (scaffold baseline)

```json
{
  "summary": {
    "errors": 0,
    "warnings": 0
  },
  "findings": [
    {
      "severity": "info",
      "rule": "ok",
      "message": "No integration issues detected in the provided snippet.",
      "fix": "Nothing to change — the setup follows the current CKEditor 5 integration model."
    }
  ]
}
```

## ckeditor-validate-setup (web/index.html)

```json
{
  "skipped": "web/index.html does not exist yet"
}
```

