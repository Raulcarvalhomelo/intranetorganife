'use strict';

function escapeHtml(value) {
  return String(value !== undefined && value !== null ? value : '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDuration(milliseconds) {
  const minutes = Math.max(0, Math.round(Number(milliseconds) || 0) / 60000);
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${Math.floor(minutes / 60)}h ${String(Math.round(minutes % 60)).padStart(2, '0')}min`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium'
  }).format(date);
}

function formatPercent(value, total) {
  if (!total) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

function domainChart(domains) {
  const values = Array.isArray(domains) ? domains.slice(0, 8) : [];
  const max = values.reduce((current, item) => Math.max(current, Number(item.durationMs) || 0), 0) || 1;
  if (!values.length) return '<p class="empty">Nenhum domínio observado no período.</p>';
  return `<div class="bar-chart">${values.map((item) => {
    const width = Math.max(2, Math.round(((Number(item.durationMs) || 0) / max) * 100));
    return `<div class="bar-row"><div class="bar-label" title="${escapeHtml(item.domain)}">${escapeHtml(item.domain)}</div><div class="bar-track"><span style="width:${width}%"></span></div><div class="bar-value">${escapeHtml(formatDuration(item.durationMs))}</div></div>`;
  }).join('')}</div>`;
}

function actionChart(rows) {
  const values = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const action = String(row.action || row.type || 'activity').trim() || 'activity';
    values.set(action, (values.get(action) || 0) + 1);
  });
  const entries = Array.from(values.entries()).sort((left, right) => right[1] - left[1]).slice(0, 8);
  const total = Array.from(values.values()).reduce((sum, value) => sum + value, 0);
  if (!entries.length) return '<p class="empty">Nenhum evento observado no período.</p>';
  return `<div class="bar-chart">${entries.map((entry) => {
    const percentage = Math.max(2, Math.round((entry[1] / total) * 100));
    return `<div class="bar-row"><div class="bar-label">${escapeHtml(entry[0])}</div><div class="bar-track alt"><span style="width:${percentage}%"></span></div><div class="bar-value">${entry[1]} (${formatPercent(entry[1], total)})</div></div>`;
  }).join('')}</div>`;
}

function timelineMarkup(timeline) {
  const items = Array.isArray(timeline) ? timeline.slice(0, 100) : [];
  if (!items.length) return '<p class="empty">Nenhuma sessão observada no período.</p>';
  return `<div class="timeline">${items.map((item) => `<div class="timeline-item"><span class="timeline-dot"></span><div><strong>${escapeHtml(item.domain)}</strong><span>${escapeHtml(formatDate(item.startedAt))} — ${escapeHtml(formatDate(item.endedAt))}</span><small>${escapeHtml(formatDuration(item.durationMs))} · ${escapeHtml(item.eventCount)} eventos · ${escapeHtml(item.browser)}</small></div></div>`).join('')}</div>`;
}

function rawRows(rows) {
  const items = Array.isArray(rows) ? rows.slice(0, 200) : [];
  if (!items.length) return '<tr><td colspan="5" class="empty">Nenhum log bruto encontrado.</td></tr>';
  return items.map((row) => `<tr><td>${escapeHtml(formatDate(row.timestamp))}</td><td>${escapeHtml(row.browser || '-')}</td><td>${escapeHtml(row.domain || (row.details && row.details.domain) || '-')}</td><td>${escapeHtml(row.type || row.action || '-')}</td><td><pre>${escapeHtml(JSON.stringify(row.details || row.data || {}, null, 2))}</pre></td></tr>`).join('');
}

function renderReport(input) {
  const report = input || {};
  const activity = report.activity || {};
  const user = String(report.user || '').trim();
  const generatedAt = formatDate(activity.generatedAt || new Date().toISOString());
  const period = report.day || 'período selecionado';
  const domains = Array.isArray(activity.domains) ? activity.domains : [];
  const timeline = Array.isArray(activity.timeline) ? activity.timeline : [];
  const rows = Array.isArray(report.rows) ? report.rows : [];
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relatório de atividade — ${escapeHtml(user)}</title>
<style>
:root{color-scheme:light;--ink:#102a43;--muted:#627d98;--line:#dbe4ee;--blue:#2f80ed;--cyan:#56ccf2;--paper:#f6f9fc}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.5 Inter,Segoe UI,Arial,sans-serif}.report{max-width:1180px;margin:0 auto;padding:36px}.hero{padding:28px;border-radius:20px;background:linear-gradient(135deg,#102a43,#2f80ed);color:#fff;box-shadow:0 14px 34px rgba(15,23,42,.14)}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.16em;opacity:.8}.hero h1{margin:8px 0 4px;font-size:30px}.hero p{margin:0;opacity:.85}.meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.meta span{padding:6px 10px;border:1px solid rgba(255,255,255,.3);border-radius:999px;font-size:12px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}.metric,.card{background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:0 8px 24px rgba(15,23,42,.05)}.metric{padding:18px}.metric strong{display:block;font-size:25px}.metric span{display:block;margin-top:4px;color:var(--muted);font-size:12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.card{padding:20px;margin-top:16px}.card h2{margin:0 0 14px;font-size:17px}.bar-row{display:grid;grid-template-columns:minmax(100px, .8fr) 1.5fr auto;gap:10px;align-items:center;margin:12px 0}.bar-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#334e68}.bar-track{height:9px;border-radius:99px;background:#e9f2fb;overflow:hidden}.bar-track span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--blue),var(--cyan))}.bar-track.alt span{background:linear-gradient(90deg,#7c3aed,#c084fc)}.bar-value{color:var(--muted);font-size:12px;white-space:nowrap}.timeline{display:grid;gap:12px}.timeline-item{display:grid;grid-template-columns:12px 1fr;gap:10px}.timeline-dot{width:10px;height:10px;margin-top:6px;border-radius:50%;background:var(--blue);box-shadow:0 0 0 4px #dbeafe}.timeline-item strong,.timeline-item span,.timeline-item small{display:block}.timeline-item strong{font-size:14px}.timeline-item span,.timeline-item small{color:var(--muted);font-size:12px}.table-wrap{overflow-x:auto}.logs{width:100%;border-collapse:collapse}.logs th,.logs td{padding:10px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line);white-space:nowrap}.logs th{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em}.logs pre{max-width:320px;margin:0;white-space:pre-wrap;word-break:break-word;font:12px Consolas,monospace}.empty{padding:16px;color:var(--muted);text-align:center}.notice{margin-top:16px;padding:12px 14px;border-left:4px solid var(--cyan);background:#eef8ff;color:#486581;font-size:12px}@media(max-width:800px){.report{padding:18px}.metrics,.grid{grid-template-columns:1fr 1fr}}@media(max-width:520px){.metrics,.grid{grid-template-columns:1fr}.hero h1{font-size:24px}.bar-row{grid-template-columns:1fr}.bar-value{white-space:normal}}
</style>
</head>
<body><main class="report">
<section class="hero"><span class="eyebrow">ORGANIFE · RELATÓRIO DE ATIVIDADE</span><h1>${escapeHtml(user)}</h1><p>Atividade observada no navegador</p><div class="meta"><span>Período: ${escapeHtml(period)}</span><span>Gerado em: ${escapeHtml(generatedAt)}</span></div></section>
<section class="metrics"><div class="metric"><strong>${escapeHtml(formatDuration(activity.observedMs))}</strong><span>tempo observado</span></div><div class="metric"><strong>${escapeHtml(activity.sessions || 0)}</strong><span>sessões</span></div><div class="metric"><strong>${escapeHtml(activity.events || 0)}</strong><span>eventos</span></div><div class="metric"><strong>${escapeHtml(domains.length)}</strong><span>domínios</span></div></section>
<section class="grid"><article class="card"><h2>Tempo por domínio</h2>${domainChart(domains)}</article><article class="card"><h2>Eventos por tipo</h2>${actionChart(rows)}</article></section>
<section class="card"><h2>Timeline de sessões</h2>${timelineMarkup(timeline)}</section>
<section class="card"><h2>Logs brutos selecionados</h2><div class="table-wrap"><table class="logs"><thead><tr><th>Data</th><th>Navegador</th><th>Domínio</th><th>Tipo</th><th>Dados</th></tr></thead><tbody>${rawRows(rows)}</tbody></table></div></section>
<div class="notice">Este relatório representa atividade observada no navegador para o usuário e período selecionados. Ele não constitui uma avaliação automática de produtividade.</div>
</main></body></html>`;
}

module.exports = { renderReport, escapeHtml };

