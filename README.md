# Sixmo Form Skill

Автоматизация тестовой формы с https://sixmo.ru/ в виде переиспользуемого CLI + skill-обёртки для OpenClaw.

## Что умеет

- стартует новую сессию формы;
- ждёт, пока шаги перестанут быть `pending`;
- получает структуру шагов через API;
- заполняет поля по именам полей, а не по DOM-позиции;
- загружает файл на 2-м этапе;
- получает итоговый `finalIdentifier`.

## Почему это устойчиво

Форма специально меняет порядок полей и может задерживать открытие шагов. Этот инструмент не завязан на порядок DOM-элементов: он читает описание шага (`fields`) из API и собирает `FormData` динамически по `field.name`.

## Установка

```bash
npm install
```

## Запуск

```bash
node index.js examples/example-input.json
```

или через stdin:

```bash
cat payload.json | node index.js -
```

## Формат входа

```json
{
  "stepAnswers": {
    "1": {
      "logic_mode": "Букля",
      "orbital_path": "arc-lumen",
      "favorite_color": "Гриффиндор"
    },
    "2": {
      "shape_signal": "Платформа 9 3/4",
      "tempo_choice": "glide"
    }
  },
  "filePath": "examples/upload.txt",
  "fileName": "upload.txt",
  "fileMimeType": "text/plain"
}
```

## Dry run

Чтобы только получить структуру шагов без отправки формы:

```bash
node index.js examples/dry-run-input.json
```

## Пример результата

```json
{
  "ok": true,
  "flowId": "...",
  "result": {
    "ok": true,
    "flowId": "...",
    "finalIdentifier": "...",
    "completedAt": "..."
  }
}
```
