#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const registryPath = path.join(ROOT, 'docs/soslactation/templates/registry.json');

const REQUIRED_SHARED_PATHS = [
  'patient.parentName',
  'patient.email',
  'patient.phone',
  'patient.address',
  'baby.name',
  'baby.dob'
];

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function mappingPaths(mappingJson) {
  if (!mappingJson || typeof mappingJson !== 'object' || typeof mappingJson.mappings !== 'object') {
    return null;
  }

  const paths = new Set();
  for (const value of Object.values(mappingJson.mappings)) {
    if (value && typeof value === 'object' && typeof value.path === 'string') {
      paths.add(value.path);
    }
  }
  return paths;
}

if (!fs.existsSync(registryPath)) {
  fail(`Missing registry: ${registryPath}`);
}

const registry = readJson(registryPath);
if (!Array.isArray(registry.templates)) {
  fail('registry.json must contain templates[]');
}

const consultTemplates = [];
for (const template of registry.templates) {
  const mappingPath = path.join(ROOT, template.mappingFile);
  if (!fs.existsSync(mappingPath)) {
    fail(`Missing mapping file for ${template.templateId}`);
  }

  const mappingJson = readJson(mappingPath);
  if (!mappingJson.templateId || !mappingJson.mappings || typeof mappingJson.mappings !== 'object') {
    fail(`Invalid mapping structure: ${template.mappingFile}`);
  }

  if (!Array.isArray(mappingJson.unmappedTemplateFields)) {
    fail(`mapping.json must include unmappedTemplateFields[]: ${template.mappingFile}`);
  }

  if (template.templateId.startsWith('consult-')) {
    consultTemplates.push({
      templateId: template.templateId,
      mappingMode: mappingJson.mappingMode,
      notes: mappingJson.notes ?? '',
      paths: mappingPaths(mappingJson)
    });
  }
}

if (consultTemplates.length === 0) {
  fail('No consult templates found in registry');
}

for (const template of consultTemplates) {
  if (!template.paths) {
    fail(`Consult mapping invalid: ${template.templateId}`);
  }

  for (const requiredPath of REQUIRED_SHARED_PATHS) {
    if (!template.paths.has(requiredPath)) {
      fail(`Shared identity path missing in ${template.templateId}: ${requiredPath}`);
    }
  }

  if (template.paths.size === 0) {
    fail(`Consult mapping has zero mapped paths: ${template.templateId}`);
  }
}

for (const template of consultTemplates) {
  const isStatic = template.mappingMode === 'virtual-intake-render';
  if (isStatic && !String(template.notes).toLowerCase().includes('no machine-readable')) {
    fail(`Static consult template must document non-fillable reality in notes: ${template.templateId}`);
  }
}

console.log(`Mapping check passed (${consultTemplates.length} consult mappings, shared identity parity enforced).`);
