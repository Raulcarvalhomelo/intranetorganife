# Contrato de logs

## Evento

Um evento de log deve ser um objeto JSON com os campos normalizados abaixo:

| Campo | Tipo | Regra |
|---|---|---|
| `id` | string ou número | Identificador estável do evento. |
| `timestamp` | string ISO 8601 | Instante do evento. |
| `timestampMs` | número | Representação numérica opcional para índices locais. |
| `windowsUser` | string | Usuário identificado no sistema operacional, quando disponível. |
| `browserUser` | string | Usuário identificado na extensão. |
| `browser` | string | Navegador de origem. |
| `action` | string | Tipo da ação, como navegação, download ou bloqueio. |
| `details` | objeto | Dados específicos da ação, sem alterar o envelope. |

Campos adicionais podem ser preservados, mas não devem substituir os campos normalizados sem compatibilidade explícita.

## Persistência local

A extensão mantém os eventos localmente para resiliência offline. O schema do IndexedDB, incluindo nome da base, versão, object store, `keyPath` e índices, é um contrato de migração. Não alterar esse schema sem uma migração explícita.

## Envio em lote

O envio de logs deve utilizar a conexão WebSocket existente. O cliente deve agrupar eventos em memória e disparar um lote por limite de quantidade ou intervalo de tempo, evitando uma requisição por evento.

O lote deve possuir esta forma:

```json
{
  "type": "logs_batch",
  "logs": [
    {
      "id": "event-id",
      "timestamp": "2026-01-01T12:00:00.000Z",
      "action": "navigation",
      "details": {}
    }
  ]
}
```

O cliente deve aguardar `logs_ack` antes de considerar o lote confirmado. Lotes em voo devem ser reencaminhados conforme a política de reconexão quando a conexão for encerrada antes da confirmação.

## Arquivo NDJSON

O backend grava logs em `server/database/logs/YYYY-MM-DD.ndjson`. Cada linha deve conter um objeto JSON completo terminado por `\n`.

A escrita deve usar `fs.createWriteStream` com `flags: 'a'`, reutilizar o stream por arquivo diário e respeitar backpressure de `stream.write()`. É proibido abrir e fechar o arquivo por linha, usar `fs.appendFileSync` ou bloquear o event loop.

## Retenção e leitura

A rotina de retenção remove arquivos fora da janela configurada. Consultas devem ler NDJSON com streaming quando possível e ignorar linhas inválidas sem interromper o processamento de todo o arquivo.

## Privacidade e segurança

Não registrar senhas, tokens, cookies ou conteúdo sensível desnecessário. Alterações no schema devem ser documentadas e testadas nos fluxos local, WebSocket e backend.
