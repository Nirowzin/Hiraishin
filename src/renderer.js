const { ipcRenderer } = require('electron');

class HiraishinRenderer {
  constructor() {
    this.isAnalyzing = false;
    this.isConnected = false;
    this.routes = [];
    this.currentRoute = null;
    this.networkStats = null;
    
    this.initializeUI();
    this.setupEventListeners();
    this.loadInitialData();
  }

  // Inicializar interface do usuário
  initializeUI() {
    // Elementos principais
    this.elements = {
      statusIndicator: document.getElementById('status-indicator'),
      statusText: document.getElementById('status-text'),
      analyzeBtn: document.getElementById('analyze-btn'),
      connectBtn: document.getElementById('connect-btn'),
      disconnectBtn: document.getElementById('disconnect-btn'),
      routesList: document.getElementById('routes-list'),
      networkStats: document.getElementById('network-stats'),
      progressBar: document.getElementById('progress-bar'),
      logOutput: document.getElementById('log-output')
    };

    // Atualizar estado inicial
    this.updateConnectionStatus(false);
    this.updateAnalyzeButton(false);
  }

  // Configurar event listeners
  setupEventListeners() {
    // Botão de análise
    this.elements.analyzeBtn.addEventListener('click', () => {
      if (this.isAnalyzing) {
        this.stopAnalysis();
      } else {
        this.startAnalysis();
      }
    });

    // Botão de conexão
    this.elements.connectBtn.addEventListener('click', () => {
      this.connectToBestRoute();
    });

    // Botão de desconexão
    this.elements.disconnectBtn.addEventListener('click', () => {
      this.disconnect();
    });

    // IPC listeners
    ipcRenderer.on('network-update', (event, data) => {
      this.handleNetworkUpdate(data);
    });

    // Atualizar dados a cada 2 segundos
    setInterval(() => {
      this.updateNetworkStats();
    }, 2000);
  }

  // Carregar dados iniciais
  async loadInitialData() {
    try {
      const status = await ipcRenderer.invoke('get-status');
      this.updateConnectionStatus(status.isConnected);
      this.routes = status.routes || [];
      this.currentRoute = status.currentRoute;
      
      this.updateRoutesList();
      this.updateNetworkStats();
      
    } catch (error) {
      console.error('Erro ao carregar dados iniciais:', error);
      this.showError('Erro ao carregar dados iniciais');
    }
  }

  // Iniciar análise de rede
  async startAnalysis() {
    try {
      this.isAnalyzing = true;
      this.updateAnalyzeButton(true);
      this.showProgress('Iniciando análise de rede...');
      
      const result = await ipcRenderer.invoke('start-analysis');
      
      if (result.success) {
        this.showSuccess('Análise iniciada com sucesso');
        this.logMessage('Análise de rede iniciada');
      } else {
        this.showError(`Erro ao iniciar análise: ${result.message}`);
      }
      
    } catch (error) {
      console.error('Erro ao iniciar análise:', error);
      this.showError('Erro ao iniciar análise de rede');
      this.isAnalyzing = false;
      this.updateAnalyzeButton(false);
    }
  }

  // Parar análise de rede
  async stopAnalysis() {
    try {
      this.showProgress('Parando análise...');
      
      const result = await ipcRenderer.invoke('stop-analysis');
      
      if (result.success) {
        this.isAnalyzing = false;
        this.updateAnalyzeButton(false);
        this.showSuccess('Análise parada com sucesso');
        this.logMessage('Análise de rede parada');
      } else {
        this.showError(`Erro ao parar análise: ${result.message}`);
      }
      
    } catch (error) {
      console.error('Erro ao parar análise:', error);
      this.showError('Erro ao parar análise de rede');
    }
  }

  // Conectar à melhor rota
  async connectToBestRoute() {
    try {
      this.showProgress('Conectando à melhor rota...');
      
      const result = await ipcRenderer.invoke('connect-best-route');
      
      if (result.success) {
        this.isConnected = true;
        this.currentRoute = result.route;
        this.updateConnectionStatus(true);
        this.showSuccess(`Conectado à rota: ${result.route.name}`);
        this.logMessage(`Conectado à rota: ${result.route.name}`);
      } else {
        this.showError(`Erro ao conectar: ${result.message}`);
      }
      
    } catch (error) {
      console.error('Erro ao conectar:', error);
      this.showError('Erro ao conectar à rota');
    }
  }

  // Desconectar
  async disconnect() {
    try {
      this.showProgress('Desconectando...');
      
      const result = await ipcRenderer.invoke('disconnect');
      
      if (result.success) {
        this.isConnected = false;
        this.currentRoute = null;
        this.updateConnectionStatus(false);
        this.showSuccess('Desconectado com sucesso');
        this.logMessage('Desconectado da VPN');
      } else {
        this.showError(`Erro ao desconectar: ${result.message}`);
      }
      
    } catch (error) {
      console.error('Erro ao desconectar:', error);
      this.showError('Erro ao desconectar');
    }
  }

  // Atualizar estatísticas de rede
  async updateNetworkStats() {
    try {
      const result = await ipcRenderer.invoke('get-network-stats');
      
      if (result.success) {
        this.networkStats = result.stats;
        this.updateStatsDisplay();
      }
      
    } catch (error) {
      console.error('Erro ao atualizar estatísticas:', error);
    }
  }

  // Manipular atualização de rede
  handleNetworkUpdate(data) {
    this.routes = data.routes || [];
    this.isConnected = data.isConnected;
    this.currentRoute = data.currentRoute;
    
    this.updateRoutesList();
    this.updateConnectionStatus(this.isConnected);
  }

  // Atualizar lista de rotas
  updateRoutesList() {
    const routesList = this.elements.routesList;
    routesList.innerHTML = '';
    
    if (this.routes.length === 0) {
      routesList.innerHTML = '<div class="no-routes">Nenhuma rota disponível</div>';
      return;
    }
    
    this.routes.forEach((route, index) => {
      const routeElement = this.createRouteElement(route, index);
      routesList.appendChild(routeElement);
    });
  }

  // Criar elemento de rota
  createRouteElement(route, index) {
    const div = document.createElement('div');
    div.className = `route-item ${route === this.currentRoute ? 'active' : ''}`;
    
    const score = route.metrics ? this.calculateRouteScore(route.metrics) : 0;
    const scoreColor = this.getScoreColor(score);
    
    div.innerHTML = `
      <div class="route-header">
        <h3>${route.name}</h3>
        <div class="route-score" style="background-color: ${scoreColor}">
          ${score.toFixed(1)}
        </div>
      </div>
      <div class="route-details">
        <div class="route-type">${route.type}</div>
        ${route.metrics ? this.formatMetrics(route.metrics) : '<div class="no-metrics">Métricas não disponíveis</div>'}
      </div>
    `;
    
    return div;
  }

  // Calcular score da rota
  calculateRouteScore(metrics) {
    if (metrics.error) return 0;
    
    const latencyScore = Math.max(0, 100 - metrics.latency);
    const throughputScore = Math.min(100, metrics.throughput / 10);
    const stabilityScore = metrics.stability * 100;
    
    return (latencyScore * 0.4 + throughputScore * 0.4 + stabilityScore * 0.2);
  }

  // Obter cor do score
  getScoreColor(score) {
    if (score >= 80) return '#4CAF50';
    if (score >= 60) return '#FF9800';
    return '#F44336';
  }

  // Formatar métricas
  formatMetrics(metrics) {
    if (metrics.error) {
      return `<div class="error">Erro: ${metrics.error}</div>`;
    }
    
    return `
      <div class="metrics">
        <div class="metric">
          <span class="metric-label">Latência:</span>
          <span class="metric-value">${metrics.latency.toFixed(1)}ms</span>
        </div>
        <div class="metric">
          <span class="metric-label">Throughput:</span>
          <span class="metric-value">${metrics.throughput.toFixed(1)} Mbps</span>
        </div>
        <div class="metric">
          <span class="metric-label">Estabilidade:</span>
          <span class="metric-value">${(metrics.stability * 100).toFixed(1)}%</span>
        </div>
        <div class="metric">
          <span class="metric-label">Jitter:</span>
          <span class="metric-value">${metrics.jitter.toFixed(1)}ms</span>
        </div>
      </div>
    `;
  }

  // Atualizar display de estatísticas
  updateStatsDisplay() {
    if (!this.networkStats) return;
    
    const statsDiv = this.elements.networkStats;
    statsDiv.innerHTML = `
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-label">Interfaces Ativas</div>
          <div class="stat-value">${this.networkStats.interfaces ? this.networkStats.interfaces.length : 0}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Rotas Descobertas</div>
          <div class="stat-value">${this.routes.length}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Status</div>
          <div class="stat-value ${this.isConnected ? 'connected' : 'disconnected'}">
            ${this.isConnected ? 'Conectado' : 'Desconectado'}
          </div>
        </div>
      </div>
    `;
  }

  // Atualizar status de conexão
  updateConnectionStatus(connected) {
    this.isConnected = connected;
    
    if (connected) {
      this.elements.statusIndicator.className = 'status-indicator connected';
      this.elements.statusText.textContent = 'Conectado';
      this.elements.connectBtn.disabled = true;
      this.elements.disconnectBtn.disabled = false;
    } else {
      this.elements.statusIndicator.className = 'status-indicator disconnected';
      this.elements.statusText.textContent = 'Desconectado';
      this.elements.connectBtn.disabled = false;
      this.elements.disconnectBtn.disabled = true;
    }
  }

  // Atualizar botão de análise
  updateAnalyzeButton(analyzing) {
    this.isAnalyzing = analyzing;
    
    if (analyzing) {
      this.elements.analyzeBtn.textContent = 'Parar Análise';
      this.elements.analyzeBtn.className = 'btn btn-warning';
    } else {
      this.elements.analyzeBtn.textContent = 'Iniciar Análise';
      this.elements.analyzeBtn.className = 'btn btn-primary';
    }
  }

  // Mostrar progresso
  showProgress(message) {
    this.elements.progressBar.style.display = 'block';
    this.elements.progressBar.textContent = message;
  }

  // Esconder progresso
  hideProgress() {
    this.elements.progressBar.style.display = 'none';
  }

  // Mostrar sucesso
  showSuccess(message) {
    this.hideProgress();
    this.showNotification(message, 'success');
  }

  // Mostrar erro
  showError(message) {
    this.hideProgress();
    this.showNotification(message, 'error');
  }

  // Mostrar notificação
  showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  // Log de mensagem
  logMessage(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.textContent = `[${timestamp}] ${message}`;
    
    this.elements.logOutput.appendChild(logEntry);
    this.elements.logOutput.scrollTop = this.elements.logOutput.scrollHeight;
  }
}

// Inicializar quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
  new HiraishinRenderer();
});
