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

const EventbriteParser = {
  name: 'Eventbrite',

  senderQuery: 'from:eventbrite.com',

  canParse(sender, _subject) {
    return /eventbrite\.com/i.test(sender);
  },

  parse(_sender, subject, body, _emailDate) {
    const subjectM = subject.match(_EB_SUBJECT);
    if (!subjectM) return null;

    let date = 'N/A', city = 'N/A';

    // Parse the JSON-LD block from the raw HTML before _htmlToText strips it
    const ldM = body.match(_EB_JSONLD);
    if (ldM) {
      try {
        const ld  = JSON.parse(ldM[1]);
        const evt = ld.reservationFor || ld;
        if (evt.startDate) date = evt.startDate.replace(' ', 'T'); // ISO → parseable by _parseDate
        const addr = evt.location && evt.location.address;
        if (addr && addr.addressLocality && addr.addressRegion) {
          city = `${addr.addressLocality}, ${addr.addressRegion}`;
        }
      } catch (_) {}
    }

    const text  = _htmlToText(body);
    const costM = text.match(_EB_COST);

    return {
      platform:     'Eventbrite',
      event:        subjectM[1].trim(),
      venue:        'N/A',
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

// Matches the JSON-LD structured data block
const _EB_JSONLD = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i;

// "$60.44 paid by MasterCard" — cost as charged to the card
const _EB_COST = /\$([\d,]+\.\d{2})\s+paid by/i;
