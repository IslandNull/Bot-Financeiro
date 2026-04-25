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
    CONFIG.SPREADSHEET_ID = p.getProperty('SPREADSHEET_ID');
    CONFIG.AUTHORIZED = JSON.parse(p.getProperty('AUTHORIZED') || '{}');
}

// ============================================================
// ENTRY POINT — Telegram webhook
// ============================================================
function doPost(e) {
    _loadSecrets();
    try {
        const update = JSON.parse(e.postData.contents);
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

// ============================================================
// API ENDPOINT (GET) — Exportar estado para IAs locais
// ============================================================
function doGet(e) {
    _loadSecrets();
    const token = e.parameter.token;
    
    if (!token || token !== CONFIG.SYNC_SECRET) {
        return ContentService.createTextOutput('🚫 Acesso Negado.').setMimeType(ContentService.MimeType.TEXT);
    }
    
    if (e.parameter.action === 'exportState') {
        const state = exportSpreadsheetState();
        return ContentService.createTextOutput(state).setMimeType(ContentService.MimeType.TEXT);
    }
    
    return ContentService.createTextOutput('Bot Financeiro API V53').setMimeType(ContentService.MimeType.TEXT);
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
