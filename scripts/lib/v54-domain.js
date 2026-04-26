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

function addDays(date, amount) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
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

function summarizeUpcomingInvoices(invoices, { asOfDate, days = 60 } = {}) {
    const start = toDateOnly(asOfDate || new Date());
    const end = addDays(start, Number(days || 60));

    return (invoices || []).reduce((acc, invoice) => {
        const status = String(invoice.status || '').toLowerCase();
        if (['paga', 'pago', 'cancelada', 'cancelado'].includes(status)) return acc;
        if (!invoice.data_vencimento) return acc;

        const dueDate = toDateOnly(invoice.data_vencimento);
        if (dueDate < start || dueDate > end) return acc;

        const closedValue = Number(invoice.valor_fechado || 0);
        const expectedValue = Number(invoice.valor_previsto || 0);
        const paidValue = Number(invoice.valor_pago || 0);
        const baseValue = closedValue > 0 ? closedValue : expectedValue;
        const outstanding = roundMoney(Math.max(0, baseValue - paidValue));
        if (outstanding <= 0) return acc;

        acc.total = roundMoney(acc.total + outstanding);
        acc.invoices.push({
            id_fatura: invoice.id_fatura,
            data_vencimento: formatDate(dueDate),
            outstanding,
        });
        return acc;
    }, { total: 0, invoices: [] });
}

function calculateEmergencyReserveBalance(assets) {
    return roundMoney((assets || []).reduce((sum, asset) => {
        if (!asset.conta_reserva_emergencia) return sum;
        if (asset.ativo === false) return sum;
        return sum + Number(asset.saldo_atual || 0);
    }, 0));
}

function calculateNetWorth({ assets = [], debts = [] } = {}) {
    const assetTotal = assets.reduce((sum, asset) => {
        if (asset.ativo === false) return sum;
        return sum + Number(asset.saldo_atual || 0);
    }, 0);

    const debtTotal = debts.reduce((sum, debt) => {
        if (debt.status && String(debt.status).toLowerCase() !== 'ativa') return sum;
        return sum + Number(debt.saldo_devedor || 0);
    }, 0);

    return {
        assets: roundMoney(assetTotal),
        debts: roundMoney(debtTotal),
        netWorth: roundMoney(assetTotal - debtTotal),
    };
}

function summarizeSettlementStatus(settlement, tolerance = 1) {
    const people = Object.keys(settlement || {}).filter((key) => key !== 'cashBase' && key !== 'shares');
    if (people.length === 0) return { status: 'not_calculated', transfers: [] };

    const debtors = [];
    const creditors = [];

    people.forEach((person) => {
        const difference = roundMoney((settlement[person] && settlement[person].difference) || 0);
        if (difference < -tolerance) debtors.push({ person, amount: roundMoney(Math.abs(difference)) });
        if (difference > tolerance) creditors.push({ person, amount: difference });
    });

    if (debtors.length === 0 && creditors.length === 0) {
        return { status: 'balanced', transfers: [] };
    }

    const transfers = [];
    debtors.forEach((debtor) => {
        let remaining = debtor.amount;
        creditors.forEach((creditor) => {
            if (remaining <= 0 || creditor.amount <= 0) return;
            const amount = roundMoney(Math.min(remaining, creditor.amount));
            if (amount <= 0) return;
            transfers.push({ from: debtor.person, to: creditor.person, amount });
            remaining = roundMoney(remaining - amount);
            creditor.amount = roundMoney(creditor.amount - amount);
        });
    });

    return { status: 'pending_transfer', transfers };
}

function evaluateAmortizationReadiness({
    reserveBalance,
    reserveMinimum = 15000,
    upcomingInvoicesTotal,
    debts = [],
} = {}) {
    const reasons = [];
    if (Number(reserveBalance || 0) < Number(reserveMinimum || 0)) reasons.push('reserve_below_minimum');
    if (upcomingInvoicesTotal === undefined || upcomingInvoicesTotal === null) reasons.push('upcoming_invoices_unknown');

    const activeDebts = debts.filter((debt) => !debt.status || String(debt.status).toLowerCase() === 'ativa');
    if (activeDebts.length === 0) reasons.push('no_active_debts');

    activeDebts.forEach((debt) => {
        ['saldo_devedor', 'valor_parcela', 'parcelas_total'].forEach((field) => {
            if (!Number(debt[field])) reasons.push(`debt_${debt.id_divida || debt.nome || 'unknown'}_${field}_missing`);
        });
    });

    return {
        ready: reasons.length === 0,
        reasons: [...new Set(reasons)],
    };
}

function sanitizeEntriesForSharedView(entries) {
    return (entries || [])
        .filter((entry) => entry.visibilidade !== 'privada')
        .map((entry) => {
            if (entry.visibilidade !== 'resumo') return { ...entry };
            return {
                ...entry,
                descricao: '',
                id_fonte: '',
                id_cartao: '',
                summarized: true,
            };
        });
}

function buildMonthlyClosing({
    competencia,
    events = [],
    invoices = [],
    assets = [],
    debts = [],
    settlement = null,
    asOfDate,
    savingsAmount = 0,
    decisions = [],
} = {}) {
    const dre = summarizeOperationalDre(events);
    const upcomingInvoices = summarizeUpcomingInvoices(invoices, { asOfDate });
    const reserveTotal = calculateEmergencyReserveBalance(assets);
    const netWorth = calculateNetWorth({ assets, debts });
    const settlementStatus = summarizeSettlementStatus(settlement || {});
    const receitas = Number(dre.receitas || 0);

    return {
        competencia,
        status: 'draft',
        receitas_operacionais: dre.receitas,
        despesas_operacionais: dre.despesas,
        saldo_operacional: dre.saldo,
        faturas_60d: upcomingInvoices.total,
        parcelas_futuras: 0,
        taxa_poupanca: receitas > 0 ? roundMoney(Number(savingsAmount || 0) / receitas) : 0,
        reserva_total: reserveTotal,
        patrimonio_liquido: netWorth.netWorth,
        acerto_status: settlementStatus.status,
        decisao_1: decisions[0] || '',
        decisao_2: decisions[1] || '',
        decisao_3: decisions[2] || '',
    };
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
    buildMonthlyClosing,
    buildInstallmentSchedule,
    calculateEmergencyReserveBalance,
    calculateHouseholdSettlement,
    calculateIncomeShares,
    calculateInvoiceCycle,
    calculateNetWorth,
    classifyReserve,
    evaluateAmortizationReadiness,
    sanitizeEntriesForSharedView,
    summarizeSettlementStatus,
    summarizeFutureHomeForecast,
    summarizeOperationalDre,
    summarizeUpcomingInvoices,
};
