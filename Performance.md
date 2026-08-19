# Avaliação de Performance da Extensão Organife

**Baseline avaliado:** branch `main`, commit `c25dd7a`  
**Versão da extensão:** `1.1.1`  
**Escopo:** análise estática do código da extensão, do Manifest V3 e do fluxo de logs local/WebSocket.  
**Alterações funcionais realizadas:** nenhuma.

## 1. Resumo executivo

A extensão apresenta uma arquitetura relativamente eficiente para um agente de monitoramento baseado em Chrome/Edge Manifest V3. O uso de um **service worker**, IndexedDB para retenção local, batching de logs e uma única conexão WebSocket reduz o consumo quando comparado a uma arquitetura baseada em requisições individuais ou polling contínuo.

O ponto mais positivo é o transporte de logs: os eventos são agrupados em lotes de até **50 registros** ou enviados em uma janela de aproximadamente **30 segundos**, evitando uma requisição de rede para cada navegação ou download. O backend também recebe os lotes por WebSocket, o que reduz overhead de conexão e cabeçalhos HTTP.

O principal risco de performance está no comportamento quando o servidor fica indisponível por longos períodos. A fila de saída do WebSocket permanece em memória e não possui um limite rígido de quantidade ou tamanho. A retenção local em IndexedDB é limitada por tempo, mas a fila de transmissão pode crescer durante uma indisponibilidade prolongada. Em condições normais, esse risco é baixo; em ambiente offline prolongado ou servidor instável, ele pode aumentar o consumo de RAM.

> **Conclusão geral:** a extensão está bem dimensionada para uso normal em estações de trabalho, mas ainda precisa de limites explícitos para filas offline, métricas de diagnóstico e testes de carga antes de ser considerada otimizada para ambientes com milhares de eventos acumulados ou indisponibilidade prolongada do servidor.

## 2. Notas gerais

| Categoria | Nota | Avaliação resumida |
|---|---:|---|
| Consumo de CPU | **8,2/10** | Não há polling contínuo; os custos principais ocorrem nos eventos de navegação, bloqueio, download, persistência e serialização de lotes. |
| Consumo de RAM | **7,5/10** | IndexedDB e retenção temporal são boas escolhas, mas a fila WebSocket em memória não possui limite rígido durante indisponibilidade. |
| Conectividade | **7,8/10** | Há reconexão com backoff, ACK e reenvio de lotes, mas a fila de saída não é persistida de forma durável. |
| Tráfego de rede | **9,0/10** | Batching de 50 eventos/30 segundos é eficiente e evita chamadas individuais. Há risco de retransmissão após perda de ACK. |
| Persistência local | **8,4/10** | IndexedDB, índice temporal e retenção de sete dias são adequados; o fallback para storage.local é menos eficiente. |
| Ciclo de vida MV3 | **8,0/10** | O service worker pode dormir e acordar sob demanda; o WebSocket é refeito no despertar, mas a fila em memória não sobrevive a todo encerramento do worker. |
| Escalabilidade do fluxo de logs | **7,6/10** | Adequado para uso individual e equipes pequenas/médias; necessita limites e observabilidade para cenários offline prolongados. |
| **Nota geral** | **8,1/10** | Boa base de produção, com melhorias preventivas recomendadas para resiliência e crescimento controlado. |

As notas representam uma avaliação técnica do código atual, não uma medição laboratorial universal. Os valores reais de CPU e RAM dependem da quantidade de abas, frequência de navegação, tamanho dos detalhes dos eventos, número de regras de bloqueio, navegador, sistema operacional e duração do período offline.

## 3. Arquitetura avaliada

O agente é executado como um **service worker Manifest V3** por meio de `background.js`. O manifesto declara o worker, permissões de armazenamento, abas, navegação, downloads, alarmes e native messaging, além de acesso a todos os hosts.

O `background.js` importa módulos auxiliares de bloqueio, identidade, rastreamento, banco local e WebSocket. No fluxo atualmente ativo, os listeners relevantes são `tabs.onUpdated`, `downloads.onCreated`, `webNavigation.onBeforeNavigate`, `runtime.onMessage`, `storage.onChanged`, `runtime.onStartup` e `runtime.onInstalled`.

O registro de atividade segue este fluxo:

```text
evento do navegador
  -> logActivity()
  -> resolução/cache do usuário Windows
  -> gravação local em IndexedDB
  -> inclusão na fila WebSocket
  -> envio em lote de até 50 eventos
  -> logs_ack do backend
```

O armazenamento local usa o banco `organife-extension-db`, versão 1, store `activityLogs`, chave primária `id` e índices por timestamp e ação. A retenção padrão é de sete dias e a limpeza é tentada a cada dez minutos, além da limpeza inicial.

## 4. Avaliação de CPU

### Pontos positivos

O service worker não possui `setInterval` de polling permanente para monitorar a atividade. A rede é ativada por eventos e por timers associados a uma fila não vazia. Isso evita um loop constante consumindo CPU quando o navegador está ocioso.

O batching reduz o número de operações de serialização e envio. Em vez de serializar e transmitir cada evento isoladamente, a extensão usa `JSON.stringify` uma vez por lote enviado. O limite de 50 eventos também evita que uma única operação normal cresça indefinidamente.

As regras de bloqueio são compiladas em estruturas de matchers quando as configurações mudam, em vez de reconstruir toda a estrutura a cada navegação. Também existe uma janela de deduplicação de navegação de 700 ms com limite de 2.000 entradas, o que reduz processamento repetido causado por eventos duplicados do navegador.

A resolução do usuário Windows é cacheada após a primeira resolução. Portanto, o uso de native messaging não ocorre para cada log.

### Pontos de atenção

Cada atividade passa por criação de objeto de log, geração de identificador, conversões de data, persistência local e, eventualmente, serialização do lote. Esse custo é aceitável para frequência normal de navegação, mas pode aparecer em cenários com muitas abas automatizadas, redirecionamentos ou downloads em massa.

A limpeza do IndexedDB percorre registros com cursor. A operação ocorre com intervalo mínimo de dez minutos, o que é adequado, mas uma base muito grande pode produzir uma operação mais longa quando a limpeza for disparada.

No fallback para `storage.local`, cada novo log lê o array completo, adiciona o evento, cria uma cópia com `slice(-5000)` e grava novamente o array. Esse caminho é significativamente mais caro em CPU e I/O do que IndexedDB e deve ser considerado apenas como fallback de compatibilidade.

### Nota de CPU: 8,2/10

A nota não é 9 ou 10 porque ainda existem custos de cópia de arrays, serialização completa de lotes, limpeza por cursor e processamento duplicado quando ocorre reconexão. Mesmo assim, a ausência de polling contínuo e o uso de batching tornam o desenho eficiente.

## 5. Avaliação de RAM

### Pontos positivos

A retenção local em IndexedDB não mantém todos os logs em uma variável global. A leitura é feita sob demanda e o armazenamento fica fora do heap principal do service worker.

O fallback para `storage.local` limita o array local a 5.000 registros. Embora esse fallback seja menos eficiente, o limite impede crescimento ilimitado nesse caminho.

A deduplicação de navegação possui limite de 2.000 entradas. O cache do usuário Windows armazena somente os valores necessários, e as regras compiladas substituem a estrutura anterior em vez de acumular versões.

### Principal risco

As filas `wsLogBatch` e `wsLogInFlight` são mantidas em memória. Quando o WebSocket está fechado, os eventos continuam sendo adicionados à fila. Quando ocorre uma desconexão, os eventos em voo retornam para `wsLogBatch` para tentativa posterior.

Esse comportamento é correto para evitar perda imediata, mas não há no código analisado um limite explícito de quantidade total, bytes ou idade para a fila de transmissão. Se o servidor ficar offline por horas ou dias e a extensão continuar gerando muitos eventos, a fila poderá crescer até o encerramento do service worker ou até causar pressão de memória.

A fila também pode manter cópias temporárias durante a movimentação entre `wsLogBatch`, `wsLogInFlight` e os lotes enviados. Em uso normal, essa quantidade é pequena; em falhas repetidas ou lotes muito grandes, o custo aumenta.

### Nota de RAM: 7,5/10

A persistência local é boa, mas a ausência de um limite explícito para a fila offline impede uma nota mais alta. Este é o risco técnico de performance mais importante da extensão atual.

## 6. Avaliação de conectividade

### Pontos positivos

A extensão utiliza uma conexão WebSocket persistente para configurações em tempo real e envio de logs. O handshake envia o cliente como `extension`, permitindo que o backend diferencie a origem da conexão.

A reconexão utiliza backoff progressivo de um segundo até trinta segundos. Isso evita um loop agressivo de tentativas quando o servidor está indisponível.

O transporte possui `logs_ack`. Os eventos enviados ficam em `wsLogInFlight` e são removidos quando o backend confirma a quantidade recebida. Se o socket fechar antes do ACK, os eventos em voo retornam para a fila.

O `queueWsLog()` inicia uma tentativa de conexão quando necessário, o que é importante para o comportamento de despertar do service worker.

### Pontos de atenção

A fila pendente não é persistida diretamente como fila de transmissão durável. Se o service worker for encerrado antes de enviar eventos ainda não confirmados, os eventos gravados em IndexedDB continuam disponíveis localmente, mas a fila WebSocket em memória será reconstruída somente se houver uma rotina explícita de reenvio dos pendentes.

A confirmação usa contagem de eventos, não um identificador de lote ou ACK individual por evento. Se o backend aceitar o lote e a conexão cair antes do ACK, o lote poderá ser reenviado. Isso favorece a durabilidade, mas pode produzir duplicidade caso o backend não faça deduplicação por `id`.

A implementação possui `background-ws.js` como módulo reutilizável, mas o fluxo principal de `background.js` mantém lógica inline própria. Essa duplicidade aumenta o risco de divergência futura e dificulta a manutenção do comportamento de reconexão.

O intervalo de 30 segundos reduz tráfego, mas também significa que um log pode permanecer aguardando até aproximadamente 30 segundos em condições normais, caso o lote não atinja 50 itens.

### Nota de conectividade: 7,8/10

A reconexão e o ACK são bons, mas a falta de uma fila durável e a possibilidade de reenvio duplicado impedem nota mais alta.

## 7. Avaliação de tráfego de rede

### Pontos positivos

O lote possui até 50 logs e o envio ocorre também por limite temporal de 30 segundos. Essa estratégia reduz drasticamente o número de mensagens e o overhead de handshake, cabeçalhos e chamadas individuais.

O canal WebSocket já é usado para configurações e eventos em tempo real, evitando criar uma conexão HTTP separada para cada lote. O payload contém apenas os eventos necessários ao registro, e o envio não usa compressão ou anexos binários desnecessários.

### Pontos de atenção

Cada log contém detalhes que podem incluir URL, título, domínio e outros dados. Títulos ou URLs muito longos aumentam o tamanho do lote. Downloads e documentos podem carregar caminhos ou parâmetros extensos.

Em perda de conexão após recebimento pelo servidor, o reenvio pode duplicar o tráfego de um lote. O backoff limita a frequência, mas a quantidade total transmitida depende do tempo de indisponibilidade e do número de reenvios.

Atualizações de configuração podem causar novas leituras de settings, especialmente quando chegam mensagens de atualização. Isso não representa o tráfego principal da extensão, mas deve ser observado em ambientes com alterações muito frequentes.

### Nota de tráfego: 9,0/10

O batching de 50 eventos ou 30 segundos é uma decisão muito boa. A principal perda de eficiência vem de possíveis retransmissões e de detalhes de logs sem limite de tamanho explícito.

## 8. Avaliação de persistência local

O IndexedDB é a escolha correta para registros locais porque não exige regravar um array completo a cada evento e permite índices por timestamp e ação. A retenção de sete dias e a limpeza a cada dez minutos limitam o crescimento histórico.

O fallback para `storage.local` é funcional, mas tem custo maior: cada escrita lê e regrava o array de atividades. O limite de 5.000 registros reduz o risco de crescimento ilimitado, porém pode consumir mais CPU e gerar mais operações de armazenamento em máquinas com IndexedDB indisponível ou com erro.

A limpeza inicial ocorre no carregamento do worker. Em uma base grande, essa tarefa pode disputar recursos com os primeiros eventos após o despertar. O efeito esperado é temporário, mas merece ser medido em máquinas com histórico acumulado.

**Nota de persistência local: 8,4/10.**

## 9. Efeito do Manifest V3 e do ciclo de vida do worker

O Manifest V3 usa `background.service_worker`, o que permite ao navegador suspender o worker quando não há eventos ativos. Isso reduz consumo ocioso de RAM e CPU em comparação com uma página de background permanente.

A consequência é que o estado em memória pode desaparecer entre despertares. A extensão já carrega configurações do storage e inicializa o WebSocket depois de `loadSettingsFromStorage()`, o que é positivo. Porém, filas temporárias, timers e caches de conexão não são persistência durável.

Permissões como `webNavigation`, `downloads`, `tabs`, `alarms`, `nativeMessaging` e `<all_urls>` ampliam a superfície de eventos e controle da extensão. Permissões por si só não significam consumo constante de CPU, mas permitem que o worker receba uma variedade maior de eventos e aumentam a responsabilidade de filtrar rapidamente URLs e páginas que não precisam ser processadas.

## 10. Gargalos e riscos classificados

| Prioridade | Risco | Impacto | Probabilidade | Observação |
|---|---|---|---|---|
| Alta | Fila WebSocket sem limite rígido | RAM e tráfego | Média em indisponibilidade prolongada | Pode crescer enquanto o servidor estiver offline. |
| Alta | Reenvio após perda de ACK sem deduplicação explícita | Tráfego e duplicidade | Média | O backend deve deduplicar por `id` ou por lote. |
| Média | Fallback `storage.local` regravando até 5.000 logs | CPU e I/O | Baixa/Média | Só ocorre quando IndexedDB não está disponível. |
| Média | Duas implementações de cliente WebSocket | Manutenção e divergência | Média | O fluxo ativo é inline; o módulo separado não é a fonte única. |
| Média | Títulos/URLs sem limite de tamanho | RAM e tráfego | Baixa/Média | Um evento excepcionalmente grande aumenta o payload. |
| Baixa | Limpeza de retenção por cursor | CPU temporária | Baixa | Executada com baixa frequência. |
| Baixa | Reconexões causadas por mudanças repetidas de `serverUrl` | Rede | Baixa | Normalmente ocorre apenas em alterações administrativas. |

## 11. Recomendações sem implementação

As recomendações abaixo são apenas conclusões da avaliação. Nenhuma delas foi implementada neste documento.

### Prioridade 1: limitar a fila offline

Adicionar limites por quantidade de eventos, bytes aproximados e idade máxima. Ao atingir o limite, a política deve ser explícita: preservar os eventos mais recentes, preservar os mais antigos ou bloquear novas entradas com diagnóstico. A escolha depende da prioridade entre auditoria histórica e uso de memória.

### Prioridade 2: persistir a fila pendente

Usar o IndexedDB também para marcar eventos ainda não confirmados ou manter uma fila de envio com status. No despertar do worker, a extensão poderia reenviar pendentes de forma controlada. Isso reduz perda causada pela suspensão do worker.

### Prioridade 3: deduplicação no backend

O backend deveria aceitar um `id` de evento e ignorar reenvios já persistidos. Essa melhoria reduz duplicidade sem exigir que a extensão abandone o reenvio confiável.

### Prioridade 4: unificar o cliente WebSocket

Escolher entre o módulo `background-ws.js` e a implementação inline. Manter uma única fonte de verdade reduziria divergências em heartbeat, reconexão, ACK e fila.

### Prioridade 5: limitar payloads

Definir limites para título, URL, dados de detalhes e tamanho total de um lote. Quando houver truncamento, o log deve registrar que o conteúdo foi resumido.

### Prioridade 6: adicionar métricas internas

Registrar somente contadores leves, sem gerar novos logs excessivos: tamanho atual da fila, último envio, último ACK, quantidade de reenvios, tempo offline e maior lote observado. Esses dados facilitariam a medição real sem aumentar significativamente o consumo.

### Prioridade 7: teste de carga real

Executar testes em uma máquina Windows com navegador real, medindo o worker em três cenários: navegação normal, navegação intensa com muitas abas e servidor offline por períodos longos. A análise estática não substitui medições do Gerenciador de Tarefas, Chrome Task Manager ou ferramentas equivalentes.

## 12. Cenários de comportamento esperado

| Cenário | Comportamento atual esperado | Avaliação |
|---|---|---|
| Navegação normal | Evento salvo localmente e agrupado para envio. | Bom. |
| Menos de 50 eventos em 30 segundos | Aguarda o timer de flush. | Bom para tráfego; adiciona até 30 s de latência. |
| 50 eventos acumulados | Envia imediatamente em lote. | Muito bom. |
| Servidor temporariamente offline | Reconnect com backoff e fila em memória. | Bom, com risco de crescimento. |
| Worker suspenso com fila em memória | Estado temporário pode desaparecer. | Risco de durabilidade. |
| IndexedDB disponível | Persistência indexada e eficiente. | Muito bom. |
| IndexedDB indisponível | Fallback com array em storage.local limitado a 5.000. | Aceitável, porém mais caro. |
| Conexão cai após recebimento do lote | Reenvio possível após fechamento. | Bom para durabilidade, risco de duplicidade. |
| Download ou navegação em massa | Muitas chamadas de captura e persistência. | Requer teste de carga. |

## 13. Avaliação final

A extensão está em uma condição **boa para uso normal**. A arquitetura evita polling permanente, usa eventos do navegador, mantém regras de bloqueio compiladas, grava localmente em IndexedDB e transmite logs em lotes. Essas decisões justificam as notas altas de CPU e tráfego.

A nota geral de **8,1/10** não representa falta de funcionalidade. Ela reflete principalmente riscos preventivos: fila WebSocket sem limite rígido, fila não totalmente durável durante a suspensão do worker, possibilidade de retransmissão duplicada e existência de duas implementações de cliente WebSocket.

Para uso cotidiano em uma equipe pequena ou média, o consumo esperado tende a ser baixo. Para implantação em escala maior, é recomendável executar as melhorias de fila, deduplicação, limites de payload e observabilidade antes de considerar o agente completamente endurecido contra falhas prolongadas de rede.

## 14. Limitações desta avaliação

Esta avaliação foi feita por inspeção do código e de sua arquitetura no commit indicado. Não foram coletados números reais de RAM e CPU de uma máquina Windows durante uma jornada completa, nem foi simulado um período prolongado de indisponibilidade com milhares de eventos. Portanto, as notas são avaliações técnicas fundamentadas, não benchmarks absolutos.

Uma medição operacional deveria registrar, no mínimo:

- RAM do processo do navegador com a extensão ociosa;
- RAM durante navegação normal;
- CPU média e pico durante navegação intensa;
- tamanho da fila quando o servidor está offline;
- quantidade de bytes por lote;
- tempo médio entre evento, envio e ACK;
- quantidade de reenvios;
- tamanho do IndexedDB após um, três e sete dias.

## 15. Conclusão

A extensão apresenta **boa eficiência de rede e CPU**, persistência local adequada e uma estratégia correta de batching. O aspecto que merece maior atenção é a resiliência da fila offline, principalmente para impedir crescimento de RAM e duplicidade de tráfego durante falhas prolongadas.

**Nota geral final: 8,1/10.**

Nenhuma funcionalidade foi alterada para produzir este documento.
