// Flow:
// 1. user clicks "Log in with Google"
// 2. OAuth popup
// 3. token stored in memory
// 4. user clicks "Scan"
// 5. Gmail API fetches matching emails
// 6. parsers extract ticket data
// 7. results displayed in table w/ optional CSV download

// --- Parser registry ---
// To add a new parser:
//   1. Create js/parsers/yourplatform.js following the same shape as ticketmaster.js
//   2. Add a <script src="js/parsers/yourplatform.js"> tag in index.html before main.js
//   3. Add the parser object to the PARSERS array below
const PARSERS = [
  TicketmasterParser,
  TickPickParser,
  StubHubParser,

  // Uncomment (and add the <script> tag) as you port each parser:
  // TicketWebParser,
  // DNALoungeParser,
  // TixrParser,
  // AXSParser,
  // FrontGateParser,
];

// Build the Gmail search query by combining all parser sender filters.
// e.g. with two parsers: "from:(ticketmaster.com OR stubhub.com)"
function buildGmailQuery() {
  const domains = PARSERS.map(p => p.senderQuery.replace(/^from:/, ''));
  return `from:(${domains.join(' OR ')})`;
}

function findParser(sender, subject) {
  return PARSERS.find(p => p.canParse(sender, subject));
}

// --- DOM references ---
const signInBtn   = document.getElementById('sign-in-btn');
const signOutBtn  = document.getElementById('sign-out-btn');
const scanBtn     = document.getElementById('scan-btn');
const downloadBtn = document.getElementById('download-btn');
const statusEl    = document.getElementById('status');
const resultsEl   = document.getElementById('results');
const tableBody   = document.getElementById('ticket-tbody');
const authSection = document.getElementById('auth-section');
const appSection  = document.getElementById('app-section');
const countEl     = document.getElementById('ticket-count');

let _tickets = []; // holds parsed tickets so the download button can use them later

// Called by the GIS <script> tag's onload attribute once the library is ready.
// This is the entry point for the whole app.
function onGISLoad() {
  initAuth(onSignedIn);

  // Populate the supported platforms line from the parser registry
  document.getElementById('supported-platforms').textContent =
    'Currently supports: ' + PARSERS.map(p => p.name).join(', ');

  signInBtn.addEventListener('click', signIn);
  signOutBtn.addEventListener('click', onSignedOut);
  scanBtn.addEventListener('click', runScan);
  downloadBtn.addEventListener('click', () => downloadCSV(_tickets));
}

// Called after the user successfully completes the Google sign-in flow.
function onSignedIn() {
  authSection.hidden  = true;
  appSection.hidden   = false;
  signOutBtn.hidden   = false;  // reveal the header sign-out button
  setStatus('Ready. Click "Scan my ticket emails" to start.');
}

// Called when the user clicks "Sign out".
// Clears the token from memory and resets the UI back to the sign-in screen.
function onSignedOut() {
  signOut();
  authSection.hidden  = false;
  appSection.hidden   = true;
  signOutBtn.hidden   = true;   // hide the header sign-out button
  resultsEl.hidden    = true;
  downloadBtn.hidden  = true;
  _tickets            = [];
  tableBody.innerHTML = '';
  setStatus('');
}

// Main scan pipeline, runs when the user clicks "Scan my ticket emails".
async function runScan() {
  scanBtn.disabled   = true;
  downloadBtn.hidden = true;
  resultsEl.hidden   = true;
  tableBody.innerHTML = '';

  try {
    const token = getAccessToken();
    const query = buildGmailQuery(); // built from the active parser list in parsers/index.js

    setStatus('Searching Gmail for ticket emails...');
    const emails = await fetchEmailsByQuery(token, query, (done, total) => {
      // Progress callback: called after each email is fetched
      setStatus(`Fetching emails… ${done} / ${total}`);
    });

    setStatus(`Fetched ${emails.length} email(s). Parsing tickets...`);

    _tickets = [];
    const seenKeys = new Set(); // used to skip duplicate tickets

    for (const email of emails) {
      const parser = findParser(email.sender, email.subject);
      if (!parser) continue; // no parser matched this email

      let ticket;
      try {
        ticket = parser.parse(email.sender, email.subject, email.body, email.emailDate);
      } catch (err) {
        console.warn(`Parse error for "${email.subject}":`, err);
        continue;
      }

      if (!ticket) continue; // parser returned null (e.g. marketing email, not a confirmation)

      // Deduplicate by event + venue + date (same logic as the Python version)
      const key = `${ticket.event}|${ticket.venue}|${ticket.date}`.toLowerCase();
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      _tickets.push(ticket);
    }

    // Sort newest-first using the same robust parser used for display
    _tickets.sort((a, b) => {
      const da = _parseDate(a.date);
      const db = _parseDate(b.date);
      if (isNaN(da)) return 1;
      if (isNaN(db)) return -1;
      return db - da;
    });

    _renderTable(_tickets);

    const count    = _tickets.length;
    const skipped  = emails.length - count;
    // List every active platform by name so the message stays accurate as parsers are added
    const platforms = PARSERS.map(p => p.name).join(', ');

    const skippedNote = skipped > 0
      ? ` — ${skipped} skipped (marketing emails, newsletters, or unrecognized formats)`
      : '';

    setStatus(
      `Scanned ${emails.length} email${emails.length !== 1 ? 's' : ''} from ${platforms}. ` +
      `Found ${count} ticket confirmation${count !== 1 ? 's' : ''}${skippedNote}.`
    );

    if (count > 0) downloadBtn.hidden = false;

  } catch (err) {
    setStatus(`Error: ${err.message}`);
    console.error(err);
  }

  scanBtn.disabled = false;
}

// Populate the results table with the parsed ticket list.
function _renderTable(tickets) {
  tableBody.innerHTML = '';

  for (const t of tickets) {
    const row = document.createElement('tr');
    // Use _esc() on every value to prevent XSS; ticket data comes from email content
    row.innerHTML = `
      <td>${_esc(_formatDate(t.date))}</td>
      <td>${_esc(t.platform)}</td>
      <td>${_esc(t.event)}</td>
      <td>${_esc(t.venue)}</td>
      <td>${_esc(t.city)}</td>
      <td>${_esc(t.quantity)}</td>
      <td>${_esc(t.cost)}</td>
    `;
    tableBody.appendChild(row);
  }

  if (countEl) countEl.textContent = tickets.length;
  resultsEl.hidden = tickets.length === 0;
}

// Parse a raw date string from any parser into a Date object.
// Shared by _formatDate (display) and the sort comparator so both behave identically.
function _parseDate(dateStr) {
  if (!dateStr) return new Date(NaN);

  // Normalize platform-specific separators (·, •, @) to spaces, then collapse whitespace
  let cleaned = dateStr.replace(/[·•@]/g, ' ').replace(/\s+/g, ' ').trim();

  // Normalize "7:00pm" to "7:00 PM" (missing space before am/pm causes new Date() to fail)
  cleaned = cleaned.replace(/(\d)(am|pm)\b/gi, (_, n, p) => `${n} ${p.toUpperCase()}`);

  let d = new Date(cleaned);

  // Drop leading day-of-week and retry, e.g. "Sat 16 November 2024 7:00 PM"
  if (isNaN(d)) {
    cleaned = cleaned.replace(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*,?\s*/i, '');
    d = new Date(cleaned);
  }

  // AU format puts day before month: "16 November 2024 7:00 PM"
  // Reorder to "November 16, 2024 7:00 PM" which new Date() can parse
  if (isNaN(d)) {
    cleaned = cleaned.replace(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/, '$2 $1, $3');
    d = new Date(cleaned);
  }

  return d;
}

// Format a raw date string for display: "06/16/2023 (Sat) · 7:00 PM"
// The raw date is kept unchanged in the ticket object so the CSV export is unaffected.
function _formatDate(dateStr) {
  const d = _parseDate(dateStr);
  if (isNaN(d)) return dateStr; // show original if we still can't parse it

  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  const day  = d.toLocaleDateString('en-US', { weekday: 'short' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${mm}/${dd}/${yyyy} (${day}) · ${time}`;
}

// Escape special HTML characters to prevent XSS when inserting untrusted
// ticket data (from email content) into the page via innerHTML.
function _esc(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setStatus(msg) {
  statusEl.textContent = msg;
}
