// Maeil News slide images.
// Each card becomes a set of slides: hook (cover), title, sentence slides, an optional body slide,
// an optional "why it matters" slide, and a credit slide. Saved as JPEG under docs/images/<region>/<card id>/.
//
// Layouts and colours follow the approved artboards: Flow-<category> (skins and slide flow) and
// F1–F9 (hook and body formats). Each category has its own skin (skinFor).
// Hook formats: question-reveal, question-clues, question-chat, question-myth (question cover),
//               headline (question cover with the story's hook), number, vocab.
// Body formats: two_views, three_points, timeline, before_after, who_speaks, whats_missing,
//               another_view, map_place, poll. The generator decides which ones a card may use.
//
// Needs two files in the repo's assets folder:
//   assets/logo.png    the Maeil News logo
//   assets/author.jpg  the author photo (round, on the last slide)
// If a file is missing, that picture is left out and everything else still works.

import { readFile, readdir, rm, stat, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

// Bump this when the slide layouts or skins change: every card is then drawn again once.
export const IMAGE_VERSION = 26;

const W = 1080;
const H = 1350;
const FONT = 'system-ui, sans-serif';
const CHIPS_PER_SLIDE = 12;
const FOOTER_SWIPE = 'Keep swiping 👀 →';

// ---------- Skins: colours from the Flow artboards ----------
// cardRot: tilt of the sentence card. stickerBorder: border of the cover sticker.
// upper: the cover question is shown in capitals (Sports).

const DEFAULT_SKIN = {
  coverBg: '#FFE04D', coverFg: '#000000', coverKo: '#3A3A3A',
  stickerBg: '#D4F36B', stickerFg: '#000000', stickerBorder: '#000000', stickerShadow: '#000000',
  titleBg: '#000000', titleFg: '#FFFFFF', titleLabelBg: '#FF5FA2', titleLabelFg: '#000000', titleKo: '#FFE04D',
  sentBg: '#D4F36B', cardBg: '#FFFFFF', cardBorder: '#141413', cardShadow: '#141413', cardRot: 1,
  labelBg: '#141413', labelFg: '#D4F36B', text: '#141413', ko: '#3A3A3A',
  chipBg: '#141413', chipFg: '#FFFFFF', chipMean: '#D4F36B',
  creditBg: '#141413', creditFg: '#FFFFFF', creditEyebrow: '#D4F36B', creditBox: '#D4F36B', creditBoxFg: '#141413', photoBorder: '#141413',
  upper: false
};

const SKINS = {
  Culture: {
    coverBg: '#F3E3D0', coverFg: '#3B2418', coverKo: '#6B4A36',
    stickerBg: '#A8482C', stickerFg: '#F3E3D0', stickerBorder: '#3B2418', stickerShadow: '#3B2418',
    titleBg: '#3B2418', titleFg: '#F3E3D0', titleLabelBg: '#A8482C', titleLabelFg: '#F3E3D0', titleKo: '#E9B98F',
    sentBg: '#F3E3D0', cardBg: '#FFFFFF', cardBorder: '#3B2418', cardShadow: '#3B2418', cardRot: -1,
    labelBg: '#3B2418', labelFg: '#F3E3D0', text: '#3B2418', ko: '#6B4A36',
    chipBg: '#3B2418', chipFg: '#F3E3D0', chipMean: '#E9B98F',
    creditBg: '#3B2418', creditFg: '#F3E3D0', creditEyebrow: '#E9B98F', creditBox: '#F3E3D0', creditBoxFg: '#3B2418', photoBorder: '#3B2418',
    upper: false
  },
  'Politics & Society': {
    coverBg: '#FFFFFF', coverFg: '#1B2A41', coverKo: '#5A6475',
    stickerBg: '#1B2A41', stickerFg: '#FFFFFF', stickerBorder: '#1B2A41', stickerShadow: '#5A6475',
    titleBg: '#1B2A41', titleFg: '#FFFFFF', titleLabelBg: '#FFFFFF', titleLabelFg: '#1B2A41', titleKo: '#C9D3E0',
    sentBg: '#E6EBF2', cardBg: '#FFFFFF', cardBorder: '#1B2A41', cardShadow: '#1B2A41', cardRot: 1,
    labelBg: '#1B2A41', labelFg: '#E6EBF2', text: '#1B2A41', ko: '#5A6475',
    chipBg: '#1B2A41', chipFg: '#E6EBF2', chipMean: '#C9D3E0',
    creditBg: '#1B2A41', creditFg: '#FFFFFF', creditEyebrow: '#C9D3E0', creditBox: '#FFFFFF', creditBoxFg: '#1B2A41', photoBorder: '#1B2A41',
    upper: false
  },
  Business: {
    coverBg: '#CFF5E4', coverFg: '#064E3B', coverKo: '#2F5D4A',
    stickerBg: '#047857', stickerFg: '#FFFFFF', stickerBorder: '#064E3B', stickerShadow: '#064E3B',
    titleBg: '#064E3B', titleFg: '#FFFFFF', titleLabelBg: '#047857', titleLabelFg: '#FFFFFF', titleKo: '#6EE7B7',
    sentBg: '#ECFDF5', cardBg: '#FFFFFF', cardBorder: '#064E3B', cardShadow: '#064E3B', cardRot: 1,
    labelBg: '#047857', labelFg: '#FFFFFF', text: '#064E3B', ko: '#2F5D4A',
    chipBg: '#064E3B', chipFg: '#FFFFFF', chipMean: '#6EE7B7',
    creditBg: '#064E3B', creditFg: '#FFFFFF', creditEyebrow: '#6EE7B7', creditBox: '#CFF5E4', creditBoxFg: '#064E3B', photoBorder: '#047857',
    upper: false
  },
  Sports: {
    coverBg: '#D4F36B', coverFg: '#141413', coverKo: '#141413',
    stickerBg: '#141413', stickerFg: '#D4F36B', stickerBorder: '#141413', stickerShadow: '#FFE04D',
    titleBg: '#141413', titleFg: '#FFFFFF', titleLabelBg: '#D4F36B', titleLabelFg: '#141413', titleKo: '#FFE04D',
    sentBg: '#FFE04D', cardBg: '#FFFFFF', cardBorder: '#141413', cardShadow: '#141413', cardRot: 1,
    labelBg: '#141413', labelFg: '#D4F36B', text: '#141413', ko: '#3A3A3A',
    chipBg: '#141413', chipFg: '#FFFFFF', chipMean: '#D4F36B',
    creditBg: '#141413', creditFg: '#FFFFFF', creditEyebrow: '#D4F36B', creditBox: '#FF7A59', creditBoxFg: '#141413', photoBorder: '#141413',
    upper: true
  },
  Entertainment: {
    coverBg: '#7B3FE4', coverFg: '#FFFFFF', coverKo: '#F1EAFD',
    stickerBg: '#FF5FA2', stickerFg: '#141413', stickerBorder: '#141413', stickerShadow: '#141413',
    titleBg: '#FF5FA2', titleFg: '#141413', titleLabelBg: '#7B3FE4', titleLabelFg: '#FFFFFF', titleKo: '#FFFFFF',
    sentBg: '#F1EAFD', cardBg: '#FFFFFF', cardBorder: '#7B3FE4', cardShadow: '#FF5FA2', cardRot: 1,
    labelBg: '#7B3FE4', labelFg: '#FFFFFF', text: '#141413', ko: '#4A3A66',
    chipBg: '#7B3FE4', chipFg: '#FFFFFF', chipMean: '#FFE04D',
    creditBg: '#7B3FE4', creditFg: '#FFFFFF', creditEyebrow: '#FFE04D', creditBox: '#FFE04D', creditBoxFg: '#141413', photoBorder: '#141413',
    upper: false
  },
  World: {
    coverBg: '#F6F4EE', coverFg: '#141413', coverKo: '#3A3A37',
    stickerBg: '#0E6F8F', stickerFg: '#FFFFFF', stickerBorder: '#141413', stickerShadow: '#141413',
    titleBg: '#141413', titleFg: '#FFFFFF', titleLabelBg: '#0E6F8F', titleLabelFg: '#FFFFFF', titleKo: '#D9E8EE',
    sentBg: '#F6F4EE', cardBg: '#FFFFFF', cardBorder: '#141413', cardShadow: '#0E6F8F', cardRot: 1,
    labelBg: '#0E6F8F', labelFg: '#FFFFFF', text: '#141413', ko: '#3A3A37',
    chipBg: '#0E6F8F', chipFg: '#FFFFFF', chipMean: '#FFFFFF',
    creditBg: '#141413', creditFg: '#FFFFFF', creditEyebrow: '#7FD3E8', creditBox: '#F6F4EE', creditBoxFg: '#141413', photoBorder: '#0E6F8F',
    upper: false
  }
};
// K-pop cards use the Entertainment skin
SKINS['K-pop'] = SKINS.Entertainment; // older cards with the old label

export function skinFor(category) {
  return { ...DEFAULT_SKIN, ...(SKINS[category] || {}) };
}

// ---------- Helpers ----------

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

// Page wrapper. The script shrinks text that would otherwise run into the footer.
function wrap(body, script = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><style>` +
    `html,body{margin:0;padding:0;width:${W}px;height:${H}px;overflow:hidden;word-break:keep-all}` +
    `</style></head><body>${body}${script ? `<script>${script}</script>` : ''}</body></html>`;
}

function logoImg(src, width) {
  return src ? `<img src="${src}" style="width: ${width}px; height: auto" alt="">` : '';
}

function photoImg(src, border) {
  return src
    ? `<img src="${src}" style="width: 150px; height: 150px; object-fit: cover; border-radius: 50%; border: 5px solid ${border}" alt="">`
    : '';
}

// Shrinks #head's font until its box is no taller than #box. Used for the long hooks.
function shrinkScript(head, box, start, min) {
  return `(function(){
  var el = document.getElementById('${head}'), box = document.getElementById('${box}');
  var s = ${start};
  el.style.fontSize = s + 'px';
  while (el.getBoundingClientRect().height > box.clientHeight && s > ${min}) {
    s -= 2; el.style.fontSize = s + 'px';
  }
})();`;
}

// Date shown on the slides, e.g. 26 Oct 2026
function dateText(c) {
  const d = new Date(String(c.date || '') + 'T00:00:00');
  if (!c.date || isNaN(d)) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Words that are plain numbers are not shown on slides; each word once per slide
function slideWords(sentence) {
  return (Array.isArray(sentence.glossary) ? sentence.glossary : [])
    .filter(w => w && w.korean && !/^[0-9.,%\s]+$/.test(String(w.korean).trim()))
    .filter((w, i, all) => all.findIndex(x => x.korean === w.korean) === i)
    .slice(0, CHIPS_PER_SLIDE);
}

// Shared header of the cover and the title slide: logo, name and date
function topBar(c, logo, sk, logoW, nameSize, dateSize, color) {
  return `<div style="display: flex; align-items: center; justify-content: space-between">
    <div style="display: flex; align-items: center; gap: 20px">${logoImg(logo, logoW)}<span style="font-size: ${nameSize}px; font-weight: 900; color: ${color}">Maeil News</span></div>
    <span style="font-size: ${dateSize}px; font-weight: 800; color: ${color}">${esc(dateText(c))}</span>
  </div>`;
}

// ---------- Hook: the cover ----------

const QUESTION_STICKER = {
  'question-reveal': 'Do you know?',
  'question-clues': 'Three clues',
  'question-chat': 'Quick question',
  'question-myth': 'Myth or fact?'
};

// The first Korean word of the story that has a glossary entry (for the vocabulary hook)
function firstWord(c) {
  for (const s of Array.isArray(c.sentences) ? c.sentences : []) {
    const w = (s.glossary || []).find(g => g && g.korean && !/^[0-9.,%\s]+$/.test(String(g.korean)));
    if (w) return w;
  }
  return null;
}

// Which cover to draw: a big number, a vocabulary word, or the question cover (used by the question
// and headline hooks). Falls back to the question cover when the chosen hook has no data.
function hookParts(c) {
  const d = c.format_data || {};
  const fmt = c.hook_format;
  if (fmt === 'number' && d.number && d.number.value) {
    return { kind: 'number', big: String(d.number.value), label: d.number.label || '', ko: d.number.korean_label || c.korean_hook || '' };
  }
  if (fmt === 'vocab') {
    const w = firstWord(c);
    if (w) return { kind: 'vocab', word: w.korean, sub: [w.roman, w.english].filter(Boolean).join(' · '), ko: c.korean_hook || '' };
  }
  if (QUESTION_STICKER[fmt] && c.question) {
    return { kind: 'question', sticker: QUESTION_STICKER[fmt], big: c.question, ko: c.korean_question || '' };
  }
  return { kind: 'question', sticker: c.sticker || 'Read the story', big: c.hook || c.english_title || '', ko: c.korean_hook || '' };
}

// Slide 1: the hook. Each hook keeps its artboard layout: question (Flow cover), number (F2) or vocabulary (F4)
function coverSlide(c, logo, total, sk) {
  const h = hookParts(c);
  const cat = esc((c.category || '').toUpperCase());
  const shell = (inner, footer, script = '') => wrap(`<div class="slide" style="width: 1080px; height: 1350px; box-sizing: border-box; padding: 70px 80px; background: ${sk.coverBg}; display: flex; flex-direction: column; font-family: ${FONT}; color: ${sk.coverFg}; overflow: hidden">
  ${topBar(c, logo, sk, 150, 44, 30, sk.coverFg)}
  ${inner}
  <div style="display: flex; align-items: center; justify-content: space-between; font-size: 32px; font-weight: 800">
    <span>${footer}</span>
    <span>1 / ${total}</span>
  </div>
</div>`, script);

  if (h.kind === 'number') {
    const inner = `<div style="flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 40px; min-height: 0">
    <div id="box" style="flex: 1; display: flex; align-items: center; min-height: 0"><div id="head" style="font-size: 300px; font-weight: 900; line-height: 1.0">${esc(h.big)}</div></div>
    ${h.label ? `<div style="font-size: 60px; font-weight: 900; line-height: 1.2">${esc(h.label)}</div>` : ''}
    ${h.ko ? `<div style="font-size: 44px; font-weight: 800; line-height: 1.3; color: ${sk.coverKo}">${esc(h.ko)}</div>` : ''}
  </div>`;
    return shell(inner, `${cat} · swipe for the meaning →`, shrinkScript('head', 'box', 300, 120));
  }

  if (h.kind === 'vocab') {
    const inner = `<div style="flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 40px; min-height: 0">
    <div style="align-self: flex-start; padding: 16px 30px; background: ${sk.stickerBg}; color: ${sk.stickerFg}; border: 6px solid ${sk.stickerBorder}; box-shadow: 12px 12px 0 ${sk.stickerShadow}; font-size: 40px; font-weight: 900; transform: rotate(-4deg)">Word of the story</div>
    <div id="box" style="flex: 1; display: flex; align-items: center; min-height: 0"><div id="head" style="font-size: 200px; font-weight: 900; line-height: 1.0">${esc(h.word)}</div></div>
    ${h.sub ? `<div style="font-size: 52px; font-weight: 800; line-height: 1.3; color: ${sk.coverKo}">${esc(h.sub)}</div>` : ''}
    ${h.ko ? `<div style="font-size: 44px; font-weight: 800; line-height: 1.3; color: ${sk.coverKo}">${esc(h.ko)}</div>` : ''}
  </div>`;
    return shell(inner, `${cat} · swipe to see it in the news →`, shrinkScript('head', 'box', 200, 90));
  }

  const bigStyle = `font-size: 130px; font-weight: 900; line-height: 1.0; transform: rotate(-1deg)${sk.upper ? '; text-transform: uppercase' : ''}`;
  const inner = `<div style="flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 40px; min-height: 0">
    <div style="align-self: flex-start; padding: 16px 30px; background: ${sk.stickerBg}; color: ${sk.stickerFg}; border: 6px solid ${sk.stickerBorder}; box-shadow: 12px 12px 0 ${sk.stickerShadow}; font-size: 40px; font-weight: 900; transform: rotate(-4deg)">${esc(h.sticker)}</div>
    <div id="box" style="flex: 1; display: flex; align-items: center; min-height: 0"><div id="head" style="${bigStyle}">${esc(h.big)}</div></div>
    ${h.ko ? `<div style="font-size: 56px; font-weight: 800; line-height: 1.3; color: ${sk.coverKo}">${esc(h.ko)}</div>` : ''}
  </div>`;
  return shell(inner, `${cat} · swipe to read on →`, shrinkScript('head', 'box', 130, 48));
}

// ---------- Title and sentence slides ----------

// Slide 2: the story's own headline, in English and Korean
function titleSlide(c, logo, total, sk) {
  const fit = `(function(){var box=document.getElementById('main'),en=document.getElementById('en'),ko=document.getElementById('ko'),a=116,b=94;` +
    `while(box.scrollHeight>box.clientHeight&&a>60){a-=2;b-=2;en.style.fontSize=a+'px';ko.style.fontSize=b+'px';}})();`;
  return wrap(`<div class="slide" style="width: 1080px; height: 1350px; box-sizing: border-box; padding: 70px 80px; background: ${sk.titleBg}; color: ${sk.titleKo}; display: flex; flex-direction: column; font-family: ${FONT}; overflow: hidden">
  ${topBar(c, logo, sk, 130, 34, 30, sk.titleFg)}
  <div id="main" style="flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 40px; min-height: 0; overflow: hidden">
    <div style="align-self: flex-start; padding: 10px 22px; background: ${sk.titleLabelBg}; color: ${sk.titleLabelFg}; font-size: 30px; font-weight: 900; transform: rotate(2deg)">THE HEADLINE</div>
    <div id="en" style="font-size: 116px; font-weight: 900; line-height: 1.05; color: ${sk.titleFg}">${esc(c.english_title || c.source_title)}</div>
    <div id="ko" style="font-size: 94px; font-weight: 900; line-height: 1.2; color: ${sk.titleKo}">${esc(c.korean_title)}</div>
  </div>
  <div style="display: flex; align-items: center; justify-content: space-between; font-size: 32px; font-weight: 800; color: ${sk.titleFg}">
    <span>Read it. Then say it out loud.</span>
    <span>2 / ${total}</span>
  </div>
</div>`, fit);
}

// Glossary chips. The particle or ending is highlighted inside the word.
function glossaryChips(words, sk) {
  return words.map(w => {
    const suffix = w.suffix && w.korean.endsWith(w.suffix) ? w.suffix : '';
    const base = suffix ? w.korean.slice(0, -suffix.length) : w.korean;
    const kor = esc(base) + (suffix ? `<span style="background: #FFE04D; color: #000; border-radius: 6px; padding: 0 4px">${esc(suffix)}</span>` : '');
    const meaning = esc(w.english || '');
    const roman = esc(w.roman || '');
    // Three lines: the Korean word, its romanization, and its meaning
    return `<div style="min-width: 0; padding: 6px 12px; background: ${sk.chipBg}; color: ${sk.chipFg}; border-radius: 10px; display: flex; flex-direction: column; gap: 2px; overflow: hidden"><span class="kor" style="font-size: 24px; font-weight: 900; white-space: nowrap">${kor}</span>${roman ? `<span style="font-size: 17px; font-weight: 700; color: ${sk.chipMean}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">${roman}</span>` : ''}<span style="font-size: 17px; font-weight: 700; color: ${sk.chipMean}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">${meaning}</span></div>`;
  }).join('');
}

// Sentence slides. The story card is 810px tall (60% of the slide), tilted as in the Flow artboard.
// The glossary (word, romanization, meaning), the header and the footer take the other 40%.
function sentenceSlide(s, words, i, n, total, part, date, sk) {
  const STAGES = {
    truth: ['✅', 'THE REAL ANSWER'], what: ['📰', 'WHAT HAPPENED'], why: ['🧭', 'WHY IT HAPPENED'],
    how: ['⚙️', 'HOW IT HAPPENED'], now: ['📍', 'WHERE IT STANDS NOW'], next: ['🔜', 'WHAT IS EXPECTED'],
    context: ['🧭', 'THE BACKSTORY'], summary: ['📰', 'WHAT HAPPENED'], outcome: ['💡', 'WHAT IT MEANS']
  };
  const [emoji, label] = STAGES[s.stage] || (i === 0 ? ['🧭', 'THE BACKSTORY'] : i === n - 1 ? ['💡', 'WHAT IT MEANS'] : ['📰', 'WHAT HAPPENED']);
  // The sentence text shrinks if it does not fit the card; the glossary is scaled down if it does not fit its space
  const shrink = `(function(){var card=document.getElementById('card'),en=document.getElementById('en'),ko=document.getElementById('ko'),g=document.getElementById('gloss'),a=76,b=66,f=24;` +
    `while(card.scrollHeight>card.clientHeight&&a>30){a-=2;b-=2;en.style.fontSize=a+'px';ko.style.fontSize=b+'px';}` +
    `while(g&&g.scrollHeight>g.clientHeight&&f>12){f-=1;g.querySelectorAll('.kor').forEach(function(e){e.style.fontSize=f+'px';});}})();`;
  const glossary = words.length
    ? `<div id="gloss" style="flex: 1; min-height: 0; overflow: hidden; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; align-content: start">${glossaryChips(words, sk)}</div>`
    : '<div style="flex: 1"></div>';
  return wrap(`<div class="slide" style="width: 1080px; height: 1350px; box-sizing: border-box; padding: 36px 60px; background: ${sk.sentBg}; display: flex; flex-direction: column; gap: 16px; font-family: ${FONT}; color: ${sk.text}; overflow: hidden">
  <div style="flex: none; height: 60px; display: flex; align-items: center; justify-content: space-between">
    <span style="padding: 10px 22px; font-size: 30px; font-weight: 900; background: ${sk.labelBg}; color: ${sk.labelFg}; transform: rotate(-3deg)">${emoji} ${label}</span>
    <span style="font-size: 26px; font-weight: 800">${esc(date || '')}</span>
  </div>
  <div id="card" style="flex: none; height: 810px; box-sizing: border-box; padding: 44px; background: ${sk.cardBg}; border: 6px solid ${sk.cardBorder}; box-shadow: 14px 14px 0 ${sk.cardShadow}; display: flex; flex-direction: column; justify-content: center; gap: 26px; transform: rotate(${sk.cardRot}deg); overflow: hidden">
    <div id="en" style="font-size: 76px; font-weight: 900; line-height: 1.2; color: ${sk.text}">${esc(s.english)}</div>
    <div id="ko" style="font-size: 66px; font-weight: 800; line-height: 1.35; color: ${sk.ko}">${esc(s.korean)}</div>
  </div>
  ${glossary}
  <div style="flex: none; height: 40px; display: flex; align-items: center; justify-content: space-between; font-size: 28px; font-weight: 800">
    <span>${FOOTER_SWIPE}</span>
    <span>${part} / ${total}</span>
  </div>
</div>`, shrink);
}

// ---------- Body formats (one slide after the sentences) ----------

// Returns { kind, label, items, question, footer } for the chosen body format, or null when the card has
// no usable data for it. The data keys match the generator's format_data (generate.mjs, cleanFormatData).
function bodyItems(c, body) {
  const d = c.format_data || {};
  const pick = (list, max) => (Array.isArray(list) ? list : []).filter(x => x && x.english).slice(0, max);
  const row = (x, head = '') => ({ head: x.label || head, english: x.english, korean: x.korean || '' });
  switch (body) {
    case 'two_views': {
      const v = pick(d.views, 2);
      if (v.length < 2) return null;
      return { kind: 'boxes', label: '🔎 TWO VIEWS', items: v.map((x, i) => row(x, i ? 'OTHERS SEE…' : 'SOME SEE…')), footer: 'No verdict from us. ' + FOOTER_SWIPE };
    }
    case 'three_points': {
      const p = pick(d.points, 3);
      if (p.length < 2) return null;
      return { kind: 'list', label: '📌 THREE THINGS', items: p.map(x => row(x)) };
    }
    case 'timeline': {
      const s = pick(d.steps, 4);
      if (s.length < 2) return null;
      return { kind: 'list', label: '🕒 HOW IT UNFOLDED', items: s.map(x => row(x)) };
    }
    case 'before_after': {
      if (!d.before || !d.before.english || !d.after || !d.after.english) return null;
      return { kind: 'pair', label: '📰 BEFORE → AFTER', items: [row(d.before, 'BEFORE'), row(d.after, 'AFTER')] };
    }
    case 'who_speaks': {
      const p = pick(d.people, 3);
      if (p.length < 2) return null;
      return { kind: 'people', label: '🎙 WHO IS SPEAKING', items: p.map(x => row(x)) };
    }
    case 'whats_missing': {
      const m = pick(d.missing, 3);
      if (m.length < 1) return null;
      return { kind: 'boxes', label: '🕳 WHAT IS MISSING', items: m.map(x => row(x)) };
    }
    case 'another_view': {
      if (!d.view || !d.view.english) return null;
      return { kind: 'boxes', label: '🔁 ANOTHER VIEW', items: [row(d.view, 'ANOTHER VIEW')] };
    }
    case 'map_place': {
      const p = pick(d.places, 4);
      if (p.length < 1) return null;
      return { kind: 'map', label: '📍 WHERE IT HAPPENED', items: [row(p[0])] };
    }
    case 'poll': {
      if (!d.poll || !d.poll.question || !Array.isArray(d.poll.options) || d.poll.options.length < 2) return null;
      return {
        kind: 'poll',
        label: '🗳 WHAT DO YOU THINK?',
        question: /\?$/.test(d.poll.question) ? d.poll.question : d.poll.question + '?',
        items: d.poll.options.slice(0, 2).map((x, i) => ({ mark: ['A', 'B'][i], english: x.english, korean: x.korean || '' }))
      };
    }
    default:
      return null;
  }
}

// Body slide header and footer, the same as the sentence slides (date top right, numbers bottom right)
function bodyShell(label, inner, sk, date, number, total, footer, labelBg, labelFg) {
  return wrap(`<div class="slide" style="width: 1080px; height: 1350px; box-sizing: border-box; padding: 36px 60px; background: ${sk.sentBg}; display: flex; flex-direction: column; gap: 16px; font-family: ${FONT}; color: ${sk.text}; overflow: hidden">
  <div style="flex: none; height: 60px; display: flex; align-items: center; justify-content: space-between">
    <span style="padding: 10px 22px; font-size: 30px; font-weight: 900; background: ${labelBg || sk.labelBg}; color: ${labelFg || sk.labelFg}; transform: rotate(-3deg)">${esc(label)}</span>
    <span style="font-size: 26px; font-weight: 800">${esc(date || '')}</span>
  </div>
  <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 30px; min-height: 0">${inner}</div>
  <div style="flex: none; height: 40px; display: flex; align-items: center; justify-content: space-between; font-size: 28px; font-weight: 800">
    <span>${footer || FOOTER_SWIPE}</span>
    <span>${number} / ${total}</span>
  </div>
</div>`);
}

// One white box (the Flow card style) with an optional label line, English and Korean
function box(sk, head, en, ko, pad = 40) {
  return `<div style="background: ${sk.cardBg}; border: 6px solid ${sk.cardBorder}; box-shadow: 10px 10px 0 ${sk.cardShadow}; padding: ${pad}px; display: flex; flex-direction: column; gap: 14px">
    ${head ? `<div style="font-size: 30px; font-weight: 900; color: ${sk.ko}">${esc(head)}</div>` : ''}
    <div style="font-size: 46px; font-weight: 800; line-height: 1.3; color: ${sk.text}">${esc(en)}</div>
    ${ko ? `<div style="font-size: 34px; font-weight: 700; line-height: 1.4; color: ${sk.ko}">${esc(ko)}</div>` : ''}
  </div>`;
}

// One body slide for the chosen body format, after the sentence slides
function bodySlide(c, number, total, date, sk) {
  const b = bodyItems(c, c.body_format);
  if (!b) return null;
  const date0 = date;

  if (b.kind === 'list') {
    const rows = b.items.map((it, i) => `
      <div style="display: flex; gap: 24px; align-items: center; background: ${sk.cardBg}; border: 6px solid ${sk.cardBorder}; box-shadow: 10px 10px 0 ${sk.cardShadow}; padding: 28px">
        <div style="flex: none; width: 80px; height: 80px; border-radius: 40px; background: ${sk.stickerBg}; color: ${sk.stickerFg}; border: 4px solid ${sk.cardBorder}; font-size: 40px; font-weight: 900; display: flex; align-items: center; justify-content: center">${i + 1}</div>
        <div style="display: flex; flex-direction: column; gap: 10px; min-width: 0">
          <div style="font-size: 40px; font-weight: 800; line-height: 1.3; color: ${sk.text}">${esc(it.english)}</div>
          ${it.korean ? `<div style="font-size: 30px; font-weight: 700; line-height: 1.4; color: ${sk.ko}">${esc(it.korean)}</div>` : ''}
        </div>
      </div>`).join('');
    return bodyShell(b.label, `<div style="display: flex; flex-direction: column; gap: 24px">${rows}</div>`, sk, date0, number, total, b.footer);
  }

  if (b.kind === 'pair') {
    const [before, after] = b.items;
    const inner = `
      <div style="background: ${sk.cardBg}; border: 6px solid ${sk.cardBorder}; box-shadow: 10px 10px 0 ${sk.cardShadow}; padding: 40px">
        <div style="font-size: 26px; font-weight: 900; color: ${sk.ko}">BEFORE</div>
        <div style="font-size: 52px; font-weight: 900; line-height: 1.25; color: ${sk.text}">${esc(before.english)}</div>
        ${before.korean ? `<div style="font-size: 36px; font-weight: 700; color: ${sk.ko}">${esc(before.korean)}</div>` : ''}
      </div>
      <div style="text-align: center; font-size: 80px; font-weight: 900; color: ${sk.text}">↓</div>
      <div style="background: ${sk.labelBg}; color: ${sk.labelFg}; border: 6px solid ${sk.labelBg}; box-shadow: 10px 10px 0 ${sk.stickerBg}; padding: 40px">
        <div style="font-size: 26px; font-weight: 900; color: ${sk.creditEyebrow}">AFTER</div>
        <div style="font-size: 52px; font-weight: 900; line-height: 1.25">${esc(after.english)}</div>
        ${after.korean ? `<div style="font-size: 36px; font-weight: 700; color: ${sk.labelFg}">${esc(after.korean)}</div>` : ''}
      </div>`;
    return bodyShell(b.label, inner, sk, date0, number, total, b.footer);
  }

  if (b.kind === 'boxes') {
    const inner = b.items.map(it => box(sk, it.head, it.english, it.korean)).join('');
    return bodyShell(b.label, inner, sk, date0, number, total, b.footer);
  }

  if (b.kind === 'people') {
    const inner = b.items.map(p => {
      const initials = String(p.head || '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
      return `<div style="flex: 1; display: flex; align-items: center; gap: 30px; background: ${sk.cardBg}; border: 6px solid ${sk.cardBorder}; box-shadow: 10px 10px 0 ${sk.cardShadow}; padding: 36px">
        <div style="flex: none; width: 140px; height: 140px; border-radius: 70px; background: ${sk.stickerBg}; color: ${sk.stickerFg}; border: 6px solid ${sk.cardBorder}; display: flex; align-items: center; justify-content: center; font-size: 52px; font-weight: 900">${esc(initials)}</div>
        <div style="display: flex; flex-direction: column; gap: 12px; min-width: 0">
          <div style="font-size: 28px; font-weight: 900; letter-spacing: 1px; color: ${sk.ko}">${esc(String(p.head || '').toUpperCase())}</div>
          <div style="font-size: 42px; font-weight: 900; line-height: 1.25; color: ${sk.text}">${esc(p.english)}</div>
          ${p.korean ? `<div style="font-size: 30px; font-weight: 700; line-height: 1.35; color: ${sk.ko}">${esc(p.korean)}</div>` : ''}
        </div>
      </div>`;
    }).join('');
    return bodyShell(b.label, inner, sk, date0, number, total, b.footer);
  }

  if (b.kind === 'map') {
    const p = b.items[0];
    const inner = `<div style="background: ${sk.cardBg}; border: 6px solid ${sk.cardBorder}; box-shadow: 14px 14px 0 ${sk.cardShadow}; padding: 40px; display: flex; flex-direction: column; gap: 30px">
        <div style="height: 460px; background: #E9F3D0; border: 4px solid ${sk.cardBorder}; position: relative; overflow: hidden">
          <div style="position: absolute; left: 46%; top: 42%; width: 48px; height: 48px; border-radius: 24px; background: #FF7A59; border: 6px solid ${sk.cardBorder}"></div>
          <div style="position: absolute; left: 24px; bottom: 16px; font-size: 26px; font-weight: 800; color: #141413">${esc(p.head)}</div>
        </div>
        <div style="font-size: 46px; font-weight: 900; line-height: 1.25; color: ${sk.text}">${esc(p.english)}</div>
        ${p.korean ? `<div style="font-size: 36px; font-weight: 800; line-height: 1.35; color: ${sk.ko}">${esc(p.korean)}</div>` : ''}
      </div>`;
    return bodyShell(b.label, inner, sk, date0, number, total, b.footer);
  }

  // poll
  const options = b.items.map(o => `
      <div style="background: ${sk.cardBg}; border: 6px solid ${sk.cardBorder}; box-shadow: 10px 10px 0 ${sk.cardShadow}; padding: 36px; display: flex; flex-direction: column; gap: 10px">
        <div style="font-size: 44px; font-weight: 800; line-height: 1.3; color: ${sk.text}">${esc(o.mark)}. ${esc(o.english)}</div>
        ${o.korean ? `<div style="font-size: 34px; font-weight: 700; color: ${sk.ko}">${esc(o.korean)}</div>` : ''}
      </div>`).join('');
  const inner = `<div style="font-size: 60px; font-weight: 900; line-height: 1.25; color: ${sk.text}">${esc(b.question)}</div>${options}
      <div style="font-size: 34px; font-weight: 700; line-height: 1.4; color: ${sk.ko}">Tell a friend which one you picked. Answers are shared in the next post.</div>`;
  return bodyShell(b.label, inner, sk, date0, number, total, b.footer);
}

// Why it matters: up to three short reasons from the story, English with the Korean line under each
function whySlide(c, number, total, date, sk) {
  const items = (c.why_it_matters || []).map((w, i) => `
    <div style="flex: 1; display: flex; align-items: center; gap: 28px; padding: 36px; background: ${sk.cardBg}; border: 6px solid ${sk.cardBorder}; box-shadow: 10px 10px 0 ${sk.cardShadow}">
      <div style="flex: none; width: 80px; height: 80px; border-radius: 40px; background: ${sk.stickerBg}; color: ${sk.stickerFg}; border: 4px solid ${sk.cardBorder}; font-size: 40px; font-weight: 900; display: flex; align-items: center; justify-content: center">${i + 1}</div>
      <div style="display: flex; flex-direction: column; gap: 18px">
        <div style="font-size: 46px; font-weight: 900; line-height: 1.3; color: ${sk.text}">${esc(w.english)}</div>
        <div style="font-size: 36px; font-weight: 700; line-height: 1.4; color: ${sk.ko}">${esc(w.korean)}</div>
      </div>
    </div>`).join('');
  return bodyShell('💡 WHY IT MATTERS', `${items}`, sk, date, number, total);
}

// Last slide: credit and author. No source lines here: sources are in the post caption.
function creditSlide(c, region, logo, photo, total, date, sk) {
  return wrap(`<div class="slide" style="width: 1080px; height: 1350px; box-sizing: border-box; padding: 70px 80px; background: ${sk.creditBg}; color: ${sk.creditFg}; display: flex; flex-direction: column; font-family: ${FONT}; overflow: hidden">
  <div style="display: flex; align-items: center; justify-content: space-between">
    <div style="display: flex; align-items: center; gap: 20px">
      ${logoImg(logo, 130)}
      <span style="font-size: 36px; font-weight: 900">Maeil News</span>
    </div>
    <span style="font-size: 30px; font-weight: 800">${esc(date)}</span>
  </div>
  <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 48px; min-height: 0">
    <div style="font-size: 32px; font-weight: 800; letter-spacing: 2px; color: ${sk.creditEyebrow}">WRITTEN AND PUBLISHED BY</div>
    <div style="display: flex; align-items: center; gap: 32px; padding: 36px; background: ${sk.creditBox}; color: ${sk.creditBoxFg}; border-radius: 28px">
      ${photoImg(photo, sk.photoBorder)}
      <div style="display: flex; flex-direction: column; gap: 10px">
        <div style="font-size: 34px; font-weight: 800">Written and published by</div>
        <div style="font-size: 50px; font-weight: 900">Deevena Angel Thirupathi</div>
        <div style="font-size: 30px; font-weight: 700">Maeil News</div>
        <div style="font-size: 30px; font-weight: 700">Contact: maeil.news365@gmail.com</div>
      </div>
    </div>
  </div>
  <div style="display: flex; align-items: center; justify-content: space-between; font-size: 28px; font-weight: 700">
    <span>Follow for more news</span>
    <span>${total} / ${total}</span>
  </div>
</div>`);
}

// ---------- Plan and build ----------

// Every slide of the card, in order. Sentences are one slide each, with the glossary on the same slide.
export function planSlides(card) {
  const sentences = Array.isArray(card.sentences) ? card.sentences : [];
  const plan = [{ kind: 'cover' }, { kind: 'title' }];
  sentences.forEach((s, i) => {
    plan.push({ kind: 'sentence', sentence: s, words: slideWords(s), index: i, count: sentences.length });
  });
  // Full flow (news and entertainment with parties and views): who it affects, why it matters, other views, what you think
  const fullFlow = Array.isArray(card.views) && card.views.length >= 2;
  if (fullFlow) {
    if (Array.isArray(card.parties) && card.parties.length > 0) plan.push({ kind: 'parties' });
    if (Array.isArray(card.why_it_matters) && card.why_it_matters.length > 0) plan.push({ kind: 'why' });
    plan.push({ kind: 'views' });
    if (card.reader_question) plan.push({ kind: 'think' });
  } else {
    // Older cards: one body slide, only for a body format with usable data (otherwise the sentences alone)
    if (card.body_format && card.body_format !== 'sentences' && bodyItems(card, card.body_format)) plan.push({ kind: 'body' });
    if (Array.isArray(card.why_it_matters) && card.why_it_matters.length > 0) plan.push({ kind: 'why' });
  }
  // The credit slide comes once, at the end
  plan.push({ kind: 'credit' });
  return plan;
}

// Parties: what the story means for each party, the same boxes as the views
function partiesSlide(c, number, total, date, sk) {
  const inner = c.parties.map(p => box(sk, p.label, p.english, p.korean)).join('');
  return bodyShell('👥 WHAT IT MEANS FOR', inner, sk, date, number, total);
}

// Other perspectives: two views from different outlets or groups, then why others might disagree
function viewsSlide(c, number, total, date, sk) {
  const inner = c.views.slice(0, 2).map(v => box(sk, v.label, v.english, v.korean)).join('')
    + (c.disagree ? box(sk, 'WHY OTHERS MIGHT DISAGREE', c.disagree.english, c.disagree.korean) : '');
  return bodyShell('🔎 OTHER PERSPECTIVES', inner, sk, date, number, total, 'No verdict from us. ' + FOOTER_SWIPE);
}

// What do you think: one question for readers, with its Korean line
function thinkSlide(c, number, total, date, sk) {
  const q = /\?$/.test(c.reader_question) ? c.reader_question : c.reader_question + '?';
  const inner = `<div style="font-size: 60px; font-weight: 900; line-height: 1.25; color: ${sk.text}">${esc(q)}</div>
      ${c.reader_question_korean ? `<div style="font-size: 40px; font-weight: 700; line-height: 1.4; color: ${sk.ko}">${esc(c.reader_question_korean)}</div>` : ''}`;
  return bodyShell('🤔 WHAT DO YOU THINK?', inner, sk, date, number, total);
}

// All slides of one card, in order, as HTML pages.
export function buildSlides(card, region, source, assets) {
  const plan = planSlides(card);
  const total = plan.length;
  const sk = skinFor(card.category);
  return plan.map((p, n) => {
    const number = n + 1;
    if (p.kind === 'cover') return coverSlide(card, assets.logo, total, sk);
    if (p.kind === 'title') return titleSlide(card, assets.logo, total, sk);
    if (p.kind === 'body') return bodySlide(card, number, total, dateText(card), sk);
    if (p.kind === 'why') return whySlide(card, number, total, dateText(card), sk);
    if (p.kind === 'parties') return partiesSlide(card, number, total, dateText(card), sk);
    if (p.kind === 'views') return viewsSlide(card, number, total, dateText(card), sk);
    if (p.kind === 'think') return thinkSlide(card, number, total, dateText(card), sk);
    if (p.kind === 'sentence') return sentenceSlide(p.sentence, p.words, p.index, p.count, total, number, dateText(card), sk);
    return creditSlide(card, region, assets.logo, assets.photo, total, dateText(card), sk);
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
