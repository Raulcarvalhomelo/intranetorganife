# Instruções para agentes: rastreamento agregado de atividade do navegador

## Status e limite desta documentação

Este documento descreve uma implementação futura. **Não é autorização para criar a feature durante uma tarefa de documentação.** A implementação só deve começar mediante solicitação explícita.

O escopo aprovado é rastrear atividade agregada dentro do navegador reutilizando os logs existentes. Não criar ainda um agente Windows, monitoramento de aplicações externas, screenshots, captura de teclado, captura de conteúdo de documentos, webcam ou microfone.

## Objetivo

Adicionar métricas de atividade do navegador para permitir relatórios de sessões e tempo observado, mantendo o bloqueio, a identidade, o Kanban, a autenticação e os contratos existentes funcionando exatamente como antes.

O sistema deve registrar fatos observáveis, não concluir automaticamente que uma pessoa foi produtiva. A classificação de domínios ou categorias deve ser configurável, transparente e separada dos eventos brutos.

## Ordem obrigatória de implementação

1. Ler `CLAUDE.md`, `AGENTS.md`, `server/AGENTS.md`, `server/backend/AGENTS.md` e os contratos relacionados.
2. Inspecionar os logs existentes, os listeners de abas/navegação, o WebSocket e o armazenamento IndexedDB.
3. Definir o schema e a política de retenção antes de implementar listeners.
4. Implementar o mínimo no service worker, preferencialmente em módulo de rastreamento isolado.
5. Reutilizar a persistência local de logs e o transporte existente em lotes; não criar uma segunda fila paralela sem decisão registrada.
6. Implementar ingestão e agregação no backend antes da interface do Dashboard.
7. Aplicar autorização no backend; ocultar abas no frontend nunca é suficiente.
8. Criar testes isolados para transições de sessão, ociosidade, reconexão, deduplicação e permissões.
9. Executar validações e revisar o diff para garantir que o motor de bloqueio e o Kanban não foram alterados.

## Dados permitidos no primeiro escopo

Registrar somente os dados necessários:

- identificador do usuário e do dispositivo conforme os contratos atuais;
- origem do evento, como extensão;
- navegador;
- domínio ou URL normalizada conforme a política aprovada;
- timestamp de início e fim da sessão;
- aba ativa somente quando necessária para calcular a sessão;
- estado ativo, ocioso ou desconhecido;
- versão do agente/extensão;
- identificador idempotente do evento.

Não registrar conteúdo de página, parâmetros sensíveis de URL, cookies, tokens, texto digitado, títulos que possam revelar conteúdo sensível, screenshots, áudio, vídeo ou documentos locais.

## Modelo de sessão

Uma sessão deve representar um intervalo agregado, e não um evento por segundo. Uma sessão pode ser encerrada quando ocorrer uma mudança relevante de domínio, aba, janela de foco, estado ocioso ou limite de duração.

O servidor deve ser capaz de deduplicar eventos por `eventId`, usuário, dispositivo e intervalo. O tempo observado não deve ser contado durante o estado ocioso. Intervalos sem sinal confiável devem ser marcados como `unknown`, não convertidos automaticamente em atividade.

## Desempenho

A extensão não deve usar polling de alta frequência. Preferir listeners de mudança de aba, foco e ociosidade. Enviar transições ou intervalos agregados em lote pelo transporte WebSocket existente.

Não iniciar uma requisição para cada evento. Não bloquear o service worker com operações síncronas. Usar a fila IndexedDB existente ou uma evolução documentada dela, com limite de tamanho, expiração e backoff.

## Compatibilidade e isolamento

Não alterar a ordem de avaliação do bloqueio, as exceções, a janela livre de Brasília, as listas de domínios, o fluxo de identidade, o Kanban ou a autenticação.

O rastreamento deve ser opt-in no sentido técnico até que a política de coleta esteja definida: uma configuração ausente ou desabilitada não pode modificar o comportamento atual da extensão.

O backend deve continuar compatível com Node.js 14 e CommonJS. Não adicionar dependência de banco sem aprovação. O armazenamento de atividade deve usar os mecanismos existentes ou uma migração explicitamente documentada.

## Entregáveis esperados quando a implementação for autorizada

- contrato em `docs/contracts/browser-activity.md`;
- regras de acesso em `docs/contracts/activity-permissions.md`;
- decisão em `docs/decisions/`;
- testes de extensão e backend isolados;
- módulo de rastreamento separado do bloqueador;
- ingestão idempotente e agregação no backend;
- Dashboard somente depois de API, permissões e agregados estarem validados;
- relatório de arquivos alterados e riscos residuais.

## Critério de não regressão

A implementação só pode ser considerada concluída se os testes existentes do bloqueio, identidade, Kanban, logs e autenticação continuarem passando, se a extensão funcionar com o rastreamento desabilitado e se nenhuma rota ou mensagem existente for quebrada sem atualização de contrato.
