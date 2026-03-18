#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { z } = require('zod');

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

const DEFAULT_FINGERPRINT = {
  visitorId: '1234567890abcdef1234567890abcdef',
  confidence: 0.99,
  userAgent: DEFAULT_USER_AGENT,
  webdriver: false,
  languages: ['ru-RU', 'ru', 'en-US', 'en'],
  platform: 'Linux x86_64',
  pluginsLength: 5,
  hardwareConcurrency: 8,
  deviceMemory: 8,
  screen: { width: 1920, height: 1080, colorDepth: 24 },
  timezone: 'Europe/Ulyanovsk',
  touchPoints: 0,
  hasPlaywrightBinding: false,
  hasChromeRuntime: false,
  hasChromeObject: true,
  vendor: 'Google Inc.',
  notificationPermission: 'default',
  webgl: { vendor: 'Google Inc. (Google)', renderer: 'ANGLE (Google, Vulkan 1.3.0)' },
  screenConsistency: { innerWidth: 1280, innerHeight: 720, outerWidth: 1280, outerHeight: 800 },
  colorDepth: 24,
  fpComponents: ['fonts', 'audio', 'screenFrame'],
};

const InputSchema = z.object({
  baseUrl: z.string().url().default('https://sixmo.ru'),
  fingerprint: z.record(z.string(), z.any()).default({}),
  stepAnswers: z.object({
    1: z.record(z.string(), z.string()).default({}),
    2: z.record(z.string(), z.string()).default({}),
  }).default({ 1: {}, 2: {} }),
  filePath: z.string().optional(),
  fileName: z.string().optional(),
  fileMimeType: z.string().default('text/plain'),
  telemetry: z.record(z.string(), z.any()).default({ source: 'openclaw-skill', mode: 'api-automation' }),
  dryRun: z.boolean().default(false),
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mergeHeaders(cookie, headers = {}) {
  return {
    Origin: 'https://sixmo.ru',
    Referer: 'https://sixmo.ru/',
    ...(cookie ? { Cookie: cookie } : {}),
    ...headers,
  };
}

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
  const fullPath = path.resolve(process.cwd(), arg);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function selectAnswer(field, stepAnswers) {
  const explicit = stepAnswers[field.name];
  if (explicit) return explicit;
  if (field.type === 'select') return field.options?.[0]?.value ?? '';
  return field.placeholder || field.label || 'test';
}

async function startFlow(baseUrl, fingerprint) {
  const response = await fetch(`${baseUrl}/api/start.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': fingerprint.userAgent,
      ...mergeHeaders(null),
    },
    body: JSON.stringify({ fingerprint }),
  });

  const body = await response.json();
  if (!response.ok || body.ok === false) {
    throw new Error(body.error || `start.php failed with ${response.status}`);
  }

  const setCookie = response.headers.get('set-cookie');
  const cookie = setCookie ? setCookie.split(';')[0] : null;
  if (!cookie) {
    throw new Error('No session cookie returned by start.php');
  }

  return { ...body, cookie };
}

async function apiJson(baseUrl, pathname, { cookie, headers, method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: mergeHeaders(cookie, headers),
    body,
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload;
}

async function getStep(baseUrl, session, step) {
  while (true) {
    const payload = await apiJson(baseUrl, `/api/step.php?flow_id=${encodeURIComponent(session.flowId)}&step=${step}`, {
      cookie: session.cookie,
      headers: {
        'X-Flow-Key': session.flowKey,
        'X-CSRF-Token': session.csrfToken,
      },
    });

    if (payload.status === 'pending') {
      await sleep(Math.max(350, payload.retryAfterMs || 500));
      continue;
    }

    return payload.stepData;
  }
}

async function submitStep(baseUrl, session, stepData, answers, options) {
  const form = new FormData();
  form.append('flow_id', session.flowId);
  form.append('step', String(stepData.step));
  form.append('step_token', stepData.stepToken);
  form.append(
    'telemetry',
    JSON.stringify({
      ...options.telemetry,
      step: stepData.step,
      fieldOrder: stepData.fields.map((field) => field.name),
      submittedAt: new Date().toISOString(),
    })
  );

  for (const field of stepData.fields) {
    if (field.type === 'file') {
      if (!options.filePath && !options.dryRun) {
        throw new Error(`Step ${stepData.step} requires a file for field ${field.name}, but filePath was not provided.`);
      }
      if (options.filePath) {
        const fileBuffer = fs.readFileSync(path.resolve(process.cwd(), options.filePath));
        const fileName = options.fileName || path.basename(options.filePath);
        form.append(field.name, new Blob([fileBuffer], { type: options.fileMimeType }), fileName);
      } else {
        form.append(field.name, new Blob(['dry-run'], { type: 'text/plain' }), 'dry-run.txt');
      }
      continue;
    }

    form.append(field.name, selectAnswer(field, answers));
  }

  return apiJson(baseUrl, '/api/submit.php', {
    method: 'POST',
    cookie: session.cookie,
    headers: {
      'X-Flow-Key': session.flowKey,
      'X-CSRF-Token': session.csrfToken,
    },
    body: form,
  });
}

async function fetchResult(baseUrl, session) {
  return apiJson(baseUrl, `/api/result.php?flow_id=${encodeURIComponent(session.flowId)}`, {
    cookie: session.cookie,
    headers: {
      'X-Flow-Key': session.flowKey,
      'X-CSRF-Token': session.csrfToken,
    },
  });
}

async function run(rawInput) {
  const input = InputSchema.parse(rawInput);
  input.fingerprint = {
    ...DEFAULT_FINGERPRINT,
    ...input.fingerprint,
    screen: { ...DEFAULT_FINGERPRINT.screen, ...(input.fingerprint.screen || {}) },
    webgl: { ...DEFAULT_FINGERPRINT.webgl, ...(input.fingerprint.webgl || {}) },
    screenConsistency: {
      ...DEFAULT_FINGERPRINT.screenConsistency,
      ...(input.fingerprint.screenConsistency || {}),
    },
  };
  const session = await startFlow(input.baseUrl, input.fingerprint);
  const steps = [];

  for (const stepNumber of [1, 2]) {
    const stepData = await getStep(input.baseUrl, session, stepNumber);
    steps.push({
      step: stepNumber,
      title: stepData.title,
      fieldNames: stepData.fields.map((field) => field.name),
      fieldTypes: stepData.fields.map((field) => ({ name: field.name, type: field.type })),
    });

    await submitStep(
      input.baseUrl,
      session,
      stepData,
      input.stepAnswers[String(stepNumber)] || {},
      input
    );
  }

  const result = input.dryRun ? null : await fetchResult(input.baseUrl, session);

  return {
    ok: true,
    baseUrl: input.baseUrl,
    flowId: session.flowId,
    steps,
    result,
  };
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
