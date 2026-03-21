# Documentação Completa do Projeto: Organife

## 1. Visão Geral
A extensão **Organife** é uma solução corporativa focada em **Controle de Acesso** e **Aumento de Produtividade**. Ela atua como um proxy de abas para bloquear e auditar a navegação, ao mesmo tempo que oferece um portal corporativo rico (Intranet) na nova guia do navegador, incluindo gestão de tarefas (Kanban), links rápidos e mural de avisos.

## 2. Regras de Negócio e Controle de Acesso
A extensão possui um motor robusto de restrição e liberação operando em tempo real.

### 2.1 Políticas de Bloqueio e Permissão
*   **Identificação Obrigatória:** O usuário precisa se identificar (`identity.html`) antes de navegar livremente. Usuários não identificados são redirecionados automaticamente.
*   **Total Block Mode:** Pode ser ativado para bloquear toda a internet, exceto os domínios permitidos explicitamente (`allowedDomains`, `allowedLinks`).
*   **Horário Livre:** A extensão detecta o horário de almoço (fuso de Brasília, às 12h) e libera temporariamente a restrição corporativa.
*   **Usuários Isentos:** Usuários específicos (como `diretoria`) não passam pelo filtro de bloqueio.
*   **Palavras-Chave e Domínios:** Bloqueio aplicado caso a URL contenha palavras-chave proibidas ou coincida com domínios bloqueados.
*   **Logs e Auditoria:** Todas as navegações são auditadas, associando a URL ao usuário do navegador e usuário do Windows, armazenadas localmente (últimas 72h) e enviadas para o VPS central.

### 2.2 Fluxo de Solicitação de Liberação
*   Quando o usuário esbarra em um bloqueio (`blocked.html`), ele pode realizar uma **Solicitação de Liberação**.
*   A solicitação entra como pendente no painel do administrador.
*   Enquanto aguarda aprovação, o admin pode conceder uma **liberação provisória (Temp Allowed Links)**.
*   **Aprovação:** O domínio é promovido para a lista permanente de permitidos (`allowedDomains`).
*   **Rejeição:** O domínio é adicionado definitivamente aos bloqueados, e o usuário perde o acesso temporário.

## 3. Funcionalidades Visuais e Interfaces

### 3.1 Portal Corporativo (Intranet - Nova Guia)
A página de Nova Guia (`intranet.html`) atua como a área de produtividade diária do colaborador:
*   **Apresentação:** Nome da empresa, Nome do Usuário logado, IP Local e status da rede.
*   **Modo Escuro/Claro:** Suporte a temas persistidos localmente.
*   **Links Rápidos e Favoritos:** Acesso fácil a atalhos da empresa, espelhando os Favoritos do próprio navegador do associado.
*   **Mural de Avisos (Notice Board):** Comunicações globais da empresa com suporte a imagens expansíveis, links e Markdown simples. Pode ser expandido ou colapsado.
*   **Kanban Overlay:** Uma interface (overlay) para gerenciamento de fluxo de trabalho (Todos, Em progresso, Concluído), incluindo integração com anexos de arquivos locais (via *Native Messaging* `com.organife.filepicker`).
*   **Bloco de Notas Rápido:** Salva o conteúdo digitado localmente antes de fechar a aba.

### 3.2 Painel Administrativo (Popup)
Acessado ao clicar no ícone da extensão, sendo dividido em Área do Usuário e Área Administrativa.
*   **Visão do Usuário:** Links rápidos e contagem estatística (sites bloqueados, etc).
*   **Visão Administrativa:** Protegida por senha (`admin` ou usuário `restrito`).
*   **Gerenciamentos Disponíveis aos Admins:**
    *   **Sites / Palavras-chave / Domínios Permitidos:** Edição das listas em massa.
    *   **Rastreio:** Visualização, filtragem e exportação (CSV) do histórico de páginas acessadas pelos usuários nos últimos 3 dias.
    *   **Usuários:** Gerenciar quem está utilizando a sessão.
    *   **Solicitações:** Aprovar ou rejeitar pedidos de acesso.
    *   **Avisos e Config:** Editar as mensagens da Intranet, links padrão, e realizar Backup/Restore local (em arquivo `.json`).

## 4. Comunicação e Backend
*   **WebSockets (SSE):** A extensão mantém uma conexão contínua via WebSocket com um servidor central (`wss://...` ou `ws://192.168.100.34:1337`) para propagar regras de bloqueio, senhas e configurações em tempo real para todos os clientes, além de enviar as aprovações/solicitações.
*   **Sincronização:** Todas as configurações são espelhadas localmente pelo `browser.storage.local`. Se o VPS cair, a extensão continua funcionando com a última configuração.
*   **Integração Nativa:** Para manipulação de arquivos no sistema operacional (como salvar anexos no Kanban), a aplicação delega os comandos para `com.organife.filepicker` via `chrome.runtime.sendNativeMessage`.

---

## 5. Plano Estratégico do Kanban (Migração do Overlay para Página Própria)

Atualmente o Kanban opera como um *overlay* de interface na Intranet. O novo plano arquitetural é extraí-lo para uma experiência completa de página focada no aumento de eficiência, mantendo a interoperabilidade:

**Fase 0 — Congelar base atual**
*   **Objetivo:** Garantir um ponto de partida estável.
*   **Entregas:** Validação do fluxo nativo atual (criar, mover, editar, anexar) em múltiplas máquinas; Snapshot dos dados.

**Fase 1 — Preparar base sem mudar UX (Separação do Núcleo)**
*   **Objetivo:** Tirar a regra de negócios (validação, edição, native picker) da UI do *overlay* e migrar para módulos isolados (Ex: `kanban-core.js`).
*   **Critério de Sucesso:** O *overlay* se mantém visualmente idêntico e funcional, consumindo a nova estrutura unificada.

**Fase 2 — Criar página dedicada mínima**
*   **Objetivo:** Iniciar `kanban.html` / `kanban.js` operando em paralelo com o *overlay*.
*   **Entregas:** Renderização básica, botão "Abrir Kanban completo" (já referenciado via `query ?view=kanban`).

**Fase 3 — Migração por Feature Crítica (sem Big Bang)**
*   **Objetivo:** Migrar recursos pesados e instáveis gradativamente (anexos, links, aberturas nativas, tags, busca).
*   **Critério:** O uso intenso vai para a página dedicada, enquanto o overlay vira "Quick Actions".

**Fase 4 — Produtividade Avançada (Scrum Leve e Visões)**
*   **Objetivo:** Adicionar Backlogs, visões de *sprint*, atalhos e automações de recorrência sem inflar a Intranet raiz.

**Fase 5 — Confiabilidade e Sync Off-line**
*   **Objetivo:** Minimizar perda de dados de cards através de versionamento (`version, updatedAt`), resolução de conflito de edição simultânea e retro-saves (retry queue).

**Fase 6 — Observabilidade (Governança)**
*   **Objetivo:** Facilitar debugging com telemetria interna e backups de versão por snapshots isolados.

**Fase 7 — Descomissionamento**
*   **Objetivo:** Simplificar a manutenção após migração total do fluxo denso. O *overlay* vira apenas um widget minimalista de launcher/atalho de criação.

> **Importante:** A migração utiliza um gatilho rígido de Rollback se encontrar quaisquer quebras no salvamento, na abertura nativa, ou no sync de cards. Nenhuma fase migra UI + Dados + Sync de uma vez.
