'use strict';

const assert = require('assert');

const { V54_SHEETS } = require('./lib/v54-schema');
const { buildV54RealManualPreflightReport, BLOCKED_ACTIONS } = require('./lib/v54-real-manual-preflight-report');

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

function evidence(overrides) {
    const requiredSheetNames = Object.values(V54_SHEETS);
    const headerStatusBySheet = {};
    requiredSheetNames.forEach((sheetName) => {
        headerStatusBySheet[sheetName] = { ok: true, hasExtraColumns: false };
    });

    return Object.assign({
        operatorLabel: 'local-reviewer',
        timestamp: '2026-04-28T00:00:00.000Z',
        referenceDate: '2026-04-28',
        branchName: 'work',
        localCommitMarker: 'LOCAL_ONLY',
        mainJsDiffEmpty: true,
        doPostV54RefsAbsent: true,
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

function spreadsheetDiagnostics(overrides) {
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

function input(overrides) {
    return Object.assign({
        referenceDate: '2026-04-28',
        routingDiagnostics: {
            mainJsDiffEmpty: true,
            doPostV54RefsAbsent: true,
            doGetV54RefsAbsent: true,
        },
        evidence: evidence(),
        parserContextDiagnostics: {
            executed: true,
            ok: true,
            contextReadable: true,
        },
        spreadsheetDiagnostics: spreadsheetDiagnostics(),
    }, overrides || {});
}

function hasError(report, code) {
    return report.errors.some((error) => error.code === code);
}

let failed = 0;

failed += test('happy_path_returns_boarding_pass_and_calls_no_runner_or_gate_or_mutation_deps', () => {
    let runnerCalls = 0;
    let gateCalls = 0;
    let mutationCalls = 0;

    const report = buildV54RealManualPreflightReport(input(), {
        now: () => '2026-04-28T10:00:00.000Z',
        runV54ManualShadow: () => { runnerCalls += 1; },
        invokeV54ManualShadowGate: () => { gateCalls += 1; },
        mutateSpreadsheet: () => { mutationCalls += 1; },
    });

    assert.strictEqual(report.ok, true, JSON.stringify(report.errors));
    assert.strictEqual(report.mode, 'real_manual_preflight');
    assert.deepStrictEqual(report.blockedActions, BLOCKED_ACTIONS);
    assert.strictEqual(report.checks.mainJsDiffEmpty, true);
    assert.strictEqual(report.checks.doPostV54RefsAbsent, true);
    assert.strictEqual(report.checks.doGetV54RefsAbsent, true);
    assert.strictEqual(report.checks.evidenceEnvelopeValid, true);
    assert.strictEqual(report.checks.parserContextReadable, true);
    assert.strictEqual(report.checks.spreadsheetDiagnosticsValid, true);
    assert.strictEqual(runnerCalls, 0);
    assert.strictEqual(gateCalls, 0);
    assert.strictEqual(mutationCalls, 0);
});

failed += test('main_js_diff_not_empty_fails_closed', () => {
    const report = buildV54RealManualPreflightReport(input({ routingDiagnostics: { mainJsDiffEmpty: false, doPostV54RefsAbsent: true, doGetV54RefsAbsent: true } }), {});
    assert.strictEqual(report.ok, false);
    assert.strictEqual(report.checks.mainJsDiffEmpty, false);
    assert.ok(hasError(report, 'MAIN_JS_DIFF_NOT_EMPTY'));
});

failed += test('doPost_v54_reference_detected_fails_closed', () => {
    const report = buildV54RealManualPreflightReport(input({
        routingDiagnostics: {
            mainJsDiffEmpty: true,
            doPostSource: 'function doPost(e) { invokeV54ManualShadowGate(e); }',
            doGetV54RefsAbsent: true,
        },
    }), {});
    assert.strictEqual(report.ok, false);
    assert.strictEqual(report.checks.doPostV54RefsAbsent, false);
    assert.ok(hasError(report, 'DO_POST_V54_REFS_PRESENT'));
});

failed += test('doGet_v54_reference_detected_fails_closed', () => {
    const report = buildV54RealManualPreflightReport(input({
        routingDiagnostics: {
            mainJsDiffEmpty: true,
            doPostV54RefsAbsent: true,
            doGetSource: 'function doGet(e) { return runV54ManualShadowGate(e); }',
        },
    }), {});
    assert.strictEqual(report.ok, false);
    assert.strictEqual(report.checks.doGetV54RefsAbsent, false);
    assert.ok(hasError(report, 'DO_GET_V54_REFS_PRESENT'));
});

failed += test('missing_evidence_fails_closed', () => {
    const report = buildV54RealManualPreflightReport(input({ evidence: null }), {});
    assert.strictEqual(report.ok, false);
    assert.strictEqual(report.checks.evidenceEnvelopeValid, false);
    assert.ok(hasError(report, 'EVIDENCE_ENVELOPE_MISSING'));
});

failed += test('invalid_evidence_fails_closed', () => {
    const report = buildV54RealManualPreflightReport(input({ evidence: evidence({ mainJsDiffEmpty: false }) }), {});
    assert.strictEqual(report.ok, false);
    assert.strictEqual(report.checks.evidenceEnvelopeValid, false);
    assert.ok(hasError(report, 'EVIDENCE_ENVELOPE_INVALID'));
});

failed += test('parser_context_boolean_ack_fails_closed', () => {
    const report = buildV54RealManualPreflightReport(input({ parserContextDiagnostics: true }), {});
    assert.strictEqual(report.ok, false);
    assert.strictEqual(report.checks.parserContextReadable, false);
    assert.ok(hasError(report, 'PARSER_CONTEXT_DIAGNOSTIC_INVALID'));
});

failed += test('parser_context_diagnostic_throwing_fails_closed', () => {
    const report = buildV54RealManualPreflightReport(input({ parserContextDiagnostics: undefined }), {
        getParserContextDiagnostics() {
            throw new Error('boom');
        },
    });
    assert.strictEqual(report.ok, false);
    assert.strictEqual(report.checks.parserContextReadable, false);
    assert.ok(hasError(report, 'PARSER_CONTEXT_DIAGNOSTIC_FAILED'));
});

failed += test('parser_context_ok_false_fails_closed', () => {
    const report = buildV54RealManualPreflightReport(input({ parserContextDiagnostics: { executed: true, ok: false, contextReadable: false } }), {});
    assert.strictEqual(report.ok, false);
    assert.strictEqual(report.checks.parserContextReadable, false);
    assert.ok(hasError(report, 'PARSER_CONTEXT_DIAGNOSTIC_FAILED'));
});

failed += test('spreadsheet_missing_idempotency_log_fails_closed', () => {
    const diagnostics = spreadsheetDiagnostics();
    diagnostics.requiredSheetNames = diagnostics.requiredSheetNames.filter((name) => name !== V54_SHEETS.IDEMPOTENCY_LOG);
    delete diagnostics.headerStatusBySheet[V54_SHEETS.IDEMPOTENCY_LOG];

    const report = buildV54RealManualPreflightReport(input({ spreadsheetDiagnostics: diagnostics }), {});
    assert.strictEqual(report.ok, false);
    assert.strictEqual(report.checks.spreadsheetDiagnosticsValid, false);
    assert.ok(hasError(report, 'IDEMPOTENCY_LOG_MISSING'));
});

failed += test('spreadsheet_missing_required_tab_or_header_fails_closed', () => {
    const diagnostics = spreadsheetDiagnostics();
    diagnostics.requiredSheetNames = diagnostics.requiredSheetNames.filter((name) => name !== V54_SHEETS.LANCAMENTOS_V54);
    diagnostics.headerStatusBySheet[V54_SHEETS.FATURAS] = { ok: false };

    const report = buildV54RealManualPreflightReport(input({ spreadsheetDiagnostics: diagnostics }), {});
    assert.strictEqual(report.ok, false);
    assert.strictEqual(report.checks.spreadsheetDiagnosticsValid, false);
    assert.ok(hasError(report, 'REQUIRED_V54_TAB_MISSING'));
    assert.ok(hasError(report, 'REQUIRED_V54_HEADERS_INVALID'));
});

failed += test('forbidden_dependencies_are_not_called_by_builder', () => {
    let callCount = 0;
    buildV54RealManualPreflightReport(input(), {
        runV54ManualShadow() { callCount += 1; },
        runV54ManualShadowGate() { callCount += 1; },
        sendTelegram() { callCount += 1; },
        deploy() { callCount += 1; },
        clasp() { callCount += 1; },
    });
    assert.strictEqual(callCount, 0);
});

if (failed > 0) {
    console.error(`\n${failed} V54 real_manual preflight report check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll V54 real_manual preflight report checks passed.');
}
