function makeError(code, field, message) {
    return { code, field, message };
}

function cloneCard(card) {
    return card ? { ...card } : {};
}

function pad2(value) {
    return String(value).padStart(2, '0');
}

function formatIsoDate(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatCompetencia(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

function clampDayToMonth(year, month, day) {
    const numericDay = Number(day);
    return Math.min(numericDay, daysInMonth(year, month));
}

function parseIsoDate(value) {
    const text = String(value || '').trim();
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
        return {
            ok: false,
            error: makeError('INVALID_DATE', 'purchaseDate', 'Date must use YYYY-MM-DD format.'),
        };
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12) {
        return {
            ok: false,
            error: makeError('INVALID_DATE', 'purchaseDate', 'Date month must be between 01 and 12.'),
        };
    }

    const maxDay = daysInMonth(year, month);
    if (day < 1 || day > maxDay) {
        return {
            ok: false,
            error: makeError('INVALID_DATE', 'purchaseDate', 'Date day is outside the month.'),
        };
    }

    return {
        ok: true,
        date: new Date(year, month - 1, day),
    };
}

function validateCardConfig(card) {
    const normalized = cloneCard(card);
    const errors = [];

    if (!String(normalized.id_cartao || '').trim()) {
        errors.push(makeError('REQUIRED_FIELD', 'id_cartao', 'Card must define id_cartao.'));
    }

    [
        ['fechamento_dia', 'closing day'],
        ['vencimento_dia', 'due day'],
    ].forEach(([field, label]) => {
        const value = Number(normalized[field]);
        if (!Number.isInteger(value)) {
            errors.push(makeError('INVALID_DAY', field, `Card ${label} must be an integer.`));
            return;
        }
        if (value < 1 || value > 31) {
            errors.push(makeError('INVALID_DAY', field, `Card ${label} must be between 1 and 31.`));
            return;
        }
        normalized[field] = value;
    });

    if (normalized.ativo === false) {
        errors.push(makeError('INACTIVE_CARD', 'ativo', 'Card must be active for invoice cycle assignment.'));
    }

    normalized.id_cartao = String(normalized.id_cartao || '').trim();

    return {
        ok: errors.length === 0,
        errors,
        normalized: errors.length === 0 ? normalized : null,
    };
}

function addMonthsToYearMonth(year, month, amount) {
    const date = new Date(year, month - 1 + amount, 1);
    return {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
    };
}

function dateForClampedDay(year, month, configuredDay) {
    return new Date(year, month - 1, clampDayToMonth(year, month, configuredDay));
}

function compareDates(a, b) {
    const left = formatIsoDate(a);
    const right = formatIsoDate(b);
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
}

function buildInvoiceId(idCartao, competencia) {
    return `FAT_${String(idCartao || '').trim()}_${String(competencia || '').replace('-', '_')}`;
}

function assignPurchaseToInvoiceCycle(purchaseDateValue, cardConfig) {
    const parsedDate = parseIsoDate(purchaseDateValue);
    const cardValidation = validateCardConfig(cardConfig);
    const errors = [];

    if (!parsedDate.ok) errors.push(parsedDate.error);
    if (!cardValidation.ok) errors.push(...cardValidation.errors);

    if (errors.length > 0) {
        return {
            ok: false,
            errors,
            cycle: null,
        };
    }

    const purchaseDate = parsedDate.date;
    const card = cardValidation.normalized;
    let closeYear = purchaseDate.getFullYear();
    let closeMonth = purchaseDate.getMonth() + 1;
    let closingDate = dateForClampedDay(closeYear, closeMonth, card.fechamento_dia);

    if (compareDates(purchaseDate, closingDate) > 0) {
        const next = addMonthsToYearMonth(closeYear, closeMonth, 1);
        closeYear = next.year;
        closeMonth = next.month;
        closingDate = dateForClampedDay(closeYear, closeMonth, card.fechamento_dia);
    }

    const dueMonth = addMonthsToYearMonth(closeYear, closeMonth, 1);
    const dueDate = dateForClampedDay(dueMonth.year, dueMonth.month, card.vencimento_dia);
    const competencia = formatCompetencia(closingDate);

    return {
        ok: true,
        errors: [],
        cycle: {
            id_fatura: buildInvoiceId(card.id_cartao, competencia),
            id_cartao: card.id_cartao,
            competencia,
            data_fechamento: formatIsoDate(closingDate),
            data_vencimento: formatIsoDate(dueDate),
        },
    };
}

module.exports = {
    assignPurchaseToInvoiceCycle,
    buildInvoiceId,
    clampDayToMonth,
    daysInMonth,
    parseIsoDate,
    validateCardConfig,
};
