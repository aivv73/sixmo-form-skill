#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { z } = require('zod');

const DEFAULT_BASE_URL = 'https://sixmo.ru/';
const DEFAULT_TIMEOUT_MS = 45000;
const DEFAULT_CONNECT_TIMEOUT_MS = 20000;
const DEFAULT_STEP_ANSWERS = {
  1: {
    'Как называется школа, в которой учились Гарри, Рон и Гермиона?': 'Хогвартс',
    'На какой факультет распределили Гарри Поттера?': 'Гриффиндор',
    'Как звали сову Гарри Поттера?': 'Букля',
  },
  2: {
    'Какой из этих предметов связан с квиддичем?': 'Снитч',
    'Как называется платформа, с которой отправляется поезд в Хогвартс?': 'Платформа 9 3/4',
  },
};
const DEFAULT_UPLOAD_QUESTION = 'Загрузите небольшой текстовый файл с любым словом из фильмов о Гарри Поттере';
const QUESTION_ALIASES = {
  logic_mode: 'Как звали сову Гарри Поттера?',
  orbital_path: 'Как называется школа, в которой учились Гарри, Рон и Гермиона?',
  favorite_color: 'На какой факультет распределили Гарри Поттера?',
  shape_signal: 'Как называется платформа, с которой отправляется поезд в Хогвартс?',
  tempo_choice: 'Какой из этих предметов связан с квиддичем?',
  artifact_file: DEFAULT_UPLOAD_QUESTION,
};

const InputSchema = z.object({
  baseUrl: z.string().url().default(DEFAULT_BASE_URL),
  timeoutMs: z.number().int().positive().default(DEFAULT_TIMEOUT_MS),
  connectTimeoutMs: z.number().int().positive().default(DEFAULT_CONNECT_TIMEOUT_MS),
  filePath: z.string().optional(),
  stepAnswers: z.object({
    1: z.record(z.string(), z.string()).default(DEFAULT_STEP_ANSWERS[1]),
    2: z.record(z.string(), z.string()).default(DEFAULT_STEP_ANSWERS[2]),
  }).default(DEFAULT_STEP_ANSWERS),
  resultWaitTexts: z.array(z.string()).default(['UTC', 'identifier', 'идентификатор']),
  mcp: z.object({
    command: z.string().default('npx'),
    args: z.array(z.string()).default(['chrome-devtools-mcp@latest']),
    autoConnect: z.boolean().default(true),
    browserUrl: z.string().optional(),
    wsEndpoint: z.string().optional(),
    channel: z.string().optional(),
    executablePath: z.string().optional(),
    userDataDir: z.string().optional(),
    logFile: z.string().optional(),
    headless: z.boolean().optional(),
    extraArgs: z.array(z.string()).default([]),
    env: z.record(z.string(), z.string()).default({}),
  }).default({}),
});

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function normalizeStepAnswers(stepAnswers) {
  const result = {};
  for (const [step, answers] of Object.entries(stepAnswers || {})) {
    result[step] = {};
    for (const [questionOrAlias, value] of Object.entries(answers || {})) {
      result[step][QUESTION_ALIASES[questionOrAlias] || questionOrAlias] = value;
    }
  }
  return result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), arg), 'utf8'));
}

class McpClient {
  constructor(client, transport, requestTimeoutMs = 120000) {
    this.client = client;
    this.transport = transport;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  static async create(command, args, options = {}) {
    const thirdPartyUrl = pathToFileURL('/home/aivv/.npm/_npx/15c61037b1978c83/node_modules/chrome-devtools-mcp/build/src/third_party/index.js').href;
    const { Client, StdioClientTransport } = await import(thirdPartyUrl);
    const client = new Client({ name: 'sixmo-form-skill', version: '2.0.0' });
    const transport = new StdioClientTransport({
      command,
      args,
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...(options.env || {}) },
      stderr: 'pipe',
    });
    await client.connect(transport, { timeout: options.requestTimeoutMs || 120000 });
    return new McpClient(client, transport, options.requestTimeoutMs || 120000);
  }

  async callTool(name, args = {}) {
    return this.client.callTool({ name, arguments: args }, undefined, { timeout: this.requestTimeoutMs });
  }

  async listTools() {
    return this.client.listTools(undefined, { timeout: this.requestTimeoutMs });
  }

  async close() {
    await this.client.close().catch(() => {});
    await this.transport.close().catch(() => {});
  }
}

function extractText(result) {
  return (result.content || []).filter((item) => item.type === 'text').map((item) => item.text).join('\n');
}

function snapshotFromResult(result) {
  return result.structuredContent?.snapshot || null;
}

function snapshotTextFromResult(result) {
  return normalizeText(extractText(result));
}

function flattenSnapshot(node, acc = []) {
  if (!node || typeof node !== 'object') return acc;
  acc.push(node);
  for (const child of node.children || []) flattenSnapshot(child, acc);
  return acc;
}

function findNodeByQuestion(snapshot, questionText) {
  const nodes = flattenSnapshot(snapshot);
  const question = normalizeText(questionText);
  const questionIndex = nodes.findIndex((node) => normalizeText(node.name).includes(question));
  if (questionIndex === -1) return null;

  for (let i = questionIndex + 1; i < Math.min(nodes.length, questionIndex + 12); i += 1) {
    const node = nodes[i];
    if (!node || !node.id) continue;
    if (['textbox', 'combobox', 'button'].includes(node.role)) return node;
  }

  const direct = nodes.find((node) => ['textbox', 'combobox', 'button'].includes(node.role) && normalizeText(node.name).includes(question));
  return direct || null;
}

async function takeSnapshot(client) {
  const result = await client.callTool('take_snapshot', { verbose: true });
  const snapshot = snapshotFromResult(result);
  if (!snapshot) throw new Error(`take_snapshot did not return structured snapshot. Raw: ${extractText(result)}`);
  return { raw: result, snapshot };
}

async function waitForTexts(client, texts, timeoutMs) {
  return client.callTool('wait_for', { text: texts, timeout: timeoutMs });
}

async function waitForAllTexts(client, texts, timeoutMs) {
  const wanted = texts.map(normalizeText);
  const deadline = Date.now() + timeoutMs;
  let lastText = '';
  while (Date.now() < deadline) {
    const snap = await takeSnapshot(client);
    lastText = snapshotTextFromResult(snap.raw);
    if (wanted.every((text) => lastText.includes(text))) return snap;
    await sleep(500);
  }
  throw new Error(`Timed out waiting for all texts ${JSON.stringify(texts)}. Last snapshot: ${lastText.slice(0, 1500)}`);
}

async function ensureSixmoPage(client, baseUrl, timeoutMs) {
  const findMatchingPage = (pages = []) => (
    pages.find((page) => String(page.url || '').startsWith(baseUrl))
    || pages.find((page) => page.selected)
    || null
  );

  const pagesResult = await client.callTool('list_pages', {});
  const pages = pagesResult.structuredContent?.pages || [];
  const existing = findMatchingPage(pages);
  if (existing) {
    await client.callTool('select_page', { pageId: existing.id, bringToFront: true });
    await client.callTool('navigate_page', { type: 'url', url: baseUrl, timeout: timeoutMs });
    return existing.id;
  }

  await client.callTool('new_page', { url: baseUrl, timeout: timeoutMs });
  const refreshedPagesResult = await client.callTool('list_pages', {});
  const refreshedPages = refreshedPagesResult.structuredContent?.pages || [];
  const created = findMatchingPage(refreshedPages);
  if (!created) throw new Error(`Failed to open ${baseUrl}; pages: ${JSON.stringify(refreshedPages)}`);
  await client.callTool('select_page', { pageId: created.id, bringToFront: true });
  return created.id;
}

async function clickByQuestion(client, questionText, roleHint) {
  const { snapshot } = await takeSnapshot(client);
  const node = findNodeByQuestion(snapshot, questionText) || flattenSnapshot(snapshot).find((n) => n.role === roleHint && normalizeText(n.name).includes(normalizeText(questionText)));
  if (!node) throw new Error(`Could not find element for question: ${questionText}`);
  await client.callTool('click', { uid: node.id });
  return node;
}

async function fillAnswer(client, questionText, value, filePath) {
  const { snapshot } = await takeSnapshot(client);
  const node = findNodeByQuestion(snapshot, questionText);
  if (!node) throw new Error(`Could not match question in snapshot: ${questionText}`);

  if (node.role === 'button') {
    if (!filePath) throw new Error(`Question requires filePath: ${questionText}`);
    const resolved = path.resolve(process.cwd(), filePath);
    await client.callTool('upload_file', { uid: node.id, filePath: resolved, includeSnapshot: true });
    return { question: questionText, uid: node.id, role: node.role, value: path.basename(resolved) };
  }

  if (node.role === 'combobox') {
    await client.callTool('evaluate_script', {
      function: `(el) => {
        const targetValue = ${JSON.stringify(value)};
        const normalized = (text) => String(text || '').replace(/\s+/g, ' ').trim();
        const options = Array.from(el.options || []);
        const option = options.find((candidate) => normalized(candidate.text) === normalized(targetValue) || normalized(candidate.value) === normalized(targetValue));
        if (!option) {
          return {
            ok: false,
            tagName: el.tagName,
            currentValue: el.value,
            availableOptions: options.map((candidate) => ({ text: candidate.text, value: candidate.value }))
          };
        }
        el.value = option.value;
        option.selected = true;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur();
        return {
          ok: true,
          tagName: el.tagName,
          value: el.value,
          selectedText: option.text,
          selectedValue: option.value
        };
      }`,
      args: [node.id],
    });
    return { question: questionText, uid: node.id, role: node.role, value };
  }

  await client.callTool('fill', { uid: node.id, value, includeSnapshot: true });
  return { question: questionText, uid: node.id, role: node.role, value };
}

async function clickStart(client, timeoutMs) {
  await waitForTexts(client, ['Начать задание'], timeoutMs);
  const { snapshot } = await takeSnapshot(client);
  const node = flattenSnapshot(snapshot).find((n) => ['button', 'link'].includes(n.role) && normalizeText(n.name).includes('Начать задание'));
  if (!node) throw new Error('Could not find “Начать задание” button');
  await client.callTool('click', { uid: node.id });
}

async function clickContinue(client, timeoutMs) {
  await waitForTexts(client, ['Продолжить'], timeoutMs);
  const { snapshot } = await takeSnapshot(client);
  const node = flattenSnapshot(snapshot).find((n) => n.role === 'button' && normalizeText(n.name).includes('Продолжить'));
  if (!node) throw new Error('Could not find “Продолжить” button');
  await client.callTool('click', { uid: node.id, includeSnapshot: true });
}

async function clickFinalize(client, timeoutMs) {
  await waitForTexts(client, ['Зафиксировать идентификатор'], timeoutMs);
  const { snapshot } = await takeSnapshot(client);
  const node = flattenSnapshot(snapshot).find((n) => n.role === 'button' && normalizeText(n.name).includes('Зафиксировать идентификатор'));
  if (!node) throw new Error('Could not find final submit button');
  await client.callTool('click', { uid: node.id });
}

async function getCurrentUrl(client) {
  const pagesResult = await client.callTool('list_pages', {});
  const pages = pagesResult.structuredContent?.pages || [];
  const selected = pages.find((page) => page.selected) || pages[0] || null;
  return selected?.url || null;
}

function parseResultText(text) {
  const clean = normalizeText(text);
  const finalIdentifierMatch = clean.match(/[A-Z0-9]{12}/);
  const completedAtMatch = clean.match(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+UTC/);
  return {
    finalIdentifier: finalIdentifierMatch ? finalIdentifierMatch[0] : null,
    completedAt: completedAtMatch ? completedAtMatch[0] : null,
    bodyText: clean,
  };
}

function buildMcpSpawn(input) {
  const mcp = {
    command: 'npx',
    args: ['-y', 'chrome-devtools-mcp@latest', '--experimentalStructuredContent'],
    autoConnect: true,
    channel: 'stable',
    extraArgs: [],
    env: {},
    ...(input.mcp || {}),
  };
  const args = [...mcp.args];

  if (mcp.autoConnect !== false) args.push('--autoConnect');
  if (mcp.browserUrl) args.push('--browserUrl', mcp.browserUrl);
  if (mcp.wsEndpoint) args.push('--wsEndpoint', mcp.wsEndpoint);
  if (mcp.channel) args.push('--channel', mcp.channel);
  if (mcp.executablePath) args.push('--executablePath', mcp.executablePath);
  if (mcp.userDataDir) args.push('--userDataDir', mcp.userDataDir);
  if (mcp.logFile) args.push('--logFile', mcp.logFile);
  if (typeof mcp.headless === 'boolean') args.push(mcp.headless ? '--headless' : '--no-headless');
  if (mcp.extraArgs?.length) args.push(...mcp.extraArgs);

  return { command: mcp.command, args, env: mcp.env || {} };
}

async function run(rawInput) {
  const input = InputSchema.parse(rawInput);
  input.stepAnswers = normalizeStepAnswers(input.stepAnswers);
  const spawnSpec = buildMcpSpawn(input);
  const client = await McpClient.create(spawnSpec.command, spawnSpec.args, {
    cwd: process.cwd(),
    env: spawnSpec.env,
  });

  const steps = [];
  try {
    await client.listTools();
    await ensureSixmoPage(client, input.baseUrl, input.timeoutMs);

    await clickStart(client, input.timeoutMs);
    await waitForAllTexts(client, Object.keys(input.stepAnswers[1]), input.timeoutMs);

    const step1Filled = [];
    for (const [question, answer] of Object.entries(input.stepAnswers[1])) {
      step1Filled.push(await fillAnswer(client, question, answer, input.filePath));
    }
    await clickContinue(client, input.timeoutMs);
    steps.push({ step: 1, filled: step1Filled });

    await waitForAllTexts(client, [...Object.keys(input.stepAnswers[2]), DEFAULT_UPLOAD_QUESTION], input.timeoutMs);
    const step2Filled = [];
    for (const [question, answer] of Object.entries(input.stepAnswers[2])) {
      step2Filled.push(await fillAnswer(client, question, answer, input.filePath));
    }
    step2Filled.push(await fillAnswer(client, DEFAULT_UPLOAD_QUESTION, '', input.filePath));
    await clickFinalize(client, input.timeoutMs);
    steps.push({ step: 2, filled: step2Filled });

    await waitForTexts(client, input.resultWaitTexts, input.timeoutMs);
    const resultSnapshot = await takeSnapshot(client);
    const resultText = extractText(resultSnapshot.raw);
    const currentUrl = await getCurrentUrl(client);

    return {
      ok: true,
      currentUrl,
      steps,
      result: parseResultText(resultText),
    };
  } finally {
    await client.close().catch(() => {});
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
