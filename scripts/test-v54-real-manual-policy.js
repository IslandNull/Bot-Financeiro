'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { V54_HEADERS, V54_SHEETS } = require('./lib/v54-schema');

const root = path.join(__dirname, '..');
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
    vm.runInContext(`${policySource}\nresult = { evaluateV54RealManualPolicy, evaluateRunnerV54RealManualPolicy, V54_REAL_MANUAL_REQUIRED_SHEETS, V54_REAL_MANUAL_HEADERS };`, sandbox);
    return sandbox.result;
}

function loadGateWithPolicy(extraSandbox) {
    const sandbox = Object.assign({ console, Date, Math, JSON, Number, String, Boolean, Object, Array, RegExp }, extraSandbox || {});
    vm.createContext(sandbox);
    vm.runInContext(`${policySource}\n${gateSource}\nresult = { invokeV54ManualShadowGate, evaluateRunnerV54RealManualPolicy, V54_REAL_MANUAL_REQUIRED_SHEETS, V54_REAL_MANUAL_HEADERS };`, sandbox);
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

function input(overrides) {
    return Object.assign({
        mode: 'real_manual',
        checklist: checklist(),
        update: update(),
        diagnostics: {},
    }, overrides || {});
}

function options(overrides) {
    const source = overrides || {};
    const result = {
        getSpreadsheet: () => makeSpreadsheet(source.spreadsheet),
        now: () => '2026-04-27T22:00:00.000Z',
    };
    if (Object.prototype.hasOwnProperty.call(source, 'getSpreadsheet')) {
        result.getSpreadsheet = source.getSpreadsheet;
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

failed += test('gate_real_manual_without_policy_options_blocks_runner', () => {
    let calls = 0;
    const { invokeV54ManualShadowGate } = loadGateWithPolicy();
    const result = invokeV54ManualShadowGate(input(), {
        runV54ManualShadow() {
            calls += 1;
            return { ok: true, status: 'recorded', errors: [] };
        },
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 'gate_real_manual_policy_blocked');
    assertError(result, 'V54_REAL_MANUAL_SPREADSHEET_DIAGNOSTIC_REQUIRED', 'getSpreadsheet');
    assert.strictEqual(calls, 0);
});

failed += test('main_doPost_and_doGet_remain_unchanged_for_v54_policy', () => {
    assert.strictEqual(mainSource.includes('evaluateV54RealManualPolicy'), false);
    assert.strictEqual(mainSource.includes('evaluateRunnerV54RealManualPolicy'), false);
    assert.strictEqual(mainSource.includes('invokeV54ManualShadowGate'), false);
    assert.strictEqual(mainSource.includes('runV54ManualShadowGate'), false);
    assert.strictEqual(mainSource.includes('runV54ManualShadow'), false);
    assert.strictEqual(mainSource.includes('handleTelegramUpdateV54'), false);
    assert.strictEqual(mainSource.includes('recordEntryV54'), false);
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
