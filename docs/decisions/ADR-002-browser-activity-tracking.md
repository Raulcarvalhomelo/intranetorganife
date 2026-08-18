# ADR-002: iniciar rastreamento pela atividade do navegador

- **Status:** proposta para implementação futura
- **Data:** 2026-08-18
- **Escopo:** extensão, backend e Dashboard

## Contexto

O sistema já possui extensão de navegador, captura de logs, WebSocket, persistência local e Dashboard. Existe interesse em medir tempo observado e atividade de funcionários em trabalho remoto, mas a extensão não é uma fonte confiável para aplicações externas do Windows.

Uma solução completa de monitoramento de aplicações exigiria um agente nativo separado, com maior impacto operacional, de segurança e de privacidade.

## Decisão

A primeira implementação deve reutilizar os logs existentes e adicionar somente métricas agregadas de atividade dentro do navegador. O rastreamento deve registrar sessões, transições de foco, domínio normalizado e estado ocioso, sem capturar conteúdo de páginas, teclas, screenshots, áudio ou vídeo.

O backend deve receber eventos em lote, deduplicar por identificador idempotente, derivar sessões e produzir agregados. O Dashboard deve consumir dados autorizados pelo backend e não calcular permissões apenas no frontend.

Um agente Windows para aplicações externas fica fora da primeira fase e só poderá ser avaliado em uma decisão futura específica.

## Motivações

A decisão reduz risco de regressão no motor de bloqueio, aproveita a infraestrutura existente, mantém o consumo da extensão baixo e permite validar a utilidade dos relatórios antes de introduzir um processo nativo persistente.

A coleta mínima também facilita definir finalidade, retenção, transparência, acesso por equipe e auditoria antes de usar qualquer indicador em decisões de gestão.

## Consequências positivas

- menor superfície de código alterada;
- menor consumo de CPU, memória e rede;
- reutilização de logs, WebSocket e IndexedDB existentes;
- implantação incremental e reversível;
- separação entre fatos observados e classificação de produtividade;
- menor risco de monitoramento invasivo no primeiro estágio.

## Consequências negativas

- não mede aplicações usadas fora do navegador;
- não representa toda a jornada de trabalho;
- exige cuidado para não interpretar tempo de navegador como produtividade;
- pode exigir etapa futura com agente Windows se o requisito persistir.

## Restrições

A implementação futura não deve alterar o bloqueio, identidade, Kanban ou autenticação. O backend deve permanecer Node.js 14/CommonJS. A feature deve ser desabilitável sem quebrar o restante da extensão.

## Critérios para revisar esta decisão

Revisar esta ADR somente após:

1. validação dos relatórios de navegador;
2. aprovação da política de privacidade e retenção;
3. comprovação de que os dados atuais não atendem ao requisito;
4. definição da necessidade real de aplicações externas;
5. análise de segurança e implantação de um agente Windows separado.
