# SOS Template Extraction

## Field Extraction Script
- Script: `/Users/thewhitley/Documents/New project/scripts/soslactation/extract-pdf-fields.mjs`
- Purpose: detect PDF field names (`/T`) from PDF body and inflated Flate streams.

## Usage
```bash
node scripts/soslactation/extract-pdf-fields.mjs \
  "/absolute/path/to/template.pdf" \
  --out docs/soslactation/templates/<template-id>/fields.json
```

Batch extraction and sanity check:
```bash
npm run sos:extract-fields
```

## Source Files Used
- `/Users/thewhitley/SOS form automation forms/In Home consultation form.pdf`
- `/Users/thewhitley/SOS form automation forms/In Office Consultation – SOS Lactation.pdf`
- `/Users/thewhitley/SOS form automation forms/Insurance Consultation – SOS Lactation.pdf`
- `/Users/thewhitley/SOS form automation forms/Phone Consultation – SOS Lactation.pdf`
- `/Users/thewhitley/SOS form automation forms/Remote Video Consultation – SOS Lactation.pdf`
- `/Users/thewhitley/SOS form automation forms/SOS Lactation pedi_intake form fillable.pdf`

## Current Findings
- `pedi-intake` contains AcroForm fields and was extracted successfully.
- The five consult PDFs currently expose no machine-readable AcroForm/XFA fields (`/AcroForm` and `/XFA` not present).
- Consult-template mappings are therefore modeled as `virtual` intake mappings until fillable template versions are provided.

## Versioning Protocol
1. Replace source template file.
2. Re-run extraction script.
3. Commit updated `fields.json`.
4. Increment template `version` in `registry.json`.
5. Update `mapping.json` and annotate any new `unmapped` fields.

## Change Safety
- Do not remove existing canonical paths to accommodate a template change.
- If a template changes semantics, add canonical extension fields and document rationale.
