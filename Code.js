// ============================================================
// CONFIG — valores não-sensíveis inline; segredos via PropertiesService
// Para configurar os segredos, execute setupSecrets() uma vez no Editor
// ============================================================
const CONFIG = {
    MODEL: 'gpt-5-nano',
    TIMEZONE: 'America/Sao_Paulo',
    SHEETS: {
        lancamentos: 'Lançamentos',
        config: 'Config',
        dashboard: 'Dashboard',
        investimentos: 'Investimentos',
        parcelas: 'Parcelas'
    }
};

const PROVISAO_CATS = [
    'Roupas', 'Peças íntimas', 'Calçado', 'Presentes',
    'Cuidado pessoal', 'Dentista', 'Coparticipação médica',
    'Farmácia', 'Óleo moto', 'IPTU', 'Compras Shopee/ML', 'Reserva imprevistos'
];

function _loadSecrets() {
    const p = PropertiesService.getScriptProperties();
    CONFIG.OPENAI_API_KEY = p.getProperty('OPENAI_API_KEY');
    CONFIG.TELEGRAM_TOKEN = p.getProperty('TELEGRAM_TOKEN');
    CONFIG.SPREADSHEET_ID = p.getProperty('SPREADSHEET_ID');
    CONFIG.AUTHORIZED = JSON.parse(p.getProperty('AUTHORIZED') || '{}');
}

// ============================================================
// ENTRY POINT — Telegram webhook
// ============================================================
function doPost(e) {
    _loadSecrets();
    try {
        const update = JSON.parse(e.postData.contents);
        const msg = update.message || update.edited_message;
        if (!msg || !msg.text) return _ok();

        const chatId = String(msg.chat.id);
        const text = msg.text.trim();
        const user = CONFIG.AUTHORIZED[chatId];

        if (!user) {
            sendTelegram(chatId, '🚫 Você não está autorizado a usar este bot.');
            return _ok();
        }

        if (text.startsWith('/')) {
            handleCommand(text, chatId, user);
        } else {
            handleEntry(text, chatId, user);
        }
    } catch (err) {
        console.error('doPost error:', err, err.stack);
    }
    return _ok();
}

function _ok() { return ContentService.createTextOutput(''); }

// ============================================================
// LANÇAMENTO — parse + valida + grava + responde
// ============================================================
function handleEntry(text, chatId, user) {
    let parsed;
    try {
        parsed = parseWithOpenAI(text, user.pagador);
    } catch (err) {
        sendTelegram(chatId, `⚠️ Erro ao interpretar a mensagem: ${err.message}\n\nTente algo como: "52 ifood luana nubank" ou "aportei 500 no cdb".`);
        return;
    }

    if (parsed.error) {
        sendTelegram(chatId, `🤔 Não entendi: ${parsed.error}\n\nExemplos:\n• "52 ifood luana nubank"\n• "gastei 35 no café"\n• "aportei 500 no cdb"`);
        return;
    }

    const validation = validateParse(parsed);
    if (!validation.ok) {
        sendTelegram(chatId, `⚠️ ${validation.message}`);
        return;
    }

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SHEETS.lancamentos);
    const date = new Date();
    const newRow = sheet.getLastRow() + 1;

    // Column H (Competência) = same as date for non-installment entries
    sheet.getRange(newRow, 1, 1, 8).setValues([[
        date,
        parsed.tipo,
        parsed.valor,
        parsed.categoria,
        parsed.pagador,
        parsed.fonte,
        parsed.descricao || '',
        date
    ]]);

    sheet.getRange(newRow, 1).setNumberFormat('dd/mm/yyyy');
    sheet.getRange(newRow, 3).setNumberFormat('"R$ "#,##0.00');
    sheet.getRange(newRow, 8).setNumberFormat('dd/mm/yyyy');

    PropertiesService.getScriptProperties()
        .setProperty('last_row_' + chatId, String(newRow));

    sendTelegram(chatId, formatEntryResponse(parsed, date));
}

function formatEntryResponse(p, date) {
    const dataStr = Utilities.formatDate(date, CONFIG.TIMEZONE, 'dd/MM/yyyy');
    const valorStr = formatBRL(p.valor);

    if (p.tipo === 'Transferência') {
        return `✅ Transferência registrada\n💸 ${valorStr}\n📤 ${p.fonte} → ${p.categoria}\n👤 ${p.pagador}\n📅 ${dataStr}`;
    }

    const icon = p.tipo === 'Receita' ? '💵' : '💸';
    let resp = `✅ Registrado\n${icon} ${valorStr} — ${p.categoria}\n👤 ${p.pagador} • ${p.fonte}\n📅 ${dataStr}`;

    if (p.descricao) resp += `\n📝 ${p.descricao}`;

    if (p.tipo === 'Despesa') {
        if (PROVISAO_CATS.includes(p.categoria)) {
            const s = getAccumulatedSaldo(p.categoria);
            if (s) {
                const pct = s.creditoTotal > 0 ? Math.round((s.gastoHistorico / s.creditoTotal) * 100) : 0;
                const alerta = s.acumulado < 0 ? ' ⚠️ NEGATIVO' : pct > 80 ? ' ⚡' : ' ✅';
                resp += `\n\n📦 ${p.categoria} (${s.meses} meses acumulados):\n${formatBRL(s.gastoHistorico)} de ${formatBRL(s.creditoTotal)} (${pct}%)\nSaldo envelope: ${formatBRL(s.acumulado)}${alerta}`;
            }
        } else {
            const s = getCategorySaldo(p.categoria);
            if (s) {
                const pct = s.planejado > 0 ? Math.round((s.gasto / s.planejado) * 100) : 0;
                const alerta = pct > 100 ? ' ⚠️ ESTOUROU' : pct > 80 ? ' ⚡' : pct > 50 ? '' : ' ✅';
                resp += `\n\n📊 ${p.categoria} no mês:\n${formatBRL(s.gasto)} de ${formatBRL(s.planejado)} (${pct}%)${alerta}`;
            }
        }
    }

    return resp;
}

// ============================================================
// PARSE — chama OpenAI com structured output
// ============================================================
function parseWithOpenAI(text, pagadorDefault) {
    const { categorias, fontes, pagadores } = getListsCached();

    const systemPrompt = buildSystemPrompt(categorias, fontes, pagadores, pagadorDefault);

    const body = {
        model: CONFIG.MODEL,
        reasoning_effort: 'low',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
        ],
        response_format: {
            type: 'json_schema',
            json_schema: {
                name: 'lancamento',
                strict: true,
                schema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        tipo: { type: 'string', enum: ['Despesa', 'Receita', 'Transferência'] },
                        valor: { type: 'number' },
                        categoria: { type: 'string' },
                        pagador: { type: 'string', enum: pagadores },
                        fonte: { type: 'string' },
                        descricao: { type: 'string' },
                        error: { type: ['string', 'null'] }
                    },
                    required: ['tipo', 'valor', 'categoria', 'pagador', 'fonte', 'descricao', 'error']
                }
            }
        }
    };

    const response = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
        method: 'post',
        contentType: 'application/json',
        headers: { 'Authorization': 'Bearer ' + CONFIG.OPENAI_API_KEY },
        payload: JSON.stringify(body),
        muteHttpExceptions: true
    });

    const code = response.getResponseCode();
    const respText = response.getContentText();

    if (code !== 200) {
        throw new Error('OpenAI ' + code + ': ' + respText.substring(0, 200));
    }

    const data = JSON.parse(respText);
    const content = data.choices[0].message.content;
    return JSON.parse(content);
}

function buildSystemPrompt(categorias, fontes, pagadores, pagadorDefault) {
    return `<identidade>
Você é o parser de mensagens financeiras do bot doméstico do casal Gustavo e Luana.
Sua única função é transformar mensagens em português brasileiro informal
em registros estruturados de gastos, receitas ou transferências entre contas.
</identidade>

<regras_globais>
1. TIPO: assuma "Despesa" por padrão. Marque "Receita" SOMENTE quando a mensagem
   descrever recebimento (salário, bônus, reembolso, PIX recebido, estorno).
   Marque "Transferência" para movimentação entre contas/investimentos (regra 8).

2. VALOR: extraia o número exatamente como informado, PRESERVANDO casas decimais.
   "R$ 52,75" → 52.75 (não arredonde para 53).
   Aceite formatos: "52", "52,50", "R$ 52", "52 reais", "52.50".
   Sempre positivo.

3. CATEGORIA: escolha SEMPRE uma das opções em <mapeamento_categorias>.
   Se nenhuma encaixar com segurança, use "Outros" E preencha "descricao"
   com o termo original da mensagem E preencha "error" com:
   "Não encontrei categoria exata. Confirma 'Outros' ou manda a categoria?"

4. PAGADOR: use o valor passado em <contexto_pagador_default> por padrão
   (é quem mandou a mensagem no Telegram).
   Altere SOMENTE quando a mensagem citar explicitamente a outra pessoa
   ("luana pagou", "foi o gustavo", "ela comprou").
   Valores aceitos: ${pagadores.join(' ou ')}.

5. FONTE: escolha SEMPRE uma das opções em <mapeamento_fontes>.
   Se a mensagem não dá pista da fonte, use "Outro" (é uma opção válida).
   Para Transferência: FONTE = conta/investimento de ORIGEM do dinheiro.

6. DESCRICAO: texto livre curto, opcional. Preencha quando houver
   informação adicional útil (nome do estabelecimento, motivo).
   Caso contrário, retorne string vazia "".

7. ERROR: retorne null quando o parse foi bem-sucedido.
   Preencha com uma pergunta curta ao usuário APENAS nestes casos:
   (a) categoria sem encaixe (ver regra 3),
   (b) valor ausente ou ambíguo na mensagem,
   (c) tipo (Despesa/Receita/Transferência) realmente ambíguo.
   Nesses casos, ainda retorne um JSON válido: use valor=0 e
   categoria="Outros" como placeholders.

8. TRANSFERÊNCIA: use tipo="Transferência" quando a mensagem descrever
   movimentação entre contas ou para/de investimentos.
   Heurísticas: "aportei", "resgatei", "separei", "mandei pro cdb", "tirei do cdb".
   FONTE = origem (ex: "Conta Gustavo" para aporte; "CDB 115% CDI" para resgate).
   CATEGORIA = destino (ex: "CDB 115% CDI" para aporte; "Conta Gustavo" para resgate).
   ATENÇÃO: fonte NUNCA pode ser igual à categoria (auto-transferência é inválida).

9. RENDIMENTOS: use tipo="Receita" e categoria="Rendimento CDB" quando
   a mensagem descrever rendimento de investimento.
   Heurísticas: "rendeu", "rende do cdb", "rendimento do cdb".
   FONTE = "CDB 115% CDI".
</regras_globais>

<contexto_pagador_default>
${pagadorDefault}
</contexto_pagador_default>

<mapeamento_categorias>
<opcoes_validas>
${categorias.map(c => `- ${c}`).join('\n')}
</opcoes_validas>

<regras_de_inferencia>
- "ifood", "rappi", "delivery", "pedi comida" → Delivery
- "mercado", "zaffari", "carrefour", "compra do mês" → Supermercado
- "feira", "hortifruti", "ceasa" → Feira
- "açougue", "padaria" (compra estruturada) → Açougue/padaria
- "café", "padaria na rua", "cafezinho" (consumo rápido recorrente) → Padaria/café (semana)
- "lanche", "lanchinho", "pastel", "coxinha", "salgado" (consumo esporádico) → Lanches esporádicos
- "salão", "barba", "manicure", "cabelo" → Cuidado pessoal
- "uber", "99", "taxi" (da luana pro trabalho) → Uber Luana
- "gasolina", "combustível" (moto do gustavo) → Combustível moto
- "netflix", "disney", "prime", "max", "globoplay" → Streaming
- "shopee", "mercado livre", "aliexpress" → Compras Shopee/ML
- "restaurante", "jantar fora" (casal) → Restaurante casal
- "luz", "cemig", "rge", "cpfl" → Luz
- "água", "saneamento" → Água
- "condomínio" → Condomínio
- "financiamento caixa", "parcela casa" → Financ. Caixa
- "vasco" (financiamento da entrada) → Financ. Vasco
- "salário" + pagador → Salário Gustavo ou Salário Luana
- "aportei", "mandei pro cdb" → categoria=CDB 115% CDI (tipo=Transferência)
- "resgatei", "tirei do cdb" → categoria=Conta Gustavo (tipo=Transferência, fonte=CDB 115% CDI)
- "rendeu", "rendimento cdb" → categoria=Rendimento CDB (tipo=Receita, fonte=CDB 115% CDI)
</regras_de_inferencia>
</mapeamento_categorias>

<mapeamento_fontes>
<opcoes_validas>
${fontes.map(f => `- ${f}`).join('\n')}
</opcoes_validas>

<regras_de_inferencia>
- "cartão" ou "nubank" + pagador Gustavo → Nubank Gu
- "cartão" ou "nubank" + pagador Luana → Nubank Lu
- "mercado pago", "mp" → Mercado Pago Gu
- "pix", "débito", "conta" + pagador → Conta Gustavo ou Conta Luana
- "vr", "va", "vale refeição", "vale alimentação" → VR/VA Gustavo
- "auxílio combustível", "aux combustível" → Aux. Combustível Gustavo
- Sem pista → Outro
- Receita de salário/VR/aux (tipo=Receita) → Folha (crédito em conta)
- Aporte ao CDB: fonte=Conta Gustavo (ou Conta Luana)
- Resgate do CDB: fonte=CDB 115% CDI
- Rendimento CDB: fonte=CDB 115% CDI
</regras_de_inferencia>
</mapeamento_fontes>

<formato_saida>
JSON com os campos: tipo, valor, categoria, pagador, fonte, descricao, error.
O schema é aplicado pela API — preencha todos os campos obrigatórios,
respeitando os tipos e as opções válidas dos mapeamentos acima.
</formato_saida>

<exemplos>
<exemplo_1>
Entrada: "52 ifood luana nubank"
Saída: {"tipo":"Despesa","valor":52,"categoria":"Delivery","pagador":"Luana","fonte":"Nubank Lu","descricao":"","error":null}
</exemplo_1>

<exemplo_2>
Entrada: "gastei 35,50 no café" (contexto: pagador default = Gustavo)
Saída: {"tipo":"Despesa","valor":35.50,"categoria":"Padaria/café (semana)","pagador":"Gustavo","fonte":"Nubank Gu","descricao":"","error":null}
</exemplo_2>

<exemplo_3>
Entrada: "1910 financiamento caixa" (contexto: pagador default = Gustavo)
Saída: {"tipo":"Despesa","valor":1910,"categoria":"Financ. Caixa","pagador":"Gustavo","fonte":"Conta Gustavo","descricao":"","error":null}
</exemplo_3>

<exemplo_4>
Entrada: "420,75 mercado zaffari vr" (contexto: pagador default = Gustavo)
Saída: {"tipo":"Despesa","valor":420.75,"categoria":"Supermercado","pagador":"Gustavo","fonte":"VR/VA Gustavo","descricao":"Zaffari","error":null}
</exemplo_4>

<exemplo_5>
Entrada: "recebi salário 3800 luana"
Saída: {"tipo":"Receita","valor":3800,"categoria":"Salário Luana","pagador":"Luana","fonte":"Folha (crédito em conta)","descricao":"","error":null}
</exemplo_5>

<exemplo_6>
Entrada: "aportei 500 no cdb" (contexto: pagador default = Gustavo)
Saída: {"tipo":"Transferência","valor":500,"categoria":"CDB 115% CDI","pagador":"Gustavo","fonte":"Conta Gustavo","descricao":"","error":null}
</exemplo_6>

<exemplo_7>
Entrada: "resgatei 300 do cdb" (contexto: pagador default = Gustavo)
Saída: {"tipo":"Transferência","valor":300,"categoria":"Conta Gustavo","pagador":"Gustavo","fonte":"CDB 115% CDI","descricao":"","error":null}
</exemplo_7>

<exemplo_8>
Entrada: "o cdb rendeu 45,80 esse mês" (contexto: pagador default = Gustavo)
Saída: {"tipo":"Receita","valor":45.80,"categoria":"Rendimento CDB","pagador":"Gustavo","fonte":"CDB 115% CDI","descricao":"","error":null}
</exemplo_8>

<exemplo_9>
Entrada: "gastei algumas coisas" (contexto: pagador default = Gustavo)
Saída: {"tipo":"Despesa","valor":0,"categoria":"Outros","pagador":"Gustavo","fonte":"Outro","descricao":"","error":"Qual o valor e a categoria?"}
</exemplo_9>

<exemplo_10>
Entrada: "50 ração do cachorro pix" (contexto: pagador default = Gustavo)
Saída: {"tipo":"Despesa","valor":50,"categoria":"Outros","pagador":"Gustavo","fonte":"Conta Gustavo","descricao":"ração cachorro","error":"Não encontrei categoria exata. Confirma 'Outros' ou manda a categoria?"}
</exemplo_10>
</exemplos>`;
}

// ============================================================
// VALIDAÇÃO PÓS-PARSE — rede de segurança
// ============================================================
function validateParse(p) {
    const { categorias, fontes, pagadores } = getListsCached();

    if (typeof p.valor !== 'number' || p.valor <= 0) {
        return { ok: false, message: `Valor inválido: "${p.valor}". Precisa ser um número maior que zero.` };
    }
    if (!['Despesa', 'Receita', 'Transferência'].includes(p.tipo)) {
        return { ok: false, message: `Tipo "${p.tipo}" inválido.` };
    }
    if (!pagadores.includes(p.pagador)) {
        return { ok: false, message: `Pagador "${p.pagador}" inválido. Use Gustavo ou Luana.` };
    }
    if (!fontes.includes(p.fonte)) {
        return { ok: false, message: `Fonte "${p.fonte}" não existe. Ex: Nubank Gu, Conta Gustavo, CDB 115% CDI.` };
    }
    // For Transferência, categoria is the destination — can be a category OR a fonte (account)
    if (p.tipo === 'Transferência') {
        if (!categorias.includes(p.categoria) && !fontes.includes(p.categoria)) {
            return { ok: false, message: `Destino "${p.categoria}" inválido para Transferência. Use uma conta ou investimento válido.` };
        }
        if (p.fonte === p.categoria) {
            return { ok: false, message: `Transferência inválida: origem e destino são iguais (${p.fonte}).` };
        }
    } else {
        if (!categorias.includes(p.categoria)) {
            return { ok: false, message: `Categoria "${p.categoria}" não existe. Ex: Delivery, Supermercado, Financ. Caixa.` };
        }
    }
    return { ok: true };
}

// ============================================================
// LEITURA DAS LISTAS (CACHE)
// ============================================================
function getListsCached() {
    const cache = CacheService.getScriptCache();
    const cached = cache.get('lists_v1');
    if (cached) return JSON.parse(cached);

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const cfg = ss.getSheetByName(CONFIG.SHEETS.config);

    // Pagadores: B11:B... / Fontes: C11:C... / Categorias despesa: E11:E... / Receita: I11:I...
    const pagadores = cfg.getRange('B11:B20').getValues().flat().filter(String);
    const fontes = cfg.getRange('C11:C35').getValues().flat().filter(String);
    const catDesp = cfg.getRange('E11:E60').getValues().flat().filter(String);
    const catRec = cfg.getRange('I11:I20').getValues().flat().filter(String);

    const lists = {
        pagadores,
        fontes,
        categorias: [...catDesp, ...catRec]
    };

    cache.put('lists_v1', JSON.stringify(lists), 3600); // 1 hora
    return lists;
}

// ============================================================
// COMANDOS
// ============================================================
function handleCommand(text, chatId, user) {
    const cmd = text.split(/\s+/)[0].toLowerCase();
    const arg = text.substring(cmd.length).trim();

    switch (cmd) {
        case '/start':
        case '/help':
            return sendTelegram(chatId, helpText());
        case '/resumo':
            return sendTelegram(chatId, getResumoMes());
        case '/saldo':
            return sendTelegram(chatId, arg ? getSaldoCategoria(arg) : getSaldoTop5());
        case '/hoje':
            return sendTelegram(chatId, getLancamentosHoje());
        case '/desfazer':
            return desfazerUltimo(chatId, user);
        case '/transferir':
            return sendTelegram(chatId, getAcertoMes());
        default:
            return sendTelegram(chatId, `Comando "${cmd}" não reconhecido. Mande /help pra ver os comandos.`);
    }
}

function helpText() {
    return `🤖 *Bot Financeiro*

*Lançar gasto:* mande no formato livre
- "52 ifood luana cartão"
- "gastei 35 no café"
- "1910 financiamento caixa"

*Comandos:*
/resumo — visão geral do mês
/saldo — top 5 categorias
/saldo delivery — uma categoria
/hoje — lançamentos de hoje
/transferir — quanto a Luana transfere
/desfazer — apaga o último lançamento
/help — esta ajuda`;
}

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
    const { categorias } = getListsCached();
    const n = nomeAprox.toLowerCase();
    const match = categorias.find(c => c.toLowerCase().includes(n));

    if (!match) {
        const sugestoes = categorias.filter(c =>
            n.split(' ').some(w => w.length > 2 && c.toLowerCase().includes(w))
        ).slice(0, 5);
        return `Categoria "${nomeAprox}" não encontrada.${sugestoes.length ? '\n\nTalvez:\n' + sugestoes.map(s => '• ' + s).join('\n') : ''}`;
    }

    if (PROVISAO_CATS.includes(match)) {
        const s = getAccumulatedSaldo(match);
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

    const total = doDia.filter(r => r[1] === 'Despesa').reduce((a, r) => a + r[2], 0);
    const linhas = doDia.map(r => {
        const icon = r[1] === 'Receita' ? '💵' : '💸';
        return `${icon} ${formatBRL(r[2])} — ${r[3]} (${r[4]})`;
    });
    return `📅 *Hoje (${hoje})*\n\n${linhas.join('\n')}\n\n*Total gasto hoje:* ${formatBRL(total)}`;
}

function desfazerUltimo(chatId, user) {
    const props = PropertiesService.getScriptProperties();
    const lastRow = props.getProperty('last_row_' + chatId);
    if (!lastRow) {
        sendTelegram(chatId, 'Nada pra desfazer. Só dá pra desfazer o último lançamento que VOCÊ fez.');
        return;
    }
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SHEETS.lancamentos);
    const row = parseInt(lastRow, 10);
    const vals = sheet.getRange(row, 1, 1, 8).getValues()[0];

    if (!vals[2]) {
        sendTelegram(chatId, 'Linha já estava vazia — nada pra desfazer.');
        return;
    }

    sheet.getRange(row, 1, 1, 8).clearContent();
    props.deleteProperty('last_row_' + chatId);
    sendTelegram(chatId, `↩️ Desfeito\n💸 ${formatBRL(vals[2])} — ${vals[3]} (${vals[4]})`);
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

function handleManter(chatId, user) {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const dash = ss.getSheetByName(CONFIG.SHEETS.dashboard);
    const transfere = dash.getRange('E16').getValue();

    if (!transfere || transfere <= 0) {
        sendTelegram(chatId, `ℹ️ Acerto do mês: ${formatBRL(transfere)}\nNada a transferir este mês.`);
        return;
    }

    const sheet = ss.getSheetByName(CONFIG.SHEETS.lancamentos);
    const date = new Date();
    const newRow = sheet.getLastRow() + 1;

    sheet.getRange(newRow, 1, 1, 8).setValues([[
        date, 'Transferência', transfere, 'Conta Gustavo',
        user.pagador, 'Conta Luana', 'Acerto mensal', date
    ]]);
    sheet.getRange(newRow, 1).setNumberFormat('dd/mm/yyyy');
    sheet.getRange(newRow, 3).setNumberFormat('"R$ "#,##0.00');
    sheet.getRange(newRow, 8).setNumberFormat('dd/mm/yyyy');

    PropertiesService.getScriptProperties()
        .setProperty('last_row_' + chatId, String(newRow));

    sendTelegram(chatId, `✅ Acerto registrado!\n💸 ${formatBRL(transfere)}\n📤 Conta Luana → Conta Gustavo\n📅 ${Utilities.formatDate(date, CONFIG.TIMEZONE, 'dd/MM/yyyy')}`);
}

// ============================================================
// HELPERS
// ============================================================
function monthsDiff(d1, d2) {
    return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()) + 1;
}

function getAccumulatedSaldo(categoria) {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const cfg = ss.getSheetByName(CONFIG.SHEETS.config);
    const dataInicio = cfg.getRange('C7').getValue();
    if (!dataInicio) return null;

    const meses = monthsDiff(new Date(dataInicio), new Date());
    const dash = ss.getSheetByName(CONFIG.SHEETS.dashboard);

    // Find planned amount for this category in Dashboard (B and D columns, rows 26-130)
    const dashData = dash.getRange('B26:D130').getValues();
    const dashRow = dashData.find(r => r[0] === categoria);
    const planejado = dashRow ? dashRow[2] : 0;
    if (!planejado) return null;

    // Sum all historical spending for this category since sistema start
    const sheet = ss.getSheetByName(CONFIG.SHEETS.lancamentos);
    const lastRow = sheet.getLastRow();
    if (lastRow < 6) return { planejado, meses, creditoTotal: planejado * meses, gastoHistorico: 0, acumulado: planejado * meses };

    const lancData = sheet.getRange(6, 1, lastRow - 5, 8).getValues();
    const gastoHistorico = lancData
        .filter(r => r[3] === categoria && r[1] === 'Despesa' && r[0] >= dataInicio)
        .reduce((sum, r) => sum + (typeof r[2] === 'number' ? r[2] : 0), 0);

    return {
        planejado,
        meses,
        creditoTotal: planejado * meses,
        gastoHistorico,
        acumulado: planejado * meses - gastoHistorico
    };
}

function getCategorySaldo(categoria) {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const dash = ss.getSheetByName(CONFIG.SHEETS.dashboard);
    const values = dash.getRange('B26:E64').getValues();
    for (const row of values) {
        if (row[0] === categoria) {
            return { planejado: row[2], gasto: row[3] };
        }
    }
    return null;
}

function sendTelegram(chatId, text) {
    UrlFetchApp.fetch(`https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/sendMessage`, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown'
        }),
        muteHttpExceptions: true
    });
}

function formatBRL(n) {
    if (typeof n !== 'number') return 'R$ 0,00';
    return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// ============================================================
// SETUP — rodar UMA VEZ após o deploy
// ============================================================

// Configure os segredos pelo Apps Script Editor:
// Project Settings → Script Properties → Add property
// Chaves necessárias:
//   OPENAI_API_KEY   → chave da OpenAI
//   TELEGRAM_TOKEN   → token do BotFather
//   SPREADSHEET_ID   → ID da planilha Google Sheets
//   AUTHORIZED       → JSON: {"CHAT_ID_GUSTAVO":{"nome":"Gustavo","pagador":"Gustavo"},"CHAT_ID_LUANA":{"nome":"Luana","pagador":"Luana"}}

function setWebhook() {
    _loadSecrets();
    const url = ScriptApp.getService().getUrl();
    if (!url) throw new Error('Deploy o script como Web App primeiro.');

    const result = UrlFetchApp.fetch(
        `https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/setWebhook?url=${encodeURIComponent(url)}`
    );
    console.log('Webhook response:', result.getContentText());
}

function deleteWebhook() {
    _loadSecrets();
    UrlFetchApp.fetch(`https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/deleteWebhook`);
}

// ⚠️ Use ESTA função — aponta pro proxy Val.town (resolve bug do 302 do Apps Script)
function apontarWebhookProValTown() {
    _loadSecrets();
    const urlValTown = 'https://islandd.val.run/';
    const result = UrlFetchApp.fetch(
        `https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/setWebhook?url=${encodeURIComponent(urlValTown)}&drop_pending_updates=true`
    );
    console.log('Webhook apontado para Val.town:', result.getContentText());
}

function testParse() {
    _loadSecrets();
    const samples = [
        '52 ifood luana cartão',
        'gastei 35 no café',
        '1910 financiamento caixa',
        '420 mercado zaffari vr'
    ];
    for (const s of samples) {
        console.log('IN:', s);
        try {
            console.log('OUT:', JSON.stringify(parseWithOpenAI(s, 'Gustavo')));
        } catch (e) {
            console.log('ERR:', e.message);
        }
    }
}
