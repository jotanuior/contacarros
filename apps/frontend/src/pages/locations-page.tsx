import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button, Card, Input, Pagination, Table } from '../components/ui';
import { useState } from 'react';

export function LocationsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const { data } = useQuery({
    queryKey: ['locations', page],
    queryFn: async () => (await api.get('/locations', { params: { page, limit: 20 } })).data,
  });

  const mutation = useMutation({
    mutationFn: async () => api.post('/locations', { name, code }),
    onSuccess: () => {
      setName('');
      setCode('');
      queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
  });

  const rows: any[] = data?.data ?? [];
  const totalPages: number = data?.totalPages ?? 1;

  return (
    <div className="space-y-4"><h1 className="text-xl font-semibold">Locais</h1>
      <Card className="flex gap-2"><Input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} /><Input placeholder="Código" value={code} onChange={(e) => setCode(e.target.value)} /><Button onClick={() => mutation.mutate()}>Criar</Button></Card>
      <Card><Table><thead><tr><th>Nome</th><th>Código</th><th>Ativo</th></tr></thead><tbody>{rows.map((l: any) => <tr key={l.id} className="border-t border-slate-100"><td>{l.name}</td><td>{l.code}</td><td>{l.active ? 'Sim' : 'Não'}</td></tr>)}</tbody></Table><Pagination page={page} totalPages={totalPages} onPage={setPage} /></Card>
    </div>
  );
}
