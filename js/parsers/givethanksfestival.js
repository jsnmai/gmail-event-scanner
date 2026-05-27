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
//   Cow Palace Arena & Event Center
//   2600 Geneva Avenue
//   Daly City, CA 94014
//   View Details
//   Ticket Details
//   ...
//   Total   $94.71
//
// Selection heuristic: keep "Order Confirmation:" subjects as purchase records.
// Because no event date is present, retain the row with date N/A rather than guessing.
// Parking-only/add-on-only receipts are retained for CSV/debugging but classified as
// add-ons; mixed admission + add-on receipts remain one primary purchase row.

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

    // The event location is in the event-details section before Ticket Details.
    // Customer/order addresses occur later, so do not search the full email first.
    const eventDetails = text.split(/\bTicket Details\b/i)[0];
    const venueM = eventDetails.match(_GT_EVENT_VENUE) || text.match(_GT_VENUE_AFTER_TOTAL);
    const costM  = text.match(_GT_COST);
    const qtyM   = text.match(_GT_QTY);
    const itemTypes = [...text.matchAll(_GT_ITEM)].map(match => match[1].trim());
    const allAddOns = itemTypes.length > 0 &&
      itemTypes.every(itemType => _GT_ADD_ON_ITEM.test(itemType));

    return {
      platform:     'Give Thanks',
      event:        subjectM[1].trim(),
      venue:        venueM ? venueM[1].trim() : 'N/A',
      city:         venueM ? `${venueM[2].trim()}, ${venueM[3]}` : 'N/A',
      date:         'N/A',
      quantity:     qtyM ? parseInt(qtyM[1], 10) : 1,
      cost:         costM ? `$${costM[1]}` : 'N/A',
      ticketType:   itemTypes.join('; '),
      ...(itemTypes.length > 0 ? { itemType: allAddOns ? 'add-on' : 'event' } : {}),
      emailSubject: subject,
    };
  },
};

// "Order Confirmation: GIVE THANKS - Porter Robinson, ..."
const _GT_SUBJECT = /Order Confirmation:\s*([^-]+?)(?:\s*-\s*.+)?$/i;

// Current confirmation layout puts the event address in the section before Ticket Details.
// Parse an address block only inside that section, because a later block is the customer.
const _GT_EVENT_VENUE = /(?:^|\n)([^\n]+)\n[^\n]+\n([A-Za-z][^,\n]+),\s*([A-Z]{2})\s+\d{5}/im;

// Retain support for an older observed layout where the event location follows Total.
const _GT_VENUE_AFTER_TOTAL = /Total\s+\$?[\d,]+\.\d{2}\s+([^\n]+)\n[^\n]+\n([A-Za-z][^,\n]+),\s*([A-Z]{2})\s+\d{5}/i;

// "Total   $94.71" — Total and amount may be on the same or separate lines
const _GT_COST = /\bTotal\s+\$?([\d,]+\.\d{2})/i;

// Quantity: digit between two dollar amounts in the line-item table
const _GT_QTY = /\$[\d,.]+\n(\d+)\n\$/i;

// Each order item is a description followed by quantity and unit price.
const _GT_ITEM = /^([^\n]+)\n+(\d+)\n+\$[\d,]+\.\d{2}$/gim;

// Since Give Thanks is represented per receipt, classify the whole row as an
// add-on only when every parsed line item is non-admission merchandise/access.
const _GT_ADD_ON_ITEM = /\b(parking|shuttle|merch|merchandise|collectible|magnets?|vip add-on)\b/i;
