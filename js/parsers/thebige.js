// parsers/thebige.js: Extracts ticket info from The Big E (Saffire) confirmation emails.
//
// The Big E (thebige.com / Saffire Events) sends order confirmation emails.
// Subject: "The Big E - Order #TBE307431 Confirmation"
//
// Body (via _htmlToText) key structure:
//   SUBTOTAL
//   Zedd                      ← event name (line immediately after SUBTOTAL)
//   Sept 29, 2023             ← date — NO blank line here: double <br/> collapses to one \n
//   7:30 PM
//   ...
//   ORDER TOTAL:
//   $74.00
//   ...
//   [Venue Name]              ← footer address block
//   [Street Address]
//   [City, ST ZIP]

const TheBigEParser = {
  name: 'The Big E',

  senderQuery: 'from:thebige.com',

  canParse(sender, _subject) {
    return /thebige\.com/i.test(sender);
  },

  parse(_sender, subject, body, _emailDate) {
    if (!/Order\s*#\w+\s+Confirmation/i.test(subject)) return null;

    // Normalize "Sept" → "Sep" — non-standard abbreviation not recognized by Date constructor
    const text = _htmlToText(body).replace(/\bSept\b/g, 'Sep');

    // console.debug('[TBE] subject:', subject);
    // console.debug('[TBE] text:\n' + text);

    const eventDateM = text.match(_TBE_EVENT_DATE);
    // console.debug('[TBE] eventDateM:', eventDateM && [eventDateM[1], eventDateM[2], eventDateM[3]]);

    if (!eventDateM) return null;

    const event = eventDateM[1].trim();
    const date  = `${eventDateM[2].trim()} ${eventDateM[3].trim()}`;

    const venueM = text.match(_TBE_VENUE);
    const costM  = text.match(_TBE_COST);
    // console.debug('[TBE] venueM:', venueM && [venueM[1], venueM[2], venueM[3]]);
    // console.debug('[TBE] costM:', costM && costM[1]);

    return {
      platform:     'The Big E',
      event,
      venue:        venueM ? venueM[1].trim() : 'N/A',
      city:         venueM ? `${venueM[2].trim()}, ${venueM[3]}` : 'N/A',
      date,
      quantity:     1,
      cost:         costM ? `$${costM[1]}` : 'N/A',
      emailSubject: subject,
    };
  },
};

// "SUBTOTAL\nZedd\nSept 29, 2023\n7:30 PM"
// Double <br/> between event and date collapses to one \n in _htmlToText (block suppression)
const _TBE_EVENT_DATE = /\bSUBTOTAL\n([^\n]+)\n([A-Za-z]+ \d+, \d{4})\n(\d+:\d+ [AP]M)/i;

// "ORDER TOTAL:\n$74.00" — amount is on the line after the label
const _TBE_COST = /ORDER TOTAL:\s*\n+\$?([\d,]+\.\d{2})/i;

// Venue address block: non-digit/non-$ venue name line → digit-led street → "City, ST ZIP"
// The first such block after ORDER TOTAL is the venue footer
const _TBE_VENUE = /ORDER TOTAL:[\s\S]*?\n\$[\d,]+\.\d{2}\n+([^\n\d$][^\n]*)\n\d+[^\n]+\n([A-Za-z][^,\n]+),\s*([A-Z]{2})\s+\d{5}/i;
