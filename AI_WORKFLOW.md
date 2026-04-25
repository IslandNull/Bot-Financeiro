# AI Workflow - Bot Financeiro

Este documento coordena o trabalho entre as diferentes IAs. **Sempre leia este arquivo antes de iniciar qualquer tarefa.**

## 🤖 Divisão de Tarefas
- **Gemini (Arquiteto):** Orquestração, Integração, Debug de Infra.
- **Claude (Refinador):** Estilo, Testes, Documentação, Revisão.
- **Codex (Lógica):** Algoritmos, Lógica de Negócio, Novas Features.

## 📌 Status Atual
- [x] Download do Repositório (Gemini)
- [x] Configuração de Ambiente Git (Gemini)
- [ ] Mapeamento de Funções do `Code.js` (Codex/Gemini)
- [ ] Implementação de Testes (Claude)

## 🛠 Convenções de Commit
`[IA] (Módulo): Descrição curta`
Exemplo: `[Gemini] (Docs): Criado AI_WORKFLOW.md`

## ⚠️ Regras de Convivência
1. **Execução Sequencial:** Apenas uma IA trabalha por vez. Nunca inicie uma tarefa em uma IA sem o Handoff da anterior.
2. **Seleção de IA:** O Gemini (Arquiteto) indicará qual IA é a mais custo-efetiva para cada sub-tarefa.
3. **Otimização de Tokens:** O objetivo é a máxima precisão com o mínimo de contexto. Evite enviar arquivos inteiros se apenas uma função for necessária.
4. Nunca modifique um `.md` de outra IA sem permissão explícita.

## 💰 Diretriz de Custo-Benefício
- **Gemini 3.1:** Orquestração e Mapeamento (Baixo/Médio custo).
- **Claude Opus 4.7:** Refatoração Crítica e Revisão de Segurança (Alto custo - usar apenas em tarefas complexas).
- **GPT Codex 5.5:** Implementação de Lógica e Algoritmos (Médio custo).

## 🧰 Gerenciamento de Skills (Cross-IA)
- Todas as skills/ferramentas externas devem estar registradas em `/.ai_shared/registry.json`.
- Scripts compartilhados ficam em `/.ai_shared/tools/`.
- Instruções de comportamento complexo ficam em `/.ai_shared/skills/`.
- **NUNCA** use uma skill que não esteja no diretório compartilhado; isso evita que uma IA tenha capacidades que as outras desconhecem.
