'use strict';

const { V54_SHEETS } = require('./v54-schema');
const { validateV54RealManualEvidenceEnvelope } = require('./v54-real-manual-evidence-contract');

const BLOCKED_ACTIONS = Object.freeze([
    'clasp',
    'deploy',
    'telegram',
    'realOpenAI',
    'realSpreadsheetMutation',
]);

const SUSPICIOUS_V54_ROUTING_TOKENS = [
    'RunnerV54',
    'RunnerV54Gate',
    'runV54ManualShadow',
    'runManualShadowV54',
    'invokeV54ManualShadowGate',
    'real_manual',
    'manual_shadow',
];

function buildV54RealManualPreflightReport(input, deps) {
    const source = asObject(input);
    const services = asObject(deps);
    const checks = {
        mainJsDiffEmpty: false,
        doPostV54RefsControlled: false,
        doGetV54RefsAbsent: false,
        routingModeDefaultSafe: false,
        webhookAuthBeforeRouting: false,
        shadowNoV54Mutation: false,
        shadowNoV54TelegramSend: false,
        primaryNoV53FallbackMutation: false,
        evidenceEnvelopeValid: false,
        parserContextReadable: false,
        spreadsheetDiagnosticsValid: false,
    };

    const errors = [];

    checks.mainJsDiffEmpty = evaluateMainJsDiffCheck_(source, services, errors);
    checks.doPostV54RefsControlled = evaluateDoPostControlCheck_(source, services, errors);
    checks.doGetV54RefsAbsent = evaluateRouteRefCheck_(source, services, errors, 'doGet');
    checks.routingModeDefaultSafe = evaluateBooleanRoutingCheck_(source, errors, 'routingModeDefaultSafe', 'ROUTING_MODE_DEFAULT_UNSAFE', 'V54_ROUTING_MODE default/missing/invalid must resolve to V53_CURRENT.');
    checks.webhookAuthBeforeRouting = evaluateBooleanRoutingCheck_(source, errors, 'webhookAuthBeforeRouting', 'WEBHOOK_AUTH_ROUTING_ORDER_INVALID', 'Webhook authorization must run before V54 routing decisions.');
    checks.shadowNoV54Mutation = evaluateBooleanRoutingCheck_(source, errors, 'shadowNoV54Mutation', 'V54_SHADOW_MUTATION_PATH_DETECTED', 'V54 shadow mode must not mutate via V54 record path.');
    checks.shadowNoV54TelegramSend = evaluateBooleanRoutingCheck_(source, errors, 'shadowNoV54TelegramSend', 'V54_SHADOW_TELEGRAM_PATH_DETECTED', 'V54 shadow mode must not send Telegram from V54 path.');
    checks.primaryNoV53FallbackMutation = evaluateBooleanRoutingCheck_(source, errors, 'primaryNoV53FallbackMutation', 'V54_PRIMARY_V53_FALLBACK_DETECTED', 'V54 primary mode must not fallback-mutate through V53 handleEntry.');
    checks.evidenceEnvelopeValid = evaluateEvidenceEnvelopeCheck_(source, services, errors);
    checks.parserContextReadable = evaluateParserContextCheck_(source, services, errors);
    checks.spreadsheetDiagnosticsValid = evaluateSpreadsheetDiagnosticsCheck_(source, services, errors);

    const generatedAt = typeof services.now === 'function' ? services.now() : source.generatedAt;
    const report = {
        ok: errors.length === 0,
        mode: 'real_manual_preflight',
        checks,
        blockedActions: BLOCKED_ACTIONS.slice(),
        errors,
        evidenceSummary: {
            provided: isObject(source.evidence),
            validatorIntegrated: true,
        },
        diagnosticsSummary: {
            parserContextProvided: source.parserContextDiagnostics !== undefined,
            spreadsheetDiagnosticsProvided: source.spreadsheetDiagnostics !== undefined,
        },
    };

    if (generatedAt !== undefined) {
        report.generatedAt = generatedAt;
    }
    if (source.referenceDate !== undefined) {
        report.referenceDate = source.referenceDate;
    }

    return report;
}

function evaluateMainJsDiffCheck_(input, deps, errors) {
    const diagnostics = asObject(input.routingDiagnostics);
    const fromInput = diagnostics.mainJsDiffEmpty;
    if (typeof fromInput === 'boolean') {
        if (fromInput === true) return true;
        addError_(errors, 'MAIN_JS_DIFF_NOT_EMPTY', 'routingDiagnostics.mainJsDiffEmpty', 'src/Main.js routing drift must be empty.');
        return false;
    }

    if (typeof deps.getMainJsDiffStatus === 'function') {
        try {
            const result = deps.getMainJsDiffStatus();
            if (result === true || (isObject(result) && result.ok === true && result.empty === true)) return true;
            addError_(errors, 'MAIN_JS_DIFF_NOT_EMPTY', 'getMainJsDiffStatus', 'src/Main.js routing drift must be empty.');
            return false;
        } catch (error) {
            addError_(errors, 'MAIN_JS_DIFF_NOT_EMPTY', 'getMainJsDiffStatus', 'src/Main.js routing diagnostic failed safely.');
            return false;
        }
    }

    addError_(errors, 'MAIN_JS_DIFF_DIAGNOSTIC_MISSING', 'routingDiagnostics.mainJsDiffEmpty', 'Main.js diff diagnostic is required.');
    return false;
}

function evaluateRouteRefCheck_(input, deps, errors, route) {
    const diagnostics = asObject(input.routingDiagnostics);
    const field = route === 'doPost' ? 'doPostV54RefsControlled' : 'doGetV54RefsAbsent';
    const sourceField = route === 'doPost' ? 'doPostSource' : 'doGetSource';
    const depReader = route === 'doPost' ? deps.getDoPostSource : deps.getDoGetSource;
    const presentCode = route === 'doPost' ? 'DO_POST_V54_REFS_UNCONTROLLED' : 'DO_GET_V54_REFS_PRESENT';
    const missingCode = route === 'doPost' ? 'DO_POST_V54_REFS_CONTROL_DIAGNOSTIC_MISSING' : 'DO_GET_V54_REFS_DIAGNOSTIC_MISSING';

    if (typeof diagnostics[field] === 'boolean') {
        if (diagnostics[field] === true) return true;
        addError_(errors, presentCode, `routingDiagnostics.${field}`, route === 'doPost'
            ? 'doPost V54 references must be controlled by routing-mode guards.'
            : `${route} contains blocked V54 manual routing references.`);
        return false;
    }

    let routeSource = diagnostics[sourceField];
    if (routeSource === undefined && typeof depReader === 'function') {
        try {
            routeSource = depReader();
        } catch (error) {
            addError_(errors, missingCode, `routingDiagnostics.${sourceField}`, `${route} source diagnostic failed safely.`);
            return false;
        }
    }

    if (typeof routeSource !== 'string' || routeSource.trim() === '') {
        addError_(errors, missingCode, `routingDiagnostics.${sourceField}`, `${route} source or boolean diagnostic is required.`);
        return false;
    }

    const hasSuspicious = SUSPICIOUS_V54_ROUTING_TOKENS.some((token) => routeSource.indexOf(token) !== -1);
    if (hasSuspicious) {
        addError_(errors, presentCode, `routingDiagnostics.${sourceField}`, `${route} contains blocked V54 manual routing references.`);
        return false;
    }
    return true;
}

function evaluateDoPostControlCheck_(input, deps, errors) {
    return evaluateRouteRefCheck_(input, deps, errors, 'doPost');
}

function evaluateBooleanRoutingCheck_(input, errors, field, code, message) {
    const diagnostics = asObject(input.routingDiagnostics);
    if (diagnostics[field] === true) return true;
    addError_(errors, code, `routingDiagnostics.${field}`, message);
    return false;
}

function evaluateEvidenceEnvelopeCheck_(input, deps, errors) {
    if (!isObject(input.evidence)) {
        addError_(errors, 'EVIDENCE_ENVELOPE_MISSING', 'evidence', 'Evidence envelope is required.');
        return false;
    }

    const validator = typeof deps.validateEvidenceEnvelope === 'function'
        ? deps.validateEvidenceEnvelope
        : validateV54RealManualEvidenceEnvelope;

    try {
        const result = validator(input.evidence, { requiredSheets: Object.values(V54_SHEETS) });
        if (result && result.ok === true) return true;
        addError_(errors, 'EVIDENCE_ENVELOPE_INVALID', 'evidence', 'Evidence envelope failed canonical validation.', result && Array.isArray(result.errors) ? result.errors : []);
        return false;
    } catch (error) {
        addError_(errors, 'EVIDENCE_ENVELOPE_INVALID', 'evidence', 'Evidence envelope validation failed safely.');
        return false;
    }
}

function evaluateParserContextCheck_(input, deps, errors) {
    let diagnostics = input.parserContextDiagnostics;
    if (diagnostics === undefined && typeof deps.getParserContextDiagnostics === 'function') {
        try {
            diagnostics = deps.getParserContextDiagnostics();
        } catch (error) {
            addError_(errors, 'PARSER_CONTEXT_DIAGNOSTIC_FAILED', 'parserContextDiagnostics', 'Parser context diagnostic failed safely.');
            return false;
        }
    }

    if (diagnostics === undefined) {
        addError_(errors, 'PARSER_CONTEXT_DIAGNOSTIC_MISSING', 'parserContextDiagnostics', 'Parser context diagnostic object is required.');
        return false;
    }
    if (typeof diagnostics === 'boolean' || !isObject(diagnostics)) {
        addError_(errors, 'PARSER_CONTEXT_DIAGNOSTIC_INVALID', 'parserContextDiagnostics', 'Parser context diagnostic must be an executed object.');
        return false;
    }
    if (diagnostics.executed === true && diagnostics.ok === true && diagnostics.contextReadable === true) {
        return true;
    }

    if (diagnostics.ok === false) {
        addError_(errors, 'PARSER_CONTEXT_DIAGNOSTIC_FAILED', 'parserContextDiagnostics.ok', 'Parser context diagnostic returned ok:false.');
        return false;
    }

    addError_(errors, 'PARSER_CONTEXT_DIAGNOSTIC_INVALID', 'parserContextDiagnostics', 'Parser context diagnostic must include executed=true, ok=true, contextReadable=true.');
    return false;
}

function evaluateSpreadsheetDiagnosticsCheck_(input, deps, errors) {
    let diagnostics = input.spreadsheetDiagnostics;
    if (diagnostics === undefined && typeof deps.getSpreadsheetDiagnostics === 'function') {
        try {
            diagnostics = deps.getSpreadsheetDiagnostics();
        } catch (error) {
            addError_(errors, 'SPREADSHEET_DIAGNOSTICS_INVALID', 'spreadsheetDiagnostics', 'Spreadsheet diagnostics failed safely.');
            return false;
        }
    }

    if (diagnostics === undefined) {
        addError_(errors, 'SPREADSHEET_DIAGNOSTICS_MISSING', 'spreadsheetDiagnostics', 'Spreadsheet diagnostics are required.');
        return false;
    }

    if (typeof diagnostics === 'boolean' || !isObject(diagnostics)) {
        addError_(errors, 'SPREADSHEET_DIAGNOSTICS_INVALID', 'spreadsheetDiagnostics', 'Spreadsheet diagnostics must be an object.');
        return false;
    }

    const requiredSheets = Object.values(V54_SHEETS);
    const sheetNames = Array.isArray(diagnostics.requiredSheetNames) ? diagnostics.requiredSheetNames : [];
    const headerStatusBySheet = isObject(diagnostics.headerStatusBySheet) ? diagnostics.headerStatusBySheet : null;

    let ok = true;

    if (!sheetNames.includes(V54_SHEETS.IDEMPOTENCY_LOG)) {
        addError_(errors, 'IDEMPOTENCY_LOG_MISSING', 'spreadsheetDiagnostics.requiredSheetNames', 'Idempotency_Log must be present in spreadsheet diagnostics.');
        ok = false;
    }

    requiredSheets.forEach((sheetName) => {
        if (!sheetNames.includes(sheetName)) {
            addError_(errors, 'REQUIRED_V54_TAB_MISSING', `spreadsheetDiagnostics.requiredSheetNames.${sheetName}`, `Required V54 tab missing: ${sheetName}.`);
            ok = false;
        }
    });

    if (!headerStatusBySheet) {
        addError_(errors, 'REQUIRED_V54_HEADERS_INVALID', 'spreadsheetDiagnostics.headerStatusBySheet', 'Header diagnostics are required for all V54 tabs.');
        return false;
    }

    requiredSheets.forEach((sheetName) => {
        const headerStatus = headerStatusBySheet[sheetName];
        if (!isObject(headerStatus) || headerStatus.ok !== true) {
            addError_(errors, 'REQUIRED_V54_HEADERS_INVALID', `spreadsheetDiagnostics.headerStatusBySheet.${sheetName}`, `Required V54 headers invalid for ${sheetName}.`);
            ok = false;
        }
    });

    return ok;
}

function asObject(value) {
    return isObject(value) ? value : {};
}

function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function addError_(errors, code, field, message, details) {
    const item = {
        code: String(code),
        field: String(field || 'preflight'),
        message: String(message || 'real_manual preflight failed safely.'),
    };
    if (Array.isArray(details) && details.length > 0) {
        item.details = details;
    }
    errors.push(item);
}

module.exports = {
    BLOCKED_ACTIONS,
    buildV54RealManualPreflightReport,
};
