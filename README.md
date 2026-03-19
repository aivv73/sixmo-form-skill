# Sixmo Form Skill

Проект перестроен под skill-layout:

```text
sixmo-form-skill/
├── SKILL.md
├── scripts/
│   └── run-sixmo-form.js
├── references/
│   └── usage.md
├── assets/
│   └── examples/
│       ├── example-input.json
│       ├── mcp-stable-input.json
│       ├── executable-path-input.json
│       └── upload.txt
├── agents/
│   └── openai.yaml
├── package.json
└── package-lock.json
```

## Основной запуск

Из корня проекта:

```bash
node scripts/run-sixmo-form.js assets/examples/example-input.json
```

или:

```bash
cat payload.json | node scripts/run-sixmo-form.js -
```

## Где что лежит

- `SKILL.md` — metadata + инструкции skill
- `scripts/` — исполняемый код
- `references/` — документация и troubleshooting
- `assets/` — примеры payload и файл для upload
- `agents/openai.yaml` — metadata для agent-oriented layout

Подробности по запуску и проблемам среды: `references/usage.md`.
