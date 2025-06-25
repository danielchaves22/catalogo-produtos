import { EstruturaService } from './estrutura.service';
import { EstruturaNcm } from '../data/estruturas-ncm';

export interface Produto {
  id: number;
  codigo: string;
  ncmCodigo: string;
  valoresAtributos: Record<string, any>;
  estruturaSnapshot: EstruturaNcm;
}

interface CriarProdutoDTO {
  codigo: string;
  ncmCodigo: string;
  valoresAtributos: Record<string, any>;
}

export class ProdutoService {
  private produtos: Produto[] = [];
  private seq = 1;
  private estruturaService = new EstruturaService();

  listar(): Produto[] {
    return this.produtos;
  }

  criar(data: CriarProdutoDTO): Produto {
    const estrutura = this.estruturaService.obterPorNcm(data.ncmCodigo);
    if (!estrutura) {
      throw new Error('Estrutura não encontrada para o NCM informado');
    }

    const produto: Produto = {
      id: this.seq++,
      codigo: data.codigo,
      ncmCodigo: data.ncmCodigo,
      valoresAtributos: data.valoresAtributos,
      estruturaSnapshot: estrutura
    };

    this.produtos.push(produto);
    return produto;
  }
}
