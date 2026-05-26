// parsers/dnalounge.js: Extracts ticket info from DNA Lounge confirmation emails.
//
// Ported from python-cli/parsers/dnalounge.py.
// DNA Lounge is a single SF venue, so venue and city are hardcoded.
// Receipt table — two formats seen in the wild:
//   Combined:  "Crankdat: Absolute Annihilation Pre-Party, Thu, Jun 6th, 9PM"
//   Separate:  "Lil Texas" / "Thu, Aug 10th, 9PM"  (event name and date on different lines)
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

    // DEBUG: logged subject + full plain text to confirm what _htmlToText produces per email.
    // Found that the Lil Texas email had "Qty \n" (trailing space) while Crankdat had "Qty\n".
    // This caused _DNA_RECEIPT to return null for Lil Texas, silently dropping the ticket.
    // Fix: changed _DNA_RECEIPT to use Qty[^\n]* so trailing spaces are tolerated.
    // console.debug('[DNA] subject:', subject);
    // console.debug('[DNA] text:\n' + text);

    const m = text.match(_DNA_RECEIPT);

    // DEBUG: confirmed the regex matched for Crankdat but returned null for Lil Texas,
    // which pointed directly at the "Qty " trailing-space difference.
    // console.debug('[DNA] _DNA_RECEIPT match:', m);

    if (!m) return null;

    const quantity = parseInt(m[1], 10);

    // DNA Lounge emails have two formats:
    //   Combined:  "Crankdat: Absolute Annihilation Pre-Party, Thu, Jun 6th, 9PM -- in 3 weeks"
    //   Separate:  "Lil Texas\nThu, Aug 10th, 9PM"
    const line1 = m[2];
    const line2 = m[3] || '';

    // DEBUG: printed line1/line2 to verify the two-line capture worked after the regex fix,
    // and to check which date format each email used (inline comma vs. standalone second line).
    // console.debug('[DNA] line1:', JSON.stringify(line1));
    // console.debug('[DNA] line2:', JSON.stringify(line2));

    const inlineMatch     = line1.match(_DNA_DATE_INLINE);
    const standaloneMatch = line2.match(_DNA_DATE_STANDALONE);

    // DEBUG: confirmed inlineMatch fired for Crankdat and standaloneMatch for any
    // separate-line format, verifying both branches of the date extraction logic.
    // console.debug('[DNA] inlineMatch:', inlineMatch);
    // console.debug('[DNA] standaloneMatch:', standaloneMatch);

    let event, dateRaw;
    if (inlineMatch) {
      event   = line1.slice(0, line1.indexOf(inlineMatch[0])).replace(/,\s*$/, '').trim();
      dateRaw = inlineMatch[1];
    } else if (standaloneMatch) {
      event   = line1.trim();
      dateRaw = standaloneMatch[1];
    } else {
      return null;
    }

    // Strip ordinal suffixes: "6th" → "6", "21st" → "21"
    dateRaw = dateRaw.replace(/(\d+)(?:st|nd|rd|th)\b/gi, '$1');
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

// Captures quantity and up to two item lines (event name and/or date).
// Use [^\n]* after each header to tolerate trailing spaces (e.g. "Qty \n").
const _DNA_RECEIPT = /Qty[^\n]*\n+Item[^\n]*\n+Line Total[^\n]*\n+(\d+)\n+([^\n]+)(?:\n([^\n]*))?/i;

// Date embedded after a comma on the same line as the event: ", Thu, Jun 6th, 9PM"
const _DNA_DATE_INLINE = /,\s*((Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*,\s+\w+\s+\d+\w*,\s+\d+[AP]M)/i;

// Date on its own line (separate from the event name): "Thu, Aug 10th, 9PM"
const _DNA_DATE_STANDALONE = /^((Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*,\s+\w+\s+\d+\w*,\s+\d+[AP]M)/i;

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
