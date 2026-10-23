// Maeil News daily generator.
// Reads six korea.net news feeds, asks the AI for one Korean card per article,
// and writes docs/cards.json. GitHub Pages publishes that file for the widget.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(ROOT, 'docs', 'cards.json');
const USAGE_FILE = path.join(ROOT, 'state', 'usage.json');
const PER_CATEGORY = 4;

const FEEDS = [
  { category: 'Politics', url: 'https://www.korea.net/koreanet/rss/news/3' },
  { category: 'Business', url: 'https://www.korea.net/koreanet/rss/news/4' },
  { category: 'Sci/Tech', url: 'https://www.korea.net/koreanet/rss/news/5' },
  { category: 'Society', url: 'https://www.korea.net/koreanet/rss/news/6' },
  { category: 'Culture', url: 'https://www.korea.net/koreanet/rss/news/7' },
  { category: 'Sports', url: 'https://www.korea.net/koreanet/rss/news/9' }
];

const config = JSON.parse(await readFile(path.join(ROOT, 'config.json'), 'utf8'));

async function main() {
  const today = seoulDate();
  const previous = await readJson(OUT_FILE, null);

  // 1. Switched off: no AI calls at all
  if (!config.enabled) {
    await writeCards(today, 'off', [], 'Turned off in config.json');
    console.log('Cards are turned off in config.json. No AI call made.');
    return;
  }

  // 2. Today's AI cards are already done: nothing to pay for
  if (previous && previous.date === today && previous.status === 'ai') {
    console.log("Today's AI cards already exist. Nothing to do.");
    return;
  }

  const articles = await collectArticles();
  if (articles.length === 0) {
    const reasons = feedErrors.join(' | ').slice(0, 400) || 'feeds were empty';
    await writeCards(today, 'no articles', [], `No articles could be read from korea.net. ${reasons}`);
    console.log('No articles found.');
    return;
  }

  const usage = await loadUsage();
  let status;
  let note = '';
  let cards;

  if (usage.spent_usd >= config.monthly_cap_usd) {
    status = 'cap reached';
    note = `Monthly cap of $${config.monthly_cap_usd} reached`;
    cards = fallbackCards(articles);
  } else if (!process.env.AI_API_KEY) {
    status = 'no key';
    note = 'AI_API_KEY secret is missing';
    cards = fallbackCards(articles);
  } else {
    try {
      const { items, costUsd } = await translateAll(articles);
      usage.spent_usd += costUsd;
      cards = articles.map((a, i) => ({
        category: a.category,
        korean_title: items[i].korean_title,
        english_title: items[i].english_title,
        korean_desc: items[i].korean_desc,
        english_desc: items[i].english_desc,
        url: a.link
      }));
      status = 'ai';
      note = `Cost this run about $${costUsd.toFixed(4)}`;
    } catch (err) {
      // Usually "no credits" or a network problem: show English-only cards, retry on the next run
      status = 'fallback';
      note = err.message.slice(0, 300);
      cards = fallbackCards(articles);
    }
  }

  await saveUsage(usage);
  await writeCards(today, status, cards, note);
  console.log(`Wrote ${cards.length} cards. Status: ${status}. ${note}`);
}

// ---------- News feeds ----------

let feedErrors = [];

async function collectArticles() {
  const out = [];
  feedErrors = [];
  for (const feed of FEEDS) {
    try {
      const xml = await loadFeed(feed);
      const items = parseItems(xml).filter(i => i.title && i.link).slice(0, PER_CATEGORY);
      items.forEach(i => out.push({ category: feed.category, title: i.title, link: i.link, description: i.description }));
      console.log(`${feed.category}: ${items.length} articles`);
      if (items.length === 0) feedErrors.push(`${feed.category}: no items in feed`);
    } catch (err) {
      console.error(`${feed.category} failed: ${err.message}`);
      feedErrors.push(`${feed.category}: ${err.message}`);
    }
  }
  return out;
}

async function loadFeed(feed) {
  // Offline testing: read saved feed files instead of the internet
  if (process.env.FIXTURE_DIR) {
    const name = feed.category.toLowerCase().replace('/', '-') + '.xml';
    return readFile(path.join(process.env.FIXTURE_DIR, name), 'utf8');
  }
  const res = await fetch(feed.url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function parseItems(xml) {
  const items = [];
  const re = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const body = m[1];
    items.push({
      title: readTag(body, 'title'),
      link: readTag(body, 'link'),
      description: readTag(body, 'description')
    });
  }
  return items;
}

function readTag(body, name) {
  const m = body.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? cleanText(m[1]) : '';
}

function cleanText(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- AI ----------

async function translateAll(articles) {
  const prompt = buildPrompt(articles);
  const provider = process.env.AI_PROVIDER || config.provider;
  const key = process.env.AI_API_KEY;

  let reply;
  if (provider === 'claude') reply = await callClaude(key, prompt);
  else if (provider === 'gemini') reply = await callGemini(key, prompt);
  else reply = await callOpenAI(key, prompt);

  const items = parseCardsJson(reply.text, articles.length);
  const p = config.price_per_million_tokens;
  const costUsd = (reply.inputTokens * p.input + reply.outputTokens * p.output) / 1_000_000;
  return { items, costUsd };
}

function buildPrompt(articles) {
  const list = articles
    .map((a, i) => `${i + 1}. [${a.category}] ${a.title}\n   ${a.description.slice(0, 400)}`)
    .join('\n');
  return `You make one short Korean-learning card for each news article below, for a beginner to intermediate learner.
Return ONLY a JSON array with exactly ${articles.length} objects, in the same order as the articles. Each object has:
- "korean_title": a natural Korean headline, under 30 Korean characters
- "english_title": a clear, short English headline
- "korean_desc": one or two short, simple Korean sentences that summarise the article
- "english_desc": an English translation of korean_desc
Do not write anything outside the JSON.

Articles:
${list}`;
}

function parseCardsJson(text, expected) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end < 0) throw new Error('AI reply did not contain a JSON array');
  const items = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(items) || items.length !== expected) {
    throw new Error(`AI returned ${items?.length} cards, expected ${expected}`);
  }
  for (const item of items) {
    for (const field of ['korean_title', 'english_title', 'korean_desc', 'english_desc']) {
      if (typeof item[field] !== 'string' || !item[field].trim()) {
        throw new Error(`AI card is missing ${field}`);
      }
    }
  }
  return items;
}

async function callOpenAI(key, prompt) {
  const r = await post('https://api.openai.com/v1/chat/completions',
    { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    { model: config.model, messages: [{ role: 'user', content: prompt }], max_completion_tokens: 8000 });
  return {
    text: r.choices[0].message.content,
    inputTokens: r.usage?.prompt_tokens ?? 0,
    outputTokens: r.usage?.completion_tokens ?? 0
  };
}

async function callClaude(key, prompt) {
  const r = await post('https://api.anthropic.com/v1/messages',
    { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    { model: config.model, max_tokens: 8000, messages: [{ role: 'user', content: prompt }] });
  return {
    text: r.content.map(c => c.text || '').join(''),
    inputTokens: r.usage?.input_tokens ?? 0,
    outputTokens: r.usage?.output_tokens ?? 0
  };
}

async function callGemini(key, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${encodeURIComponent(key)}`;
  const r = await post(url, { 'Content-Type': 'application/json' },
    { contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 8000 } });
  return {
    text: r.candidates[0].content.parts.map(p => p.text || '').join(''),
    inputTokens: r.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: r.usageMetadata?.candidatesTokenCount ?? 0
  };
}

async function post(url, headers, body) {
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`AI error ${res.status}: ${text.slice(0, 250)}`);
  return JSON.parse(text);
}

// ---------- Fallback (English only) ----------

function fallbackCards(articles) {
  return articles.map(a => ({
    category: a.category,
    korean_title: '',
    english_title: a.title,
    korean_desc: '',
    english_desc: firstSentence(a.description),
    url: a.link
  }));
}

function firstSentence(text) {
  return (text.split(/(?<=[.!?])\s/)[0] || '').slice(0, 200);
}

// ---------- Files ----------

async function writeCards(date, status, cards, note) {
  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  const data = { date, status, note, generated_at: new Date().toISOString(), cards };
  await writeFile(OUT_FILE, JSON.stringify(data, null, 2) + '\n');
}

async function loadUsage() {
  const month = seoulDate().slice(0, 7);
  const saved = await readJson(USAGE_FILE, null);
  return saved && saved.month === month ? saved : { month, spent_usd: 0 };
}

async function saveUsage(usage) {
  await mkdir(path.dirname(USAGE_FILE), { recursive: true });
  await writeFile(USAGE_FILE, JSON.stringify(usage, null, 2) + '\n');
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// The day is counted in Korea time, so the cards change at midnight in Seoul
function seoulDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
