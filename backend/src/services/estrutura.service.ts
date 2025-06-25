import { EstruturaNcm, estruturasNcm } from '../data/estruturas-ncm';

export class EstruturaService {
  obterPorNcm(ncm: string): EstruturaNcm | null {
    return estruturasNcm.find(e => e.ncm === ncm) || null;
  }
}
