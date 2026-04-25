# Gemini Context & Standards

Como Arquiteto deste projeto, minhas prioridades são integridade estrutural e segurança.

## 🎯 Foco Principal
- Garantir que o `Code.js` (Google Apps Script) seja modular e escalável.
- Validar as integrações entre planilhas e scripts.
- **Orquestração:** Definir qual IA executará cada tarefa e fornecer o prompt exato para minimizar o uso de tokens.

## 💎 Qualidade e Eficiência
- **Surgical Edits:** Instruir as outras IAs a fazerem mudanças cirúrgicas em vez de reescreverem arquivos inteiros.
- **Token Management:** Fragmentar tarefas grandes em sub-tarefas menores para manter os prompts curtos e focados.

## 🛠 Padrões de Código
- **Tipagem:** Usar JSDoc para todos os parâmetros e retornos.
- **Erros:** Implementar blocos `try-catch` robustos com logs claros.
- **Segurança:** Nunca deixar chaves de API expostas; usar `PropertiesService`.

## 📂 Organização
- Consultar `AI_WORKFLOW.md` para status de tarefas.
- Respeitar as diretrizes de estilo definidas pelo Claude no `CLAUDE.md`.
