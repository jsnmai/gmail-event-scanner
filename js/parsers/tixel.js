// parsers/tixel.js: Extracts ticket info from Tixel resale confirmation emails (AU).
//
// Tixel is an Australian ticket resale marketplace.
// Email format (HTML-only, no text/plain part):
//   Subject: "You purchased a ticket to Dom Dolla"
//   h2:  Dom Dolla                          ← event
//   h4:  29 November 2024                   ← date (AU day-month-year)
//   p:   The Domain                         ← venue
//   p:   The Domain, Art Gallery Road, Sydney  ← address (city = last segment)
//   Summary section:
//     1 x ticket:   $153.89
//     Fees:         $14.47
//     Total:        $168.36
//
// Selection heuristic: keep "You purchased a ticket to ..." messages as resale
// purchase records; other Tixel sender traffic without that subject is skipped.

const TixelParser = {
  name: 'Tixel',

  senderQuery: 'from:tixel.io',

  canParse(sender, _subject) {
    return /tixel\.io/i.test(sender);
  },

  parse(_sender, subject, body, _emailDate) {
    const text = _htmlToText(body);

    const subjectM = subject.match(_TIXEL_SUBJECT);
    if (!subjectM) return null;

    const dateM    = text.match(_TIXEL_DATE);
    const venueAddrM = dateM ? text.match(_TIXEL_VENUE_ADDR) : null;
    const totalM   = text.match(_TIXEL_TOTAL);
    const qtyM     = text.match(_TIXEL_QTY);

    let venue = 'N/A', city = 'N/A';
    if (venueAddrM) {
      venue = venueAddrM[1].trim();
      city  = _tixelExtractCity(venueAddrM[2].trim());
    }

    // AUD is inferred from this AU-oriented platform until currency fixtures are available.
    return {
      platform:     'Tixel',
      event:        subjectM[1].trim(),
      venue,
      city,
      date:         dateM ? dateM[0].trim() : 'N/A',
      quantity:     qtyM ? parseInt(qtyM[1], 10) : 1,
      cost:         totalM ? `AUD $${totalM[1]}` : 'N/A',
      emailSubject: subject,
    };
  },
};

// "You purchased a ticket to Dom Dolla"
const _TIXEL_SUBJECT = /You purchased a ticket to (.+)/i;

// "29 November 2024" — AU day-month-year (no time in these emails)
const _TIXEL_DATE = /\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i;

// Venue name and address appear on consecutive lines immediately after the date
const _TIXEL_VENUE_ADDR = /\d{1,2}\s+\w+\s+\d{4}\n([^\n]+)\n([^\n]+)/i;

// "Total:   $168.36"
const _TIXEL_TOTAL = /\bTotal:\s*\$?([\d,]+\.\d{2})/i;

// "1 x ticket:   $153.89"
const _TIXEL_QTY = /(\d+)\s*x\s+ticket:/i;

// Extract the city from a Tixel address line.
// "The Domain, Art Gallery Road, Sydney"           → "Sydney"
// "Sydney Showground Stadium, Sydney, Australia"   → "Sydney" (skip country name)
function _tixelExtractCity(addr) {
  const parts = addr.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return 'N/A';
  const last = parts[parts.length - 1];
  if (/^(Australia|USA|United States|UK|United Kingdom|Canada|New Zealand)$/i.test(last)) {
    return parts.length >= 2 ? parts[parts.length - 2] : 'N/A';
  }
  return last;
}
