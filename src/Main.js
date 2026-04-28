// ============================================================
// MAIN — CONFIG global, entry points e utilitários mínimos.
// Google Apps Script: todos os arquivos compartilham o mesmo escopo global.
// ============================================================

const CONFIG = {
    MODEL: 'gpt-5-nano',
    TIMEZONE: 'America/Sao_Paulo',
    SHEETS: {
        lancamentos: 'Lançamentos_V54',
        config: 'Config',
        dashboard: 'Dashboard',
        investimentos: 'Investimentos',
        parcelas: 'Parcelas'
    }
};

function diagnoseV54PrimaryReadiness() {
    _loadSecrets();
    const spreadsheetId = CONFIG.SPREADSHEET_ID;
    const report = {
        ok: true,
        properties: {
            OPENAI_API_KEY: !!CONFIG.OPENAI_API_KEY,
            TELEGRAM_TOKEN: !!CONFIG.TELEGRAM_TOKEN,
            SPREADSHEET_ID: !!CONFIG.SPREADSHEET_ID,
            WEBHOOK_SECRET: !!CONFIG.WEBHOOK_SECRET,
            AUTHORIZED: false
        },
        sheets: {},
        parserContext: false,
        noV53Routes: true,
        errors: []
    };

    if (!CONFIG.OPENAI_API_KEY) { report.ok = false; report.errors.push('OPENAI_API_KEY is missing'); }
    if (!CONFIG.TELEGRAM_TOKEN) { report.ok = false; report.errors.push('TELEGRAM_TOKEN is missing'); }
    if (!CONFIG.SPREADSHEET_ID) { report.ok = false; report.errors.push('SPREADSHEET_ID is missing'); }
    if (!CONFIG.WEBHOOK_SECRET) { report.ok = false; report.errors.push('WEBHOOK_SECRET is missing'); }

    if (CONFIG.AUTHORIZED && typeof CONFIG.AUTHORIZED === 'object' && Object.keys(CONFIG.AUTHORIZED).length > 0) {
        report.properties.AUTHORIZED = true;
    } else {
        report.ok = false;
        report.errors.push('AUTHORIZED is missing or empty');
    }

    if (spreadsheetId) {
        try {
            const ss = SpreadsheetApp.openById(spreadsheetId);
            const sheetsToCheck = typeof getV54SheetNames === 'function' ? getV54SheetNames() : [];

            if (sheetsToCheck.length === 0) {
                report.ok = false;
                report.errors.push('getV54SheetNames is not available or empty');
            }

            sheetsToCheck.forEach(function(name) {
                const sheet = ss.getSheetByName(name);
                report.sheets[name] = { exists: !!sheet, headersOk: false };
                if (!sheet) {
                    report.ok = false;
                    report.errors.push('Missing required sheet: ' + name);
                } else {
                    const expectedHeaders = typeof getV54Headers === 'function' ? getV54Headers(name) : [];
                    if (expectedHeaders.length > 0) {
                        const actualHeaders = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0].filter(function(h) { return String(h).trim() !== ''; });
                        let headersMatch = actualHeaders.length === expectedHeaders.length;
                        if (headersMatch) {
                            for (let i = 0; i < expectedHeaders.length; i++) {
                                if (String(actualHeaders[i]).trim() !== String(expectedHeaders[i]).trim()) {
                                    headersMatch = false;
                                    break;
                                }
                            }
                        }
                        report.sheets[name].headersOk = headersMatch;
                        if (!headersMatch) {
                            report.ok = false;
                            report.errors.push('Header mismatch in sheet: ' + name);
                        }
                    }
                }
            });

            if (typeof getParserContextV54 === 'function') {
                const contextCheck = getParserContextV54({}, { getSpreadsheet: function() { return ss; } });
                report.parserContext = contextCheck.ok;
                if (!contextCheck.ok) {
                    report.ok = false;
                    report.errors.push('Parser context check failed');
                }
            } else {
                report.parserContext = false;
                report.ok = false;
                report.errors.push('getParserContextV54 is not globally available');
            }
        } catch(e) {
            report.ok = false;
            report.errors.push('Failed to open spreadsheet by ID');
        }
    }

    const p = PropertiesService.getScriptProperties();
    report.properties.V54_ROUTING_MODE = p.getProperty('V54_ROUTING_MODE') || null;

    console.log(JSON.stringify(report, null, 2));
    return report;
}

const PROVISAO_CATS = [
    'Roupas', 'Peças íntimas', 'Calçado', 'Presentes',
    'Cuidado pessoal', 'Dentista', 'Coparticipação médica',
    'Farmácia', 'Óleo moto', 'IPTU', 'Compras Shopee/ML', 'Reserva imprevistos'
];

function _loadSecrets() {
    const p = PropertiesService.getScriptProperties();
    CONFIG.OPENAI_API_KEY = p.getProperty('OPENAI_API_KEY');
    CONFIG.TELEGRAM_TOKEN = p.getProperty('TELEGRAM_TOKEN');
    CONFIG.SYNC_SECRET = p.getProperty('SYNC_SECRET');
    CONFIG.WEBHOOK_SECRET = p.getProperty('WEBHOOK_SECRET');
    CONFIG.VALTOWN_WEBHOOK_URL = p.getProperty('VALTOWN_WEBHOOK_URL');
    CONFIG.SPREADSHEET_ID = p.getProperty('SPREADSHEET_ID');
    CONFIG.AUTHORIZED = JSON.parse(p.getProperty('AUTHORIZED') || '{}');
}

// ============================================================
// ENTRY POINT — Telegram webhook
// ============================================================
function doPost(e) {
    _loadSecrets();
    try {
        const update = parseTelegramUpdate_(e);
        if (!isWebhookAuthorized_(e, update)) {
            console.warn('doPost blocked: missing or invalid WEBHOOK_SECRET.');
            return _ok();
        }

        const msg = update.message || update.edited_message;
        if (!msg || !msg.text) return _ok();

        const chatId = String(msg.chat.id);
        const text = msg.text.trim();
        const user = CONFIG.AUTHORIZED[chatId];

        if (!user) {
            sendTelegram(chatId, '🚫 Você não está autorizado a usar este bot.');
            return _ok();
        }

        if (text.startsWith('/')) {
            handleCommandV54_(text, chatId, user);
        } else {
            routeV54PrimaryEntry_(update, text, chatId, user);
        }
    } catch (err) {
        console.error('doPost error:', JSON.stringify(redactSensitiveDiagnostics_({
            message: err && err.message,
            stack: err && err.stack
        })));
    }
    return _ok();
}

function handleCommandV54_(text, chatId, user) {
    if (text === '/start' || text === '/help') {
        const msg = "Bot Financeiro V54 (Primary Mode).\n\n" +
                    "Envie seus gastos naturalmente.\n" +
                    "Exemplo: '50 almoco ita cred mar'";
        sendTelegram(chatId, msg);
        return;
    }
    const legacyCommands = ['/resumo', '/saldo', '/hoje', '/desfazer', '/transferir', '/invest', '/manter', '/parcela', '/parcelas', '/fatura'];
    const cmd = text.split(' ')[0].toLowerCase();

    if (legacyCommands.indexOf(cmd) !== -1) {
        sendTelegram(chatId, "Comando não suportado ainda no V54.");
    } else {
        sendTelegram(chatId, "Comando desconhecido.");
    }
}

function routeV54PrimaryEntry_(update, text, chatId, user) {
    const fallbackMessage = 'Não consegui registrar esse lançamento com segurança agora. Revise a mensagem ou tente novamente em instantes.';
    const bridge = buildV54ProductionBridgeDeps_({
        mode: 'V54_PRIMARY',
        chatId: chatId,
        text: text,
        user: user,
    }, {});

    if (!bridge.ok) {
        console.warn('V54 primary blocked:', JSON.stringify(redactV54ProductionBridgeObject_(bridge)));
        const sendResult = sendTelegram(chatId, fallbackMessage);
        logV54PrimaryTelegramSendAttempt_('bridge_blocked_fallback', sendResult, bridge, chatId, fallbackMessage);
        return bridge;
    }

    let result;
    try {
        result = bridge.deps.handleTelegramUpdateV54(update, {
            user: user,
            usersByChatId: CONFIG.AUTHORIZED,
            parseTextV54: bridge.deps.parseTextV54,
            parserOptions: bridge.deps.parserOptions,
            validateParsedEntryV54: bridge.deps.validateParsedEntryV54,
            recordEntryV54: bridge.deps.recordEntryV54,
            recordOptions: bridge.deps.recordOptions,
        });
    } catch (error) {
        console.error('V54 primary runtime failed safely:', JSON.stringify(redactSensitiveDiagnostics_({
            message: error && error.message,
            stack: error && error.stack
        })));
        const sendResult = sendTelegram(chatId, fallbackMessage);
        logV54PrimaryTelegramSendAttempt_('runtime_exception_fallback', sendResult, {
            ok: false,
            status: 'runtime_exception',
        }, chatId, fallbackMessage, { getSpreadsheet: bridge.deps.recordOptions.getSpreadsheet });
        return {
            ok: false,
            status: 'runtime_exception',
            errors: [{ code: 'V54_PRIMARY_RUNTIME_EXCEPTION', field: 'runtime', message: 'V54 primary runtime failed safely.' }],
        };
    }

    if (result && result.ok === true && typeof result.responseText === 'string' && result.responseText.trim()) {
        const sendResult = sendTelegram(chatId, result.responseText.trim());
        logV54PrimaryTelegramSendAttempt_('success_response', sendResult, result, chatId, result.responseText.trim(), { getSpreadsheet: bridge.deps.recordOptions.getSpreadsheet });
        return result;
    }

    console.warn('V54 primary returned non-ok result:', JSON.stringify(redactV54ProductionBridgeObject_(result)));
    const sendResult = sendTelegram(chatId, fallbackMessage);
    logV54PrimaryTelegramSendAttempt_('non_ok_fallback', sendResult, result, chatId, fallbackMessage, { getSpreadsheet: bridge.deps.recordOptions.getSpreadsheet });
    return result;
}

function _ok() { return ContentService.createTextOutput(''); }

function parseTelegramUpdate_(e) {
    if (!e || !e.postData || !e.postData.contents) {
        throw new Error('Missing POST body.');
    }
    return JSON.parse(e.postData.contents);
}

function isWebhookAuthorized_(e, update) {
    if (!CONFIG.WEBHOOK_SECRET) return false;
    const provided = extractWebhookSecret_(e, update);
    return safeCompare_(provided, CONFIG.WEBHOOK_SECRET);
}

function extractWebhookSecret_(e, update) {
    const params = (e && e.parameter) || {};
    const candidates = [
        params.webhook_secret,
        params.telegram_secret,
        update && update._webhook_secret,
        update && update._bot_financeiro_secret,
        update && update.webhook_secret,
        update && update.proxy_secret
    ];

    for (let i = 0; i < candidates.length; i++) {
        if (typeof candidates[i] === 'string' && candidates[i]) return candidates[i];
    }
    return '';
}

// ============================================================
// API ENDPOINT (GET) — Exportar estado para IAs locais
// ============================================================
function doGet(e) {
    _loadSecrets();
    const action = e && e.parameter ? e.parameter.action : '';

    if (!isSyncAuthorized_(e)) {
        return ContentService.createTextOutput('🚫 Acesso Negado.').setMimeType(ContentService.MimeType.TEXT);
    }

    if (action === 'exportState') {
        const state = exportSpreadsheetState();
        return ContentService.createTextOutput(state).setMimeType(ContentService.MimeType.TEXT);
    }

    if (isBlockedMutatingGetAction_(action)) {
        return ContentService
            .createTextOutput(`BLOCKED: mutating action "${action}" is not allowed over GET.`)
            .setMimeType(ContentService.MimeType.TEXT);
    }
    return ContentService.createTextOutput('Bot Financeiro API V54 (read-only GET)').setMimeType(ContentService.MimeType.TEXT);
}

function isSyncAuthorized_(e) {
    const token = e && e.parameter ? e.parameter.token : '';
    return Boolean(CONFIG.SYNC_SECRET) && safeCompare_(String(token || ''), CONFIG.SYNC_SECRET);
}

function isBlockedMutatingGetAction_(action) {
    return ['forceFixAllFormulas', 'runV53AporteTest', 'applySetupV54', 'applySeedV54'].indexOf(action) !== -1;
}

function safeCompare_(candidate, expected) {
    if (typeof candidate !== 'string' || typeof expected !== 'string' || !candidate || !expected) return false;

    let diff = candidate.length ^ expected.length;
    const maxLength = Math.max(candidate.length, expected.length);
    for (let i = 0; i < maxLength; i++) {
        diff |= (candidate.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
    }
    return diff === 0;
}

function withScriptLock(label, fn) {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
        return fn();
    } finally {
        lock.releaseLock();
    }
}

function formatBRL(n) {
    if (typeof n !== 'number') return 'R$ 0,00';
    return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
