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
            handleCommand(text, chatId, user);
        } else {
            handleEntry(text, chatId, user);
        }
    } catch (err) {
        console.error('doPost error:', err, err.stack);
    }
    return _ok();
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
function sendTelegram(chatId, text) {
    UrlFetchApp.fetch(`https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/sendMessage`, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown'
        }),
        muteHttpExceptions: true
    });
}

function formatBRL(n) {
    if (typeof n !== 'number') return 'R$ 0,00';
    return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
