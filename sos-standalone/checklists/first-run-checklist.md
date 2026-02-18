# SOS First-Run Checklist

## Environment
- [ ] API/worker env files populated with real values
- [ ] `GOOGLE_SERVICE_ACCOUNT_JSON` parses as valid JSON
- [ ] `SOS_FAX_PROVIDER` set to `srfax`

## Deploy + Data
- [ ] API and worker deployed in dedicated SOS project
- [ ] Prisma migrations applied successfully
- [ ] SOS tables present (`sos_cases`, `sos_artifacts`, `sos_case_payloads`)

## Functional Gates
- [ ] `npm run sos:preflight` passes
- [ ] `bash scripts/sos/stripe-smoke.sh` passes and returns case id
- [ ] `npm run sos:smoke:phase6-7` passes with real `CASE_ID`

## Monitoring
- [ ] `bash scripts/sos/monitor-check.sh` returns OK
- [ ] alert webhook tested and receiving failures

## Go-Live
- [ ] Daily sweep enabled (`SOS_FOLLOWUP_SWEEP_DISABLED=0`)
- [ ] Leah can complete one end-to-end case flow from intake to follow-up/fax
