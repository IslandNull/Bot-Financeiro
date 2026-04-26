const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src', 'Main.js'), 'utf8');
const actions = fs.readFileSync(path.join(root, 'src', 'Actions.js'), 'utf8');
const setup = fs.readFileSync(path.join(root, 'src', 'Setup.js'), 'utf8');
const packageJson = require(path.join(root, 'package.json'));

function extractFunction(source, name) {
    const start = source.indexOf(`function ${name}(`);
    if (start === -1) throw new Error(`Function not found: ${name}`);

    let depth = 0;
    let seenBody = false;
    for (let i = start; i < source.length; i++) {
        if (source[i] === '{') {
            depth++;
            seenBody = true;
        } else if (source[i] === '}') {
            depth--;
            if (seenBody && depth === 0) return source.slice(start, i + 1);
        }
    }
    throw new Error(`Could not parse function body: ${name}`);
}

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

let failed = 0;

failed += test('apps_script_files_parse_as_javascript', () => {
    [
        ['src/Main.js', main],
        ['src/Actions.js', actions],
        ['src/Setup.js', setup],
    ].forEach(([label, source]) => {
        assert.doesNotThrow(() => new Function(source), `${label} must parse`);
    });
});

failed += test('webhook_secret_loaded_from_script_properties', () => {
    assert.ok(main.includes("CONFIG.WEBHOOK_SECRET = p.getProperty('WEBHOOK_SECRET')"));
});

failed += test('doPost_checks_webhook_secret_before_routing', () => {
    const body = extractFunction(main, 'doPost');
    const authIndex = body.indexOf('isWebhookAuthorized_(e, update)');
    assert.ok(authIndex > -1, 'doPost must call isWebhookAuthorized_');
    assert.ok(authIndex < body.indexOf('const msg ='), 'auth must run before trusting message/chat payload');
    assert.ok(authIndex < body.indexOf('handleCommand('), 'auth must run before command routing');
    assert.ok(authIndex < body.indexOf('handleEntry('), 'auth must run before write routing');
});

failed += test('webhook_auth_fails_closed_without_secret', () => {
    const body = extractFunction(main, 'isWebhookAuthorized_');
    assert.ok(body.includes('if (!CONFIG.WEBHOOK_SECRET) return false;'));
    assert.ok(body.includes('safeCompare_(provided, CONFIG.WEBHOOK_SECRET)'));
});

failed += test('webhook_secret_contract_supports_apps_script_and_valtown', () => {
    const body = extractFunction(main, 'extractWebhookSecret_');
    assert.ok(body.includes('params.webhook_secret'), 'Apps Script query parameter must be accepted');
    assert.ok(body.includes('params.telegram_secret'), 'alternate query parameter must be accepted');
    assert.ok(body.includes('update._bot_financeiro_secret'), 'Val.town body forwarding must be accepted');
    assert.ok(body.includes('update.proxy_secret'), 'proxy body secret must be accepted');
});

failed += test('doGet_export_state_only_and_blocks_mutating_get_actions', () => {
    const body = extractFunction(main, 'doGet');
    assert.ok(body.includes("action === 'exportState'"));
    assert.ok(body.includes('isBlockedMutatingGetAction_(action)'));
    assert.strictEqual(body.includes('forceFixAllFormulas();'), false, 'doGet must not execute forceFixAllFormulas');
    assert.strictEqual(body.includes('runV53AporteTest('), false, 'doGet must not execute runV53AporteTest');
    assert.strictEqual(body.includes('applySetupV54('), false, 'doGet must not execute applySetupV54');
    assert.strictEqual(body.includes('applySeedV54('), false, 'doGet must not execute applySeedV54');

    const blocklist = extractFunction(main, 'isBlockedMutatingGetAction_');
    assert.ok(blocklist.includes("'forceFixAllFormulas'"));
    assert.ok(blocklist.includes("'runV53AporteTest'"));
    assert.ok(blocklist.includes("'applySetupV54'"));
    assert.ok(blocklist.includes("'applySeedV54'"));
});

failed += test('sync_secret_uses_constant_time_compare', () => {
    const body = extractFunction(main, 'isSyncAuthorized_');
    assert.ok(body.includes('safeCompare_('));
});

failed += test('withScriptLock_uses_lockservice_and_releases_lock', () => {
    const body = extractFunction(main, 'withScriptLock');
    assert.ok(body.includes('LockService.getScriptLock()'));
    assert.ok(body.includes('lock.waitLock(30000)'));
    assert.ok(body.includes('finally'));
    assert.ok(body.includes('lock.releaseLock()'));
});

failed += test('write_paths_enter_withScriptLock_before_sheet_mutation', () => {
    ['recordParsedEntry', 'desfazerUltimo', 'handleManter', 'handleParcela'].forEach((name) => {
        const body = extractFunction(actions, name);
        const lockIndex = body.indexOf(`withScriptLock('${name}'`);
        assert.ok(lockIndex > -1, `${name} must call withScriptLock`);

        ['SpreadsheetApp.openById', '.getLastRow(', '.setValues(', '.clearContent('].forEach((needle) => {
            const mutationIndex = body.indexOf(needle);
            if (mutationIndex !== -1) {
                assert.ok(lockIndex < mutationIndex, `${name} must lock before ${needle}`);
            }
        });
    });
});

failed += test('webhook_setup_registers_secret_token_and_secret_param', () => {
    assert.ok(setup.includes('function requireWebhookSecret_()'));
    assert.ok(setup.includes('function addWebhookSecretParam_(url, secret)'));
    assert.ok(setup.includes('secret_token='));
    assert.ok(setup.includes('webhook_secret='));
    assert.ok(setup.includes('CONFIG.VALTOWN_WEBHOOK_URL'));
});

failed += test('webhook_diagnostics_are_read_only_and_redacted', () => {
    const diagnoseBody = extractFunction(setup, 'diagnoseWebhookSecurity');
    assert.ok(setup.includes('function maskSecret_('));
    assert.ok(setup.includes('function redactUrlSecret_('));
    assert.ok(diagnoseBody.includes('webhookSecretConfigured'));
    assert.ok(diagnoseBody.includes('redactUrlSecret_('));
    assert.strictEqual(diagnoseBody.includes('UrlFetchApp.fetch'), false, 'diagnoseWebhookSecurity must not call external APIs');
    assert.strictEqual(diagnoseBody.includes('setWebhook'), false, 'diagnoseWebhookSecurity must not mutate Telegram webhook');
    assert.strictEqual(diagnoseBody.includes('insertSheet'), false, 'diagnoseWebhookSecurity must not mutate sheets');
    assert.strictEqual(diagnoseBody.includes('setValues'), false, 'diagnoseWebhookSecurity must not mutate sheets');
});

failed += test('telegram_webhook_info_reader_is_read_only_and_redacted', () => {
    const body = extractFunction(setup, 'getTelegramWebhookInfo');
    assert.ok(body.includes('/getWebhookInfo'));
    assert.ok(body.includes('redactUrlSecret_(payload.result.url)'));
    assert.strictEqual(body.includes('/setWebhook'), false, 'getTelegramWebhookInfo must not mutate Telegram webhook');
    assert.strictEqual(body.includes('sendMessage'), false, 'getTelegramWebhookInfo must not send Telegram messages');
});

failed += test('npm_script_registered', () => {
    assert.strictEqual(packageJson.scripts['test:security-locks'], 'node scripts/test-security-locks.js');
});

failed += test('doPost_rejects_unauthorized_webhooks_dynamically', () => {
    const vm = require('vm');
    let routedToCommand = false;
    let routedToEntry = false;
    let sentMessages = [];

    const mockEnv = {
        PropertiesService: {
            getScriptProperties: () => ({
                getProperty: (k) => {
                    if (k === 'WEBHOOK_SECRET') return 'secret-123';
                    if (k === 'AUTHORIZED') return JSON.stringify({ '123': { pagador: 'Teste' } });
                    return null;
                }
            })
        },
        ContentService: {
            createTextOutput: (s) => ({
                setMimeType: () => {}
            })
        },
        UrlFetchApp: {
            fetch: (url, opts) => {
                if (url.includes('/sendMessage')) {
                    const payload = JSON.parse(opts.payload);
                    sentMessages.push(payload.text);
                }
            }
        },
        console: { warn: () => {}, error: () => {} },
        handleCommand: () => { routedToCommand = true; },
        handleEntry: () => { routedToEntry = true; }
    };

    const context = vm.createContext(mockEnv);
    vm.runInContext(main, context);

    function resetMock() {
        routedToCommand = false;
        routedToEntry = false;
        sentMessages = [];
    }

    // 1. Missing secret in request
    let e = { postData: { contents: JSON.stringify({ message: { text: '/saldo', chat: { id: 123 } } }) } };
    context.doPost(e);
    assert.strictEqual(routedToCommand, false, 'Should not route without secret');

    // 2. Invalid secret
    resetMock();
    e.parameter = { webhook_secret: 'wrong-secret' };
    context.doPost(e);
    assert.strictEqual(routedToCommand, false, 'Should not route with wrong secret');

    // 3. Valid secret, unauthorized chat
    resetMock();
    e.parameter = { webhook_secret: 'secret-123' };
    e.postData.contents = JSON.stringify({ message: { text: '/saldo', chat: { id: 999 } } });
    context.doPost(e);
    assert.strictEqual(routedToCommand, false, 'Should not route unauthorized chat');
    assert.ok(sentMessages.some(m => m.includes('não está autorizado')), 'Should notify unauthorized user');

    // 4. Valid secret, authorized chat (sanity check for the mock)
    resetMock();
    e.parameter = { webhook_secret: 'secret-123' };
    e.postData.contents = JSON.stringify({ message: { text: '/saldo', chat: { id: 123 } } });
    context.doPost(e);
    assert.strictEqual(routedToCommand, true, 'Should route valid request');
});

if (failed > 0) {
    console.error(`\n${failed} security/lock check(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll security/lock checks passed.');
}
