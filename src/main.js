const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const probe = require('./probe');
const wgController = require('./wg-controller');

class HiraishinVPN {
  constructor() {
    this.mainWindow = null;
    this.isConnected = false;
    this.currentRoute = null;
    this.analysisInterval = null;
    this.routes = [];
  }

  createWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: true
      },
      icon: path.join(__dirname, '../assets/icon.png'),
      title: 'Hiraishin VPN - Análise Inteligente de Conexão'
    });

    this.mainWindow.loadFile(path.join(__dirname, 'index.html'));

    // Abrir DevTools em modo desenvolvimento
    if (process.argv.includes('--dev')) {
      this.mainWindow.webContents.openDevTools();
    }

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    this.setupIPC();
  }

  setupIPC() {
    // Iniciar análise de rede
    ipcMain.handle('start-analysis', async () => {
      try {
        await this.startNetworkAnalysis();
        return { success: true, message: 'Análise iniciada com sucesso' };
      } catch (error) {
        return { success: false, message: error.message };
      }
    });

    // Parar análise de rede
    ipcMain.handle('stop-analysis', async () => {
      try {
        await this.stopNetworkAnalysis();
        return { success: true, message: 'Análise parada com sucesso' };
      } catch (error) {
        return { success: false, message: error.message };
      }
    });

    // Conectar à melhor rota
    ipcMain.handle('connect-best-route', async () => {
      try {
        const bestRoute = await this.findBestRoute();
        if (bestRoute) {
          await this.connectToRoute(bestRoute);
          return { success: true, route: bestRoute };
        }
        return { success: false, message: 'Nenhuma rota otimizada encontrada' };
      } catch (error) {
        return { success: false, message: error.message };
      }
    });

    // Desconectar VPN
    ipcMain.handle('disconnect', async () => {
      try {
        await this.disconnect();
        return { success: true, message: 'Desconectado com sucesso' };
      } catch (error) {
        return { success: false, message: error.message };
      }
    });

    // Obter status da conexão
    ipcMain.handle('get-status', () => {
      return {
        isConnected: this.isConnected,
        currentRoute: this.currentRoute,
        routes: this.routes
      };
    });

    // Obter estatísticas de rede
    ipcMain.handle('get-network-stats', async () => {
      try {
        const stats = await probe.getNetworkStats();
        return { success: true, stats };
      } catch (error) {
        return { success: false, message: error.message };
      }
    });
  }

  async startNetworkAnalysis() {
    console.log('Iniciando análise de rede...');
    
    // Obter rotas disponíveis
    this.routes = await probe.discoverRoutes();
    
    // Iniciar monitoramento contínuo
    this.analysisInterval = setInterval(async () => {
      try {
        await this.analyzeRoutes();
        this.sendUpdateToRenderer();
      } catch (error) {
        console.error('Erro na análise de rotas:', error);
      }
    }, 5000); // Analisar a cada 5 segundos

    return true;
  }

  async stopNetworkAnalysis() {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
    console.log('Análise de rede parada');
  }

  async analyzeRoutes() {
    console.log('Analisando rotas disponíveis...');
    
    for (let route of this.routes) {
      try {
        const metrics = await probe.analyzeRoute(route);
        route.metrics = metrics;
        route.lastAnalyzed = new Date();
      } catch (error) {
        console.error(`Erro ao analisar rota ${route.name}:`, error);
        route.metrics = { error: error.message };
      }
    }

    // Ordenar rotas por qualidade
    this.routes.sort((a, b) => {
      if (!a.metrics || !b.metrics) return 0;
      const scoreA = this.calculateRouteScore(a.metrics);
      const scoreB = this.calculateRouteScore(b.metrics);
      return scoreB - scoreA;
    });
  }

  calculateRouteScore(metrics) {
    if (metrics.error) return 0;
    
    // Score baseado em latência, throughput e estabilidade
    const latencyScore = Math.max(0, 100 - metrics.latency);
    const throughputScore = Math.min(100, metrics.throughput / 10);
    const stabilityScore = metrics.stability * 100;
    
    return (latencyScore * 0.4 + throughputScore * 0.4 + stabilityScore * 0.2);
  }

  async findBestRoute() {
    if (this.routes.length === 0) {
      throw new Error('Nenhuma rota disponível');
    }

    // Retornar a rota com melhor score
    return this.routes[0];
  }

  async connectToRoute(route) {
    try {
      console.log(`Conectando à rota: ${route.name}`);
      await wgController.connect(route);
      this.isConnected = true;
      this.currentRoute = route;
      return true;
    } catch (error) {
      console.error('Erro ao conectar:', error);
      throw error;
    }
  }

  async disconnect() {
    try {
      await wgController.disconnect();
      this.isConnected = false;
      this.currentRoute = null;
      console.log('Desconectado com sucesso');
    } catch (error) {
      console.error('Erro ao desconectar:', error);
      throw error;
    }
  }

  sendUpdateToRenderer() {
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send('network-update', {
        routes: this.routes,
        isConnected: this.isConnected,
        currentRoute: this.currentRoute
      });
    }
  }
}

// Inicializar aplicação
const hiraishin = new HiraishinVPN();

app.whenReady().then(() => {
  hiraishin.createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      hiraishin.createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (hiraishin.isConnected) {
    await hiraishin.disconnect();
  }
  if (hiraishin.analysisInterval) {
    clearInterval(hiraishin.analysisInterval);
  }
});

// Exportar para uso em outros módulos
module.exports = hiraishin;
