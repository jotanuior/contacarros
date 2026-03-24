import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button, Card, Input, Table } from '../components/ui';
import { useState } from 'react';

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');

  const { data } = useQuery({ queryKey: ['settings'], queryFn: async () => (await api.get('/settings')).data });

  const mutation = useMutation({
    mutationFn: async () => api.post('/settings', { key, value }),
    onSuccess: () => {
      setKey(''); setValue('');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  return (
    <div className="space-y-4"><h1 className="text-xl font-semibold">Configurações</h1>
      <Card className="flex gap-2"><Input placeholder="Chave" value={key} onChange={(e) => setKey(e.target.value)} /><Input placeholder="Valor" value={value} onChange={(e) => setValue(e.target.value)} /><Button onClick={() => mutation.mutate()}>Salvar</Button></Card>
      <Card><Table><thead><tr><th>Chave</th><th>Valor</th><th>Descrição</th></tr></thead><tbody>{(data || []).map((item: any) => <tr key={item.id} className="border-t border-slate-100"><td>{item.key}</td><td>{item.value}</td><td>{item.description || '-'}</td></tr>)}</tbody></Table></Card>
    </div>
  );
}
