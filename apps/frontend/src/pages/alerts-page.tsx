import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Badge, Button, Card, Pagination, Table } from '../components/ui';
import { formatDateTime } from '../lib/utils';
import { useState } from 'react';

export function AlertsPage() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['alerts', page],
    queryFn: async () => (await api.get('/alerts', { params: { page, limit: 20 } })).data,
  });
  const resolveMutation = useMutation({
    mutationFn: async (id: string) => api.patch(`/alerts/${id}/resolve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
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
                <td>{item.isResolved ? 'Resolvido' : <Button onClick={() => resolveMutation.mutate(item.id)}>Resolver</Button>}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={page} totalPages={totalPages} onPage={setPage} />
      </Card>
    </div>
  );
}
