import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button, Card, Select, Table } from '../components/ui';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

type LocationItem = { id: string; name: string };
type RouteRuleItem = {
  id: string;
  originLocal?: { name?: string };
  destinationLocal?: { name?: string };
  resultType: string;
  severity: string;
  active: boolean;
};

function toRows<T>(payload: any): T[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

export function RouteRulesPage() {
  const { canAccess } = useAuth();
  const canCreate = canAccess('REGRAS_ROTA', 'create');
  const canEdit = canAccess('REGRAS_ROTA', 'edit');
  const canDeactivate = canAccess('REGRAS_ROTA', 'deactivate');
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [originLocalId, setOriginLocalId] = useState('');
  const [destinationLocalId, setDestinationLocalId] = useState('');
  const [resultType, setResultType] = useState('CONCLUIDO_OK');
  const [severity, setSeverity] = useState('BAIXA');
  const [active, setActive] = useState(true);

  const { data } = useQuery({ queryKey: ['route-rules'], queryFn: async () => (await api.get('/route-rules')).data });
  const { data: locations } = useQuery({ queryKey: ['locations'], queryFn: async () => (await api.get('/locations')).data });

  const ruleRows = toRows<RouteRuleItem>(data);
  const locationRows = toRows<LocationItem>(locations);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingId) {
        return api.patch(`/route-rules/${editingId}`, { originLocalId, destinationLocalId, resultType, severity, active });
      }
      return api.post('/route-rules', { originLocalId, destinationLocalId, resultType, severity, active });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['route-rules'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/route-rules/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['route-rules'] }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Regras de rota</h1>
      {(canCreate || canEdit) && (
        <Card className="grid gap-2 md:grid-cols-6">
          <Select value={originLocalId} onChange={(e) => setOriginLocalId(e.target.value)}>
            <option value="">Origem</option>
            {locationRows.map((loc) => <option value={loc.id} key={loc.id}>{loc.name}</option>)}
          </Select>
          <Select value={destinationLocalId} onChange={(e) => setDestinationLocalId(e.target.value)}>
            <option value="">Destino</option>
            {locationRows.map((loc) => <option value={loc.id} key={loc.id}>{loc.name}</option>)}
          </Select>
          <Select value={resultType} onChange={(e) => setResultType(e.target.value)}>
            <option>CONCLUIDO_OK</option>
            <option>CONCLUIDO_ATENCAO</option>
            <option>CANCELADO</option>
            <option>INCONSISTENTE</option>
            <option>PENDENTE_VALIDACAO</option>
          </Select>
          <Select value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option>BAIXA</option>
            <option>MEDIA</option>
            <option>ALTA</option>
            <option>CRITICA</option>
          </Select>
          <Select value={active ? 'true' : 'false'} onChange={(e) => setActive(e.target.value === 'true')}>
            <option value="true">Ativa</option>
            <option value="false">Inativa</option>
          </Select>
          <div className="flex gap-2">
            <Button disabled={editingId ? !canEdit : !canCreate} onClick={() => saveMutation.mutate()}>{editingId ? 'Salvar' : 'Criar'}</Button>
            {editingId && (
              <Button
                className="bg-slate-500 hover:bg-slate-600"
                onClick={() => {
                  setEditingId(null);
                  setOriginLocalId('');
                  setDestinationLocalId('');
                  setResultType('CONCLUIDO_OK');
                  setSeverity('BAIXA');
                  setActive(true);
                }}
              >
                Cancelar
              </Button>
            )}
          </div>
        </Card>
      )}
      <Card>
        <Table>
          <thead>
            <tr>
              <th>Origem</th>
              <th>Destino</th>
              <th>Resultado</th>
              <th>Severidade</th>
              <th>Ativa</th>
              {(canEdit || canDeactivate) && <th>Ações</th>}
            </tr>
          </thead>
          <tbody>
            {ruleRows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td>{r.originLocal?.name}</td>
                <td>{r.destinationLocal?.name}</td>
                <td>{r.resultType}</td>
                <td>{r.severity}</td>
                <td>{r.active ? 'Sim' : 'Não'}</td>
                {(canEdit || canDeactivate) && (
                  <td className="flex gap-2 py-2">
                    {canEdit && (
                      <Button
                        className="h-8 bg-slate-700 px-2 text-xs hover:bg-slate-600"
                        onClick={() => {
                          setEditingId(r.id);
                          setOriginLocalId((r as any).originLocalId ?? '');
                          setDestinationLocalId((r as any).destinationLocalId ?? '');
                          setResultType(r.resultType);
                          setSeverity(r.severity);
                          setActive(Boolean(r.active));
                        }}
                      >
                        Editar
                      </Button>
                    )}
                    {canDeactivate && (
                      <Button
                        className="h-8 bg-slate-500 px-2 text-xs hover:bg-slate-600"
                        onClick={() => {
                          if (window.confirm('Deseja desativar esta regra de rota?')) {
                            deleteMutation.mutate(r.id);
                          }
                        }}
                      >
                        Excluir
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
