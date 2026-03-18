# Sixmo Form Skill

Playwright-first автоматизация тестовой формы с https://sixmo.ru/ в виде CLI + skill-обёртки.

## Что делает

- открывает реальную веб-страницу в браузере;
- нажимает старт через UI;
- ждёт появления шагов, даже если они открываются с задержкой;
- находит поля по видимым `label`, а не по позиции в DOM;
- переживает перестановку элементов интерфейса;
- загружает файл на 2-м этапе через `input[type=file]`;
- получает итоговый результат на финальном экране.

## Почему это соответствует ТЗ

Это именно **browser automation**, а не вызов внутренних API-эндпоинтов напрямую.
Сценарий работает через интерфейс страницы и использует Playwright для взаимодействия с UI.

## Установка

```bash
npm install
npx playwright install chromium
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
      "orbital_path": "Хогвартс",
      "favorite_color": "Гриффиндор"
    },
    "2": {
      "shape_signal": "Платформа 9 3/4",
      "tempo_choice": "Снитч"
    }
  },
  "filePath": "examples/upload.txt",
  "headless": true,
  "tracePath": "artifacts/trace.zip",
  "finalScreenshotPath": "artifacts/result.png"
}
```

## Как работает устойчивость

Форма имеет плавающую DOM-структуру и случайный порядок полей. Поэтому автоматизация:

- не использует фиксированные CSS-классы;
- не полагается на порядок элементов;
- ищет элементы по тексту вопросов и связанным label/input;
- отдельно обрабатывает text/select/file-поля.

## CI

В репозитории можно добавить GitHub Actions для прогона на Ubuntu, где Playwright Chromium поднимается штатно.
