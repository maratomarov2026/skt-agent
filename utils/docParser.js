import fs from 'fs';
import path from 'path';

// Парсим PDF через pdf-parse
async function parsePdf(filePath) {
  try {
    const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  } catch {
    // Fallback: попробуем просто прочитать как текст
    return fs.readFileSync(filePath, 'utf8');
  }
}

// Парсим DOCX через mammoth
async function parseDocx(filePath) {
  const mammoth = await import('mammoth');
  const result = await mammoth.default.extractRawText({ path: filePath });
  return result.value;
}

// Парсим XLSX через xlsx
async function parseXlsx(filePath) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.default.readFile(filePath);
  let text = '';
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    text += `\n[Лист: ${sheetName}]\n`;
    text += XLSX.default.utils.sheet_to_csv(sheet);
  }
  return text;
}

// Парсим TXT
function parseTxt(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

export async function parseDocument(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath);

  let text = '';
  switch (ext) {
    case '.pdf':
      text = await parsePdf(filePath);
      break;
    case '.docx':
    case '.doc':
      text = await parseDocx(filePath);
      break;
    case '.xlsx':
    case '.xls':
      text = await parseXlsx(filePath);
      break;
    case '.txt':
    case '.md':
    case '.csv':
      text = parseTxt(filePath);
      break;
    default:
      return null;
  }

  return { name, ext, text: text.trim() };
}

export async function parseDocuments(filePaths) {
  const results = [];
  for (const fp of filePaths) {
    if (!fs.existsSync(fp)) {
      results.push({ name: path.basename(fp), error: 'Файл не найден' });
      continue;
    }
    try {
      const doc = await parseDocument(fp);
      if (doc) results.push(doc);
      else results.push({ name: path.basename(fp), error: 'Формат не поддерживается' });
    } catch (e) {
      results.push({ name: path.basename(fp), error: e.message });
    }
  }
  return results;
}

export function formatDocsForPrompt(docs) {
  return docs
    .map((d) => {
      if (d.error) return `[ДОКУМЕНТ: ${d.name}]\nОШИБКА: ${d.error}\n`;
      return `[ДОКУМЕНТ: ${d.name}]\n${d.text.slice(0, 8000)}\n`;
    })
    .join('\n---\n');
}
