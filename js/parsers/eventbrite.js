// parsers/eventbrite.js: Extracts ticket info from Eventbrite order confirmation emails.
//
// Eventbrite embeds a JSON-LD <script type="application/ld+json"> block in the HTML body
// with structured EventReservation data — much more reliable than text scraping:
//   "reservationFor": {
//     "name":      "Brownies & Lemonade: Rattleship Rebound | July 25-26",
//     "startDate": "2025-07-25 21:00:00",
//     "location":  { "address": { "addressLocality": "Oakland", "addressRegion": "CA" } }
//   }
//
// Subject pattern: "Order Confirmation for Brownies & Lemonade: RATTLESHIP 2025 | Sat Jul 26"
// Cost: "$60.44 paid by MasterCard" in the email body text.
//
// Selection heuristic: keep only "Order Confirmation for ..." messages as purchase
// records; other Eventbrite sender traffic is ignored even if it mentions an event.

const EventbriteParser = {
  name: 'Eventbrite',

  senderQuery: 'from:eventbrite.com',

  canParse(sender, _subject) {
    return /eventbrite\.com/i.test(sender);
  },

  parse(_sender, subject, body, _emailDate) {
    const subjectM = subject.match(_EB_SUBJECT);
    if (!subjectM) return null;

    let date = 'N/A', venue = 'N/A', city = 'N/A';

    // Parse the JSON-LD block from the raw HTML before _htmlToText strips it
    const ldM = body.match(_EB_JSONLD);
    if (ldM) {
      try {
        const ld  = JSON.parse(ldM[1]);
        const evt = ld.reservationFor || ld;
        if (evt.startDate) date = evt.startDate.replace(' ', 'T'); // ISO → parseable by _parseDate
        // Eventbrite sometimes sets location.name to a street address rather
        // than a venue label. Keep addresses in location data, not the Venue column.
        if (evt.location && evt.location.name && !_looksLikeStreetAddress(evt.location.name)) {
          venue = evt.location.name;
        }
        const addr = evt.location && evt.location.address;
        if (addr && addr.addressLocality && addr.addressRegion) {
          city = `${addr.addressLocality}, ${addr.addressRegion}`;
        }
      } catch (_) {}
    }

    // Some confirmation variants omit JSON-LD but carry an event year and day in
    // the subject (for example "... 2025 | Sat Jul 26"). Only infer when there
    // is exactly one possible year, rather than guessing from the email date.
    if (date === 'N/A') {
      const subjectDate = subjectM[1].match(_EB_SUBJECT_DATE);
      const years = [...new Set([...subjectM[1].matchAll(/\b(20\d{2})\b/g)].map(match => match[1]))];
      if (subjectDate && years.length === 1) {
        date = `${subjectDate[1]} ${subjectDate[2]} ${subjectDate[3]}, ${years[0]}`;
      }
    }

    const text  = _htmlToText(body);
    const costM = text.match(_EB_COST);

    return {
      platform:     'Eventbrite',
      event:        subjectM[1].trim(),
      venue,
      city,
      date,
      quantity:     1,
      cost:         costM ? `$${costM[1]}` : 'N/A',
      emailSubject: subject,
    };
  },
};

// "Order Confirmation for Brownies & Lemonade: RATTLESHIP 2025 | Sat Jul 26"
const _EB_SUBJECT = /Order Confirmation for (.+)/i;
const _EB_SUBJECT_DATE = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\b/i;

// Matches the JSON-LD structured data block
const _EB_JSONLD = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i;

// "$60.44 paid by MasterCard" — cost as charged to the card
const _EB_COST = /\$([\d,]+\.\d{2})\s+paid by/i;

function _looksLikeStreetAddress(value) {
  return /^\s*\d+\s+\S[\s\S]*\b(?:St(?:reet)?|Ave(?:nue)?|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Pkwy|Parkway|Hwy|Highway|Ct|Court|Pl|Place)\.?\s*$/i
    .test(String(value));
}
