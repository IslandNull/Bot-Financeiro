// ============================================================
// RUNNER V54 PRODUCTION BRIDGE - controlled runtime deps
// ============================================================
// This bridge builds explicit runtime dependencies for V54 modes.
// It does not execute real services while building dependencies.

function buildV54ProductionBridgeDeps_(runtimeContext, options) {
    var context = runtimeContext && typeof runtimeContext === 'object' ? runtimeContext : {};
    var opts = options && typeof options === 'object' ? options : {};
    var validation = validateV54ProductionConfig_(CONFIG, {
        requireSpreadsheet: true,
        requireOpenAI: true,
    });

    if (!validation.ok) {
        return makeV54ProductionFailure_('v54_production_config_invalid', validation.errors);
    }

    if (typeof handleTelegramUpdateV54 !== 'function') {
        return makeV54ProductionFailure_('v54_production_dependency_missing', [
            { code: 'V54_HANDLER_REQUIRED', field: 'handleTelegramUpdateV54', message: 'handleTelegramUpdateV54 must exist for V54 runtime bridge.' },
        ]);
    }
    if (typeof parseTextV54OpenAI !== 'function') {
        return makeV54ProductionFailure_('v54_production_dependency_missing', [
            { code: 'V54_PARSER_REQUIRED', field: 'parseTextV54OpenAI', message: 'parseTextV54OpenAI must exist for V54 runtime bridge.' },
        ]);
    }
    if (typeof getParserContextV54 !== 'function') {
        return makeV54ProductionFailure_('v54_production_dependency_missing', [
            { code: 'V54_CONTEXT_REQUIRED', field: 'getParserContextV54', message: 'getParserContextV54 must exist for V54 runtime bridge.' },
        ]);
    }

    var getSpreadsheet = function() {
        return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    };

    var withLock = function(label, fn) {
        return withScriptLock(label, fn);
    };

    var bridgeDeps = {
        mode: context.mode || '',
        handleTelegramUpdateV54: handleTelegramUpdateV54,
        parseTextV54: function(text, parserContext, parserOptions) {
            return parseTextV54OpenAI(text, parserContext, parserOptions);
        },
        parserOptions: {
            getParserContext: function(handlerContext) {
                return getParserContextV54(handlerContext || {}, {
                    getSpreadsheet: getSpreadsheet,
                });
            },
            fetchJson: makeV54ProductionFetchJson_(UrlFetchApp, CONFIG.OPENAI_API_KEY),
            apiKey: CONFIG.OPENAI_API_KEY,
            model: CONFIG.MODEL,
        },
        validateParsedEntryV54: typeof validateParsedEntryV54ForActions_ === 'function' ? validateParsedEntryV54ForActions_ : null,
        recordEntryV54: typeof recordEntryV54 === 'function' ? recordEntryV54 : null,
        recordOptions: {
            getSpreadsheet: getSpreadsheet,
            withLock: withLock,
        },
    };

    if (opts.shadowNoWrite === true) {
        bridgeDeps.recordEntryV54 = typeof recordEntryV54ShadowNoWrite_ === 'function' ? recordEntryV54ShadowNoWrite_ : null;
    }

    if (typeof bridgeDeps.validateParsedEntryV54 !== 'function') {
        return makeV54ProductionFailure_('v54_production_dependency_missing', [
            { code: 'V54_VALIDATOR_REQUIRED', field: 'validateParsedEntryV54ForActions_', message: 'validateParsedEntryV54ForActions_ must exist for V54 runtime bridge.' },
        ]);
    }

    if (context.mode === 'V54_PRIMARY') {
        if (typeof bridgeDeps.recordEntryV54 !== 'function') {
            return makeV54ProductionFailure_('v54_production_dependency_missing', [
                { code: 'V54_RECORD_REQUIRED', field: 'recordEntryV54', message: 'recordEntryV54 must exist for V54 primary runtime.' },
            ]);
        }
        if (typeof planV54IdempotentWrite !== 'function') {
            return makeV54ProductionFailure_('v54_production_dependency_missing', [
                { code: 'V54_IDEMPOTENCY_REQUIRED', field: 'planV54IdempotentWrite', message: 'planV54IdempotentWrite must exist for V54 primary runtime.' },
            ]);
        }
        if (typeof mapSingleCardPurchaseContract !== 'function') {
            return makeV54ProductionFailure_('v54_production_dependency_missing', [
                { code: 'V54_CARD_MAPPER_REQUIRED', field: 'mapSingleCardPurchaseContract', message: 'mapSingleCardPurchaseContract must exist for V54 primary runtime.' },
            ]);
        }
        if (typeof mapInstallmentScheduleContract !== 'function') {
            return makeV54ProductionFailure_('v54_production_dependency_missing', [
                { code: 'V54_INSTALLMENT_MAPPER_REQUIRED', field: 'mapInstallmentScheduleContract', message: 'mapInstallmentScheduleContract must exist for V54 primary runtime.' },
            ]);
        }
        if (typeof planExpectedFaturasUpsert !== 'function') {
            return makeV54ProductionFailure_('v54_production_dependency_missing', [
                { code: 'V54_FATURAS_PLANNER_REQUIRED', field: 'planExpectedFaturasUpsert', message: 'planExpectedFaturasUpsert must exist for V54 primary runtime.' },
            ]);
        }
        if (typeof getParserContextV54 !== 'function') {
            return makeV54ProductionFailure_('v54_production_dependency_missing', [
                { code: 'V54_CONTEXT_REQUIRED', field: 'getParserContextV54', message: 'getParserContextV54 must exist for V54 primary runtime card context.' },
            ]);
        }

        bridgeDeps.recordOptions.planV54IdempotentWrite = planV54IdempotentWrite;
        bridgeDeps.recordOptions.mapSingleCardPurchaseContract = mapSingleCardPurchaseContract;
        bridgeDeps.recordOptions.mapInstallmentScheduleContract = mapInstallmentScheduleContract;
        bridgeDeps.recordOptions.planExpectedFaturasUpsert = planExpectedFaturasUpsert;
        bridgeDeps.recordOptions.getCardsV54 = function() {
            var ctxResult = getParserContextV54({}, { getSpreadsheet: getSpreadsheet });
            if (ctxResult && ctxResult.ok && ctxResult.context && Array.isArray(ctxResult.context.cartoes)) {
                return ctxResult.context.cartoes;
            }
            throw new Error('V54 primary card context failed safely.');
        };
    }

    return {
        ok: true,
        status: 'v54_production_bridge_ready',
        errors: [],
        deps: bridgeDeps,
    };
}

function validateV54ProductionConfig_(config, options) {
    var source = config && typeof config === 'object' ? config : {};
    var opts = options && typeof options === 'object' ? options : {};
    var errors = [];

    if (!isNonEmptyV54String_(source.MODEL)) {
        errors.push({ code: 'V54_MODEL_REQUIRED', field: 'CONFIG.MODEL', message: 'CONFIG.MODEL is required for controlled V54 bridge.' });
    }
    if (opts.requireSpreadsheet && !isNonEmptyV54String_(source.SPREADSHEET_ID)) {
        errors.push({ code: 'V54_SPREADSHEET_ID_REQUIRED', field: 'CONFIG.SPREADSHEET_ID', message: 'CONFIG.SPREADSHEET_ID is required before V54 runtime activation.' });
    }
    if (opts.requireOpenAI && !isNonEmptyV54String_(source.OPENAI_API_KEY)) {
        errors.push({ code: 'V54_OPENAI_API_KEY_REQUIRED', field: 'CONFIG.OPENAI_API_KEY', message: 'CONFIG.OPENAI_API_KEY is required before V54 runtime activation.' });
    }

    return {
        ok: errors.length === 0,
        errors: errors,
    };
}

function makeV54ProductionFetchJson_(urlFetch, apiKey) {
    return function fetchJson(urlOrRequest, payload) {
        if (!isNonEmptyV54String_(apiKey)) {
            throw new Error('V54 production fetch blocked: missing apiKey.');
        }

        var url = typeof urlOrRequest === 'string' ? urlOrRequest : (urlOrRequest && urlOrRequest.url ? urlOrRequest.url : '');
        var body = payload || (urlOrRequest && urlOrRequest.body ? urlOrRequest.body : {});

        var response = urlFetch.fetch(url, {
            method: 'post',
            contentType: 'application/json',
            headers: { Authorization: 'Bearer ' + apiKey },
            payload: JSON.stringify(body || {}),
            muteHttpExceptions: true,
        });

        var statusCode = typeof response.getResponseCode === 'function' ? response.getResponseCode() : 500;
        var body = typeof response.getContentText === 'function' ? response.getContentText() : '{}';
        var parsed;
        try {
            parsed = JSON.parse(body || '{}');
        } catch (error) {
            parsed = { ok: false };
        }
        if (statusCode < 200 || statusCode >= 300) {
            throw new Error('V54 production fetch failed safely with status ' + String(statusCode) + '.');
        }
        return parsed;
    };
}

function makeV54ProductionFailure_(status, errors) {
    return {
        ok: false,
        status: String(status || 'v54_production_bridge_failed'),
        errors: normalizeV54ProductionErrors_(errors),
        deps: null,
    };
}

function normalizeV54ProductionErrors_(errors) {
    var source = Array.isArray(errors) ? errors : [];
    return source.map(function(item) {
        return {
            code: String(item && item.code ? item.code : 'V54_PRODUCTION_BRIDGE_ERROR'),
            field: String(item && item.field ? item.field : 'bridge'),
            message: String(item && item.message ? item.message : 'V54 production bridge failed safely.'),
        };
    });
}

function redactV54ProductionBridgeObject_(value) {
    if (typeof redactSensitiveDiagnostics_ === 'function') {
        return redactSensitiveDiagnostics_(value);
    }
    if (Array.isArray(value)) {
        return value.map(redactV54ProductionBridgeObject_);
    }
    if (!value || typeof value !== 'object') {
        return typeof value === 'string' ? redactV54ProductionBridgeText_(value) : value;
    }

    var redacted = {};
    Object.keys(value).forEach(function(key) {
        var lower = String(key).toLowerCase();
        if (lower.indexOf('token') !== -1
            || lower.indexOf('secret') !== -1
            || lower.indexOf('api_key') !== -1
            || lower.indexOf('spreadsheet_id') !== -1
            || lower === 'stack') {
            redacted[key] = '[REDACTED]';
            return;
        }
        redacted[key] = redactV54ProductionBridgeObject_(value[key]);
    });
    return redacted;
}

function redactV54ProductionBridgeText_(value) {
    return String(value === undefined || value === null ? '' : value)
        .replace(/https:\/\/api\.telegram\.org\/bot[^\/\s"'<>]+/gi, 'https://api.telegram.org/bot[REDACTED]')
        .replace(/\bbot\d{6,}:[A-Za-z0-9_-]+/g, 'bot[REDACTED]')
        .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, 'sk-[REDACTED]')
        .replace(/([?&](?:webhook_secret|telegram_secret|proxy_secret)=)[^&\s"'<>]+/gi, '$1[REDACTED]')
        .replace(/\b((?:webhook_secret|telegram_secret|proxy_secret)\s*[:=]\s*)[^&\s"'<>]+/gi, '$1[REDACTED]')
        .replace(/\b((?:spreadsheet_id|SPREADSHEET_ID)\s*[:=]\s*)[A-Za-z0-9_-]{20,}/g, '$1[REDACTED]')
        .replace(/\n\s*at\s+[^\n]+/g, '\n[STACK_REDACTED]')
        .replace(/\b[\w.-]+\.gs:\d+(?::\d+)?\b/g, '[STACK_REDACTED]');
}

function isNonEmptyV54String_(value) {
    return typeof value === 'string' && value.trim() !== '';
}
