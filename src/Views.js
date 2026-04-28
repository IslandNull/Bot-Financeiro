// LEGACY V53 PROTOTYPE.
// Do not add new features here.
// V54 MVP work must happen in ActionsV54 / future ParserV54 / ViewsV54.
// ============================================================
// VIEWS — funções somente-leitura que produzem texto pra responder
// comandos do Telegram. Não escrevem na planilha. Lê Dashboard,
// Lançamentos, Investimentos e Parcelas.
// ============================================================

function getResumoMes() {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const dash = ss.getSheetByName(CONFIG.SHEETS.dashboard);

    const rendaReal = dash.getRange('E8').getValue();
    const rendaPlan = dash.getRange('D8').getValue();
    const gastoReal = dash.getRange('E9').getValue();
    const gastoPlan = dash.getRange('D9').getValue();
    const sobra = dash.getRange('E10').getValue();
    const transfere = dash.getRange('E16').getValue();
    const gastoGustavo = dash.getRange('C21').getValue();
    const gastoLuana = dash.getRange('C22').getValue();

    const pctGasto = gastoPlan > 0 ? Math.round((gastoReal / gastoPlan) * 100) : 0;
    const mes = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'MMMM/yyyy');

    return `📊 *Resumo de ${mes}*

💵 Renda: ${formatBRL(rendaReal)} de ${formatBRL(rendaPlan)} planejado
💸 Gastos: ${formatBRL(gastoReal)} de ${formatBRL(gastoPlan)} planejado (${pctGasto}%)
💰 Sobra real: ${formatBRL(sobra)}

👤 Por pagador:
  • Gustavo: ${formatBRL(gastoGustavo)}
  • Luana: ${formatBRL(gastoLuana)}

💸 Acerto:
Luana transfere ${formatBRL(transfere)} pro Gustavo`;
}

function getSaldoCategoria(nomeAprox) {
    const { categorias, catMap } = getListsCached();
    const n = nomeAprox.toLowerCase();
    const match = categorias.find(c => c.toLowerCase().includes(n));

    if (!match) {
        const sugestoes = categorias.filter(c =>
            n.split(' ').some(w => w.length > 2 && c.toLowerCase().includes(w))
        ).slice(0, 5);
        return `Categoria "${nomeAprox}" não encontrada.${sugestoes.length ? '\n\nTalvez:\n' + sugestoes.map(s => '• ' + s).join('\n') : ''}`;
    }

    const idCategoria = catMap ? (catMap[match] || match) : match;

    if (PROVISAO_CATS.includes(match)) {
        const s = getAccumulatedSaldo(idCategoria, match);
        if (!s) return `Categoria ${match} sem planejado configurado.`;
        const pct = s.creditoTotal > 0 ? Math.round((s.gastoHistorico / s.creditoTotal) * 100) : 0;
        const alerta = s.acumulado < 0 ? ' ⚠️ NEGATIVO' : '';
        return `📦 *${match}* (provisão)\nPlan/mês: ${formatBRL(s.planejado)} × ${s.meses} meses\nCrédito acumulado: ${formatBRL(s.creditoTotal)}\nGasto histórico: ${formatBRL(s.gastoHistorico)} (${pct}%)\nSaldo envelope: ${formatBRL(s.acumulado)}${alerta}`;
    }

    const s = getCategorySaldo(match);
    if (!s) return `Categoria ${match} sem planejado.`;
    const pct = s.planejado > 0 ? Math.round((s.gasto / s.planejado) * 100) : 0;
    const restante = s.planejado - s.gasto;
    return `📊 *${match}*\nPlanejado: ${formatBRL(s.planejado)}\nGasto: ${formatBRL(s.gasto)} (${pct}%)\nRestante: ${formatBRL(restante)}`;
}

function getSaldoTop5() {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const dash = ss.getSheetByName(CONFIG.SHEETS.dashboard);
    // Tabela de categorias começa na linha 26 até ~64
    const values = dash.getRange('A26:G64').getValues();
    const arr = values
        .map(r => ({ cat: r[1], plan: r[3], gasto: r[4], pct: r[6] }))
        .filter(r => r.cat && typeof r.gasto === 'number' && r.gasto > 0)
        .sort((a, b) => b.gasto - a.gasto)
        .slice(0, 5);

    if (!arr.length) return 'Nenhum gasto registrado ainda no mês.';

    const linhas = arr.map(r => {
        const p = r.plan > 0 ? Math.round((r.gasto / r.plan) * 100) : 0;
        const al = p > 100 ? ' ⚠️' : p > 80 ? ' ⚡' : '';
        return `• ${r.cat}: ${formatBRL(r.gasto)} de ${formatBRL(r.plan)} (${p}%)${al}`;
    });

    return `📊 *Top 5 categorias do mês*\n\n${linhas.join('\n')}`;
}

function getLancamentosHoje() {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SHEETS.lancamentos);
    const last = sheet.getLastRow();
    if (last < 6) return 'Nenhum lançamento hoje.';

    const rows = sheet.getRange(6, 1, last - 5, 8).getValues();
    const hoje = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy');
    const doDia = rows.filter(r => r[0] && Utilities.formatDate(r[0], CONFIG.TIMEZONE, 'dd/MM/yyyy') === hoje);

    if (!doDia.length) return `Nenhum lançamento em ${hoje}.`;

    const { catMap } = getListsCached();
    const idToName = {};
    if (catMap) {
        for (const [name, id] of Object.entries(catMap)) {
            idToName[id] = name;
        }
    }

    const total = doDia.filter(r => r[1] === 'Despesa').reduce((a, r) => a + (typeof r[3] === 'number' ? r[3] : 0), 0);
    const linhas = doDia.map(r => {
        const icon = r[1] === 'Receita' ? '💵' : r[1] === 'Transferência' ? '🔄' : '💸';
        const nomeCat = idToName[r[2]] || r[2];
        return `${icon} ${formatBRL(r[3])} — ${nomeCat} (${r[6]})`;
    });
    return `📅 *Hoje (${hoje})*\n\n${linhas.join('\n')}\n\n*Total gasto hoje:* ${formatBRL(total)}`;
}

function getAcertoMes() {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const dash = ss.getSheetByName(CONFIG.SHEETS.dashboard);
    const recebeu = dash.getRange('E13').getValue();
    const gastou = dash.getRange('E14').getValue();
    const reserva = dash.getRange('E15').getValue();
    const transfere = dash.getRange('E16').getValue();
    return `💸 *Acerto do mês*\n\nLuana recebeu: ${formatBRL(recebeu)}\n(-) Gastou: ${formatBRL(gastou)}\n(-) Reserva pessoal: ${formatBRL(reserva)}\n= Transfere: *${formatBRL(transfere)}*`;
}

function getInvestSaldo() {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const inv = ss.getSheetByName(CONFIG.SHEETS.investimentos);
    if (!inv) return 'Aba Investimentos não encontrada. Configure a planilha primeiro.';

    const row = inv.getRange('A4:F4').getValues()[0];
    const [ativo, saldoInicial, aportes, resgates, rendimentos, saldoAtual] = row;
    if (!ativo) return 'Nenhum investimento cadastrado na aba Investimentos.';

    const mes = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'MMMM/yyyy');
    return `📈 *${ativo}*\n\nSaldo atual: *${formatBRL(saldoAtual)}*\n\n📅 ${mes}:\n  Aportes: ${formatBRL(aportes)}\n  Resgates: ${formatBRL(resgates)}\n  Rendimentos: ${formatBRL(rendimentos)}\n\nSaldo inicial total: ${formatBRL(saldoInicial)}`;
}

function getParcelasAtivas() {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SHEETS.parcelas);
    if (!sheet) return 'Aba Parcelas não encontrada.';

    const lastRow = sheet.getLastRow();
    if (lastRow < 4) return 'Nenhuma parcela cadastrada.';

    const rows = sheet.getRange(4, 1, lastRow - 3, 8).getValues();
    const ativas = rows.filter(r => r[0] && String(r[7]).toLowerCase() === 'ativa');

    if (!ativas.length) return '✅ Sem parcelas ativas no momento.';

    const linhas = ativas.map(r => {
        const restantes = r[3] - r[2];
        return `• ${r[0]}: ${formatBRL(r[1])}/mês (${r[2]}/${r[3]}, ${restantes} restantes) — ${r[4]}`;
    });

    const totalMensal = ativas.reduce((sum, r) => sum + (typeof r[1] === 'number' ? r[1] : 0), 0);
    return `📋 *Parcelas Ativas*\n\n${linhas.join('\n')}\n\n*Total mensal:* ${formatBRL(totalMensal)}`;
}

function getFatura(arg) {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const dash = ss.getSheetByName(CONFIG.SHEETS.dashboard);

    const cartoes = [
        { nome: 'Nubank Gu', row: 90 },
        { nome: 'Nubank Lu', row: 91 },
        { nome: 'Mercado Pago Gu', row: 92 }
    ];

    if (arg) {
        const n = arg.toLowerCase();
        const found = cartoes.find(c => c.nome.toLowerCase().includes(n));
        if (!found) return `Cartão "${arg}" não encontrado. Opções: nubank gu, nubank lu, mp`;
        const total = dash.getRange(`E${found.row}`).getValue();
        return `💳 *${found.nome}*\nFatura do mês: ${formatBRL(total)}`;
    }

    const linhas = cartoes.map(c => {
        const total = dash.getRange(`E${c.row}`).getValue();
        return `• ${c.nome}: ${formatBRL(total)}`;
    });
    const totalGeral = cartoes.reduce((sum, c) => sum + (dash.getRange(`E${c.row}`).getValue() || 0), 0);
    const mes = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'MMMM/yyyy');
    return `💳 *Faturas ${mes}*\n\n${linhas.join('\n')}\n\n*Total cartões:* ${formatBRL(totalGeral)}`;
}
