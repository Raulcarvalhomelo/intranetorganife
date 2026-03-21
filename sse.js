// URL do servidor onde o endpoint SSE está configurado
const serverUrl = 'http://192.168.100.34:1337';

// Cria a conexão SSE com o endpoint definido no servidor
const eventSource = new EventSource(`${serverUrl}/settings/updates`);

eventSource.onmessage = (event) => {
  // Quando uma mensagem é recebida, faça o fetch para obter as novas configurações
  const data = JSON.parse(event.data);
  if (data.updated) {
    fetchSettings();
  }
};

eventSource.onerror = (error) => {
  console.error('Erro na conexão SSE:', error);
};

async function fetchSettings() {
  try {
    const response = await fetch(`${serverUrl}/settings`);
    const settingsFromJson = await response.json();
    
    // Envia a mensagem para o service worker (ou outros componentes da extensão)
    chrome.runtime.sendMessage({ type: 'settingsUpdated', settings: settingsFromJson });
    
    console.log("Configurações atualizadas via SSE:", settingsFromJson);
  } catch (error) {
    console.error('Erro ao carregar as configurações do servidor:', error);
  }
}
