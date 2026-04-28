// ============================================================
// V54 TELEGRAM SEND LOG
// Best-effort persistent observability for V54_PRIMARY replies.
// ============================================================

var V54_TELEGRAM_SEND_LOG_SHEET = 'Telegram_Send_Log';
var V54_TELEGRAM_SEND_LOG_HEADERS = getV54Headers(V54_TELEGRAM_SEND_LOG_SHEET);

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
