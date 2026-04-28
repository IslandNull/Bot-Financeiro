'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const bridgeSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'RunnerV54ProductionBridge.js'), 'utf8');

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

function loadBridge(overrides) {
    const calls = {
        openById: 0,
        fetch: 0,
    };

    const sandbox = Object.assign({
        CONFIG: {
            MODEL: 'gpt-5-nano',
            SPREADSHEET_ID: 'sheet-123',
            OPENAI_API_KEY: 'api-key',
        },
        SpreadsheetApp: {
            openById() {
                calls.openById += 1;
                return {};
            },
        },
        UrlFetchApp: {
            fetch() {
                calls.fetch += 1;
                return {
                    getResponseCode: () => 200,
                    getContentText: () => '{"ok":true}',
                };
            },
        },
        withScriptLock: (label, fn) => fn(),
        handleTelegramUpdateV54: () => ({ ok: true }),
        parseTextV54OpenAI: () => ({ ok: true }),
        getParserContextV54: () => ({ ok: true }),
        validateParsedEntryV54ForActions_: () => ({ ok: true, normalized: {} }),
        recordEntryV54: () => ({ ok: true }),
        planV54IdempotentWrite: () => ({}),
        mapSingleCardPurchaseContract: () => ({}),
        mapInstallmentScheduleContract: () => ({}),
        planExpectedFaturasUpsert: () => ({}),
    }, overrides || {});

    vm.createContext(sandbox);
    vm.runInContext(`${bridgeSource}\nresult = { buildV54ProductionBridgeDeps_, validateV54ProductionConfig_, makeV54ProductionFetchJson_, redactV54ProductionBridgeObject_ };`, sandbox);
    return { api: sandbox.result, calls };
}

let failed = 0;

failed += test('missing_spreadsheet_id_fails_closed_before_openById', () => {
    const { api, calls } = loadBridge({ CONFIG: { MODEL: 'gpt-5-nano', SPREADSHEET_ID: '', OPENAI_API_KEY: 'api-key' } });
    const result = api.buildV54ProductionBridgeDeps_({ mode: 'V54_PRIMARY' }, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(calls.openById, 0);
    assert.ok(result.errors.some((e) => e.code === 'V54_SPREADSHEET_ID_REQUIRED'));
});

failed += test('missing_openai_key_fails_closed_before_fetch', () => {
    const { api, calls } = loadBridge({ CONFIG: { MODEL: 'gpt-5-nano', SPREADSHEET_ID: 'sheet-123', OPENAI_API_KEY: '' } });
    const result = api.buildV54ProductionBridgeDeps_({ mode: 'V54_PRIMARY' }, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(calls.fetch, 0);
    assert.ok(result.errors.some((e) => e.code === 'V54_OPENAI_API_KEY_REQUIRED'));
});

failed += test('bridge_does_not_call_real_services_at_load_or_build_time', () => {
    const { api, calls } = loadBridge();
    const result = api.buildV54ProductionBridgeDeps_({ mode: 'V54_PRIMARY' }, {});
    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(calls.openById, 0);
    assert.strictEqual(calls.fetch, 0);
});

failed += test('bridge_returns_fetchJson_wrapper_that_uses_injected_urlfetch_only_when_called', () => {
    const { api, calls } = loadBridge();
    const result = api.buildV54ProductionBridgeDeps_({ mode: 'V54_PRIMARY' }, {});
    assert.strictEqual(result.ok, true);
    const payload = result.deps.parserOptions.fetchJson('https://fake.local/openai', { ping: true });
    assert.strictEqual(payload.ok, true);
    assert.strictEqual(calls.fetch, 1);
});

failed += test('v54_primary_card_context_failure_fails_closed_without_empty_array_fallback', () => {
    const { api } = loadBridge({
        getParserContextV54: () => ({ ok: false, context: null, errors: [{ code: 'PARSER_CONTEXT_HEADER_MISMATCH' }] }),
    });
    const result = api.buildV54ProductionBridgeDeps_({ mode: 'V54_PRIMARY' }, {});
    assert.strictEqual(result.ok, true);
    assert.throws(
        () => result.deps.recordOptions.getCardsV54(),
        /card context failed safely/,
        'V54_PRIMARY must not silently continue with [] when card context cannot be read',
    );
});

failed += test('redaction_hides_sensitive_fields', () => {
    const { api } = loadBridge();
    const redacted = api.redactV54ProductionBridgeObject_({
        OPENAI_API_KEY: 'secret',
        TELEGRAM_TOKEN: 'token',
        nested: { spreadsheet_id: 'abc', stack: 'trace' },
    });
    assert.strictEqual(redacted.OPENAI_API_KEY, '[REDACTED]');
    assert.strictEqual(redacted.TELEGRAM_TOKEN, '[REDACTED]');
    assert.strictEqual(redacted.nested.spreadsheet_id, '[REDACTED]');
    assert.strictEqual(redacted.nested.stack, '[REDACTED]');
});

if (failed > 0) {
    console.error(`\n${failed} V54 production bridge check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll V54 production bridge checks passed.');
}
