// parsers/dnalounge.js: Extracts ticket info from DNA Lounge confirmation emails.
//
// Ported from python-cli/parsers/dnalounge.py.
// DNA Lounge is a single SF venue, so venue and city are hardcoded.
// Receipt table format:
//   Qty   Item   Line Total
//   1
//   Crankdat: Absolute Annihilation Pre-Party,
//   Thu, Jun 6th, 9PM
//
// DNA Lounge emails omit the year — it's inferred from the email send date.

const DNALoungeParser = {
  name: 'DNA Lounge',

  senderQuery: 'from:dnalounge.com',

  canParse(sender, _subject) {
    return /dnalounge\.com/i.test(sender);
  },

  parse(_sender, subject, body, emailDate) {
    const text = _htmlToText(body);

    const m = text.match(_DNA_RECEIPT);
    if (!m) return null;

    const quantity = parseInt(m[1], 10);

    // Item line has event name and date together: "Crankdat: ..., Thu, Jun 6th, 9PM -- in 3 weeks"
    // Split on the day-of-week marker to separate event name from date.
    const itemLine  = m[2];
    const dateMatch = itemLine.match(_DNA_DATE);
    if (!dateMatch) return null;

    const event  = itemLine.slice(0, itemLine.indexOf(dateMatch[0])).replace(/,\s*$/, '').trim();

    // Strip ordinal suffixes: "6th" → "6", "21st" → "21"
    const dateRaw = dateMatch[1].replace(/(\d+)(?:st|nd|rd|th)\b/gi, '$1');
    const date    = _dnaResolveYear(dateRaw, emailDate);

    const costMatch = text.match(_DNA_COST);

    return {
      platform:     'DNA Lounge',
      event,
      venue:        'DNA Lounge',
      city:         'San Francisco, CA',
      date,
      quantity,
      cost:         costMatch ? `$${costMatch[1]}` : 'N/A',
      emailSubject: subject,
    };
  },
};

// Captures quantity and the full item line; event name and date are parsed from the line separately.
const _DNA_RECEIPT = /Qty\n+Item\n+Line Total\n+(\d+)\n+([^\n]+)/i;

// Date within the item line always starts with a day-of-week abbreviation after a comma.
const _DNA_DATE = /,\s*((Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*,\s+\w+\s+\d+\w*,\s+\d+[AP]M)/i;

const _DNA_COST = /Total\n\$([\d,]+\.\d{2})/i;

// DNA Lounge emails omit the year. Pick the year (current or +1) that puts
// the event on or after the email send date, so Dec emails for Jan events resolve correctly.
//
// Also inserts the year between the date and time, and pads the hour to include minutes,
// so the result ("Thu, Jun 6 2024 9:00 PM") is parseable by _parseDate in main.js.
// Appending year at the end ("9PM 2024") confuses the date parser.
function _dnaResolveYear(dateStr, emailDate) {
  // Split "Thu, Jun 6, 9PM" into date part "Thu, Jun 6" and time part "9PM"
  const lastComma = dateStr.lastIndexOf(',');
  const datePart  = dateStr.slice(0, lastComma).trim();
  const timePart  = dateStr.slice(lastComma + 1).trim();

  // Normalize time: "9PM" → "9:00 PM" so _parseDate can handle it
  const timeNorm = timePart.replace(/^(\d+)([AP]M)$/i, (_, h, p) => `${h}:00 ${p.toUpperCase()}`);

  if (!emailDate) return `${datePart} ${timeNorm}`;
  try {
    const sent = new Date(emailDate);
    if (isNaN(sent)) return `${datePart} ${timeNorm}`;
    for (const year of [sent.getFullYear(), sent.getFullYear() + 1]) {
      const candidate = `${datePart} ${year} ${timeNorm}`;
      const event = new Date(candidate);
      if (!isNaN(event) && event >= sent) return candidate;
    }
    return `${datePart} ${sent.getFullYear()} ${timeNorm}`;
  } catch {
    return `${datePart} ${timeNorm}`;
  }
}
