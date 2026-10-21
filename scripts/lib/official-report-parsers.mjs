// Parse only named, public official resort report fields. No page scripts are evaluated.
export const OFFICIAL_REPORT_SOURCES = Object.freeze({
  rusutsu: Object.freeze({
    sourceName: 'Rusutsu Resort',
    sourceUrl: 'https://rusutsu.com/en/snow-and-weather-report/',
    operationsUrl: 'https://rusutsu.com/en/lift-and-trail-status/',
    liftDataUrl: 'https://rusutsu.com/assets/partial/ajax/trail-and-lift/get-front.php',
    webcamUrl: 'https://rusutsu.com/en/live-mountain-cams/',
  }),
  madarao: Object.freeze({
    sourceName: 'Madarao Mountain Resort',
    sourceUrl: 'https://www.madarao.jp/ski',
    webcamUrl: 'https://www.madarao.jp/ski/live-camera',
  }),
  hakuba: Object.freeze({
    sourceName: 'Hakuba Happo-one Snow Resort',
    sourceUrl: 'https://www.happo-one.jp/en/winter/',
    webcamUrl: 'https://www.happo-one.jp/en/gelande/livecamera/',
  }),
  nozawa: Object.freeze({
    sourceName: 'Nozawa Onsen Snow Resort',
    sourceUrl: 'https://en.nozawaski.com/the-mountain/moutain-info/slopes-lifts/',
    webcamUrl: 'https://nozawaski.com/winter/course/livecam_map/',
  }),
});

function text(value) {
  return String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function divByClass(html, className) {
  const elements = /<div\b[^>]*class=(["'])([^"']*)\1[^>]*>/gi;
  for (const element of html.matchAll(elements)) {
    if (!element[2].split(/\s+/).includes(className)) continue;
    return divContentsAt(html, element.index + element[0].length);
  }
  return null;
}

function definition(html, label) {
  const definitions = html.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi);
  for (const match of definitions) if (text(match[1]) === label) return text(match[2]);
  return null;
}

function divContentsAt(html, start) {
  const tags = /<\/?div\b[^>]*>/gi;
  tags.lastIndex = start;
  let depth = 1;
  for (let tag = tags.exec(html); tag; tag = tags.exec(html)) {
    depth += /^<\//.test(tag[0]) ? -1 : 1;
    if (depth === 0) return html.slice(start, tag.index);
  }
  return null;
}

function snowCm(value) {
  if (value === null) return null;
  // A blank, dash, '--', or malformed value is missing, never a zero report.
  const match = /^(\d+(?:\.\d+)?)\s*(?:cm)?$/.exec(value);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isFinite(number) && number <= 10_000 ? number : null;
}

function jstTimestamp(year, month, day, hour, minute) {
  const fields = [year, month, day, hour, minute].map(Number);
  const [y, mo, d, h, mi] = fields;
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31 || h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  const date = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const local = `${date}T${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:00`;
  const time = new Date(`${local}+09:00`);
  if (!Number.isFinite(time.getTime()) || new Date(time.getTime() + 9 * 3_600_000).toISOString().slice(0, 19) !== local) return null;
  return { reportedAt: time.toISOString(), reportDate: date };
}

export function emptyOfficialReport(id) {
  const source = OFFICIAL_REPORT_SOURCES[id];
  if (!source) throw new Error('Unsupported official resort report');
  return {
    sourceName: source.sourceName, sourceUrl: source.sourceUrl,
    reportedAt: null, reportDate: null, station: null,
    snowfall24hCm: null, depthCm: null, operations: null,
    webcamUrl: source.webcamUrl,
  };
}

export function parseRusutsuSnowReport(html) {
  const report = emptyOfficialReport('rusutsu');
  // The first .weather-wrap is the official weather board, separate from page/news dates.
  const board = divByClass(html, 'weather-wrap');
  if (!board) throw new Error('Rusutsu weather board is missing');
  const date = /Update Date\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\([^)]*\)\s*(\d{1,2}):(\d{2})/.exec(text(board));
  const timestamp = date && jstTimestamp(date[3], date[2], date[1], date[4], date[5]);
  if (!timestamp) throw new Error('Rusutsu report timestamp is missing or invalid');
  // The board currently identifies West Mt. Do not silently reuse values if its station changes.
  if (!/\bWest Mt\./.test(text(board))) throw new Error('Rusutsu weather station is unrecognized');
  return {
    ...report, ...timestamp, station: 'West Mt.',
    snowfall24hCm: snowCm(definition(board, '24-hour Snowfall')),
    depthCm: snowCm(definition(board, 'Snow Accumulation')),
  };
}

export function parseMadaraoSnowReport(html) {
  const report = emptyOfficialReport('madarao');
  const board = divByClass(html, 'bar-condition-inner');
  if (!board) throw new Error('Madarao snow board is missing');
  const date = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i.exec(definition(board, '本日のゲレンデ状況') ?? '');
  const hour12 = date && Number(date[4]);
  const hour24 = date && hour12 >= 1 && hour12 <= 12 ? (hour12 % 12) + (date[6].toLowerCase() === 'pm' ? 12 : 0) : NaN;
  const timestamp = date && jstTimestamp(date[1], date[2], date[3], hour24, date[5]);
  if (!timestamp) throw new Error('Madarao report timestamp is missing or invalid');
  return {
    ...report, ...timestamp,
    snowfall24hCm: snowCm(definition(board, '降雪（24H）')),
    depthCm: snowCm(definition(board, '積雪')),
    // The site labels the lift table as a schedule (運行予定), not a current operating report.
    operations: null,
  };
}

export function parseHappoSnowReport(html) {
  const report = emptyOfficialReport('hakuba');
  // Pin a named station, never the closest/freshest-looking number elsewhere on the page.
  const container = divByClass(html.replace(/<!--[\s\S]*?-->/g, ''), 'condition-container');
  const board = container && divByClass(container, 'condition-data');
  if (!board) throw new Error('Happo snow board is missing');
  const heading = /<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(board);
  if (!heading || !/^KUROBISHI\s*（1,680m）$/.test(text(heading[1]))) throw new Error('Happo weather station is unrecognized');
  const date = /^Update at (\d{4})\.(\d{2})\.(\d{2}) (\d{1,2}):(\d{2})$/.exec(text(divByClass(board, 'update') ?? ''));
  const timestamp = date && jstTimestamp(...date.slice(1));
  if (!timestamp) throw new Error('Happo report timestamp is missing or invalid');
  let depthCm = null;
  for (const match of board.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const label = /<span\b[^>]*class=["']label["'][^>]*>([\s\S]*?)<\/span>/i.exec(match[1]);
    if (label && text(label[1]) === 'SnowDepth') depthCm = snowCm(text(match[1].slice(label.index + label[0].length)));
  }
  return {
    ...report, ...timestamp, station: 'Kurobishi · 1,680 m', depthCm,
    // "SnowFall" has no explicit measurement window; it is not a 24-hour observation.
    snowfall24hCm: null,
  };
}

export function parseNozawaLiftReport(html) {
  // Source comments contain retired lifts. Only the visible, independently dated lift board counts.
  const visible = html.replace(/<!--[\s\S]*?-->/g, '');
  const opening = /<div\b[^>]*\bid=["']now_lift["'][^>]*>/i.exec(visible);
  if (!opening) throw new Error('Nozawa lift board is missing');
  const board = divContentsAt(visible, opening.index + opening[0].length);
  if (!board) throw new Error('Nozawa lift board is missing');
  const heading = /<h5\b[^>]*>([\s\S]*?)<\/h5>/i.exec(board);
  const date = /^Latest update \(date\/time\)：(\d{1,2})\/([A-Za-z]{3})\/(\d{4}) (\d{1,2}):(\d{2})$/.exec(heading ? text(heading[1]) : '');
  const month = date && ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(date[2]) + 1;
  const timestamp = date && jstTimestamp(date[3], month, date[1], date[4], date[5]);
  if (!timestamp) throw new Error('Nozawa lift timestamp is missing or invalid');
  const tables = [...board.matchAll(/<table\b[^>]*class=["']tb_lift["'][^>]*>([\s\S]*?)<\/table>/gi)];
  if (tables.length === 0) throw new Error('Nozawa lift list is missing');
  const states = [];
  const ids = new Set();
  for (const table of tables) {
    for (const row of table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      if (!/<td\b/i.test(row[1])) continue;
      const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => text(cell[1]));
      if (cells.length !== 4 || !/^\d{1,2}$/.test(cells[0]) || !cells[1] || ids.has(cells[0])) throw new Error('Nozawa lift row is unrecognized');
      ids.add(cells[0]);
      // The official Japanese lift legend names ◯ operating, △ waiting/inspection, × closed.
      states.push(cells[3] === '◯' ? 'open' : cells[3] === '△' ? 'hold' : cells[3] === '×' ? 'closed' : 'unknown');
    }
  }
  if (states.length === 0 || states.length > 100) throw new Error('Nozawa lift list is missing or unbounded');
  const opened = states.filter((status) => status === 'open').length;
  const status = states.includes('unknown') ? 'unknown' : opened === states.length ? 'open' : opened > 0 ? 'partial' : states.includes('hold') ? 'hold' : 'closed';
  const details = status === 'unknown' ? 'The resort reports lift states that this app cannot yet interpret.'
    : opened > 0 ? `${opened} of ${states.length} lifts reported operating. Terrain access still needs checking.`
      : status === 'hold' ? 'No lifts reported operating; one or more are awaiting conditions or inspection.'
        : `All ${states.length} lifts reported closed.`;
  return { ...timestamp, status, details, sourceUrl: OFFICIAL_REPORT_SOURCES.nozawa.sourceUrl };
}

export function parseRusutsuLiftReport(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Rusutsu lift data is invalid');
  const update = payload.other?.update;
  if (!(typeof update === 'string' && /^\d{10}$/.test(update)) && !(typeof update === 'number' && Number.isInteger(update))) throw new Error('Rusutsu lift timestamp is missing');
  const reportedAt = new Date(Number(update) * 1000);
  if (!Number.isFinite(reportedAt.getTime()) || reportedAt.getUTCFullYear() < 2000 || reportedAt.getUTCFullYear() > 2100) throw new Error('Rusutsu lift timestamp is invalid');
  if (!Array.isArray(payload.lift) || payload.lift.length === 0 || payload.lift.length > 100) throw new Error('Rusutsu lift list is missing');
  const mapping = new Map([
    ['運転中', 'open'], ['減速運転', 'open'], ['運行待ち', 'hold'], ['待機調査中', 'hold'],
    ['運休/本日営業終了', 'closed'],
  ]);
  const states = payload.lift.map((lift) => mapping.get(lift?.stat) ?? 'unknown');
  const opened = states.filter((status) => status === 'open').length;
  const unknown = states.includes('unknown');
  const status = unknown ? 'unknown' : opened === states.length ? 'open' : opened > 0 ? 'partial' : states.includes('hold') ? 'hold' : 'closed';
  const details = unknown ? 'The resort reports lift states that this app cannot yet interpret.'
    : opened > 0 ? `${opened} of ${states.length} lifts reported operating. Terrain access still needs checking.`
      : status === 'hold' ? 'No lifts reported operating; one or more are on standby or temporarily suspended.'
        : `All ${states.length} lifts reported closed.`;
  return {
    status, reportedAt: reportedAt.toISOString(),
    reportDate: new Date(reportedAt.getTime() + 9 * 3_600_000).toISOString().slice(0, 10),
    details, sourceUrl: OFFICIAL_REPORT_SOURCES.rusutsu.operationsUrl,
  };
}
