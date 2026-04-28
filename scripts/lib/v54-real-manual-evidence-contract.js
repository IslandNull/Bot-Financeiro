'use strict';

const DEFAULT_REQUIRED_SHEETS = [
    'Config_Categorias',
    'Config_Fontes',
    'Rendas',
    'Cartoes',
    'Faturas',
    'Pagamentos_Fatura',
    'Idempotency_Log',
    'Compras_Parceladas',
    'Parcelas_Agenda',
    'Orcamento_Futuro_Casa',
    'Lancamentos_V54',
    'Patrimonio_Ativos',
    'Dividas',
    'Acertos_Casal',
    'Fechamentos_Mensais',
];

function validateV54RealManualEvidenceEnvelope(evidence, options) {
    const source = evidence && typeof evidence === 'object' && !Array.isArray(evidence) ? evidence : {};
    const opts = options && typeof options === 'object' ? options : {};
    const requiredSheets = Array.isArray(opts.requiredSheets) && opts.requiredSheets.length > 0
        ? opts.requiredSheets.slice()
        : DEFAULT_REQUIRED_SHEETS.slice();

    const errors = [];
    const passed = [];

    requireString(source.operatorLabel || source.operatorIdentity || source.operatorId, 'operator', 'V54_REAL_MANUAL_EVIDENCE_OPERATOR_REQUIRED', errors, passed);
    requireString(source.timestamp || source.at, 'timestamp', 'V54_REAL_MANUAL_EVIDENCE_TIMESTAMP_REQUIRED', errors, passed);
    requireString(source.referenceDate, 'referenceDate', 'V54_REAL_MANUAL_EVIDENCE_REFERENCE_DATE_REQUIRED', errors, passed);
    requireString(source.branchName || (source.branch && source.branch.name), 'branchName', 'V54_REAL_MANUAL_EVIDENCE_BRANCH_REQUIRED', errors, passed);

    const commitSha = source.commitSha || (source.commit && source.commit.sha);
    const commitMarker = source.localCommitMarker || (source.commit && source.commit.localMarker);
    if (isNonEmptyString(commitSha) || isNonEmptyString(commitMarker)) {
        passed.push('commit_marker');
    } else {
        errors.push(makeError('V54_REAL_MANUAL_EVIDENCE_COMMIT_MARKER_REQUIRED', 'commit', 'Evidence requires commit SHA or explicit local commit marker.'));
    }

    requireTrue(source.mainJsDiffEmpty, 'mainJsDiffEmpty', 'V54_REAL_MANUAL_EVIDENCE_MAIN_DIFF_REQUIRED', errors, passed);
    requireTrue(source.doPostV54RefsControlled, 'doPostV54RefsControlled', 'V54_REAL_MANUAL_EVIDENCE_DOPOST_CONTROL_REQUIRED', errors, passed);
    requireTrue(source.doGetV54RefsAbsent, 'doGetV54RefsAbsent', 'V54_REAL_MANUAL_EVIDENCE_DOGET_REFS_REQUIRED', errors, passed);
    requireTrue(source.telegramSendDisabled, 'telegramSendDisabled', 'V54_REAL_MANUAL_EVIDENCE_TELEGRAM_DISABLED_REQUIRED', errors, passed);

    requireEvidenceObject(source.priorDryRun, 'priorDryRun', 'V54_REAL_MANUAL_EVIDENCE_PRIOR_DRY_RUN_REQUIRED', errors, passed);

    if (source.priorFakeShadow === null || source.priorFakeShadow === undefined) {
        const absence = source.priorFakeShadowAbsence;
        if (!absence || absence.accepted !== true || !isNonEmptyString(absence.reason)) {
            errors.push(makeError('V54_REAL_MANUAL_EVIDENCE_PRIOR_FAKE_SHADOW_REQUIRED', 'priorFakeShadow', 'Evidence requires priorFakeShadow object or explicit accepted absence with reason.'));
        } else {
            passed.push('priorFakeShadowAbsence');
        }
    } else {
        requireEvidenceObject(source.priorFakeShadow, 'priorFakeShadow', 'V54_REAL_MANUAL_EVIDENCE_PRIOR_FAKE_SHADOW_REQUIRED', errors, passed);
    }

    requireEvidenceObject(source.snapshotExport || source.snapshot, 'snapshotExport', 'V54_REAL_MANUAL_EVIDENCE_SNAPSHOT_REQUIRED', errors, passed);

    validateSpreadsheetEvidence(source.spreadsheetDiagnostics, requiredSheets, errors, passed);
    validateParserContextEvidence(source.parserContextDiagnostics, errors, passed);
    validateForbiddenActionsEvidence(source.forbiddenActions, errors, passed);

    return {
        ok: errors.length === 0,
        status: errors.length === 0 ? 'evidence_envelope_valid' : 'evidence_envelope_invalid',
        diagnostics: { passed, requiredSheets },
        errors,
    };
}

function validateSpreadsheetEvidence(diagnostics, requiredSheets, errors, passed) {
    if (!isObject(diagnostics)) {
        errors.push(makeError('V54_REAL_MANUAL_EVIDENCE_SPREADSHEET_REQUIRED', 'spreadsheetDiagnostics', 'Evidence requires spreadsheetDiagnostics object.'));
        return;
    }

    if (typeof diagnostics.allowExtraColumns !== 'boolean') {
        errors.push(makeError('V54_REAL_MANUAL_EVIDENCE_SPREADSHEET_ALLOW_EXTRA_REQUIRED', 'spreadsheetDiagnostics.allowExtraColumns', 'allowExtraColumns must be explicit true or false.'));
    } else {
        passed.push('spreadsheet_allow_extra_columns_explicit');
    }

    const sheetNames = Array.isArray(diagnostics.requiredSheetNames) ? diagnostics.requiredSheetNames : [];
    requiredSheets.forEach((sheetName) => {
        if (!sheetNames.includes(sheetName)) {
            errors.push(makeError('V54_REAL_MANUAL_EVIDENCE_REQUIRED_SHEET_MISSING', `spreadsheetDiagnostics.requiredSheetNames.${sheetName}`, `Required sheet ${sheetName} missing from evidence.`));
        }
    });

    const headerStatusBySheet = diagnostics.headerStatusBySheet;
    if (!isObject(headerStatusBySheet)) {
        errors.push(makeError('V54_REAL_MANUAL_EVIDENCE_HEADER_STATUS_REQUIRED', 'spreadsheetDiagnostics.headerStatusBySheet', 'headerStatusBySheet must be an object keyed by sheet name.'));
        return;
    }

    requiredSheets.forEach((sheetName) => {
        const entry = headerStatusBySheet[sheetName];
        if (!isObject(entry)) {
            errors.push(makeError('V54_REAL_MANUAL_EVIDENCE_HEADER_STATUS_REQUIRED', `spreadsheetDiagnostics.headerStatusBySheet.${sheetName}`, `Header status required for ${sheetName}.`));
            return;
        }
        if (entry.ok !== true) {
            errors.push(makeError('V54_REAL_MANUAL_EVIDENCE_HEADER_MISMATCH', `spreadsheetDiagnostics.headerStatusBySheet.${sheetName}.ok`, `Header validation failed for ${sheetName}.`));
            return;
        }
        const hasExtraColumns = entry.hasExtraColumns === true;
        if (hasExtraColumns && diagnostics.allowExtraColumns !== true) {
            errors.push(makeError('V54_REAL_MANUAL_EVIDENCE_EXTRA_COLUMNS_BLOCKED', `spreadsheetDiagnostics.headerStatusBySheet.${sheetName}.hasExtraColumns`, `Extra columns reported for ${sheetName} but allowExtraColumns !== true.`));
            return;
        }
        passed.push(`sheet_header_ok:${sheetName}`);
    });
}

function validateParserContextEvidence(diagnostics, errors, passed) {
    if (typeof diagnostics === 'boolean') {
        errors.push(makeError('V54_REAL_MANUAL_EVIDENCE_PARSER_CONTEXT_BOOLEAN_REJECTED', 'parserContextDiagnostics', 'Boolean parser context evidence is not accepted.'));
        return;
    }
    if (!isObject(diagnostics)) {
        errors.push(makeError('V54_REAL_MANUAL_EVIDENCE_PARSER_CONTEXT_REQUIRED', 'parserContextDiagnostics', 'Evidence requires parserContextDiagnostics object.'));
        return;
    }
    requireTrue(diagnostics.ran, 'parserContextDiagnostics.ran', 'V54_REAL_MANUAL_EVIDENCE_PARSER_CONTEXT_RAN_REQUIRED', errors, passed);
    requireTrue(diagnostics.ok, 'parserContextDiagnostics.ok', 'V54_REAL_MANUAL_EVIDENCE_PARSER_CONTEXT_OK_REQUIRED', errors, passed);
    requireString(diagnostics.referenceDate, 'parserContextDiagnostics.referenceDate', 'V54_REAL_MANUAL_EVIDENCE_PARSER_CONTEXT_REFERENCE_DATE_REQUIRED', errors, passed);
}

function validateForbiddenActionsEvidence(forbiddenActions, errors, passed) {
    if (!isObject(forbiddenActions)) {
        errors.push(makeError('V54_REAL_MANUAL_EVIDENCE_FORBIDDEN_ACTIONS_REQUIRED', 'forbiddenActions', 'Evidence requires forbiddenActions confirmation object.'));
        return;
    }
    requireTrue(forbiddenActions.noClaspDeploySetupSeed, 'forbiddenActions.noClaspDeploySetupSeed', 'V54_REAL_MANUAL_EVIDENCE_FORBIDDEN_CLASP_REQUIRED', errors, passed);
    requireTrue(forbiddenActions.noTelegram, 'forbiddenActions.noTelegram', 'V54_REAL_MANUAL_EVIDENCE_FORBIDDEN_TELEGRAM_REQUIRED', errors, passed);
    requireTrue(forbiddenActions.noRealOpenAI, 'forbiddenActions.noRealOpenAI', 'V54_REAL_MANUAL_EVIDENCE_FORBIDDEN_OPENAI_REQUIRED', errors, passed);
    requireTrue(forbiddenActions.noRealSpreadsheetAppInTests, 'forbiddenActions.noRealSpreadsheetAppInTests', 'V54_REAL_MANUAL_EVIDENCE_FORBIDDEN_SPREADSHEETAPP_REQUIRED', errors, passed);
}

function requireEvidenceObject(value, field, code, errors, passed) {
    if (!isObject(value)) {
        errors.push(makeError(code, field, `${field} evidence object is required.`));
        return;
    }
    if (!isNonEmptyString(value.id || value.runId || value.label || value.reference)) {
        errors.push(makeError(code, field, `${field} evidence must include id/runId/label/reference.`));
        return;
    }
    passed.push(field);
}

function requireTrue(value, field, code, errors, passed) {
    if (value === true) {
        passed.push(field);
        return;
    }
    errors.push(makeError(code, field, `${field} must be true.`));
}

function requireString(value, field, code, errors, passed) {
    if (isNonEmptyString(value)) {
        passed.push(field);
        return;
    }
    errors.push(makeError(code, field, `${field} must be a non-empty string.`));
}

function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function makeError(code, field, message) {
    return {
        code: String(code || 'V54_REAL_MANUAL_EVIDENCE_ERROR'),
        field: String(field || 'evidence'),
        message: String(message || 'real_manual evidence envelope failed safely.'),
    };
}

module.exports = {
    DEFAULT_REQUIRED_SHEETS,
    validateV54RealManualEvidenceEnvelope,
};
