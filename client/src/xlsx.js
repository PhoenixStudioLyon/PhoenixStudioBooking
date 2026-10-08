// Minimal .xlsx reader (no library): an .xlsx is a zip of XML files. Reads the first sheet as rows of strings.
// Uses the browser's built-in DecompressionStream for the zip's deflate data.

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Returns { name: Uint8Array } for the wanted entries of a zip
async function unzip(buf, wanted) {
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This file is not a valid .xlsx');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = {};
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    if (wanted(name)) {
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const data = new Uint8Array(buf, start, size);
      out[name] = method === 0 ? data : await inflate(data);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const colIndex = (ref) => [...ref.match(/^[A-Z]+/)[0]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

export async function readXlsx(file) {
  const files = await unzip(await file.arrayBuffer(), (n) => n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const sheetName = Object.keys(files).filter((n) => n.includes('worksheets')).sort()[0];
  if (!sheetName) throw new Error('No sheet found in this .xlsx');
  const dec = new TextDecoder();
  const parse = (bytes) => new DOMParser().parseFromString(dec.decode(bytes), 'application/xml');
  const shared = files['xl/sharedStrings.xml']
    ? [...parse(files['xl/sharedStrings.xml']).getElementsByTagName('si')].map((si) => [...si.getElementsByTagName('t')].map((t) => t.textContent).join(''))
    : [];
  const rows = [];
  for (const r of parse(files[sheetName]).getElementsByTagName('row')) {
    const row = [];
    for (const c of r.getElementsByTagName('c')) {
      const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0];
      let val = '';
      if (t === 's' && v) val = shared[Number(v.textContent)] ?? '';
      else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map((x) => x.textContent).join('');
      else if (v) val = v.textContent;
      row[colIndex(c.getAttribute('r'))] = val;
    }
    if (row.length) rows.push(Array.from(row, (x) => x ?? ''));
  }
  return rows;
}
