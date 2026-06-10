// Convert a rendered GitHub comment body (.markdown-body) to lightweight
// markdown. Handles paragraphs, inline code, code blocks, links, bold/italic,
// lists, blockquotes, headings and <br>; anything else degrades to its text.
// Uses numeric nodeType constants so it runs in both the browser and jsdom.
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

export function htmlToMarkdown(root) {
  if (!root) return '';
  return blocks(root).join('\n\n').trim();
}

function blocks(el) {
  const out = [];
  for (const child of el.childNodes) {
    if (child.nodeType === TEXT_NODE) {
      const t = child.textContent.trim();
      if (t) out.push(t);
      continue;
    }
    if (child.nodeType !== ELEMENT_NODE) continue;
    const tag = child.tagName;
    if (tag === 'P') out.push(inline(child).trim());
    else if (tag === 'PRE') out.push('```\n' + child.textContent.replace(/\n$/, '') + '\n```');
    else if (tag === 'UL' || tag === 'OL') out.push(list(child, tag === 'OL'));
    else if (tag === 'BLOCKQUOTE') out.push(quote(child));
    else if (/^H[1-6]$/.test(tag)) out.push('#'.repeat(Number(tag[1])) + ' ' + inline(child).trim());
    else if (tag === 'DIV') out.push(...blocks(child));
    else out.push(inline(child).trim());
  }
  return out.filter(Boolean);
}

function list(el, ordered) {
  return Array.from(el.children)
    .filter((li) => li.tagName === 'LI')
    .map((li, i) => (ordered ? `${i + 1}. ` : '- ') + inline(li).trim())
    .join('\n');
}

function quote(el) {
  return blocks(el).join('\n\n').split('\n').map((l) => '> ' + l).join('\n');
}

function inline(el) {
  let out = '';
  for (const child of el.childNodes) {
    if (child.nodeType === TEXT_NODE) {
      out += child.textContent.replace(/\s+/g, ' ');
      continue;
    }
    if (child.nodeType !== ELEMENT_NODE) continue;
    const tag = child.tagName;
    if (tag === 'CODE') out += '`' + child.textContent + '`';
    else if (tag === 'A') out += link(child);
    else if (tag === 'STRONG' || tag === 'B') out += '**' + inline(child) + '**';
    else if (tag === 'EM' || tag === 'I') out += '*' + inline(child) + '*';
    else if (tag === 'BR') out += '\n';
    else if (tag === 'IMG') out += child.getAttribute('alt') || '';
    else out += inline(child);
  }
  return out;
}

function link(a) {
  const text = inline(a).trim();
  const href = a.getAttribute('href') || '';
  // @mentions and bare-URL links read better as plain text in a prompt
  if (!href || text.startsWith('@') || text === href) return text;
  return `[${text}](${href})`;
}
