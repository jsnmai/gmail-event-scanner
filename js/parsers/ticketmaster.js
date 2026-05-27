// parsers/ticketmaster.js: Extracts ticket info from Ticketmaster confirmation emails.
//
// Ported from python-cli/parsers/ticketmaster.py.
// Ticketmaster sends two distinct email layouts depending on region:
//   US: event name, then a bullet-separated date line, then "Venue — City, State"
//   AU: "Order #..." header, then event, then "Venue, City", then a date with "@"
//
// Selection heuristic: keep only sender messages matching a structured US or AU
// ticket/order layout; marketing, transfer, and other unrecognized formats are skipped.

const TicketmasterParser = {
  name: 'Ticketmaster',

  // The Gmail search filter for this platform, used to build the API query.
  senderQuery: 'from:ticketmaster.com',

  canParse(sender, _subject) {
    return /ticketmaster\.com/i.test(sender);
  },

  // Returns a ticket object on success, or null if the email isn't a confirmation
  // (e.g. marketing email, transfer notice, or unrecognized format).
  parse(_sender, subject, body, _emailDate) {
    const text = _htmlToText(body); // _htmlToText is defined in utils.js

    // console.log('[TM] subject:', subject);
    // console.log('[TM] text:\n' + text);

    const fields = _parseUS(text) || _parseAU(text);
    // console.log('[TM] usMatch:', text.match(_US_BLOCK));
    // console.log('[TM] auMatch:', text.match(_AU_BLOCK));
    // console.log('[TM] fields:', fields);
    if (!fields) return null;

    const costMatch = text.match(/Total:?\s+([A-Z]{0,3}\s*\$[\d,]+\.\d{2})/i);
    // console.log('[TM] costMatch:', costMatch && costMatch[1]);

    return {
      platform:     'Ticketmaster',
      event:        fields.event,
      venue:        fields.venue,
      city:         fields.city,
      date:         fields.date,
      quantity:     1,
      cost:         costMatch ? costMatch[1].trim() : 'N/A',
      emailSubject: subject,
    };
  },
};

// US format example:
//   Gryffin - 6/12 (18+)
//   Fri · Jun 12, 2026 · 8:00 PM
//   Cow Palace — Daly City, California
//
// Multi-day range format (no comma, no time):
//   Wobbleland - 2-DAY tickets
//   Fri · Jan 19 2024 — Sat · Jan 20 2024
//   Bill Graham Civic Auditorium — San Francisco, California
//
// Date group matches any line starting with "Day · Month" to cover both formats.
const _US_BLOCK = /([^\n]{3,})\n+(\w+\s*[·•]\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[^\n]+)\n+([^—–\n]{3,})\s*[—–]\s*([^\n]+)/i;

// AU format example:
//   Order #31-50095/AUS
//   Peggy Gou
//   Munro Warehouse, Sydney
//   Sat 16 November 2024 @  7:00pm
const _AU_BLOCK = /Order\s+#[\w/-]+\n+([^\n]+)\n+([^,\n]+),\s*([^\n]+)\n+([^\n]*@[^\n]*)/i;

function _parseUS(text) {
  const m = text.match(_US_BLOCK);
  if (!m) return null;
  return { event: m[1].trim(), date: m[2].trim(), venue: m[3].trim(), city: m[4].trim() };
}

function _parseAU(text) {
  const m = text.match(_AU_BLOCK);
  if (!m) return null;
  return { event: m[1].trim(), venue: m[2].trim(), city: m[3].trim(), date: m[4].trim() };
}
