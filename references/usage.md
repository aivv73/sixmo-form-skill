# Sixmo Form Usage

## Recommended run

Use the built-in browser tools first instead of the Node runner:

1. Navigate to `https://sixmo.ru/`.
2. Click `Начать задание`.
3. Wait through the intentional loading delay before each step appears.
4. Fill by visible question text:
   - `На какой факультет распределили Гарри Поттера?` -> `Гриффиндор`
   - `Как называется школа, в которой учились Гарри, Рон и Гермиона?` -> `Хогвартс`
   - `Как звали сову Гарри Поттера?` -> `Букля`
   - `Как называется платформа, с которой отправляется поезд в Хогвартс?` -> `Платформа 9 3/4`
   - `Какой из этих предметов связан с квиддичем?` -> `Снитч`
5. Upload `assets/examples/upload.txt`.
6. Submit and read the generated identifier from the result page.

## Fallback runner

If direct browser tools are unavailable, run the bundled CLI from the skill root:

```bash
node scripts/run-sixmo-form.js assets/examples/example-input.json
```

## Available example payloads

- `assets/examples/example-input.json` — default example
- `assets/examples/mcp-stable-input.json` — explicit MCP override example
- `assets/examples/executable-path-input.json` — example with `mcp.executablePath`
- `assets/examples/upload.txt` — sample upload file

## Input format

```json
{
  "stepAnswers": {
    "1": {
      "logic_mode": "Букля",
      "orbital_path": "Хогвартс",
      "favorite_color": "Гриффиндор"
    },
    "2": {
      "shape_signal": "Платформа 9 3/4",
      "tempo_choice": "Снитч"
    }
  },
  "filePath": "assets/examples/upload.txt",
  "timeoutMs": 60000
}
```

## Behavior notes

- The form is intentionally hostile to naive automation: delayed steps, random field order, floating DOM structure.
- Direct browser-tool execution is the primary path in Codex environments.
- The script finds fields by question text.
- For combobox fields, the script sets the value through DOM plus `input/change` events if needed.
- For action buttons, the script tries MCP click first and then falls back to DOM `el.click()`.

## Troubleshooting

### `pages: []`

If Chromium opens but MCP still reports `pages: []`, the problem is usually browser attachment rather than form logic.

Try:

- running the default example without custom `mcp` overrides first;
- using `mcp.executablePath` with a real browser path;
- using an already-running browser with remote debugging if your environment supports it.

### Direct shell works but Codex nested run fails

A nested coding-agent runtime may already have its own browser bridge. In that case, direct browser-tool execution should be used immediately, because a nested `node ...` wrapper that starts another MCP process can fail even when the browser tools themselves work.
