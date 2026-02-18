#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const registryPath = path.join(ROOT, 'docs/soslactation/templates/registry.json');

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(registryPath)) {
  fail(`Missing registry: ${registryPath}`);
}

const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
if (!registry || !Array.isArray(registry.templates)) {
  fail('registry.json must contain templates[]');
}

const requiredKeys = [
  'templateId',
  'sourceFile',
  'docType',
  'version',
  'consultType',
  'fieldsFile',
  'mappingFile',
  'status'
];
const allowedDocTypes = new Set(['pdf', 'docx', 'email']);
const allowedStatus = new Set(['active', 'deprecated']);
const ids = new Set();

for (const template of registry.templates) {
  for (const key of requiredKeys) {
    if (!(key in template)) {
      fail(`Template ${template.templateId ?? '(unknown)'} missing key: ${key}`);
    }
  }

  if (ids.has(template.templateId)) {
    fail(`Duplicate templateId: ${template.templateId}`);
  }
  ids.add(template.templateId);

  if (!allowedDocTypes.has(template.docType)) {
    fail(`Invalid docType for ${template.templateId}: ${template.docType}`);
  }

  if (!allowedStatus.has(template.status)) {
    fail(`Invalid status for ${template.templateId}: ${template.status}`);
  }

  if (!Number.isInteger(template.version) || template.version <= 0) {
    fail(`Invalid version for ${template.templateId}: ${template.version}`);
  }

  const fieldsPath = path.join(ROOT, template.fieldsFile);
  const mappingPath = path.join(ROOT, template.mappingFile);
  if (!fs.existsSync(fieldsPath)) {
    fail(`Missing fieldsFile for ${template.templateId}: ${template.fieldsFile}`);
  }
  if (!fs.existsSync(mappingPath)) {
    fail(`Missing mappingFile for ${template.templateId}: ${template.mappingFile}`);
  }

  JSON.parse(fs.readFileSync(fieldsPath, 'utf8'));
  JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
}

console.log(`Registry check passed (${registry.templates.length} templates).`);
