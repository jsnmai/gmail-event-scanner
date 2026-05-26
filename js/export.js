// export.js: Generates a CSV file and triggers a browser download.
//
// Nothing is uploaded anywhere. The file is created entirely in the browser
// using the Blob API, and the download is triggered via a temporary anchor link.

// Column order matches the web table: Date first, emailSubject last as a reference column
const CSV_COLUMNS = [
  { header: 'Date',      value: t => _formatDate(t.date) },
  { header: 'Platform',  value: t => t.platform },
  { header: 'Event',     value: t => t.event },
  { header: 'Venue',     value: t => t.venue },
  { header: 'City',      value: t => t.city },
  { header: 'Qty',       value: t => t.quantity },
  { header: 'Cost',      value: t => t.cost },
  { header: 'Subject',   value: t => t.emailSubject },
];

// Build a CSV string from the tickets array and prompt the browser to save it.
function downloadCSV(tickets) {
  const header = CSV_COLUMNS.map(c => _escapeCell(c.header)).join(',');
  const rows   = tickets.map(t =>
    CSV_COLUMNS.map(c => _escapeCell(c.value(t) ?? '')).join(',')
  );

  const csv  = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);

  // Create a hidden link, click it to trigger the download, then clean up
  const link      = document.createElement('a');
  link.href       = url;
  link.download   = 'tickets.csv';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Wrap a cell value in quotes and escape any internal double-quotes (CSV spec).
function _escapeCell(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}
