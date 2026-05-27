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
  TicketWebParser,
  DNALoungeParser,
  TixrParser,
  AXSParser,
  FrontGateParser,
  UniverseParser,
  PoshParser,
  EventbriteParser,
  SeeTicketsParser,
  MoshtixParser,
  TixelParser,
  GiveThanksParser,
  MegatixParser,
  TheBigEParser,
  TicketMerchantParser,
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
const totalEl     = document.getElementById('total-spent');
const ticketTable = document.getElementById('ticket-table');
const typeColumnHeader = document.getElementById('type-column-header');
const addOnToggleBtn = document.getElementById('toggle-addons-btn');

let _tickets = []; // holds parsed tickets so the download button can use them later
let _showAddOns = false; // add-ons stay exportable, but primary results start clean

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
  addOnToggleBtn.addEventListener('click', _toggleAddOns);
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
  _showAddOns         = false;
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
  _showAddOns        = false;

  try {
    const token = getAccessToken();
    const query = buildGmailQuery(); // built from the active parser registry above

    setStatus('Searching Gmail for ticket emails...');
    const emails = await fetchEmailsByQuery(token, query, (done, total) => {
      // Progress callback: called after each email is fetched
      setStatus(`Fetching emails… ${done} / ${total}`);
    });

    setStatus(`Fetched ${emails.length} email(s). Parsing tickets...`);

    _tickets = [];

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

      _tickets.push({
        ...ticket,
        emailDate: email.emailDate,
        sourceMessageId: email.sourceMessageId,
        sourceMessageIds: email.sourceMessageId ? [email.sourceMessageId] : [],
        sourceParser: parser.name,
        sourceParsers: [parser.name],
        rawSubject: email.subject,
        rawSubjects: [email.subject],
        rawFrom: email.sender,
        rawFroms: [email.sender],
        emailDates: email.emailDate ? [email.emailDate] : [],
      });
    }

    _tickets = dedupeTickets(_tickets);
    sortTicketsByEventDate(_tickets);

    _renderTable(_tickets);

    const eventCount = _tickets.filter(t => t.itemType === 'event').length;
    const addOnCount = _tickets.filter(t => t.itemType === 'add-on').length;
    const skipped  = emails.length - _tickets.length;
    // List every active platform by name so the message stays accurate as parsers are added
    const platforms = PARSERS.map(p => p.name).join(', ');

    const skippedNote = skipped > 0
      ? ` - ${skipped} skipped (marketing emails, newsletters, unrecognized formats, or merged duplicates)`
      : '';
    const addOnNote = addOnCount > 0
      ? ` ${addOnCount} add-on${addOnCount !== 1 ? 's' : ''} hidden from primary results but included in CSV.`
      : '';

    setStatus(
      `Scanned ${emails.length} email${emails.length !== 1 ? 's' : ''} from ${platforms}. ` +
      `Found ${eventCount} event${eventCount !== 1 ? 's' : ''}${skippedNote}.${addOnNote}`
    );

    if (_tickets.length > 0) downloadBtn.hidden = false;

  } catch (err) {
    setStatus('Unable to complete the scan. Please try again.');
    console.error(err);
  }

  scanBtn.disabled = false;
}

// Populate the results table with the parsed ticket list.
function _renderTable(tickets) {
  tableBody.innerHTML = '';

  const addOnCount = tickets.filter(t => t.itemType === 'add-on').length;
  if (typeColumnHeader) typeColumnHeader.hidden = !_showAddOns;
  if (ticketTable) ticketTable.classList.toggle('show-types', _showAddOns);

  const visibleTickets = _showAddOns
    ? tickets
    : tickets.filter(t => t.itemType !== 'add-on');

  for (const t of visibleTickets) {
    const row = document.createElement('tr');
    // Use _esc() on every value to prevent XSS; ticket data comes from email content
    row.innerHTML = `
      <td>${_esc(_displayTicketDate(t))}</td>
      ${_showAddOns ? `<td>${_esc(t.itemType)}</td>` : ''}
      <td>${_esc(t.platform)}</td>
      <td>${_esc(t.event)}</td>
      <td>${_esc(t.venue)}</td>
      <td>${_esc(t.city)}</td>
      <td>${_esc(t.quantity)}</td>
      <td>${_esc(t.cost)}</td>
      <td>${_esc(_sourceSubjects(t))}</td>
    `;
    tableBody.appendChild(row);
  }

  const eventTickets = tickets.filter(t => t.itemType === 'event');
  if (countEl) countEl.textContent = eventTickets.length;

  if (totalEl) {
    totalEl.textContent = formatCurrencyTotals(eventTickets);
  }

  if (addOnToggleBtn) {
    const label = `${addOnCount} add-on${addOnCount !== 1 ? 's' : ''}`;
    addOnToggleBtn.hidden = addOnCount === 0;
    addOnToggleBtn.textContent = _showAddOns ? `Hide ${label}` : `Show ${label}`;
  }

  resultsEl.hidden = tickets.length === 0;
}

function _toggleAddOns() {
  _showAddOns = !_showAddOns;
  _renderTable(_tickets);
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
