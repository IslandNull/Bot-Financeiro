// ============================================================
// VIEWS V54 - safe response formatting skeleton
// ============================================================
// Formatters return text only. They do not call Telegram or external services.

function formatV54HandlerResponse_(result) {
    var source = result || {};
    if (source.ok === true) {
        return formatV54SuccessResponse_(source);
    }

    if (source.status === 'duplicate_completed' || source.decision === 'duplicate_completed') {
        return 'V54: lançamento já registrado anteriormente.';
    }
    if (source.status === 'processing_retryable' || source.retryable === true) {
        return 'V54: mensagem já está em processamento. Tente novamente em instantes.';
    }
    if (source.status === 'unauthorized') {
        return 'V54: usuário não autorizado.';
    }
    if (source.status === 'parser_failed') {
        return 'V54: não consegui interpretar essa mensagem com segurança.';
    }
    if (source.status === 'validation_failed') {
        return 'V54: mensagem rejeitada pelas regras de validação.';
    }
    if (source.status === 'unsupported_event') {
        return 'V54: esse tipo de lançamento ainda não é suportado.';
    }

    return 'V54: não foi possível registrar com segurança.';
}

function formatV54SuccessResponse_(result) {
    var eventType = result.parsedEntry && result.parsedEntry.tipo_evento
        ? result.parsedEntry.tipo_evento
        : '';
    if (eventType === 'compra_cartao') {
        return 'V54: compra no cartão registrada com idempotência.';
    }
    if (eventType === 'compra_parcelada') {
        return 'V54: compra parcelada registrada com idempotência.';
    }
    return 'V54: lançamento registrado com idempotência.';
}

function normalizeV54RuntimeErrors_(errors, fallbackCode, fallbackField, fallbackMessage) {
    var source = Array.isArray(errors) ? errors : [];
    var normalized = source
        .filter(function(error) { return error && typeof error === 'object'; })
        .map(function(error) {
            return {
                code: String(error.code || fallbackCode),
                field: String(error.field || fallbackField),
                message: String(error.message || fallbackMessage),
            };
        });

    if (normalized.length > 0) return normalized;
    return [makeV54ContractError_(fallbackCode, fallbackField, fallbackMessage)];
}
