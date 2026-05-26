// parsers/universe.js: Extracts ticket info from Universe confirmation emails.
//
// Universe HTML body (via _htmlToText) structure — labels from text/plain do NOT appear:
//   You've reserved your spot to Breakaway Arizona 2026!
//   This is your order confirmation for Breakaway Arizona 2026.
//   Breakaway Music Festival
//   Sloan Park Festival Grounds          ← venue (line before street address)
//   2330 W Rio Salado Pkwy, Mesa, AZ 85201, USA
//   ...
//   Festival Details: Friday, April 24, 2026: 3pm-10pm / Saturday, April 25, 2026: ...
//   ...
//   Total
//   $75.98 USD                           ← total on its own line after "Total"
//
// Subject: "Here is your ticket to Breakaway Arizona 2026"

const UniverseParser = {
  name: 'Universe',

  senderQuery: 'from:universe.com',

  canParse(sender, _subject) {
    return /universe\.com/i.test(sender);
  },

  parse(_sender, subject, body, _emailDate) {
    const text = _htmlToText(body);

    if (!/order confirmation|reserved your spot/i.test(text)) return null;

    const subjectM = subject.match(_UNIVERSE_SUBJECT);
    if (!subjectM) return null;

    const dateM  = text.match(_UNIVERSE_DATE);
    const venueM = text.match(_UNIVERSE_VENUE);
    const locM   = text.match(_UNIVERSE_LOCATION);
    const totalM = text.match(_UNIVERSE_TOTAL);

    const city = locM ? `${locM[1].trim()}, ${locM[2]}` : 'N/A';

    return {
      platform:     'Universe',
      event:        subjectM[1].trim(),
      venue:        venueM ? venueM[1].trim() : 'N/A',
      city,
      date:         dateM ? dateM[1].trim() : 'N/A',
      quantity:     1,
      cost:         totalM ? `$${totalM[1]}` : 'N/A',
      emailSubject: subject,
    };
  },
};

// "Here is your ticket to Breakaway Arizona 2026"
const _UNIVERSE_SUBJECT = /Here is your ticket to (.+)/i;

// "Festival Details: Friday, April 24, 2026: 3pm-10pm / ..." — year is always present here
const _UNIVERSE_DATE = /Festival Details:\s*(\w+,\s+\w+\s+\d+,\s+\d{4})/i;

// Line immediately before the street address (address starts with a digit)
const _UNIVERSE_VENUE = /([^\n]+)\n\d+\s[^\n]+,\s*[^,\n]+,\s*[A-Z]{2}\s+\d{5}/;

// "2330 W Rio Salado Pkwy, Mesa, AZ 85201, USA" → city="Mesa", state="AZ"
const _UNIVERSE_LOCATION = /^\d+\s[^\n,]+,\s*([^,\n]+),\s*([A-Z]{2})\s+\d{5}/im;

// "Total \n$75.98 USD" — label line may have trailing spaces; value is on the next line
const _UNIVERSE_TOTAL = /\bTotal[^\n]*\n[^\S\n]*\$([\d,]+\.\d{2})/im;
