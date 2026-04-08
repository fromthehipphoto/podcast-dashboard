#!/usr/bin/env node
// Extract episode data from standalone calendar HTML files into JSON.

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dataDir = join(__dirname, 'data');

// ── Deep in the Stacks ──────────────────────────────────────────────────────
function extractDITS() {
  const html = readFileSync(join(root, 'episode-calendar.html'), 'utf8');
  const match = html.match(/const CALENDAR_DATA = ({.*?});/s);
  if (!match) throw new Error('Could not find CALENDAR_DATA');
  const calData = JSON.parse(match[1]);

  const episodes = [];

  // Bridge episodes
  (calData.bridge || []).forEach(b => {
    episodes.push({
      num: `B${b.bridgeNum}`,
      title: `${b.artist} -- ${b.title}`,
      artist: b.artist,
      album: b.title,
      label: b.label,
      year: b.year,
      date: b.date,
      status: b.bridgeNum <= 14 ? 'scheduled' : 'script',
      episodeType: b.episodeType || 'curated',
      isBridge: true
    });
  });

  // Main calendar episodes
  (calData.calendar || []).forEach(c => {
    episodes.push({
      num: c.dayNum,
      title: `${c.artist} -- ${c.title}`,
      artist: c.artist,
      album: c.title,
      label: c.label,
      year: c.year,
      date: c.date,
      status: 'script',
      episodeType: c.episodeType || null,
      isBridge: false
    });
  });

  episodes.sort((a, b) => a.date.localeCompare(b.date));

  return {
    show: "Deep in the Stacks",
    slug: "dits",
    schedule: "mon-fri",
    timezone: "America/New_York",
    publishTime: "07:00",
    buzzsproutId: 2608195,
    accentColor: "#c9a84c",
    launchDate: calData.launchDate,
    episodes
  };
}

// ── Photography Knowledge ────────────────────────────────────────────────────
function extractPhotography() {
  const html = readFileSync(join(root, 'photography-podcast-calendar.html'), 'utf8');

  // Extract the static EPISODES array (eps 0-30)
  const arrMatch = html.match(/const EPISODES = \[([\s\S]*?)\];/);
  if (!arrMatch) throw new Error('Could not find EPISODES in photography calendar');

  // Parse the JS object literals into JSON
  const episodes = parseJSArray(arrMatch[1]);

  // Extract script titles for eps 31-100
  const titlesMatch = html.match(/const scriptTitles = \{([\s\S]*?)\};/);
  if (titlesMatch) {
    const titleEntries = titlesMatch[1].matchAll(/(\d+):\s*"((?:[^"\\]|\\.)*)"/g);
    const titles = {};
    for (const m of titleEntries) titles[m[1]] = m[2];

    // Generate Mon-Fri dates starting May 20 2026 for eps 31-100
    let d = new Date('2026-05-20T12:00:00');
    for (let n = 31; n <= 100; n++) {
      while (d.getDay() === 0 || d.getDay() === 6) d = new Date(d.getTime() + 86400000);
      episodes.push({
        num: n,
        title: titles[n] || `Episode ${n}`,
        date: d.toISOString().slice(0, 10),
        status: "script",
        duration: null,
        buzzId: null
      });
      d = new Date(d.getTime() + 86400000);
    }
  }

  return {
    show: "Photography Knowledge",
    slug: "photography",
    schedule: "mon-fri",
    timezone: "America/New_York",
    publishTime: "07:00",
    buzzsproutId: null,
    accentColor: "#c8553d",
    episodes
  };
}

// ── Why of Words ─────────────────────────────────────────────────────────────
function extractWoW() {
  const html = readFileSync(join(root, 'why-of-words-calendar.html'), 'utf8');
  const arrMatch = html.match(/const EPISODES = \[([\s\S]*?)\];/);
  if (!arrMatch) throw new Error('Could not find EPISODES in wow calendar');

  const episodes = parseJSArray(arrMatch[1]);

  return {
    show: "The Why of Words",
    slug: "wow",
    schedule: "mon-fri",
    timezone: "America/New_York",
    publishTime: "06:00",
    buzzsproutId: null,
    accentColor: "#4a7cc9",
    episodes
  };
}

// ── Required Drinking ────────────────────────────────────────────────────────
function extractRD() {
  const html = readFileSync(join(root, 'required-drinking-calendar.html'), 'utf8');
  const arrMatch = html.match(/const EPISODES = \[([\s\S]*?)\];/);
  if (!arrMatch) throw new Error('Could not find EPISODES in RD calendar');

  const episodes = parseJSArray(arrMatch[1]);

  // Generate Tue/Thu dates for eps 1-100
  let d = new Date('2026-04-07T12:00:00'); // Apr 7 = Tuesday
  for (let n = 1; n <= 100; n++) {
    const ep = episodes.find(e => e.num === n);
    if (ep) {
      ep.date = d.toISOString().slice(0, 10);
    }
    if (d.getDay() === 2) {
      d = new Date(d.getTime() + 2 * 86400000);
    } else {
      d = new Date(d.getTime() + 5 * 86400000);
    }
  }

  return {
    show: "Required Drinking",
    slug: "rd",
    schedule: "tue-thu",
    timezone: "America/New_York",
    publishTime: "05:00",
    buzzsproutId: 2608128,
    accentColor: "#C8860A",
    episodes
  };
}

// ── Parse JS object array from source ────────────────────────────────────────
function parseJSArray(jsArrayContent) {
  // Match individual object literals like { num: 0, title: "...", ... }
  const objRegex = /\{([^}]+)\}/g;
  const episodes = [];

  let m;
  while ((m = objRegex.exec(jsArrayContent)) !== null) {
    const objStr = m[1];
    // Skip comment-only matches
    if (!objStr.includes('num:')) continue;

    const ep = {};
    // Extract num
    const numMatch = objStr.match(/num:\s*(\d+)/);
    if (numMatch) ep.num = parseInt(numMatch[1]);

    // Extract title (handle escaped quotes and unicode)
    const titleMatch = objStr.match(/title:\s*"((?:[^"\\]|\\.)*)"/);
    if (titleMatch) ep.title = titleMatch[1].replace(/\\"/g, '"').replace(/\\u([\da-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

    // Extract date
    const dateMatch = objStr.match(/date:\s*"(\d{4}-\d{2}-\d{2})"/);
    ep.date = dateMatch ? dateMatch[1] : null;

    // Extract status
    const statusMatch = objStr.match(/status:\s*"(\w+)"/);
    ep.status = statusMatch ? statusMatch[1] : null;

    // Extract duration
    const durMatch = objStr.match(/duration:\s*(\d+)/);
    ep.duration = durMatch ? parseInt(durMatch[1]) : null;

    // Extract buzzId
    const buzzMatch = objStr.match(/buzzId:\s*(\d+)/);
    ep.buzzId = buzzMatch ? parseInt(buzzMatch[1]) : null;

    episodes.push(ep);
  }

  return episodes;
}

// ── Run extraction ───────────────────────────────────────────────────────────
try {
  const dits = extractDITS();
  writeFileSync(join(dataDir, 'dits.json'), JSON.stringify(dits, null, 2));
  console.log(`dits.json: ${dits.episodes.length} episodes`);

  const photo = extractPhotography();
  writeFileSync(join(dataDir, 'photography.json'), JSON.stringify(photo, null, 2));
  console.log(`photography.json: ${photo.episodes.length} episodes`);

  const wow = extractWoW();
  writeFileSync(join(dataDir, 'wow.json'), JSON.stringify(wow, null, 2));
  console.log(`wow.json: ${wow.episodes.length} episodes`);

  const rd = extractRD();
  writeFileSync(join(dataDir, 'rd.json'), JSON.stringify(rd, null, 2));
  console.log(`rd.json: ${rd.episodes.length} episodes`);

  console.log('\nDone.');
} catch (err) {
  console.error('Failed:', err.message);
  console.error(err.stack);
  process.exit(1);
}
