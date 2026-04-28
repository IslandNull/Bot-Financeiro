// ============================================================
// MAIN — CONFIG global, entry point (doPost) e utilitários (sendTelegram, formatBRL)
// Google Apps Script: todos os arquivos compartilham o mesmo escopo global.
// Este arquivo carrega primeiro (por convenção alfabética/manifest), expondo CONFIG.
// ============================================================

// ============================================================
// CONFIG — valores não-sensíveis inline; segredos via PropertiesService
// Para configurar os segredos, execute setupSecrets() uma vez no Editor
// ============================================================
const CONFIG = {
    MODEL: 'gpt-5-nano',
    TIMEZONE: 'America/Sao_Paulo',
    SHEETS: {
        lancamentos: 'Lançamentos',
        config: 'Config',
        dashboard: 'Dashboard',
        investimentos: 'Investimentos',
        parcelas: 'Parcelas'
    }
};

const ROUTING_MODES = Object.freeze({
    V53_CURRENT: 'V53_CURRENT',
    V54_SHADOW: 'V54_SHADOW',
    V54_PRIMARY: 'V54_PRIMARY'
});

var V54_TELEGRAM_SEND_LOG_SHEET = 'Telegram_Send_Log';
var V54_TELEGRAM_SEND_LOG_HEADERS = [
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

function getRoutingMode_() {
    const p = PropertiesService.getScriptProperties();
    const raw = p.getProperty('V54_ROUTING_MODE');
    if (raw === ROUTING_MODES.V54_SHADOW) return ROUTING_MODES.V54_SHADOW;
    if (raw === ROUTING_MODES.V54_PRIMARY) return ROUTING_MODES.V54_PRIMARY;
    return ROUTING_MODES.V53_CURRENT;
}

function diagnoseRoutingMode() {
    _loadSecrets();
    const p = PropertiesService.getScriptProperties();
    const rawMode = p.getProperty('V54_ROUTING_MODE');
    const effectiveMode = getRoutingMode_();
    
    const allowedModes = Object.keys(ROUTING_MODES).map(key => ROUTING_MODES[key]);
    const rawModeConfigured = rawMode !== null && rawMode !== undefined;
    const rawModeKnown = rawModeConfigured && allowedModes.indexOf(rawMode) !== -1;
    
    let fallbackReason = 'none';
    if (!rawModeConfigured) {
        fallbackReason = 'missing';
    } else if (rawMode === '') {
        fallbackReason = 'empty';
    } else if (!rawModeKnown) {
        fallbackReason = 'invalid';
    }

    const report = {
        ok: true,
        effectiveMode: effectiveMode,
        rawModeConfigured: rawModeConfigured,
        rawModeKnown: rawModeKnown,
        fallbackReason: fallbackReason,
        allowedModes: allowedModes
    };
    
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
        const routingMode = getRoutingMode_();

        if (!user) {
            sendTelegram(chatId, '🚫 Você não está autorizado a usar este bot.');
            return _ok();
        }

        if (text.startsWith('/')) {
            handleCommand(text, chatId, user);
        } else if (routingMode === ROUTING_MODES.V54_PRIMARY) {
            routeV54PrimaryEntry_(update, text, chatId, user);
        } else if (routingMode === ROUTING_MODES.V54_SHADOW) {
            handleEntry(text, chatId, user);
            runV54ShadowDiagnostics_(update, text, chatId, user);
        } else {
            handleEntry(text, chatId, user);
        }
    } catch (err) {
        console.error('doPost error:', JSON.stringify(redactSensitiveDiagnostics_({
            message: err && err.message,
            stack: err && err.stack
        })));
    }
    return _ok();
}

function routeV54PrimaryEntry_(update, text, chatId, user) {
    const fallbackMessage = 'Não consegui registrar esse lançamento com segurança agora. Revise a mensagem ou tente novamente em instantes.';
    const bridge = buildV54ProductionBridgeDeps_({
        mode: ROUTING_MODES.V54_PRIMARY,
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

function logV54PrimaryTelegramSendAttempt_(phase, sendResult, v54Result, chatId, text, options) {
    var normalizedSendResult = sendResult && typeof sendResult === 'object'
        ? sendResult
        : { ok: false, statusCode: null, error: 'telegram_send_result_missing' };
    var sendStatus = normalizedSendResult.ok === true ? 'sent' : 'failed';

    var record = v54Result && v54Result.record && typeof v54Result.record === 'object'
        ? v54Result.record
        : {};
    var identifiers = {
        result_ref: v54Result && v54Result.result_ref ? v54Result.result_ref : (record.result_ref || ''),
        id_lancamento: v54Result && v54Result.id_lancamento ? v54Result.id_lancamento : (record.id_lancamento || ''),
        idempotency_key: v54Result && v54Result.idempotency_key ? v54Result.idempotency_key : (record.idempotency_key || ''),
    };

    appendTelegramSendLogV54_({
        route: ROUTING_MODES.V54_PRIMARY,
        chatId: chatId,
        phase: phase,
        status: sendStatus,
        statusCode: normalizedSendResult.statusCode === undefined ? null : normalizedSendResult.statusCode,
        error: sendStatus === 'sent' ? '' : (normalizedSendResult.error || 'telegram_send_failed'),
        result_ref: identifiers.result_ref,
        id_lancamento: identifiers.id_lancamento,
        idempotency_key: identifiers.idempotency_key,
        text: text,
    }, options);

    if (sendStatus === 'sent') return;

    var diagnostic = {
        route: ROUTING_MODES.V54_PRIMARY,
        phase: String(phase || ''),
        statusCode: normalizedSendResult.statusCode === undefined ? null : normalizedSendResult.statusCode,
        error: normalizedSendResult.error || 'telegram_send_failed',
        result_ref: identifiers.result_ref,
        id_lancamento: identifiers.id_lancamento,
        idempotency_key: identifiers.idempotency_key,
        decision: v54Result && v54Result.decision ? v54Result.decision : (record.decision || ''),
        status: v54Result && v54Result.status ? v54Result.status : '',
    };

    console.warn('V54 primary Telegram send failed:', JSON.stringify(redactSensitiveDiagnostics_(diagnostic)));
}

function appendTelegramSendLogV54_(input, options) {
    var opts = options && typeof options === 'object' ? options : {};
    try {
        var spreadsheet = typeof opts.getSpreadsheet === 'function'
            ? opts.getSpreadsheet()
            : getTelegramSendLogSpreadsheetV54_();
        var sheet = spreadsheet && spreadsheet.getSheetByName(V54_TELEGRAM_SEND_LOG_SHEET);
        if (!sheet) {
            console.warn('Telegram_Send_Log append skipped: missing sheet.');
            return { ok: false, skipped: true, error: 'missing_sheet' };
        }

        var headerCheck = validateTelegramSendLogHeadersV54_(sheet);
        if (!headerCheck.ok) {
            console.warn('Telegram_Send_Log append skipped:', JSON.stringify(headerCheck));
            return headerCheck;
        }

        var now = typeof opts.now === 'function' ? opts.now() : new Date().toISOString();
        var rowObject = {
            id_notificacao: makeTelegramSendLogIdV54_(now),
            created_at: now,
            route: String(input && input.route ? input.route : ''),
            chat_id: String(input && input.chatId !== undefined && input.chatId !== null ? input.chatId : ''),
            phase: String(input && input.phase ? input.phase : ''),
            status: input && input.status === 'sent' ? 'sent' : 'failed',
            status_code: input && input.statusCode !== undefined && input.statusCode !== null ? input.statusCode : '',
            error: input && input.error ? redactSensitiveText_(input.error) : '',
            result_ref: input && input.result_ref ? redactSensitiveText_(input.result_ref) : '',
            id_lancamento: input && input.id_lancamento ? redactSensitiveText_(input.id_lancamento) : '',
            idempotency_key: input && input.idempotency_key ? redactSensitiveText_(input.idempotency_key) : '',
            text_preview: makeTelegramSendTextPreviewV54_(input && input.text),
            sent_at: input && input.status === 'sent' ? now : '',
        };
        var rowValues = V54_TELEGRAM_SEND_LOG_HEADERS.map(function(header) {
            return rowObject[header] === undefined || rowObject[header] === null ? '' : rowObject[header];
        });
        sheet.getRange(sheet.getLastRow() + 1, 1, 1, V54_TELEGRAM_SEND_LOG_HEADERS.length).setValues([rowValues]);
        return { ok: true, rowObject: rowObject };
    } catch (error) {
        console.warn('Telegram_Send_Log append failed safely:', JSON.stringify(redactSensitiveDiagnostics_({
            message: error && error.message,
            stack: error && error.stack,
        })));
        return { ok: false, error: 'telegram_send_log_append_failed' };
    }
}

function getTelegramSendLogSpreadsheetV54_() {
    _loadSecrets();
    return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function validateTelegramSendLogHeadersV54_(sheet) {
    var headers = sheet.getRange(1, 1, 1, V54_TELEGRAM_SEND_LOG_HEADERS.length).getValues()[0];
    for (var i = 0; i < V54_TELEGRAM_SEND_LOG_HEADERS.length; i++) {
        if (headers[i] !== V54_TELEGRAM_SEND_LOG_HEADERS[i]) {
            return { ok: false, error: 'header_mismatch', field: V54_TELEGRAM_SEND_LOG_SHEET };
        }
    }
    return { ok: true };
}

function makeTelegramSendLogIdV54_(timestamp) {
    var stamp = String(timestamp || new Date().toISOString()).replace(/[^0-9A-Za-z]/g, '').slice(0, 17);
    var randomPart = Math.floor(Math.random() * 1000000000).toString(36).toUpperCase();
    return 'TEL_SEND_' + stamp + '_' + randomPart;
}

function makeTelegramSendTextPreviewV54_(text) {
    var redacted = redactSensitiveText_(text);
    var normalized = redacted.replace(/\s+/g, ' ').trim();
    if (normalized.length <= 160) return normalized;
    return normalized.slice(0, 160);
}

function runV54ShadowDiagnostics_(update, text, chatId, user) {
    const bridge = buildV54ProductionBridgeDeps_({
        mode: ROUTING_MODES.V54_SHADOW,
        chatId: chatId,
        text: text,
        user: user,
    }, { shadowNoWrite: true });
    if (!bridge.ok) {
        console.warn('V54 shadow diagnostics blocked:', JSON.stringify(redactV54ProductionBridgeObject_(bridge)));
        return;
    }

    try {
        const shadowResult = bridge.deps.handleTelegramUpdateV54(update, {
            user: user,
            usersByChatId: CONFIG.AUTHORIZED,
            parseTextV54: bridge.deps.parseTextV54,
            parserOptions: bridge.deps.parserOptions,
            validateParsedEntryV54: bridge.deps.validateParsedEntryV54,
            recordEntryV54: recordEntryV54ShadowNoWrite_,
            recordOptions: bridge.deps.recordOptions,
        });
        console.log('V54 shadow diagnostics:', JSON.stringify(redactV54ProductionBridgeObject_(shadowResult)));
    } catch (error) {
        console.warn('V54 shadow diagnostics failed safely.');
    }
}

function recordEntryV54ShadowNoWrite_(parsedEntry) {
    return {
        ok: false,
        sheet: '',
        rowNumber: null,
        decision: 'shadow_no_write',
        retryable: false,
        errors: [],
        shadow: {
            noWrite: true,
            tipo_evento: parsedEntry && parsedEntry.tipo_evento ? String(parsedEntry.tipo_evento) : '',
            descricao: parsedEntry && parsedEntry.descricao ? String(parsedEntry.descricao) : '',
        },
    };
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
    return ContentService.createTextOutput('Bot Financeiro API V53 (read-only GET)').setMimeType(ContentService.MimeType.TEXT);
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

// ============================================================
// UTILITÁRIOS COMPARTILHADOS
// ============================================================
function redactSensitiveText_(value) {
    var text = String(value === undefined || value === null ? '' : value);
    return text
        .replace(/https:\/\/api\.telegram\.org\/bot[^\/\s"'<>]+/gi, 'https://api.telegram.org/bot[REDACTED]')
        .replace(/\bbot\d{6,}:[A-Za-z0-9_-]+/g, 'bot[REDACTED]')
        .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, 'sk-[REDACTED]')
        .replace(/([?&](?:webhook_secret|telegram_secret|proxy_secret)=)[^&\s"'<>]+/gi, '$1[REDACTED]')
        .replace(/\b((?:webhook_secret|telegram_secret|proxy_secret)\s*[:=]\s*)[^&\s"'<>]+/gi, '$1[REDACTED]')
        .replace(/\b((?:spreadsheet_id|SPREADSHEET_ID)\s*[:=]\s*)[A-Za-z0-9_-]{20,}/g, '$1[REDACTED]')
        .replace(/\n\s*at\s+[^\n]+/g, '\n[STACK_REDACTED]')
        .replace(/\b[\w.-]+\.gs:\d+(?::\d+)?\b/g, '[STACK_REDACTED]');
}

function redactSensitiveDiagnostics_(value) {
    if (Array.isArray(value)) {
        return value.map(redactSensitiveDiagnostics_);
    }
    if (value === undefined || value === null) return value;
    if (typeof value === 'string') {
        return redactSensitiveText_(value);
    }
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value !== 'object') {
        return redactSensitiveText_(String(value));
    }

    var redacted = {};
    Object.keys(value).forEach(function(key) {
        var lower = String(key).toLowerCase();
        if (lower.indexOf('token') !== -1
            || lower.indexOf('secret') !== -1
            || lower.indexOf('api_key') !== -1
            || lower === 'apikey'
            || lower === 'authorization'
            || lower === 'stack'
            || lower === 'spreadsheet_id') {
            redacted[key] = '[REDACTED]';
            return;
        }
        redacted[key] = redactSensitiveDiagnostics_(value[key]);
    });
    return redacted;
}

function makeGenericTelegramFailure_(statusCode) {
    return {
        ok: false,
        statusCode: statusCode === undefined ? null : statusCode,
        error: 'telegram_send_failed'
    };
}

function sendTelegram(chatId, text) {
    var url = 'https://api.telegram.org/bot' + CONFIG.TELEGRAM_TOKEN + '/sendMessage';
    var payload = {
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown'
    };

    try {
        var response = UrlFetchApp.fetch(url, {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        });
        var statusCode = response && typeof response.getResponseCode === 'function'
            ? response.getResponseCode()
            : 200;
        var ok = statusCode >= 200 && statusCode < 300;
        if (!ok) {
            console.warn('sendTelegram non-ok:', JSON.stringify(redactSensitiveDiagnostics_({
                statusCode: statusCode,
                url: url
            })));
        }
        return { ok: ok, statusCode: statusCode, error: ok ? '' : 'telegram_send_failed' };
    } catch (error) {
        console.error('sendTelegram failed:', JSON.stringify(redactSensitiveDiagnostics_({
            message: error && error.message,
            stack: error && error.stack,
            url: url
        })));
        return makeGenericTelegramFailure_(null);
    }
}

function formatBRL(n) {
    if (typeof n !== 'number') return 'R$ 0,00';
    return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
