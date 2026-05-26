// parsers/dnalounge.js: Extracts ticket info from DNA Lounge confirmation emails.
//
// Ported from python-cli/parsers/dnalounge.py.
// DNA Lounge is a single SF venue, so venue and city are hardcoded.
// Receipt table format:
//   Qty   Item   Line Total
//   1
//   Crankdat: Absolute Annihilation Pre-Party,
//   Thu, Jun 6th, 9PM
//
// DNA Lounge emails omit the year — it's inferred from the email send date.

const DNALoungeParser = {
  name: 'DNA Lounge',

  senderQuery: 'from:dnalounge.com',

  canParse(sender, _subject) {
    return /dnalounge\.com/i.test(sender);
  },

  parse(_sender, subject, body, emailDate) {
    const text = _htmlToText(body);

    const m = text.match(_DNA_RECEIPT);
    if (!m) return null;

    const quantity = parseInt(m[1], 10);
    const event    = m[2].trim();

    // Strip ordinal suffixes: "6th" → "6", "21st" → "21"
    const dateRaw = m[3].replace(/(\d+)(?:st|nd|rd|th)\b/gi, '$1');
    const date    = _dnaResolveYear(dateRaw, emailDate);

    const costMatch = text.match(_DNA_COST);

    return {
      platform:     'DNA Lounge',
      event,
      venue:        'DNA Lounge',
      city:         'San Francisco, CA',
      date,
      quantity,
      cost:         costMatch ? `$${costMatch[1]}` : 'N/A',
      emailSubject: subject,
    };
  },
};

const _DNA_RECEIPT = /Qty\n+Item\n+Line Total\n+(\d+)\n+([^\n]+),\n+(\w+,\s+\w+\s+\d+\w*,\s+\d+[AP]M)/i;

const _DNA_COST = /Total\n\$([\d,]+\.\d{2})/i;

// DNA Lounge emails omit the year. Pick the year (current or +1) that puts
// the event on or after the email send date, so Dec emails for Jan events resolve correctly.
function _dnaResolveYear(dateStr, emailDate) {
  if (!emailDate) return dateStr;
  try {
    const sent = new Date(emailDate);
    if (isNaN(sent)) return dateStr;
    for (const year of [sent.getFullYear(), sent.getFullYear() + 1]) {
      const event = new Date(`${dateStr} ${year}`);
      if (!isNaN(event) && event >= sent) return `${dateStr} ${year}`;
    }
    return `${dateStr} ${sent.getFullYear()}`;
  } catch {
    return dateStr;
  }
}
