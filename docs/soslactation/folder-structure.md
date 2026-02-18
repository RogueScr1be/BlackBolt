# SOS Lactation Folder Structure

## Canonical Root
- `SOS Lactation/Patients/{Last}_{First}_{YYYY-MM-DD}/`

## Standard Subfolders
- `01-intake/`
- `02-consult/`
- `03-post-consult/`
- `04-follow-up/`
- `99-metadata/`

## Required Artifacts
- `01-intake/intake-{consultType}-v{templateVersion}.pdf`
- `02-consult/soap-note-v{version}.pdf`
- `02-consult/pedi-intake-v{templateVersion}.pdf`
- `03-post-consult/follow-up-letter-v{templateVersion}.pdf`
- `03-post-consult/provider-fax-packet-v{templateVersion}.pdf`
- `99-metadata/case-metadata.json`
- `99-metadata/transmission-log.json`

## Naming Conventions
- Consult types: `remote_video`, `in_home`, `insurance`, `in_office`, `phone`
- Date format in file names: `YYYY-MM-DD`
- Version format: integer (`v1`, `v2`)

## Metadata Rules
- Never store PHI in file names.
- Persist exact sent artifact copies (email/fax) and transmission timestamps.
- Record source template version for every generated artifact.
