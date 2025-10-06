const ping = require('ping');
const { exec } = require('child_process');
const { promisify } = require('util');
const si = require('systeminformation');
const wifi = require('node-wifi');

const execAsync = promisify(exec);

class NetworkProbe {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 30000; // 30 segundos
  }

  // Descobrir rotas disponíveis
  async discoverRoutes() {
    console.log('Descobrindo rotas de rede...');
    
    const routes = [];
    
    try {
      // Obter interfaces de rede
      const networkInterfaces = await si.networkInterfaces();
      
      // Obter redes WiFi disponíveis
      const wifiNetworks = await this.getWifiNetworks();
      
      // Obter rotas do sistema
      const systemRoutes = await this.getSystemRoutes();
      
      // Criar rotas baseadas nas interfaces
      for (const iface of networkInterfaces) {
        if (iface.operstate === 'up' && iface.type !== 'loopback') {
          routes.push({
            id: iface.iface,
            name: `${iface.iface} (${iface.type})`,
            type: iface.type,
            ip: iface.ip4,
            mac: iface.mac,
            speed: iface.speed,
            iface: iface.iface,
            metrics: null,
            lastAnalyzed: null
          });
        }
      }
      
      // Adicionar redes WiFi
      for (const network of wifiNetworks) {
        routes.push({
          id: `wifi-${network.ssid}`,
          name: `WiFi: ${network.ssid}`,
          type: 'wifi',
          ssid: network.ssid,
          signal: network.signal,
          security: network.security,
          iface: 'wlan0',
          metrics: null,
          lastAnalyzed: null
        });
      }
      
      // Adicionar rotas do sistema
      for (const route of systemRoutes) {
        routes.push({
          id: `route-${route.destination}`,
          name: `Rota: ${route.destination}`,
          type: 'route',
          destination: route.destination,
          gateway: route.gateway,
          iface: route.iface,
          metrics: null,
          lastAnalyzed: null
        });
      }
      
      console.log(`Encontradas ${routes.length} rotas disponíveis`);
      return routes;
      
    } catch (error) {
      console.error('Erro ao descobrir rotas:', error);
      return [];
    }
  }

  // Analisar uma rota específica
  async analyzeRoute(route) {
    const cacheKey = `${route.id}-${Date.now()}`;
    
    // Verificar cache
    if (this.cache.has(route.id)) {
      const cached = this.cache.get(route.id);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
    }
    
    console.log(`Analisando rota: ${route.name}`);
    
    try {
      const metrics = {
        latency: await this.measureLatency(route),
        throughput: await this.measureThroughput(route),
        stability: await this.measureStability(route),
        packetLoss: await this.measurePacketLoss(route),
        jitter: await this.measureJitter(route),
        timestamp: new Date()
      };
      
      // Cache dos resultados
      this.cache.set(route.id, {
        data: metrics,
        timestamp: Date.now()
      });
      
      return metrics;
      
    } catch (error) {
      console.error(`Erro ao analisar rota ${route.name}:`, error);
      return {
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  // Medir latência
  async measureLatency(route) {
    try {
      let target = '8.8.8.8'; // Google DNS como padrão
      
      if (route.gateway) {
        target = route.gateway;
      } else if (route.ip) {
        target = route.ip;
      }
      
      const result = await ping.promise.probe(target, {
        timeout: 3,
        extra: ['-c', '3']
      });
      
      return result.alive ? parseFloat(result.time) : 999;
      
    } catch (error) {
      console.error('Erro ao medir latência:', error);
      return 999;
    }
  }

  // Medir throughput
  async measureThroughput(route) {
    try {
      // Simular teste de throughput baseado na interface
      const interfaceInfo = await si.networkInterfaceStats(route.iface);
      
      if (interfaceInfo) {
        // Calcular throughput baseado na velocidade da interface
        const speed = route.speed || 100; // Mbps
        const utilization = interfaceInfo.rx_sec / (speed * 1024 * 1024 / 8); // Conversão para MB/s
        
        return Math.max(0, speed * (1 - utilization));
      }
      
      return 0;
      
    } catch (error) {
      console.error('Erro ao medir throughput:', error);
      return 0;
    }
  }

  // Medir estabilidade
  async measureStability(route) {
    try {
      const samples = [];
      const target = route.gateway || '8.8.8.8';
      
      // Fazer 5 pings para medir estabilidade
      for (let i = 0; i < 5; i++) {
        const result = await ping.promise.probe(target, {
          timeout: 2,
          extra: ['-c', '1']
        });
        
        if (result.alive) {
          samples.push(parseFloat(result.time));
        } else {
          samples.push(999);
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      const variance = samples.reduce((sum, time) => sum + Math.pow(time - avg, 2), 0) / samples.length;
      const stability = Math.max(0, 1 - (variance / avg));
      
      return Math.min(1, stability);
      
    } catch (error) {
      console.error('Erro ao medir estabilidade:', error);
      return 0;
    }
  }

  // Medir perda de pacotes
  async measurePacketLoss(route) {
    try {
      const target = route.gateway || '8.8.8.8';
      const result = await ping.promise.probe(target, {
        timeout: 3,
        extra: ['-c', '10']
      });
      
      return result.alive ? 0 : 1;
      
    } catch (error) {
      console.error('Erro ao medir perda de pacotes:', error);
      return 1;
    }
  }

  // Medir jitter
  async measureJitter(route) {
    try {
      const samples = [];
      const target = route.gateway || '8.8.8.8';
      
      for (let i = 0; i < 10; i++) {
        const result = await ping.promise.probe(target, {
          timeout: 1,
          extra: ['-c', '1']
        });
        
        if (result.alive) {
          samples.push(parseFloat(result.time));
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (samples.length < 2) return 0;
      
      let jitter = 0;
      for (let i = 1; i < samples.length; i++) {
        jitter += Math.abs(samples[i] - samples[i-1]);
      }
      
      return jitter / (samples.length - 1);
      
    } catch (error) {
      console.error('Erro ao medir jitter:', error);
      return 0;
    }
  }

  // Obter redes WiFi disponíveis
  async getWifiNetworks() {
    try {
      wifi.init({ iface: null });
      const networks = await wifi.scan();
      return networks.filter(network => network.ssid && network.ssid.length > 0);
      
    } catch (error) {
      console.error('Erro ao obter redes WiFi:', error);
      return [];
    }
  }

  // Obter rotas do sistema
  async getSystemRoutes() {
    try {
      let command;
      let parseFunction;
      
      if (process.platform === 'win32') {
        command = 'route print';
        parseFunction = this.parseWindowsRoutes;
      } else {
        command = 'ip route show';
        parseFunction = this.parseLinuxRoutes;
      }
      
      const { stdout } = await execAsync(command);
      return parseFunction(stdout);
      
    } catch (error) {
      console.error('Erro ao obter rotas do sistema:', error);
      return [];
    }
  }

  // Parsear rotas do Windows
  parseWindowsRoutes(output) {
    const routes = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.includes('0.0.0.0') && line.includes('Gateway')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          routes.push({
            destination: '0.0.0.0/0',
            gateway: parts[2],
            iface: parts[3] || 'Unknown'
          });
        }
      }
    }
    
    return routes;
  }

  // Parsear rotas do Linux
  parseLinuxRoutes(output) {
    const routes = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.includes('default')) {
        const parts = line.trim().split(/\s+/);
        const gateway = parts[2];
        const iface = parts[4];
        
        routes.push({
          destination: '0.0.0.0/0',
          gateway: gateway,
          iface: iface
        });
      }
    }
    
    return routes;
  }

  // Obter estatísticas gerais da rede
  async getNetworkStats() {
    try {
      const stats = await si.networkStats();
      const interfaces = await si.networkInterfaces();
      
      return {
        interfaces: interfaces,
        stats: stats,
        timestamp: new Date()
      };
      
    } catch (error) {
      console.error('Erro ao obter estatísticas de rede:', error);
      return null;
    }
  }

  // Limpar cache
  clearCache() {
    this.cache.clear();
  }

  // Obter cache
  getCache() {
    return Array.from(this.cache.entries()).map(([key, value]) => ({
      key,
      data: value.data,
      timestamp: value.timestamp
    }));
  }
}

module.exports = new NetworkProbe();
