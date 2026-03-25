import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Badge, Button, Card, Pagination, Table } from '../components/ui';
import { formatDateTime } from '../lib/utils';
import { useState } from 'react';

export function AlertsPage() {
  const [page, setPage] = useState(1);
  const [justifications, setJustifications] = useState<Record<string, string>>({});
  const [categoryChoices, setCategoryChoices] = useState<Record<string, 'CARRO' | 'CAMINHAO' | 'ONIBUS'>>({});
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['alerts', page],
    queryFn: async () => (await api.get('/alerts', { params: { page, limit: 20 } })).data,
  });
  const resolveMutation = useMutation({
    mutationFn: async (id: string) => api.patch(`/alerts/${id}/resolve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
    onError: (error: any) => {
      window.alert(error?.response?.data?.message ?? 'Falha ao resolver alerta');
    },
  });
  const decideMutation = useMutation({
    mutationFn: async (payload: { id: string; decision: 'ACEITAR' | 'NEGAR'; justification: string }) =>
      api.patch(`/alerts/${payload.id}/decision`, {
        decision: payload.decision,
        justification: payload.justification,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      setJustifications({});
    },
    onError: (error: any) => {
      window.alert(error?.response?.data?.message ?? 'Falha ao decidir alerta');
    },
  });
  const reclassifyMutation = useMutation({
    mutationFn: async (payload: { id: string; categoryType: 'CARRO' | 'CAMINHAO' | 'ONIBUS' }) =>
      api.patch(`/alerts/${payload.id}/reclassify-vehicle`, {
        categoryType: payload.categoryType,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      setCategoryChoices({});
    },
    onError: (error: any) => {
      window.alert(error?.response?.data?.message ?? 'Falha ao recategorizar veículo');
    },
  });

  const rows: any[] = data?.data ?? [];
  const totalPages: number = data?.totalPages ?? 1;
  const isManualDecisionStatus = (status?: string) => ['PENDENTE_VALIDACAO', 'SEM_SAIDA', 'INCONSISTENTE'].includes(status ?? '');
  const isCategoryReclassificationAlert = (item: any) =>
    item.type === 'INCONSISTENTE' && typeof item.message === 'string' && item.message.includes('Categoria OUTRO');
  const getAlertTypeLabel = (item: any) => {
    if (isCategoryReclassificationAlert(item)) {
      return 'RECATEGORIZACAO_VEICULO';
    }

    const labels: Record<string, string> = {
      SEM_SAIDA: 'SEM_SAIDA',
      CANCELADO: 'CANCELADO',
      ATENCAO_ROTA: 'ATENCAO_ROTA',
      INCONSISTENTE: 'INCONSISTENTE',
      LEITURA_BAIXA_CONFIANCA: 'BAIXA_CONFIANCA',
      FALHA_API: 'FALHA_API',
    };

    return labels[item.type] ?? item.type;
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Alertas</h1>
      <Card>
        <Table>
          <thead><tr><th>Data/hora</th><th>Tipo</th><th>Placa</th><th>Severidade</th><th>Mensagem</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((item: any) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td>{formatDateTime(item.createdAt)}</td>
                <td>{getAlertTypeLabel(item)}</td>
                <td>{item.plate}</td>
                <td><Badge>{item.severity}</Badge></td>
                <td>{item.message}</td>
                <td>
                  {item.isResolved ? (
                    'Resolvido'
                  ) : isCategoryReclassificationAlert(item) ? (
                    <div className="space-y-2">
                      <select
                        className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                        value={categoryChoices[item.id] ?? ''}
                        onChange={(e) => setCategoryChoices((prev) => ({ ...prev, [item.id]: e.target.value as 'CARRO' | 'CAMINHAO' | 'ONIBUS' }))}
                      >
                        <option value="">Selecionar tipo</option>
                        <option value="CARRO">Carro</option>
                        <option value="CAMINHAO">Caminhão</option>
                        <option value="ONIBUS">Ônibus</option>
                      </select>
                      <div className="flex gap-2">
                        <Button
                          disabled={!categoryChoices[item.id] || reclassifyMutation.isPending}
                          onClick={() => reclassifyMutation.mutate({ id: item.id, categoryType: categoryChoices[item.id] })}
                        >
                          Salvar categoria
                        </Button>
                        <Button
                          className="bg-slate-700 hover:bg-slate-600"
                          disabled={resolveMutation.isPending}
                          onClick={() => resolveMutation.mutate(item.id)}
                        >
                          Resolver sem alterar
                        </Button>
                      </div>
                    </div>
                  ) : isManualDecisionStatus(item.trip?.currentStatus) ? (
                    <div className="space-y-2">
                      <input
                        className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                        placeholder="Justificativa obrigatória"
                        value={justifications[item.id] ?? ''}
                        onChange={(e) => setJustifications((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      />
                      <div className="flex gap-2">
                        <Button
                          disabled={!justifications[item.id]?.trim() || decideMutation.isPending}
                          onClick={() => decideMutation.mutate({ id: item.id, decision: 'ACEITAR', justification: justifications[item.id].trim() })}
                        >
                          Validar viagem
                        </Button>
                        <Button
                          className="bg-slate-700 hover:bg-slate-600"
                          disabled={!justifications[item.id]?.trim() || decideMutation.isPending}
                          onClick={() => decideMutation.mutate({ id: item.id, decision: 'NEGAR', justification: justifications[item.id].trim() })}
                        >
                          Cancelar viagem
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button onClick={() => resolveMutation.mutate(item.id)}>Marcar resolvido</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={page} totalPages={totalPages} onPage={setPage} />
      </Card>
    </div>
  );
}
