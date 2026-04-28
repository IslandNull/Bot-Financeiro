const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const schemaV54 = fs.readFileSync(path.join(root, 'src', '000_V54Schema.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src', 'Main.js'), 'utf8');
const telegramNotification = fs.readFileSync(path.join(root, 'src', 'TelegramNotification.js'), 'utf8');
const telegramSendLogV54 = fs.readFileSync(path.join(root, 'src', 'TelegramSendLogV54.js'), 'utf8');
const mainRuntime = [schemaV54, main, telegramNotification, telegramSendLogV54].join('\n\n');
const actions = fs.readFileSync(path.join(root, 'src', 'Actions.js'), 'utf8');
const setup = fs.readFileSync(path.join(root, 'src', 'Setup.js'), 'utf8');
const actionsV54 = fs.readFileSync(path.join(root, 'src', 'ActionsV54.js'), 'utf8');
const actionsV54Helpers = fs.readFileSync(path.join(root, 'src', 'ActionsV54Helpers.js'), 'utf8');
const parserV54 = fs.readFileSync(path.join(root, 'src', 'ParserV54.js'), 'utf8');
const handlerV54 = fs.readFileSync(path.join(root, 'src', 'HandlerV54.js'), 'utf8');
const bridgeV54 = fs.readFileSync(path.join(root, 'src', 'RunnerV54ProductionBridge.js'), 'utf8');
const viewsV54 = fs.readFileSync(path.join(root, 'src', 'ViewsV54.js'), 'utf8');
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
        ['src/000_V54Schema.js', schemaV54],
        ['src/TelegramNotification.js', telegramNotification],
        ['src/TelegramSendLogV54.js', telegramSendLogV54],
        ['src/Actions.js', actions],
        ['src/ActionsV54Helpers.js', actionsV54Helpers],
        ['src/Setup.js', setup],
        ['src/HandlerV54.js', handlerV54],
        ['src/ParserV54.js', parserV54],
        ['src/RunnerV54ProductionBridge.js', bridgeV54],
        ['src/ViewsV54.js', viewsV54],
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

failed += test('redaction_removes_telegram_bot_url_tokens', () => {
    const vm = require('vm');
    const context = vm.createContext({
        PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
        ContentService: { createTextOutput: () => ({ setMimeType: () => {} }) },
        console: { log: () => {}, warn: () => {}, error: () => {} },
    });
    vm.runInContext(mainRuntime, context);

    const raw = 'url=https://api.telegram.org/bot123456789:ABCdef_SECRET-token/sendMessage';
    const redacted = context.redactSensitiveText_(raw);
    assert.ok(redacted.includes('https://api.telegram.org/bot[REDACTED]/sendMessage'));
    assert.strictEqual(redacted.includes('123456789:ABCdef_SECRET-token'), false);
});

failed += test('redaction_removes_token_fragments_api_keys_secrets_and_labeled_spreadsheet_ids', () => {
    const vm = require('vm');
    const context = vm.createContext({
        PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
        ContentService: { createTextOutput: () => ({ setMimeType: () => {} }) },
        console: { log: () => {}, warn: () => {}, error: () => {} },
    });
    vm.runInContext(mainRuntime, context);

    const raw = [
        'bot123456789:ABCdef_SECRET-token',
        'sk-proj-abcdefghijklmnopqrstuvwxyz123456',
        'https://example.test/hook?webhook_secret=raw-webhook&telegram_secret=raw-telegram&proxy_secret=raw-proxy',
        'spreadsheet_id=1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890',
        'SPREADSHEET_ID: 1ZyXwVuTsRqPoNmLkJiHgFeDcBa0987654321',
    ].join('\n');
    const redacted = context.redactSensitiveText_(raw);
    ['123456789:ABCdef_SECRET-token', 'sk-proj-abcdefghijklmnopqrstuvwxyz123456', 'raw-webhook', 'raw-telegram', 'raw-proxy', '1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890', '1ZyXwVuTsRqPoNmLkJiHgFeDcBa0987654321'].forEach((secret) => {
        assert.strictEqual(redacted.includes(secret), false, `${secret} must be redacted`);
    });
});

failed += test('sendTelegram_failure_logs_redacted_diagnostics_only', () => {
    const vm = require('vm');
    const logs = [];
    const rawToken = '123456789:ABCdef_SECRET-token';
    const mockEnv = {
        PropertiesService: {
            getScriptProperties: () => ({
                getProperty: (k) => {
                    if (k === 'TELEGRAM_TOKEN') return rawToken;
                    if (k === 'AUTHORIZED') return '{}';
                    return null;
                }
            })
        },
        ContentService: { createTextOutput: () => ({ setMimeType: () => {} }) },
        UrlFetchApp: {
            fetch: (url) => {
                throw new Error(`network failure for ${url}`);
            }
        },
        console: {
            log: () => {},
            warn: (...args) => logs.push(args.join(' ')),
            error: (...args) => logs.push(args.join(' ')),
        },
    };
    const context = vm.createContext(mockEnv);
    vm.runInContext(mainRuntime, context);
    context._loadSecrets();

    const result = context.sendTelegram('123', 'hello');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.statusCode, null);
    assert.strictEqual(result.error, 'telegram_send_failed');
    const combined = logs.join('\n');
    assert.strictEqual(combined.includes(rawToken), false, 'raw Telegram token must not be logged');
    assert.strictEqual(combined.includes('/bot123456789:'), false, 'raw bot URL token must not be logged');
    assert.ok(combined.includes('[REDACTED]'), 'diagnostic should show redaction marker');
});

failed += test('routeV54PrimaryEntry_failure_sends_generic_fallback_and_redacted_logs', () => {
    const vm = require('vm');
    const sentMessages = [];
    const logs = [];
    const rawToken = '123456789:ABCdef_SECRET-token';
    const rawOpenAIKey = 'sk-proj-abcdefghijklmnopqrstuvwxyz123456';
    const rawSpreadsheetId = '1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890';
    const mockEnv = {
        PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
        ContentService: { createTextOutput: () => ({ setMimeType: () => {} }) },
        UrlFetchApp: {
            fetch: (url, opts) => {
                sentMessages.push(JSON.parse(opts.payload).text);
                return { getResponseCode: () => 200 };
            }
        },
        console: {
            log: () => {},
            warn: (...args) => logs.push(args.join(' ')),
            error: (...args) => logs.push(args.join(' ')),
        },
        buildV54ProductionBridgeDeps_: () => ({
            ok: true,
            deps: {
                handleTelegramUpdateV54: () => {
                    throw new Error(`boom https://api.telegram.org/bot${rawToken}/sendMessage ${rawOpenAIKey} webhook_secret=raw-webhook spreadsheet_id=${rawSpreadsheetId}\n    at secret.gs:10`);
                },
                parseTextV54: () => ({}),
                parserOptions: {},
                validateParsedEntryV54: () => ({}),
                recordEntryV54: () => ({}),
                recordOptions: {},
            }
        }),
    };
    const context = vm.createContext(mockEnv);
    vm.runInContext(mainRuntime, context);

    context.routeV54PrimaryEntry_(
        { update_id: 1, message: { message_id: 2, chat: { id: 123 }, text: 'x' } },
        'x',
        '123',
        { pagador: 'Teste' }
    );

    assert.strictEqual(sentMessages.length, 1, 'must send exactly one fallback message');
    assert.strictEqual(sentMessages[0], 'Não consegui registrar esse lançamento com segurança agora. Revise a mensagem ou tente novamente em instantes.');
    const visible = sentMessages.join('\n') + '\n' + logs.join('\n');
    [rawToken, rawOpenAIKey, 'raw-webhook', rawSpreadsheetId, 'secret.gs:10'].forEach((secret) => {
        assert.strictEqual(visible.includes(secret), false, `${secret} must not leak`);
    });
});

failed += test('routeV54PrimaryEntry_captures_all_v54_primary_send_phases', () => {
    const body = extractFunction(main, 'routeV54PrimaryEntry_');
    [
        'bridge_blocked_fallback',
        'runtime_exception_fallback',
        'success_response',
        'non_ok_fallback',
    ].forEach((phase) => {
        assert.ok(body.includes(`logV54PrimaryTelegramSendAttempt_('${phase}'`), `${phase} send result must be captured`);
    });
});

function makeTelegramSendLogSpreadsheetForTest() {
    const writes = [];
    const headers = [
        'id_notificacao',
        'created_at',
        'route',
        'chat_id',
        'phase',
        'status',
        'status_code',
        'error',
        'result_ref',
        'id_lancamento',
        'idempotency_key',
        'text_preview',
        'sent_at',
    ];
    const sheet = {
        getLastRow: () => 1 + writes.length,
        getRange(row, column, numRows, numColumns) {
            return {
                getValues() {
                    if (row === 1 && column === 1 && numRows === 1) {
                        return [Array.from({ length: numColumns }, (_, index) => headers[index] || '')];
                    }
                    throw new Error(`Unexpected getValues range ${row}:${column}:${numRows}:${numColumns}`);
                },
                setValues(values) {
                    writes.push({ row, column, numRows, numColumns, values: values.map((valueRow) => [...valueRow]) });
                },
            };
        },
    };
    return {
        writes,
        getSheetByName(name) {
            return name === 'Telegram_Send_Log' ? sheet : null;
        },
    };
}

function telegramLogRowObject(write) {
    const headers = [
        'id_notificacao',
        'created_at',
        'route',
        'chat_id',
        'phase',
        'status',
        'status_code',
        'error',
        'result_ref',
        'id_lancamento',
        'idempotency_key',
        'text_preview',
        'sent_at',
    ];
    return headers.reduce((acc, header, index) => {
        acc[header] = write.values[0][index];
        return acc;
    }, {});
}

failed += test('routeV54PrimaryEntry_successful_v54_result_and_telegram_success_logs_sent', () => {
    const vm = require('vm');
    const fakeSpreadsheet = makeTelegramSendLogSpreadsheetForTest();
    const successfulResult = {
        ok: true,
        status: 'recorded',
        responseText: 'V54 ok registrado',
        record: {
            result_ref: 'LAN_V54_OK_001',
            id_lancamento: 'LAN_V54_OK_001',
            idempotency_key: 'telegram:telegram_update_id:91001',
        },
    };
    const context = vm.createContext({
        PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
        ContentService: { createTextOutput: () => ({ setMimeType: () => {} }) },
        UrlFetchApp: {
            fetch: () => ({ getResponseCode: () => 200 }),
        },
        console: { log: () => {}, warn: () => {}, error: () => {} },
        buildV54ProductionBridgeDeps_: () => ({
            ok: true,
            deps: {
                handleTelegramUpdateV54: () => successfulResult,
                parseTextV54: () => ({}),
                parserOptions: {},
                validateParsedEntryV54: () => ({}),
                recordEntryV54: () => ({}),
                recordOptions: { getSpreadsheet: () => fakeSpreadsheet },
            }
        }),
    });
    vm.runInContext(mainRuntime, context);

    const returned = context.routeV54PrimaryEntry_(
        { update_id: 1, message: { message_id: 2, chat: { id: 123 }, text: 'x' } },
        'x',
        '123',
        { pagador: 'Teste' }
    );

    assert.strictEqual(returned, successfulResult);
    assert.strictEqual(fakeSpreadsheet.writes.length, 1);
    const row = telegramLogRowObject(fakeSpreadsheet.writes[0]);
    assert.strictEqual(row.route, 'V54_PRIMARY');
    assert.strictEqual(row.chat_id, '123');
    assert.strictEqual(row.phase, 'success_response');
    assert.strictEqual(row.status, 'sent');
    assert.strictEqual(row.status_code, 200);
    assert.strictEqual(row.error, '');
    assert.strictEqual(row.result_ref, 'LAN_V54_OK_001');
    assert.strictEqual(row.id_lancamento, 'LAN_V54_OK_001');
    assert.strictEqual(row.idempotency_key, 'telegram:telegram_update_id:91001');
    assert.strictEqual(row.text_preview, 'V54 ok registrado');
    assert.ok(row.sent_at, 'sent_at must be filled for successful sends');
});

failed += test('routeV54PrimaryEntry_successful_v54_result_and_telegram_failure_logs_failed', () => {
    const vm = require('vm');
    const fakeSpreadsheet = makeTelegramSendLogSpreadsheetForTest();
    const successfulResult = {
        ok: true,
        status: 'recorded',
        responseText: 'V54 ok',
        record: {
            result_ref: 'LAN_V54_FAIL_SEND_001',
            id_lancamento: 'LAN_V54_FAIL_SEND_001',
            idempotency_key: 'telegram:telegram_update_id:91002',
        },
    };
    const context = vm.createContext({
        PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
        ContentService: { createTextOutput: () => ({ setMimeType: () => {} }) },
        UrlFetchApp: {
            fetch: () => ({ getResponseCode: () => 403 }),
        },
        console: { log: () => {}, warn: () => {}, error: () => {} },
        buildV54ProductionBridgeDeps_: () => ({
            ok: true,
            deps: {
                handleTelegramUpdateV54: () => successfulResult,
                parseTextV54: () => ({}),
                parserOptions: {},
                validateParsedEntryV54: () => ({}),
                recordEntryV54: () => ({}),
                recordOptions: { getSpreadsheet: () => fakeSpreadsheet },
            }
        }),
    });
    vm.runInContext(mainRuntime, context);

    const returned = context.routeV54PrimaryEntry_(
        { update_id: 1, message: { message_id: 2, chat: { id: 123 }, text: 'x' } },
        'x',
        '123',
        { pagador: 'Teste' }
    );

    assert.strictEqual(returned, successfulResult);
    assert.strictEqual(fakeSpreadsheet.writes.length, 1);
    const row = telegramLogRowObject(fakeSpreadsheet.writes[0]);
    assert.strictEqual(row.phase, 'success_response');
    assert.strictEqual(row.status, 'failed');
    assert.strictEqual(row.status_code, 403);
    assert.strictEqual(row.error, 'telegram_send_failed');
    assert.strictEqual(row.sent_at, '');
});

failed += test('telegram_send_log_failure_does_not_change_v54_result', () => {
    const vm = require('vm');
    const successfulResult = {
        ok: true,
        status: 'recorded',
        responseText: 'V54 ok',
        record: {
            result_ref: 'LAN_V54_OK_002',
            id_lancamento: 'LAN_V54_OK_002',
            idempotency_key: 'telegram:telegram_update_id:91003',
        },
    };
    const context = vm.createContext({
        PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
        ContentService: { createTextOutput: () => ({ setMimeType: () => {} }) },
        UrlFetchApp: {
            fetch: () => ({ getResponseCode: () => 200 }),
        },
        console: { log: () => {}, warn: () => {}, error: () => {} },
        buildV54ProductionBridgeDeps_: () => ({
            ok: true,
            deps: {
                handleTelegramUpdateV54: () => successfulResult,
                parseTextV54: () => ({}),
                parserOptions: {},
                validateParsedEntryV54: () => ({}),
                recordEntryV54: () => ({}),
                recordOptions: { getSpreadsheet: () => { throw new Error('log write unavailable'); } },
            }
        }),
    });
    vm.runInContext(mainRuntime, context);

    const returned = context.routeV54PrimaryEntry_(
        { update_id: 1, message: { message_id: 2, chat: { id: 123 }, text: 'x' } },
        'x',
        '123',
        { pagador: 'Teste' }
    );

    assert.strictEqual(returned, successfulResult);
    assert.strictEqual(returned.ok, true);
});

failed += test('telegram_send_log_redacts_and_truncates_text_preview_and_identifiers', () => {
    const vm = require('vm');
    const fakeSpreadsheet = makeTelegramSendLogSpreadsheetForTest();
    const rawToken = '123456789:ABCdef_SECRET-token';
    const rawOpenAIKey = 'sk-proj-abcdefghijklmnopqrstuvwxyz123456';
    const rawSpreadsheetId = '1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890';
    const rawWebhook = 'raw-webhook-secret';
    const longSecretText = [
        `ok https://api.telegram.org/bot${rawToken}/sendMessage`,
        rawOpenAIKey,
        `webhook_secret=${rawWebhook}`,
        `spreadsheet_id=${rawSpreadsheetId}`,
        'x'.repeat(240),
    ].join(' ');
    const successfulResult = {
        ok: true,
        status: 'recorded',
        responseText: longSecretText,
        record: {
            result_ref: `LAN ${rawOpenAIKey}`,
            id_lancamento: `LAN spreadsheet_id=${rawSpreadsheetId}`,
            idempotency_key: 'telegram:telegram_update_id:91004',
        },
    };
    const context = vm.createContext({
        PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
        ContentService: { createTextOutput: () => ({ setMimeType: () => {} }) },
        UrlFetchApp: {
            fetch: () => ({ getResponseCode: () => 200 }),
        },
        console: { log: () => {}, warn: () => {}, error: () => {} },
        buildV54ProductionBridgeDeps_: () => ({
            ok: true,
            deps: {
                handleTelegramUpdateV54: () => successfulResult,
                parseTextV54: () => ({}),
                parserOptions: {},
                validateParsedEntryV54: () => ({}),
                recordEntryV54: () => ({}),
                recordOptions: { getSpreadsheet: () => fakeSpreadsheet },
            }
        }),
    });
    vm.runInContext(mainRuntime, context);

    context.routeV54PrimaryEntry_(
        { update_id: 1, message: { message_id: 2, chat: { id: 123 }, text: 'x' } },
        'x',
        '123',
        { pagador: 'Teste' }
    );

    const row = telegramLogRowObject(fakeSpreadsheet.writes[0]);
    const combined = JSON.stringify(row);
    [rawToken, rawOpenAIKey, rawWebhook, rawSpreadsheetId].forEach((secret) => {
        assert.strictEqual(combined.includes(secret), false, `${secret} must not leak`);
    });
    assert.ok(row.text_preview.length <= 160, 'text_preview must be truncated');
    assert.ok(row.text_preview.includes('[REDACTED]'), 'text_preview should show redaction marker');
    assert.ok(row.result_ref.includes('[REDACTED]'));
    assert.ok(row.id_lancamento.includes('[REDACTED]'));
});

failed += test('routeV54PrimaryEntry_logs_redacted_send_failure_after_success_without_changing_result', () => {
    const vm = require('vm');
    const sentMessages = [];
    const logs = [];
    const rawToken = '123456789:ABCdef_SECRET-token';
    const rawOpenAIKey = 'sk-proj-abcdefghijklmnopqrstuvwxyz123456';
    const rawSpreadsheetId = '1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890';
    const successfulResult = {
        ok: true,
        status: 'recorded',
        decision: 'planned_idempotent_write',
        responseText: 'V54 ok',
        record: {
            ok: true,
            result_ref: `LAN_V54_OK ${rawOpenAIKey}`,
            id_lancamento: `LAN_V54_OK spreadsheet_id=${rawSpreadsheetId}`,
        },
    };
    const mockEnv = {
        PropertiesService: {
            getScriptProperties: () => ({
                getProperty: (k) => {
                    if (k === 'TELEGRAM_TOKEN') return rawToken;
                    if (k === 'AUTHORIZED') return '{}';
                    return null;
                }
            })
        },
        ContentService: { createTextOutput: () => ({ setMimeType: () => {} }) },
        UrlFetchApp: {
            fetch: (url, opts) => {
                sentMessages.push(JSON.parse(opts.payload).text);
                return { getResponseCode: () => 403 };
            }
        },
        console: {
            log: () => {},
            warn: (...args) => logs.push(args.join(' ')),
            error: (...args) => logs.push(args.join(' ')),
        },
        buildV54ProductionBridgeDeps_: () => ({
            ok: true,
            deps: {
                handleTelegramUpdateV54: () => successfulResult,
                parseTextV54: () => ({}),
                parserOptions: {},
                validateParsedEntryV54: () => ({}),
                recordEntryV54: () => ({}),
                recordOptions: {},
            }
        }),
    };
    const context = vm.createContext(mockEnv);
    vm.runInContext(mainRuntime, context);
    context._loadSecrets();

    const returned = context.routeV54PrimaryEntry_(
        { update_id: 1, message: { message_id: 2, chat: { id: 123 }, text: 'x' } },
        'x',
        '123',
        { pagador: 'Teste' }
    );

    assert.strictEqual(returned, successfulResult, 'successful V54 result must remain unchanged');
    assert.strictEqual(returned.ok, true);
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0], 'V54 ok');

    const combined = logs.join('\n');
    assert.ok(combined.includes('V54 primary Telegram send failed:'), 'V54 send failure diagnostic must be logged');
    assert.ok(combined.includes('"route":"V54_PRIMARY"'));
    assert.ok(combined.includes('"phase":"success_response"'));
    assert.ok(combined.includes('"statusCode":403'));
    assert.ok(combined.includes('"decision":"planned_idempotent_write"'));
    assert.ok(combined.includes('"status":"recorded"'));
    [rawToken, rawOpenAIKey, rawSpreadsheetId].forEach((secret) => {
        assert.strictEqual(combined.includes(secret), false, `${secret} must not leak`);
    });
    assert.ok(combined.includes('[REDACTED]'), 'diagnostic should show redaction marker');
});

failed += test('v54_user_facing_response_never_contains_raw_secret_or_stack_trace', () => {
    const vm = require('vm');
    const rawToken = '123456789:ABCdef_SECRET-token';
    const rawOpenAIKey = 'sk-proj-abcdefghijklmnopqrstuvwxyz123456';
    const rawSpreadsheetId = '1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890';
    const context = vm.createContext({
        PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
        ContentService: { createTextOutput: () => ({ setMimeType: () => {} }) },
        console: { log: () => {}, warn: () => {}, error: () => {} },
    });
    vm.runInContext([mainRuntime, actionsV54, actionsV54Helpers, parserV54, viewsV54, handlerV54].join('\n'), context);

    const result = context.handleTelegramUpdateV54(
        { update_id: 1, message: { message_id: 2, chat: { id: 123 }, text: 'x' } },
        {
            user: { pagador: 'Teste' },
            parseTextV54: () => ({
                ok: false,
                errors: [{
                    code: 'PARSER_RAW_FAILURE',
                    field: 'parser',
                    message: `Error: https://api.telegram.org/bot${rawToken}/sendMessage ${rawOpenAIKey} webhook_secret=raw-webhook spreadsheet_id=${rawSpreadsheetId}\n    at Parser.gs:99`
                }]
            }),
            formatResponse: () => `Error: bot${rawToken} ${rawOpenAIKey} proxy_secret=raw-proxy spreadsheet_id=${rawSpreadsheetId}\n    at Handler.gs:42`,
        }
    );

    assert.ok(result.responseText.indexOf('V54:') === 0, 'must return a generic V54 fallback');
    [rawToken, rawOpenAIKey, 'raw-proxy', rawSpreadsheetId, 'Handler.gs:42', ' at '].forEach((secret) => {
        assert.strictEqual(result.responseText.includes(secret), false, `${secret} must not be user-facing`);
    });
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
    vm.runInContext(mainRuntime, context);

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
