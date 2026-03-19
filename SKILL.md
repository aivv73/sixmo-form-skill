---
name: sixmo-form
description: Complete the Sixmo adaptive web form through the real browser UI. Use when filling, testing, automating, or validating https://sixmo.ru/, especially the multi-step form with delayed step loading, random field order, select fields, and file upload. Prefer this skill for browser-driven completion instead of direct API calls.
---

# Sixmo Form

Use this skill to complete the form on `https://sixmo.ru/` through the real browser UI.

## Structure

- `scripts/run-sixmo-form.js` — executable CLI implementation
- `references/usage.md` — usage notes, troubleshooting, and behavior details
- `assets/examples/` — example payloads
- `assets/examples/upload.txt` — sample upload file
- `agents/openai.yaml` — agent metadata

## Default workflow

1. Run the CLI from the skill root:
   ```bash
   node scripts/run-sixmo-form.js assets/examples/example-input.json
   ```
2. If stdin is preferred:
   ```bash
   cat payload.json | node scripts/run-sixmo-form.js -
   ```
3. Read `references/usage.md` when you need troubleshooting or environment notes.

## Notes

- Match fields by visible question text, not DOM position.
- Handle text fields, select/combobox fields, and file upload separately.
- Prefer the default example input before adding custom MCP overrides.
- If the environment already exposes browser tools directly, those may be more reliable than starting a nested browser MCP from inside another coding agent runtime.
