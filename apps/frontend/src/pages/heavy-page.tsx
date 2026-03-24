import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button, Card, Input, Select, Table } from '../components/ui';
import { useState } from 'react';
import { formatDateTime } from '../lib/utils';

export function HeavyPage() {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [subtype, setSubtype] = useState('Caminhão pequeno');
  const { data } = useQuery({ queryKey: ['heavy-pending'], queryFn: async () => (await api.get('/heavy-checks/pending')).data });

  const mutation = useMutation({
    mutationFn: async (payload: any) => api.post('/heavy-checks', payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['heavy-pending'] }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Veículos pesados</h1>
      <Card>
        <Table>
          <thead><tr><th>Horário</th><th>Placa</th><th>Modelo</th><th>Local</th><th>Tipo</th><th>Subtipo</th><th>Ação</th></tr></thead>
          <tbody>
            {(data || []).map((item: any) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td>{formatDateTime(item.capturedAt)}</td>
                <td>{item.normalizedPlate}</td>
                <td>{item.vehicle?.model || '-'}</td>
                <td>{item.location?.name}</td>
                <td>{item.vehicle?.categoryType}</td>
                <td>
                  <Select value={subtype} onChange={(e) => setSubtype(e.target.value)}>
                    <option>Caminhão pequeno</option><option>Caminhão 3/4</option><option>Caminhão toco</option><option>Caminhão truck</option><option>Carreta</option><option>Bitrem</option><option>Rodotrem</option><option>Caminhão grande</option><option>Micro-ônibus</option><option>Ônibus urbano</option><option>Ônibus rodoviário</option><option>Ônibus fretado</option>
                  </Select>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observação" className="mt-1" />
                </td>
                <td>
                  <Button onClick={() => mutation.mutate({ vehicleId: item.vehicleId, readingId: item.id, subtype, notes })}>Checado</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
