import fetch from 'node-fetch';

const BASE_URL = 'https://stat.gov.kz';

// Тематические разделы stat.gov.kz для поиска статистики
const TOPIC_MAP = {
  образование: {
    url: '/ru/official-statistics/social-statistics/education/',
    keywords: ['учащихся', 'школ', 'образование', 'охват', 'грамотность'],
  },
  здравоохранение: {
    url: '/ru/official-statistics/social-statistics/health-care/',
    keywords: ['заболеваемость', 'смертность', 'больниц', 'врачей', 'медицин'],
  },
  демография: {
    url: '/ru/official-statistics/social-statistics/demography/',
    keywords: ['численность', 'население', 'рождаемость', 'смертность', 'миграция'],
  },
  'уровень жизни': {
    url: '/ru/official-statistics/social-statistics/living-standards/',
    keywords: ['бедность', 'доходы', 'прожиточный минимум', 'неравенство'],
  },
  занятость: {
    url: '/ru/official-statistics/labour-market/',
    keywords: ['безработица', 'занятость', 'рынок труда', 'NEET'],
  },
  экология: {
    url: '/ru/official-statistics/environment/',
    keywords: ['экология', 'выбросы', 'отходы', 'окружающая среда'],
  },
};

// Определяем тематику проекта по тексту заявки
export function detectProjectTopic(text) {
  const lowerText = text.toLowerCase();
  const scores = {};

  for (const [topic, data] of Object.entries(TOPIC_MAP)) {
    scores[topic] = 0;
    if (lowerText.includes(topic)) scores[topic] += 3;
    for (const kw of data.keywords) {
      if (lowerText.includes(kw)) scores[topic] += 1;
    }
  }

  const sorted = Object.entries(scores)
    .filter(([, s]) => s > 0)
    .sort(([, a], [, b]) => b - a);

  return sorted.length ? sorted[0][0] : null;
}

// Получаем актуальные данные с stat.gov.kz (экспресс-информация)
export async function fetchExpressInfo() {
  try {
    const res = await fetch(`${BASE_URL}/ru/news/press-releases/`, {
      headers: { 'User-Agent': 'SKT-Agent/1.0' },
      timeout: 8000,
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Извлекаем заголовки пресс-релизов (простой парсинг)
    const titles = [...html.matchAll(/<a[^>]+class="[^"]*title[^"]*"[^>]*>([^<]+)<\/a>/gi)]
      .map((m) => m[1].trim())
      .slice(0, 10);
    return titles.length ? titles : null;
  } catch {
    return null;
  }
}

// Формируем подсказку по статистике для агента
export function buildStatHint(topic) {
  if (!topic || !TOPIC_MAP[topic]) {
    return `Для поиска актуальной статистики используй сайт БНС АСПиР РК: ${BASE_URL}/ru/
Доступные разделы: Демография, Образование, Здравоохранение, Уровень жизни, Занятость, Экология, Регионы.`;
  }

  const data = TOPIC_MAP[topic];
  return `Для тематики "${topic}" рекомендуется раздел stat.gov.kz: ${BASE_URL}${data.url}
Ключевые показатели для проверки: ${data.keywords.join(', ')}.
При цитировании указывать: «Источник: БНС АСПиР РК (stat.gov.kz), [показатель], [год]».`;
}
