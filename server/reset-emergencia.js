const fs = require('fs');
const path = require('path');

const dataFile = path.join(__dirname, 'database', 'runtime-state.json');
const apply = process.argv.includes('--aplicar');
const dashboardPassword = String(process.env.RESET_DASHBOARD_PASSWORD || 'admin123').trim();
const extensionAdminPassword = String(process.env.RESET_EXTENSION_ADMIN_PASSWORD || 'admin').trim();

if (dashboardPassword.length < 4 || extensionAdminPassword.length < 4) {
  console.error('As novas senhas precisam ter pelo menos 4 caracteres.');
  process.exit(1);
}

if (!fs.existsSync(dataFile)) {
  console.error(`Arquivo não encontrado: ${dataFile}`);
  process.exit(1);
}

let state;
try {
  state = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
} catch (error) {
  console.error(`Falha ao ler ou parsear runtime-state.json: ${error.message}`);
  process.exit(1);
}

const currentDashboardPassword = String((state.auth && state.auth.dashboardPassword) || '');
const currentExtensionAdminPassword = String((state.settings && state.settings.adminPassword) || '');

if (!apply) {
  console.log('Modo simulação. Nenhuma alteração foi gravada.');
  console.log(`Dashboard atual: ${currentDashboardPassword || '(vazio)'}`);
  console.log(`Dashboard novo: ${dashboardPassword}`);
  console.log(`Extensão atual: ${currentExtensionAdminPassword || '(vazio)'}`);
  console.log(`Extensão nova: ${extensionAdminPassword}`);
  console.log('Para aplicar de fato, execute: node reset-emergencia.js --aplicar');
  process.exit(0);
}

state.auth = { ...(state.auth || {}), dashboardPassword };
state.settings = { ...(state.settings || {}), adminPassword: extensionAdminPassword };

const tempFile = `${dataFile}.tmp`;
try {
  fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tempFile, dataFile);
} catch (error) {
  if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  console.error(`Falha ao salvar runtime-state.json: ${error.message}`);
  process.exit(1);
}

console.log('Reset de emergência aplicado com sucesso.');
console.log(`Nova senha do Dashboard: ${dashboardPassword}`);
console.log(`Nova senha do Admin da Extensão: ${extensionAdminPassword}`);
