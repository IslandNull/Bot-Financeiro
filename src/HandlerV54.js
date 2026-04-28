// ============================================================
// HANDLER V54 - disabled runtime skeleton
// ============================================================
// This file models the future V54 Telegram handler shape. It is intentionally
// not called by doPost and does not send Telegram messages.

function handleTelegramUpdateV54(update, options) {
    var deps = normalizeHandlerV54Deps_(options);
    var context = extractTelegramV54Context_(update, deps);

    if (!context.ok) {
        return finalizeHandlerV54Result_(makeHandlerV54Failure_('invalid_update', context.errors, context), deps);
    }

    if (!context.user) {
        return finalizeHandlerV54Result_(
            makeHandlerV54Failure_(
                'unauthorized',
                [makeV54ContractError_('V54_USER_CONTEXT_REQUIRED', 'user', 'V54 handler requires authorized user context.')],
                context
            ),
            deps
        );
    }

    var parsed = parseTextWithParserV54_(context.text, context, deps);
    if (!parsed.ok) {
        return finalizeHandlerV54Result_(makeHandlerV54Failure_('parser_failed', parsed.errors, context), deps);
    }

    var validation = validateHandlerParsedEntryV54_(parsed.normalized || parsed.parsedEntry, deps);
    if (!validation.ok) {
        return finalizeHandlerV54Result_(makeHandlerV54Failure_('validation_failed', validation.errors, context, {
            parsedEntry: parsed.parsedEntry || null,
            validation: validation,
        }), deps);
    }

    var parsedEntry = validation.normalized;
    var recordResult = callRecordEntryFromHandlerV54_(parsedEntry, context, deps);
    var status = classifyRecordEntryV54Result_(recordResult);
    var handlerResult = {
        ok: recordResult && recordResult.ok === true,
        status: status,
        context: context,
        parsedEntry: parsedEntry,
        record: sanitizeV54RuntimeObject_(recordResult),
        decision: recordResult && recordResult.decision ? recordResult.decision : '',
        retryable: recordResult && recordResult.retryable === true,
        errors: recordResult && Array.isArray(recordResult.errors) ? recordResult.errors : [],
    };

    return finalizeHandlerV54Result_(handlerResult, deps);
}

function normalizeHandlerV54Deps_(options) {
    var source = options || {};
    return {
        user: source.user || null,
        usersByChatId: source.usersByChatId || null,
        parseTextV54: typeof source.parseTextV54 === 'function' ? source.parseTextV54 : null,
        parserOptions: source.parserOptions && typeof source.parserOptions === 'object'
            ? copyHandlerV54RecordOptions_(source.parserOptions)
            : {},
        validateParsedEntryV54: typeof source.validateParsedEntryV54 === 'function' ? source.validateParsedEntryV54 : null,
        recordEntryV54: typeof source.recordEntryV54 === 'function' ? source.recordEntryV54 : (
            typeof recordEntryV54 === 'function' ? recordEntryV54 : null
        ),
        formatResponse: typeof source.formatResponse === 'function' ? source.formatResponse : formatV54HandlerResponse_,
        recordOptions: source.recordOptions && typeof source.recordOptions === 'object'
            ? copyHandlerV54RecordOptions_(source.recordOptions)
            : {},
    };
}

function copyHandlerV54RecordOptions_(source) {
    var copy = {};
    Object.keys(source || {}).forEach(function(key) {
        var value = source[key];
        if (value && typeof value === 'object' && !Array.isArray(value) && typeof value !== 'function') {
            copy[key] = cloneV54PlainObject_(value);
            return;
        }
        if (Array.isArray(value)) {
            copy[key] = cloneV54PlainObject_(value);
            return;
        }
        copy[key] = value;
    });
    return copy;
}

function extractTelegramV54Context_(update, deps) {
    var source = update || {};
    var message = source.message || source.edited_message || null;
    if (!message || !message.text || !message.chat) {
        return {
            ok: false,
            errors: [makeV54ContractError_('V54_TELEGRAM_MESSAGE_REQUIRED', 'message', 'V54 handler requires a Telegram-like message with text and chat.')],
        };
    }

    var chatId = String(message.chat.id || '');
    var user = deps.user || null;
    if (!user && deps.usersByChatId && deps.usersByChatId[chatId]) {
        user = deps.usersByChatId[chatId];
    }

    return {
        ok: true,
        source: 'telegram',
        update_id: source.update_id === undefined || source.update_id === null ? '' : String(source.update_id),
        message_id: message.message_id === undefined || message.message_id === null ? '' : String(message.message_id),
        chat_id: chatId,
        text: String(message.text || '').trim(),
        user: user,
        update: source,
        message: message,
        errors: [],
    };
}

function validateHandlerParsedEntryV54_(entry, deps) {
    if (typeof deps.validateParsedEntryV54 === 'function') {
        return deps.validateParsedEntryV54(entry);
    }
    if (typeof validateParsedEntryV54ForActions_ === 'function') {
        return validateParsedEntryV54ForActions_(entry);
    }
    return {
        ok: false,
        normalized: {},
        errors: [makeV54ContractError_('V54_VALIDATOR_REQUIRED', 'validateParsedEntryV54', 'V54 handler requires a ParsedEntryV54 validator.')],
    };
}

function callRecordEntryFromHandlerV54_(parsedEntry, context, deps) {
    if (typeof deps.recordEntryV54 !== 'function') {
        return {
            ok: false,
            decision: 'record_dependency_missing',
            retryable: false,
            errors: [makeV54ContractError_('V54_RECORD_ENTRY_REQUIRED', 'recordEntryV54', 'V54 handler requires recordEntryV54 dependency.')],
        };
    }

    var recordOptions = copyHandlerV54RecordOptions_(deps.recordOptions || {});
    recordOptions.idempotency = recordOptions.idempotency || {};
    recordOptions.idempotency.enabled = true;
    recordOptions.idempotency.input = makeHandlerV54IdempotencyInput_(context);
    recordOptions.idempotency.semanticEntry = parsedEntry;

    return deps.recordEntryV54(parsedEntry, recordOptions);
}

function makeHandlerV54IdempotencyInput_(context) {
    return {
        source: 'telegram',
        telegram_update_id: context.update_id,
        telegram_message_id: context.message_id,
        chat_id: context.chat_id,
        payload: context.update,
    };
}

function classifyRecordEntryV54Result_(recordResult) {
    if (!recordResult || typeof recordResult !== 'object') return 'record_failed';
    if (recordResult.decision === 'shadow_no_write') return 'shadow_no_write';
    if (recordResult.ok === true) return 'recorded';
    if (recordResult.decision === 'duplicate_completed') return 'duplicate_completed';
    if (recordResult.retryable === true || recordResult.decision === 'duplicate_processing') return 'processing_retryable';
    var errors = Array.isArray(recordResult.errors) ? recordResult.errors : [];
    for (var i = 0; i < errors.length; i++) {
        if (errors[i] && errors[i].code === 'UNSUPPORTED_EVENT') return 'unsupported_event';
    }
    return 'record_failed';
}

function makeHandlerV54Failure_(status, errors, context, extra) {
    var result = {
        ok: false,
        status: status,
        context: context || null,
        parsedEntry: extra && extra.parsedEntry ? extra.parsedEntry : null,
        validation: extra && extra.validation ? extra.validation : null,
        record: null,
        decision: '',
        retryable: false,
        errors: normalizeV54RuntimeErrors_(errors, 'V54_HANDLER_FAILED', 'handler', 'V54 handler failed safely.'),
    };
    return result;
}

function finalizeHandlerV54Result_(result, deps) {
    var safeResult = sanitizeV54RuntimeObject_(result);
    safeResult.responseText = deps.formatResponse(safeResult);
    safeResult.errors = normalizeV54RuntimeErrors_(
        safeResult.errors,
        'V54_HANDLER_FAILED',
        'handler',
        'V54 handler failed safely.'
    );
    return safeResult;
}

function sanitizeV54RuntimeObject_(input) {
    var clone = cloneV54PlainObject_(input);
    return redactV54RuntimeSecrets_(clone);
}

function redactV54RuntimeSecrets_(value) {
    if (Array.isArray(value)) {
        for (var i = 0; i < value.length; i++) value[i] = redactV54RuntimeSecrets_(value[i]);
        return value;
    }
    if (!value || typeof value !== 'object') return value;

    Object.keys(value).forEach(function(key) {
        var lower = String(key).toLowerCase();
        if (lower.indexOf('token') !== -1
            || lower.indexOf('secret') !== -1
            || lower.indexOf('api_key') !== -1
            || lower.indexOf('spreadsheet_id') !== -1
            || lower === 'stack') {
            value[key] = '[REDACTED]';
            return;
        }
        value[key] = redactV54RuntimeSecrets_(value[key]);
    });
    return value;
}
