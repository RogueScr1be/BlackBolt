type SosFaxPacketData = {
  caseId: string;
  generatedAt: string;
  consultType: string;
  providerFaxNumber: string;
  parentName: string | null;
  parentEmail: string | null;
  parentPhone: string | null;
  parentAddress: string | null;
  babyName: string | null;
  babyDob: string | null;
  soap: {
    subjective: string | null;
    objective: string | null;
    assessment: string | null;
    plan: string | null;
  };
};

function normalize(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : 'n/a';
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapLine(value: string, maxWidth = 88): string[] {
  if (value.length <= maxWidth) {
    return [value];
  }

  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxWidth) {
      lines.push(current || word.slice(0, maxWidth));
      current = current ? word : word.slice(maxWidth);
      continue;
    }
    current = next;
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [value];
}

export function renderSosFaxPacketPdf(input: SosFaxPacketData): Buffer {
  const lines: string[] = [
    'SOS Lactation Provider Fax Packet',
    `Case ID: ${input.caseId}`,
    `Generated At (UTC): ${input.generatedAt}`,
    `Consult Type: ${normalize(input.consultType)}`,
    `Destination Fax: ${normalize(input.providerFaxNumber)}`,
    '',
    `Parent Name: ${normalize(input.parentName)}`,
    `Parent Email: ${normalize(input.parentEmail)}`,
    `Parent Phone: ${normalize(input.parentPhone)}`,
    `Parent Address: ${normalize(input.parentAddress)}`,
    `Baby Name: ${normalize(input.babyName)}`,
    `Baby DOB: ${normalize(input.babyDob)}`,
    '',
    'SOAP - Subjective:',
    normalize(input.soap.subjective),
    '',
    'SOAP - Objective:',
    normalize(input.soap.objective),
    '',
    'SOAP - Assessment:',
    normalize(input.soap.assessment),
    '',
    'SOAP - Plan:',
    normalize(input.soap.plan)
  ];

  const wrappedLines = lines.flatMap((line) => wrapLine(line));
  const escapedLines = wrappedLines.map((line) => escapePdfText(line));
  const streamLines = escapedLines.map((line, index) => `${index === 0 ? '' : 'T*\n'}(${line}) Tj`).join('\n');
  const stream = `BT\n/F1 10 Tf\n36 756 Td\n12 TL\n${streamLines}\nET`;

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${Buffer.byteLength(stream, 'utf8')} >> stream\n${stream}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj'
  ];

  let body = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body, 'utf8'));
    body += `${object}\n`;
  }

  const xrefStart = Buffer.byteLength(body, 'utf8');
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (let index = 1; index <= objects.length; index += 1) {
    body += `${offsets[index].toString().padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(body, 'utf8');
}
