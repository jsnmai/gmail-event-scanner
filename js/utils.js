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
      const chunk = node.textContent.replace(/[ \t\r\n]+/g, ' ');
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

  return out
    .replace(/[ \t]+/g, ' ')
    .replace(/\n /g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
