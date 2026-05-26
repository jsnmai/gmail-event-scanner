// parsers/frontgate.js: Extracts ticket info from Front Gate Tickets confirmation emails.
//
// Ported from python-cli/parsers/frontgate.py.
// Front Gate is the ticketing platform for many large festival/concert promoters (Insomniac, etc).
//
// Key quirks:
//   - Subject line has the event name: "Your HARD Summer Receipt - Order #123"
//   - Some subjects use the promoter name ("Insomniac Events") instead of the real event.
//     In that case, the body has "EVENT at VENUE" on the line just before the date — preferred.
//   - Merchandise-only receipts (magnets, collectibles) are skipped.
//   - Multiple ticket types have separate quantity rows that must be summed.
//   - Dates can be ranges: "Friday, March 28, 2025 - Saturday, March 29, 2025"

const FrontGateParser = {
  name: 'Front Gate Tickets',

  senderQuery: 'from:frontgatetickets.com',

  canParse(sender, _subject) {
    return /frontgatetickets\.com/i.test(sender);
  },

  parse(_sender, subject, body, _emailDate) {
    const text = _htmlToText(body);

    console.debug('[FG] subject:', subject);

    // Only parse receipt emails — skip shipping notices, digital ticket delivery, etc.
    const eventSubjectMatch = subject.match(_FG_EVENT_SUBJECT);
    if (!eventSubjectMatch) {
      console.debug('[FG] skipped — subject does not match Receipt pattern');
      return null;
    }

    // Skip merchandise-only receipts (e.g. magnet bundles ordered without a ticket)
    const itemMatch = text.match(_FG_ITEM_DESCRIPTION);
    if (itemMatch && _FG_MERCHANDISE.test(itemMatch[1])) {
      console.debug('[FG] skipped — merchandise-only receipt');
      return null;
    }

    // Prefer the body event line ("SLANDER at Los Angeles Convention Center") over the subject,
    // since some subjects only name the promoter ("Insomniac Events"), not the actual event.
    const eventBodyMatch = text.match(_FG_EVENT_BODY);
    const event = eventBodyMatch ? eventBodyMatch[1].trim() : eventSubjectMatch[1].trim();

    const dateMatch = text.match(_FG_DATE);
    const date = dateMatch ? dateMatch[0].trim() : 'N/A';

    console.debug('[FG] dateMatch:', dateMatch && dateMatch[0]);
    console.debug('[FG] eventBodyMatch:', eventBodyMatch && eventBodyMatch[1]);
    console.debug('[FG] text:\n' + text);

    const venueCityMatch = text.match(_FG_VENUE_CITY);
    const venue = venueCityMatch ? venueCityMatch[1].trim() : 'N/A';
    const city  = venueCityMatch ? `${venueCityMatch[2].trim()}, ${venueCityMatch[3]}` : 'N/A';

    // Sum quantities across all ticket type rows — an order can have multiple types
    // e.g. "2 GA + 1 GA+Magnet bundle" → quantity 3
    const qtyMatches = [...text.matchAll(_FG_QUANTITY)];
    const quantity = qtyMatches.length > 0
      ? qtyMatches.reduce((sum, m) => sum + parseInt(m[1], 10), 0)
      : 1;

    const costMatch = text.match(_FG_COST);

    return {
      platform:     'Front Gate Tickets',
      event,
      venue,
      city,
      date,
      quantity,
      cost:         costMatch ? `$${costMatch[1]}` : 'N/A',
      emailSubject: subject,
    };
  },
};

// Event name from subject: "Your HARD Summer Receipt - Order #123" → "HARD Summer"
const _FG_EVENT_SUBJECT = /Your (.+?) Receipt/i;

// "ARTIST at VENUE" on the line just before the day name — more accurate than the subject
// when the subject only names the promoter (e.g. "Insomniac Events")
const _FG_EVENT_BODY = /([^\n]+ at [^\n]+)\n+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i;

// Single date or date range — _FG_DAY written out twice to avoid RegExp constructor escaping noise
const _FG_DATE = /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+\w+\s+\d+,\s+\d{4}(?:\s*[-–]\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+\w+\s+\d+,\s+\d{4})?/i;

// Venue name on the "at VENUE" line, then 0–3 lines of street address, then "City, ST"
const _FG_VENUE_CITY = /at\s+([^\n]+)\n+(?:[^\n]*\n+){0,3}([A-Za-z][A-Za-z\s]+),\s+([A-Z]{2})/;

// Item description is the line directly above the day name in the ticket table
const _FG_ITEM_DESCRIPTION = /([^\n]+)\n+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),/i;

// Keywords that indicate a merchandise-only receipt, not an admission ticket
const _FG_MERCHANDISE = /\b(magnets?|collectible)\b/i;

// Quantity table: header row, then ticket type name, then the quantity number.
// Uses global flag so matchAll can find all ticket type blocks and sum them.
const _FG_QUANTITY = /Ticket\s+Quantity\s+Price\s+[^\n]+\n+(\d+)/gi;

// "Total:" at the start of a line (multiline flag), amount on the same or next line
const _FG_COST = /^Total:\s*\$?([\d,]+\.\d{2})/im;
