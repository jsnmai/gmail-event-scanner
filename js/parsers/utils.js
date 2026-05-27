// utils.js: Shared helpers available to all parser files.

// Convert an HTML email body to plain text so regex-based parsers work correctly.
// Mirrors Python's BeautifulSoup soup.get_text(separator='\n', strip=True).
//
// We walk the DOM tree and insert newlines at block element boundaries.
// Using textContent directly on the raw document fails because:
//   - <style> and <script> tags expose raw CSS/JS as text
//   - adjacent inline elements produce no whitespace between them
function _htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  doc.querySelectorAll('style, script').forEach(el => el.remove());

  const BLOCK = new Set([
    'P','DIV','TR','LI','TD','TH','BR',
    'H1','H2','H3','H4','H5','H6',
    'TABLE','THEAD','TBODY','TFOOT',
    'BLOCKQUOTE','SECTION','ARTICLE','HEADER','FOOTER',
  ]);

  let out = '';

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const chunk = node.textContent
        .replace(/[\u00A0\u202F\u2007]/g, ' ')
        .replace(/[ \t\r\n]+/g, ' ');
      if (chunk.trim()) out += chunk;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const isBlock = BLOCK.has(node.tagName);
    if (isBlock && out && !out.endsWith('\n')) out += '\n';
    for (const child of node.childNodes) walk(child);
    if (isBlock && out && !out.endsWith('\n')) out += '\n';
  }

  walk(doc.body);

  return _normalizeWhitespace(out)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Normalize email whitespace centrally while retaining block-level line breaks.
function _normalizeWhitespace(text) {
  return String(text ?? '')
    .replace(/[\u00A0\u202F\u2007]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}

// Parse a raw date string from any parser into a Date object.
function _parseDate(dateStr) {
  if (!dateStr || dateStr === 'N/A') return new Date(NaN);

  const rawDate = String(dateStr);
  // Preserve unresolved date ranges (for example Tixr V1 without an order-date year)
  // instead of allowing Date to invent a year for their first endpoint.
  if (/\s(?:[-\u2013\u2014]|to)\s/i.test(rawDate) && !/\b\d{4}\b/.test(rawDate)) {
    return new Date(NaN);
  }

  // Normalize platform-specific separators, then collapse whitespace.
  let cleaned = rawDate.replace(/[·•@]/g, ' ').replace(/\s+/g, ' ').trim();

  // For date ranges, use only the start date for sorting/display.
  cleaned = cleaned.replace(/\s*[-–]\s*\d{1,2}\/\d{1,2}\/\d{4}.*/i, '');
  cleaned = cleaned.replace(/\s*(?:[-–—]|to)\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun).+$/i, '');
  cleaned = cleaned.replace(/\s+at\s+(\d)/i, ' $1');
  cleaned = cleaned.replace(/(\d+:\d+\s*[AP]M)\s+[A-Z]{2,5}\b/i, '$1');
  cleaned = cleaned.replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\./gi, '$1');
  cleaned = cleaned.replace(/(\d)\s*(am|pm)\b/gi, (_, n, p) => `${n} ${p.toUpperCase()}`);
  cleaned = cleaned.replace(/\b(\d{1,2}) (AM|PM)\b/g, '$1:00 $2');

  let d = new Date(cleaned);

  if (isNaN(d)) {
    cleaned = cleaned.replace(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*,?\s*/i, '');
    d = new Date(cleaned);
  }

  if (isNaN(d)) {
    cleaned = cleaned.replace(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/, '$2 $1, $3');
    d = new Date(cleaned);
  }

  return d;
}

// Format date strings consistently for table and CSV presentation.
function _formatDate(dateStr) {
  if (!dateStr) return dateStr;

  const numericRange = dateStr.match(/\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4}.*)$/i);
  const namedRange   = dateStr.match(/\s*(?:[-–]|to)\s*((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun).*)$/i);
  const rangeEnd     = numericRange || namedRange;

  if (rangeEnd) {
    const startStr = dateStr.slice(0, dateStr.length - rangeEnd[0].length).trim();
    const endStr   = rangeEnd[1].trim();
    const startFmt = _formatSingleDate(startStr);
    const endFmt   = _formatSingleDate(endStr);
    if (startFmt && endFmt) return `${startFmt} - ${endFmt}`;
  }

  return _formatSingleDate(dateStr) || dateStr;
}

function _formatSingleDate(dateStr) {
  const d = _parseDate(dateStr);
  if (isNaN(d)) return null;
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  const day  = d.toLocaleDateString('en-US', { weekday: 'short' });
  const hasTime = /(?:\d{1,2}:\d{2}|\d{1,2}\s*(?:AM|PM)\b)/i.test(dateStr);
  if (!hasTime) return `${mm}/${dd}/${yyyy} (${day})`;
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${mm}/${dd}/${yyyy} (${day}) \u00b7 ${time}`;
}

function _displayTicketDate(ticket) {
  if (isNaN(_parseDate(ticket.date))) {
    return `Date not recognized: ${ticket.date || 'N/A'}`;
  }
  return _formatDate(ticket.date);
}

function _sourceSubjects(ticket) {
  const subjects = Array.isArray(ticket.rawSubjects) && ticket.rawSubjects.length
    ? ticket.rawSubjects
    : [ticket.rawSubject || ticket.emailSubject];
  return subjects.filter(_hasUsefulValue).join('; ');
}

function _hasUsefulValue(value) {
  return value !== undefined && value !== null &&
    String(value).trim() !== '' && String(value).trim().toUpperCase() !== 'N/A';
}

function _normalizeKeyPart(value) {
  return String(value ?? '')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function _eventDay(ticket) {
  const date = _parseDate(ticket.date);
  if (isNaN(date)) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day   = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function _ticketFingerprint(ticket) {
  const platform = _normalizeKeyPart(ticket.platform || ticket.sourceParser);
  const event    = _normalizeKeyPart(ticket.event);
  const date     = _eventDay(ticket);
  const type     = ticket.itemType || 'event';
  if (!platform || !event || !date) return '';
  return `${platform}|${event}|${date}|${type}`;
}

function _scoreTicket(ticket) {
  const valuedFields = ['venue', 'city', 'cost', 'quantity', 'orderNumber'];
  let score = valuedFields.reduce(
    (sum, field) => sum + (_hasUsefulValue(ticket[field]) ? 1 : 0),
    0
  );
  if (_hasUsefulValue(ticket.sourceMessageId) ||
      (Array.isArray(ticket.sourceMessageIds) && ticket.sourceMessageIds.length)) {
    score++;
  }
  return score;
}

function _mergeTicketMetadata(primary, other) {
  const merged = { ...primary };
  for (const field of ['venue', 'city', 'cost', 'quantity', 'orderNumber', 'emailSubject', 'emailDate']) {
    if (!_hasUsefulValue(merged[field]) && _hasUsefulValue(other[field])) {
      merged[field] = other[field];
    }
  }

  const arrayFields = [
    ['sourceMessageIds', 'sourceMessageId'],
    ['sourceParsers', 'sourceParser'],
    ['rawSubjects', 'rawSubject'],
    ['rawFroms', 'rawFrom'],
    ['emailDates', 'emailDate'],
  ];
  for (const [arrayField, scalarField] of arrayFields) {
    const values = [
      ...(Array.isArray(primary[arrayField]) ? primary[arrayField] : []),
      primary[scalarField],
      ...(Array.isArray(other[arrayField]) ? other[arrayField] : []),
      other[scalarField],
    ].filter(_hasUsefulValue);
    merged[arrayField] = [...new Set(values)];
  }
  return merged;
}

function classifyTicket(ticket) {
  if (ticket.itemType === 'event' || ticket.itemType === 'add-on') return ticket;
  if (!_hasUsefulValue(ticket.event)) return { ...ticket, itemType: 'unknown' };

  const haystack = `${ticket.event || ''} ${ticket.ticketType || ''}`;
  const addOn = /\b(parking|shuttle|merch|merchandise|collectible|magnets?|vip add-on)\b/i.test(haystack);
  const merchandise = /\b(merch|merchandise|collectible|magnets?)\b/i.test(haystack);
  const bundledAdmission = merchandise && /\b(ga|admission|entry|pass|tickets?)\b/i.test(haystack);
  return { ...ticket, itemType: addOn && !bundledAdmission ? 'add-on' : 'event' };
}

function dedupeTickets(tickets) {
  const result = [];
  const fingerprints = new Map();

  for (const rawTicket of tickets) {
    const ticket = classifyTicket(rawTicket);
    const fingerprint = _ticketFingerprint(ticket);
    if (!fingerprint) {
      result.push(ticket);
      continue;
    }

    const candidates = fingerprints.get(fingerprint) || [];
    const existingIndex = candidates.find(index => _canMergeTickets(result[index], ticket));
    if (existingIndex === undefined) {
      candidates.push(result.length);
      fingerprints.set(fingerprint, candidates);
      result.push(ticket);
      continue;
    }

    const existing = result[existingIndex];
    if (_scoreTicket(ticket) > _scoreTicket(existing)) {
      result[existingIndex] = _mergeTicketMetadata(ticket, existing);
    } else {
      result[existingIndex] = _mergeTicketMetadata(existing, ticket);
    }
  }

  return result;
}

function _canMergeTickets(existing, ticket) {
  const existingOrder = _normalizeKeyPart(existing.orderNumber);
  const ticketOrder   = _normalizeKeyPart(ticket.orderNumber);
  if (existingOrder && ticketOrder) return existingOrder === ticketOrder;
  if (_ticketsConflict(existing, ticket)) return false;

  const sameCost = _sameMeaningfulValue(existing.cost, ticket.cost, true);
  const sameQuantity = _sameMeaningfulValue(existing.quantity, ticket.quantity);
  if (sameCost && sameQuantity) return true;

  const complementaryTransactionField = ['cost', 'quantity'].some(field =>
    _hasUsefulValue(existing[field]) !== _hasUsefulValue(ticket[field])
  );
  if (complementaryTransactionField) return true;

  return _isMostlyRedundant(existing, ticket) || _isMostlyRedundant(ticket, existing);
}

function _ticketsConflict(existing, ticket) {
  return _differentMeaningfulValue(existing.cost, ticket.cost, true) ||
    _differentMeaningfulValue(existing.quantity, ticket.quantity) ||
    _differentMeaningfulValue(existing.venue, ticket.venue, false, true) ||
    _differentMeaningfulValue(existing.city, ticket.city, false, true);
}

function _sameMeaningfulValue(a, b, isMoney = false) {
  if (!_hasUsefulValue(a) || !_hasUsefulValue(b)) return false;
  if (isMoney) {
    const leftMoney  = parseMoney(a);
    const rightMoney = parseMoney(b);
    if (leftMoney && rightMoney) {
      return leftMoney.amount === rightMoney.amount && leftMoney.currency === rightMoney.currency;
    }
  }
  return _normalizeKeyPart(a) === _normalizeKeyPart(b);
}

function _differentMeaningfulValue(a, b, isMoney = false, allowContainedMatch = false) {
  if (!_hasUsefulValue(a) || !_hasUsefulValue(b)) return false;
  if (_sameMeaningfulValue(a, b, isMoney)) return false;

  if (!allowContainedMatch) return true;
  const left  = _normalizeKeyPart(a);
  const right = _normalizeKeyPart(b);
  return !left.includes(right) && !right.includes(left);
}

function _isMostlyRedundant(lessComplete, moreComplete) {
  let matchingFields = 0;
  let extraFields = 0;
  for (const field of ['venue', 'city', 'cost', 'quantity']) {
    if (_hasUsefulValue(lessComplete[field])) {
      if (!_sameMeaningfulValue(lessComplete[field], moreComplete[field], field === 'cost')) {
        return false;
      }
      matchingFields++;
    } else if (_hasUsefulValue(moreComplete[field])) {
      extraFields++;
    }
  }
  return matchingFields > 0 && extraFields > 0;
}

function _sortableDate(ticket) {
  const eventDate = _parseDate(ticket.date);
  if (!isNaN(eventDate)) return eventDate;
  // An email's arrival date is not the event date; keep unknown events below
  // the dated timeline instead of implying a chronological placement.
  return null;
}

function sortTicketsByEventDate(tickets) {
  return tickets.sort((a, b) => {
    const da = _sortableDate(a);
    const db = _sortableDate(b);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return db - da;
  });
}

function parseMoney(raw = '') {
  const value = String(raw);
  let currency = 'UNKNOWN';
  if (/\bAUD\b|A\$/i.test(value)) currency = 'AUD';
  else if (/\bCAD\b|C\$/i.test(value)) currency = 'CAD';
  else if (/\bGBP\b|£/i.test(value)) currency = 'GBP';
  else if (/\bEUR\b|€/i.test(value)) currency = 'EUR';
  else if (/\bUSD\b|US\$/i.test(value)) currency = 'USD';
  else if (/\$/.test(value) && !/\b[A-Z]{3}\b/i.test(value)) currency = 'USD';

  const amount = Number(value.replace(/,/g, '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(amount) && /\d/.test(value) ? { amount, currency } : null;
}

function totalsByCurrency(tickets) {
  const totals = new Map();
  for (const ticket of tickets) {
    const money = parseMoney(ticket.cost);
    if (!money) continue;
    totals.set(money.currency, (totals.get(money.currency) || 0) + money.amount);
  }
  return totals;
}

function formatCurrencyTotals(tickets) {
  const totals = totalsByCurrency(tickets);
  if (totals.size === 0) return '';
  const symbols = { USD: '$', AUD: 'A$', CAD: 'C$', GBP: '\u00a3', EUR: '\u20ac', UNKNOWN: '' };
  const parts = [...totals.entries()].map(([currency, amount]) =>
    `${currency} ${symbols[currency]}${amount.toFixed(2)}`
  );
  return `Event ticket total (excluding add-ons): ${parts.join(', ')}`;
}
