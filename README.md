# Sixmo Form Skill

- Это tool/skill для автопрохождения формы на `https://sixmo.ru/`.
- Основной путь выполнения — через реальный Chrome/Chromium и Developer MCP / browser tools.
- Сценарий учитывает delayed steps, случайный порядок полей и загрузку файла.
- CLI-раннер оставлен только как fallback, если прямые browser tools недоступны.

Для запуска через Codex:
- открой `chrome://inspect/#remote-debugging`;
- включи галочку для remote debugging / discover targets;
- запусти skill через Codex;
- согласись на запрос браузера о remote debugging, если Chrome/Chromium его покажет.

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
