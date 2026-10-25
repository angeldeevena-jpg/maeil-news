// Maeil News slide images.
// Each card becomes a set of slides: cover, title, one or more sentence slides, credit.
// Layouts follow the design board (IG1–IG10). Saved as JPEG under docs/images/<region>/<card id>/.
// GitHub Pages serves them, and the widget's "Save images" button downloads them.
//
// Needs two files in the repo's assets folder:
//   assets/logo.png    the Maeil News logo
//   assets/author.jpg  the author photo (round on the last slide)
// If a file is missing, that picture is left out and everything else still works.

import { readFile, readdir, rm, stat, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

// Bump this when the slide layouts change: every card is then drawn again once.
export const IMAGE_VERSION = 18;

const W = 1080;
const H = 1350;
const FONT = 'system-ui, sans-serif';
const CHIPS_PER_SLIDE = 12;

export function imageFolderId(url) {
  return createHash('sha1').update(url).digest('hex').slice(0, 12);
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// Page wrapper. The script shrinks text that would otherwise run into the footer.
function wrap(body, script = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><style>` +
    `html,body{margin:0;padding:0;width:${W}px;height:${H}px;overflow:hidden;word-break:keep-all}` +
    `</style></head><body>${body}${script ? `<script>${script}</script>` : ''}</body></html>`;
}

function logoImg(src, width) {
  return src ? `<img src="${src}" style="width: ${width}px; height: auto" alt="">` : '';
}

function photoImg(src) {
  return src
    ? `<img src="${src}" style="width: 150px; height: 150px; object-fit: cover; border-radius: 50%; border: 5px solid #141413" alt="">`
    : '';
}

// Shrinks #id's font until its box is no taller than the box. Used for the long headlines.
const SHRINK_BOX = `
(function(){
  var el = document.getElementById('HEAD'), box = document.getElementById('BOX');
  var s = START;
  el.style.fontSize = s + 'px';
  while (el.getBoundingClientRect().height > box.clientHeight && s > MIN) {
    s -= 2; el.style.fontSize = s + 'px';
  }
})();`;

function shrinkScript(head, box, start, min) {
  return SHRINK_BOX.replace('HEAD', head).replace('BOX', box).replace('START', start).replace('MIN', min);
}

// Slide 1: cover (yellow). The headline shrinks so it never reaches the footer.
// Date shown on the slides, e.g. 26 Oct 2026
function dateText(c) {
  const d = new Date(String(c.date || '') + 'T00:00:00');
  if (!c.date || isNaN(d)) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function coverSlide(c, logo, total) {
  const sticker = c.sticker || 'Read the story';
  return wrap(`<div class="slide" style="width: 1080px; height: 1350px; box-sizing: border-box; padding: 70px 80px; background: #FFE04D; display: flex; flex-direction: column; font-family: ${FONT}; color: #000; overflow: hidden">
  <div style="display: flex; align-items: center; justify-content: space-between">
    <div style="display: flex; align-items: center; gap: 20px">
      ${logoImg(logo, 150)}
      <span style="font-size: 44px; font-weight: 900">Maeil News</span>
    </div>
    <span style="font-size: 30px; font-weight: 800">${esc(dateText(c))}</span>
  </div>
  <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 40px; min-height: 0">
    <div style="align-self: flex-start; padding: 16px 30px; background: #D4F36B; border: 6px solid #000; box-shadow: 12px 12px 0 #000; font-size: 40px; font-weight: 900; transform: rotate(-4deg)">${esc(sticker)}</div>
    <div id="box" style="flex: 1; display: flex; align-items: center; min-height: 0">
      <div id="head" style="font-size: 130px; font-weight: 900; line-height: 1.0; transform: rotate(-1deg)">${esc(c.hook || c.english_title)}</div>
    </div>
    ${c.korean_hook ? `<div style="font-size: 56px; font-weight: 800; line-height: 1.3; color: #3A3A3A">${esc(c.korean_hook)}</div>` : ''}
  </div>
  <div style="display: flex; align-items: center; justify-content: space-between; font-size: 32px; font-weight: 800">
    <span>${esc((c.category || '').toUpperCase())} · swipe to read on →</span>
    <span>1 / ${total}</span>
  </div>
</div>`, shrinkScript('head', 'box', 130, 48));
}

// Slide 2: title (black). Neutral label, the headline fills the middle of the slide.
function titleSlide(c, logo, total) {
  const fit = `(function(){var box=document.getElementById('main'),en=document.getElementById('en'),ko=document.getElementById('ko'),a=116,b=94;` +
    `while(box.scrollHeight>box.clientHeight&&a>60){a-=2;b-=2;en.style.fontSize=a+'px';ko.style.fontSize=b+'px';}})();`;
  return wrap(`<div class="slide" style="width: 1080px; height: 1350px; box-sizing: border-box; padding: 70px 80px; background: #000; color: #FFE04D; display: flex; flex-direction: column; font-family: ${FONT}; overflow: hidden">
  <div style="display: flex; align-items: center; justify-content: space-between">
    <div style="display: flex; align-items: center; gap: 20px">
      ${logoImg(logo, 130)}
      <span style="font-size: 34px; font-weight: 900; color: #FFFFFF">Maeil News</span>
    </div>
    <span style="font-size: 30px; font-weight: 800; color: #FFFFFF">${esc(dateText(c))}</span>
  </div>
  <div id="main" style="flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 40px; min-height: 0; overflow: hidden">
    <div style="align-self: flex-start; padding: 10px 22px; background: #FF5FA2; color: #000; font-size: 30px; font-weight: 900; transform: rotate(2deg)">THE HEADLINE</div>
    <div id="en" style="font-size: 116px; font-weight: 900; line-height: 1.05; color: #FFFFFF">${esc(c.source_title || c.english_title)}</div>
    <div id="ko" style="font-size: 94px; font-weight: 900; line-height: 1.2; color: #FFE04D">${esc(c.korean_title)}</div>
  </div>
  <div style="display: flex; align-items: center; justify-content: space-between; font-size: 32px; font-weight: 800; color: #FFFFFF">
    <span>Read it. Then say it out loud.</span>
    <span>2 / ${total}</span>
  </div>
</div>`, fit);
}

// Glossary chips. Particles get the yellow box. An odd last chip spans both columns.
function glossaryChips(words, small) {
  const pad = small ? '8px 12px' : '10px 14px';
  const radius = small ? 14 : 16;
  const korSize = small ? 26 : 28;
  const romSize = small ? 19 : 20;
  const html = words.map((w, i) => {
    const span = words.length % 2 === 1 && i === words.length - 1 ? 'grid-column: span 2; ' : '';
    const kor = w.particle
      ? `<span style="background: #FFE04D; color: #000; padding: 0 4px; border-radius: 6px">${esc(w.korean)}</span>`
      : esc(w.korean);
    const meaning = [w.roman, w.english].filter(Boolean).map(esc).join(' · ');
    return `<div style="padding: ${pad}; background: #141413; color: #FFFFFF; border-radius: ${radius}px; ${span}"><div style="font-size: ${korSize}px; font-weight: 900">${kor}</div><div style="font-size: ${romSize}px; color: #D4F36B">${meaning}</div></div>`;
  }).join('');
  return { html, gap: small ? 10 : 12 };
}

// Sentence slides (lime). The story card is 945px tall (70% of the slide).
// The glossary of every word in the sentence fills the rest, with the header and footer.
function sentenceSlide(s, words, i, n, total, part, date) {
  // The label follows the sentence's stage from the generator, so each step has its own name
  const STAGES = { context: ['🧭', 'THE BACKSTORY'], summary: ['📰', 'WHAT HAPPENED'], outcome: ['💡', 'WHAT IT MEANS'] };
  const [emoji, label] = STAGES[s.stage] || (i === 0 ? ['🧭', 'THE BACKSTORY'] : i === n - 1 ? ['💡', 'WHAT IT MEANS'] : ['📰', 'WHAT HAPPENED']);
  const rot = i % 2 === 0 ? -1 : 1;
  const chips = words.map(w => {
    // The whole word stays together; its particle or ending is highlighted inside it
    const suffix = w.suffix && w.korean.endsWith(w.suffix) ? w.suffix : '';
    const base = suffix ? w.korean.slice(0, -suffix.length) : w.korean;
    const kor = esc(base) + (suffix ? `<span style="background: #FFE04D; color: #000; border-radius: 6px; padding: 0 4px">${esc(suffix)}</span>` : '');
    const meaning = esc(w.english || '');
    return `<div style="min-width: 0; padding: 6px 12px; background: #141413; color: #FFFFFF; border-radius: 10px; display: flex; align-items: baseline; gap: 10px; white-space: nowrap; overflow: hidden"><span class="kor" style="font-size: 24px; font-weight: 900">${kor}</span><span style="font-size: 17px; font-weight: 700; color: #D4F36B; overflow: hidden; text-overflow: ellipsis">${meaning}</span></div>`;
  }).join('');
  // The sentence text shrinks if it does not fit the card; the glossary is scaled down if it does not fit its space
  const shrink = `(function(){var card=document.getElementById('card'),en=document.getElementById('en'),ko=document.getElementById('ko'),g=document.getElementById('gloss'),a=76,b=66,f=24;` +
    `while(card.scrollHeight>card.clientHeight&&a>30){a-=2;b-=2;en.style.fontSize=a+'px';ko.style.fontSize=b+'px';}` +
    `while(g&&g.scrollHeight>g.clientHeight&&f>12){f-=1;g.querySelectorAll('.kor').forEach(function(e){e.style.fontSize=f+'px';});}})();`;
  const glossary = words.length
    ? `<div id="gloss" style="flex: 1; min-height: 0; overflow: hidden; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; align-content: start">${chips}</div>`
    : '<div style="flex: 1"></div>';
  return wrap(`<div class="slide" style="width: 1080px; height: 1350px; box-sizing: border-box; padding: 36px 60px; background: #D4F36B; display: flex; flex-direction: column; gap: 16px; font-family: ${FONT}; color: #141413; overflow: hidden">
  <div style="flex: none; height: 60px; display: flex; align-items: center; justify-content: space-between">
    <span style="padding: 10px 22px; font-size: 30px; font-weight: 900; background: #141413; color: #D4F36B; transform: rotate(-3deg)">${emoji} ${label}</span>
    <span style="font-size: 26px; font-weight: 800">${esc(date || '')}</span>
  </div>
  <div id="card" style="flex: none; height: 945px; box-sizing: border-box; padding: 44px; background: #FFFFFF; border: 6px solid #141413; box-shadow: 14px 14px 0 #141413; display: flex; flex-direction: column; justify-content: center; gap: 26px; transform: rotate(${rot}deg); overflow: hidden">
    <div id="en" style="font-size: 76px; font-weight: 900; line-height: 1.2">${esc(s.english)}</div>
    <div id="ko" style="font-size: 66px; font-weight: 800; line-height: 1.35; color: #3A3A3A">${esc(s.korean)}</div>
  </div>
  ${glossary}
  <div style="flex: none; height: 40px; display: flex; align-items: center; justify-content: space-between; font-size: 28px; font-weight: 800">
    <span>Keep swiping 👀 →</span>
    <span>${part} / ${total}</span>
  </div>
</div>`, shrink);
}

// Why it matters: two or three short reasons from the story, English with the Korean line under each.
// The reasons fill the middle of the slide.
function whySlide(c, number, total, date) {
  const items = (c.why_it_matters || []).map((w, i) => `
    <div style="flex: 1; display: flex; align-items: center; gap: 28px; padding: 36px; background: #FFFFFF; border: 6px solid #141413; box-shadow: 10px 10px 0 #141413">
      <div style="flex: none; width: 80px; height: 80px; border-radius: 40px; background: #FFE04D; border: 4px solid #141413; font-size: 40px; font-weight: 900; display: flex; align-items: center; justify-content: center">${i + 1}</div>
      <div style="display: flex; flex-direction: column; gap: 18px">
        <div style="font-size: 46px; font-weight: 900; line-height: 1.3">${esc(w.english)}</div>
        <div style="font-size: 36px; font-weight: 700; line-height: 1.4; color: #3A3A3A">${esc(w.korean)}</div>
      </div>
    </div>`).join('');
  return wrap(`<div class="slide" style="width: 1080px; height: 1350px; box-sizing: border-box; padding: 36px 60px; background: #D4F36B; display: flex; flex-direction: column; gap: 16px; font-family: ${FONT}; color: #141413; overflow: hidden">
  <div style="flex: none; height: 60px; display: flex; align-items: center; justify-content: space-between">
    <span style="padding: 10px 22px; font-size: 30px; font-weight: 900; background: #141413; color: #D4F36B; transform: rotate(-3deg)">💡 WHY IT MATTERS</span>
    <span style="font-size: 26px; font-weight: 800">${esc(date || '')}</span>
  </div>
  <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 36px; min-height: 0">${items}</div>
  <div style="flex: none; height: 40px; display: flex; align-items: center; justify-content: space-between; font-size: 28px; font-weight: 800">
    <span>Keep swiping 👀 →</span>
    <span>${number} / ${total}</span>
  </div>
</div>`);
}

// Last slide: credit (black)
function creditSlide(c, region, source, logo, photo, total, date) {
  const footer = region === 'korean' ? 'Follow for more Korean news' : 'Follow for more news';
  return wrap(`<div class="slide" style="width: 1080px; height: 1350px; box-sizing: border-box; padding: 70px 80px; background: #141413; color: #FFFFFF; display: flex; flex-direction: column; font-family: ${FONT}; overflow: hidden">
  <div style="display: flex; align-items: center; justify-content: space-between">
    <div style="display: flex; align-items: center; gap: 20px">
      ${logoImg(logo, 130)}
      <span style="font-size: 36px; font-weight: 900">Maeil News</span>
    </div>
    <span style="font-size: 30px; font-weight: 800">${esc(date)}</span>
  </div>
  <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 48px; min-height: 0">
    <div style="font-size: 32px; font-weight: 800; letter-spacing: 2px; color: #D4F36B">SOURCE, CREDIT AND AUTHOR</div>
    <div style="font-size: 72px; font-weight: 800; line-height: 1.2">Original news: ${esc(source)}.</div>
    <div style="font-size: 44px; line-height: 1.5">Read the original at ${esc(hostOf(c.url))}. This slide set summarises and translates the story. It does not reproduce the article.</div>
    <div style="display: flex; align-items: center; gap: 32px; padding: 36px; background: #D4F36B; color: #141413; border-radius: 28px">
      ${photoImg(photo)}
      <div style="display: flex; flex-direction: column; gap: 10px">
        <div style="font-size: 34px; font-weight: 800">Written and published by</div>
        <div style="font-size: 50px; font-weight: 900">Deevena Angel Thirupathi</div>
        <div style="font-size: 30px; font-weight: 700">Maeil News</div>
      </div>
    </div>
  </div>
  <div style="display: flex; align-items: center; justify-content: space-between; font-size: 28px; font-weight: 700">
    <span>${footer}</span>
    <span>${total} / ${total}</span>
  </div>
</div>`);
}

// Words that are plain numbers are not shown on slides
function slideWords(sentence) {
  return (Array.isArray(sentence.glossary) ? sentence.glossary : [])
    .filter(w => w && w.korean && !/^[0-9.,%\s]+$/.test(String(w.korean).trim()))
    .slice(0, CHIPS_PER_SLIDE);
}

// Every slide of the card, in order. A sentence with more than 8 words is split over
// several slides, so nothing is cut off at the bottom.
export function planSlides(card) {
  const sentences = Array.isArray(card.sentences) ? card.sentences : [];
  const plan = [{ kind: 'cover' }, { kind: 'title' }];
  // One slide per sentence. The glossary (at most 8 words) fits on that same slide, so nothing repeats.
  sentences.forEach((s, i) => {
    plan.push({
      kind: 'sentence',
      sentence: s,
      words: slideWords(s),
      index: i,
      count: sentences.length,
      part: 1
    });
  });
  // Why it matters, only when the story has reasons (no empty slide)
  if (Array.isArray(card.why_it_matters) && card.why_it_matters.length > 0) plan.push({ kind: 'why' });
  // The credit slide comes once, at the end
  plan.push({ kind: 'credit' });
  return plan;
}

// All slides of one card, in order, as HTML pages.
export function buildSlides(card, region, source, assets) {
  const plan = planSlides(card);
  const total = plan.length;
  return plan.map((p, n) => {
    const number = n + 1;
    if (p.kind === 'cover') return coverSlide(card, assets.logo, total);
    if (p.kind === 'title') return titleSlide(card, assets.logo, total);
    if (p.kind === 'why') return whySlide(card, number, total, dateText(card));
    if (p.kind === 'sentence') return sentenceSlide(p.sentence, p.words, p.index, p.count, total, number, dateText(card));
    return creditSlide(card, region, source, assets.logo, assets.photo, total, dateText(card));
  });
}

async function renderCard(browser, card, region, source, assets, outDir) {
  await mkdir(outDir, { recursive: true });
  const slides = buildSlides(card, region, source, assets);
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const files = [];
  try {
    for (let i = 0; i < slides.length; i++) {
      await page.setContent(slides[i], { waitUntil: 'load' });
      const name = `${i + 1}.jpg`;
      await page.screenshot({ path: path.join(outDir, name), type: 'jpeg', quality: 85 });
      files.push(name);
    }
  } finally {
    await page.close();
  }
  return files;
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function imageDataUri(file, mime) {
  try {
    const bytes = await readFile(file);
    return `data:${mime};base64,${bytes.toString('base64')}`;
  } catch {
    return '';
  }
}

/**
 * Adds an `images` list to every card that has sentences.
 * Draws only the cards that do not have images of the current version yet, and removes
 * the folders of cards that left the feed. A problem is logged and the card is saved without images.
 */
export async function addImages(cards, region, rootDir, source) {
  const docsDir = path.join(rootDir, 'docs');
  const root = path.join(docsDir, 'images', region);
  const assets = {
    logo: await imageDataUri(path.join(rootDir, 'assets', 'logo.png'), 'image/png'),
    photo: await imageDataUri(path.join(rootDir, 'assets', 'author.jpg'), 'image/jpeg')
  };
  if (!assets.logo) console.log('No assets/logo.png found: slides will have no logo');
  if (!assets.photo) console.log('No assets/author.jpg found: credit slide will have no photo');

  const used = new Set();
  let browser = null;
  try {
    for (const card of cards) {
      if (!card.url || !Array.isArray(card.sentences) || card.sentences.length === 0) continue;
      const id = imageFolderId(card.url);
      used.add(id);

      const old = Array.isArray(card.images) ? card.images : [];
      if (card.images_v === IMAGE_VERSION && old.length > 0 &&
          (await Promise.all(old.map(p => exists(path.join(docsDir, p))))).every(Boolean)) {
        continue;
      }

      try {
        if (!browser) {
          const { chromium } = await import('playwright');
          browser = await chromium.launch({ args: ['--no-sandbox'] });
        }
        const dir = path.join(root, id);
        const files = await renderCard(browser, card, region, source, assets, dir);
        card.images = files.map(f => `images/${region}/${id}/${f}`);
        card.images_v = IMAGE_VERSION;
      } catch (err) {
        console.error(`Images failed for "${card.english_title}": ${err.message}`);
        card.images = [];
        card.images_v = 0;
      }
    }
  } finally {
    if (browser) await browser.close();
  }

  // Remove the folders of cards that are no longer in the feed
  try {
    for (const name of await readdir(root)) {
      if (!used.has(name)) await rm(path.join(root, name), { recursive: true, force: true });
    }
  } catch {
    // The folder does not exist yet: nothing to clean
  }

  const made = cards.filter(c => Array.isArray(c.images) && c.images.length > 0).length;
  console.log(`Slide images ready for ${made} of ${cards.length} cards`);
}
