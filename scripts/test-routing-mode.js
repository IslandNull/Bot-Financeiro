const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'Main.js'), 'utf8');

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

function makeContext(overrides) {
    let routingMode = null;
    const calls = {
        handleEntry: 0,
        handleCommand: 0,
        telegramMessages: [],
        primaryBridge: 0,
        shadowBridge: 0,
        primaryHandleV54: 0,
        shadowHandleV54: 0,
    };

    const sandbox = {
        PropertiesService: {
            getScriptProperties: () => ({
                getProperty: (k) => {
                    if (k === 'V54_ROUTING_MODE') return routingMode;
                    if (k === 'WEBHOOK_SECRET') return 'secret-123';
                    if (k === 'AUTHORIZED') return JSON.stringify({ '123': { pagador: 'Teste' } });
                    if (k === 'SPREADSHEET_ID') return 'sheet-123';
                    if (k === 'OPENAI_API_KEY') return 'api-key';
                    if (k === 'TELEGRAM_TOKEN') return 'tg-token';
                    return null;
                },
            }),
        },
        ContentService: { createTextOutput: () => ({ setMimeType: () => {} }) },
        console: { warn: () => {}, error: () => {}, log: () => {} },
        handleCommand: () => { calls.handleCommand += 1; },
        handleEntry: () => { calls.handleEntry += 1; },
        UrlFetchApp: {
            fetch: (url, opts) => {
                if (url.indexOf('/sendMessage') !== -1) {
                    const payload = JSON.parse(opts.payload || '{}');
                    calls.telegramMessages.push(payload);
                }
            },
        },
        buildV54ProductionBridgeDeps_: (runtimeContext, options) => {
            if (runtimeContext.mode === 'V54_PRIMARY') calls.primaryBridge += 1;
            if (runtimeContext.mode === 'V54_SHADOW') calls.shadowBridge += 1;
            return {
                ok: true,
                deps: {
                    handleTelegramUpdateV54: () => {
                        if (runtimeContext.mode === 'V54_PRIMARY') {
                            calls.primaryHandleV54 += 1;
                            return { ok: true, responseText: 'V54 ok' };
                        }
                        calls.shadowHandleV54 += 1;
                        return { ok: false, status: 'shadow_diagnostic_only', responseText: '' };
                    },
                    parseTextV54: () => ({ ok: true }),
                    parserOptions: {},
                    validateParsedEntryV54: () => ({ ok: true, normalized: {} }),
                    recordEntryV54: () => ({ ok: true }),
                    recordOptions: {},
                },
            };
        },
        redactV54ProductionBridgeObject_: (v) => v,
        recordEntryV54ShadowNoWrite_: () => ({ ok: true }),
    };

    Object.assign(sandbox, overrides || {});
    const context = vm.createContext(sandbox);
    vm.runInContext(main, context);

    return {
        context,
        calls,
        setRoutingMode(value) {
            routingMode = value;
        },
    };
}

function makeEvent(text) {
    return {
        parameter: { webhook_secret: 'secret-123' },
        postData: { contents: JSON.stringify({ message: { text, chat: { id: 123 } } }) },
    };
}

let failed = 0;

failed += test('routing_mode_defaults_to_v53_current_for_missing_empty_invalid', () => {
    const { context, setRoutingMode } = makeContext();
    setRoutingMode(null);
    assert.strictEqual(context.getRoutingMode_(), 'V53_CURRENT');
    setRoutingMode('');
    assert.strictEqual(context.getRoutingMode_(), 'V53_CURRENT');
    setRoutingMode('INVALID');
    assert.strictEqual(context.getRoutingMode_(), 'V53_CURRENT');
});

failed += test('v53_current_behavior_unchanged_for_entries_and_commands', () => {
    const setup = makeContext();
    setup.setRoutingMode('V53_CURRENT');
    setup.context.doPost(makeEvent('10 ifood'));
    assert.strictEqual(setup.calls.handleEntry, 1);
    assert.strictEqual(setup.calls.primaryBridge, 0);

    setup.context.doPost(makeEvent('/saldo'));
    assert.strictEqual(setup.calls.handleCommand, 1);
    assert.strictEqual(setup.calls.primaryBridge, 0);
});

failed += test('v54_shadow_keeps_v53_source_of_truth_and_runs_non_user_facing_diagnostics', () => {
    const setup = makeContext();
    setup.setRoutingMode('V54_SHADOW');
    setup.context.doPost(makeEvent('20 mercado'));

    assert.strictEqual(setup.calls.handleEntry, 1, 'V53 handleEntry must still run in shadow mode');
    assert.strictEqual(setup.calls.shadowBridge, 1, 'shadow bridge must run');
    assert.strictEqual(setup.calls.shadowHandleV54, 1, 'shadow V54 handler must run');
    assert.strictEqual(setup.calls.telegramMessages.length, 0, 'shadow V54 must not send Telegram directly');
});

failed += test('v54_shadow_failure_does_not_block_v53_flow', () => {
    const setup = makeContext({
        buildV54ProductionBridgeDeps_: () => ({ ok: false, errors: [{ code: 'BLOCKED' }] }),
        redactV54ProductionBridgeObject_: (value) => value,
    });
    setup.setRoutingMode('V54_SHADOW');
    setup.context.doPost(makeEvent('30 uber'));
    assert.strictEqual(setup.calls.handleEntry, 1);
    assert.strictEqual(setup.calls.telegramMessages.length, 0);
});

failed += test('v54_primary_routes_normal_entry_to_v54_and_not_v53', () => {
    const setup = makeContext();
    setup.setRoutingMode('V54_PRIMARY');
    setup.context.doPost(makeEvent('50 farmacia'));

    assert.strictEqual(setup.calls.handleEntry, 0, 'V53 mutation path must not run in V54_PRIMARY');
    assert.strictEqual(setup.calls.primaryBridge, 1);
    assert.strictEqual(setup.calls.primaryHandleV54, 1);
    assert.strictEqual(setup.calls.telegramMessages.length, 1);
    assert.strictEqual(setup.calls.telegramMessages[0].text, 'V54 ok');
});

failed += test('v54_primary_failure_sends_safe_message_and_does_not_fallback_to_v53', () => {
    const setup = makeContext({
        buildV54ProductionBridgeDeps_: () => ({ ok: false, errors: [{ code: 'CONFIG_MISSING' }] }),
        redactV54ProductionBridgeObject_: (value) => value,
    });
    setup.setRoutingMode('V54_PRIMARY');
    setup.context.doPost(makeEvent('60 aluguel'));

    assert.strictEqual(setup.calls.handleEntry, 0);
    assert.strictEqual(setup.calls.telegramMessages.length, 1);
    assert.ok(setup.calls.telegramMessages[0].text.includes('Não consegui registrar esse lançamento com segurança agora'));
});

failed += test('slash_commands_still_use_existing_command_path_in_all_modes', () => {
    const setup = makeContext();
    ['V53_CURRENT', 'V54_SHADOW', 'V54_PRIMARY'].forEach((mode) => {
        setup.setRoutingMode(mode);
        setup.context.doPost(makeEvent('/saldo'));
    });
    assert.strictEqual(setup.calls.handleCommand, 3);
    assert.strictEqual(setup.calls.primaryBridge, 0);
    assert.strictEqual(setup.calls.shadowBridge, 0);
});

if (failed > 0) {
    console.error(`\n${failed} routing mode check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll routing mode checks passed.');
}
