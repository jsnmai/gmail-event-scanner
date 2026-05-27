// parsers/axs.js: Extracts ticket info from AXS confirmation emails.
//
// Ported from python-cli/parsers/axs.py.
// AXS has two email formats:
//
// Standard (from guestservices@axs.com) — all on ONE line:
//   "Order details for ISOxo at Cow Palace scheduled on 4/3/2026 8:00 PM"
//   "Order details for Breakaway Boston | Saturday - GA scheduled on 9/16/2023 3:00 PM"  (no venue)
//   ...
//   Included Event(s)
//   ISOxo presents H.C.D. Admissions, 4/3/2026 8:00:00 PM
//   <- "Included Event(s)" has the real event name; preferred over the presale product name
//
// Thanks (from axs@axs.com):
//   "Get excited you're seeing Dabin Presents Stay in Bloom - Admissions
//    at Under the K Bridge Park, Brooklyn, NY on Saturday 5-31-25 at 4:00 pm EDT."
//
// Received transfer (from axs.com or goldenvoice):
//   "Serena transferred 1 ticket to you for the following event:"
//   "Sat Apr 4, 2026 - 8:00 PM"
//   "ISOxo presents H.C.D. - Admissions"
//   "Cow Palace, Daly City, CA"
//
// Selection heuristic:
//   - Keep purchase confirmations as the primary paid record.
//   - Keep received-transfer notices because there may be no purchase email for them.
//   - Ignore "YOUR TICKETS ARE HERE" access/delivery notices; they usually repeat tickets
//     already represented by a purchase confirmation and do not carry payment detail.

const AXSParser = {
  name: 'AXS',

  senderQuery: 'from:axs.com',

  canParse(sender, _subject) {
    return /axs\.com/i.test(sender);
  },

  parse(_sender, subject, body, _emailDate) {
    const text = _htmlToText(body);

    // console.debug('[AXS] subject:', subject);
    // console.debug('[AXS] text:\n' + text);

    const isOrder    = /thank you for your order|thanks for your order/i.test(text);
    const isReceived = /you received tickets/i.test(text);
    if (!isOrder && !isReceived) {
      // console.debug('[AXS] skipped — not an order confirmation or received-ticket email');
      return null;
    }

    const standard  = _parseAXSStandard(text);
    const thanks    = _parseAXSThanks(text);
    const received  = _parseAXSReceived(text);
    // console.debug('[AXS] standard fields:', standard);
    // console.debug('[AXS] thanks fields:',   thanks);
    // console.debug('[AXS] received fields:', received);

    const fields = standard || thanks || received;
    // console.debug('[AXS] resolved fields:', fields);
    if (!fields) return null;

    const qtyMatch  = text.match(_AXS_QUANTITY);
    const costMatch = text.match(_AXS_GRAND_TOTAL) || text.match(_AXS_CHARGED);
    // console.debug('[AXS] qtyMatch:', qtyMatch);
    // console.debug('[AXS] costMatch:', costMatch);

    return {
      platform:     'AXS',
      event:        fields.event,
      venue:        fields.venue,
      city:         fields.city,
      date:         fields.date,
      quantity:     fields.quantity ?? (qtyMatch ? parseInt(qtyMatch[1], 10) : 1),
      cost:         costMatch ? `$${costMatch[1]}` : 'N/A',
      emailSubject: subject,
    };
  },
};

// Standard format: all event info on one line.
// e.g. "Order details for ISOxo at Cow Palace scheduled on 4/3/2026 8:00 PM"
// Venue ("at ...") is optional — older emails omit it.
// Lazy quantifiers let "at" separate product name from venue correctly.
const _AXS_ORDER_BLOCK = /Order details for ([^\n]+?)(?:\s+at\s+([^\n]+?))?\s+scheduled on (\d+\/\d+\/\d{4})\s+(\d+:\d+(?::\d+)?\s*[AP]M)/i;

// "Included Event(s)" contains the real event name (not the presale product name).
// Strips " Admissions" or " Admissions," suffix; for multi-event orders takes the first event.
const _AXS_INCLUDED = /Included Event\(s\)\n([^\n]+?) Admissions[,\s]/i;

// Extracts each date from the Included Event(s) block — used to detect multi-day passes.
// Global flag required for matchAll.
const _AXS_INCLUDED_ENTRY = /[^\n]+ Admissions, (\d+\/\d+\/\d{4})/gi;

// Thanks format: single sentence with event, venue, city, date, and time.
const _AXS_THANKS = /you\'re seeing ([^\n]+?) at ([^,\n]+), ([A-Za-z][^,\n]+, [A-Z]{2}) on \w+ (\S+) at (\d+:\d+ [ap]m)/i;

// Received-transfer format: "[Name] transferred N ticket(s) to you for the following event:"
// followed by date - time, then "Event - Admissions", then "Venue, City, ST"
const _AXS_RECEIVED_BLOCK = /transferred (\d+) tickets? to you for the following event:\n([^\n]+?) - (\d+:\d+\s*[AP]M)\s*\n([^\n]+?) - Admissions\n([^\n]+)/i;

const _AXS_GRAND_TOTAL = /Grand Total:\n\$([\d,]+\.\d{2})/i;
const _AXS_CHARGED     = /Amount Charged (?:to|To) (?:Your )?Credit Card:\n\$([\d,]+\.\d{2})/i;

// Quantity appears as the first number after the "Price / Total" column headers in the order table.
const _AXS_QUANTITY = /Price\nTotal\n(\d+)\n/i;

function _parseAXSStandard(text) {
  const m = text.match(_AXS_ORDER_BLOCK);
  if (!m) return null;

  // Prefer the "Included Event(s)" name — it's the actual event, not the presale product label
  const included = text.match(_AXS_INCLUDED);
  const event    = included ? included[1].trim() : m[1].trim();
  const location = _axsLocation(m[2] ? m[2].trim() : '');
  const time     = m[4];

  // For multi-day passes, collect all dates from the Included Event(s) block
  // e.g. "Dabin Admissions, 4/26/2025 ..." and "Dabin Admissions, 4/27/2025 ..."
  // Do not invent an end time when the order header supplies only one time.
  const sectionIdx = text.indexOf('Included Event(s)\n');
  let date = `${m[3]} ${time}`;
  if (sectionIdx !== -1) {
    const section  = text.slice(sectionIdx);
    const allDates = [...section.matchAll(_AXS_INCLUDED_ENTRY)].map(x => x[1]);
    if (allDates.length > 1) {
      date = `${allDates[0]} ${time} - ${allDates[allDates.length - 1]}`;
    } else if (allDates.length === 1) {
      date = `${allDates[0]} ${time}`;
    }
  }

  return { event, venue: location.venue, city: location.city, date };
}

function _parseAXSThanks(text) {
  const m = text.match(_AXS_THANKS);
  if (!m) return null;

  // Strip " - Admissions" or " Admissions" suffix from event name
  const event = m[1].trim().replace(/\s*-?\s*Admissions$/i, '');
  const date  = `${m[4]} ${m[5]}`;

  return { event, venue: m[2].trim(), city: m[3].trim(), date };
}

function _parseAXSReceived(text) {
  const m = text.match(_AXS_RECEIVED_BLOCK);
  if (!m) return null;

  // Date line is "Day Mon DD, YYYY - H:MM PM" — join date and time with a space
  const date = `${m[2].trim()} ${m[3].trim()}`;

  // Venue+city line: "Venue, City, ST" — split so city is the trailing "Name, ST"
  const vl      = m[5].trim();
  const vcMatch = vl.match(/^(.+?),\s+([A-Za-z][^,]+,\s+[A-Z]{2})$/);

  return {
    event:    m[4].trim(),
    venue:    vcMatch ? vcMatch[1].trim() : vl,
    city:     vcMatch ? vcMatch[2].trim() : 'N/A',
    date,
    quantity: parseInt(m[1], 10),
  };
}

function _axsLocation(rawVenue) {
  if (!rawVenue) return { venue: 'N/A', city: 'N/A' };
  const match = rawVenue.match(/^(.+?),\s+([A-Za-z][^,\n]+,\s*[A-Z]{2})$/);
  return {
    venue: match ? match[1].trim() : rawVenue,
    city: match ? match[2].trim() : 'N/A',
  };
}
