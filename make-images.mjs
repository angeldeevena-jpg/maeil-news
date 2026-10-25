// Maeil News slide images.
// Each card gets 10 slides (cover, title, 7 sentence slides, credit), drawn from the same
// layouts as the design board (IG1–IG10). Saved as JPEG under docs/images/<region>/<card id>/.
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
export const IMAGE_VERSION = 2;

const W = 1080;
const H = 1350;
const FONT = 'system-ui, sans-serif';

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

function wrap(body) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>` +
    `html,body{margin:0;padding:0;width:${W}px;height:${H}px;overflow:hidden}` +
    `</style></head><body>${body}</body></html>`;
}

function logoImg(src, width) {
  return src ? `<img src="${src}" style="width: ${width}px; height: auto" alt="">` : '';
}

function photoImg(src) {
  return src
    ? `<img src="${src}" style="width: 150px; height: 150px; object-fit: cover; border-radius: 50%; border: 5px solid #141413" alt="">`
    : '';
}

// Slide 1: cover (yellow)
function coverSlide(c, logo, total) {
  const sticker = c.sticker || 'Read this one 👀';
  return wrap(`<div style="width: 1080px; height: 1350px; box-sizing: border-box; padding: 80px; background: #FFE04D; display: flex; flex-direction: column; font-family: ${FONT}; color: #000; overflow: hidden">
  <div style="display: flex; align-items: center; gap: 20px">
    ${logoImg(logo, 170)}
    <span style="font-size: 44px; font-weight: 900">Maeil News</span>
  </div>
  <div style="margin: auto 0; display: flex; flex-direction: column; gap: 48px">
    <div style="align-self: flex-start; padding: 16px 30px; background: #D4F36B; border: 6px solid #000; box-shadow: 12px 12px 0 #000; font-size: 40px; font-weight: 900; transform: rotate(-4deg)">${esc(sticker)}</div>
    <div style="font-size: 130px; font-weight: 900; line-height: 1.0; transform: rotate(-1deg)">${esc(c.hook || c.english_title)}</div>
  </div>
  <div style="display: flex; align-items: center; justify-content: space-between; font-size: 32px; font-weight: 800">
    <span>${esc((c.category || '').toUpperCase())} · swipe, nosy 👀</span>
    <span>1 / ${total}</span>
  </div>
</div>`);
}

// Slide 2: title (black)
function titleSlide(c, logo, total) {
  return wrap(`<div style="width: 1080px; height: 1350px; box-sizing: border-box; padding: 80px; background: #000; color: #FFE04D; display: flex; flex-direction: column; font-family: ${FONT}; overflow: hidden">
  <div style="display: flex; align-items: center; gap: 20px">
    ${logoImg(logo, 130)}
    <span style="font-size: 34px; font-weight: 900; color: #FFFFFF">Maeil News</span>
  </div>
  <div style="margin: auto 0">
    <div style="display: inline-block; padding: 10px 22px; background: #FF5FA2; color: #000; font-size: 30px; font-weight: 900; transform: rotate(2deg)">HEADLINE, BUT SPICY</div>
    <div style="margin-top: 40px; font-size: 80px; font-weight: 900; line-height: 1.05; color: #FFFFFF">${esc(c.english_title)}</div>
    <div style="margin-top: 40px; font-size: 72px; font-weight: 900; line-height: 1.2; color: #FFE04D">${esc(c.korean_title)}</div>
  </div>
  <div style="display: flex; align-items: center; justify-content: space-between; font-size: 32px; font-weight: 800; color: #FFFFFF">
    <span>Read it. Then say it out loud.</span>
    <span>2 / ${total}</span>
  </div>
</div>`);
}

// Glossary chips. Particles get the yellow box. An odd last chip spans both columns.
function glossaryChips(words, small) {
  const pad = small ? '8px 12px' : '10px 14px';
  const radius = small ? 14 : 16;
  const korSize = small ? 26 : 28;
  const romSize = small ? 19 : 20;
  const html = words.map((w, i) => {
    const span = words.length % 2 === 1 && i === words.length - 1 ? 'grid-column: span 2; ' : '';
    // Particles are highlighted in yellow, as on the design board
    const kor = w.particle
      ? `<span style="background: #FFE04D; color: #000; padding: 0 4px; border-radius: 6px">${esc(w.korean)}</span>`
      : esc(w.korean);
    const meaning = [w.roman, w.english].filter(Boolean).map(esc).join(' · ');
    return `<div style="padding: ${pad}; background: #141413; color: #FFFFFF; border-radius: ${radius}px; ${span}"><div style="font-size: ${korSize}px; font-weight: 900">${kor}</div><div style="font-size: ${romSize}px; color: #D4F36B">${meaning}</div></div>`;
  }).join('');
  return { html, gap: small ? 10 : 12 };
}

// Slides 3–9: one sentence each (lime). Labels follow the position: 2 setup, 3 juice, 2 payoff.
function sentenceSlide(s, i, total) {
  const [emoji, label] = i < 2 ? ['🎬', 'THE SETUP'] : i < 5 ? ['🍿', 'THE JUICE'] : ['🏆', 'THE PAYOFF'];
  const rot = i % 2 === 0 ? -1 : 1;
  const words = Array.isArray(s.glossary) ? s.glossary : [];
  const small = words.length >= 10;
  const { html: grid, gap } = glossaryChips(words, small);
  return wrap(`<div style="width: 1080px; height: 1350px; box-sizing: border-box; padding: 60px; background: #D4F36B; display: flex; flex-direction: column; gap: 28px; font-family: ${FONT}; color: #141413; overflow: hidden">
  <div style="display: flex; align-items: center; justify-content: space-between">
    <span style="padding: 10px 22px; font-size: 30px; font-weight: 900; background: #141413; color: #D4F36B; transform: rotate(-3deg)">${emoji} ${label}</span>
    <span style="font-size: 26px; font-weight: 900">Maeil News · ${i + 3} / ${total}</span>
  </div>
  <div style="padding: 40px; background: #FFFFFF; border: 6px solid #141413; box-shadow: 14px 14px 0 #141413; display: flex; flex-direction: column; gap: 22px; transform: rotate(${rot}deg)">
    <div style="font-size: 64px; font-weight: 900; line-height: 1.2">${esc(s.english)}</div>
    <div style="font-size: 56px; font-weight: 800; line-height: 1.35; color: #3A3A3A">${esc(s.korean)}</div>
  </div>
  <div style="display: flex; flex-direction: column; gap: 12px">
    <div style="font-size: 26px; font-weight: 800">Glossary · <span style="background: #FFE04D; padding: 0 6px">yellow</span> = particle (the tiny word that shows the job of the word before it)</div>
    <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: ${gap}px">${grid}</div>
  </div>
  <div style="margin-top: auto; font-size: 28px; font-weight: 800">Keep swiping 👀 →</div>
</div>`);
}

// Slide 10: credit (black)
function creditSlide(c, region, source, logo, photo, total) {
  const footer = region === 'korean' ? 'Follow for more Korean news' : 'Follow for more news';
  return wrap(`<div style="width: 1080px; height: 1350px; box-sizing: border-box; padding: 80px; background: #141413; color: #FFFFFF; display: flex; flex-direction: column; font-family: ${FONT}; overflow: hidden">
  <div style="display: flex; align-items: center; gap: 20px">
    ${logoImg(logo, 130)}
    <span style="font-size: 36px; font-weight: 900">Maeil News</span>
  </div>
  <div style="margin: auto 0; display: flex; flex-direction: column; gap: 36px">
    <div style="font-size: 30px; font-weight: 800; letter-spacing: 2px; color: #D4F36B">SOURCE, CREDIT AND AUTHOR</div>
    <div style="font-size: 56px; font-weight: 800; line-height: 1.25">Original news: ${esc(source)}.</div>
    <div style="font-size: 36px; line-height: 1.5">Read the original at ${esc(hostOf(c.url))}. This slide set summarises and translates the story. It does not reproduce the article.</div>
    <div style="display: flex; align-items: center; gap: 28px; padding: 28px; background: #D4F36B; color: #141413; border-radius: 28px">
      ${photoImg(photo)}
      <div style="display: flex; flex-direction: column; gap: 8px">
        <div style="font-size: 30px; font-weight: 800">Written and published by</div>
        <div style="font-size: 44px; font-weight: 900">Deevena Angel Thirupathi</div>
        <div style="font-size: 26px; font-weight: 700">Maeil News</div>
      </div>
    </div>
  </div>
  <div style="display: flex; align-items: center; justify-content: space-between; font-size: 28px; font-weight: 700">
    <span>${footer}</span>
    <span>${total} / ${total}</span>
  </div>
</div>`);
}

// All slides of one card, in order.
export function buildSlides(card, region, source, assets) {
  const sentences = Array.isArray(card.sentences) ? card.sentences : [];
  const total = sentences.length + 3;
  return [
    coverSlide(card, assets.logo, total),
    titleSlide(card, assets.logo, total),
    ...sentences.map((s, i) => sentenceSlide(s, i, total)),
    creditSlide(card, region, source, assets.logo, assets.photo, total)
  ];
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
