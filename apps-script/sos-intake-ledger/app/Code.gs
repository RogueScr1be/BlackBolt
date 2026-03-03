/* global GmailApp, LockService, Logger, Session, SpreadsheetApp, Utilities, ScriptApp, PropertiesService, ContentService */

const LEDGER = {
  SCRIPT_PROPERTIES: {
    SPREADSHEET_ID: 'LEDGER_SPREADSHEET_ID',
    DB_SYNC_SHARED_SECRET: 'DB_SYNC_SHARED_SECRET'
  },
  SPREADSHEET_NAME: 'SOS Intake Ledger',
  SHEETS: {
    INTAKE: 'Intake',
    ERRORS: 'Errors',
    CONFIG: 'Config',
    RAW_MIRROR: 'Raw Mirror'
  },
  INTAKE_HEADERS: [
    'ingested_at_utc',
    'gmail_message_id',
    'email_date',
    'form_name',
    'consult_type',
    'mother_name',
    'mother_dob',
    'baby_name',
    'baby_dob',
    'birth_weight',
    'pediatrician_name',
    'address',
    'phone',
    'email',
    'concerns',
    'concern_description',
    'referral_source',
    'amount',
    'payment_method_brand',
    'raw_excerpt',
    'case_key',
    'source_lane',
    'source_id',
    'wpforms_entry_id',
    'wpforms_form_id',
    'wpforms_status'
  ],
  ERROR_HEADERS: ['ingested_at_utc', 'gmail_message_id', 'error_type', 'error_detail', 'raw_body_snippet'],
  RAW_MIRROR_HEADERS: [
    'ingested_at_utc',
    'source_lane',
    'source_id',
    'entry_id',
    'form_id',
    'status',
    'entry_date',
    'date_modified',
    'payload_json',
    'transform_status',
    'transform_error',
    'case_key'
  ],
  CONFIG_HEADERS: ['key', 'value', 'notes'],
  DEFAULTS: {
    processed_label: 'wpforms/processed',
    error_label: 'wpforms/error',
    inbox_label: 'wpforms/inbox',
    gmail_query_base: 'label:wpforms/inbox from:consultations@soslactation.com to:soslactation@gmail.com',
    allowed_from: 'consultations@soslactation.com',
    required_fields: 'mother_name,baby_name,email_or_phone',
    max_messages_per_run: '50',
    raw_excerpt_max_len: '500',
    db_primary_enabled: '1',
    email_fallback_enabled: '1',
    email_fallback_minutes: '15',
    db_status_allowlist: 'completed,publish',
    db_source_name: 'hostgator-wpforms-cron'
  }
};

const DEFAULT_SYNONYMS = {
  form_name: ['form name', 'form', 'wpforms form name'],
  mother_name: ["mother's name", 'mother name', 'name'],
  mother_dob: ["mother's birthday", 'mother birthday', "mother's dob", 'mother dob'],
  baby_name: ["baby's name", 'baby name'],
  baby_dob: ["baby's birthday", 'baby birthday', "baby's dob", 'baby dob'],
  birth_weight: ['birth weight'],
  pediatrician_name: ["pediatrician's name", 'pediatrician name', 'pediatrician'],
  address: ['street address', 'address', 'home address'],
  phone: ['phone', 'phone number'],
  email: ['email', 'e-mail'],
  concerns: ['breastfeeding concerns', 'breastfeeding concern', 'concerns'],
  concern_description: ['brief description', 'description', 'concern description'],
  referral_source: ['referral source', 'how did you hear about us'],
  consult_product_line: [
    'consult product/type line',
    'consult product',
    'consult type',
    'consultation type',
    'service'
  ],
  amount: ['total amount', 'amount', 'total'],
  payment_method_brand: ['payment method brand', 'card brand', 'payment method']
};

const DEFAULT_CONSULT_RULES = {
  insurance: ['insurance'],
  in_home: ['in home', 'in-home'],
  remote_video: ['remote video', 'telehealth', 'virtual', 'zoom'],
  phone: ['phone consultation', 'phone consult', 'phone'],
  in_office: ['in office', 'in-office', 'office consultation']
};

function setupLedger() {
  const ss = getLedgerSpreadsheet_();
  const intake = ensureSheetWithHeaders_(ss, LEDGER.SHEETS.INTAKE, LEDGER.INTAKE_HEADERS);
  const errors = ensureSheetWithHeaders_(ss, LEDGER.SHEETS.ERRORS, LEDGER.ERROR_HEADERS);
  const rawMirror = ensureSheetWithHeaders_(ss, LEDGER.SHEETS.RAW_MIRROR, LEDGER.RAW_MIRROR_HEADERS);
  const configSheet = ensureSheetWithHeaders_(ss, LEDGER.SHEETS.CONFIG, LEDGER.CONFIG_HEADERS);
  ensureDefaultConfigRows_(configSheet);
  return {
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    intakeSheet: intake.getName(),
    errorsSheet: errors.getName(),
    rawMirrorSheet: rawMirror.getName(),
    configSheet: configSheet.getName()
  };
}

function getConfig() {
  setupLedger();
  const config = getConfig_();
  return {
    labels: config.labels,
    allowedFrom: config.allowedFrom,
    requiredFields: config.requiredFields,
    maxMessagesPerRun: config.maxMessagesPerRun,
    rawExcerptMaxLen: config.rawExcerptMaxLen,
    dbPrimaryEnabled: config.dbPrimaryEnabled,
    emailFallbackEnabled: config.emailFallbackEnabled,
    emailFallbackMinutes: config.emailFallbackMinutes,
    dbStatusAllowlist: config.dbStatusAllowlist,
    dbSourceName: config.dbSourceName,
    query: buildGmailQuery(config),
    synonymKeys: Object.keys(config.labelSynonyms),
    consultTypes: config.consultTypeRules.map(function (rule) {
      return rule.consultType;
    })
  };
}

function ingestWpformsEmails() {
  return runIngest_({ dryRun: false });
}

function dryRunIngestWpformsEmails() {
  return runIngest_({ dryRun: true });
}

function doPost(e) {
  try {
    const payload = parseWebAppPayload_(e);
    const summary = runDbSync_(payload, { dryRun: false, requestSource: 'webapp' });
    return jsonResponse_({ ok: true, summary: summary });
  } catch (error) {
    const message = error && error.message ? String(error.message) : 'Unknown DB sync error';
    return jsonResponse_({ ok: false, error: message });
  }
}

function dryRunSyncWpformsDbPayloadJson(payloadJson) {
  const payload = parseJsonObject_(payloadJson || '{}', {});
  return runDbSync_(payload, { dryRun: true, requestSource: 'manual-dry-run' });
}

function syncWpformsDbPayload(payload) {
  return runDbSync_(payload || {}, { dryRun: false, requestSource: 'manual' });
}

function setDbSyncSharedSecret(sharedSecret) {
  const cleanSecret = cleanText_(sharedSecret);
  if (!cleanSecret || cleanSecret.length < 16) {
    throw new Error('DB sync shared secret must be provided and at least 16 characters.');
  }
  PropertiesService.getScriptProperties().setProperty(LEDGER.SCRIPT_PROPERTIES.DB_SYNC_SHARED_SECRET, cleanSecret);
  return {
    stored: true,
    secretLength: cleanSecret.length
  };
}

function clearDbSyncSharedSecret() {
  PropertiesService.getScriptProperties().deleteProperty(LEDGER.SCRIPT_PROPERTIES.DB_SYNC_SHARED_SECRET);
  return {
    cleared: true,
    key: LEDGER.SCRIPT_PROPERTIES.DB_SYNC_SHARED_SECRET
  };
}

function installIngestTriggerEvery5Minutes() {
  deleteIngestTriggers();
  ScriptApp.newTrigger('ingestWpformsEmails').timeBased().everyMinutes(5).create();
}

function deleteIngestTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'ingestWpformsEmails') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function setLedgerSpreadsheetId(spreadsheetId) {
  const rawInput = cleanText_(spreadsheetId || getLedgerSpreadsheetIdProperty_());

  if (!rawInput) {
    throw new Error(getBindingSetHelpMessage_());
  }

  const normalizedId = normalizeSpreadsheetIdInput_(rawInput);
  if (!looksLikeSpreadsheetId_(normalizedId)) {
    throw new Error(
      'Spreadsheet identifier format is invalid. Provide raw sheet ID or full sheet URL containing /d/<ID>/edit.'
    );
  }

  const spreadsheet = openLedgerSpreadsheetById_(normalizedId, 'setLedgerSpreadsheetId');
  PropertiesService.getScriptProperties().setProperty(LEDGER.SCRIPT_PROPERTIES.SPREADSHEET_ID, normalizedId);
  return {
    storedSpreadsheetId: normalizedId,
    spreadsheetName: spreadsheet.getName()
  };
}

function setLedgerSpreadsheetIdInteractive() {
  return setLedgerSpreadsheetId();
}

function clearLedgerSpreadsheetId() {
  PropertiesService.getScriptProperties().deleteProperty(LEDGER.SCRIPT_PROPERTIES.SPREADSHEET_ID);
  return {
    cleared: true,
    key: LEDGER.SCRIPT_PROPERTIES.SPREADSHEET_ID
  };
}

function getLedgerSpreadsheetContext() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    return {
      mode: 'bound',
      spreadsheetId: active.getId(),
      spreadsheetName: active.getName()
    };
  }

  const fromProperty = getLedgerSpreadsheetIdProperty_();
  if (fromProperty) {
    const normalized = normalizeSpreadsheetIdInput_(fromProperty);
    let name = '';
    try {
      name = openLedgerSpreadsheetById_(normalized, 'getLedgerSpreadsheetContext').getName();
    } catch (error) {
      name = '[inaccessible]';
    }
    return {
      mode: 'standalone-script-property',
      spreadsheetId: normalized,
      spreadsheetName: name
    };
  }

  return {
    mode: 'unconfigured',
    spreadsheetId: '',
    spreadsheetName: ''
  };
}

function validateLedgerSpreadsheetBinding() {
  const context = getLedgerSpreadsheetContext();
  const propertyRaw = getLedgerSpreadsheetIdProperty_();
  const propertyNormalized = normalizeSpreadsheetIdInput_(propertyRaw);
  const result = {
    mode: context.mode,
    propertyRaw: propertyRaw || '',
    propertyNormalized: propertyNormalized || '',
    idFormatValid: looksLikeSpreadsheetId_(propertyNormalized),
    openByIdOk: false,
    openByUrlOk: false,
    spreadsheetName: '',
    errorCode: '',
    errorMessage: '',
    recommendedAction: ''
  };

  if (!propertyRaw) {
    result.errorCode = 'MISSING_PROPERTY';
    result.errorMessage = 'LEDGER_SPREADSHEET_ID is not set.';
    result.recommendedAction = getBindingSetHelpMessage_();
    return result;
  }

  if (!result.idFormatValid) {
    result.errorCode = 'INVALID_ID_FORMAT';
    result.errorMessage = 'Spreadsheet ID is malformed.';
    result.recommendedAction =
      'Use raw sheet ID or full URL with /d/<ID>/edit, then run setLedgerSpreadsheetId().';
    return result;
  }

  try {
    const byId = SpreadsheetApp.openById(propertyNormalized);
    result.openByIdOk = true;
    result.spreadsheetName = byId.getName();
  } catch (error) {
    result.errorCode = 'OPEN_BY_ID_FAILED';
    result.errorMessage = error && error.message ? String(error.message) : 'Unknown openById failure';
  }

  try {
    const byUrl = SpreadsheetApp.openByUrl(buildSpreadsheetUrlFromId_(propertyNormalized));
    result.openByUrlOk = true;
    if (!result.spreadsheetName) {
      result.spreadsheetName = byUrl.getName();
    }
  } catch (error) {
    if (!result.errorCode) {
      result.errorCode = 'OPEN_BY_URL_FAILED';
      result.errorMessage = error && error.message ? String(error.message) : 'Unknown openByUrl failure';
    }
  }

  if (result.openByIdOk || result.openByUrlOk) {
    result.recommendedAction = 'Binding is valid. Run setupLedger() next.';
  } else {
    result.recommendedAction =
      'Confirm script account has edit access to the sheet and that Drive/Spreadsheet scopes are authorized.';
  }
  return result;
}

function ensureLabelsExist(config) {
  const processed = getOrCreateUserLabel_(config.labels.processed);
  const error = getOrCreateUserLabel_(config.labels.error);
  const inbox = getOrCreateUserLabel_(config.labels.inbox);
  return {
    processed: processed,
    error: error,
    inbox: inbox
  };
}

function buildGmailQuery(config) {
  let query = (config.gmailQueryBase || '').trim();
  if (!query) {
    query = LEDGER.DEFAULTS.gmail_query_base;
  }
  query = stripThreadStateLabelExclusions_(query, config.labels);
  return query.trim();
}

function parseEmailBody(message, config) {
  const parsed = parseEmailFromRaw_(
    {
      html: message.getBody() || '',
      plain: message.getPlainBody() || '',
      subject: message.getSubject() || '',
      messageId: message.getId()
    },
    config
  );
  return parsed;
}

function normalizeFields(parsed, config) {
  const normalized = {
    form_name: cleanText_(parsed.form_name),
    mother_name: cleanText_(parsed.mother_name),
    mother_dob: normalizeDate_(parsed.mother_dob),
    baby_name: cleanText_(parsed.baby_name),
    baby_dob: normalizeDate_(parsed.baby_dob),
    birth_weight: cleanText_(parsed.birth_weight),
    pediatrician_name: cleanText_(parsed.pediatrician_name),
    address: cleanText_(parsed.address),
    phone: normalizePhone_(parsed.phone),
    email: normalizeEmail_(parsed.email),
    concerns: cleanText_(parsed.concerns),
    concern_description: cleanText_(parsed.concern_description),
    referral_source: cleanText_(parsed.referral_source),
    consult_product_line: cleanText_(parsed.consult_product_line),
    amount: normalizeAmount_(parsed.amount),
    payment_method_brand: cleanText_(parsed.payment_method_brand),
    consult_type: 'unknown'
  };

  normalized.consult_type = deriveConsultType(
    {
      normalized: normalized,
      rawText: parsed.rawText,
      subject: parsed.subject
    },
    config
  );
  return normalized;
}

function deriveConsultType(input, config) {
  const haystack = [
    input.normalized.consult_product_line || '',
    input.normalized.form_name || '',
    input.normalized.concerns || '',
    input.normalized.concern_description || '',
    input.subject || '',
    input.rawText || ''
  ]
    .join(' ')
    .toLowerCase();

  for (let i = 0; i < config.consultTypeRules.length; i += 1) {
    const rule = config.consultTypeRules[i];
    for (let j = 0; j < rule.patterns.length; j += 1) {
      if (haystack.indexOf(rule.patterns[j]) !== -1) {
        return rule.consultType;
      }
    }
  }

  return 'unknown';
}

function computeCaseKey(normalized) {
  const source = [
    normalized.mother_name || '',
    normalized.baby_name || '',
    normalized.baby_dob || '',
    normalized.email || '',
    normalized.phone || '',
    normalized.consult_type || '',
    normalized.amount || ''
  ]
    .join('|')
    .toLowerCase();

  return 'ck_' + sha256Hex_(source);
}

function lookupExistingIndexes_(intakeSheet) {
  const indexes = {
    messageIds: {},
    caseKeys: {},
    sourceIds: {},
    wpformsEntryIds: {}
  };
  const lastRow = intakeSheet.getLastRow();
  if (lastRow < 2) {
    return indexes;
  }

  const values = intakeSheet.getRange(2, 1, lastRow - 1, LEDGER.INTAKE_HEADERS.length).getValues();
  const messageIdIndex = LEDGER.INTAKE_HEADERS.indexOf('gmail_message_id');
  const caseKeyIndex = LEDGER.INTAKE_HEADERS.indexOf('case_key');
  const sourceIdIndex = LEDGER.INTAKE_HEADERS.indexOf('source_id');
  const entryIdIndex = LEDGER.INTAKE_HEADERS.indexOf('wpforms_entry_id');
  values.forEach(function (row) {
    const messageId = String(row[messageIdIndex] || '').trim();
    const caseKey = String(row[caseKeyIndex] || '').trim();
    const sourceId = String(row[sourceIdIndex] || '').trim();
    const entryId = String(row[entryIdIndex] || '').trim();
    if (messageId) {
      indexes.messageIds[messageId] = true;
    }
    if (caseKey) {
      indexes.caseKeys[caseKey] = true;
    }
    if (sourceId) {
      indexes.sourceIds[sourceId] = true;
    }
    if (entryId) {
      indexes.wpformsEntryIds[entryId] = true;
    }
  });
  return indexes;
}

function lookupErrorMessageIds_(errorsSheet) {
  const messageIds = {};
  const lastRow = errorsSheet.getLastRow();
  if (lastRow < 2) {
    return messageIds;
  }

  const values = errorsSheet.getRange(2, 1, lastRow - 1, LEDGER.ERROR_HEADERS.length).getValues();
  const messageIdIndex = LEDGER.ERROR_HEADERS.indexOf('gmail_message_id');
  values.forEach(function (row) {
    const messageId = String(row[messageIdIndex] || '').trim();
    if (messageId) {
      messageIds[messageId] = true;
    }
  });
  return messageIds;
}

function appendIntakeRow_(sheet, rowObject) {
  const row = LEDGER.INTAKE_HEADERS.map(function (header) {
    return rowObject[header] || '';
  });
  const nextRow = sheet.getLastRow() + 1;
  sheet.getRange(nextRow, 1, 1, row.length).setValues([row]);
}

function logErrorRow_(sheet, rowObject) {
  const row = LEDGER.ERROR_HEADERS.map(function (header) {
    return rowObject[header] || '';
  });
  const nextRow = sheet.getLastRow() + 1;
  sheet.getRange(nextRow, 1, 1, row.length).setValues([row]);
}

function appendRawMirrorRow_(sheet, rowObject) {
  const row = LEDGER.RAW_MIRROR_HEADERS.map(function (header) {
    return rowObject[header] || '';
  });
  const nextRow = sheet.getLastRow() + 1;
  sheet.getRange(nextRow, 1, 1, row.length).setValues([row]);
}

function lookupRawMirrorSourceIds_(rawMirrorSheet) {
  const sourceIds = {};
  const lastRow = rawMirrorSheet.getLastRow();
  if (lastRow < 2) {
    return sourceIds;
  }

  const values = rawMirrorSheet.getRange(2, 1, lastRow - 1, LEDGER.RAW_MIRROR_HEADERS.length).getValues();
  const sourceIdIndex = LEDGER.RAW_MIRROR_HEADERS.indexOf('source_id');
  values.forEach(function (row) {
    const sourceId = String(row[sourceIdIndex] || '').trim();
    if (sourceId) {
      sourceIds[sourceId] = true;
    }
  });
  return sourceIds;
}

function testParseSampleEmail() {
  const config = getDefaultConfig_();
  config.labelLookup = buildLabelLookup_(config.labelSynonyms);
  config.consultTypeRules = normalizeConsultRules_(config.consultTypeRules);

  const sampleHtml = [
    '<p><strong>Form Name:</strong> In Home Consultation</p>',
    "<p>Mother's Name: Leah Example</p>",
    "<p>Mother's Birthday: 03/14/1990</p>",
    "<p>Baby's Name: Noah Example</p>",
    "<p>Baby's Birthday: 02/12/2026</p>",
    '<p>Street Address: 123 Main St, Houston, TX 77001</p>',
    '<p>Phone: (832) 452-0815</p>',
    '<p>Email: leah@example.com</p>',
    '<p>Consult product/type line: In Home Consultation</p>',
    '<p>Total amount: $225.00</p>'
  ].join('');

  const sampleText = [
    'Form Name',
    'Remote Video Consultation',
    "Mother's Name",
    'Jamie Parent',
    "Baby's Name",
    'Mia Parent',
    'Phone',
    '8324520815',
    'Email',
    'jamie@example.com',
    'Consult Type',
    'Remote Video',
    'Total amount',
    '175'
  ].join('\n');

  const malformed = 'Hello this message does not include form labels.';

  const parsedHtml = parseEmailFromRaw_({ html: sampleHtml, plain: '', subject: 'New Entry: In Home Consultation' }, config);
  const normalizedHtml = normalizeFields(parsedHtml.fields, config);
  assertEquals_('in_home', normalizedHtml.consult_type, 'Expected in_home consult type from HTML sample');

  const parsedText = parseEmailFromRaw_({ html: '', plain: sampleText, subject: 'New Entry: Remote Video Consultation' }, config);
  const normalizedText = normalizeFields(parsedText.fields, config);
  assertEquals_('remote_video', normalizedText.consult_type, 'Expected remote_video consult type from text sample');
  assertEquals_('jamie@example.com', normalizedText.email, 'Expected normalized email');

  let malformedDidThrow = false;
  try {
    parseEmailFromRaw_({ html: '', plain: malformed, subject: 'Unknown' }, config);
  } catch (error) {
    malformedDidThrow = true;
    assertEquals_('PARSE_FAILED', error.errorType || '', 'Malformed sample should fail parsing');
  }
  assertTrue_(malformedDidThrow, 'Malformed sample should throw');

  const phoneSample = normalizeFields(
    {
      mother_name: 'Case Three',
      baby_name: 'Baby Three',
      phone: '832.452.0815',
      consult_product_line: 'Phone consultation'
    },
    config
  );
  assertEquals_('phone', phoneSample.consult_type, 'Expected phone consult type');
  assertEquals_('(832) 452-0815', phoneSample.phone, 'Expected normalized phone');

  const queryConfig = getDefaultConfig_();
  queryConfig.gmailQueryBase =
    'label:wpforms/inbox -label:' +
    queryConfig.labels.processed +
    ' -label:' +
    queryConfig.labels.error +
    ' from:consultations@soslactation.com';
  const sanitizedQuery = buildGmailQuery(queryConfig);
  assertTrue_(
    sanitizedQuery.indexOf('-label:' + queryConfig.labels.processed) === -1,
    'buildGmailQuery should remove thread-level processed label exclusions.'
  );
  assertTrue_(
    sanitizedQuery.indexOf('-label:' + queryConfig.labels.error) === -1,
    'buildGmailQuery should remove thread-level error label exclusions.'
  );

  Logger.log('testParseSampleEmail passed');
  return {
    passed: true
  };
}

function runIngest_(options) {
  options = options || {};
  const dryRun = Boolean(options.dryRun);
  const lock = LockService.getScriptLock();
  const lockAcquired = lock.tryLock(10000);
  if (!lockAcquired) {
    throw new Error('ingestWpformsEmails is already running (script lock unavailable).');
  }

  try {
    setupLedger();
    const config = getConfig_();
    const ss = getLedgerSpreadsheet_();
    const intakeSheet = ss.getSheetByName(LEDGER.SHEETS.INTAKE);
    const errorsSheet = ss.getSheetByName(LEDGER.SHEETS.ERRORS);
    const context = getLedgerSpreadsheetContext();
    const labels = ensureLabelsExist(config);
    const query = buildGmailQuery(config);
    const threads = GmailApp.search(query, 0, config.maxMessagesPerRun);
    const messages = flattenMessages_(threads).slice(0, config.maxMessagesPerRun);
    const existing = lookupExistingIndexes_(intakeSheet);
    const existingErrors = lookupErrorMessageIds_(errorsSheet);

    const summary = {
      runAtUtc: new Date().toISOString(),
      dryRun: dryRun,
      queryBase: config.gmailQueryBase,
      query: query,
      spreadsheetId: ss.getId(),
      spreadsheetName: ss.getName(),
      spreadsheetMode: context.mode,
      branch: config.dbPrimaryEnabled ? 'EMAIL_FALLBACK' : 'EMAIL_PRIMARY',
      threadCount: threads.length,
      messageCount: messages.length,
      appended: 0,
      errors: 0,
      duplicateMessageSkips: 0,
      duplicateErrorSkips: 0,
      duplicateCaseKeyObserved: 0,
      duplicateSourceSkips: 0,
      fallbackWindowSkips: 0
    };

    for (let i = 0; i < messages.length; i += 1) {
      const message = messages[i];
      const messageId = String(message.getId() || '').trim();
      const sourceId = buildEmailSourceId_(messageId);

      if (!messageId) {
        summary.errors += 1;
        if (!dryRun) {
          logErrorRow_(errorsSheet, {
            ingested_at_utc: new Date().toISOString(),
            gmail_message_id: '',
            error_type: 'PARSE_FAILED',
            error_detail: 'Message has no Gmail message ID.',
            raw_body_snippet: ''
          });
        }
        continue;
      }

      if (existing.sourceIds[sourceId]) {
        summary.duplicateSourceSkips += 1;
        if (!dryRun) {
          message.getThread().addLabel(labels.processed);
        }
        continue;
      }

      if (existing.messageIds[messageId]) {
        summary.duplicateMessageSkips += 1;
        if (!dryRun) {
          message.getThread().addLabel(labels.processed);
        }
        continue;
      }

      if (existingErrors[messageId]) {
        summary.duplicateErrorSkips += 1;
        if (!dryRun) {
          message.getThread().addLabel(labels.error);
        }
        continue;
      }

      try {
        const fromEmail = extractEmailAddress_(message.getFrom() || '');
        if (fromEmail !== config.allowedFrom) {
          throw createIngestError_(
            'SENDER_MISMATCH',
            'Sender mismatch: expected ' + config.allowedFrom + ', got ' + fromEmail,
            truncate_(message.getPlainBody() || '', config.rawExcerptMaxLen)
          );
        }

        const parsed = parseEmailBody(message, config);
        const normalized = normalizeFields(parsed.fields, config);
        normalized.form_name = normalized.form_name || inferFormNameFromSubject_(parsed.subject);
        const missing = validateRequiredFields_(normalized, config.requiredFields);
        if (missing.length > 0) {
          throw createIngestError_(
            'REQUIRED_FIELDS_MISSING',
            'Missing required fields: ' + missing.join(', '),
            parsed.rawExcerpt
          );
        }

        const caseKey = computeCaseKey(normalized);
        if (existing.caseKeys[caseKey]) {
          summary.duplicateCaseKeyObserved += 1;
        }

        if (config.dbPrimaryEnabled && config.emailFallbackEnabled) {
          const messageDate = message.getDate();
          const ageMinutes = messageDate
            ? Math.floor((Date.now() - messageDate.getTime()) / 60000)
            : config.emailFallbackMinutes + 1;
          if (ageMinutes < config.emailFallbackMinutes) {
            summary.fallbackWindowSkips += 1;
            continue;
          }
        }

        const row = {
          ingested_at_utc: new Date().toISOString(),
          gmail_message_id: messageId,
          email_date: safeIsoDateTime_(message.getDate()),
          form_name: normalized.form_name,
          consult_type: normalized.consult_type,
          mother_name: normalized.mother_name,
          mother_dob: normalized.mother_dob,
          baby_name: normalized.baby_name,
          baby_dob: normalized.baby_dob,
          birth_weight: normalized.birth_weight,
          pediatrician_name: normalized.pediatrician_name,
          address: normalized.address,
          phone: normalized.phone,
          email: normalized.email,
          concerns: normalized.concerns,
          concern_description: normalized.concern_description,
          referral_source: normalized.referral_source,
          amount: normalized.amount,
          payment_method_brand: normalized.payment_method_brand,
          raw_excerpt: truncate_(parsed.rawExcerpt, config.rawExcerptMaxLen),
          case_key: caseKey,
          source_lane: 'email',
          source_id: sourceId,
          wpforms_entry_id: '',
          wpforms_form_id: '',
          wpforms_status: ''
        };

        if (!dryRun) {
          appendIntakeRow_(intakeSheet, row);
          message.getThread().addLabel(labels.processed);
          existing.messageIds[messageId] = true;
          existing.caseKeys[caseKey] = true;
          existing.sourceIds[sourceId] = true;
        }
        summary.appended += 1;
      } catch (error) {
        summary.errors += 1;
        const errorType = error && error.errorType ? String(error.errorType) : 'PARSE_FAILED';
        const errorDetail = truncate_(error && error.message ? String(error.message) : 'Unknown parse error', 500);
        const rawSnippet =
          error && error.rawSnippet ? String(error.rawSnippet) : truncate_(message.getPlainBody() || '', config.rawExcerptMaxLen);

        if (!dryRun) {
          logErrorRow_(errorsSheet, {
            ingested_at_utc: new Date().toISOString(),
            gmail_message_id: messageId,
            error_type: errorType,
            error_detail: errorDetail,
            raw_body_snippet: truncate_(rawSnippet, config.rawExcerptMaxLen)
          });
          message.getThread().addLabel(labels.error);
          existingErrors[messageId] = true;
        }
      }
    }

    Logger.log('[SOS Intake Ingestion] ' + JSON.stringify(summary));
    return summary;
  } finally {
    lock.releaseLock();
  }
}

function runDbSync_(payload, options) {
  options = options || {};
  const dryRun = Boolean(options.dryRun);
  const lock = LockService.getScriptLock();
  const lockAcquired = lock.tryLock(10000);
  if (!lockAcquired) {
    throw new Error('WPForms DB sync is already running (script lock unavailable).');
  }

  try {
    setupLedger();
    const config = getConfig_();
    if (!config.dbPrimaryEnabled) {
      return {
        runAtUtc: new Date().toISOString(),
        dryRun: dryRun,
        branch: 'DB_PRIMARY_DISABLED',
        acceptedRows: 0
      };
    }

    verifyDbPayloadAuth_(payload);

    const ss = getLedgerSpreadsheet_();
    const intakeSheet = ss.getSheetByName(LEDGER.SHEETS.INTAKE);
    const errorsSheet = ss.getSheetByName(LEDGER.SHEETS.ERRORS);
    const rawMirrorSheet = ss.getSheetByName(LEDGER.SHEETS.RAW_MIRROR);
    const existing = lookupExistingIndexes_(intakeSheet);
    const rawMirrorSourceIds = lookupRawMirrorSourceIds_(rawMirrorSheet);
    const rows = normalizeDbPayloadRows_(payload);
    const source = cleanText_(payload.source || config.dbSourceName || 'wpforms-db-cron');

    const summary = {
      runAtUtc: new Date().toISOString(),
      dryRun: dryRun,
      branch: 'DB_PRIMARY',
      source: source,
      receivedRows: rows.length,
      acceptedRows: 0,
      rawMirrorAppended: 0,
      intakeAppended: 0,
      duplicateSourceSkips: 0,
      statusFilteredSkips: 0,
      invalidRows: 0,
      transformErrors: 0
    };

    for (let i = 0; i < rows.length; i += 1) {
      const dbRow = rows[i] || {};
      const entryId = cleanText_(dbRow.entry_id || dbRow.id);
      const formId = cleanText_(dbRow.form_id || dbRow.formId);
      const status = cleanText_(dbRow.status).toLowerCase();

      if (!entryId) {
        summary.invalidRows += 1;
        continue;
      }

      if (status && config.dbStatusAllowlist.indexOf(status) === -1) {
        summary.statusFilteredSkips += 1;
        continue;
      }

      const sourceId = buildDbSourceId_(entryId);
      if (existing.sourceIds[sourceId] || rawMirrorSourceIds[sourceId]) {
        summary.duplicateSourceSkips += 1;
        continue;
      }

      const rawPayloadJson = truncate_(safeSerializeJson_(dbRow), 49000);
      let caseKey = '';
      let transformError = '';
      let intakeRow = null;

      try {
        const transformed = transformDbPayloadRow_(dbRow, config);
        caseKey = transformed.caseKey;
        intakeRow = {
          ingested_at_utc: new Date().toISOString(),
          gmail_message_id: '',
          email_date: cleanText_(dbRow.date_utc || dbRow.date || dbRow.entry_date || ''),
          form_name: transformed.normalized.form_name,
          consult_type: transformed.normalized.consult_type,
          mother_name: transformed.normalized.mother_name,
          mother_dob: transformed.normalized.mother_dob,
          baby_name: transformed.normalized.baby_name,
          baby_dob: transformed.normalized.baby_dob,
          birth_weight: transformed.normalized.birth_weight,
          pediatrician_name: transformed.normalized.pediatrician_name,
          address: transformed.normalized.address,
          phone: transformed.normalized.phone,
          email: transformed.normalized.email,
          concerns: transformed.normalized.concerns,
          concern_description: transformed.normalized.concern_description,
          referral_source: transformed.normalized.referral_source,
          amount: transformed.normalized.amount,
          payment_method_brand: transformed.normalized.payment_method_brand,
          raw_excerpt: truncate_(transformed.rawExcerpt, config.rawExcerptMaxLen),
          case_key: caseKey,
          source_lane: 'db',
          source_id: sourceId,
          wpforms_entry_id: entryId,
          wpforms_form_id: formId,
          wpforms_status: status
        };
      } catch (error) {
        summary.transformErrors += 1;
        transformError = truncate_(error && error.message ? String(error.message) : 'Unknown transform failure', 500);

        if (!dryRun) {
          logErrorRow_(errorsSheet, {
            ingested_at_utc: new Date().toISOString(),
            gmail_message_id: '',
            error_type: error && error.errorType ? String(error.errorType) : 'DB_TRANSFORM_FAILED',
            error_detail: transformError,
            raw_body_snippet: truncate_(rawPayloadJson, config.rawExcerptMaxLen)
          });
        }
      }

      if (!dryRun) {
        appendRawMirrorRow_(rawMirrorSheet, {
          ingested_at_utc: new Date().toISOString(),
          source_lane: 'db',
          source_id: sourceId,
          entry_id: entryId,
          form_id: formId,
          status: status,
          entry_date: cleanText_(dbRow.date_utc || dbRow.date || dbRow.entry_date || ''),
          date_modified: cleanText_(dbRow.date_modified || ''),
          payload_json: rawPayloadJson,
          transform_status: intakeRow ? 'OK' : 'TRANSFORM_FAILED',
          transform_error: transformError,
          case_key: caseKey
        });
        rawMirrorSourceIds[sourceId] = true;
      }
      summary.rawMirrorAppended += 1;

      if (!intakeRow) {
        continue;
      }

      if (!dryRun) {
        appendIntakeRow_(intakeSheet, intakeRow);
        existing.sourceIds[sourceId] = true;
        existing.wpformsEntryIds[entryId] = true;
        existing.caseKeys[caseKey] = true;
      }
      summary.acceptedRows += 1;
      summary.intakeAppended += 1;
    }

    Logger.log('[SOS Intake DB Sync] ' + JSON.stringify(summary));
    return summary;
  } finally {
    lock.releaseLock();
  }
}

function parseWebAppPayload_(e) {
  const rawBody = e && e.postData && e.postData.contents ? String(e.postData.contents) : '';
  if (!rawBody) {
    throw new Error('DB sync payload body is empty.');
  }
  const parsed = parseJsonObject_(rawBody, null);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('DB sync payload must be valid JSON object.');
  }
  return parsed;
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function getDbSyncSharedSecret_() {
  const secret = PropertiesService.getScriptProperties().getProperty(LEDGER.SCRIPT_PROPERTIES.DB_SYNC_SHARED_SECRET);
  return cleanText_(secret);
}

function verifyDbPayloadAuth_(payload) {
  const expectedSecret = getDbSyncSharedSecret_();
  if (!expectedSecret) {
    throw new Error(
      'DB sync shared secret is not configured. Run setDbSyncSharedSecret() in this Apps Script project first.'
    );
  }

  const providedToken = cleanText_((payload && payload.auth_token) || '');
  if (!providedToken || providedToken !== expectedSecret) {
    throw new Error('DB sync payload auth_token is invalid.');
  }
}

function normalizeDbPayloadRows_(payload) {
  if (!payload || !Array.isArray(payload.rows)) {
    return [];
  }
  return payload.rows.filter(function (row) {
    return row && typeof row === 'object';
  });
}

function transformDbPayloadRow_(dbRow, config) {
  const dbText = flattenDbFieldsText_(dbRow);
  const parsedFields = parseFieldsFromText_(dbText, config.labelLookup);

  if (!parsedFields.form_name) {
    const formId = cleanText_(dbRow.form_id || dbRow.formId);
    const fallbackName = cleanText_(dbRow.form_name || dbRow.form_title || dbRow.title || '');
    parsedFields.form_name = fallbackName || (formId ? 'WPForms Form #' + formId : 'WPForms Form');
  }

  const normalized = normalizeFields(parsedFields, config);
  normalized.form_name = normalized.form_name || parsedFields.form_name;

  const missing = validateRequiredFields_(normalized, config.requiredFields);
  if (missing.length > 0) {
    throw createIngestError_(
      'REQUIRED_FIELDS_MISSING',
      'Missing required fields: ' + missing.join(', '),
      truncate_(dbText, config.rawExcerptMaxLen)
    );
  }

  return {
    normalized: normalized,
    caseKey: computeCaseKey(normalized),
    rawExcerpt: dbText
  };
}

function flattenDbFieldsText_(dbRow) {
  const lines = [];
  const formName = cleanText_(dbRow.form_name || dbRow.form_title || dbRow.title || '');
  if (formName) {
    lines.push('Form Name: ' + formName);
  }

  const rawFields = resolveDbFieldsObject_(dbRow);
  const keys = Object.keys(rawFields);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const field = rawFields[key];
    const label = cleanText_(
      (field && (field.name || field.label || field.field_label || field.title)) || 'Field ' + String(key)
    );
    const value = cleanText_(extractWpformsFieldValue_(field));
    if (!label || !value) {
      continue;
    }
    lines.push(label + ': ' + value);
  }

  return lines.join('\n');
}

function resolveDbFieldsObject_(dbRow) {
  if (dbRow.fields && typeof dbRow.fields === 'object' && !Array.isArray(dbRow.fields)) {
    return dbRow.fields;
  }

  if (dbRow.fields_json && typeof dbRow.fields_json === 'object' && !Array.isArray(dbRow.fields_json)) {
    return dbRow.fields_json;
  }

  const candidate = cleanText_(dbRow.fields || dbRow.fields_json || '');
  if (!candidate) {
    return {};
  }
  const parsed = parseJsonObject_(candidate, {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function extractWpformsFieldValue_(field) {
  if (field === null || field === undefined) {
    return '';
  }

  if (typeof field === 'string' || typeof field === 'number' || typeof field === 'boolean') {
    return String(field);
  }

  if (Array.isArray(field)) {
    return field
      .map(function (entry) {
        return extractWpformsFieldValue_(entry);
      })
      .filter(function (entry) {
        return Boolean(cleanText_(entry));
      })
      .join(', ');
  }

  const preferredKeys = ['value', 'value_raw', 'text', 'selected', 'choice_label', 'label', 'first', 'last'];
  for (let i = 0; i < preferredKeys.length; i += 1) {
    const key = preferredKeys[i];
    if (Object.prototype.hasOwnProperty.call(field, key) && cleanText_(field[key])) {
      return String(field[key]);
    }
  }

  return safeSerializeJson_(field);
}

function buildDbSourceId_(entryId) {
  return 'wpforms:db:' + cleanText_(entryId);
}

function buildEmailSourceId_(messageId) {
  return 'wpforms:email:' + cleanText_(messageId);
}

function getConfig_() {
  const ss = getLedgerSpreadsheet_();
  const configSheet = ss.getSheetByName(LEDGER.SHEETS.CONFIG);
  if (!configSheet) {
    throw new Error('Config sheet missing. Run setupLedger() first.');
  }

  const config = getDefaultConfig_();
  const lastRow = configSheet.getLastRow();
  if (lastRow >= 2) {
    const values = configSheet.getRange(2, 1, lastRow - 1, 3).getValues();
    values.forEach(function (row) {
      const key = String(row[0] || '').trim();
      const value = String(row[1] || '').trim();
      if (!key || !value) {
        return;
      }

      if (key.indexOf('synonym.') === 0) {
        const canonical = key.slice('synonym.'.length);
        config.labelSynonyms[canonical] = splitConfigList_(value);
        return;
      }

      if (key.indexOf('consult_rule.') === 0) {
        const consultType = key.slice('consult_rule.'.length);
        config.consultTypeRules[consultType] = splitConfigList_(value);
        return;
      }

      switch (key) {
        case 'processed_label':
          config.labels.processed = value;
          break;
        case 'error_label':
          config.labels.error = value;
          break;
        case 'inbox_label':
          config.labels.inbox = value;
          break;
        case 'gmail_query_base':
          config.gmailQueryBase = value;
          break;
        case 'allowed_from':
          config.allowedFrom = value.toLowerCase();
          break;
        case 'required_fields':
          config.requiredFields = splitConfigList_(value);
          break;
        case 'max_messages_per_run':
          config.maxMessagesPerRun = asPositiveInt_(value, 50);
          break;
        case 'raw_excerpt_max_len':
          config.rawExcerptMaxLen = asPositiveInt_(value, 500);
          break;
        case 'db_primary_enabled':
          config.dbPrimaryEnabled = asBoolean_(value, true);
          break;
        case 'email_fallback_enabled':
          config.emailFallbackEnabled = asBoolean_(value, true);
          break;
        case 'email_fallback_minutes':
          config.emailFallbackMinutes = asPositiveInt_(value, 15);
          break;
        case 'db_status_allowlist':
          config.dbStatusAllowlist = splitConfigList_(value).map(function (entry) {
            return entry.toLowerCase();
          });
          break;
        case 'db_source_name':
          config.dbSourceName = value;
          break;
        default:
          break;
      }
    });
  }

  validateConfig_(config);
  config.labelLookup = buildLabelLookup_(config.labelSynonyms);
  config.consultTypeRules = normalizeConsultRules_(config.consultTypeRules);
  return config;
}

function getDefaultConfig_() {
  return {
    labels: {
      processed: LEDGER.DEFAULTS.processed_label,
      error: LEDGER.DEFAULTS.error_label,
      inbox: LEDGER.DEFAULTS.inbox_label
    },
    gmailQueryBase: LEDGER.DEFAULTS.gmail_query_base,
    allowedFrom: LEDGER.DEFAULTS.allowed_from.toLowerCase(),
    requiredFields: splitConfigList_(LEDGER.DEFAULTS.required_fields),
    maxMessagesPerRun: asPositiveInt_(LEDGER.DEFAULTS.max_messages_per_run, 50),
    rawExcerptMaxLen: asPositiveInt_(LEDGER.DEFAULTS.raw_excerpt_max_len, 500),
    dbPrimaryEnabled: asBoolean_(LEDGER.DEFAULTS.db_primary_enabled, true),
    emailFallbackEnabled: asBoolean_(LEDGER.DEFAULTS.email_fallback_enabled, true),
    emailFallbackMinutes: asPositiveInt_(LEDGER.DEFAULTS.email_fallback_minutes, 15),
    dbStatusAllowlist: splitConfigList_(LEDGER.DEFAULTS.db_status_allowlist).map(function (entry) {
      return entry.toLowerCase();
    }),
    dbSourceName: cleanText_(LEDGER.DEFAULTS.db_source_name),
    labelSynonyms: JSON.parse(JSON.stringify(DEFAULT_SYNONYMS)),
    consultTypeRules: JSON.parse(JSON.stringify(DEFAULT_CONSULT_RULES))
  };
}

function validateConfig_(config) {
  if (!config.labels.processed || !config.labels.error || !config.labels.inbox) {
    throw createIngestError_('CONFIG_INVALID', 'Config must define processed_label, error_label, and inbox_label.', '');
  }
  if (!config.allowedFrom) {
    throw createIngestError_('CONFIG_INVALID', 'Config must define allowed_from.', '');
  }
  if (!Array.isArray(config.requiredFields) || config.requiredFields.length === 0) {
    throw createIngestError_('CONFIG_INVALID', 'Config must define required_fields.', '');
  }
  if (!config.gmailQueryBase) {
    throw createIngestError_('CONFIG_INVALID', 'Config must define gmail_query_base.', '');
  }
  if (!Array.isArray(config.dbStatusAllowlist) || config.dbStatusAllowlist.length === 0) {
    throw createIngestError_('CONFIG_INVALID', 'Config must define db_status_allowlist.', '');
  }
  if (config.emailFallbackEnabled && (!config.emailFallbackMinutes || config.emailFallbackMinutes < 1)) {
    throw createIngestError_('CONFIG_INVALID', 'Config must define email_fallback_minutes >= 1.', '');
  }
}

function parseEmailFromRaw_(input, config) {
  const rawText = extractTextForParsing_(input.html, input.plain);
  const fields = parseFieldsFromText_(rawText, config.labelLookup);
  if (Object.keys(fields).length === 0) {
    throw createIngestError_(
      'PARSE_FAILED',
      'No known WPForms labels found in email body.',
      truncate_(rawText, config.rawExcerptMaxLen || 500)
    );
  }

  if (!fields.form_name) {
    fields.form_name = inferFormNameFromSubject_(input.subject || '');
  }

  return {
    subject: input.subject || '',
    fields: fields,
    rawText: rawText,
    rawExcerpt: truncate_(rawText, config.rawExcerptMaxLen || 500)
  };
}

function parseFieldsFromText_(rawText, labelLookup) {
  const lines = normalizeLines_(rawText);
  const fields = {};
  let i = 0;

  while (i < lines.length) {
    const current = lines[i];
    const colonSplit = splitLabelValueByColon_(current);

    if (colonSplit && colonSplit.label) {
      const canonicalFromColon = labelLookup[normalizeLabel_(colonSplit.label)] || '';
      if (canonicalFromColon) {
        let value = colonSplit.value;
        i += 1;
        if (!value) {
          const consumed = consumeMultilineValue_(lines, i, labelLookup);
          value = consumed.value;
          i = consumed.nextIndex;
        }
        addFieldValue_(fields, canonicalFromColon, value);
        continue;
      }
    }

    const normalizedLine = normalizeLabel_(current.replace(/:$/, ''));
    const canonical = labelLookup[normalizedLine] || '';
    if (!canonical) {
      i += 1;
      continue;
    }

    const consumed = consumeMultilineValue_(lines, i + 1, labelLookup);
    addFieldValue_(fields, canonical, consumed.value);
    i = consumed.nextIndex;
  }

  return fields;
}

function consumeMultilineValue_(lines, startIndex, labelLookup) {
  const parts = [];
  let i = startIndex;
  while (i < lines.length) {
    const line = lines[i];
    if (!line) {
      i += 1;
      continue;
    }
    if (lineLooksLikeLabel_(line, labelLookup)) {
      break;
    }
    parts.push(line);
    i += 1;
  }

  return {
    value: cleanText_(parts.join(' ').trim()),
    nextIndex: i
  };
}

function lineLooksLikeLabel_(line, labelLookup) {
  const colonSplit = splitLabelValueByColon_(line);
  if (colonSplit && colonSplit.label) {
    const normalized = normalizeLabel_(colonSplit.label);
    if (labelLookup[normalized]) {
      return true;
    }
  }
  const normalizedLine = normalizeLabel_(line.replace(/:$/, ''));
  return Boolean(labelLookup[normalizedLine]);
}

function splitLabelValueByColon_(line) {
  const idx = line.indexOf(':');
  if (idx <= 0 || idx > 90) {
    return null;
  }
  const label = line.slice(0, idx).trim();
  const value = line.slice(idx + 1).trim();
  if (!label) {
    return null;
  }
  return {
    label: label,
    value: value
  };
}

function addFieldValue_(fields, key, value) {
  const clean = cleanText_(value);
  if (!clean) {
    return;
  }
  if (!fields[key]) {
    fields[key] = clean;
    return;
  }
  if (fields[key].indexOf(clean) !== -1) {
    return;
  }
  fields[key] = fields[key] + ' | ' + clean;
}

function buildLabelLookup_(synonyms) {
  const lookup = {};
  Object.keys(synonyms).forEach(function (canonical) {
    lookup[normalizeLabel_(canonical)] = canonical;
    synonyms[canonical].forEach(function (entry) {
      lookup[normalizeLabel_(entry)] = canonical;
    });
  });
  return lookup;
}

function normalizeConsultRules_(consultTypeRules) {
  return Object.keys(consultTypeRules).map(function (consultType) {
    return {
      consultType: consultType,
      patterns: consultTypeRules[consultType]
        .map(function (entry) {
          return String(entry || '').trim().toLowerCase();
        })
        .filter(function (entry) {
          return Boolean(entry);
        })
    };
  });
}

function ensureDefaultConfigRows_(configSheet) {
  const existing = {};
  const lastRow = configSheet.getLastRow();
  if (lastRow >= 2) {
    const values = configSheet.getRange(2, 1, lastRow - 1, 3).getValues();
    values.forEach(function (row) {
      const key = String(row[0] || '').trim();
      if (key) {
        existing[key] = true;
      }
    });
  }

  const rowsToAppend = [];
  Object.keys(LEDGER.DEFAULTS).forEach(function (key) {
    if (!existing[key]) {
      rowsToAppend.push([key, LEDGER.DEFAULTS[key], defaultConfigNotes_(key)]);
    }
  });

  Object.keys(DEFAULT_SYNONYMS).forEach(function (canonical) {
    const key = 'synonym.' + canonical;
    if (!existing[key]) {
      rowsToAppend.push([key, DEFAULT_SYNONYMS[canonical].join(' | '), 'Alias labels mapped to ' + canonical]);
    }
  });

  Object.keys(DEFAULT_CONSULT_RULES).forEach(function (consultType) {
    const key = 'consult_rule.' + consultType;
    if (!existing[key]) {
      rowsToAppend.push([key, DEFAULT_CONSULT_RULES[consultType].join(' | '), 'String match rules for consult_type']);
    }
  });

  if (rowsToAppend.length > 0) {
    const startRow = configSheet.getLastRow() + 1;
    configSheet.getRange(startRow, 1, rowsToAppend.length, 3).setValues(rowsToAppend);
  }
}

function defaultConfigNotes_(key) {
  const notes = {
    processed_label: 'Success label applied after append.',
    error_label: 'Error label applied when parsing fails.',
    inbox_label: 'Source label. Create Gmail filter to apply this label.',
    gmail_query_base: 'Base query for candidate messages. Thread-level processed/error exclusions are removed automatically.',
    allowed_from: 'Strict sender check for each message.',
    required_fields: 'Comma list. Supports email_or_phone pseudo-field.',
    max_messages_per_run: 'Safety cap per trigger execution.',
    raw_excerpt_max_len: 'Max characters stored in Intake/Error raw snippets.',
    db_primary_enabled: 'When enabled, DB lane is authoritative for new Intake rows.',
    email_fallback_enabled: 'When enabled, Gmail lane writes only after fallback window.',
    email_fallback_minutes: 'Minutes to wait before Gmail fallback can append.',
    db_status_allowlist: 'WPForms entry statuses accepted from DB payload.',
    db_source_name: 'Expected logical source name for DB lane payloads.'
  };
  return notes[key] || '';
}

function ensureSheetWithHeaders_(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  let same = true;
  for (let i = 0; i < headers.length; i += 1) {
    if (String(firstRow[i] || '').trim() !== headers[i]) {
      same = false;
      break;
    }
  }
  if (!same) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sheet;
}

function getLedgerSpreadsheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) {
    return ss;
  }

  const spreadsheetId = getLedgerSpreadsheetIdProperty_();
  if (spreadsheetId) {
    try {
      const normalized = normalizeSpreadsheetIdInput_(spreadsheetId);
      if (!looksLikeSpreadsheetId_(normalized)) {
        throw new Error('INVALID_ID_FORMAT');
      }
      return openLedgerSpreadsheetById_(normalized, 'getLedgerSpreadsheet_');
    } catch (error) {
      const reason = error && error.message ? String(error.message) : 'unknown';
      throw new Error(
        'Configured LEDGER_SPREADSHEET_ID is invalid or inaccessible. ' +
          'Run validateLedgerSpreadsheetBinding(), clearLedgerSpreadsheetId(), set script property LEDGER_SPREADSHEET_ID, then run setLedgerSpreadsheetId(). Details: ' +
          reason
      );
    }
  }

  throw new Error(
    'No active spreadsheet found and LEDGER_SPREADSHEET_ID is not configured. ' +
      'Use bound mode (Extensions -> Apps Script from the sheet) or standalone mode: ' +
      'set script property LEDGER_SPREADSHEET_ID and run setLedgerSpreadsheetId() first.'
  );
}

function getLedgerSpreadsheetIdProperty_() {
  const value = PropertiesService.getScriptProperties().getProperty(LEDGER.SCRIPT_PROPERTIES.SPREADSHEET_ID);
  return cleanText_(value);
}

function normalizeSpreadsheetIdInput_(value) {
  const raw = cleanText_(value);
  if (!raw) {
    return '';
  }

  const urlMatch = raw.match(/\/d\/([a-zA-Z0-9\-_]+)/);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  return raw.replace(/[?#].*$/, '').trim();
}

function looksLikeSpreadsheetId_(value) {
  return /^[a-zA-Z0-9\-_]{20,}$/.test(String(value || ''));
}

function buildSpreadsheetUrlFromId_(spreadsheetId) {
  return 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/edit';
}

function openLedgerSpreadsheetById_(spreadsheetId, caller) {
  try {
    return SpreadsheetApp.openById(spreadsheetId);
  } catch (openByIdError) {
    try {
      return SpreadsheetApp.openByUrl(buildSpreadsheetUrlFromId_(spreadsheetId));
    } catch (openByUrlError) {
      const idMessage =
        openByIdError && openByIdError.message ? String(openByIdError.message) : 'openById failed';
      const urlMessage =
        openByUrlError && openByUrlError.message ? String(openByUrlError.message) : 'openByUrl failed';
      throw new Error(
        (caller || 'openLedgerSpreadsheetById_') +
          ' failed: OPEN_BY_ID=(' +
          idMessage +
          '), OPEN_BY_URL=(' +
          urlMessage +
          ')'
      );
    }
  }
}

function normalizeLines_(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(function (line) {
      return cleanText_(line);
    })
    .filter(function (line) {
      return Boolean(line);
    });
}

function getBindingSetHelpMessage_() {
  return (
    'setLedgerSpreadsheetId requires a spreadsheet ID or URL. ' +
    'Set script property LEDGER_SPREADSHEET_ID in Project Settings, run setLedgerSpreadsheetId() (or setLedgerSpreadsheetIdInteractive()), then run validateLedgerSpreadsheetBinding().'
  );
}

function stripThreadStateLabelExclusions_(query, labels) {
  const tokens = String(query || '')
    .split(/\s+/)
    .map(function (entry) {
      return String(entry || '').trim();
    })
    .filter(function (entry) {
      return Boolean(entry);
    });

  const blocked = {};
  blocked['-label:' + labels.processed] = true;
  blocked['-label:' + labels.error] = true;

  const filtered = tokens.filter(function (token) {
    return !blocked[token];
  });
  return filtered.join(' ');
}

function extractTextForParsing_(html, plain) {
  const htmlText = htmlToText_(html);
  const plainText = String(plain || '').trim();
  if (!plainText) {
    return htmlText;
  }
  if (!htmlText) {
    return plainText;
  }
  return plainText.length >= htmlText.length ? plainText : htmlText;
}

function htmlToText_(html) {
  if (!html) {
    return '';
  }
  let text = String(html);
  text = text
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ');

  text = decodeHtmlEntities_(text);
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function decodeHtmlEntities_(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function normalizeLabel_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&nbsp;/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cleanText_(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDate_(value) {
  const source = cleanText_(value);
  if (!source) {
    return '';
  }
  const usMatch = source.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (usMatch) {
    const month = pad2_(usMatch[1]);
    const day = pad2_(usMatch[2]);
    const year = usMatch[3].length === 2 ? '20' + usMatch[3] : usMatch[3];
    return year + '-' + month + '-' + day;
  }

  const isoMatch = source.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return isoMatch[1] + '-' + pad2_(isoMatch[2]) + '-' + pad2_(isoMatch[3]);
  }

  const date = new Date(source);
  if (String(date) !== 'Invalid Date') {
    return safeIsoDate_(date);
  }

  return source;
}

function normalizePhone_(value) {
  const source = cleanText_(value);
  if (!source) {
    return '';
  }
  const digits = source.replace(/\D/g, '');
  if (digits.length === 10) {
    return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
  }
  if (digits.length === 11 && digits[0] === '1') {
    return '(' + digits.slice(1, 4) + ') ' + digits.slice(4, 7) + '-' + digits.slice(7);
  }
  return source;
}

function normalizeEmail_(value) {
  return cleanText_(value).toLowerCase();
}

function normalizeAmount_(value) {
  const source = cleanText_(value);
  if (!source) {
    return '';
  }
  const numeric = source.replace(/[^0-9.\-]/g, '');
  if (!numeric || numeric === '.' || numeric === '-') {
    return source;
  }
  const amount = Number(numeric);
  if (Number.isNaN(amount)) {
    return source;
  }
  return amount.toFixed(2);
}

function validateRequiredFields_(normalized, requiredFields) {
  const missing = [];
  requiredFields.forEach(function (field) {
    if (field === 'email_or_phone') {
      if (!normalized.email && !normalized.phone) {
        missing.push('email_or_phone');
      }
      return;
    }
    if (!normalized[field]) {
      missing.push(field);
    }
  });
  return missing;
}

function flattenMessages_(threads) {
  const messages = [];
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (message) {
      messages.push(message);
    });
  });
  messages.sort(function (a, b) {
    return a.getDate().getTime() - b.getDate().getTime();
  });
  return messages;
}

function splitConfigList_(value) {
  return String(value || '')
    .split(/,|\|/)
    .map(function (entry) {
      return cleanText_(entry);
    })
    .filter(function (entry) {
      return Boolean(entry);
    });
}

function asPositiveInt_(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!parsed || parsed < 1) {
    return fallback;
  }
  return parsed;
}

function asBoolean_(value, fallback) {
  const source = String(value || '')
    .trim()
    .toLowerCase();
  if (!source) {
    return fallback;
  }
  if (source === '1' || source === 'true' || source === 'yes' || source === 'on') {
    return true;
  }
  if (source === '0' || source === 'false' || source === 'no' || source === 'off') {
    return false;
  }
  return fallback;
}

function parseJsonObject_(value, fallback) {
  try {
    return JSON.parse(String(value || ''));
  } catch (error) {
    return fallback;
  }
}

function safeSerializeJson_(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return '{}';
  }
}

function inferFormNameFromSubject_(subject) {
  const source = cleanText_(subject);
  if (!source) {
    return '';
  }
  const newEntryMatch = source.match(/new entry[:\-]\s*(.+)$/i);
  if (newEntryMatch) {
    return cleanText_(newEntryMatch[1]);
  }
  const wpFormsMatch = source.match(/wpforms[:\-]\s*(.+)$/i);
  if (wpFormsMatch) {
    return cleanText_(wpFormsMatch[1]);
  }
  return source;
}

function extractEmailAddress_(fromHeader) {
  const source = String(fromHeader || '').trim().toLowerCase();
  const bracketMatch = source.match(/<([^>]+)>/);
  if (bracketMatch) {
    return cleanText_(bracketMatch[1]).toLowerCase();
  }
  const rawMatch = source.match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/);
  return rawMatch ? rawMatch[0] : source;
}

function safeIsoDate_(date) {
  return (
    date.getUTCFullYear() +
    '-' +
    pad2_(date.getUTCMonth() + 1) +
    '-' +
    pad2_(date.getUTCDate())
  );
}

function safeIsoDateTime_(date) {
  if (!date) {
    return '';
  }
  return date.toISOString();
}

function sha256Hex_(input) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8);
  return digest
    .map(function (byte) {
      const value = byte < 0 ? byte + 256 : byte;
      return ('0' + value.toString(16)).slice(-2);
    })
    .join('');
}

function pad2_(value) {
  return ('0' + String(value)).slice(-2);
}

function truncate_(value, maxLen) {
  const source = String(value || '');
  if (!maxLen || source.length <= maxLen) {
    return source;
  }
  return source.slice(0, maxLen);
}

function getOrCreateUserLabel_(name) {
  let label = GmailApp.getUserLabelByName(name);
  if (!label) {
    label = GmailApp.createLabel(name);
  }
  return label;
}

function createIngestError_(errorType, message, rawSnippet) {
  const error = new Error(message);
  error.errorType = errorType;
  error.rawSnippet = rawSnippet || '';
  return error;
}

function assertEquals_(expected, actual, message) {
  if (expected !== actual) {
    throw new Error((message || 'Assertion failed') + ' | expected=' + expected + ' actual=' + actual);
  }
}

function assertTrue_(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}
