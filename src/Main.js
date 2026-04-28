// ============================================================
// MAIN — CONFIG global, entry points, routing mode e utilitários mínimos.
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

function formatBRL(n) {
    if (typeof n !== 'number') return 'R$ 0,00';
    return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
