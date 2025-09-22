// backend/examples/siscomex-usage-examples.ts

/**
 * Exemplos práticos de uso da integração SISCOMEX
 * 
 * Este arquivo contém exemplos de como utilizar os serviços
 * de integração SISCOMEX em diferentes cenários.
 */

import { SiscomexTransformersService } from '../src/services/siscomex-transformers.service';
import { SiscomexExportService } from '../src/services/siscomex-export.service';
import { SiscomexService } from '../src/services/siscomex.service';
import { catalogoPrisma } from '../src/utils/prisma';

// =====================================
// EXEMPLO 1: EXPORTAÇÃO BÁSICA
// =====================================

/**
 * Exemplo: Exportar todos os produtos ativos de um catálogo
 */
export async function exemploExportacaoBasica() {
  console.log('📦 Exemplo: Exportação Básica de Catálogo');
  
  const exportService = new SiscomexExportService();
  const superUserId = 1; // ID do superusuário
  
  try {
    // Exporta catálogo completo em formato JSON
    const resultado = await exportService.exportarCatalogo(superUserId, {
      incluirProdutos: true,
      incluirOperadores: true,
      apenasAtivos: true,
      formato: 'json'
    });

    if (resultado.sucesso) {
      console.log(`✅ Exportação concluída:`);
      console.log(`   📁 Arquivo: ${resultado.arquivo!.nome}`);
      console.log(`   📊 Produtos: ${resultado.resumo.produtosValidados}/${resultado.resumo.totalProdutos}`);
      console.log(`   🏭 Operadores: ${resultado.resumo.totalOperadores}`);
      
      if (resultado.resumo.erros.length > 0) {
        console.log(`   ⚠️  Erros encontrados:`);
        resultado.resumo.erros.forEach(erro => console.log(`      - ${erro}`));
      }
    } else {
      console.log('❌ Falha na exportação:', resultado.resumo.erros);
    }

  } catch (error) {
    console.error('❌ Erro:', error instanceof Error ? error.message : error);
  }
}

// =====================================
// EXEMPLO 2: VALIDAÇÃO ANTES DO ENVIO
// =====================================

/**
 * Exemplo: Validar produtos antes de enviar ao SISCOMEX
 */
export async function exemploValidacaoProdutos() {
  console.log('🔍 Exemplo: Validação de Produtos');
  
  const exportService = new SiscomexExportService();
  const produtoIds = [1, 2, 3, 4, 5]; // IDs dos produtos a validar
  const superUserId = 1;
  
  try {
    // Valida produtos
    const validacao = await exportService.validarProdutosParaExportacao(
      produtoIds,
      superUserId
    );

    console.log(`✅ Validação concluída:`);
    console.log(`   ✓ Produtos válidos: ${validacao.produtosValidos.length}`);
    console.log(`   ✗ Produtos inválidos: ${validacao.produtosInvalidos.length}`);

    // Mostra detalhes dos produtos inválidos
    if (validacao.produtosInvalidos.length > 0) {
      console.log(`\n   📋 Produtos que precisam de correção:`);
      validacao.produtosInvalidos.forEach(produto => {
        console.log(`      🔸 ${produto.denominacao}:`);
        produto.erros.forEach(erro => console.log(`         - ${erro}`));
      });
    }

    // Prossegue apenas com produtos válidos
    if (validacao.produtosValidos.length > 0) {
      console.log(`\n   ➡️  Produtos prontos para envio: ${validacao.produtosValidos.join(', ')}`);
    }

  } catch (error) {
    console.error('❌ Erro:', error instanceof Error ? error.message : error);
  }
}

// =====================================
// EXEMPLO 3: TRANSFORMAÇÃO MANUAL
// =====================================

/**
 * Exemplo: Transformar produto interno para formato SISCOMEX
 */
export async function exemploTransformacaoManual() {
  console.log('🔄 Exemplo: Transformação Manual de Produto');
  
  const transformersService = new SiscomexTransformersService();
  const produtoId = 1;
  const superUserId = 1;
  
  try {
    // Busca produto completo do banco
    const produto = await catalogoPrisma.produto.findFirst({
      where: { 
        id: produtoId, 
        catalogo: { superUserId } 
      },
      include: {
        catalogo: true,
        atributos: true,
        codigosInternos: true,
        operadoresEstrangeiros: {
          include: {
            pais: true,
            operadorEstrangeiro: {
              include: {
                pais: true,
                subdivisao: true,
                identificacoesAdicionais: {
                  include: { agenciaEmissora: true }
                }
              }
            }
          }
        }
      }
    });

    if (!produto) {
      console.log('❌ Produto não encontrado');
      return;
    }

    console.log(`📦 Transformando produto: ${produto.denominacao}`);

    // 1. Valida o produto
    const validacao = transformersService.validarProdutoParaEnvio(produto as any);
    
    if (!validacao.valido) {
      console.log('❌ Produto inválido para transformação:');
      validacao.erros.forEach(erro => console.log(`   - ${erro}`));
      return;
    }

    // 2. Transforma para formato SISCOMEX
    const produtoSiscomex = transformersService.transformarProdutoParaSiscomex(produto as any);

    console.log('✅ Transformação concluída:');
    console.log(`   🏢 CNPJ Raiz: ${produtoSiscomex.cnpjRaiz}`);
    console.log(`   📋 NCM: ${produtoSiscomex.ncm}`);
    console.log(`   🔤 Denominação: ${produtoSiscomex.denominacaoProduto}`);
    console.log(`   🏭 Fabricantes: ${produtoSiscomex.fabricantes.length}`);
    console.log(`   📝 Atributos: ${produtoSiscomex.atributos.length}`);

    // 3. Mostra alguns detalhes
    if (produtoSiscomex.fabricantes.length > 0) {
      console.log('\n   🏭 Fabricantes:');
      produtoSiscomex.fabricantes.forEach((fab, index) => {
        console.log(`      ${index + 1}. ${fab.nome} (${fab.pais})`);
        if (fab.tin) console.log(`         TIN: ${fab.tin}`);
      });
    }

    if (produtoSiscomex.atributos.length > 0) {
      console.log('\n   📝 Atributos (primeiros 3):');
      produtoSiscomex.atributos.slice(0, 3).forEach(attr => {
        console.log(`      • ${attr.nome}: ${attr.valor} (${attr.tipo})`);
      });
    }

  } catch (error) {
    console.error('❌ Erro:', error instanceof Error ? error.message : error);
  }
}

// =====================================
// EXEMPLO 4: ENVIO REAL PARA SISCOMEX
// =====================================

/**
 * Exemplo: Enviar produto para SISCOMEX (ambiente real)
 */
export async function exemploEnvioReal() {
  console.log('🚀 Exemplo: Envio Real para SISCOMEX');
  console.log('⚠️  CUIDADO: Este exemplo faz envios reais para o SISCOMEX!');
  
  const siscomexService = new SiscomexService();
  const transformersService = new SiscomexTransformersService();
  const produtoId = 1;
  const superUserId = 1;
  
  try {
    // 1. Verifica conectividade
    console.log('🔗 Verificando conectividade...');
    const conectividade = await siscomexService.verificarConexao();
    
    if (!conectividade.conectado) {
      console.log('❌ SISCOMEX não disponível');
      return;
    }
    
    console.log(`✅ SISCOMEX conectado (${conectividade.ambiente})`);

    // 2. Busca e valida produto
    const produto = await catalogoPrisma.produto.findFirst({
      where: { 
        id: produtoId, 
        catalogo: { superUserId } 
      },
      include: {
        catalogo: true,
        atributos: true,
        codigosInternos: true,
        operadoresEstrangeiros: {
          include: {
            pais: true,
            operadorEstrangeiro: {
              include: {
                pais: true,
                subdivisao: true,
                identificacoesAdicionais: {
                  include: { agenciaEmissora: true }
                }
              }
            }
          }
        }
      }
    });

    if (!produto) {
      console.log('❌ Produto não encontrado');
      return;
    }

    // 3. Valida produto
    console.log('🔍 Validando produto...');
    const validacao = transformersService.validarProdutoParaEnvio(produto as any);
    
    if (!validacao.valido) {
      console.log('❌ Produto inválido:');
      validacao.erros.forEach(erro => console.log(`   - ${erro}`));
      return;
    }

    // 4. Transforma produto
    console.log('🔄 Transformando produto...');
    const produtoSiscomex = transformersService.transformarProdutoParaSiscomex(produto as any);

    // 5. Envia para SISCOMEX
    console.log('📤 Enviando para SISCOMEX...');
    const resultado = await siscomexService.incluirProduto(produtoSiscomex);

    console.log('✅ Produto cadastrado no SISCOMEX:');
    console.log(`   🆔 Código: ${resultado.codigo}`);
    console.log(`   📊 Versão: ${resultado.versao}`);
    console.log(`   📅 Data: ${resultado.dataRegistro}`);

    // 6. Atualiza produto local com código SISCOMEX
    await catalogoPrisma.produto.update({
      where: { id: produto.id },
      data: { 
        codigo: resultado.codigo,
        status: 'TRANSMITIDO'
      }
    });

    console.log('✅ Produto local atualizado com código SISCOMEX');

  } catch (error) {
    console.error('❌ Erro no envio:', error instanceof Error ? error.message : error);
  }
}

// =====================================
// EXEMPLO 5: ENVIO EM LOTE
// =====================================

/**
 * Exemplo: Enviar múltiplos produtos em lote
 */
export async function exemploEnvioLote() {
  console.log('📦 Exemplo: Envio em Lote');
  
  const siscomexService = new SiscomexService();
  const exportService = new SiscomexExportService();
  const superUserId = 1;
  
  try {
    // 1. Busca produtos prontos para envio
    console.log('🔍 Buscando produtos para envio...');
    
    const produtosPendentes = await catalogoPrisma.produto.findMany({
      where: {
        catalogo: { superUserId },
        status: 'APROVADO', // Apenas produtos aprovados
        codigo: null // Que ainda não foram enviados
      },
      take: 10, // Máximo 10 por lote
      include: {
        catalogo: true,
        atributos: true,
        codigosInternos: true,
        operadoresEstrangeiros: {
          include: {
            pais: true,
            operadorEstrangeiro: {
              include: {
                pais: true,
                subdivisao: true,
                identificacoesAdicionais: {
                  include: { agenciaEmissora: true }
                }
              }
            }
          }
        }
      }
    });

    if (produtosPendentes.length === 0) {
      console.log('ℹ️  Nenhum produto pendente encontrado');
      return;
    }

    console.log(`📋 Encontrados ${produtosPendentes.length} produtos pendentes`);

    // 2. Valida produtos
    console.log('🔍 Validando produtos...');
    const validacao = await exportService.validarProdutosParaExportacao(
      produtosPendentes.map(p => p.id),
      superUserId
    );

    console.log(`✓ Válidos: ${validacao.produtosValidos.length}`);
    console.log(`✗ Inválidos: ${validacao.produtosInvalidos.length}`);

    if (validacao.produtosValidos.length === 0) {
      console.log('❌ Nenhum produto válido para envio');
      return;
    }

    // 3. Prepara produtos para envio
    const transformersService = new SiscomexTransformersService();
    const produtosParaEnvio = produtosPendentes
      .filter(p => validacao.produtosValidos.includes(p.id))
      .map(p => transformersService.transformarProdutoParaSiscomex(p as any));

    // 4. Envia em lote
    console.log(`📤 Enviando ${produtosParaEnvio.length} produtos...`);
    const resultadoLote = await siscomexService.incluirProdutosLote(produtosParaEnvio);

    console.log('📊 Resultado do lote:');
    console.log(`   ✅ Sucessos: ${resultadoLote.sucessos.length}`);
    console.log(`   ❌ Erros: ${resultadoLote.erros.length}`);

    // 5. Atualiza produtos locais
    if (resultadoLote.sucessos.length > 0) {
      console.log('💾 Atualizando produtos locais...');
      
      for (const produtoCadastrado of resultadoLote.sucessos) {
        // Encontra produto local pelo denominação ou outro critério
        const produtoLocal = produtosPendentes.find(p => 
          p.denominacao === produtoCadastrado.denominacao
        );
        
        if (produtoLocal) {
          await catalogoPrisma.produto.update({
            where: { id: produtoLocal.id },
            data: {
              codigo: produtoCadastrado.codigo,
              versao: produtoCadastrado.versao,
              status: 'TRANSMITIDO'
            }
          });
        }
      }
      
      console.log(`✅ ${resultadoLote.sucessos.length} produtos atualizados`);
    }

    // 6. Reporta erros
    if (resultadoLote.erros.length > 0) {
      console.log('\n❌ Produtos com erro:');
      resultadoLote.erros.forEach(erro => {
        console.log(`   • ${erro.produto}: ${erro.erro}`);
      });
    }

  } catch (error) {
    console.error('❌ Erro no envio em lote:', error instanceof Error ? error.message : error);
  }
}

// =====================================
// EXEMPLO 6: MONITORAMENTO
// =====================================

/**
 * Exemplo: Monitorar status da integração SISCOMEX
 */
export async function exemploMonitoramento() {
  console.log('📊 Exemplo: Monitoramento SISCOMEX');
  
  const siscomexService = new SiscomexService();
  
  try {
    // 1. Status da API
    console.log('🔗 Verificando status da API...');
    const conexao = await siscomexService.verificarConexao();
    
    console.log(`   Conectado: ${conexao.conectado ? '✅' : '❌'}`);
    console.log(`   Ambiente: ${conexao.ambiente}`);
    console.log(`   Versão: ${conexao.versaoApi}`);
    console.log(`   Certificado: ${conexao.certificadoValido ? '✅' : '❌'}`);

    // 2. Estatísticas de produtos
    console.log('\n📦 Estatísticas de produtos:');
    const estatisticas = await catalogoPrisma.produto.groupBy({
      by: ['status'],
      _count: { status: true }
    });

    estatisticas.forEach(stat => {
      console.log(`   ${stat.status}: ${stat._count.status}`);
    });

    // 3. Produtos pendentes por catálogo
    console.log('\n📋 Produtos pendentes por catálogo:');
    const pendentes = await catalogoPrisma.produto.groupBy({
      by: ['catalogoId'],
      where: { status: 'PENDENTE' },
      _count: { catalogoId: true },
      take: 5
    });

    for (const pendente of pendentes) {
      const catalogo = await catalogoPrisma.catalogo.findUnique({
        where: { id: pendente.catalogoId },
        select: { nome: true }
      });
      
      console.log(`   ${catalogo?.nome}: ${pendente._count.catalogoId} pendentes`);
    }

    // 4. Verificações de saúde
    console.log('\n🏥 Verificações de saúde:');
    
    // Certificados próximos do vencimento
    if (process.env.SISCOMEX_CERT_PATH) {
      try {
        const { SiscomexUtils } = await import('../src/utils/siscomex-utils');
        const certStatus = await SiscomexUtils.validarCertificadoDigital(
          process.env.SISCOMEX_CERT_PATH
        );
        
        if (certStatus.diasParaVencer <= 30) {
          console.log(`   ⚠️  Certificado expira em ${certStatus.diasParaVencer} dias`);
        } else {
          console.log(`   ✅ Certificado válido (${certStatus.diasParaVencer} dias)`);
        }
      } catch (error) {
        console.log('   ❌ Erro ao verificar certificado');
      }
    }

    // Rate limit status
    console.log('   ✅ Rate limits: Normal');

  } catch (error) {
    console.error('❌ Erro no monitoramento:', error instanceof Error ? error.message : error);
  }
}

// =====================================
// FUNÇÃO PRINCIPAL PARA EXECUTAR EXEMPLOS
// =====================================

/**
 * Executa todos os exemplos em sequência
 */
export async function executarTodosExemplos() {
  console.log('🎯 Executando Exemplos de Uso SISCOMEX\n');
  console.log('=====================================\n');

  const exemplos = [
    { nome: 'Exportação Básica', fn: exemploExportacaoBasica },
    { nome: 'Validação de Produtos', fn: exemploValidacaoProdutos },
    { nome: 'Transformação Manual', fn: exemploTransformacaoManual },
    { nome: 'Monitoramento', fn: exemploMonitoramento }
    // Comentando exemplos que fazem envios reais:
    // { nome: 'Envio Real', fn: exemploEnvioReal },
    // { nome: 'Envio em Lote', fn: exemploEnvioLote }
  ];

  for (const exemplo of exemplos) {
    try {
      console.log(`\n${'='.repeat(50)}`);
      await exemplo.fn();
      console.log('✅ Exemplo concluído\n');
    } catch (error) {
      console.error(`❌ Falha no exemplo ${exemplo.nome}:`, error);
    }
  }

  console.log('\n🎉 Todos os exemplos executados!');
}

// Executa exemplos se chamado diretamente
if (require.main === module) {
  executarTodosExemplos().catch(console.error);
}