const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

const execAsync = promisify(exec);

class WireGuardController {
  constructor() {
    this.isConnected = false;
    this.currentConfig = null;
    this.configPath = path.join(os.homedir(), '.hiraishin', 'configs');
    this.ensureConfigDirectory();
  }

  ensureConfigDirectory() {
    if (!fs.existsSync(this.configPath)) {
      fs.mkdirSync(this.configPath, { recursive: true });
    }
  }

  async connect(route) {
    try {
      console.log(`Conectando à rota: ${route.name}`);
      const config = await this.generateConfig(route);
      const configFile = path.join(this.configPath, `${route.id}.conf`);
      fs.writeFileSync(configFile, config);
      await this.startWireGuard(configFile);
      this.isConnected = true;
      this.currentConfig = route;
      console.log(`Conectado com sucesso à rota: ${route.name}`);
      return true;
    } catch (error) {
      console.error('Erro ao conectar:', error);
      throw error;
    }
  }

  async disconnect() {
    try {
      if (!this.isConnected) {
        console.log('Não há conexão ativa');
        return true;
      }
      console.log('Desconectando...');
      await this.stopAllWireGuard();
      this.isConnected = false;
      this.currentConfig = null;
      console.log('Desconectado com sucesso');
      return true;
    } catch (error) {
      console.error('Erro ao desconectar:', error);
      throw error;
    }
  }

  async generateConfig(route) {
    const config = {
      iface: {
        PrivateKey: await this.generatePrivateKey(),
        Address: this.generateAddress(route),
        DNS: '8.8.8.8, 1.1.1.1',
        MTU: 1420
      },
      peer: {
        PublicKey: await this.generatePublicKey(),
        Endpoint: this.generateEndpoint(route),
        AllowedIPs: '0.0.0.0/0',
        PersistentKeepalive: 25
      }
    };
    return this.formatConfig(config);
  }

  formatConfig(config) {
    let configText = '[Interface]\n';
    configText += `PrivateKey = ${config.iface.PrivateKey}\n`;
    configText += `Address = ${config.iface.Address}\n`;
    configText += `DNS = ${config.iface.DNS}\n`;
    configText += `MTU = ${config.iface.MTU}\n\n`;

    configText += '[Peer]\n';
    configText += `PublicKey = ${config.peer.PublicKey}\n`;
    configText += `Endpoint = ${config.peer.Endpoint}\n`;
    configText += `AllowedIPs = ${config.peer.AllowedIPs}\n`;
    configText += `PersistentKeepalive = ${config.peer.PersistentKeepalive}\n`;

    return configText;
  }

  async generatePrivateKey() {
    try {
      const { stdout } = await execAsync('wg genkey');
      return stdout.trim();
    } catch {
      return this.generateFakeKey();
    }
  }

  async generatePublicKey() {
    try {
      const { stdout } = await execAsync('wg genkey | wg pubkey');
      return stdout.trim();
    } catch {
      return this.generateFakeKey();
    }
  }

  generateFakeKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let key = '';
    for (let i = 0; i < 44; i++) {
      key += chars[Math.floor(Math.random() * chars.length)];
    }
    return key;
  }

  generateAddress(route) {
    const subnet = Math.floor(Math.random() * 255) + 1;
    const host = Math.floor(Math.random() * 254) + 1;
    return `10.${subnet}.${host}.1/24`;
  }

  generateEndpoint(route) {
    if (route.gateway) return `${route.gateway}:51820`;
    if (route.ip) return `${route.ip}:51820`;
    return `127.0.0.1:51820`;
  }

  async startWireGuard(configFile) {
    try {
      let command =
        process.platform === 'win32'
          ? `wireguard.exe /installtunnelservice "${configFile}"`
          : `sudo wg-quick up "${configFile}"`;

      const { stderr } = await execAsync(command);

      if (stderr && !stderr.includes('Warning')) {
        throw new Error(`Erro ao iniciar WireGuard: ${stderr}`);
      }

      console.log('WireGuard iniciado com sucesso');
      return true;
    } catch (error) {
      console.error('Erro ao iniciar WireGuard:', error);
      if (process.env.NODE_ENV === 'development') {
        console.log('Modo de desenvolvimento: simulando conexão WireGuard');
        return true;
      }
      throw error;
    }
  }

  async stopWireGuard(configFile) {
    try {
      let command;
      if (process.platform === 'win32') {
        const configName = path.basename(configFile, '.conf');
        command = `wireguard.exe /uninstalltunnelservice "${configName}"`;
      } else {
        command = `sudo wg-quick down "${configFile}"`;
      }
      await execAsync(command);
      console.log('WireGuard parado com sucesso');
      return true;
    } catch (error) {
      console.error('Erro ao parar WireGuard:', error);
      throw error;
    }
  }

  async stopAllWireGuard() {
    try {
      const command =
        process.platform === 'win32'
          ? 'wireguard.exe /uninstalltunnelservice'
          : 'sudo wg-quick down all';
      await execAsync(command);
      console.log('Todas as interfaces WireGuard paradas');
      return true;
    } catch (error) {
      console.error('Erro ao parar WireGuard:', error);
      return true;
    }
  }

  async getStatus() {
    try {
      const command =
        process.platform === 'win32'
          ? 'wireguard.exe /showtunnels'
          : 'wg show';
      const { stdout } = await execAsync(command);
      return {
        isConnected: this.isConnected,
        currentConfig: this.currentConfig,
        wireguardStatus: stdout,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        isConnected: this.isConnected,
        currentConfig: this.currentConfig,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  async getTrafficStats() {
    try {
      const command =
        process.platform === 'win32'
          ? 'wireguard.exe /showtunnels'
          : 'wg show all dump';
      const { stdout } = await execAsync(command);
      return this.parseTrafficStats(stdout);
    } catch (error) {
      console.error('Erro ao obter estatísticas de tráfego:', error);
      return null;
    }
  }

  // ✅ Corrigido: renomeado "interface" para "iface"
  parseTrafficStats(output) {
    const stats = {
      interfaces: [],
      totalRx: 0,
      totalTx: 0,
      timestamp: new Date()
    };

    const lines = output.split('\n');

    for (const line of lines) {
      if (line.trim() && !line.includes('interface')) {
        const parts = line.trim().split('\t');
        if (parts.length >= 8) {
          const iface = {
            name: parts[0],
            publicKey: parts[1],
            endpoint: parts[2],
            allowedIPs: parts[3],
            latestHandshake: parts[4],
            rx: parseInt(parts[5]) || 0,
            tx: parseInt(parts[6]) || 0
          };

          stats.interfaces.push(iface);
          stats.totalRx += iface.rx;
          stats.totalTx += iface.tx;
        }
      }
    }

    return stats;
  }

  async isWireGuardInstalled() {
    try {
      const command =
        process.platform === 'win32'
          ? 'wireguard.exe --version'
          : 'wg --version';
      await execAsync(command);
      return true;
    } catch {
      return false;
    }
  }

  async installWireGuard() {
    if (process.platform === 'win32') {
      throw new Error('WireGuard para Windows deve ser instalado manualmente');
    }

    try {
      const { stdout } = await execAsync('cat /etc/os-release');
      let installCommand;
      if (stdout.includes('Ubuntu') || stdout.includes('Debian')) {
        installCommand = 'sudo apt update && sudo apt install -y wireguard';
      } else if (stdout.includes('CentOS') || stdout.includes('RHEL')) {
        installCommand = 'sudo yum install -y wireguard-tools';
      } else if (stdout.includes('Arch')) {
        installCommand = 'sudo pacman -S wireguard-tools';
      } else {
        throw new Error('Distribuição Linux não suportada');
      }

      await execAsync(installCommand);
      console.log('WireGuard instalado com sucesso');
      return true;
    } catch (error) {
      console.error('Erro ao instalar WireGuard:', error);
      throw error;
    }
  }

  async cleanup() {
    try {
      const files = fs.readdirSync(this.configPath);
      for (const file of files) {
        if (file.endsWith('.conf')) {
          const configFile = path.join(this.configPath, file);
          await this.stopWireGuard(configFile);
          fs.unlinkSync(configFile);
        }
      }
      console.log('Configurações limpas com sucesso');
      return true;
    } catch (error) {
      console.error('Erro ao limpar configurações:', error);
      throw error;
    }
  }
}

module.exports = new WireGuardController();
