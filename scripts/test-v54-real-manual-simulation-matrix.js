'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { V54_HEADERS, V54_SHEETS } = require('./lib/v54-schema');
const { validateV54RealManualEvidenceEnvelope } = require('./lib/v54-real-manual-evidence-contract');

const root = path.join(__dirname, '..');
const gateSource = fs.readFileSync(path.join(root, 'src', 'RunnerV54Gate.js'), 'utf8');
const policySource = fs.readFileSync(path.join(root, 'src', 'RunnerV54RealManualPolicy.js'), 'utf8');

function test(name, fn) {
    try {
        fn();
        console.log(`PASS ${name}`);
        return 0;
    } catch (error) {
        console.error(`FAIL ${name} - ${error.message}`);
        return 1;
    }
}

function loadGateWithPolicy(extraSandbox) {
    const sandbox = Object.assign({ console, Date, Math, JSON, Number, String, Boolean, Object, Array, RegExp }, extraSandbox || {});
    vm.createContext(sandbox);
    vm.runInContext(`${policySource}\n${gateSource}\nresult = { invokeV54ManualShadowGate };`, sandbox);
    return sandbox.result;
}

function checklist(overrides) {
    return Object.assign({
        reviewed: true,
        manualOnly: true,
        doPostUnchanged: true,
        doGetV54GateNotExposed: true,
        telegramSendDisabled: true,
        realRunApproved: true,
        operatorLabel: 'local-reviewer',
        syntheticManualInput: true,
        priorDryRunAcknowledged: true,
        snapshotAcknowledged: true,
    }, overrides || {});
}

function update(overrides) {
    return Object.assign({
        synthetic_manual: true,
        update_id: 'manual-91001',
        message: {
            message_id: 'manual-77001',
            chat: { id: 123456 },
            text: '50 mercado',
        },
    }, overrides || {});
}

function makeSheet(headers) {
    return {
        getRange(row, column, numRows, numColumns) {
            return {
                getValues() {
                    assert.strictEqual(row, 1);
                    assert.strictEqual(column, 1);
                    assert.strictEqual(numRows, 1);
                    return [Array.from({ length: numColumns }, (_, index) => headers[index] || '')];
                },
            };
        },
    };
}

function makeSpreadsheet(overrides) {
    const source = overrides || {};
    return {
        getSheetByName(name) {
            if (source.missingSheet === name) return null;
            const headers = [...V54_HEADERS[name]];
            if (source.headerMismatch === name) headers[0] = `${headers[0]}_BROKEN`;
            return makeSheet(headers);
        },
    };
}

function evidence(overrides) {
    const requiredSheetNames = Object.values(V54_SHEETS);
    const headerStatusBySheet = {};
    requiredSheetNames.forEach((sheetName) => {
        headerStatusBySheet[sheetName] = { ok: true, hasExtraColumns: false };
    });

    return Object.assign({
        operatorLabel: 'local-reviewer',
        timestamp: '2026-04-28T00:00:00.000Z',
        referenceDate: '2026-04-27',
        branchName: 'work',
        localCommitMarker: 'LOCAL_ONLY',
        mainJsDiffEmpty: true,
        doPostV54RefsControlled: true,
        doGetV54RefsAbsent: true,
        telegramSendDisabled: true,
        priorDryRun: { id: 'dry-run-001' },
        priorFakeShadow: { id: 'fake-shadow-001' },
        snapshotExport: { id: 'snapshot-001' },
        spreadsheetDiagnostics: {
            requiredSheetNames,
            allowExtraColumns: false,
            headerStatusBySheet,
        },
        parserContextDiagnostics: {
            ran: true,
            ok: true,
            referenceDate: '2026-04-27',
        },
        forbiddenActions: {
            noClaspDeploySetupSeed: true,
            noTelegram: true,
            noRealOpenAI: true,
            noRealSpreadsheetAppInTests: true,
        },
    }, overrides || {});
}

function input(overrides) {
    return Object.assign({
        mode: 'real_manual',
        checklist: checklist(),
        update: update(),
        diagnostics: {},
        evidence: evidence(),
        runnerOptions: { fake: true },
    }, overrides || {});
}

function options(overrides) {
    const source = overrides || {};
    const result = {
        getSpreadsheet: () => makeSpreadsheet(source.spreadsheet),
        now: () => '2026-04-27T22:00:00.000Z',
        validateEvidenceEnvelope: validateV54RealManualEvidenceEnvelope,
        getParserContext: () => ({ ok: true, context: { categories: [], fontes: [], cartoes: [] }, errors: [] }),
    };

    if (Object.prototype.hasOwnProperty.call(source, 'getSpreadsheet')) result.getSpreadsheet = source.getSpreadsheet;
    if (Object.prototype.hasOwnProperty.call(source, 'validateEvidenceEnvelope')) result.validateEvidenceEnvelope = source.validateEvidenceEnvelope;
    if (Object.prototype.hasOwnProperty.call(source, 'getParserContext')) result.getParserContext = source.getParserContext;

    return result;
}

function assertError(result, code, field) {
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((error) => {
        if (error.code !== code) return false;
        return field ? error.field === field : true;
    }), `Expected ${code}${field ? ` on ${field}` : ''}, got ${JSON.stringify(result.errors)}`);
}

function assertRunnerBlocked(caseInput, policyOptions, expectedCode, expectedField) {
    let calls = 0;
    const { invokeV54ManualShadowGate } = loadGateWithPolicy();
    const result = invokeV54ManualShadowGate(caseInput, {
        runV54ManualShadow() {
            calls += 1;
            return { ok: true, status: 'recorded', errors: [] };
        },
        realManualPolicyOptions: policyOptions,
    });
    assert.strictEqual(result.status, 'gate_real_manual_policy_blocked');
    assertError(result, expectedCode, expectedField);
    assert.strictEqual(calls, 0);
}

let failed = 0;

failed += test('matrix_pass_real_manual_valid_contract_calls_runner_once', () => {
    let calls = 0;
    const { invokeV54ManualShadowGate } = loadGateWithPolicy();
    const result = invokeV54ManualShadowGate(input(), {
        runV54ManualShadow() {
            calls += 1;
            return { ok: true, status: 'recorded', errors: [] };
        },
        realManualPolicyOptions: options(),
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.status, 'gate_runner_completed');
    assert.strictEqual(calls, 1);
    const passed = result.gate.realManualPolicy.result.diagnostics.passed;
    assert.ok(passed.includes('evidence_envelope_valid'));
    assert.ok(passed.includes('parser_context_readable'));
});

failed += test('matrix_blocked_missing_validateEvidenceEnvelope', () => {
    assertRunnerBlocked(input(), options({ validateEvidenceEnvelope: null }), 'V54_REAL_MANUAL_EVIDENCE_DIAGNOSTIC_REQUIRED', 'validateEvidenceEnvelope');
});

failed += test('matrix_blocked_missing_input_evidence', () => {
    assertRunnerBlocked(input({ evidence: null }), options(), 'V54_REAL_MANUAL_EVIDENCE_INVALID', 'evidence');
});

failed += test('matrix_blocked_invalid_evidence_mainJsDiffEmpty_false', () => {
    assertRunnerBlocked(input({ evidence: evidence({ mainJsDiffEmpty: false }) }), options(), 'V54_REAL_MANUAL_EVIDENCE_INVALID', 'evidence');
});

failed += test('matrix_blocked_invalid_evidence_doPostV54RefsControlled_false', () => {
    assertRunnerBlocked(input({ evidence: evidence({ doPostV54RefsControlled: false }) }), options(), 'V54_REAL_MANUAL_EVIDENCE_INVALID', 'evidence');
});

failed += test('matrix_blocked_invalid_evidence_doGetV54RefsAbsent_false', () => {
    assertRunnerBlocked(input({ evidence: evidence({ doGetV54RefsAbsent: false }) }), options(), 'V54_REAL_MANUAL_EVIDENCE_INVALID', 'evidence');
});

failed += test('matrix_blocked_invalid_evidence_parser_context_boolean_only', () => {
    assertRunnerBlocked(input({ evidence: evidence({ parserContextDiagnostics: true }) }), options(), 'V54_REAL_MANUAL_EVIDENCE_INVALID', 'evidence');
});

failed += test('matrix_blocked_invalid_evidence_missing_idempotency_log', () => {
    const envelope = evidence();
    envelope.spreadsheetDiagnostics.requiredSheetNames = envelope.spreadsheetDiagnostics.requiredSheetNames.filter((name) => name !== V54_SHEETS.IDEMPOTENCY_LOG);
    delete envelope.spreadsheetDiagnostics.headerStatusBySheet[V54_SHEETS.IDEMPOTENCY_LOG];
    assertRunnerBlocked(input({ evidence: envelope }), options(), 'V54_REAL_MANUAL_EVIDENCE_INVALID', 'evidence');
});

failed += test('matrix_blocked_invalid_evidence_forbidden_action_confirmation_fails', () => {
    assertRunnerBlocked(input({ evidence: evidence({ forbiddenActions: { noClaspDeploySetupSeed: true, noTelegram: true, noRealOpenAI: false, noRealSpreadsheetAppInTests: true } }) }), options(), 'V54_REAL_MANUAL_EVIDENCE_INVALID', 'evidence');
});

failed += test('matrix_blocked_missing_getParserContext', () => {
    assertRunnerBlocked(input(), options({ getParserContext: null }), 'V54_REAL_MANUAL_PARSER_CONTEXT_DIAGNOSTIC_REQUIRED', 'getParserContext');
});

failed += test('matrix_blocked_getParserContext_throws', () => {
    assertRunnerBlocked(input(), options({ getParserContext() { throw new Error('boom'); } }), 'V54_REAL_MANUAL_PARSER_CONTEXT_UNREADABLE', 'getParserContext');
});

failed += test('matrix_blocked_getParserContext_ok_false', () => {
    assertRunnerBlocked(input(), options({ getParserContext() { return { ok: false, errors: [{ code: 'FAKE' }] }; } }), 'V54_REAL_MANUAL_PARSER_CONTEXT_UNREADABLE', 'getParserContext');
});

failed += test('matrix_blocked_missing_getSpreadsheet', () => {
    assertRunnerBlocked(input(), options({ getSpreadsheet: null }), 'V54_REAL_MANUAL_SPREADSHEET_DIAGNOSTIC_REQUIRED', 'getSpreadsheet');
});

failed += test('matrix_blocked_missing_required_sheet_in_fake_spreadsheet', () => {
    assertRunnerBlocked(input(), options({ spreadsheet: { missingSheet: V54_SHEETS.IDEMPOTENCY_LOG } }), 'V54_REAL_MANUAL_REQUIRED_SHEET_MISSING', V54_SHEETS.IDEMPOTENCY_LOG);
});

failed += test('matrix_blocked_header_mismatch_in_fake_spreadsheet', () => {
    assertRunnerBlocked(input(), options({ spreadsheet: { headerMismatch: V54_SHEETS.LANCAMENTOS_V54 } }), 'V54_REAL_MANUAL_HEADER_MISMATCH', V54_SHEETS.LANCAMENTOS_V54);
});

failed += test('matrix_blocked_web_event_shaped_input', () => {
    assertRunnerBlocked(input({ update: { postData: { contents: '{}' }, message: update().message } }), options(), 'V54_REAL_MANUAL_WEB_EVENT_REJECTED', 'update');
});

failed += test('matrix_mode_dry_run_validates_gate_without_runner_call', () => {
    let calls = 0;
    const { invokeV54ManualShadowGate } = loadGateWithPolicy();
    const result = invokeV54ManualShadowGate(input({ mode: 'dry_run', update: undefined }), {
        runV54ManualShadow() {
            calls += 1;
            return { ok: true, status: 'recorded', errors: [] };
        },
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.status, 'gate_dry_run_passed');
    assert.strictEqual(calls, 0);
});

failed += test('matrix_mode_fake_shadow_unchanged_no_real_manual_policy_required', () => {
    let calls = 0;
    const { invokeV54ManualShadowGate } = loadGateWithPolicy();
    const result = invokeV54ManualShadowGate(input({ mode: 'fake_shadow' }), {
        runV54ManualShadow() {
            calls += 1;
            return { ok: true, status: 'recorded', errors: [] };
        },
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.status, 'gate_runner_completed');
    assert.strictEqual(calls, 1);
});

if (failed > 0) {
    console.error(`\n${failed} V54 real_manual simulation matrix check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll V54 real_manual simulation matrix checks passed.');
}
