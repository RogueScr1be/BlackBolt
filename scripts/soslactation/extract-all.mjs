#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const extractScript = path.join(ROOT, 'scripts/soslactation/extract-pdf-fields.mjs');

const templates = [
  {
    id: 'consult-in-home',
    source: '/Users/thewhitley/SOS form automation forms/In Home consultation form.pdf',
    out: 'docs/soslactation/templates/consult-in-home/fields.json',
    expectFillable: false
  },
  {
    id: 'consult-in-office',
    source: '/Users/thewhitley/SOS form automation forms/In Office Consultation – SOS Lactation.pdf',
    out: 'docs/soslactation/templates/consult-in-office/fields.json',
    expectFillable: false
  },
  {
    id: 'consult-insurance',
    source: '/Users/thewhitley/SOS form automation forms/Insurance Consultation – SOS Lactation.pdf',
    out: 'docs/soslactation/templates/consult-insurance/fields.json',
    expectFillable: false
  },
  {
    id: 'consult-phone',
    source: '/Users/thewhitley/SOS form automation forms/Phone Consultation – SOS Lactation.pdf',
    out: 'docs/soslactation/templates/consult-phone/fields.json',
    expectFillable: false
  },
  {
    id: 'consult-remote-video',
    source: '/Users/thewhitley/SOS form automation forms/Remote Video Consultation – SOS Lactation.pdf',
    out: 'docs/soslactation/templates/consult-remote-video/fields.json',
    expectFillable: false
  },
  {
    id: 'pedi-intake',
    source: '/Users/thewhitley/SOS form automation forms/SOS Lactation pedi_intake form fillable.pdf',
    out: 'docs/soslactation/templates/pedi-intake/fields.json',
    expectFillable: true
  }
];

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

for (const template of templates) {
  const result = spawnSync(process.execPath, [extractScript, template.source, '--out', template.out], {
    cwd: ROOT,
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr || '');
    process.stdout.write(result.stdout || '');
    fail(`Extraction failed for ${template.id}`);
  }

  process.stderr.write(result.stderr || '');
}

let pediNonEmpty = false;
for (const template of templates) {
  const output = JSON.parse(fs.readFileSync(path.join(ROOT, template.out), 'utf8'));
  const detected = Number(output.uniqueCount ?? 0);

  if (template.expectFillable) {
    if (detected <= 0) {
      fail(`${template.id} expected fillable fields but none were detected`);
    }
    pediNonEmpty = true;
    console.log(`FILLABLE: ${template.id} detected ${detected} fields`);
    continue;
  }

  if (detected === 0) {
    console.log(`STATIC_TEMPLATE: ${template.id} has no machine-readable fields; treat as static render template`);
  } else {
    console.log(`FILLABLE: ${template.id} detected ${detected} fields`);
  }
}

if (!pediNonEmpty) {
  fail('pedi-intake non-empty check did not pass');
}

console.log('Extraction sanity checks passed.');
