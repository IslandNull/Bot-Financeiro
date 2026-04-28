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
            doPostV54RefsControlled: true,
            doGetV54RefsAbsent: true,
            routingModeDefaultSafe: true,
            webhookAuthBeforeRouting: true,
            shadowNoV54Mutation: true,
            shadowNoV54TelegramSend: true,
            primaryNoV53FallbackMutation: true,
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
    assert.strictEqual(report.checks.doPostV54RefsControlled, true);
    assert.strictEqual(report.checks.doGetV54RefsAbsent, true);
    assert.strictEqual(report.checks.routingModeDefaultSafe, true);
    assert.strictEqual(report.checks.webhookAuthBeforeRouting, true);
    assert.strictEqual(report.checks.shadowNoV54Mutation, true);
    assert.strictEqual(report.checks.shadowNoV54TelegramSend, true);
    assert.strictEqual(report.checks.primaryNoV53FallbackMutation, true);
    assert.strictEqual(runnerCalls, 0);
    assert.strictEqual(gateCalls, 0);
    assert.strictEqual(mutationCalls, 0);
});

failed += test('doPost_v54_refs_must_be_controlled', () => {
    const report = buildV54RealManualPreflightReport(input({
        routingDiagnostics: Object.assign({}, input().routingDiagnostics, { doPostV54RefsControlled: false }),
    }), {});
    assert.strictEqual(report.ok, false);
    assert.ok(hasError(report, 'DO_POST_V54_REFS_UNCONTROLLED'));
});

failed += test('doGet_v54_reference_detected_fails_closed', () => {
    const report = buildV54RealManualPreflightReport(input({
        routingDiagnostics: Object.assign({}, input().routingDiagnostics, { doGetSource: 'function doGet(e) { return runV54ManualShadowGate(e); }', doGetV54RefsAbsent: undefined }),
    }), {});
    assert.strictEqual(report.ok, false);
    assert.ok(hasError(report, 'DO_GET_V54_REFS_PRESENT'));
});

failed += test('webhook_auth_order_check_is_mandatory', () => {
    const report = buildV54RealManualPreflightReport(input({
        routingDiagnostics: Object.assign({}, input().routingDiagnostics, { webhookAuthBeforeRouting: false }),
    }), {});
    assert.strictEqual(report.ok, false);
    assert.ok(hasError(report, 'WEBHOOK_AUTH_ROUTING_ORDER_INVALID'));
});

failed += test('shadow_mutation_and_shadow_telegram_checks_are_mandatory', () => {
    const report = buildV54RealManualPreflightReport(input({
        routingDiagnostics: Object.assign({}, input().routingDiagnostics, {
            shadowNoV54Mutation: false,
            shadowNoV54TelegramSend: false,
        }),
    }), {});
    assert.strictEqual(report.ok, false);
    assert.ok(hasError(report, 'V54_SHADOW_MUTATION_PATH_DETECTED'));
    assert.ok(hasError(report, 'V54_SHADOW_TELEGRAM_PATH_DETECTED'));
});

failed += test('v54_primary_v53_fallback_check_is_mandatory', () => {
    const report = buildV54RealManualPreflightReport(input({
        routingDiagnostics: Object.assign({}, input().routingDiagnostics, { primaryNoV53FallbackMutation: false }),
    }), {});
    assert.strictEqual(report.ok, false);
    assert.ok(hasError(report, 'V54_PRIMARY_V53_FALLBACK_DETECTED'));
});

failed += test('parser_context_boolean_ack_fails_closed', () => {
    const report = buildV54RealManualPreflightReport(input({ parserContextDiagnostics: true }), {});
    assert.strictEqual(report.ok, false);
    assert.ok(hasError(report, 'PARSER_CONTEXT_DIAGNOSTIC_INVALID'));
});

failed += test('spreadsheet_missing_idempotency_log_fails_closed', () => {
    const diagnostics = spreadsheetDiagnostics();
    diagnostics.requiredSheetNames = diagnostics.requiredSheetNames.filter((name) => name !== V54_SHEETS.IDEMPOTENCY_LOG);
    delete diagnostics.headerStatusBySheet[V54_SHEETS.IDEMPOTENCY_LOG];

    const report = buildV54RealManualPreflightReport(input({ spreadsheetDiagnostics: diagnostics }), {});
    assert.strictEqual(report.ok, false);
    assert.ok(hasError(report, 'IDEMPOTENCY_LOG_MISSING'));
});

if (failed > 0) {
    console.error(`\n${failed} V54 real_manual preflight report check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll V54 real_manual preflight report checks passed.');
}
