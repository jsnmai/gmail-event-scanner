// parsers/megatix.js: Extracts ticket info from Megatix confirmation emails.
//
// Megatix (megatix.com.au) is an Australian ticketing platform.
// Subject: "Dom Dolla - Sydney - Fri 29th Nov"
//   Parts: event name - city - day+date (ordinal day, no year in subject)
//
// Body (via _htmlToText):
//   ...
//   Invoice Date: 2023-11-29       ← year extracted from here
//   Location: The Domain           ← venue name
//   ...
//   Dom Dolla
//   $87.90                         ← line-item price (first non-zero dollar amount)
//   ...
//   Total
//   $0.00                          ← total shown as $0.00 in some Megatix emails
//
// Selection heuristic: keep sender messages whose subject has the event/city/date
// purchase shape; unrelated sender traffic without that shape is skipped.

const MegatixParser = {
  name: 'Megatix',

  senderQuery: 'from:megatix.com.au',

  canParse(sender, _subject) {
    return /megatix\.com\.au/i.test(sender);
  },

  parse(_sender, subject, body, _emailDate) {
    const subjectM = subject.match(_MTX_SUBJECT);
    if (!subjectM) return null;

    const text = _htmlToText(body);

    // console.debug('[MTX] subject:', subject);
    // console.debug('[MTX] text:\n' + text);

    const event = subjectM[1].trim();
    const city  = subjectM[2].trim();

    // Strip ordinal suffix ("29th" → "29") then append year extracted from body
    const rawDate = subjectM[3].trim().replace(/(\d+)(?:st|nd|rd|th)\b/gi, '$1');
    const yearM   = text.match(_MTX_INVOICE_DATE);
    const date    = yearM ? `${rawDate} ${yearM[1]}` : rawDate;

    const venueM = text.match(_MTX_VENUE);
    const costM  = text.match(_MTX_COST);

    // console.debug('[MTX] event:', event, '| city:', city, '| date:', date);
    // console.debug('[MTX] venueM:', venueM && venueM[1]);
    // console.debug('[MTX] costM:', costM && costM[1]);

    // AUD is inferred from this AU-oriented platform until currency fixtures are available.
    return {
      platform:     'Megatix',
      event,
      venue:        venueM ? venueM[1].trim() : 'N/A',
      city,
      date,
      quantity:     1,
      cost:         costM ? `AUD $${costM[1]}` : 'N/A',
      emailSubject: subject,
    };
  },
};

// "Dom Dolla - Sydney - Fri 29th Nov"
// Group 1: event name, Group 2: city, Group 3: "Fri 29th Nov" date component
const _MTX_SUBJECT = /^([^-]+?)\s*-\s*([A-Za-z][A-Za-z\s]*?)\s*-\s*((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\s+\d+\w*\s+\w+)\s*$/i;

// "Invoice Date: 2023-11-29" — the year is not in the subject, so extract it from the body
const _MTX_INVOICE_DATE = /Invoice Date:\s*(\d{4})-\d{2}-\d{2}/i;

// "Location: The Domain"
const _MTX_VENUE = /Location:\s*([^\n]+)/i;

// First non-zero dollar amount — skips "$0.00" total that Megatix sometimes shows
const _MTX_COST = /\$([1-9][\d,]*\.\d{2})/;
