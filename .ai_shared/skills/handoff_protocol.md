# Agent Handoff Protocol

Para garantir a continuidade entre IAs, cada tarefa finalizada deve gerar um bloco de "Handoff" no `AI_WORKFLOW.md`.

## 📝 Estrutura do Handoff
- **Status Final:** (Ex: Sucesso / Erro / Pendente)
- **Mudanças Relevantes:** (O que foi alterado)
- **Próxima IA Sugerida:** (Ex: @Codex)
- **Prompt Otimizado para Próxima IA:** (Um prompt curto e cirúrgico pronto para copiar e colar, focado em economizar tokens).

## 🔄 Fluxo de Trabalho
1. IA-1 lê o `AI_WORKFLOW.md`.
2. IA-1 executa a tarefa.
3. IA-1 escreve o Handoff.
4. IA-1 notifica o Usuário sobre quem deve ser a próxima IA.
