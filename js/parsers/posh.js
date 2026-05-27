// parsers/posh.js: Extracts event tickets from POSH receipt confirmations.
//
// Observed confirmation layout (via _htmlToText):
//   Subject: "Your Tickets for Stay in Bloom: Harold's World Pre-Party"
//   2x Tickets
//   Order total: $0
//   April 30th 2026, 7:30 PM PDT - April 30th 2026, 10:30 PM PDT
//   The Foundry SF
//   1425 Folsom St, San Francisco, CA 94103, USA
//   View on map
//   ...
//   Order 26661686 - April 29th 2026, 5:04 PM
//
// Selection heuristic: keep "Your Tickets for ..." confirmations containing
// both the ticket summary and mapped event-location block; other POSH mail is skipped.

const PoshParser = {
  name: 'Posh',

  senderQuery: 'from:receipts.posh.vip',

  canParse(sender, _subject) {
    return /receipts\.posh\.vip/i.test(sender);
  },

  parse(_sender, subject, body, _emailDate) {
    const subjectM = subject.match(_POSH_SUBJECT);
    if (!subjectM) return null;

    const text = _htmlToText(body);
    const ticketM = text.match(_POSH_TICKETS);
    const dateM = text.match(_POSH_DATE);
    const locationM = text.match(_POSH_LOCATION);
    if (!ticketM || !dateM || !locationM) return null;

    const orderM = text.match(_POSH_ORDER);
    const amount = Number(ticketM[2].replace(/,/g, ''));

    return {
      platform:     'Posh',
      event:        subjectM[1].trim(),
      venue:        locationM[1].trim(),
      city:         `${locationM[2].trim()}, ${locationM[3]}`,
      date:         `${dateM[1]} ${dateM[2]}, ${dateM[3]}`,
      quantity:     parseInt(ticketM[1], 10),
      cost:         Number.isFinite(amount) ? `$${amount.toFixed(2)}` : 'N/A',
      orderNumber:  orderM ? orderM[1] : '',
      emailSubject: subject,
    };
  },
};

const _POSH_SUBJECT = /Your Tickets for (.+)/i;
const _POSH_TICKETS = /(\d+)x\s+Tickets?\s+Order total:\s*\$([\d,]+(?:\.\d{2})?)/i;
const _POSH_DATE = /([A-Z][a-z]+\s+\d{1,2})(?:st|nd|rd|th)?\s+(\d{4}),\s+(\d{1,2}:\d{2}\s*[AP]M)/i;
const _POSH_LOCATION = /([^\n]+)\n+\d+[^,\n]*,\s*([^,\n]+),\s*([A-Z]{2})\s+\d{5},?\s*USA\n+View on map/i;
const _POSH_ORDER = /\bOrder\s+(\d+)\s*-/i;
