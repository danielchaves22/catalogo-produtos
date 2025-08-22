// frontend/pages/operadores-estrangeiros/OperadorEstrangeiroCard.tsx (CORRIGIDO)
import React from 'react';
import { Globe, Mail, MapPin, Hash, Calendar, Edit, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { OperadorEstrangeiro } from '@/hooks/useOperadorEstrangeiro';
import { formatCEP } from '@/lib/validation';

interface OperadorEstrangeiroCardProps {
  operador: OperadorEstrangeiro;
  onEdit?: (operador: OperadorEstrangeiro) => void;
  onDelete?: (operador: OperadorEstrangeiro) => void;
  showActions?: boolean;
  compact?: boolean;
}

export function OperadorEstrangeiroCard({
  operador,
  onEdit,
  onDelete,
  showActions = false,
  compact = false
}: OperadorEstrangeiroCardProps) {
  
  function formatarData(dataString: string) {
    return new Date(dataString).toLocaleDateString('pt-BR');
  }

  function getSituacaoColor(situacao: string) {
    switch (situacao) {
      case 'ATIVO':
        return 'bg-green-900/50 text-green-400 border-green-700';
      case 'INATIVO':
        return 'bg-yellow-900/50 text-yellow-400 border-yellow-700';
      case 'DESATIVADO':
        return 'bg-red-900/50 text-red-400 border-red-700';
      default:
        return 'bg-gray-900/50 text-gray-400 border-gray-700';
    }
  }

  // NOVA FUNÇÃO: Formatar endereço completo
  function formatarEndereco(operador: OperadorEstrangeiro) {
    const partes = [];
    
    if (operador.logradouro) partes.push(operador.logradouro);
    if (operador.cidade) partes.push(operador.cidade);
    if (operador.subdivisao) partes.push(operador.subdivisao.nome);
    
    const endereco = partes.join(', ');
    const cep = operador.codigoPostal ? formatCEP(operador.codigoPostal) : null;
    
    return { endereco, cep };
  }

  if (compact) {
    return (
      <div className="p-3 bg-[#1a1f2b] rounded-lg border border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-medium text-white">{operador.nome}</h4>
          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getSituacaoColor(operador.situacao)}`}>
            {operador.situacao}
          </span>
        </div>
        
        <div className="text-sm text-gray-400 space-y-1">
          <div className="flex items-center gap-2">
            <Globe size={14} />
            <span>{operador.pais.nome}</span>
          </div>
          
          {operador.tin && (
            <div className="flex items-center gap-2">
              <Hash size={14} />
              <span className="font-mono">{operador.tin}</span>
            </div>
          )}
          
          {operador.cidade && (
            <div className="flex items-center gap-2">
              <MapPin size={14} />
              <span>{operador.cidade}</span>
              {/* CORRIGIDO: Mostrar CEP formatado */}
              {operador.codigoPostal && (
                <span className="text-xs bg-gray-700 px-2 py-1 rounded font-mono">
                  {formatCEP(operador.codigoPostal)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  const { endereco, cep } = formatarEndereco(operador);

  return (
    <Card className="hover:border-gray-600 transition-colors">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white mb-1">{operador.nome}</h3>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getSituacaoColor(operador.situacao)}`}>
              {operador.situacao}
            </span>
            <span className="text-sm text-gray-400">Versão {operador.versao}</span>
          </div>
        </div>
        
        {showActions && (
          <div className="flex gap-2">
            {onEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(operador)}
                className="flex items-center gap-1"
              >
                <Edit size={14} />
                Editar
              </Button>
            )}
            
            {onDelete && operador.situacao !== 'DESATIVADO' && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => onDelete(operador)}
                className="flex items-center gap-1"
              >
                <Trash2 size={14} />
                Desativar
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        {/* Informações básicas */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-gray-300">
            <Globe size={16} className="text-[#f59e0b]" />
            <div>
              <span className="font-medium">País:</span> {operador.pais.nome}
              <span className="ml-2 text-xs bg-gray-700 px-2 py-1 rounded">{operador.pais.sigla}</span>
            </div>
          </div>

          {operador.tin && (
            <div className="flex items-center gap-2 text-gray-300">
              <Hash size={16} className="text-[#f59e0b]" />
              <div>
                <span className="font-medium">TIN:</span> 
                <span className="ml-2 font-mono bg-gray-700 px-2 py-1 rounded text-xs">{operador.tin}</span>
              </div>
            </div>
          )}

          {operador.email && (
            <div className="flex items-center gap-2 text-gray-300">
              <Mail size={16} className="text-[#f59e0b]" />
              <div>
                <span className="font-medium">Email:</span> {operador.email}
              </div>
            </div>
          )}

          {operador.codigoInterno && (
            <div className="flex items-center gap-2 text-gray-300">
              <Hash size={16} className="text-[#f59e0b]" />
              <div>
                <span className="font-medium">Código Interno:</span> {operador.codigoInterno}
              </div>
            </div>
          )}
        </div>

        {/* Endereço */}
        <div className="space-y-3">
          {endereco && (
            <div className="flex items-start gap-2 text-gray-300">
              <MapPin size={16} className="text-[#f59e0b] mt-0.5" />
              <div>
                <span className="font-medium">Endereço:</span>
                <div className="text-sm">
                  <div>{endereco}</div>
                  {/* CORRIGIDO: CEP formatado */}
                  {cep && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-medium">CEP:</span>
                      <span className="font-mono bg-gray-700 px-2 py-1 rounded text-xs">{cep}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 text-gray-300">
            <Calendar size={16} className="text-[#f59e0b]" />
            <div>
              <span className="font-medium">Última Alteração:</span> {formatarData(operador.dataUltimaAlteracao)}
            </div>
          </div>

          {operador.codigo && (
            <div className="flex items-center gap-2 text-gray-300">
              <Hash size={16} className="text-[#f59e0b]" />
              <div>
                <span className="font-medium">Código SISCOMEX:</span> {operador.codigo}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Identificações Adicionais */}
      {operador.identificacoesAdicionais && operador.identificacoesAdicionais.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <h4 className="text-sm font-medium text-white mb-2">Identificações Adicionais</h4>
          <div className="space-y-2">
            {operador.identificacoesAdicionais.map((identificacao, index) => (
              <div key={index} className="flex items-center gap-2 text-sm text-gray-400">
                <span className="font-medium">{identificacao.agenciaEmissora.nome}:</span>
                <span className="font-mono bg-gray-700 px-2 py-1 rounded text-xs">
                  {identificacao.numero}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Informações do Sistema */}
      <div className="mt-4 pt-4 border-t border-gray-700">
        <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
          <div>
            <span className="font-medium">ID:</span> {operador.id}
          </div>
          <div>
            <span className="font-medium">CNPJ Responsável:</span> {operador.cnpjRaizResponsavel}
          </div>
          <div>
            <span className="font-medium">Inclusão:</span> {formatarData(operador.dataInclusao)}
          </div>
          <div>
            <span className="font-medium">Versão:</span> {operador.versao}
          </div>
        </div>
      </div>
    </Card>
  );
}