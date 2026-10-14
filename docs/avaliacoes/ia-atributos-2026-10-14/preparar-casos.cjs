const fs = require('fs');
const path = require('path');

const atributo = (codigo, nome, dominio, extra = {}) => ({
  codigo, nome, tipo: dominio ? 'LISTA_ESTATICA' : 'TEXTO', obrigatorio: false,
  multivalorado: false, validacoes: {},
  ...(dominio ? { dominio: Object.entries(dominio).map(([codigo, descricao]) => ({ codigo, descricao })) } : {}),
  ...extra
});
const numero = (codigo, nome) => atributo(codigo, nome, null, { tipo: 'NUMERO', validacoes: { casas_decimais: 3 } });
const multiplo = (codigo, nome, dominio) => atributo(codigo, nome, dominio, { multivalorado: true });
const caso = (id, nome, categoria, descricao, atributos, esperado, numericos = []) => ({
  id, nome, categoria, request: { descricao, atributos, modalidade: 'IMPORTACAO', maxTokensResposta: 800 },
  esperado, numericos
});

const casos = [
  caso('01', 'Camiseta de algodão', 'direto', 'Camiseta azul, composição 100% algodão. Tamanho M.', [
    atributo('MATERIAL', 'Material', { ALG: 'Algodão', POL: 'Poliéster', LA: 'Lã' }),
    atributo('COR', 'Cor', { AZ: 'Azul', PT: 'Preto', VM: 'Vermelho' }),
    atributo('TAMANHO', 'Tamanho', { P: 'Pequeno (P)', M: 'Médio (M)', G: 'Grande (G)' }),
    atributo('MARCA', 'Marca')
  ], { MATERIAL: 'ALG', COR: 'AZ', TAMANHO: 'M' }),
  caso('02', 'Tecido misto', 'multivalorado', 'Tecido composto por 60% algodão e 40% poliéster, nas cores branca e azul. Não contém elastano.', [
    multiplo('FIBRAS', 'Fibras da composição', { ALG: 'Algodão', POL: 'Poliéster', ELA: 'Elastano' }),
    multiplo('CORES', 'Cores', { BR: 'Branco', AZ: 'Azul', PT: 'Preto' }),
    numero('GRAMATURA', 'Gramatura em g/m²')
  ], { FIBRAS: ['ALG', 'POL'], CORES: ['BR', 'AZ'] }),
  caso('03', 'Motor elétrico', 'unidades', 'Motor elétrico monofásico, 220 V, 60 Hz e potência nominal de 1,5 kW. Rotação não informada.', [
    atributo('FASES', 'Número de fases', { MONO: 'Monofásico', TRI: 'Trifásico' }),
    numero('TENSAO', 'Tensão nominal em volts'), numero('FREQUENCIA', 'Frequência em hertz'),
    numero('POTENCIA', 'Potência nominal em watts'), numero('ROTACAO', 'Rotação em rpm')
  ], { FASES: 'MONO', TENSAO: 220, FREQUENCIA: 60, POTENCIA: 1500 }, ['TENSAO', 'FREQUENCIA', 'POTENCIA', 'ROTACAO']),
  caso('04', 'Parafuso inox', 'tecnico', 'Parafuso de aço inoxidável AISI 304, rosca métrica M6, comprimento de 20 mm e cabeça sextavada.', [
    atributo('MATERIAL', 'Material', { INOX304: 'Aço inoxidável AISI 304', INOX316: 'Aço inoxidável AISI 316', AC: 'Aço carbono' }),
    numero('DIAMETRO', 'Diâmetro nominal da rosca em mm'), numero('COMPRIMENTO', 'Comprimento em mm'),
    atributo('CABECA', 'Formato da cabeça', { SEX: 'Sextavada', PAN: 'Panela', ESC: 'Escareada' }),
    numero('PASSO', 'Passo da rosca em mm')
  ], { MATERIAL: 'INOX304', DIAMETRO: 6, COMPRIMENTO: 20, CABECA: 'SEX' }, ['DIAMETRO', 'COMPRIMENTO', 'PASSO']),
  caso('05', 'Flange sem classe de pressão', 'ausencia', 'Flange em aço carbono, diâmetro nominal DN 50. Classe de pressão e tipo de face não informados.', [
    atributo('MATERIAL', 'Material', { AC: 'Aço carbono', INOX: 'Aço inoxidável' }),
    numero('DN', 'Diâmetro nominal DN'),
    atributo('CLASSE', 'Classe de pressão', { C150: 'Classe 150', C300: 'Classe 300', C600: 'Classe 600' }, { obrigatorio: true }),
    atributo('FACE', 'Tipo de face', { RF: 'Ressalto (RF)', FF: 'Plana (FF)' })
  ], { MATERIAL: 'AC', DN: 50 }, ['DN']),
  caso('06', 'Bomba com materiais por componente', 'contexto', 'Bomba centrífuga com corpo em ferro fundido e rotor em bronze. Alimentação elétrica de 380 V.', [
    atributo('CORPO', 'Corpo da bomba', null, { tipo: 'COMPOSTO', subAtributos: [
      atributo('MAT_CORPO', 'Material', { FF: 'Ferro fundido', BR: 'Bronze', INOX: 'Aço inoxidável' }, { parentCodigo: 'CORPO' })
    ] }),
    atributo('ROTOR', 'Rotor da bomba', null, { tipo: 'COMPOSTO', subAtributos: [
      atributo('MAT_ROTOR', 'Material', { FF: 'Ferro fundido', BR: 'Bronze', INOX: 'Aço inoxidável' }, { parentCodigo: 'ROTOR' })
    ] }),
    numero('TENSAO', 'Tensão de alimentação em volts')
  ], { MAT_CORPO: 'FF', MAT_ROTOR: 'BR', TENSAO: 380 }, ['TENSAO']),
  caso('07', 'Sensor PT100', 'tecnico', 'Sensor de temperatura PT100, ligação a três fios, faixa de medição de -50 °C a +200 °C. Invólucro de aço inoxidável.', [
    atributo('TIPO', 'Tipo de sensor', { PT100: 'Termorresistência PT100', TCJ: 'Termopar tipo J', NTC: 'Termistor NTC' }),
    numero('FIOS', 'Número de fios'), numero('MIN', 'Temperatura mínima de medição em °C'),
    numero('MAX', 'Temperatura máxima de medição em °C'),
    atributo('MATERIAL', 'Material do invólucro', { INOX: 'Aço inoxidável', PL: 'Plástico' })
  ], { TIPO: 'PT100', FIOS: 3, MIN: -50, MAX: 200, MATERIAL: 'INOX' }, ['FIOS', 'MIN', 'MAX']),
  caso('08', 'Cabo de rede sem blindagem', 'negacao', 'Cabo de rede categoria 6, quatro pares, condutores de cobre puro (não é CCA), sem blindagem. Comprimento de 2 metros.', [
    atributo('CATEGORIA', 'Categoria', { CAT5E: 'Categoria 5e', CAT6: 'Categoria 6', CAT6A: 'Categoria 6A' }),
    atributo('CONDUTOR', 'Material do condutor', { CU: 'Cobre puro', CCA: 'Alumínio cobreado (CCA)' }),
    atributo('BLINDAGEM', 'Blindagem', { UTP: 'Sem blindagem (UTP)', FTP: 'Blindado com folha (FTP)' }),
    numero('PARES', 'Quantidade de pares'), numero('COMPRIMENTO', 'Comprimento em centímetros')
  ], { CATEGORIA: 'CAT6', CONDUTOR: 'CU', BLINDAGEM: 'UTP', PARES: 4, COMPRIMENTO: 200 }, ['PARES', 'COMPRIMENTO']),
  caso('09', 'Brinquedo manual', 'negacao', 'Carrinho de brinquedo de plástico, acionamento manual, sem motor e sem pilhas. Faixa etária e certificações não informadas.', [
    atributo('MATERIAL', 'Material', { PL: 'Plástico', MT: 'Metal', MD: 'Madeira' }),
    atributo('ACIONAMENTO', 'Acionamento', { MAN: 'Manual', ELE: 'Elétrico' }),
    atributo('PILHAS', 'Utiliza pilhas', { S: 'Sim', N: 'Não' }),
    atributo('FAIXA', 'Faixa etária', { A3: 'Acima de 3 anos', A6: 'Acima de 6 anos' }, { obrigatorio: true }),
    atributo('CERTIFICACAO', 'Certificação')
  ], { MATERIAL: 'PL', ACIONAMENTO: 'MAN', PILHAS: 'N' }),
  caso('10', 'Modelo Azul de cor preta', 'contexto', 'Camiseta da marca Horizonte, modelo Azul, na cor preta. A palavra Azul é o nome do modelo. Composição não informada.', [
    atributo('MARCA', 'Marca'), atributo('MODELO', 'Modelo'),
    atributo('COR', 'Cor', { AZ: 'Azul', PT: 'Preto', BR: 'Branco' }),
    atributo('MATERIAL', 'Material', { ALG: 'Algodão', POL: 'Poliéster' })
  ], { MARCA: 'Horizonte', MODELO: 'Azul', COR: 'PT' }),
  caso('11', 'Óleo ISO VG 46', 'tecnico', 'Óleo hidráulico de base mineral, classificação ISO VG 46. A viscosidade cinemática medida a 40 °C não foi informada.', [
    atributo('BASE', 'Base do óleo', { MIN: 'Mineral', SIN: 'Sintética', VEG: 'Vegetal' }),
    atributo('GRAU', 'Grau de viscosidade ISO VG', { VG32: 'ISO VG 32', VG46: 'ISO VG 46', VG68: 'ISO VG 68' }),
    numero('VISCOSIDADE', 'Viscosidade cinemática medida a 40 °C em mm²/s')
  ], { BASE: 'MIN', GRAU: 'VG46' }, ['VISCOSIDADE']),
  caso('12', 'Monitor sem tecnologia de painel informada', 'ausencia', 'Monitor de 23,8 polegadas, resolução 1920 x 1080, retroiluminação LED, sem tela sensível ao toque. Tecnologia do painel não informada.', [
    numero('DIAGONAL', 'Diagonal em polegadas'),
    atributo('RESOLUCAO', 'Resolução', { FHD: '1920 x 1080 (Full HD)', QHD: '2560 x 1440', UHD: '3840 x 2160' }),
    atributo('LUZ', 'Retroiluminação', { LED: 'LED', CCFL: 'CCFL' }),
    atributo('TOQUE', 'Tela sensível ao toque', { S: 'Sim', N: 'Não' }),
    atributo('PAINEL', 'Tecnologia do painel', { IPS: 'IPS', TN: 'TN', VA: 'VA' })
  ], { DIAGONAL: 23.8, RESOLUCAO: 'FHD', LUZ: 'LED', TOQUE: 'N' }, ['DIAGONAL']),
  caso('13', 'Caneca com cor fora do domínio', 'fora_dominio', 'Caneca de cerâmica com capacidade de 0,35 litro. Cor turquesa; não é azul, vermelha nem branca.', [
    atributo('MATERIAL', 'Material', { CER: 'Cerâmica', VID: 'Vidro', PL: 'Plástico' }),
    numero('CAPACIDADE', 'Capacidade em mililitros'),
    atributo('COR', 'Cor', { AZ: 'Azul', VM: 'Vermelho', BR: 'Branco' }, { obrigatorio: true })
  ], { MATERIAL: 'CER', CAPACIDADE: 350 }, ['CAPACIDADE']),
  caso('14', 'Bateria LiFePO4', 'tecnico', 'Bateria recarregável de fosfato de ferro-lítio (LiFePO4), tensão nominal de 12,8 V e capacidade de 100 Ah. Peso e quantidade de células não informados.', [
    atributo('QUIMICA', 'Composição química', { LFP: 'Fosfato de ferro-lítio (LiFePO4)', NMC: 'Níquel-manganês-cobalto', PB: 'Chumbo-ácido' }),
    numero('TENSAO', 'Tensão nominal em volts'), numero('CAPACIDADE', 'Capacidade em Ah'),
    numero('CELULAS', 'Quantidade de células'), numero('PESO', 'Peso em kg')
  ], { QUIMICA: 'LFP', TENSAO: 12.8, CAPACIDADE: 100 }, ['TENSAO', 'CAPACIDADE', 'CELULAS', 'PESO']),
  caso('15', 'Jogo de chaves', 'multivalorado', 'Jogo com três chaves de boca de 8, 10 e 12 mm, fabricadas em aço cromo-vanádio e acabamento cromado. Não inclui chave de 13 mm.', [
    multiplo('MEDIDAS', 'Medidas das chaves em mm', { M8: '8 mm', M10: '10 mm', M12: '12 mm', M13: '13 mm' }),
    atributo('MATERIAL', 'Material', { CRV: 'Aço cromo-vanádio', AC: 'Aço carbono', INOX: 'Aço inoxidável' }),
    atributo('ACABAMENTO', 'Acabamento', { CR: 'Cromado', OX: 'Oxidado', NAT: 'Natural' }),
    numero('QUANTIDADE', 'Quantidade de chaves no jogo')
  ], { MEDIDAS: ['M8', 'M10', 'M12'], MATERIAL: 'CRV', ACABAMENTO: 'CR', QUANTIDADE: 3 }, ['QUANTIDADE']),
  caso('16', 'Válvula: pressão de ensaio versus nominal', 'contexto', 'Válvula de esfera em latão, acionamento manual, DN 25. Pressão de ensaio: 25 bar. A pressão nominal de trabalho não foi informada.', [
    atributo('MATERIAL', 'Material', { LT: 'Latão', INOX: 'Aço inoxidável', PVC: 'PVC' }),
    atributo('ACIONAMENTO', 'Acionamento', { MAN: 'Manual', ELE: 'Elétrico', PNE: 'Pneumático' }),
    numero('DN', 'Diâmetro nominal DN'), numero('ENSAIO', 'Pressão de ensaio em bar'),
    atributo('PN', 'Pressão nominal de trabalho', { PN10: '10 bar', PN16: '16 bar', PN25: '25 bar' })
  ], { MATERIAL: 'LT', ACIONAMENTO: 'MAN', DN: 25, ENSAIO: 25 }, ['DN', 'ENSAIO'])
];

const fixture = {
  criadoEm: new Date().toISOString(),
  natureza: 'Produtos e códigos de atributos fictícios; não são registros nem códigos oficiais do SISCOMEX.',
  criterio: 'Gabarito definido antes da execução. Chaves não presentes no gabarito devem ser omitidas. Números aceitam string ou número e vírgula decimal; arrays são comparados como conjuntos sem ignorar duplicatas. Texto livre normaliza espaços, caixa e Unicode; códigos de domínio são exatos.',
  casos
};
const destination = path.join(__dirname, 'casos.json');
if (fs.existsSync(destination)) throw new Error('casos.json já existe; o gabarito não será sobrescrito.');
fs.writeFileSync(destination, JSON.stringify(fixture, null, 2) + '\n');
console.log(JSON.stringify({ casos: casos.length, atributosEsperados: casos.reduce((n, c) => n + Object.keys(c.esperado).length, 0) }));
