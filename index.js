import Anthropic from '@anthropic-ai/sdk';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

import { MODULES, SYSTEM_BASE, detectModule } from './prompts/modules.js';
import { parseDocuments, formatDocsForPrompt } from './utils/docParser.js';
import { detectProjectTopic, buildStatHint } from './utils/statGov.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Конфигурация ───────────────────────────────────────────────────────────
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 8096;

// ─── Состояние сессии ────────────────────────────────────────────────────────
let activeModule = null;
let conversationHistory = [];
let sessionDocs = [];    // Загруженные в сессию документы
let projectName = null;  // Название текущего проекта

// ─── Вспомогательные функции ─────────────────────────────────────────────────

function printBanner() {
  console.log('\n' + '═'.repeat(65));
  console.log('  AI-Агент КФ «Samruk-Kazyna Trust»');
  console.log('  Анализ заявок и мониторинг благотворительных проектов');
  console.log('═'.repeat(65));
  console.log('\nДоступные модули:');
  for (const [key, mod] of Object.entries(MODULES)) {
    console.log(`  МОДУЛЬ ${key} — ${mod.name}`);
  }
  console.log('\nКоманды:');
  console.log('  /модуль <А-Ж>         — активировать модуль');
  console.log('  /файл <путь>          — загрузить документ (PDF/DOCX/XLSX/TXT)');
  console.log('  /файлы                — показать загруженные документы');
  console.log('  /очистить             — сбросить историю диалога');
  console.log('  /проект <название>    — задать название проекта');
  console.log('  /выход                — завершить работу');
  console.log('');
}

function printInfo(msg) { console.log(`\n  ℹ️  ${msg}`); }
function printOk(msg)   { console.log(`\n  ✅ ${msg}`); }
function printWarn(msg) { console.log(`\n  ⚠️  ${msg}`); }
function printErr(msg)  { console.error(`\n  🔴 ${msg}`); }

function buildSystemPrompt(moduleKey, userText) {
  const base = moduleKey ? MODULES[moduleKey].system : SYSTEM_BASE;

  let extra = '';

  // Добавляем контекст загруженных документов
  if (sessionDocs.length > 0) {
    extra += `\n\n== ЗАГРУЖЕННЫЕ ДОКУМЕНТЫ ==\n${formatDocsForPrompt(sessionDocs)}`;
  }

  // Добавляем подсказку по статистике (только для модуля Б)
  if (moduleKey === 'Б' && userText) {
    const topic = detectProjectTopic(userText + (sessionDocs.map(d => d.text || '').join(' ')));
    if (topic) {
      extra += `\n\n== СТАТИСТИКА ДЛЯ АНАЛИЗА ==\n${buildStatHint(topic)}`;
    } else {
      extra += `\n\n== СТАТИСТИКА ДЛЯ АНАЛИЗА ==\n${buildStatHint(null)}`;
    }
  }

  return base + extra;
}

async function sendMessage(userMessage) {
  conversationHistory.push({ role: 'user', content: userMessage });

  const systemPrompt = buildSystemPrompt(activeModule, userMessage);

  process.stdout.write('\n  Агент: ');

  let fullResponse = '';

  try {
    const stream = await client.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: conversationHistory,
    });

    for await (const chunk of stream) {
      if (
        chunk.type === 'content_block_delta' &&
        chunk.delta?.type === 'text_delta'
      ) {
        const text = chunk.delta.text;
        process.stdout.write(text);
        fullResponse += text;
      }
    }
  } catch (err) {
    printErr(`Ошибка API: ${err.message}`);
    conversationHistory.pop();
    return;
  }

  console.log('\n');
  conversationHistory.push({ role: 'assistant', content: fullResponse });
}

async function handleCommand(input, rl) {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();

  // /модуль А-Ж
  if (cmd === '/модуль') {
    const key = parts[1]?.toUpperCase();
    if (key && MODULES[key]) {
      activeModule = key;
      conversationHistory = [];
      printOk(`Активирован МОДУЛЬ ${key} — ${MODULES[key].name}`);
      printInfo('История диалога сброшена. Можно начать анализ.');
    } else {
      printWarn(`Неизвестный модуль. Допустимые: ${Object.keys(MODULES).join(', ')}`);
    }
    return true;
  }

  // /файл <путь>
  if (cmd === '/файл') {
    const filePath = parts.slice(1).join(' ').replace(/^["']|["']$/g, '');
    if (!filePath) { printWarn('Укажите путь к файлу.'); return true; }

    printInfo(`Загружаю: ${filePath}`);
    const docs = await parseDocuments([filePath]);
    const doc = docs[0];

    if (doc.error) {
      printErr(`Не удалось загрузить: ${doc.error}`);
    } else {
      // Удаляем дубликат, если такой файл уже был загружен
      sessionDocs = sessionDocs.filter(d => d.name !== doc.name);
      sessionDocs.push(doc);
      printOk(`Загружен: ${doc.name} (${doc.text.length} символов)`);
    }
    return true;
  }

  // /файлы
  if (cmd === '/файлы') {
    if (sessionDocs.length === 0) {
      printInfo('Документы не загружены.');
    } else {
      console.log('\n  Загруженные документы:');
      sessionDocs.forEach((d, i) => {
        console.log(`    ${i + 1}. ${d.name} (${d.text?.length ?? 0} символов)`);
      });
    }
    return true;
  }

  // /очистить
  if (cmd === '/очистить') {
    conversationHistory = [];
    printOk('История диалога сброшена.');
    return true;
  }

  // /проект <название>
  if (cmd === '/проект') {
    projectName = parts.slice(1).join(' ');
    printOk(`Текущий проект: «${projectName}»`);
    return true;
  }

  // /выход
  if (cmd === '/выход') {
    console.log('\n  До свидания!\n');
    rl.close();
    process.exit(0);
  }

  return false;
}

// ─── Автодетект модуля из свободного текста ──────────────────────────────────
function tryAutoDetectModule(text) {
  const key = detectModule(text);
  if (key && key !== activeModule) {
    activeModule = key;
    conversationHistory = [];
    printInfo(`Автоматически активирован МОДУЛЬ ${key} — ${MODULES[key].name}`);
  }
}

// ─── Главный цикл ─────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    printErr('Переменная ANTHROPIC_API_KEY не задана. Создайте файл .env');
    process.exit(1);
  }

  printBanner();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\n  Вы: ',
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    // Команды начинаются с /
    if (input.startsWith('/')) {
      const handled = await handleCommand(input, rl);
      if (!handled) printWarn('Неизвестная команда. Введите /выход для завершения.');
      rl.prompt();
      return;
    }

    // Автодетект модуля, если не задан явно
    if (!activeModule) tryAutoDetectModule(input);

    if (!activeModule) {
      printInfo(
        'Укажите модуль командой /модуль <А-Ж> или напишите, что нужно проверить.\n' +
        'Например: «Модуль А — проверка комплектности» или «Нужен комплаенс-анализ».'
      );
      rl.prompt();
      return;
    }

    // Если есть название проекта, добавляем его в контекст
    const contextualInput = projectName
      ? `[Проект: «${projectName}»]\n${input}`
      : input;

    await sendMessage(contextualInput);
    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\n  Сессия завершена.\n');
    process.exit(0);
  });
}

main();
