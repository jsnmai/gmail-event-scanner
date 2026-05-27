// parsers/tickpick.js: Extracts ticket info from TickPick confirmation emails.
//
// Ported from python-cli/parsers/tickpick.py.
// Both "Order Confirmed" and "Order Placed" emails contain labeled fields on the same line:
//   Event Name: Dom Dolla
//   Event Date: Fri Oct 18, 2024 4:00PM
//   Venue: Los Angeles State Historic Park
//
// Selection heuristic: keep order-confirmation/order-placed messages that expose
// labeled event fields; delivery, listing, and other sender messages are skipped.
// Confirmation variants for one purchase share an order number in the subject;
// retain it so global dedupe can join those rows without joining distinct orders.

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

    const m = text.match(_TP_EVENT_BLOCK);
    if (!m) return null;

    const costMatch = text.match(_TP_ORDER_TOTAL);
    const qtyMatch  = text.match(_TP_QUANTITY);
    const location  = _tickPickLocation(m[3].trim());
    const orderM    = subject.match(_TP_ORDER_NUMBER);

    return {
      platform:     'TickPick',
      event:        m[1].trim(),
      venue:        location.venue,
      city:         location.city,
      date:         m[2].trim(),
      quantity:     qtyMatch ? parseInt(qtyMatch[1], 10) : 1,
      cost:         costMatch ? `$${costMatch[1]}` : 'N/A',
      orderNumber:  orderM ? orderM[1] : '',
      emailSubject: subject,
    };
  },
};

// Labeled fields present in order confirmation and order-placed emails.
// Delivery, listing, and group-order emails lack these fields and return null.
// Label and value appear on the same line ("Event Name: Dom Dolla"), not split across two.
const _TP_EVENT_BLOCK = /Event Name:\s+([^\n]+)\nEvent Date:\s+([^\n]+)\nVenue:\s+([^\n]+)/i;

// "Order Confirmed" format:  Order Total\n$153.00
// "Order Placed" format:     Order Total:\n$153.00
const _TP_ORDER_TOTAL = /Order Total:?\n\$([\d,]+\.\d{2})/i;

// Quantity appears as "× 1" (confirmed) or "x 1" (placed)
const _TP_QUANTITY = /[×x]\s*(\d+)/;

// Subject examples include "(Order Number 220446180)" across purchase updates.
const _TP_ORDER_NUMBER = /\bOrder (?:Number|#)\s*([A-Z0-9-]+)\b/i;

function _tickPickLocation(rawVenue) {
  const match = rawVenue.match(/^(.+?),\s+([^,\n]+,\s*[A-Z]{2})(?:\s+\d{5})?$/);
  return {
    venue: match ? match[1].trim() : rawVenue,
    city: match ? match[2].trim() : 'N/A',
  };
}
