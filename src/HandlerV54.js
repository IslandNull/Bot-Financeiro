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

    var safety = reviewParsedEntryV54Safety_(parsedEntry, context);
    if (!safety.ok) {
        return finalizeHandlerV54Result_(makeHandlerV54Failure_('safety_blocked', safety.errors, context, {
            parsedEntry: parsedEntry,
            validation: validation,
        }), deps);
    }
    parsedEntry = safety.normalized;

    var safetyValidation = validateHandlerParsedEntryV54_(parsedEntry, deps);
    if (!safetyValidation.ok) {
        return finalizeHandlerV54Result_(makeHandlerV54Failure_('safety_validation_failed', safetyValidation.errors, context, {
            parsedEntry: parsedEntry,
            validation: safetyValidation,
        }), deps);
    }
    parsedEntry = safetyValidation.normalized;

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
    safeResult.responseText = sanitizeV54UserFacingText_(deps.formatResponse(safeResult), safeResult);
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
    if (typeof redactSensitiveDiagnostics_ === 'function') {
        return redactSensitiveDiagnostics_(value);
    }
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

function sanitizeV54UserFacingText_(text, result) {
    var safeText = typeof redactSensitiveText_ === 'function'
        ? redactSensitiveText_(text)
        : String(text || '')
            .replace(/https:\/\/api\.telegram\.org\/bot[^\/\s"'<>]+/gi, 'https://api.telegram.org/bot[REDACTED]')
            .replace(/\bbot\d{6,}:[A-Za-z0-9_-]+/g, 'bot[REDACTED]')
            .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, 'sk-[REDACTED]')
            .replace(/([?&](?:webhook_secret|telegram_secret|proxy_secret)=)[^&\s"'<>]+/gi, '$1[REDACTED]')
            .replace(/\b((?:webhook_secret|telegram_secret|proxy_secret)\s*[:=]\s*)[^&\s"'<>]+/gi, '$1[REDACTED]')
            .replace(/\b((?:spreadsheet_id|SPREADSHEET_ID)\s*[:=]\s*)[A-Za-z0-9_-]{20,}/g, '$1[REDACTED]')
            .replace(/\n\s*at\s+[^\n]+/g, '\n[STACK_REDACTED]')
            .replace(/\b[\w.-]+\.gs:\d+(?::\d+)?\b/g, '[STACK_REDACTED]');
    if (result && result.ok !== true && /(?:\bat\s+\S+\s*\(|Error:|stack|Traceback|\.gs:\d+|\bline\s+\d+)/i.test(safeText)) {
        return 'V54: não foi possível registrar com segurança.';
    }
    return safeText;
}

function reviewParsedEntryV54Safety_(entry, context) {
    var rawText = (context && context.text) ? String(context.text).toLowerCase() : '';

    var normalizedRawText = typeof rawText.normalize === 'function'
        ? rawText.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        : rawText
            .replace(/[\u00e0\u00e1\u00e2\u00e3\u00e4]/g, 'a')
            .replace(/[\u00e8\u00e9\u00ea\u00eb]/g, 'e')
            .replace(/[\u00ec\u00ed\u00ee\u00ef]/g, 'i')
            .replace(/[\u00f2\u00f3\u00f4\u00f5\u00f6]/g, 'o')
            .replace(/[\u00f9\u00fa\u00fb\u00fc]/g, 'u')
            .replace(/\u00e7/g, 'c');

    var defaultPessoa = resolveV54SafetyDefaultPessoa_(context && context.user);

    if (!defaultPessoa) {
        return { ok: false, errors: [makeV54ContractError_('V54_SAFETY_NO_CANONICAL_PERSON', 'pessoa', 'Safety guardrail requires a canonical default pessoa (Gustavo/Luana).')] };
    }

    var normalized = cloneV54PlainObject_(entry);

    var isExplicitCasal = /\b(casal|casa|ambos|nosso|nossos)\b/i.test(normalizedRawText);
    var isExplicitLuana = /\b(luana|lu)\b/i.test(normalizedRawText);
    var isExplicitGustavo = /\b(gustavo|gu)\b/i.test(normalizedRawText);

    var personalIndicators = ['farmacia', 'roupa', 'cuidado pessoal', 'dentista', 'lanches trabalho', 'lanche trabalho', 'presente', 'shopee', 'uber', 'combustivel moto', 'oleo moto', 'manutencao moto', 'saude coparticipacao'];
    var sharedIndicators = ['casal', 'casa', 'mercado semana', 'mercado rancho', 'luz', 'agua', 'internet', 'condominio', 'aluguel', 'financiamento caixa', 'vasco'];

    var textHasPersonal = personalIndicators.some(function(ind) { return normalizedRawText.indexOf(ind) !== -1; });
    var textHasShared = sharedIndicators.some(function(ind) { return normalizedRawText.indexOf(ind) !== -1; });

    var categoryId = String(normalized.id_categoria || '').toUpperCase();
    var personalCategories = [
        'OPEX_FARMACIA', 'OPEX_ROUPAS', 'OPEX_CUIDADO_PESSOAL',
        'OPEX_LANCHES_TRABALHO', 'OPEX_COMBUSTIVEL_MOTO',
        'OPEX_MANUTENCAO_MOTO', 'OPEX_SAUDE_COPARTICIPACAO'
    ];
    var isPersonalCategory = personalCategories.indexOf(categoryId) !== -1 || categoryId.indexOf('PESSOAL') !== -1 || categoryId.indexOf('ROUPA') !== -1 || categoryId.indexOf('FARMACIA') !== -1;
    var isSharedCategory = categoryId.indexOf('CASA') !== -1 || categoryId.indexOf('MERCADO') !== -1;

    var isPersonal = textHasPersonal || isPersonalCategory;
    var isShared = textHasShared || isSharedCategory;

    // F. Conflicting person markers
    var mentionOtherPerson = (defaultPessoa === 'Luana' && isExplicitGustavo && !isExplicitLuana) ||
                             (defaultPessoa === 'Gustavo' && isExplicitLuana && !isExplicitGustavo);
    var explicitOtherCard = false;
    if (normalized.id_cartao || normalized.id_fonte) {
        var accountStr = String(normalized.id_cartao || normalized.id_fonte).toLowerCase();
        if (defaultPessoa === 'Luana' && (accountStr.indexOf('_gu') !== -1 || accountStr.indexOf('gustavo') !== -1)) explicitOtherCard = true;
        if (defaultPessoa === 'Gustavo' && (accountStr.indexOf('luana') !== -1 || accountStr.indexOf('_lu') !== -1)) explicitOtherCard = true;
    }

    if (mentionOtherPerson || explicitOtherCard) {
        if (!isExplicitCasal) {
            return { ok: false, errors: [makeV54ContractError_('V54_SAFETY_CONFLICT', 'pessoa', 'Conflicting person markers for personal expense.')] };
        }
    }

    if (rawText.indexOf('conta') !== -1 && rawText.indexOf('nubank') !== -1) {
        return { ok: false, errors: [makeV54ContractError_('V54_SAFETY_CONFLICT', 'conta', 'Ambiguous source markers.')] };
    }

    // A. Ambiguous personal categories must not be shared by default
    if (normalized.escopo === 'Casal') {
        if (isPersonal && !isExplicitCasal) {
            if (defaultPessoa) {
                normalized.escopo = defaultPessoa;
                normalized.afeta_acerto = false;
                normalized.pessoa = defaultPessoa;
            } else {
                return { ok: false, errors: [makeV54ContractError_('V54_SAFETY_AMBIGUOUS_SCOPE', 'escopo', 'Personal expense cannot be Casal by default.')] };
            }
        }
    }

    // C. afeta_acerto
    if (normalized.afeta_acerto === true && normalized.escopo !== 'Casal') {
        normalized.afeta_acerto = false;
    }

    // D. visibilidade
    if (normalized.escopo !== 'Casal' && isPersonal) {
        normalized.visibilidade = 'privada';
    }

    return { ok: true, normalized: normalized };
}

/**
 * @private
 */
function resolveV54SafetyDefaultPessoa_(user) {
    if (typeof user === 'string') {
        if (user === 'Gustavo' || user === 'Luana') return user;
    }

    var candidates = [
        user && user.pessoa,
        user && user.pagador,
        user && user.nome,
    ];

    for (var i = 0; i < candidates.length; i++) {
        var value = String(candidates[i] || '').trim();
        if (value === 'Gustavo' || value === 'Luana') return value;
    }

    return '';
}
