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

1. Prefer the built-in browser tools immediately:
   - open `https://sixmo.ru/`;
   - click `Начать задание`;
   - wait for each delayed step to load;
   - match fields by visible question text, not DOM position;
   - fill step 1 with `Гриффиндор`, `Хогвартс`, `Букля`;
   - fill step 2 with `Платформа 9 3/4`, `Снитч`, and upload `assets/examples/upload.txt`;
   - submit and capture the generated identifier from the result page.
2. Use `scripts/run-sixmo-form.js` only as a fallback when direct browser tools are unavailable:
   ```bash
   node scripts/run-sixmo-form.js assets/examples/example-input.json
   ```
3. If stdin is preferred for the fallback runner:
   ```bash
   cat payload.json | node scripts/run-sixmo-form.js -
   ```
4. Read `references/usage.md` when you need troubleshooting or environment notes.

## Notes

- Match fields by visible question text, not DOM position.
- Handle text fields, select/combobox fields, and file upload separately.
- Prefer direct browser-tool execution over starting a nested MCP/browser process.
- Use the default example input only for the fallback runner before adding custom MCP overrides.
