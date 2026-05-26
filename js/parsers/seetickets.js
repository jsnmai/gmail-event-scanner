// parsers/seetickets.js: Extracts ticket info from See Tickets (US) confirmation emails.
//
// See Tickets emails have a teal header block containing the event, date, venue, and address:
//   Subject: "Here are your Tickets for Galantis NYE Weekend at the Palace of Fine Arts"
//   Event name comes from the subject.
//   Date:  "Friday, December 29, 2023"
//   Venue: "Palace of Fine Arts (view on map)"
//   Address: "3601 Lyon St, San Francisco CA"   ← no zip, state not comma-separated
//   Total: "Total $115.02" (in the receipt table)

const SeeTicketsParser = {
  name: 'See Tickets',

  senderQuery: 'from:seetickets.us',

  canParse(sender, _subject) {
    return /seetickets\.us/i.test(sender);
  },

  parse(_sender, subject, body, _emailDate) {
    const text = _htmlToText(body);

    // Only parse ticket-delivery emails; skip transfer notifications
    const subjectM = subject.match(_SEETIX_SUBJECT);
    if (!subjectM) return null;

    const dateM  = text.match(_SEETIX_DATE);
    const venueM = text.match(_SEETIX_VENUE);
    const cityM  = text.match(_SEETIX_CITY);
    const totalM = text.match(_SEETIX_TOTAL);

    return {
      platform:     'See Tickets',
      event:        subjectM[1].trim(),
      venue:        venueM ? venueM[1].trim() : 'N/A',
      city:         cityM  ? `${cityM[1].trim()}, ${cityM[2]}` : 'N/A',
      date:         dateM  ? dateM[0].trim() : 'N/A',
      quantity:     1,
      cost:         totalM ? `$${totalM[1]}` : 'N/A',
      emailSubject: subject,
    };
  },
};

// "Here are your Tickets for Galantis NYE Weekend at the Palace of Fine Arts"
const _SEETIX_SUBJECT = /Here are your Tickets for (.+)/i;

// "Friday, December 29, 2023"
const _SEETIX_DATE = /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+\w+\s+\d+,\s+\d{4}/i;

// "Palace of Fine Arts (view on map)" — venue is the text immediately before "(view on map)"
const _SEETIX_VENUE = /([^\n]+)\s*\(view on map\)/i;

// "3601 Lyon St, San Francisco CA" — city and state are space-separated (no comma before state)
const _SEETIX_CITY = /[^\n]+,\s*([A-Za-z][^,\n]+)\s+([A-Z]{2})\s*(?:\n|$)/;

// "Total $115.02" or "Total: $115.02"
const _SEETIX_TOTAL = /\bTotal[:\s]+\$?([\d,]+\.\d{2})/im;
