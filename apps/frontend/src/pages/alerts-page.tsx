import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Badge, Button, Card, Pagination, Table } from '../components/ui';
import { formatDateTime } from '../lib/utils';
import { useState } from 'react';

export function AlertsPage() {
  const [page, setPage] = useState(1);
  const [justifications, setJustifications] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['alerts', page],
    queryFn: async () => (await api.get('/alerts', { params: { page, limit: 20 } })).data,
  });
  const resolveMutation = useMutation({
    mutationFn: async (id: string) => api.patch(`/alerts/${id}/resolve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
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
  });

  const rows: any[] = data?.data ?? [];
  const totalPages: number = data?.totalPages ?? 1;

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
                <td>{item.type}</td>
                <td>{item.plate}</td>
                <td><Badge>{item.severity}</Badge></td>
                <td>{item.message}</td>
                <td>
                  {item.isResolved ? (
                    'Resolvido'
                  ) : item.trip?.currentStatus === 'PENDENTE_VALIDACAO' ? (
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
                          Aceitar
                        </Button>
                        <Button
                          className="bg-slate-700 hover:bg-slate-600"
                          disabled={!justifications[item.id]?.trim() || decideMutation.isPending}
                          onClick={() => decideMutation.mutate({ id: item.id, decision: 'NEGAR', justification: justifications[item.id].trim() })}
                        >
                          Negar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button onClick={() => resolveMutation.mutate(item.id)}>Resolver</Button>
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
