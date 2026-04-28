'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { V54_HEADERS, V54_SHEETS } = require('./lib/v54-schema');
const { validateV54RealManualEvidenceEnvelope } = require('./lib/v54-real-manual-evidence-contract');

const root = path.join(__dirname, '..');
const schemaSource = fs.readFileSync(path.join(root, 'src', '000_V54Schema.js'), 'utf8');
const policySource = fs.readFileSync(path.join(root, 'src', 'RunnerV54RealManualPolicy.js'), 'utf8');
const gateSource = fs.readFileSync(path.join(root, 'src', 'RunnerV54Gate.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'src', 'Main.js'), 'utf8');

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

function loadPolicy(extraSandbox) {
    const sandbox = Object.assign({ console, Date, JSON, String, Object, Array }, extraSandbox || {});
    vm.createContext(sandbox);
    vm.runInContext(`${schemaSource}\n${policySource}\nresult = { evaluateV54RealManualPolicy, evaluateRunnerV54RealManualPolicy, V54_REAL_MANUAL_REQUIRED_SHEETS, V54_REAL_MANUAL_HEADERS };`, sandbox);
    return sandbox.result;
}

function loadGateWithPolicy(extraSandbox) {
    const sandbox = Object.assign({ console, Date, Math, JSON, Number, String, Boolean, Object, Array, RegExp }, extraSandbox || {});
    vm.createContext(sandbox);
    vm.runInContext(`${schemaSource}\n${policySource}\n${gateSource}\nresult = { invokeV54ManualShadowGate, evaluateRunnerV54RealManualPolicy, V54_REAL_MANUAL_REQUIRED_SHEETS, V54_REAL_MANUAL_HEADERS };`, sandbox);
    return sandbox.result;
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
    }, overrides || {});
}

function options(overrides) {
    const source = overrides || {};
    const result = {
        getSpreadsheet: () => makeSpreadsheet(source.spreadsheet),
        now: () => '2026-04-27T22:00:00.000Z',
        validateEvidenceEnvelope: validateV54RealManualEvidenceEnvelope,
    };
    if (Object.prototype.hasOwnProperty.call(source, 'getSpreadsheet')) {
        result.getSpreadsheet = source.getSpreadsheet;
    }
    if (Object.prototype.hasOwnProperty.call(source, 'validateEvidenceEnvelope')) {
        result.validateEvidenceEnvelope = source.validateEvidenceEnvelope;
    }
    if (Object.prototype.hasOwnProperty.call(source, 'getParserContext')) {
        result.getParserContext = source.getParserContext;
    } else {
        result.getParserContext = () => ({ ok: true, context: { categories: [], fontes: [], cartoes: [] }, errors: [] });
    }
    return result;
}

function assertError(result, code, field) {
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((error) => {
        if (error.code !== code) return false;
        return field ? error.field === field : true;
    }), `Expected ${code}${field ? ` on ${field}` : ''}, got ${JSON.stringify(result.errors)}`);
}

function plainArray(values) {
    return Array.from(values || []);
}

let failed = 0;

failed += test('policy_required_sheets_match_canonical_schema_exactly', () => {
    const { V54_REAL_MANUAL_REQUIRED_SHEETS } = loadPolicy();
    const policySheets = plainArray(V54_REAL_MANUAL_REQUIRED_SHEETS);
    const schemaSheets = Object.values(V54_SHEETS);
    assert.deepStrictEqual(policySheets, schemaSheets);

    const policyOnly = policySheets.filter((sheetName) => !schemaSheets.includes(sheetName));
    const schemaOnly = schemaSheets.filter((sheetName) => !policySheets.includes(sheetName));
    assert.deepStrictEqual(policyOnly, [], `Extra policy sheets: ${policyOnly.join(', ')}`);
    assert.deepStrictEqual(schemaOnly, [], `Missing policy sheets: ${schemaOnly.join(', ')}`);
});

failed += test('policy_headers_match_canonical_schema_exactly_for_every_sheet', () => {
    const { V54_REAL_MANUAL_REQUIRED_SHEETS, V54_REAL_MANUAL_HEADERS } = loadPolicy();
    plainArray(V54_REAL_MANUAL_REQUIRED_SHEETS).forEach((sheetName) => {
        assert.deepStrictEqual(plainArray(V54_REAL_MANUAL_HEADERS[sheetName]), V54_HEADERS[sheetName], `${sheetName} headers drifted`);
    });
    Object.values(V54_SHEETS).forEach((sheetName) => {
        assert.ok(Object.prototype.hasOwnProperty.call(V54_REAL_MANUAL_HEADERS, sheetName), `${sheetName} missing from policy headers`);
    });
});



failed += test('real_manual_valid_evidence_passes', () => {
    const { evaluateV54RealManualPolicy } = loadPolicy();
    const result = evaluateV54RealManualPolicy(input(), options());
    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.ok(result.diagnostics.passed.includes('evidence_envelope_valid'));
});

failed += test('real_manual_missing_validateEvidenceEnvelope_fails', () => {
    const { evaluateV54RealManualPolicy } = loadPolicy();
    const result = evaluateV54RealManualPolicy(input(), options({ validateEvidenceEnvelope: null }));
    assertError(result, 'V54_REAL_MANUAL_EVIDENCE_DIAGNOSTIC_REQUIRED', 'validateEvidenceEnvelope');
});

failed += test('real_manual_missing_evidence_fails', () => {
    const { evaluateV54RealManualPolicy } = loadPolicy();
    const result = evaluateV54RealManualPolicy(input({ evidence: null }), options());
    assertError(result, 'V54_REAL_MANUAL_EVIDENCE_INVALID', 'evidence');
});

failed += test('evidence_contract_valid_envelope_passes', () => {
    const result = validateV54RealManualEvidenceEnvelope(evidence(), { requiredSheets: Object.values(V54_SHEETS) });
    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
});

failed += test('evidence_contract_missing_operator_fails', () => {
    const result = validateV54RealManualEvidenceEnvelope(evidence({ operatorLabel: '' }), { requiredSheets: Object.values(V54_SHEETS) });
    assertError(result, 'V54_REAL_MANUAL_EVIDENCE_OPERATOR_REQUIRED', 'operator');
});

failed += test('evidence_contract_missing_commit_marker_fails', () => {
    const result = validateV54RealManualEvidenceEnvelope(evidence({ localCommitMarker: '', commitSha: '' }), { requiredSheets: Object.values(V54_SHEETS) });
    assertError(result, 'V54_REAL_MANUAL_EVIDENCE_COMMIT_MARKER_REQUIRED', 'commit');
});

failed += test('evidence_contract_main_js_diff_false_fails', () => {
    const result = validateV54RealManualEvidenceEnvelope(evidence({ mainJsDiffEmpty: false }), { requiredSheets: Object.values(V54_SHEETS) });
    assertError(result, 'V54_REAL_MANUAL_EVIDENCE_MAIN_DIFF_REQUIRED', 'mainJsDiffEmpty');
});

failed += test('evidence_contract_doPost_v54_refs_present_fails', () => {
    const result = validateV54RealManualEvidenceEnvelope(evidence({ doPostV54RefsControlled: false }), { requiredSheets: Object.values(V54_SHEETS) });
    assertError(result, 'V54_REAL_MANUAL_EVIDENCE_DOPOST_CONTROL_REQUIRED', 'doPostV54RefsControlled');
});

failed += test('evidence_contract_doGet_v54_refs_present_fails', () => {
    const result = validateV54RealManualEvidenceEnvelope(evidence({ doGetV54RefsAbsent: false }), { requiredSheets: Object.values(V54_SHEETS) });
    assertError(result, 'V54_REAL_MANUAL_EVIDENCE_DOGET_REFS_REQUIRED', 'doGetV54RefsAbsent');
});

failed += test('evidence_contract_missing_prior_dry_run_object_fails', () => {
    const result = validateV54RealManualEvidenceEnvelope(evidence({ priorDryRun: true }), { requiredSheets: Object.values(V54_SHEETS) });
    assertError(result, 'V54_REAL_MANUAL_EVIDENCE_PRIOR_DRY_RUN_REQUIRED', 'priorDryRun');
});

failed += test('evidence_contract_missing_snapshot_object_fails', () => {
    const result = validateV54RealManualEvidenceEnvelope(evidence({ snapshotExport: false }), { requiredSheets: Object.values(V54_SHEETS) });
    assertError(result, 'V54_REAL_MANUAL_EVIDENCE_SNAPSHOT_REQUIRED', 'snapshotExport');
});

failed += test('evidence_contract_parser_context_boolean_only_fails', () => {
    const result = validateV54RealManualEvidenceEnvelope(evidence({ parserContextDiagnostics: true }), { requiredSheets: Object.values(V54_SHEETS) });
    assertError(result, 'V54_REAL_MANUAL_EVIDENCE_PARSER_CONTEXT_BOOLEAN_REJECTED', 'parserContextDiagnostics');
});

failed += test('evidence_contract_spreadsheet_missing_idempotency_log_fails', () => {
    const envelope = evidence();
    envelope.spreadsheetDiagnostics.requiredSheetNames = envelope.spreadsheetDiagnostics.requiredSheetNames.filter((name) => name !== V54_SHEETS.IDEMPOTENCY_LOG);
    delete envelope.spreadsheetDiagnostics.headerStatusBySheet[V54_SHEETS.IDEMPOTENCY_LOG];
    const result = validateV54RealManualEvidenceEnvelope(envelope, { requiredSheets: Object.values(V54_SHEETS) });
    assertError(result, 'V54_REAL_MANUAL_EVIDENCE_REQUIRED_SHEET_MISSING', `spreadsheetDiagnostics.requiredSheetNames.${V54_SHEETS.IDEMPOTENCY_LOG}`);
});

failed += test('evidence_contract_header_mismatch_fails', () => {
    const envelope = evidence();
    envelope.spreadsheetDiagnostics.headerStatusBySheet[V54_SHEETS.LANCAMENTOS_V54] = { ok: false, hasExtraColumns: false };
    const result = validateV54RealManualEvidenceEnvelope(envelope, { requiredSheets: Object.values(V54_SHEETS) });
    assertError(result, 'V54_REAL_MANUAL_EVIDENCE_HEADER_MISMATCH', `spreadsheetDiagnostics.headerStatusBySheet.${V54_SHEETS.LANCAMENTOS_V54}.ok`);
});

failed += test('evidence_contract_ambiguous_extra_columns_without_policy_fails', () => {
    const envelope = evidence();
    delete envelope.spreadsheetDiagnostics.allowExtraColumns;
    envelope.spreadsheetDiagnostics.headerStatusBySheet[V54_SHEETS.CONFIG_CATEGORIAS] = { ok: true, hasExtraColumns: true };
    const result = validateV54RealManualEvidenceEnvelope(envelope, { requiredSheets: Object.values(V54_SHEETS) });
    assertError(result, 'V54_REAL_MANUAL_EVIDENCE_SPREADSHEET_ALLOW_EXTRA_REQUIRED', 'spreadsheetDiagnostics.allowExtraColumns');
});

failed += test('evidence_contract_forbidden_actions_failure_blocks', () => {
    const result = validateV54RealManualEvidenceEnvelope(evidence({ forbiddenActions: { noClaspDeploySetupSeed: true, noTelegram: true, noRealOpenAI: false, noRealSpreadsheetAppInTests: true } }), { requiredSheets: Object.values(V54_SHEETS) });
    assertError(result, 'V54_REAL_MANUAL_EVIDENCE_FORBIDDEN_OPENAI_REQUIRED', 'forbiddenActions.noRealOpenAI');
});

failed += test('real_manual_invalid_evidence_fails', () => {
    let calls = 0;
    const { invokeV54ManualShadowGate } = loadGateWithPolicy();
    const result = invokeV54ManualShadowGate(input({ evidence: evidence({ mainJsDiffEmpty: false }) }), {
        runV54ManualShadow() {
            calls += 1;
            return { ok: true };
        },
        realManualPolicyOptions: options(),
    });
    assertError(result, 'V54_REAL_MANUAL_EVIDENCE_INVALID', 'evidence');
    assert.strictEqual(calls, 0);
});

failed += test('missing_operator_fails', () => {
    const { evaluateV54RealManualPolicy } = loadPolicy();
    const result = evaluateV54RealManualPolicy(input({ checklist: checklist({ operatorLabel: '' }) }), options());
    assertError(result, 'V54_REAL_MANUAL_OPERATOR_REQUIRED', 'checklist.operator');
});

failed += test('missing_real_run_approved_fails', () => {
    const { evaluateV54RealManualPolicy } = loadPolicy();
    const result = evaluateV54RealManualPolicy(input({ checklist: checklist({ realRunApproved: false }) }), options());
    assertError(result, 'V54_REAL_MANUAL_APPROVAL_REQUIRED', 'checklist.realRunApproved');
});

failed += test('missing_prior_dry_run_acknowledgement_fails', () => {
    const { evaluateV54RealManualPolicy } = loadPolicy();
    const result = evaluateV54RealManualPolicy(input({ checklist: checklist({ priorDryRunAcknowledged: false, fakeShadowExecutedFirst: false }) }), options());
    assertError(result, 'V54_REAL_MANUAL_PRIOR_DRY_RUN_REQUIRED', 'checklist.priorDryRunAcknowledged');
});

failed += test('missing_snapshot_acknowledgement_fails', () => {
    const { evaluateV54RealManualPolicy } = loadPolicy();
    const result = evaluateV54RealManualPolicy(input({ checklist: checklist({ snapshotAcknowledged: false, snapshotExportAcknowledged: false }) }), options());
    assertError(result, 'V54_REAL_MANUAL_SNAPSHOT_ACK_REQUIRED', 'checklist.snapshotAcknowledged');
});

failed += test('web_event_shaped_input_fails', () => {
    const { evaluateV54RealManualPolicy } = loadPolicy();
    const result = evaluateV54RealManualPolicy(input({ update: { postData: { contents: '{}' }, message: update().message } }), options());
    assertError(result, 'V54_REAL_MANUAL_WEB_EVENT_REJECTED', 'update');
});

failed += test('missing_required_sheet_diagnostic_fails', () => {
    const { evaluateV54RealManualPolicy } = loadPolicy();
    const result = evaluateV54RealManualPolicy(input(), options({ spreadsheet: { missingSheet: V54_SHEETS.IDEMPOTENCY_LOG } }));
    assertError(result, 'V54_REAL_MANUAL_REQUIRED_SHEET_MISSING', V54_SHEETS.IDEMPOTENCY_LOG);
});

failed += test('header_mismatch_diagnostic_fails', () => {
    const { evaluateV54RealManualPolicy } = loadPolicy();
    const result = evaluateV54RealManualPolicy(input(), options({ spreadsheet: { headerMismatch: V54_SHEETS.LANCAMENTOS_V54 } }));
    assertError(result, 'V54_REAL_MANUAL_HEADER_MISMATCH', V54_SHEETS.LANCAMENTOS_V54);
});

failed += test('parser_context_boolean_ack_without_injected_getParserContext_fails', () => {
    let calls = 0;
    const { invokeV54ManualShadowGate } = loadGateWithPolicy();
    const result = invokeV54ManualShadowGate(input({
        diagnostics: { parserContextReadable: true },
    }), {
        runV54ManualShadow() {
            calls += 1;
            return { ok: true };
        },
        realManualPolicyOptions: options({ getParserContext: null }),
    });
    assertError(result, 'V54_REAL_MANUAL_PARSER_CONTEXT_DIAGNOSTIC_REQUIRED', 'getParserContext');
    assert.strictEqual(calls, 0);
});

failed += test('missing_getParserContext_fails', () => {
    let calls = 0;
    const { invokeV54ManualShadowGate } = loadGateWithPolicy();
    const result = invokeV54ManualShadowGate(input(), {
        runV54ManualShadow() {
            calls += 1;
            return { ok: true };
        },
        realManualPolicyOptions: options({ getParserContext: null }),
    });
    assertError(result, 'V54_REAL_MANUAL_PARSER_CONTEXT_DIAGNOSTIC_REQUIRED', 'getParserContext');
    assert.strictEqual(calls, 0);
});

failed += test('getParserContext_throwing_fails', () => {
    let calls = 0;
    const { invokeV54ManualShadowGate } = loadGateWithPolicy();
    const result = invokeV54ManualShadowGate(input(), {
        runV54ManualShadow() {
            calls += 1;
            return { ok: true };
        },
        realManualPolicyOptions: options({
            getParserContext() {
                throw new Error('context failed');
            },
        }),
    });
    assertError(result, 'V54_REAL_MANUAL_PARSER_CONTEXT_UNREADABLE', 'getParserContext');
    assert.strictEqual(calls, 0);
});

failed += test('getParserContext_ok_false_fails', () => {
    let calls = 0;
    const { invokeV54ManualShadowGate } = loadGateWithPolicy();
    const result = invokeV54ManualShadowGate(input(), {
        runV54ManualShadow() {
            calls += 1;
            return { ok: true };
        },
        realManualPolicyOptions: options({
            getParserContext() {
                return { ok: false, context: null, errors: [{ code: 'FAKE_CONTEXT_FAILED' }] };
            },
        }),
    });
    assertError(result, 'V54_REAL_MANUAL_PARSER_CONTEXT_UNREADABLE', 'getParserContext');
    assert.strictEqual(calls, 0);
});

failed += test('valid_fake_diagnostics_pass', () => {
    const { evaluateV54RealManualPolicy } = loadPolicy();
    const result = evaluateV54RealManualPolicy(input(), options());
    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.status, 'real_manual_policy_passed');
    assert.ok(result.diagnostics.passed.includes(`sheet_present:${V54_SHEETS.IDEMPOTENCY_LOG}`));
    assert.ok(result.diagnostics.passed.includes(`headers_match:${V54_SHEETS.LANCAMENTOS_V54}`));
    assert.ok(result.diagnostics.passed.includes('parser_context_readable'));
});

failed += test('policy_result_can_be_consumed_by_runner_gate_for_real_manual', () => {
    const calls = [];
    const { invokeV54ManualShadowGate } = loadGateWithPolicy();
    const result = invokeV54ManualShadowGate(input({ runnerOptions: { fake: true } }), {
        runV54ManualShadow(updateArg, optionsArg) {
            calls.push({ update: updateArg, options: optionsArg });
            return { ok: true, status: 'recorded', errors: [] };
        },
        realManualPolicyOptions: options(),
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.status, 'gate_runner_completed');
    assert.strictEqual(result.mode, 'real_manual');
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(result.gate.realManualPolicy.ok, true);
});

failed += test('gate_does_not_call_runner_when_evidence_validator_missing', () => {
    let calls = 0;
    const { invokeV54ManualShadowGate } = loadGateWithPolicy();
    const result = invokeV54ManualShadowGate(input(), {
        runV54ManualShadow() {
            calls += 1;
            return { ok: true, status: 'recorded', errors: [] };
        },
        realManualPolicyOptions: options({ validateEvidenceEnvelope: null }),
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 'gate_real_manual_policy_blocked');
    assertError(result, 'V54_REAL_MANUAL_EVIDENCE_DIAGNOSTIC_REQUIRED', 'validateEvidenceEnvelope');
    assert.strictEqual(calls, 0);
});

failed += test('gate_does_not_call_runner_when_evidence_missing', () => {
    let calls = 0;
    const { invokeV54ManualShadowGate } = loadGateWithPolicy();
    const result = invokeV54ManualShadowGate(input({ evidence: null }), {
        runV54ManualShadow() {
            calls += 1;
            return { ok: true, status: 'recorded', errors: [] };
        },
        realManualPolicyOptions: options(),
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 'gate_real_manual_policy_blocked');
    assertError(result, 'V54_REAL_MANUAL_EVIDENCE_INVALID', 'evidence');
    assert.strictEqual(calls, 0);
});

failed += test('main_doPost_and_doGet_remain_unchanged_for_v54_policy', () => {
    assert.strictEqual(mainSource.includes('evaluateV54RealManualPolicy'), false);
    assert.strictEqual(mainSource.includes('evaluateRunnerV54RealManualPolicy'), false);
    assert.strictEqual(mainSource.includes('invokeV54ManualShadowGate'), false);
    assert.strictEqual(mainSource.includes('runV54ManualShadowGate'), false);
    assert.strictEqual(mainSource.includes('runV54ManualShadow'), false);
    assert.strictEqual(mainSource.includes('handleTelegramUpdateV54'), true);
    assert.strictEqual(mainSource.includes('routeV54PrimaryEntry_('), true);
    assert.strictEqual(mainSource.includes('runV54ShadowDiagnostics_('), true);
    assert.strictEqual(mainSource.includes('recordEntryV54ShadowNoWrite_'), true);
    assert.strictEqual(mainSource.includes('handleEntry(text, chatId, user)'), true);
    assert.strictEqual(mainSource.includes('handleCommand(text, chatId, user)'), true);
});

failed += test('policy_src_is_apps_script_compatible_and_has_no_forbidden_side_effect_clients', () => {
    assert.strictEqual(/\brequire\s*\(/.test(policySource), false);
    assert.strictEqual(policySource.includes('module.exports'), false);
    ['sendTelegram', 'UrlFetchApp', 'SpreadsheetApp', 'clasp', 'deploy', 'applySetupV54', 'applySeedV54'].forEach((needle) => {
        assert.strictEqual(policySource.includes(needle), false, `${needle} should not appear`);
    });
    assert.doesNotThrow(() => new Function(policySource));
});

if (failed > 0) {
    console.error(`\n${failed} V54 real_manual policy check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll V54 real_manual policy checks passed.');
}
