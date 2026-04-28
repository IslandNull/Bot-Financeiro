'use strict';

const assert = require('assert');

const { V54_SHEETS } = require('./lib/v54-schema');
const { BLOCKED_ACTIONS } = require('./lib/v54-real-manual-preflight-report');
const {
    collectV54RealManualPreflightDiagnostics,
    FORBIDDEN_RUNTIME_TOKENS,
} = require('./lib/v54-real-manual-preflight-diagnostics-collector');

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

function hasError(result, code) {
    return result.collectorDiagnostics.errors.some((error) => error.code === code)
        || (result.preflightReport && Array.isArray(result.preflightReport.errors)
            && result.preflightReport.errors.some((error) => error.code === code));
}

function makeSpreadsheetDiagnostics(overrides) {
    const requiredSheetNames = Object.values(V54_SHEETS);
    const headerStatusBySheet = {};
    requiredSheetNames.forEach((sheetName) => {
        headerStatusBySheet[sheetName] = { ok: true };
    });

    return Object.assign({
        requiredSheetNames,
        headerStatusBySheet,
    }, overrides || {});
}

function makeEvidence(overrides) {
    const requiredSheetNames = Object.values(V54_SHEETS);
    const headerStatusBySheet = {};
    requiredSheetNames.forEach((sheetName) => {
        headerStatusBySheet[sheetName] = { ok: true, hasExtraColumns: false };
    });

    return Object.assign({
        operatorLabel: 'collector-reviewer',
        timestamp: '2026-04-28T00:00:00.000Z',
        referenceDate: '2026-04-28',
        branchName: 'work',
        localCommitMarker: 'LOCAL_ONLY',
        mainJsDiffEmpty: true,
        doPostV54RefsAbsent: true,
        doGetV54RefsAbsent: true,
        telegramSendDisabled: true,
        priorDryRun: { id: 'dry-run-collector-001' },
        priorFakeShadow: { id: 'fake-shadow-collector-001' },
        snapshotExport: { id: 'snapshot-collector-001' },
        spreadsheetDiagnostics: {
            requiredSheetNames,
            allowExtraColumns: false,
            headerStatusBySheet,
        },
        parserContextDiagnostics: {
            ran: true,
            ok: true,
            referenceDate: '2026-04-28',
        },
        forbiddenActions: {
            noClaspDeploySetupSeed: true,
            noTelegram: true,
            noRealOpenAI: true,
            noRealSpreadsheetAppInTests: true,
        },
    }, overrides || {});
}

function makeInput(overrides) {
    return Object.assign({
        referenceDate: '2026-04-28',
        routingDiagnostics: { mainJsDiffEmpty: true },
        evidence: makeEvidence(),
        parserContextDiagnostics: {
            executed: true,
            ok: true,
            contextReadable: true,
        },
        spreadsheetDiagnostics: makeSpreadsheetDiagnostics(),
    }, overrides || {});
}

function safeMainSource() {
    return [
        'function helper() { return 1; }',
        'function doPost(e) {',
        '  const text = "safe";',
        '  if (e && e.postData) { return text; }',
        '  return text;',
        '}',
        'function doGet(e) {',
        '  const action = e && e.parameter ? e.parameter.action : "exportState";',
        '  return action;',
        '}',
    ].join('\n');
}

let failed = 0;

failed += test('happy_path_with_safe_fake_main_source', () => {
    const result = collectV54RealManualPreflightDiagnostics(makeInput(), {
        readTextFile: () => safeMainSource(),
        now: () => '2026-04-28T12:00:00.000Z',
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.collectorDiagnostics.errors));
    assert.strictEqual(result.collectorDiagnostics.ok, true);
    assert.strictEqual(result.preflightReport.ok, true, JSON.stringify(result.preflightReport.errors));
    assert.deepStrictEqual(result.preflightReport.blockedActions, BLOCKED_ACTIONS);
    assert.strictEqual(result.collectorDiagnostics.routingDiagnostics.doPostV54RefsAbsent, true);
    assert.strictEqual(result.collectorDiagnostics.routingDiagnostics.doGetV54RefsAbsent, true);
    assert.deepStrictEqual(result.collectorDiagnostics.forbiddenTokenHits.doPost, []);
    assert.deepStrictEqual(result.collectorDiagnostics.forbiddenTokenHits.doGet, []);
});

failed += test('missing_readTextFile_fails_closed', () => {
    const result = collectV54RealManualPreflightDiagnostics(makeInput(), {});
    assert.strictEqual(result.ok, false);
    assert.ok(hasError(result, 'READ_TEXT_FILE_MISSING'));
});

failed += test('readTextFile_throw_fails_closed', () => {
    const result = collectV54RealManualPreflightDiagnostics(makeInput(), {
        readTextFile() {
            throw new Error('boom');
        },
    });
    assert.strictEqual(result.ok, false);
    assert.ok(hasError(result, 'READ_MAIN_JS_FAILED'));
});

failed += test('missing_or_empty_main_js_fails_closed', () => {
    const emptyResult = collectV54RealManualPreflightDiagnostics(makeInput(), {
        readTextFile: () => '   ',
    });
    assert.strictEqual(emptyResult.ok, false);
    assert.ok(hasError(emptyResult, 'MAIN_JS_SOURCE_MISSING'));
});

failed += test('missing_mainJsDiffEmpty_diagnostic_fails_closed', () => {
    const result = collectV54RealManualPreflightDiagnostics(makeInput({ routingDiagnostics: {} }), {
        readTextFile: () => safeMainSource(),
    });
    assert.strictEqual(result.ok, false);
    assert.ok(hasError(result, 'MAIN_JS_DIFF_DIAGNOSTIC_MISSING'));
});

failed += test('missing_doPost_fails_closed', () => {
    const result = collectV54RealManualPreflightDiagnostics(makeInput(), {
        readTextFile: () => 'function doGet(e){ return 1; }',
    });
    assert.strictEqual(result.ok, false);
    assert.ok(hasError(result, 'DO_POST_MISSING'));
});

failed += test('missing_doGet_fails_closed', () => {
    const result = collectV54RealManualPreflightDiagnostics(makeInput(), {
        readTextFile: () => 'function doPost(e){ return 1; }',
    });
    assert.strictEqual(result.ok, false);
    assert.ok(hasError(result, 'DO_GET_MISSING'));
});

failed += test('unbalanced_doPost_braces_fails_closed', () => {
    const source = [
        'function doPost(e) {',
        '  if (e) { return 1; ',
        'function doGet(e) { return 2; }',
    ].join('\n');

    const result = collectV54RealManualPreflightDiagnostics(makeInput(), {
        readTextFile: () => source,
    });
    assert.strictEqual(result.ok, false);
    assert.ok(hasError(result, 'DO_POST_BRACES_UNBALANCED'));
});

failed += test('unbalanced_doGet_braces_fails_closed', () => {
    const source = [
        'function doPost(e) { return 1; }',
        'function doGet(e) {',
        '  if (e) { return 2; ',
    ].join('\n');

    const result = collectV54RealManualPreflightDiagnostics(makeInput(), {
        readTextFile: () => source,
    });
    assert.strictEqual(result.ok, false);
    assert.ok(hasError(result, 'DO_GET_BRACES_UNBALANCED'));
});

failed += test('forbidden_token_in_doPost_fails_closed', () => {
    const source = [
        'function doPost(e) {',
        '  return invokeV54ManualShadowGate(e);',
        '}',
        'function doGet(e) { return "ok"; }',
    ].join('\n');

    const result = collectV54RealManualPreflightDiagnostics(makeInput(), {
        readTextFile: () => source,
    });
    assert.strictEqual(result.ok, false);
    assert.ok(hasError(result, 'DO_POST_FORBIDDEN_RUNTIME_REF'));
    assert.ok(result.collectorDiagnostics.forbiddenTokenHits.doPost.includes('invokeV54ManualShadowGate'));
});

failed += test('forbidden_token_in_doGet_fails_closed', () => {
    const source = [
        'function doPost(e) { return "ok"; }',
        'function doGet(e) {',
        '  return parseTextV54OpenAI(e);',
        '}',
    ].join('\n');

    const result = collectV54RealManualPreflightDiagnostics(makeInput(), {
        readTextFile: () => source,
    });
    assert.strictEqual(result.ok, false);
    assert.ok(hasError(result, 'DO_GET_FORBIDDEN_RUNTIME_REF'));
    assert.ok(result.collectorDiagnostics.forbiddenTokenHits.doGet.includes('parseTextV54OpenAI'));
});

failed += test('invalid_evidence_fails_through_phase_5a_builder', () => {
    const result = collectV54RealManualPreflightDiagnostics(makeInput({
        evidence: makeEvidence({ mainJsDiffEmpty: false }),
    }), {
        readTextFile: () => safeMainSource(),
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.preflightReport.ok, false);
    assert.ok(hasError(result, 'EVIDENCE_ENVELOPE_INVALID'));
});

failed += test('boolean_parserContextDiagnostics_fails_through_builder', () => {
    const result = collectV54RealManualPreflightDiagnostics(makeInput({
        parserContextDiagnostics: true,
    }), {
        readTextFile: () => safeMainSource(),
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.preflightReport.ok, false);
    assert.ok(hasError(result, 'PARSER_CONTEXT_DIAGNOSTIC_INVALID'));
});

failed += test('spreadsheet_missing_idempotency_log_fails_through_builder', () => {
    const diagnostics = makeSpreadsheetDiagnostics();
    diagnostics.requiredSheetNames = diagnostics.requiredSheetNames.filter((name) => name !== V54_SHEETS.IDEMPOTENCY_LOG);
    delete diagnostics.headerStatusBySheet[V54_SHEETS.IDEMPOTENCY_LOG];

    const result = collectV54RealManualPreflightDiagnostics(makeInput({
        spreadsheetDiagnostics: diagnostics,
    }), {
        readTextFile: () => safeMainSource(),
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.preflightReport.ok, false);
    assert.ok(hasError(result, 'IDEMPOTENCY_LOG_MISSING'));
});

failed += test('forbidden_deps_are_provided_but_never_called', () => {
    const neverCalled = {};
    [
        'runV54ManualShadow',
        'invokeV54ManualShadowGate',
        'sendTelegram',
        'SpreadsheetApp',
        'clasp',
        'deploy',
        'applySetupV54',
        'applySeedV54',
    ].forEach((name) => {
        neverCalled[name] = 0;
    });

    const deps = {
        readTextFile: () => safeMainSource(),
        runV54ManualShadow() { neverCalled.runV54ManualShadow += 1; },
        invokeV54ManualShadowGate() { neverCalled.invokeV54ManualShadowGate += 1; },
        sendTelegram() { neverCalled.sendTelegram += 1; },
        SpreadsheetApp() { neverCalled.SpreadsheetApp += 1; },
        clasp() { neverCalled.clasp += 1; },
        deploy() { neverCalled.deploy += 1; },
        applySetupV54() { neverCalled.applySetupV54 += 1; },
        applySeedV54() { neverCalled.applySeedV54 += 1; },
    };

    const result = collectV54RealManualPreflightDiagnostics(makeInput(), deps);
    assert.strictEqual(result.preflightReport.ok, true);

    Object.keys(neverCalled).forEach((name) => {
        assert.strictEqual(neverCalled[name], 0, `${name} must not be called`);
    });
});

failed += test('forbidden_runtime_token_catalog_includes_phase_5b_tokens', () => {
    ['parseTextV54OpenAI', 'getParserContextV54', 'recordEntryV54'].forEach((token) => {
        assert.ok(FORBIDDEN_RUNTIME_TOKENS.includes(token), `missing token ${token}`);
    });
});

if (failed > 0) {
    console.error(`\n${failed} V54 real_manual preflight collector check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll V54 real_manual preflight collector checks passed.');
}
