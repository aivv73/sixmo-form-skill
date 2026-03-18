#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { z } = require('zod');

const InputSchema = z.object({
  baseUrl: z.string().url().default('https://sixmo.ru/'),
  headless: z.boolean().default(true),
  slowMo: z.number().int().nonnegative().default(0),
  timeoutMs: z.number().int().positive().default(45000),
  executablePath: z.string().optional(),
  tracePath: z.string().optional(),
  screenshotPath: z.string().optional(),
  finalScreenshotPath: z.string().optional(),
  stepAnswers: z.object({
    1: z.record(z.string(), z.string()).default({}),
    2: z.record(z.string(), z.string()).default({}),
  }).default({ 1: {}, 2: {} }),
  filePath: z.string().optional(),
  fileName: z.string().optional(),
  fileMimeType: z.string().default('text/plain'),
});

const QUESTION_MAP = [
  { key: 'logic_mode', match: [/Как звали сову Гарри Поттера/i] },
  { key: 'orbital_path', match: [/Как называется школа, в которой учились Гарри, Рон и Гермиона/i] },
  { key: 'favorite_color', match: [/На какой факультет распределили Гарри Поттера/i] },
  { key: 'shape_signal', match: [/Как называется платформа, с которой отправляется поезд в Хогвартс/i] },
  { key: 'tempo_choice', match: [/Какой из этих предметов связан с квиддичем/i] },
  { key: 'artifact_file', match: [/Загрузите небольшой текстовый файл/i] },
];

const DEFAULT_ANSWERS = {
  logic_mode: 'Букля',
  orbital_path: 'Хогвартс',
  favorite_color: 'Гриффиндор',
  shape_signal: 'Платформа 9 3/4',
  tempo_choice: 'Снитч',
};

async function readJsonInput() {
  const arg = process.argv[2];
  if (!arg || arg === '-') {
    const stdin = await new Promise((resolve, reject) => {
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => (data += chunk));
      process.stdin.on('end', () => resolve(data));
      process.stdin.on('error', reject);
    });
    return stdin.trim() ? JSON.parse(stdin) : {};
  }
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), arg), 'utf8'));
}

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function getLogicalKey(labelText) {
  const text = normalizeText(labelText);
  const entry = QUESTION_MAP.find((item) => item.match.some((re) => re.test(text)));
  return entry ? entry.key : null;
}

function getAnswer(key, stepAnswers) {
  return stepAnswers[key] ?? DEFAULT_ANSWERS[key] ?? '';
}

async function addStealth(context) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU', 'ru', 'en-US', 'en'] });
    Object.defineProperty(navigator, 'platform', { get: () => 'Linux x86_64' });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    window.chrome = window.chrome || { runtime: {} };
    try {
      delete window.__playwright__binding__;
      delete window.__pwInitScripts;
    } catch {}
  });
}

async function waitForStepReady(page, timeoutMs) {
  await page.waitForFunction(() => {
    const text = document.body?.innerText || '';
    const hasLoader = /Подготовка этапа|Собираю интерфейс|Проверяю этап|Ждем, пока откроется следующий шаг/i.test(text);
    const hasAction = Array.from(document.querySelectorAll('button')).some((btn) => /Продолжить|Зафиксировать идентификатор/i.test(btn.innerText || ''));
    return hasAction && !hasLoader;
  }, { timeout: timeoutMs });
}

async function collectFields(page) {
  return page.locator('label.field-label').evaluateAll((labels) => {
    return labels.map((label) => {
      const htmlFor = label.getAttribute('for');
      const input = htmlFor ? document.getElementById(htmlFor) : null;
      return {
        label: (label.textContent || '').replace(/\s+/g, ' ').trim(),
        htmlFor,
        tagName: input?.tagName || null,
        type: input?.getAttribute('type') || (input?.tagName === 'SELECT' ? 'select' : null),
        accept: input?.getAttribute('accept') || null,
      };
    });
  });
}

async function fillField(page, field, answer, input) {
  const labelLocator = page.getByText(field.label, { exact: true }).locator('..');
  if (field.type === 'file') {
    if (!input.filePath) throw new Error(`Field "${field.label}" requires filePath.`);
    await page.locator(`#${field.htmlFor}`).setInputFiles(path.resolve(process.cwd(), input.filePath));
    return { key: getLogicalKey(field.label), label: field.label, type: field.type, value: path.basename(input.filePath) };
  }

  if (field.type === 'select') {
    const select = page.locator(`#${field.htmlFor}`);
    try {
      await select.selectOption({ label: answer });
    } catch {
      await select.selectOption({ value: answer });
    }
    return { key: getLogicalKey(field.label), label: field.label, type: field.type, value: answer };
  }

  const control = page.locator(`#${field.htmlFor}`);
  await control.fill('');
  await control.fill(answer);
  return { key: getLogicalKey(field.label), label: field.label, type: field.type, value: answer };
}

async function fillCurrentStep(page, stepNumber, input) {
  await waitForStepReady(page, input.timeoutMs);
  const fields = await collectFields(page);
  const filled = [];
  const answers = input.stepAnswers[String(stepNumber)] || {};

  for (const field of fields) {
    const key = getLogicalKey(field.label);
    const answer = getAnswer(key, answers);
    filled.push(await fillField(page, field, answer, input));
  }

  const buttonName = stepNumber === 2 ? /Зафиксировать идентификатор/i : /Продолжить/i;
  await page.getByRole('button', { name: buttonName }).click();
  return { step: stepNumber, fields, filled };
}

async function run(rawInput) {
  const input = InputSchema.parse(rawInput);
  const browser = await chromium.launch({
    headless: input.headless,
    slowMo: input.slowMo,
    executablePath: input.executablePath,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    locale: 'ru-RU',
    timezoneId: 'Europe/Ulyanovsk',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  });

  await addStealth(context);
  if (input.tracePath) await context.tracing.start({ screenshots: true, snapshots: true });

  const page = await context.newPage();
  page.setDefaultTimeout(input.timeoutMs);

  try {
    await page.goto(input.baseUrl, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Начать задание/i }).click();

    const step1 = await fillCurrentStep(page, 1, input);
    await page.waitForURL(/\/flow\/.*\/step\/2/, { timeout: input.timeoutMs });

    const step2 = await fillCurrentStep(page, 2, input);
    await page.waitForURL(/\/flow\/.*\/result/, { timeout: input.timeoutMs });
    await page.waitForLoadState('networkidle');

    const bodyText = normalizeText(await page.locator('body').innerText());
    const finalIdentifierMatch = bodyText.match(/[A-Z0-9]{12}/);
    const completedAtMatch = bodyText.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC/);

    if (input.finalScreenshotPath) {
      await page.screenshot({ path: path.resolve(process.cwd(), input.finalScreenshotPath), fullPage: true });
    } else if (input.screenshotPath) {
      await page.screenshot({ path: path.resolve(process.cwd(), input.screenshotPath), fullPage: true });
    }

    const result = {
      ok: true,
      baseUrl: input.baseUrl,
      currentUrl: page.url(),
      steps: [step1, step2],
      result: {
        finalIdentifier: finalIdentifierMatch ? finalIdentifierMatch[0] : null,
        completedAt: completedAtMatch ? completedAtMatch[0] : null,
        bodyText,
      },
    };

    return result;
  } finally {
    if (input.tracePath) {
      await context.tracing.stop({ path: path.resolve(process.cwd(), input.tracePath) });
    }
    await context.close();
    await browser.close();
  }
}

(async () => {
  try {
    const input = await readJsonInput();
    const result = await run(input);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  }
})();
