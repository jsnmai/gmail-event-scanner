// gmail.js: Fetches emails from the Gmail REST API using the user's access token.
//
// We call the Gmail API directly with fetch(), no extra libraries needed.
// All data stays in the browser; nothing is sent to our own servers.

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const PAGE_SIZE = 500; // maximum Gmail allows per list request

// Fetch all emails matching the given Gmail search query (e.g. "from:ticketmaster.com").
// Returns an array of { sender, subject, emailDate, sourceMessageId, body } objects.
async function fetchEmailsByQuery(accessToken, query, onProgress) {
  const stubs = await _getAllMessageStubs(accessToken, query);

  if (onProgress) onProgress(0, stubs.length);

  const emails = [];
  for (let i = 0; i < stubs.length; i++) {
    const msg = await _getFullMessage(accessToken, stubs[i].id);
    emails.push(_parseMessage(msg));
    if (onProgress) onProgress(i + 1, stubs.length);
  }

  return emails;
}

// Page through Gmail search results until every matching message ID is collected.
// Gmail returns at most PAGE_SIZE results per request, so we keep fetching
// until there's no nextPageToken.
async function _getAllMessageStubs(accessToken, query) {
  const stubs = [];
  let pageToken = null;

  do {
    const params = new URLSearchParams({ q: query, maxResults: PAGE_SIZE });
    if (pageToken) params.set('pageToken', pageToken);

    const res  = await fetch(`${GMAIL_API}/messages?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();

    (data.messages || []).forEach(m => stubs.push(m));
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return stubs;
}

// Fetch a single message with its full payload (headers + body).
async function _getFullMessage(accessToken, id) {
  const res = await fetch(`${GMAIL_API}/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail API error ${res.status} fetching message ${id}`);
  return res.json();
}

// Pull sender, subject, date, and decoded body out of a raw Gmail API message object.
function _parseMessage(msg) {
  const headers = {};
  for (const h of msg.payload.headers) {
    headers[h.name] = h.value;
  }

  return {
    sender:          headers['From']    || '',
    subject:         headers['Subject'] || '',
    emailDate:       headers['Date']    || '',
    sourceMessageId: msg.id             || '',
    body:            _extractBody(msg.payload),
  };
}

// Decode the HTML (or plain text) body from the Gmail payload.
//
// Gmail messages can be structured in layers:
//   - Simple email: body is directly in payload.body.data
//   - Multipart email (the norm for HTML ticket emails): body is nested inside payload.parts[]
// We prefer HTML over plain text because the parsers rely on HTML structure.
function _extractBody(payload) {
  const mime = payload.mimeType || '';

  if (mime === 'text/html' && payload.body?.data) {
    return _decodeBase64(payload.body.data);
  }

  if (payload.parts) {
    // First look for an HTML part at this level
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return _decodeBase64(part.body.data);
      }
    }
    // If not found at this level, recurse into nested parts
    for (const part of payload.parts) {
      const result = _extractBody(part);
      if (result) return result;
    }
  }

  // Last resort: plain text
  if (mime === 'text/plain' && payload.body?.data) {
    return _decodeBase64(payload.body.data);
  }

  return '';
}

// Gmail encodes message bodies in base64url (uses - and _ instead of + and /).
// We convert to standard base64, then decode the bytes as UTF-8.
function _decodeBase64(data) {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  // Pad to a multiple of 4 characters so atob doesn't throw
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');

  const binary = atob(padded);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}
