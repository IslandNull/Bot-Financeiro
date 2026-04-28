// ============================================================
// TELEGRAM NOTIFICATION RUNTIME
// Shared notification boundary for Apps Script globals.
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
