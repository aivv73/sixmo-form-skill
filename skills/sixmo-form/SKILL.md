---
name: sixmo-form
summary: Submit the Sixmo adaptive challenge form from structured input.
---

# Sixmo Form Skill

Use this skill when you need to complete the test form on https://sixmo.ru/ automatically and optionally upload a file on step 2.

## Input

Provide a JSON payload with:

- `stepAnswers.1` — answers for step 1 by field name
- `stepAnswers.2` — answers for step 2 by field name
- `filePath` — local file path for the upload field on step 2
- optional `fileName`, `fileMimeType`, `dryRun`

## Run

From the project root:

```bash
node index.js payload.json
```

or:

```bash
cat payload.json | node index.js -
```

## Notes

- The form order is unstable, so always match answers by `field.name`, not by visual order.
- This implementation uses the site API after creating a valid session and cookie pair.
- `dryRun: true` only discovers steps and fields, without submitting the form.
