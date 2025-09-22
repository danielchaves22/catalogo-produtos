// backend/scripts/siscomex-setup.ts

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

/**
 * Script para configuração inicial do SISCOMEX
 * Execute com: npx ts-node scripts/siscomex-setup.ts
 */

interface SetupConfig {
  ambiente: 'producao' | 'treinamento';
  certificadoPath?: string;
  chavePrivadaPath?: string;
  senhaSecreta?: string;
  gerarSecreta?: boolean;
}

class SiscomexSetup {
  private config: SetupConfig;
  private envPath: string;

  constructor() {
    this.config = {
      ambiente: 'treinamento',
      gerarSecreta: true
    };
    this.envPath = path.resolve('.env');
  }

  async executar(): Promise<void> {
    console.log('🚀 Configuração SISCOMEX - Catálogo de Produtos');
    console.log('================================================\n');

    try {
      await this.coletarInformacoes();
      await this.validarCertificados();
      await this.atualizarEnv();
      await this.testarConfiguracao();
      
      console.log('\n✅ Configuração SISCOMEX concluída com sucesso!');
      console.log('\n📋 Próximos passos:');
      console.log('1. Reinicie a aplicação');
      console.log('2. Teste a conectividade: GET /api/v1/siscomex/status');
      console.log('3. Execute diagnóstico: GET /api/v1/siscomex/debug/diagnostico');
      
    } catch (error) {
      console.error('\n❌ Erro na configuração:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  private async coletarInformacoes(): Promise<void> {
    console.log('📝 Coletando informações de configuração...\n');

    // Ambiente
    const ambienteInput = await this.prompt(
      'Ambiente SISCOMEX (producao/treinamento)', 
      'treinamento'
    );
    this.config.ambiente = ambienteInput as 'producao' | 'treinamento';

    // Certificado
    const certificadoInput = await this.prompt(
      'Caminho para o certificado (.pem)', 
      './certificados/certificado.pem'
    );
    this.config.certificadoPath = certificadoInput;

    // Chave privada
    const chaveInput = await this.prompt(
      'Caminho para a chave privada (.pem)', 
      './certificados/chave_privada.pem'
    );
    this.config.chavePrivadaPath = chaveInput;

    // Senha secreta
    const gerarSecreta = await this.prompt(
      'Gerar nova chave secreta? (s/n)', 
      's'
    );
    this.config.gerarSecreta = gerarSecreta.toLowerCase() === 's';

    if (!this.config.gerarSecreta) {
      const secretaInput = await this.prompt(
        'Chave secreta (64 caracteres hex)', 
        ''
      );
      this.config.senhaSecreta = secretaInput;
    }
  }

  private async validarCertificados(): Promise<void> {
    console.log('\n🔍 Validando certificados...');

    if (this.config.certificadoPath) {
      try {
        await fs.access(this.config.certificadoPath);
        console.log('✅ Certificado encontrado');

        // Valida formato
        const certContent = await fs.readFile(this.config.certificadoPath, 'utf8');
        if (!certContent.includes('BEGIN CERTIFICATE')) {
          throw new Error('Formato de certificado inválido (esperado PEM)');
        }

        // Verifica validade
        const { X509Certificate } = await import('crypto');
        const cert = new X509Certificate(certContent);
        const agora = new Date();
        const validTo = new Date(cert.validTo);

        if (agora > validTo) {
          console.log('⚠️  AVISO: Certificado expirado!');
        } else {
          const diasRestantes = Math.ceil((validTo.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24));
          console.log(`✅ Certificado válido (expira em ${diasRestantes} dias)`);
          
          if (diasRestantes <= 30) {
            console.log('⚠️  AVISO: Certificado expira em breve!');
          }
        }

      } catch (error) {
        throw new Error(`Erro no certificado: ${error instanceof Error ? error.message : error}`);
      }
    }

    if (this.config.chavePrivadaPath) {
      try {
        await fs.access(this.config.chavePrivadaPath);
        console.log('✅ Chave privada encontrada');

        const keyContent = await fs.readFile(this.config.chavePrivadaPath, 'utf8');
        if (!keyContent.includes('BEGIN PRIVATE KEY') && !keyContent.includes('BEGIN RSA PRIVATE KEY')) {
          throw new Error('Formato de chave privada inválido (esperado PEM)');
        }

      } catch (error) {
        throw new Error(`Erro na chave privada: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  private async atualizarEnv(): Promise<void> {
    console.log('\n📝 Atualizando arquivo .env...');

    // Lê .env atual se existir
    let envContent = '';
    try {
      envContent = await fs.readFile(this.envPath, 'utf8');
    } catch {
      console.log('Criando novo arquivo .env...');
    }

    // Gera chave secreta se solicitado
    if (this.config.gerarSecreta) {
      this.config.senhaSecreta = crypto.randomBytes(32).toString('hex');
      console.log('✅ Nova chave secreta gerada');
    }

    // Define URL da API baseada no ambiente
    const apiUrl = this.config.ambiente === 'producao'
      ? 'https://api.portalunico.siscomex.gov.br'
      : 'https://val.portalunico.siscomex.gov.br';

    // Atualiza variáveis SISCOMEX
    const siscomexVars = {
      SISCOMEX_API_URL: apiUrl,
      SISCOMEX_AMBIENTE: this.config.ambiente,
      SISCOMEX_CERT_PATH: this.config.certificadoPath,
      SISCOMEX_KEY_PATH: this.config.chavePrivadaPath,
      CERT_PASSWORD_SECRET: this.config.senhaSecreta
    };

    // Atualiza .env
    for (const [key, value] of Object.entries(siscomexVars)) {
      if (value) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        const newLine = `${key}=${value}`;
        
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, newLine);
        } else {
          envContent += `\n${newLine}`;
        }
      }
    }

    await fs.writeFile(this.envPath, envContent);
    console.log('✅ Arquivo .env atualizado');
  }

  private async testarConfiguracao(): Promise<void> {
    console.log('\n🧪 Testando configuração...');

    try {
      // Carrega novas variáveis
      require('dotenv').config({ path: this.envPath });

      // Testa básico
      if (!process.env.SISCOMEX_API_URL) {
        throw new Error('SISCOMEX_API_URL não definida');
      }

      if (!process.env.CERT_PASSWORD_SECRET) {
        throw new Error('CERT_PASSWORD_SECRET não definida');
      }

      // Testa conectividade básica
      const { default: axios } = await import('axios');
      
      try {
        const response = await axios.get(process.env.SISCOMEX_API_URL, {
          timeout: 10000,
          validateStatus: () => true // Aceita qualquer status para teste
        });
        
        console.log(`✅ Conectividade básica OK (status: ${response.status})`);
      } catch (connectError) {
        console.log('⚠️  Aviso: Não foi possível testar conectividade (pode ser normal)');
      }

      console.log('✅ Configuração básica validada');

    } catch (error) {
      throw new Error(`Falha no teste: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async prompt(question: string, defaultValue = ''): Promise<string> {
    return new Promise((resolve) => {
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const promptText = defaultValue 
        ? `${question} [${defaultValue}]: `
        : `${question}: `;

      readline.question(promptText, (answer: string) => {
        readline.close();
        resolve(answer.trim() || defaultValue);
      });
    });
  }
}

// Função auxiliar para configuração não-interativa
export async function setupSiscomexSilent(config: {
  ambiente: 'producao' | 'treinamento';
  certificadoPath: string;
  chavePrivadaPath: string;
  gerarNovaSecreta?: boolean;
}): Promise<void> {
  const envPath = path.resolve('.env');
  
  // Gera chave secreta
  const senhaSecreta = config.gerarNovaSecreta !== false 
    ? crypto.randomBytes(32).toString('hex')
    : process.env.CERT_PASSWORD_SECRET;

  if (!senhaSecreta) {
    throw new Error('CERT_PASSWORD_SECRET não definida e geração de nova chave desabilitada');
  }

  // URL da API
  const apiUrl = config.ambiente === 'producao'
    ? 'https://api.portalunico.siscomex.gov.br'
    : 'https://val.portalunico.siscomex.gov.br';

  // Lê .env atual
  let envContent = '';
  try {
    envContent = await fs.readFile(envPath, 'utf8');
  } catch {
    // Arquivo não existe, será criado
  }

  // Atualiza variáveis
  const vars = {
    SISCOMEX_API_URL: apiUrl,
    SISCOMEX_AMBIENTE: config.ambiente,
    SISCOMEX_CERT_PATH: config.certificadoPath,
    SISCOMEX_KEY_PATH: config.chavePrivadaPath,
    CERT_PASSWORD_SECRET: senhaSecreta
  };

  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    const newLine = `${key}=${value}`;
    
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, newLine);
    } else {
      envContent += `\n${newLine}`;
    }
  }

  await fs.writeFile(envPath, envContent);
}

// Script de verificação de saúde
export async function healthCheckSiscomex(): Promise<{
  configuracao: boolean;
  certificados: boolean;
  conectividade: boolean;
  detalhes: any;
}> {
  const resultado = {
    configuracao: false,
    certificados: false,
    conectividade: false,
    detalhes: {
      erros: [] as string[],
      avisos: [] as string[]
    }
  };

  try {
    // Verifica configuração
    const requiredVars = [
      'SISCOMEX_API_URL',
      'SISCOMEX_AMBIENTE',
      'SISCOMEX_CERT_PATH',
      'SISCOMEX_KEY_PATH',
      'CERT_PASSWORD_SECRET'
    ];

    const missingVars = requiredVars.filter(v => !process.env[v]);
    
    if (missingVars.length === 0) {
      resultado.configuracao = true;
    } else {
      resultado.detalhes.erros.push(`Variáveis não configuradas: ${missingVars.join(', ')}`);
    }

    // Verifica certificados
    if (process.env.SISCOMEX_CERT_PATH && process.env.SISCOMEX_KEY_PATH) {
      try {
        await fs.access(process.env.SISCOMEX_CERT_PATH);
        await fs.access(process.env.SISCOMEX_KEY_PATH);
        
        // Valida certificado
        const certContent = await fs.readFile(process.env.SISCOMEX_CERT_PATH, 'utf8');
        const { X509Certificate } = await import('crypto');
        const cert = new X509Certificate(certContent);
        
        const agora = new Date();
        const validTo = new Date(cert.validTo);
        
        if (agora > validTo) {
          resultado.detalhes.erros.push('Certificado expirado');
        } else {
          const diasRestantes = Math.ceil((validTo.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24));
          resultado.certificados = true;
          
          if (diasRestantes <= 30) {
            resultado.detalhes.avisos.push(`Certificado expira em ${diasRestantes} dias`);
          }
        }
        
      } catch (error) {
        resultado.detalhes.erros.push(`Erro nos certificados: ${error instanceof Error ? error.message : error}`);
      }
    }

    // Testa conectividade
    if (process.env.SISCOMEX_API_URL) {
      try {
        const { default: axios } = await import('axios');
        const response = await axios.get(process.env.SISCOMEX_API_URL, {
          timeout: 5000,
          validateStatus: () => true
        });
        
        if (response.status < 500) {
          resultado.conectividade = true;
        } else {
          resultado.detalhes.avisos.push(`API retornou status ${response.status}`);
        }
        
      } catch (error) {
        resultado.detalhes.avisos.push('Não foi possível testar conectividade');
      }
    }

  } catch (error) {
    resultado.detalhes.erros.push(`Erro geral: ${error instanceof Error ? error.message : error}`);
  }

  return resultado;
}

// Executa setup se chamado diretamente
if (require.main === module) {
  const setup = new SiscomexSetup();
  setup.executar().catch(console.error);
}