// parsers/ticketweb.js: Extracts ticket info from TicketWeb confirmation emails.
//
// Ported from python-cli/parsers/ticketweb.py.
// Email format:
//   ORDER SUMMARY
//   Cafe du Nord Presents:     <- optional promoter line
//   GhostDragon with Daye
//   Fri Jul 28, 2023
//   9:00 PM (Doors @ 8:00 PM)
//   ...
//   AGE: 21+
//   Cafe Du Nord
//   2174 Market St.
//   San Francisco, CA 94114
//
// Selection heuristic: keep messages containing an ORDER SUMMARY event block as the
// purchase record; sender messages without that receipt structure are skipped.

const TicketWebParser = {
  name: 'TicketWeb',

  senderQuery: 'from:ticketweb.com',

  canParse(sender, _subject) {
    return /ticketweb\.com/i.test(sender);
  },

  parse(_sender, subject, body, _emailDate) {
    // Strip BOM character that appears in some TicketWeb emails
    const text = _htmlToText(body).replace(/﻿/g, '');

    if (!/ORDER SUMMARY/i.test(text)) return null;

    const m = text.match(_TW_EVENT_BLOCK);
    if (!m) return null;

    const event = m[1].trim();
    const date  = `${m[2].trim()} ${m[3].trim()}`;

    const venueMatch = text.match(_TW_VENUE_BLOCK);
    const venue = venueMatch ? venueMatch[1].trim() : 'N/A';
    const city  = venueMatch ? `${venueMatch[2].trim()}, ${venueMatch[3]}` : 'N/A';

    let cost = 'N/A';
    const sectionMatch = text.match(_TW_COST_SECTION);
    if (sectionMatch) {
      const amounts = sectionMatch[1].match(/[\d,]+\.\d{2}/g);
      if (amounts) cost = `$${amounts[amounts.length - 1]}`;
    }

    return {
      platform:     'TicketWeb',
      event,
      venue,
      city,
      date,
      quantity:     1,
      cost,
      emailSubject: subject,
    };
  },
};

// [^\n]* after "Presents:" handles trailing spaces before the newline
const _TW_EVENT_BLOCK = /ORDER SUMMARY\n+(?:[^\n]+Presents:[^\n]*\n+)?([^\n]+)\n+(\w+\s+\w+\s+\d+,\s+\d{4})\n+(\d+:\d+\s*[AP]M)/i;

const _TW_VENUE_BLOCK = /AGE:[^\n]*\n+([^\n]+)\n+\d+[^\n]+\n+([A-Za-z][A-Za-z\s]+),\s+([A-Z]{2})\s+\d{5}/i;

// Capture everything between "Total Payment" and the next landmark, then find dollar amounts.
// The last amount in the section is the order total.
const _TW_COST_SECTION = /Total Payment([\s\S]*?)(?:TicketWeb|Thank you|If you have)/i;
