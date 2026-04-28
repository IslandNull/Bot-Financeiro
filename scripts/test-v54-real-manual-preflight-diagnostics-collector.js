'use strict';

const assert = require('assert');

const { V54_SHEETS } = require('./lib/v54-schema');
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
        doPostV54RefsControlled: true,
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
        'function doPost(e) {',
        '  const update = parseTelegramUpdate_(e);',
        '  if (!isWebhookAuthorized_(e, update)) return _ok();',
        '  const text = "safe";',
        '  const routingMode = getRoutingMode_();',
        '  if (routingMode === ROUTING_MODES.V54_PRIMARY) {',
        '    routeV54PrimaryEntry_(update, text, "1", {});',
        '  } else if (routingMode === ROUTING_MODES.V54_SHADOW) {',
        '    handleEntry(text, "1", {});',
        '    runV54ShadowDiagnostics_(update, text, "1", {});',
        '  } else {',
        '    handleEntry(text, "1", {});',
        '  }',
        '}',
        'function routeV54PrimaryEntry_(update, text, chatId, user) {',
        '  return sendTelegram(chatId, "ok");',
        '}',
        'function runV54ShadowDiagnostics_(update, text, chatId, user) {',
        '  return recordEntryV54ShadowNoWrite_({ tipo_evento: "despesa" });',
        '}',
        'function doGet(e) { return "exportState"; }',
    ].join('\n');
}

let failed = 0;

failed += test('happy_path_with_controlled_doPost_and_safe_doGet', () => {
    const result = collectV54RealManualPreflightDiagnostics(makeInput(), {
        readTextFile: () => safeMainSource(),
        now: () => '2026-04-28T12:00:00.000Z',
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.collectorDiagnostics.errors));
    assert.strictEqual(result.collectorDiagnostics.routingDiagnostics.doPostV54RefsControlled, true);
    assert.strictEqual(result.collectorDiagnostics.routingDiagnostics.doGetV54RefsAbsent, true);
    assert.strictEqual(result.collectorDiagnostics.routingDiagnostics.shadowNoV54Mutation, true);
    assert.strictEqual(result.collectorDiagnostics.routingDiagnostics.shadowNoV54TelegramSend, true);
    assert.strictEqual(result.collectorDiagnostics.routingDiagnostics.webhookAuthBeforeRouting, true);
});

failed += test('missing_readTextFile_fails_closed', () => {
    const result = collectV54RealManualPreflightDiagnostics(makeInput(), {});
    assert.strictEqual(result.ok, false);
    assert.ok(hasError(result, 'READ_TEXT_FILE_MISSING'));
});

failed += test('readTextFile_throw_fails_closed', () => {
    const result = collectV54RealManualPreflightDiagnostics(makeInput(), { readTextFile() { throw new Error('boom'); } });
    assert.strictEqual(result.ok, false);
    assert.ok(hasError(result, 'READ_MAIN_JS_FAILED'));
});

failed += test('missing_or_empty_main_js_fails_closed', () => {
    const result = collectV54RealManualPreflightDiagnostics(makeInput(), { readTextFile: () => '   ' });
    assert.strictEqual(result.ok, false);
    assert.ok(hasError(result, 'MAIN_JS_SOURCE_MISSING'));
});

failed += test('missing_mainJsDiffEmpty_diagnostic_fails_closed', () => {
    const result = collectV54RealManualPreflightDiagnostics(makeInput({ routingDiagnostics: {} }), { readTextFile: () => safeMainSource() });
    assert.strictEqual(result.ok, false);
    assert.ok(hasError(result, 'MAIN_JS_DIFF_DIAGNOSTIC_MISSING'));
});

failed += test('missing_doPost_fails_closed', () => {
    const result = collectV54RealManualPreflightDiagnostics(makeInput(), { readTextFile: () => 'function doGet(e){ return 1; }' });
    assert.strictEqual(result.ok, false);
    assert.ok(hasError(result, 'DO_POST_MISSING'));
});

failed += test('missing_doGet_fails_closed', () => {
    const result = collectV54RealManualPreflightDiagnostics(makeInput(), { readTextFile: () => 'function doPost(e){ return 1; }' });
    assert.strictEqual(result.ok, false);
    assert.ok(hasError(result, 'DO_GET_MISSING'));
});

failed += test('unbalanced_doPost_braces_fails_closed', () => {
    const source = 'function doPost(e) { if (e) { return 1; \n function doGet(e){return 2;}';
    const result = collectV54RealManualPreflightDiagnostics(makeInput(), { readTextFile: () => source });
    assert.strictEqual(result.ok, false);
    assert.ok(hasError(result, 'DO_POST_BRACES_UNBALANCED'));
});

failed += test('unbalanced_doGet_braces_fails_closed', () => {
    const source = 'function doPost(e){return 1;}\nfunction doGet(e){ if (e) { return 2;';
    const result = collectV54RealManualPreflightDiagnostics(makeInput(), { readTextFile: () => source });
    assert.strictEqual(result.ok, false);
    assert.ok(hasError(result, 'DO_GET_BRACES_UNBALANCED'));
});

failed += test('preflight_fails_if_doPost_v54_refs_bypass_routing_modes', () => {
    const source = [
        'function doPost(e) {',
        '  if (!isWebhookAuthorized_(e, {})) return _ok();',
        '  parseTextV54OpenAI("x", {}, {});',
        '}',
        'function runV54ShadowDiagnostics_(){ return recordEntryV54ShadowNoWrite_({}); }',
        'function routeV54PrimaryEntry_(){ return sendTelegram("1","ok"); }',
        'function doGet(e){ return "ok"; }',
    ].join('\n');
    const result = collectV54RealManualPreflightDiagnostics(makeInput(), { readTextFile: () => source });
    assert.strictEqual(result.ok, false);
    assert.ok(hasError(result, 'DO_POST_V54_REFS_UNCONTROLLED'));
});

failed += test('forbidden_token_in_doGet_fails_closed', () => {
    const source = 'function doPost(e){ const routingMode = getRoutingMode_(); if (routingMode === ROUTING_MODES.V54_PRIMARY) { routeV54PrimaryEntry_(e,"x","1",{});} else {handleEntry("x","1",{});} }\nfunction runV54ShadowDiagnostics_(){return recordEntryV54ShadowNoWrite_({});}\nfunction routeV54PrimaryEntry_(){return sendTelegram("1","ok");}\nfunction doGet(e){ return parseTextV54OpenAI(e); }';
    const result = collectV54RealManualPreflightDiagnostics(makeInput(), { readTextFile: () => source });
    assert.strictEqual(result.ok, false);
    assert.ok(hasError(result, 'DO_GET_FORBIDDEN_RUNTIME_REF'));
});

failed += test('preflight_fails_if_shadow_mode_can_mutate_or_send_telegram', () => {
    const source = [
        'function doPost(e) {',
        '  if (!isWebhookAuthorized_(e, {})) return _ok();',
        '  const routingMode = getRoutingMode_();',
        '  if (routingMode === ROUTING_MODES.V54_SHADOW) { handleEntry("x","1",{}); runV54ShadowDiagnostics_(e,"x","1",{}); }',
        '  else { handleEntry("x","1",{}); }',
        '}',
        'function routeV54PrimaryEntry_(){ return sendTelegram("1","ok"); }',
        'function runV54ShadowDiagnostics_(){ recordEntryV54({}); sendTelegram("1","bad"); }',
        'function doGet(e){ return "ok"; }',
    ].join('\n');

    const result = collectV54RealManualPreflightDiagnostics(makeInput(), { readTextFile: () => source });
    assert.strictEqual(result.ok, false);
    assert.ok(hasError(result, 'V54_SHADOW_MUTATION_PATH_DETECTED'));
    assert.ok(hasError(result, 'V54_SHADOW_TELEGRAM_PATH_DETECTED'));
});

failed += test('preflight_fails_if_webhook_auth_moved_after_routing', () => {
    const source = [
        'function doPost(e) {',
        '  const routingMode = getRoutingMode_();',
        '  if (!isWebhookAuthorized_(e, {})) return _ok();',
        '  if (routingMode === ROUTING_MODES.V54_PRIMARY) { routeV54PrimaryEntry_(e,"x","1",{}); } else { handleEntry("x","1",{}); }',
        '}',
        'function routeV54PrimaryEntry_(){ return sendTelegram("1","ok"); }',
        'function runV54ShadowDiagnostics_(){ return recordEntryV54ShadowNoWrite_({}); }',
        'function doGet(e){ return "ok"; }',
    ].join('\n');

    const result = collectV54RealManualPreflightDiagnostics(makeInput(), { readTextFile: () => source });
    assert.strictEqual(result.ok, false);
    assert.ok(hasError(result, 'WEBHOOK_AUTH_ROUTING_ORDER_INVALID'));
});

failed += test('invalid_evidence_still_fails_through_phase_5a_builder', () => {
    const result = collectV54RealManualPreflightDiagnostics(makeInput({ evidence: makeEvidence({ mainJsDiffEmpty: false }) }), { readTextFile: () => safeMainSource() });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.preflightReport.ok, false);
    assert.ok(hasError(result, 'EVIDENCE_ENVELOPE_INVALID'));
});

failed += test('boolean_parser_context_still_fails_through_phase_5a_builder', () => {
    const result = collectV54RealManualPreflightDiagnostics(makeInput({ parserContextDiagnostics: true }), { readTextFile: () => safeMainSource() });
    assert.strictEqual(result.ok, false);
    assert.ok(hasError(result, 'PARSER_CONTEXT_DIAGNOSTIC_INVALID'));
});

failed += test('spreadsheet_missing_idempotency_log_still_fails_through_phase_5a_builder', () => {
    const diagnostics = makeSpreadsheetDiagnostics();
    diagnostics.requiredSheetNames = diagnostics.requiredSheetNames.filter((name) => name !== V54_SHEETS.IDEMPOTENCY_LOG);
    delete diagnostics.headerStatusBySheet[V54_SHEETS.IDEMPOTENCY_LOG];
    const result = collectV54RealManualPreflightDiagnostics(makeInput({ spreadsheetDiagnostics: diagnostics }), { readTextFile: () => safeMainSource() });
    assert.strictEqual(result.ok, false);
    assert.ok(hasError(result, 'IDEMPOTENCY_LOG_MISSING'));
});

failed += test('forbidden_deps_are_provided_but_never_called', () => {
    const counts = { runner: 0, gate: 0, telegram: 0 };
    const result = collectV54RealManualPreflightDiagnostics(makeInput(), {
        readTextFile: () => safeMainSource(),
        runV54ManualShadow() { counts.runner += 1; },
        invokeV54ManualShadowGate() { counts.gate += 1; },
        sendTelegram() { counts.telegram += 1; },
    });

    assert.strictEqual(result.preflightReport.ok, true);
    assert.strictEqual(counts.runner, 0);
    assert.strictEqual(counts.gate, 0);
    assert.strictEqual(counts.telegram, 0);
});

failed += test('forbidden_runtime_token_catalog_includes_phase_5b_tokens', () => {
    ['parseTextV54OpenAI', 'getParserContextV54', 'recordEntryV54'].forEach((token) => {
        assert.ok(FORBIDDEN_RUNTIME_TOKENS.includes(token));
    });
});

if (failed > 0) {
    console.error(`\n${failed} V54 real_manual preflight collector check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll V54 real_manual preflight collector checks passed.');
}
