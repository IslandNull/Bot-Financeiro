const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const runtimeSources = [
    'src/000_V54Schema.js',
    'src/Main.js',
    'src/TelegramNotification.js',
    'src/TelegramSendLogV54.js',
].map((file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')).join('\n\n');

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
    const calls = {
        telegramMessages: [],
        primaryBridge: 0,
        primaryHandleV54: 0,
    };

    const sandbox = {
        PropertiesService: {
            getScriptProperties: () => ({
                getProperty: (k) => {
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
            return {
                ok: true,
                deps: {
                    handleTelegramUpdateV54: () => {
                        calls.primaryHandleV54 += 1;
                        return { ok: true, responseText: 'V54 ok' };
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
    };

    Object.assign(sandbox, overrides || {});
    const context = vm.createContext(sandbox);
    vm.runInContext(runtimeSources, context);

    return {
        context,
        calls,
    };
}

function makeEvent(text) {
    return {
        parameter: { webhook_secret: 'secret-123' },
        postData: { contents: JSON.stringify({ message: { text, chat: { id: 123 } } }) },
    };
}

let failed = 0;

failed += test('v54_primary_routes_normal_entry_to_v54', () => {
    const setup = makeContext();
    setup.context.doPost(makeEvent('50 farmacia'));

    assert.strictEqual(setup.calls.primaryBridge, 1);
    assert.strictEqual(setup.calls.primaryHandleV54, 1);
    assert.strictEqual(setup.calls.telegramMessages.length, 1);
    assert.strictEqual(setup.calls.telegramMessages[0].text, 'V54 ok');
});

failed += test('v54_primary_failure_sends_safe_message', () => {
    const setup = makeContext({
        buildV54ProductionBridgeDeps_: () => ({ ok: false, errors: [{ code: 'CONFIG_MISSING' }] }),
        redactV54ProductionBridgeObject_: (value) => value,
    });
    setup.context.doPost(makeEvent('60 aluguel'));

    assert.strictEqual(setup.calls.telegramMessages.length, 1);
    assert.ok(setup.calls.telegramMessages[0].text.includes('Não consegui registrar esse lançamento com segurança agora'));
});

failed += test('slash_commands_handled_by_v54_command_handler', () => {
    const setup = makeContext();
    setup.context.doPost(makeEvent('/saldo'));

    assert.strictEqual(setup.calls.primaryBridge, 0);
    assert.strictEqual(setup.calls.telegramMessages.length, 1);
    assert.ok(setup.calls.telegramMessages[0].text.includes('Comando não suportado'));
});

failed += test('slash_commands_start_handled_by_v54_command_handler', () => {
    const setup = makeContext();
    setup.context.doPost(makeEvent('/start'));

    assert.strictEqual(setup.calls.primaryBridge, 0);
    assert.strictEqual(setup.calls.telegramMessages.length, 1);
    assert.ok(setup.calls.telegramMessages[0].text.includes('Bot Financeiro V54 (Primary Mode)'));
});

if (failed > 0) {
    console.error(`\n${failed} routing mode check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll routing mode checks passed.');
}
