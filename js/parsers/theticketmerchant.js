// parsers/theticketmerchant.js: Extracts ticket info from The Ticket Merchant confirmation emails.
//
// The Ticket Merchant (theticketmerchant.com.au) is an Australian secondary ticketing platform.
// Sender: contact-us@theticketmerchant.com.au
// Subject: "The Ticket Merchant: New Order # 1000510186"
//
// Body (via _htmlToText) key structure — each table cell is a block:
//   Dom Dolla                     ← event name TD (same TR as order number)
//   Order No: 1000510186          ← second TD, same row
//   Sat, 30 Nov 2024, 16:00       ← date TD (next row)
//   Delivery: Mobile Tickets      ← second TD, same row (ignored)
//   The Domain, Sydney            ← venue + city combined on one line
//   SECTION
//   GA Standing 18+
//   QUANTITY
//   1
//   PRICE
//   US$121.00
//   ...
//   Total:
//   US$127.00
//
// Selection heuristic: keep "New Order" messages as purchase records; mobile-ticket
// delivery text within the order is metadata, not a second event row.

const TicketMerchantParser = {
  name: 'The Ticket Merchant',

  senderQuery: 'from:theticketmerchant.com.au',

  canParse(sender, _subject) {
    return /theticketmerchant\.com\.au/i.test(sender);
  },

  parse(_sender, subject, body, _emailDate) {
    if (!/New Order/i.test(subject)) return null;

    const text = _htmlToText(body);

    // console.debug('[TTM] subject:', subject);
    // console.debug('[TTM] text:\n' + text);

    const eventM = text.match(_TTM_EVENT);
    const dateM  = text.match(_TTM_DATE);
    const venueM = text.match(_TTM_VENUE);
    const qtyM   = text.match(_TTM_QTY);
    const costM  = text.match(_TTM_COST);

    // console.debug('[TTM] eventM:', eventM && eventM[1]);
    // console.debug('[TTM] dateM:', dateM && dateM[1]);
    // console.debug('[TTM] venueM:', venueM && [venueM[1], venueM[2]]);
    // console.debug('[TTM] qtyM:', qtyM && qtyM[1]);
    // console.debug('[TTM] costM:', costM && costM[1]);

    if (!eventM) return null;

    return {
      platform:     'The Ticket Merchant',
      event:        eventM[1].trim(),
      venue:        venueM ? venueM[1].trim() : 'N/A',
      city:         venueM ? venueM[2].trim() : 'N/A',
      date:         dateM ? dateM[1].trim() : 'N/A',
      quantity:     qtyM ? parseInt(qtyM[1], 10) : 1,
      cost:         costM ? `USD $${costM[1]}` : 'N/A',
      emailSubject: subject,
    };
  },
};

// Event name is the line immediately before "Order No:"
const _TTM_EVENT = /([^\n]+)\nOrder No:/i;

// "Sat, 30 Nov 2024, 16:00" — day-of-week, day number, month name, year, optional 24h time
const _TTM_DATE = /((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*\d+\s+\w+\s+\d{4}(?:,\s*\d+:\d+)?)/i;

// "The Domain, Sydney" — venue and city on one line, immediately before the SECTION header
const _TTM_VENUE = /([^\n,]+),\s*([A-Za-z][^\n]+)\nSECTION/i;

// "QUANTITY\n1" — the quantity cell in the ticket summary table
const _TTM_QTY = /QUANTITY\n(\d+)/i;

// "Total:\nUS$127.00" — grand total, anchored to line start to avoid matching Sub-total
const _TTM_COST = /^Total:\nUS\$([\d,]+\.\d{2})/im;
