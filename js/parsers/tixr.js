// parsers/tixr.js: Extracts ticket info from Tixr confirmation emails.
//
// Ported from python-cli/parsers/tixr.py.
// Tixr has two distinct email formats:
//
// V1 — older emails, repeated "Order Confirmation" header, year omitted from date:
//   Order Confirmation
//   Order Confirmation
//   The Lineup: ILLENIUM "Odyssey" Album Release Show
//   Pier 80 Warehouse
//   Thu Feb 5, 6:30 PM        <- or "Sat Dec 28 at 3:00 PM" or "Tue Dec 30 - Thu Jan 1"
//
// V2 — newer emails, no repeated header, event and venue combined as "Event At Venue":
//   1 Item
//   Toxic Summer 2023 At The Midway
//   Fri. Jul 21, 2023 to Sun. Jul 23, 2023

const TixrParser = {
  name: 'Tixr',

  senderQuery: 'from:tixr.com',

  canParse(sender, _subject) {
    return /tixr\.com/i.test(sender);
  },

  parse(_sender, subject, body, _emailDate) {
    const text = _htmlToText(body);

    // console.debug('[Tixr] subject:', subject);
    // console.debug('[Tixr] text:\n' + text);

    const fields = _parseTixrV1(text) || _parseTixrV2(text);
    // console.debug('[Tixr] v1:', _parseTixrV1(text));
    // console.debug('[Tixr] v2:', _parseTixrV2(text));
    // console.debug('[Tixr] resolved fields:', fields);
    if (!fields) return null;

    const costMatch = text.match(_TIXR_COST);

    return {
      platform:     'Tixr',
      event:        fields.event,
      venue:        fields.venue,
      city:         fields.city,
      date:         fields.date,
      quantity:     1,
      cost:         costMatch ? `$${costMatch[1]}` : 'N/A',
      emailSubject: subject,
    };
  },
};

// V1: doubled "Order Confirmation" header. [^\n]* handles trailing spaces on the second line.
const _TIXR_V1 = /Order Confirmation\n+Order Confirmation[^\n]*\n+([^\n]+)\n+([^\n]+)\n+([^\n]+)/i;

// V2: item count line, then "Event At Venue", then date or date range.
// V2 emails have no repeated "Order Confirmation" header, so we match on item count alone.
// [^\n]* handles trailing spaces after "Item(s)".
const _TIXR_V2 = /\d+ Items?[^\n]*\n+([^\n]+)\n+(\w+\.?\s+\w+\s+\d+,\s+\d{4}(?:\s+to\s+\w+\.?\s+\w+\s+\d+,\s+\d{4})?)/i;

// V1 omits the year — pull it from the order date line, e.g. "Order Date:\n1/15/26"
const _TIXR_ORDER_DATE = /Order Date:\s*\n?\s*\d+\/\d+\/(\d{2,4})/i;

const _TIXR_COST = /Total Including Fees:\s*\n?\s*\$\s*([\d,]+\.\d{2})/i;

const _TIXR_CITY = /([A-Za-z](?:[A-Za-z\s]{1,30})),\s+([A-Z]{2})\s+\d{5}/;

function _parseTixrV1(text) {
  const m = text.match(_TIXR_V1);
  if (!m) return null;

  let date = m[3].trim();

  // Normalize "at" time separator: "Sat Dec 28 at 3:00 PM" → "Sat Dec 28 3:00 PM"
  date = date.replace(/\s+at\s+/i, ' ');

  // V1 omits the year — insert it from the order date line
  const yearMatch = text.match(_TIXR_ORDER_DATE);
  if (yearMatch) {
    const yr   = yearMatch[1];
    const year = yr.length === 2 ? `20${yr}` : yr;
    const rangeM = date.match(/^(.+?)\s*[-–]\s*(.+)$/);
    if (rangeM) {
      // Range like "Tue Dec 30 - Thu Jan 1" — infer year for each end independently.
      // If the end month is earlier in the calendar than the start month, the end is next year.
      date = _tixrV1RangeWithYears(rangeM[1].trim(), rangeM[2].trim(), year);
    } else {
      date = _tixrInsertYear(date, year);
    }
  } else {
    // No order date found — can't infer year for range end, so keep only start date.
    date = date.replace(/\s*[-–]\s*.+$/, '').trim();
  }

  const cityMatch = text.match(_TIXR_CITY);
  const city = cityMatch ? `${cityMatch[1].trim()}, ${cityMatch[2]}` : 'N/A';

  return { event: m[1].trim(), venue: m[2].trim(), city, date };
}

function _parseTixrV2(text) {
  const m = text.match(_TIXR_V2);
  if (!m) return null;

  // V2 combines event and venue as "Event At Venue" — split on " At "
  const combined = m[1].trim();
  const parts    = combined.split(/\s+At\s+/i);
  const event    = parts[0].trim();
  const venue    = parts.length > 1 ? parts[1].trim() : 'N/A';

  let date = m[2].trim();

  // Remove abbreviation periods on all day names in the string (global flag covers both ends of a range)
  date = date.replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\./gi, '$1');

  const cityMatch = text.match(_TIXR_CITY);
  const city = cityMatch ? `${cityMatch[1].trim()}, ${cityMatch[2]}` : 'N/A';

  return { event, venue, city, date };
}

// Handle V1 date ranges where neither end has a year.
// "Tue Dec 30" / "Thu Jan 1" + "2025" → "Tue Dec 30, 2025 - Thu Jan 1, 2026"
// If end month < start month (e.g. Jan < Dec), the end date falls in the next calendar year.
function _tixrV1RangeWithYears(startStr, endStr, year) {
  const MONTHS = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  const getMonth = s => {
    const mm = s.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i);
    return mm ? MONTHS[mm[1].toLowerCase()] : 0;
  };
  const startYear = parseInt(year, 10);
  const endYear   = getMonth(endStr) < getMonth(startStr) ? startYear + 1 : startYear;
  return `${_tixrInsertYear(startStr, String(startYear))} - ${_tixrInsertYear(endStr, String(endYear))}`;
}

// Insert year before the time component so _parseDate can handle it.
// "Thu Feb 5, 6:30 PM" + 2026 → "Thu Feb 5 2026 6:30 PM"
// "Tue Dec 30"         + 2025 → "Tue Dec 30, 2025"
// Appending year after the time confuses the date parser.
function _tixrInsertYear(dateStr, year) {
  const timeMatch = dateStr.match(/\d+:\d+\s*[AP]M/i);
  if (timeMatch) {
    const idx = dateStr.indexOf(timeMatch[0]);
    const datePart = dateStr.slice(0, idx).replace(/[,\s]+$/, '');
    return `${datePart} ${year} ${timeMatch[0]}`;
  }
  return `${dateStr}, ${year}`;
}
