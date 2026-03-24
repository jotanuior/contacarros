import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button, Card, Input, Pagination, Select, Table } from '../components/ui';
import { useState } from 'react';

export function CamerasPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [locationId, setLocationId] = useState('');

  const { data } = useQuery({
    queryKey: ['cameras', page],
    queryFn: async () => (await api.get('/cameras', { params: { page, limit: 20 } })).data,
  });
  const { data: locations } = useQuery({
    queryKey: ['locations', 'select'],
    queryFn: async () => (await api.get('/locations', { params: { page: 1, limit: 200 } })).data,
  });

  const mutation = useMutation({
    mutationFn: async () => api.post('/cameras', { name, code, locationId }),
    onSuccess: () => {
      setName('');
      setCode('');
      queryClient.invalidateQueries({ queryKey: ['cameras'] });
    },
  });

  const rows: any[] = data?.data ?? [];
  const totalPages: number = data?.totalPages ?? 1;
  const locationRows: any[] = locations?.data ?? [];

  return (
    <div className="space-y-4"><h1 className="text-xl font-semibold">Câmeras</h1>
      <Card className="grid gap-2 md:grid-cols-4"><Input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} /><Input placeholder="Código" value={code} onChange={(e) => setCode(e.target.value)} /><Select value={locationId} onChange={(e) => setLocationId(e.target.value)}><option value="">Selecione o local</option>{locationRows.map((loc: any) => <option value={loc.id} key={loc.id}>{loc.name}</option>)}</Select><Button onClick={() => mutation.mutate()}>Criar</Button></Card>
      <Card><Table><thead><tr><th>Nome</th><th>Código</th><th>Local</th><th>Ativo</th></tr></thead><tbody>{rows.map((c: any) => <tr key={c.id} className="border-t border-slate-100"><td>{c.name}</td><td>{c.code}</td><td>{c.location?.name}</td><td>{c.active ? 'Sim' : 'Não'}</td></tr>)}</tbody></Table><Pagination page={page} totalPages={totalPages} onPage={setPage} /></Card>
    </div>
  );
}
