---
name: sixmo-form
summary: Complete the Sixmo adaptive web form through the browser UI with Playwright.
---

# Sixmo Form Skill

Use this skill when you need to complete the test form on https://sixmo.ru/ automatically through the actual browser interface.

## Input

Provide JSON with:

- `stepAnswers.1` — answers for step 1
- `stepAnswers.2` — answers for step 2
- `filePath` — local file path for upload on step 2
- optional `headless`, `tracePath`, `finalScreenshotPath`, `timeoutMs`

## Run

```bash
node index.js payload.json
```

or:

```bash
cat payload.json | node index.js -
```

## Notes

- This implementation is Playwright-first and interacts with the UI, not direct private API calls.
- It matches fields by visible question labels, so random field order does not break the scenario.
- It supports text fields, selects, and file upload.
