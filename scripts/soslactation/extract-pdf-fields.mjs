#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function usage() {
  console.error('Usage: node scripts/soslactation/extract-pdf-fields.mjs <input.pdf> [--out <output.json>]');
  process.exit(1);
}

function isWhitespaceByte(byte) {
  return byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d || byte === 0x0c || byte === 0x00;
}

function decodePdfLiteral(bytes, startIndex) {
  let i = startIndex;
  let depth = 1;
  const out = [];

  while (i < bytes.length) {
    const b = bytes[i];

    if (b === 0x5c) {
      const next = bytes[i + 1];
      if (next === undefined) {
        i += 1;
        continue;
      }

      if (next >= 0x30 && next <= 0x37) {
        const oct = [];
        let j = i + 1;
        while (j < bytes.length && oct.length < 3 && bytes[j] >= 0x30 && bytes[j] <= 0x37) {
          oct.push(String.fromCharCode(bytes[j]));
          j += 1;
        }
        out.push(parseInt(oct.join(''), 8));
        i = j;
        continue;
      }

      const escapedMap = new Map([
        [0x6e, 0x0a],
        [0x72, 0x0d],
        [0x74, 0x09],
        [0x62, 0x08],
        [0x66, 0x0c],
        [0x28, 0x28],
        [0x29, 0x29],
        [0x5c, 0x5c]
      ]);

      out.push(escapedMap.get(next) ?? next);
      i += 2;
      continue;
    }

    if (b === 0x28) {
      depth += 1;
      out.push(b);
      i += 1;
      continue;
    }

    if (b === 0x29) {
      depth -= 1;
      if (depth === 0) {
        return {
          value: Buffer.from(out).toString('utf8'),
          end: i + 1
        };
      }
      out.push(b);
      i += 1;
      continue;
    }

    out.push(b);
    i += 1;
  }

  return { value: Buffer.from(out).toString('utf8'), end: i };
}

function decodePdfHex(bytes, startIndex) {
  let i = startIndex;
  const hexChars = [];

  while (i < bytes.length && bytes[i] !== 0x3e) {
    const b = bytes[i];
    const ch = String.fromCharCode(b);
    if (/[0-9A-Fa-f]/.test(ch)) {
      hexChars.push(ch);
    }
    i += 1;
  }

  if (hexChars.length % 2 !== 0) {
    hexChars.push('0');
  }

  const buf = Buffer.from(hexChars.join(''), 'hex');
  const utf8 = buf.toString('utf8').replace(/\u0000/g, '');
  const latin1 = buf.toString('latin1').replace(/\u0000/g, '');
  return {
    value: utf8.trim().length > 0 ? utf8 : latin1,
    end: i + 1
  };
}

function extractFieldNamesFromBytes(bytes, sourceTag) {
  const token = Buffer.from('/T');
  const rawNames = [];
  let fromIndex = 0;

  while (fromIndex < bytes.length) {
    const idx = bytes.indexOf(token, fromIndex);
    if (idx === -1) {
      break;
    }

    const prev = idx > 0 ? bytes[idx - 1] : 0x20;
    if (/[A-Za-z0-9]/.test(String.fromCharCode(prev))) {
      fromIndex = idx + token.length;
      continue;
    }

    let i = idx + token.length;
    while (i < bytes.length && isWhitespaceByte(bytes[i])) {
      i += 1;
    }

    if (i >= bytes.length) {
      break;
    }

    let decoded = null;

    if (bytes[i] === 0x28) {
      decoded = decodePdfLiteral(bytes, i + 1);
    } else if (bytes[i] === 0x3c) {
      decoded = decodePdfHex(bytes, i + 1);
    }

    if (decoded) {
      const cleaned = decoded.value.replace(/\s+/g, ' ').trim();
      if (cleaned.length > 0) {
        rawNames.push({
          name: cleaned,
          byteOffset: idx,
          source: sourceTag
        });
      }
    }

    fromIndex = idx + token.length;
  }

  return rawNames;
}

function collectFlateStreams(pdfBytes) {
  const streamToken = Buffer.from('stream');
  const endStreamToken = Buffer.from('endstream');
  const streams = [];
  let from = 0;

  while (from < pdfBytes.length) {
    const streamIdx = pdfBytes.indexOf(streamToken, from);
    if (streamIdx === -1) {
      break;
    }

    const endIdx = pdfBytes.indexOf(endStreamToken, streamIdx + streamToken.length);
    if (endIdx === -1) {
      break;
    }

    let dataStart = streamIdx + streamToken.length;
    if (pdfBytes[dataStart] === 0x0d && pdfBytes[dataStart + 1] === 0x0a) {
      dataStart += 2;
    } else if (pdfBytes[dataStart] === 0x0a || pdfBytes[dataStart] === 0x0d) {
      dataStart += 1;
    }

    const chunk = pdfBytes.slice(dataStart, endIdx);
    let inflated = null;

    try {
      inflated = zlib.inflateSync(chunk);
    } catch {
      try {
        inflated = zlib.inflateRawSync(chunk);
      } catch {
        inflated = null;
      }
    }

    if (inflated && inflated.length > 0) {
      streams.push(inflated);
    }

    from = endIdx + endStreamToken.length;
  }

  return streams;
}

function normalizeDuplicates(rawNames) {
  const counts = new Map();
  const normalized = [];

  for (const item of rawNames) {
    const seen = (counts.get(item.name) ?? 0) + 1;
    counts.set(item.name, seen);
    const normalizedName = seen === 1 ? item.name : `${item.name}__dup${seen}`;
    normalized.push({ ...item, normalizedName, occurrence: seen });
  }

  const unique = [];
  const seenUnique = new Set();
  for (const item of normalized) {
    if (!seenUnique.has(item.name)) {
      unique.push(item.name);
      seenUnique.add(item.name);
    }
  }

  const duplicateFields = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name, count]) => ({ name, count }));

  return {
    normalized,
    unique,
    duplicateFields
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    usage();
  }

  const input = args[0];
  let outPath = null;

  for (let i = 1; i < args.length; i += 1) {
    if (args[i] === '--out') {
      outPath = args[i + 1];
      i += 1;
    }
  }

  const inputAbs = path.resolve(input);
  if (!fs.existsSync(inputAbs)) {
    console.error(`Input file not found: ${inputAbs}`);
    process.exit(1);
  }

  const pdfBytes = fs.readFileSync(inputAbs);
  const rawNames = [];

  rawNames.push(...extractFieldNamesFromBytes(pdfBytes, 'pdf-body'));

  const flateStreams = collectFlateStreams(pdfBytes);
  for (let i = 0; i < flateStreams.length; i += 1) {
    rawNames.push(...extractFieldNamesFromBytes(flateStreams[i], `flate-stream-${i + 1}`));
  }

  const { normalized, unique, duplicateFields } = normalizeDuplicates(rawNames);

  const result = {
    sourceFile: inputAbs,
    extractedAt: new Date().toISOString(),
    extractionMethod: 'token-scan:/T over body + inflated streams',
    streamScan: {
      totalFlateStreamsInflated: flateStreams.length
    },
    totalDetected: rawNames.length,
    uniqueCount: unique.length,
    duplicateHandling: 'suffix duplicates with __dupN in normalizedFields',
    duplicateFields,
    fields: unique,
    normalizedFields: normalized.map((x) => ({
      name: x.name,
      normalizedName: x.normalizedName,
      occurrence: x.occurrence,
      source: x.source,
      byteOffset: x.byteOffset
    }))
  };

  const json = `${JSON.stringify(result, null, 2)}\n`;

  if (outPath) {
    const outAbs = path.resolve(outPath);
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
    fs.writeFileSync(outAbs, json, 'utf8');
    console.error(`Wrote ${outAbs}`);
  } else {
    process.stdout.write(json);
  }
}

main();
