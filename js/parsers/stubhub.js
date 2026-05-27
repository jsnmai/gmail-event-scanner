// parsers/stubhub.js: Extracts ticket info from StubHub buyer confirmation emails.
//
// Ported from python-cli/parsers/stubhub.py.
// Matches "Thanks for your order" and "Your tickets are ready" emails.
// Seller emails ("OrderID #", "Sale #") won't match and return null.
//
// Email block format:
//   Order # 513909183
//   Friday, June 02, 2023 | 20:00
//   (Event time subject to change)    <- optional line
//   Illenium
//   Chase Center
//   4 Ticket(s)
//
// Selection heuristic: keep buyer emails containing the structured Order # ticket
// block, including order/readiness variants; their order number allows global dedupe
// to merge duplicate purchase notifications without combining known separate orders.

const StubHubParser = {
  name: 'StubHub',

  senderQuery: 'from:stubhub.com',

  canParse(sender, _subject) {
    return /stubhub\.com/i.test(sender);
  },

  parse(_sender, subject, body, _emailDate) {
    const text = _htmlToText(body);

    const m = text.match(_SH_ORDER_BLOCK);
    if (!m) return null;

    // "Friday, June 02, 2023 | 20:00" → "Friday, June 02, 2023 20:00"
    const date = m[2].replace(/\s*\|\s*/, ' ').trim();

    const costMatch = text.match(_SH_ORDER_TOTAL);
    const location = _stubHubLocation(m[4].trim());

    return {
      platform:     'StubHub',
      event:        m[3].trim(),
      venue:        location.venue,
      city:         location.city,
      date,
      quantity:     parseInt(m[5], 10),
      cost:         costMatch ? `$${costMatch[1]}` : 'N/A',
      orderNumber:  m[1],
      emailSubject: subject,
    };
  },
};

// [^\n]* after the time consumes any trailing text on the same line,
// e.g. "(Event time subject to change)" appended without a preceding newline
const _SH_ORDER_BLOCK = /Order #\s*(\d+)\n([^\n]+\|\s*\d+:\d+)[^\n]*\n(?:\([^\n]+\)\n)?([^\n]+)\n([^\n]+)\n(\d+)\s+Ticket/i;

const _SH_ORDER_TOTAL = /Order Total\s*\n\$([\d,]+\.\d{2})/i;

function _stubHubLocation(rawVenue) {
  const match = rawVenue.match(/^(.+?),\s+([^,\n]+,\s*[A-Z]{2})(?:\s+\d{5})?$/);
  return {
    venue: match ? match[1].trim() : rawVenue,
    city: match ? match[2].trim() : 'N/A',
  };
}
