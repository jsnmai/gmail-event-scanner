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
    const date = m[1].replace(/\s*\|\s*/, ' ').trim();

    const costMatch = text.match(_SH_ORDER_TOTAL);

    return {
      platform:     'StubHub',
      event:        m[2].trim(),
      venue:        m[3].trim(),
      city:         'N/A',
      date,
      quantity:     parseInt(m[4], 10),
      cost:         costMatch ? `$${costMatch[1]}` : 'N/A',
      emailSubject: subject,
    };
  },
};

// [^\n]* after the time consumes any trailing text on the same line,
// e.g. "(Event time subject to change)" appended without a preceding newline
const _SH_ORDER_BLOCK = /Order #\s*\d+\n([^\n]+\|\s*\d+:\d+)[^\n]*\n(?:\([^\n]+\)\n)?([^\n]+)\n([^\n]+)\n(\d+)\s+Ticket/i;

const _SH_ORDER_TOTAL = /Order Total\s*\n\$([\d,]+\.\d{2})/i;
