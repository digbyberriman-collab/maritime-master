// Zero-dependency DOCX (Open XML) reader for edge functions.
// A .docx is a ZIP archive; we walk the central directory, inflate
// word/document.xml with the native DecompressionStream and turn the
// XML into plain text and simple HTML (tables preserved). Replaces
// mammoth, whose npm package cannot be resolved in this runtime.

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

/** Concatenated text of every <w:t> run in a fragment; tabs become spaces. */
function runText(fragment: string): string {
  let out = '';
  for (const m of fragment.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)) out += m[1];
  for (const m of fragment.matchAll(/<w:tab(?:\s[^>]*)?\/>/g)) out += ' ';
  return decodeEntities(out).replace(/\s+/g, ' ').trim();
}

/** Plain-text view: paragraphs on their own line, tables rendered as pipe rows. */
export function xmlToText(xml: string): string {
  let s = xml.replace(/<w:sectPr[\s\S]*?<\/w:sectPr>/g, '');
  s = s.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (tbl) => {
    const lines: string[] = ['[TABLE]'];
    for (const row of tbl.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) {
      const cells: string[] = [];
      for (const cell of row[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)) cells.push(runText(cell[0]));
      lines.push('| ' + cells.join(' | ') + ' |');
    }
    lines.push('[/TABLE]');
    return '\n' + lines.join('\n') + '\n';
  });
  s = s
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(s).replace(/\n{3,}/g, '\n\n').trim();
}

/** Simple HTML: <p> for paragraphs, <table>/<tr>/<td> for tables. */
export function xmlToHtml(xml: string): string {
  const tables: string[] = [];
  let s = xml.replace(/<w:sectPr[\s\S]*?<\/w:sectPr>/g, '');
  s = s.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (tbl) => {
    const rows: string[] = [];
    for (const row of tbl.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) {
      const cells: string[] = [];
      for (const cell of row[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)) {
        cells.push(`<td>${runText(cell[0])}</td>`);
      }
      rows.push(`<tr>${cells.join('')}</tr>`);
    }
    tables.push(`<table>${rows.join('')}</table>`);
    return `\u0000T${tables.length - 1}\u0000`;
  });

  const parts: string[] = [];
  let last = 0;
  for (const m of s.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
    parts.push(s.slice(last, m.index ?? last).replace(/<[^>]+>/g, ''));
    parts.push(`<p>${runText(m[0])}</p>`);
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(s.slice(last).replace(/<[^>]+>/g, ''));
  return parts.join('').replace(/\u0000T(\d+)\u0000/g, (_, i: string) => tables[Number(i)]);
}

/** Extract { text, html } from a .docx file. */
export async function extractDocx(buffer: ArrayBuffer): Promise<{ text: string; html: string }> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();

  // Locate the End of Central Directory record (scan back, allowing a comment).
  let eocd = -1;
  const minPos = Math.max(0, bytes.length - 22 - 65536);
  for (let i = bytes.length - 22; i >= minPos; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid DOCX (ZIP) file.');

  const entryCount = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);

  for (let n = 0; n < entryCount; n++) {
    if (ptr + 46 > bytes.length || view.getUint32(ptr, true) !== 0x02014b50) break;
    const method = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extraLen + commentLen;
    if (name !== 'word/document.xml') continue;

    const lhNameLen = view.getUint16(localOffset + 26, true);
    const lhExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
    const raw = bytes.subarray(dataStart, dataStart + compSize);
    const docXml = decoder.decode(method === 0 ? raw : await inflateRaw(raw));
    return { text: xmlToText(docXml), html: xmlToHtml(docXml) };
  }
  throw new Error('word/document.xml not found in DOCX.');
}
