#!/usr/bin/env python3
"""Utilitário simples para converter a primeira planilha de um arquivo XLSX em uma matriz JSON."""
import json
import sys
import zipfile
import xml.etree.ElementTree as ET
from typing import Dict, List

NAMESPACE = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def _coluna_para_indice(ref: str) -> int:
    colunas = ''.join(ch for ch in ref if ch.isalpha())
    indice = 0
    for ch in colunas:
        indice = indice * 26 + (ord(ch.upper()) - ord('A') + 1)
    return indice - 1 if indice > 0 else 0


def _ler_shared_strings(arquivo_zip: zipfile.ZipFile) -> List[str]:
    if 'xl/sharedStrings.xml' not in arquivo_zip.namelist():
        return []
    conteudo = arquivo_zip.read('xl/sharedStrings.xml')
    raiz = ET.fromstring(conteudo)
    valores: List[str] = []
    for si in raiz.findall('s:si', NAMESPACE):
        texto = ''.join(t.text or '' for t in si.findall('.//s:t', NAMESPACE))
        valores.append(texto)
    return valores


def _resolver_valor(celula: ET.Element, shared_strings: List[str]) -> str:
    tipo = celula.get('t')
    if tipo == 'inlineStr':
        texto = celula.find('s:is/s:t', NAMESPACE)
        return (texto.text or '') if texto is not None else ''

    valor = celula.find('s:v', NAMESPACE)
    if valor is None or valor.text is None:
        return ''

    if tipo == 's':
        indice = int(valor.text)
        if 0 <= indice < len(shared_strings):
            return shared_strings[indice]
        return ''

    return valor.text


def _selecionar_planilha(arquivo_zip: zipfile.ZipFile) -> str:
    for nome in arquivo_zip.namelist():
        if nome.startswith('xl/worksheets/sheet') and nome.endswith('.xml'):
            return nome
    raise ValueError('Não foi possível localizar uma planilha válida no arquivo enviado')


def ler_planilha(caminho_arquivo: str) -> List[List[str]]:
    with zipfile.ZipFile(caminho_arquivo, 'r') as arquivo_zip:
        shared_strings = _ler_shared_strings(arquivo_zip)
        planilha = _selecionar_planilha(arquivo_zip)
        dados = arquivo_zip.read(planilha)
        raiz = ET.fromstring(dados)
        sheet_data = raiz.find('s:sheetData', NAMESPACE)
        if sheet_data is None:
            return []

        linhas: List[List[str]] = []
        for linha in sheet_data.findall('s:row', NAMESPACE):
            valores: Dict[int, str] = {}
            for celula in linha.findall('s:c', NAMESPACE):
                referencia = celula.get('r') or ''
                indice = _coluna_para_indice(referencia)
                valores[indice] = _resolver_valor(celula, shared_strings)

            if valores:
                tamanho = max(valores.keys()) + 1
                linha_formatada = [''] * tamanho
                for indice, valor in valores.items():
                    linha_formatada[indice] = valor
            else:
                linha_formatada = []
            linhas.append(linha_formatada)
        return linhas


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit('Uso: parse_excel.py <arquivo.xlsx>')

    caminho = sys.argv[1]
    try:
        linhas = ler_planilha(caminho)
    except Exception as erro:  # pragma: no cover - captura genérica para retorno ao Node
        sys.stderr.write(str(erro))
        raise
    sys.stdout.write(json.dumps(linhas, ensure_ascii=False))


if __name__ == '__main__':
    main()
