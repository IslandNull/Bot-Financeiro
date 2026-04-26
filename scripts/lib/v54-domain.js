function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function toDateOnly(value) {
    if (value instanceof Date) {
        return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    const [year, month, day] = String(value).split('-').map(Number);
    if (!year || !month || !day) throw new Error(`Invalid date: ${value}`);
    return new Date(year, month - 1, day);
}

function daysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
}

function clampDay(year, monthIndex, day) {
    return Math.min(day, daysInMonth(year, monthIndex));
}

function formatMonth(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function addMonths(date, amount) {
    return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function calculateIncomeShares(incomes) {
    const entries = Object.entries(incomes || {});
    const total = entries.reduce((sum, [, value]) => sum + Number(value || 0), 0);
    if (total <= 0) throw new Error('Income total must be greater than zero');

    return entries.reduce((acc, [person, value]) => {
        const amount = Number(value || 0);
        acc[person] = {
            income: roundMoney(amount),
            share: roundMoney(amount / total),
            percent: roundMoney((amount / total) * 100),
        };
        return acc;
    }, { total: roundMoney(total) });
}

function calculateHouseholdSettlement({ incomes, coupleExpenses, payments, benefitsApplied = 0 }) {
    const shares = calculateIncomeShares(incomes);
    const cashBase = Math.max(0, Number(coupleExpenses || 0) - Number(benefitsApplied || 0));
    const people = Object.keys(incomes || {});
    const totalIncome = Number(shares.total);

    return people.reduce((acc, person) => {
        const rawShare = Number(incomes[person] || 0) / totalIncome;
        const expected = roundMoney(cashBase * rawShare);
        const paid = roundMoney((payments && payments[person]) || 0);
        acc[person] = {
            expected,
            paid,
            difference: roundMoney(paid - expected),
        };
        return acc;
    }, { cashBase: roundMoney(cashBase), shares });
}

function summarizeOperationalDre(events) {
    return (events || []).reduce((acc, event) => {
        if (!event.afeta_dre) return acc;
        if (event.classe_dre !== 'Operacional') return acc;

        const value = Number(event.valor || 0);
        if (event.tipo_evento === 'Receita') acc.receitas = roundMoney(acc.receitas + value);
        if (event.tipo_evento === 'Despesa') acc.despesas = roundMoney(acc.despesas + value);
        acc.saldo = roundMoney(acc.receitas - acc.despesas);
        return acc;
    }, { receitas: 0, despesas: 0, saldo: 0 });
}

function classifyReserve(balance, targets = {}) {
    const current = roundMoney(balance || 0);
    const minimum = Number(targets.minimum || 15000);
    const idealMin = Number(targets.idealMin || 30000);
    const idealMax = Number(targets.idealMax || 33000);

    let band = 'ideal_complete';
    let priority = 'balanced';
    let nextTarget = idealMax;

    if (current < minimum) {
        band = 'below_minimum';
        priority = 'maximum';
        nextTarget = minimum;
    } else if (current < idealMin) {
        band = 'between_minimum_and_ideal';
        priority = 'high';
        nextTarget = idealMin;
    } else if (current < idealMax) {
        band = 'inside_ideal_band';
        priority = 'medium';
        nextTarget = idealMax;
    }

    return {
        balance: current,
        band,
        priority,
        nextTarget,
        missingToNextTarget: roundMoney(Math.max(0, nextTarget - current)),
    };
}

function summarizeFutureHomeForecast(items) {
    return (items || []).reduce((acc, item) => {
        const value = Number(item.valor_previsto || 0);
        acc.forecastTotal = roundMoney(acc.forecastTotal + value);
        if (item.ativo_no_dre) acc.activeDreTotal = roundMoney(acc.activeDreTotal + value);
        return acc;
    }, { forecastTotal: 0, activeDreTotal: 0 });
}

function calculateInvoiceCycle(purchaseDateValue, card) {
    const purchaseDate = toDateOnly(purchaseDateValue);
    const closeDay = Number(card.fechamento_dia);
    const dueDay = Number(card.vencimento_dia);
    if (!closeDay || !dueDay) throw new Error('Card must define fechamento_dia and vencimento_dia');

    let closeYear = purchaseDate.getFullYear();
    let closeMonth = purchaseDate.getMonth();
    let closeDate = new Date(closeYear, closeMonth, clampDay(closeYear, closeMonth, closeDay));

    if (purchaseDate > closeDate) {
        const nextCloseMonth = addMonths(closeDate, 1);
        closeYear = nextCloseMonth.getFullYear();
        closeMonth = nextCloseMonth.getMonth();
        closeDate = new Date(closeYear, closeMonth, clampDay(closeYear, closeMonth, closeDay));
    }

    const dueBase = addMonths(closeDate, 1);
    const dueDate = new Date(
        dueBase.getFullYear(),
        dueBase.getMonth(),
        clampDay(dueBase.getFullYear(), dueBase.getMonth(), dueDay)
    );

    return {
        cardId: card.id_cartao,
        competencia: formatMonth(closeDate),
        data_fechamento: formatDate(closeDate),
        data_vencimento: formatDate(dueDate),
    };
}

function buildInstallmentSchedule({ purchaseDate, card, totalInstallments, installmentValue }) {
    const total = Number(totalInstallments);
    if (!Number.isInteger(total) || total <= 0) throw new Error('totalInstallments must be a positive integer');

    const firstCycle = calculateInvoiceCycle(purchaseDate, card);
    const firstCloseDate = toDateOnly(firstCycle.data_fechamento);

    return Array.from({ length: total }, (_, index) => {
        const closeBase = addMonths(firstCloseDate, index);
        const syntheticPurchaseDate = new Date(closeBase.getFullYear(), closeBase.getMonth(), 1);
        const cycle = calculateInvoiceCycle(formatDate(syntheticPurchaseDate), card);
        return {
            numero_parcela: index + 1,
            valor_parcela: roundMoney(installmentValue),
            competencia: cycle.competencia,
            data_fechamento: cycle.data_fechamento,
            data_vencimento: cycle.data_vencimento,
        };
    });
}

module.exports = {
    buildInstallmentSchedule,
    calculateHouseholdSettlement,
    calculateIncomeShares,
    calculateInvoiceCycle,
    classifyReserve,
    summarizeFutureHomeForecast,
    summarizeOperationalDre,
};
