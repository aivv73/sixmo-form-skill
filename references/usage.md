# Sixmo Form Usage

## Recommended run

From the skill root:

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

A nested coding-agent runtime may already have its own browser bridge. In that case, direct browser-tool execution can work while a nested `node ...` wrapper that starts another MCP process can fail.
