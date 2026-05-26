// parsers/tickpick.js: Extracts ticket info from TickPick confirmation emails.
//
// Ported from python-cli/parsers/tickpick.py.
// Both "Order Confirmed" and "Order Placed" emails contain labeled fields:
//   Event Name:\nDom Dolla
//   Event Date:\nFri Oct 18, 2024 4:00PM
//   Venue:\nLos Angeles State Historic Park

const TickPickParser = {
  name: 'TickPick',

  // The Gmail search filter for this platform, used to build the API query.
  senderQuery: 'from:tickpick.com',

  canParse(sender, _subject) {
    return /tickpick\.com/i.test(sender);
  },

  // Returns a ticket object on success, or null if the email isn't a confirmation
  // (e.g. delivery notice, listing alert, or unrecognized format).
  parse(_sender, subject, body, _emailDate) {
    const text = _htmlToText(body); // _htmlToText is defined in utils.js

    const m = text.match(_EVENT_BLOCK);
    if (!m) return null;

    const costMatch = text.match(_ORDER_TOTAL);
    const qtyMatch  = text.match(_QUANTITY);

    return {
      platform:     'TickPick',
      event:        m[1].trim(),
      venue:        m[2].trim(),
      city:         'N/A',
      date:         m[3].trim(),
      quantity:     qtyMatch ? parseInt(qtyMatch[1], 10) : 1,
      cost:         costMatch ? `$${costMatch[1]}` : 'N/A',
      emailSubject: subject,
    };
  },
};

// Labeled fields present in order confirmation and order-placed emails.
// Delivery, listing, and group-order emails lack these fields and return null.
const _EVENT_BLOCK = /Event Name:\n([^\n]+)\nEvent Date:\n([^\n]+)\nVenue:\n([^\n]+)/i;

// "Order Confirmed" format:  Order Total\n$153.00
// "Order Placed" format:     Order Total:\n$153.00
const _ORDER_TOTAL = /Order Total:?\n\$([\d,]+\.\d{2})/i;

// Quantity appears as "× 1" (confirmed) or "x 1" (placed)
const _QUANTITY = /[×x]\s*(\d+)/;
