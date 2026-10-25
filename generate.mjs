// Maeil News daily generator.
// Reads the news feeds for one region (REGION env var), asks the AI for one Korean card per article,
// and writes docs/<region file>.json. GitHub Pages publishes those files for the widget.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addImages } from './make-images.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const USAGE_FILE = path.join(ROOT, 'state', 'usage.json');
const PER_REGION = 24; // 24 cards per region, shared across its feeds
const BATCH_SIZE = 6; // cards per AI call, so each reply stays a manageable size
const MAX_SENTENCES = 9; // sentences per article (a long sentence can be split into two)
const MAX_BODY = 6000; // characters of article text sent to the AI
const MAX_GLOSSARY = 500; // no limit: the widget pages through every word

// Three news regions. Each writes its own file, so the widget can switch between them.
// Korean: Korea Herald (the file the widget already reads stays docs/cards.json)
// Indian and global: The Hindu. Feed addresses are the usual Hindu section feeds and
// must be confirmed on the first run (the log shows any feed that fails).
const REGIONS = {
  korean: {
    outFile: 'cards.json',
    source: 'The Korea Herald',
    feeds: [
      { category: 'Politics & Society', url: 'https://www.koreaherald.com/rss/kh_National', file: 'politics.xml' },
      { category: 'Business', url: 'https://www.koreaherald.com/rss/kh_Business', file: 'business.xml' },
      { category: 'Culture', url: 'https://www.koreaherald.com/rss/kh_LifenCulture', file: 'culture.xml' },
      { category: 'Sports', url: 'https://www.koreaherald.com/rss/kh_Sports', file: 'sports.xml' },
      { category: 'K-pop', url: 'https://www.koreaherald.com/rss/kh_Kpop', file: 'kpop.xml' },
      { category: 'World', url: 'https://www.koreaherald.com/rss/kh_World', file: 'world.xml' }
    ]
  },
  indian: {
    outFile: 'cards-indian.json',
    source: 'The Hindu',
    feeds: [
      { category: 'Politics & Society', url: 'https://www.thehindu.com/news/national/feeder/default.rss', file: 'h-national.xml' },
      { category: 'Business', url: 'https://www.thehindu.com/business/feeder/default.rss', file: 'h-business.xml' },
      { category: 'Culture', url: 'https://www.thehindu.com/life-and-style/feeder/default.rss', file: 'h-culture.xml' },
      { category: 'Sports', url: 'https://www.thehindu.com/sport/feeder/default.rss', file: 'h-sport.xml' },
      { category: 'K-pop', url: 'https://www.thehindu.com/entertainment/feeder/default.rss', file: 'h-entertainment.xml' },
      { category: 'World', url: 'https://www.thehindu.com/news/international/feeder/default.rss', file: 'h-international.xml' }
    ]
  },
  global: {
    outFile: 'cards-global.json',
    source: 'The Hindu',
    // Global news: The Hindu International section only, so every card is labelled World
    feeds: [
      { category: 'World', url: 'https://www.thehindu.com/news/international/feeder/default.rss', file: 'h-international.xml' }
    ]
  }
};

// Which region this run makes: set by the workflow (REGION=korean|indian|global), default korean
const REGION = process.env.REGION || 'korean';
if (!REGIONS[REGION]) throw new Error(`Unknown REGION "${REGION}"`);
const FEEDS = REGIONS[REGION].feeds;
const OUT_FILE = path.join(ROOT, 'docs', REGIONS[REGION].outFile);

const config = JSON.parse(await readFile(path.join(ROOT, 'config.json'), 'utf8'));

async function main() {
  const today = seoulDate();
  const previous = await readJson(OUT_FILE, null);
  const articles = await collectArticles();

  // Switched off: no AI calls at all
  if (!config.enabled) {
    await writeCards(today, 'off', fallbackCards(articles), 'AI is turned off. Showing English titles only.');
    console.log('AI is turned off in config.json. No AI call made.');
    return;
  }

  if (articles.length === 0) {
    const reasons = feedErrors.join(' | ').slice(0, 400) || 'feeds were empty';
    await writeCards(today, 'no articles', [], `No articles could be read for the ${REGION} region. ${reasons}`);
    console.log('No articles found.');
    return;
  }

  // Cards already made (same article link, with Korean text) are kept.
  // Only articles we have not seen before go to the AI.
  const cached = new Map();
  if (previous && Array.isArray(previous.cards)) {
    for (const c of previous.cards) {
      if (c.url && c.korean_desc && Array.isArray(c.sentences) && c.sentences.length > 0) cached.set(c.url, c);
    }
  }
  const fresh = articles.filter(a => !cached.has(a.link));
  const kept = articles.length - fresh.length;

  // Read the article page for each new article (the feed's short description is the fallback)
  let withText = 0;
  for (const a of fresh) {
    const body = await fetchArticleText(a.link);
    if (body) withText++;
    a.body = body || a.description;
  }
  if (fresh.length) console.log(`Article text found for ${withText} of ${fresh.length} new articles`);

  const usage = await loadUsage();
  let status = 'ai';
  let note = '';
  let newCards = [];

  if (fresh.length === 0) {
    note = `No new articles. ${kept} cards kept from earlier days.`;
  } else if (usage.spent_usd >= config.monthly_cap_usd) {
    status = 'cap reached';
    note = `Monthly cap of $${config.monthly_cap_usd} reached`;
    newCards = fallbackCards(fresh);
  } else if (!process.env.AI_API_KEY) {
    status = 'no key';
    note = 'AI_API_KEY secret is missing';
    newCards = fallbackCards(fresh);
  } else {
    try {
      const { items, costUsd } = await translateAll(fresh);
      usage.spent_usd += costUsd;
      newCards = fresh.map((a, i) => {
        if (!items[i]) return fallbackCards([a])[0];
        const sentences = normalizeSentences(items[i].sentences);
        // The widget's WORDS pages come from the Korean description, in reading order, no repeats.
        // Each word has its romanization and a particle flag (particles are shown highlighted).
        const seen = new Set();
        const glossary = [];
        for (const sen of sentences) {
          for (const g of sen.glossary) {
            if (!seen.has(g.korean) && glossary.length < MAX_GLOSSARY) { seen.add(g.korean); glossary.push(g); }
          }
        }
        return {
          category: a.category,
          korean_title: items[i].korean_title,
          english_title: items[i].english_title,
          korean_desc: sentences.map(x => x.korean).join(' '),
          english_desc: sentences.map(x => x.english).join(' '),
          hook: items[i].hook || '',
          sticker: items[i].sticker || '',
          korean_hook: items[i].korean_hook || '',
          glossary,
          sentences,
          url: a.link
        };
      });
      note = `${fresh.length} new cards made, ${kept} kept. Cost this run about $${costUsd.toFixed(4)}`;
    } catch (err) {
      // Usually "no credits" or a network problem: English-only cards for the new ones, retried tomorrow
      status = 'fallback';
      note = err.message.slice(0, 300);
      newCards = fallbackCards(fresh);
    }
  }

  // Final list follows the feed order and drops articles no longer in the feed
  const byUrl = new Map(newCards.map(c => [c.url, c]));
  const cards = articles.map(a => cached.get(a.link) || byUrl.get(a.link)).filter(Boolean);

  // Slide images for the Save images button (only cards that do not have them yet)
  for (const c of cards) { fixGlossary(c); addShortText(c); }
  await addImages(cards, REGION, ROOT, REGIONS[REGION].source);

  await saveUsage(usage);
  await writeCards(today, status, cards, note);
  console.log(`Wrote ${cards.length} cards (${fresh.length} new, ${kept} kept). Status: ${status}. ${note}`);
}

// ---------- News feeds ----------

let feedErrors = [];

async function collectArticles() {
  const out = [];
  feedErrors = [];
  for (const feed of FEEDS) {
    try {
      const xml = await loadFeed(feed);
      // Newest first, so the four cards are the latest stories in each section
      const items = parseItems(xml)
        .filter(i => i.title && i.link)
        .sort((a, b) => (Date.parse(b.pubDate) || 0) - (Date.parse(a.pubDate) || 0))
        .slice(0, Math.floor(PER_REGION / FEEDS.length));
      items.forEach(i => out.push({ category: feed.category, title: i.title, link: i.link, description: i.description }));
      console.log(`${feed.category}: ${items.length} articles`);
      if (items.length === 0) feedErrors.push(`${feed.category}: no items in feed`);
    } catch (err) {
      console.error(`${feed.category} failed: ${err.message}`);
      feedErrors.push(`${feed.category}: ${err.message}`);
    }
  }
  return out.slice(0, PER_REGION);
}

async function loadFeed(feed) {
  // Offline testing: read saved feed files instead of the internet
  if (process.env.FIXTURE_DIR) {
    return readFile(path.join(process.env.FIXTURE_DIR, feed.file), 'utf8');
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
      description: readTag(body, 'description'),
      pubDate: readTag(body, 'pubDate')
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
  const provider = process.env.AI_PROVIDER || config.provider;
  const key = process.env.AI_API_KEY;
  const p = config.price_per_million_tokens;
  // One bad article used to fail its whole batch and leave every card in it blank.
  // Now a failed batch is retried one article at a time, and only an article that fails
  // on its own is left out (null), so it gets an English-only card and is tried again tomorrow.
  const items = new Array(articles.length).fill(null);
  let costUsd = 0;
  const ask = async (batch) => {
    const prompt = buildPrompt(batch);
    let reply;
    if (provider === 'claude') reply = await callClaude(key, prompt);
    else if (provider === 'gemini') reply = await callGemini(key, prompt);
    else reply = await callOpenAI(key, prompt);
    costUsd += (reply.inputTokens * p.input + reply.outputTokens * p.output) / 1_000_000;
    return parseCardsJson(reply.text, batch.length);
  };
  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);
    try {
      (await ask(batch)).forEach((item, j) => { items[i + j] = item; });
    } catch (err) {
      console.log(`Batch of ${batch.length} failed (${err.message.slice(0, 200)}). Trying one article at a time.`);
      for (let j = 0; j < batch.length; j++) {
        try {
          const [one] = await ask([batch[j]]);
          items[i + j] = one;
        } catch (err2) {
          console.log(`Article left for tomorrow: ${batch[j].title} (${err2.message.slice(0, 200)})`);
        }
      }
    }
  }
  return { items, costUsd };
}

function buildPrompt(batch) {
  const list = batch
    .map((a, i) => `${i + 1}. [${a.category}] ${a.title}\n   ARTICLE TEXT:\n${a.body.slice(0, MAX_BODY)}`)
    .join('\n\n');
  return `You make one learner card for each news article below, for a beginner to intermediate Korean learner.
Write everything in your own words. Do not copy sentences from the article.
Keep every fact exactly as the article states it. Write the hook and titles clearly and respectfully. Be playful only when the story is light (culture, sports, science, food). For serious news (crime, violence, war, disasters, deaths, illness, abuse, accidents, disputes over rights) use a calm, factual tone with no jokes, slang or teasing, and never make light of anyone who is hurt or affected. Never add a fact, number, name or quote that is not in the article.

Return ONLY a JSON array with exactly ${batch.length} objects, in the same order as the articles. Each object has:
- "korean_title": a natural Korean headline, under 30 Korean characters
- "english_title": a clear, short English headline
- "hook": the headline hook. Plain words, under 10 words, that states the key point of the story clearly, in the form "Korea aimed for 21 golds. It won 29." Accurate, and it must not add any fact. Use a contrast only when the facts support it and the story is not serious.
- "korean_hook": the same hook in simple, natural Korean, under 30 characters, with the same tone
- "sticker": a short line for the cover sticker, under 6 words, that fits the story's tone: light for light news (for example "Good news from the stadium"), and plain and respectful for serious news (for example "What the court decided"). No emoji for serious news; at most one emoji for light news.
- "sentences": between 6 and ${MAX_SENTENCES} objects in reading order. Start with context, then summary, then outcome. Together the sentences must tell one complete story in order: first who or what it is about and when and where it happened, then what happened, then the result or what comes next. Each sentence must follow from the one before it, so a reader gets the whole story from the slides alone, with no sudden jumps. Use 5 to 7 sentences. Keep each English sentence under 25 words, except the "summary" sentence. The "summary" sentence is the card's short description: make it 12 to 18 words, complete and self-contained, naming who did what, where and when, with the key number or result, so a reader understands the news from that one sentence alone. Each object has:
  - "stage": "context" (what the story is about), "summary" (what happened) or "outcome" (the result or why it matters)
  - "english": one clear English sentence, under 25 words
  - "korean": the Korean translation of that sentence, simple and natural. It must carry every fact, number and detail of the English sentence. For example, "seven golds" must appear in Korean as 금메달 7개.
  - "glossary": EVERY word of the Korean sentence, in order, one item per word, as {"korean": "the word exactly as written in the sentence", "roman": "its romanization, REQUIRED for every item, with a hyphen inside each word, e.g. joehoesu-neun", "english": "a short meaning", "particle": false, "suffix": "the particle or ending at the very end of the word (such as 의, 에는, 이다), or empty if none"}. A word and the particle attached to it are ONE item with the particle included, for example "BTS의" (roman "BTS-ui", english "BTS's") or "아리랑에는" (roman "Arirang-eneun", english "in Arirang"). Never split a word from its particle. Include names of people, teams, places and events too. Skip only punctuation and numbers written with digits (such as 14); a Korean word that contains a number (such as 14곡과) is kept. Always set "particle" to false.
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
    for (const field of ['korean_title', 'english_title']) {
      if (typeof item[field] !== 'string' || !item[field].trim()) {
        throw new Error(`AI card is missing ${field}`);
      }
    }
    const good = normalizeSentences(item.sentences);
    if (good.length === 0) throw new Error('AI card has no usable sentences');
  }
  return items;
}

// Keeps only well-formed sentence pairs, in the order given
function normalizeSentences(list) {
  if (!Array.isArray(list)) return [];
  const stages = ['context', 'summary', 'outcome'];
  return list
    .filter(s => s && typeof s.english === 'string' && s.english.trim() && typeof s.korean === 'string' && s.korean.trim())
    .slice(0, MAX_SENTENCES)
    .map(s => ({
      stage: stages.includes(s.stage) ? s.stage : 'summary',
      english: s.english.trim(),
      korean: s.korean.trim(),
      glossary: cleanGlossary(s.glossary, s.korean.trim())
    }));
}

// Glossary words must really appear in their Korean sentence, listed in the order they appear.
// At most 8 per sentence, no plain numbers.
function cleanGlossary(list, korean) {
  const found = (Array.isArray(list) ? list : [])
    .filter(g => g && g.korean && g.english)
    .map(g => ({
      korean: String(g.korean).trim(),
      roman: String(g.roman || ''),
      english: String(g.english),
      particle: g.particle === true,
      suffix: String(g.suffix || '').trim()
    }))
    .filter(g => g.korean && !/^[0-9.,%\s]+$/.test(g.korean)) // plain numbers only; 5집 stays
    .map(g => ({ g, start: korean.indexOf(g.korean) }))
    .filter(x => x.start >= 0)
    .sort((a, b) => a.start - b.start);
  // A particle written right after a word is part of that word: BTS + 의 becomes BTS의
  const out = [];
  let last = null; // { item, end }
  for (const { g, start } of found) {
    if (last && g.particle && start === last.end) {
      last.item.korean += g.korean;
      last.item.roman = [last.item.roman, g.roman].filter(Boolean).join('-');
      last.item.suffix = g.korean;
      last.end = start + g.korean.length;
      continue;
    }
    const item = { ...g, particle: false };
    if (item.particle && !item.suffix) item.suffix = item.korean;
    // The suffix must be the very end of the word; otherwise it is not highlighted
    if (item.suffix && (!item.korean.endsWith(item.suffix) || item.suffix === item.korean && !item.particle)) item.suffix = '';
    out.push(item);
    last = { item, end: start + g.korean.length };
  }
  return out;
}

// Applies the same glossary rules to cards made earlier, and rebuilds the card's word list
function fixGlossary(card) {
  if (!Array.isArray(card.sentences)) return;
  for (const s of card.sentences) s.glossary = cleanGlossary(s.glossary, String(s.korean || '').trim());
}

// The short description shown on the widget: one summary sentence in English and in Korean
function addShortText(card) {
  const list = Array.isArray(card.sentences) ? card.sentences : [];
  if (list.length === 0) return;
  const pick = list.find(s => s.stage === 'summary') || list[0];
  card.short_english = pick.english;
  card.short_korean = pick.korean;
  // The widget's WORDS are the words of the short Korean line shown on the card, nothing else
  card.glossary = pick.glossary;
}

// Reads the article page and keeps its paragraphs. Returns '' if the page cannot be read.
async function fetchArticleText(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return '';
    const html = await res.text();
    const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map(m => cleanText(m[1]))
      .filter(t => t.length > 60);
    return paras.join('\n').slice(0, MAX_BODY);
  } catch {
    return '';
  }
}

async function callOpenAI(key, prompt) {
  const r = await post('https://api.openai.com/v1/chat/completions',
    { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    { model: config.model, messages: [{ role: 'user', content: prompt }], max_completion_tokens: 20000 });
  return {
    text: r.choices[0].message.content,
    inputTokens: r.usage?.prompt_tokens ?? 0,
    outputTokens: r.usage?.completion_tokens ?? 0
  };
}

async function callClaude(key, prompt) {
  const r = await post('https://api.anthropic.com/v1/messages',
    { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    { model: config.model, max_tokens: 20000, messages: [{ role: 'user', content: prompt }] });
  return {
    text: r.content.map(c => c.text || '').join(''),
    inputTokens: r.usage?.input_tokens ?? 0,
    outputTokens: r.usage?.output_tokens ?? 0
  };
}

async function callGemini(key, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${encodeURIComponent(key)}`;
  const r = await post(url, { 'Content-Type': 'application/json' },
    { contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 20000 } });
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
    hook: '',
    korean_hook: '',
    glossary: [],
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
