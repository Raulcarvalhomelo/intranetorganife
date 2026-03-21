const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function extractFunctionSource(source, name) {
  const startIdx = source.indexOf(`function ${name}(`);
  if (startIdx < 0) return '';
  let i = startIdx;
  const braceIdx = source.indexOf('{', i);
  if (braceIdx < 0) return '';
  i = braceIdx;
  let depth = 0;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(startIdx, i + 1);
      }
    }
  }
  return '';
}

function buildSandboxedBlockingApi(backgroundJs) {
  const names = [
    'getHost',
    'matchesComCountryVariant',
    'singleDomainMatches',
    'domainMatchesPattern',
    'normalizeUserName',
    'isExemptBrowserUser',
    'isExtensionPage',
    'getBrasiliaHour',
    'isBrasiliaFreeWindow',
    'shouldBlockUrl'
  ];
  const pieces = names.map((n) => extractFunctionSource(backgroundJs, n)).filter(Boolean);

  const code = `
    let blockedKeywords = [];
    let blockedSites = [];
    let allowedLinks = [];
    let allowedDomains = [];
    let tempAllowedLinks = [];
    let totalBlockMode = false;
    let browserUser = '';
    const EXEMPT_BROWSER_USER = 'diretoria';
    let temporaryAllowed = new Map();
    const browserAPI = { runtime: { getURL: () => 'chrome-extension://test/' } };
    ${pieces.join('\n')}
    globalThis.__api = {
      shouldBlockUrl,
      singleDomainMatches,
      domainMatchesPattern,
      getHost,
      setState(next) {
        if (!next || typeof next !== 'object') return;
        if (next.blockedKeywords !== undefined) blockedKeywords = next.blockedKeywords;
        if (next.blockedSites !== undefined) blockedSites = next.blockedSites;
        if (next.allowedLinks !== undefined) allowedLinks = next.allowedLinks;
        if (next.allowedDomains !== undefined) allowedDomains = next.allowedDomains;
        if (next.tempAllowedLinks !== undefined) tempAllowedLinks = next.tempAllowedLinks;
        if (next.totalBlockMode !== undefined) totalBlockMode = next.totalBlockMode;
        if (next.browserUser !== undefined) browserUser = next.browserUser;
      },
      setTemporary(urlLower, expiresAt) {
        temporaryAllowed.set(String(urlLower || '').toLowerCase(), Number(expiresAt) || 0);
      },
      clearTemporary() {
        temporaryAllowed = new Map();
      },
      overrideBrasiliaHour(hour) {
        globalThis.getBrasiliaHour = () => hour;
      }
    };
  `;

  const context = {
    URL,
    Map,
    RegExp,
    Date,
    Intl,
    Buffer
  };

  vm.runInNewContext(code, context, { filename: 'background-shouldBlockUrl-sandbox.js' });
  return context.__api;
}

test('shouldBlockUrl: blockedSites tem prioridade sobre allowedDomains/tempAllowedLinks', async () => {
  const bgPath = path.resolve(__dirname, '../../../../background.js');
  const backgroundJs = fs.readFileSync(bgPath, 'utf8');
  const api = buildSandboxedBlockingApi(backgroundJs);

  api.overrideBrasiliaHour(10);
  api.setState({
    blockedSites: ['*.example.com'],
    allowedDomains: ['*.example.com'],
    tempAllowedLinks: ['*.example.com'],
    allowedLinks: [],
    blockedKeywords: [],
    totalBlockMode: false,
    browserUser: ''
  });

  assert.equal(api.shouldBlockUrl('https://www.example.com/a'), true);
});

test('shouldBlockUrl: allowedDomains permite quando não está em blockedSites', async () => {
  const bgPath = path.resolve(__dirname, '../../../../background.js');
  const backgroundJs = fs.readFileSync(bgPath, 'utf8');
  const api = buildSandboxedBlockingApi(backgroundJs);

  api.overrideBrasiliaHour(10);
  api.setState({
    blockedSites: [],
    allowedDomains: ['*.allowed.com'],
    tempAllowedLinks: [],
    allowedLinks: [],
    blockedKeywords: [],
    totalBlockMode: false,
    browserUser: ''
  });

  assert.equal(api.shouldBlockUrl('https://a.allowed.com/x'), false);
});

test('shouldBlockUrl: tempAllowedLinks permite quando não está em blockedSites', async () => {
  const bgPath = path.resolve(__dirname, '../../../../background.js');
  const backgroundJs = fs.readFileSync(bgPath, 'utf8');
  const api = buildSandboxedBlockingApi(backgroundJs);

  api.overrideBrasiliaHour(10);
  api.setState({
    blockedSites: [],
    allowedDomains: [],
    tempAllowedLinks: ['*.temp.com'],
    allowedLinks: [],
    blockedKeywords: [],
    totalBlockMode: false,
    browserUser: ''
  });

  assert.equal(api.shouldBlockUrl('https://x.temp.com/'), false);
});

test('shouldBlockUrl: totalBlockMode bloqueia tudo que não foi permitido', async () => {
  const bgPath = path.resolve(__dirname, '../../../../background.js');
  const backgroundJs = fs.readFileSync(bgPath, 'utf8');
  const api = buildSandboxedBlockingApi(backgroundJs);

  api.overrideBrasiliaHour(10);
  api.setState({
    blockedSites: [],
    allowedDomains: [],
    tempAllowedLinks: [],
    allowedLinks: [],
    blockedKeywords: [],
    totalBlockMode: true,
    browserUser: ''
  });

  assert.equal(api.shouldBlockUrl('https://example.com/'), true);
});

test('shouldBlockUrl: bloqueia por blockedKeywords', async () => {
  const bgPath = path.resolve(__dirname, '../../../../background.js');
  const backgroundJs = fs.readFileSync(bgPath, 'utf8');
  const api = buildSandboxedBlockingApi(backgroundJs);

  api.overrideBrasiliaHour(10);
  api.setState({
    blockedSites: [],
    allowedDomains: [],
    tempAllowedLinks: [],
    allowedLinks: [],
    blockedKeywords: ['forbidden'],
    totalBlockMode: false,
    browserUser: ''
  });

  assert.equal(api.shouldBlockUrl('https://example.com/forbidden'), true);
});

test('shouldBlockUrl: temporaryAllowed permite até expirar', async () => {
  const bgPath = path.resolve(__dirname, '../../../../background.js');
  const backgroundJs = fs.readFileSync(bgPath, 'utf8');
  const api = buildSandboxedBlockingApi(backgroundJs);

  api.overrideBrasiliaHour(10);
  api.setState({
    blockedSites: ['*.temp-override.com'],
    allowedDomains: [],
    tempAllowedLinks: [],
    allowedLinks: [],
    blockedKeywords: [],
    totalBlockMode: false,
    browserUser: ''
  });

  const url = 'https://a.temp-override.com/x';
  api.setTemporary(url, Date.now() + 60_000);
  assert.equal(api.shouldBlockUrl(url), false);
});

test('shouldBlockUrl: janela livre de Brasília permite mesmo se estaria bloqueado', async () => {
  const bgPath = path.resolve(__dirname, '../../../../background.js');
  const backgroundJs = fs.readFileSync(bgPath, 'utf8');
  const api = buildSandboxedBlockingApi(backgroundJs);

  api.overrideBrasiliaHour(12);
  api.setState({
    blockedSites: ['*.example.com'],
    allowedDomains: [],
    tempAllowedLinks: [],
    allowedLinks: [],
    blockedKeywords: ['example'],
    totalBlockMode: true,
    browserUser: ''
  });

  assert.equal(api.shouldBlockUrl('https://www.example.com/a'), false);
});
