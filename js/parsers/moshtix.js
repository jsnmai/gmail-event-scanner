// parsers/moshtix.js: Extracts ticket info from Moshtix confirmation emails (AU).
//
// Moshtix booking confirmation format:
//   Subject: "Your Booking Confirmation And Tickets - Order #44640943"
//   "You've got the goods! Your booking is confirmed."
//   Listen Out Sydney 2024
//   06 October 2024, 12:00 pm
//   Centennial Park, Gadigal Country
//   ...
//   TOTAL INCL. GST   $202.90
//
// Selection heuristic: keep bodies explicitly stating the booking is confirmed and
// containing an event date; sender matches without that confirmation are skipped.

const MoshtixParser = {
  name: 'Moshtix',

  senderQuery: 'from:moshtix.com',

  canParse(sender, _subject) {
    return /moshtix\.com/i.test(sender);
  },

  parse(_sender, subject, body, _emailDate) {
    const text = _htmlToText(body);

    // console.log('[Moshtix] subject:', subject);
    // console.log('[Moshtix] text:\n' + text);

    if (!/booking is confirmed/i.test(text)) return null;

    const dateM  = text.match(_MOSHTIX_DATE);
    // console.log('[Moshtix] dateM:', dateM && dateM[0]);
    if (!dateM) return null;

    const eventM = text.match(_MOSHTIX_EVENT);
    const venueM = text.match(_MOSHTIX_VENUE);
    const totalM = text.match(_MOSHTIX_TOTAL);

    // console.log('[Moshtix] eventM:', eventM && eventM[1]);
    // console.log('[Moshtix] venueM:', venueM && venueM[1]);
    // console.log('[Moshtix] totalM:', totalM && totalM[1]);

    // AUD is inferred from this AU-oriented platform until currency fixtures are available.
    return {
      platform:     'Moshtix',
      event:        eventM ? eventM[1].trim() : 'N/A',
      venue:        venueM ? venueM[1].trim() : 'N/A',
      city:         'N/A',
      date:         dateM[0].trim(),
      quantity:     1,
      cost:         totalM ? `AUD $${totalM[1]}` : 'N/A',
      emailSubject: subject,
    };
  },
};

// "06 October 2024, 12:00 pm" — AU date format
const _MOSHTIX_DATE = /\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4},\s+\d{1,2}:\d{2}\s*[ap]m/i;

// Event name is the line immediately before the date
const _MOSHTIX_EVENT = /([^\n]+)\n+\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i;

// Venue is the line immediately after the date
const _MOSHTIX_VENUE = /\d{1,2}\s+\w+\s+\d{4},\s+\d{1,2}:\d{2}\s*[ap]m\n([^\n]+)/i;

// "TOTAL INCL. GST   $202.90" — may be on the same or next line
const _MOSHTIX_TOTAL = /TOTAL\s+INCL\.?\s+GST\s*\$?\s*([\d,]+\.\d{2})/i;
