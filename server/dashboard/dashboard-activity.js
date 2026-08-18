(() => {
  function formatDuration(ms) {
    const minutes = Math.max(0, Math.round(Number(ms) || 0) / 60000);
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const rest = Math.round(minutes % 60);
    return `${hours}h ${String(rest).padStart(2, '0')}min`;
  }
  function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--:--';
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function activityFilters() {
    const day = document.getElementById('logsDayFilter');
    const user = document.getElementById('logsUserFilter');
    const allUsers = document.getElementById('logsAllUsers');
    const type = document.getElementById('logsTypeFilter');
    const search = document.getElementById('logsSearch');
    const domain = document.getElementById('logsDomainFilter');
    const startTime = document.getElementById('logsStartTime');
    const endTime = document.getElementById('logsEndTime');
    const params = new URLSearchParams({ limit: '500' });
    const userValue = String(user ? user.value : '').trim();
    if (allUsers && allUsers.checked) params.set('allUsers', '1');
    else if (userValue.indexOf(',') < 0 && userValue) params.set('user', userValue);
    if (day && day.value) params.set('day', day.value);
    if (type && type.value) params.set('type', type.value);
    if (search && search.value.trim()) params.set('q', search.value.trim());
    if (domain && domain.value.trim()) params.set('domain', domain.value.trim());
    if (startTime && startTime.value.trim()) params.set('startTime', startTime.value.trim());
    if (endTime && endTime.value.trim()) params.set('endTime', endTime.value.trim());
    return params;
  }
  function renderMetric(id, value, caption) {
    const element = document.getElementById(id);
    if (!element) return;
    element.innerHTML = `<strong>${value}</strong><span>${caption}</span>`;
  }
  function renderActivity(data) {
    const source = data && typeof data === 'object' ? data : {};
    renderMetric('activityObserved', formatDuration(source.observedMs), 'tempo observado');
    renderMetric('activitySessions', String(source.sessions || 0), 'sessões');
    renderMetric('activityUsers', String(source.users || 0), 'usuários');
    renderMetric('activityEvents', String(source.events || 0), 'eventos considerados');
    const domains = Array.isArray(source.domains) ? source.domains : [];
    const domainBody = document.getElementById('activityDomainsBody');
    if (domainBody) {
      domainBody.innerHTML = domains.length ? domains.slice(0, 12).map((item) => `
        <tr><td>${esc(item.domain)}</td><td>${esc(formatDuration(item.durationMs))}</td><td>${esc(item.sessions)}</td><td>${esc(item.events)}</td></tr>
      `).join('') : '<tr><td colspan="4" class="empty-cell">Nenhum domínio observado no período.</td></tr>';
    }
    const timeline = Array.isArray(source.timeline) ? source.timeline : [];
    const timelineBody = document.getElementById('activityTimelineBody');
    if (timelineBody) {
      timelineBody.innerHTML = timeline.length ? timeline.slice(0, 100).map((item) => `
        <div class="activity-session">
          <div class="activity-session-bar"><span></span></div>
          <div class="activity-session-info"><strong>${esc(item.user)}</strong><span>${esc(item.domain)}</span><small>${esc(formatTime(item.startedAt))}–${esc(formatTime(item.endedAt))} · ${esc(formatDuration(item.durationMs))}</small></div>
        </div>
      `).join('') : '<div class="activity-empty">Nenhuma sessão observada no período.</div>';
    }
    const updated = document.getElementById('activityUpdatedAt');
    if (updated) updated.textContent = `Atualizado às ${formatTime(source.generatedAt)}`;
  }
  async function loadActivity() {
    const container = document.getElementById('activityPanel');
    if (!container || typeof api !== 'function') return;
    container.classList.add('is-loading');
    try {
      const data = await api(`/activity/summary?${activityFilters().toString()}`);
      renderActivity(data);
    } catch (error) {
      const timelineBody = document.getElementById('activityTimelineBody');
      if (timelineBody) timelineBody.innerHTML = '<div class="activity-error">Não foi possível calcular a atividade neste momento.</div>';
    } finally {
      container.classList.remove('is-loading');
    }
  }
  window.loadActivity = loadActivity;
})();
