// parsers/givethanksfestival.js: Extracts ticket info from Give Thanks festival emails.
//
// Give Thanks (givethanksfestival.com) sends a custom confirmation format.
// The email has NO explicit event date field — only the order date and ticket tier name
// (e.g. "Wednesday GA - Tier 4") hint at the event day. Date is left as N/A.
//
// Subject: "Order Confirmation: GIVE THANKS - Porter Robinson, Subtronics + MORE!"
// Body (via _htmlToText):
//   Items   Qty   Price
//   Wednesday GA - Tier 4   1   $79.95
//   Subtotal   $79.95
//   ...
//   Total   $94.71
//   Cow Palace Arena & Event Center
//   2600 Geneva Avenue
//   Daly City, CA 94014

const GiveThanksParser = {
  name: 'Give Thanks',

  senderQuery: 'from:givethanksfestival.com',

  canParse(sender, _subject) {
    return /givethanksfestival\.com/i.test(sender);
  },

  parse(_sender, subject, body, _emailDate) {
    const subjectM = subject.match(_GT_SUBJECT);
    if (!subjectM) return null;

    const text = _htmlToText(body);

    const venueM = text.match(_GT_VENUE);
    const costM  = text.match(_GT_COST);
    const qtyM   = text.match(_GT_QTY);

    return {
      platform:     'Give Thanks',
      event:        subjectM[1].trim(),
      venue:        venueM ? venueM[1].trim() : 'N/A',
      city:         venueM ? `${venueM[2].trim()}, ${venueM[3]}` : 'N/A',
      date:         'N/A',
      quantity:     qtyM ? parseInt(qtyM[1], 10) : 1,
      cost:         costM ? `$${costM[1]}` : 'N/A',
      emailSubject: subject,
    };
  },
};

// "Order Confirmation: GIVE THANKS - Porter Robinson, ..."
const _GT_SUBJECT = /Order Confirmation:\s*([^-]+?)(?:\s*-\s*.+)?$/i;

// Venue appears after the Total line: venue name → street → "City, ST ZIP"
const _GT_VENUE = /Total\s+\$?[\d,]+\.\d{2}\s+([^\n]+)\n[^\n]+\n([A-Za-z][^,\n]+),\s*([A-Z]{2})\s+\d{5}/i;

// "Total   $94.71" — Total and amount may be on the same or separate lines
const _GT_COST = /\bTotal\s+\$?([\d,]+\.\d{2})/i;

// Quantity: digit between two dollar amounts in the line-item table
const _GT_QTY = /\$[\d,.]+\n(\d+)\n\$/i;
