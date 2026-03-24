import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Badge, Card, Input, Pagination, Table } from '../components/ui';
import { useState } from 'react';
import { formatDateTime } from '../lib/utils';

function toDateTimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function ReadingsPage() {
  const [plate, setPlate] = useState('');
  const [page, setPage] = useState(1);
  const [to, setTo] = useState(() => toDateTimeLocal(new Date()));
  const [from, setFrom] = useState(() => toDateTimeLocal(new Date(Date.now() - 24 * 60 * 60 * 1000)));

  const { data, isLoading } = useQuery({
    queryKey: ['readings', plate, from, to, page],
    queryFn: async () =>
      (
        await api.get('/lpr/readings', {
          params: {
            plate: plate || undefined,
            from: from ? new Date(from).toISOString() : undefined,
            to: to ? new Date(to).toISOString() : undefined,
            page,
            limit: 20,
          },
        })
      ).data,
  });

  const rows: any[] = data?.data ?? [];
  const totalPages: number = data?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Leituras</h1>
      <Card className="flex gap-2">
        <Input placeholder="Filtrar placa" value={plate} onChange={(e) => { setPlate(e.target.value); setPage(1); }} />
        <Input type="datetime-local" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        <Input type="datetime-local" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
      </Card>
      <Card>
        {isLoading ? <p>Carregando...</p> : (
          <>
            <Table>
              <thead><tr><th>Data/hora</th><th>Placa</th><th>Marca/Modelo</th><th>Tipo</th><th>Local</th><th>Câmera</th><th>Confiança</th><th>Duplicada</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((item: any) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td>{formatDateTime(item.capturedAt)}</td>
                    <td>{item.normalizedPlate}</td>
                    <td>{`${item.vehicle?.brand || '-'} ${item.vehicle?.model || ''}`}</td>
                    <td>{item.vehicle?.categoryType || '-'}</td>
                    <td>{item.location?.name}</td>
                    <td>{item.camera?.name}</td>
                    <td>{item.confidence ?? '-'}</td>
                    <td>{item.isDuplicate ? <Badge className="bg-amber-100 text-amber-700">Sim</Badge> : 'Não'}</td>
                    <td>{item.processingStatus}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} totalPages={totalPages} onPage={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
