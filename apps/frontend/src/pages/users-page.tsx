import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button, Card, Input, Pagination, Select, Table } from '../components/ui';
import { useState } from 'react';

export function UsersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('OPERADOR');

  const { data } = useQuery({
    queryKey: ['users', page],
    queryFn: async () => (await api.get('/users', { params: { page, limit: 20 } })).data,
  });

  const mutation = useMutation({
    mutationFn: async () => api.post('/users', { name, email, password, role }),
    onSuccess: () => {
      setName(''); setEmail(''); setPassword('');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const rows: any[] = data?.data ?? [];
  const totalPages: number = data?.totalPages ?? 1;

  return (
    <div className="space-y-4"><h1 className="text-xl font-semibold">Usuários</h1>
      <Card className="grid gap-2 md:grid-cols-5"><Input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} /><Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} /><Input placeholder="Senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /><Select value={role} onChange={(e) => setRole(e.target.value)}><option>ADMIN</option><option>OPERADOR</option><option>AUDITOR</option><option>VISUALIZADOR</option></Select><Button onClick={() => mutation.mutate()}>Criar</Button></Card>
      <Card><Table><thead><tr><th>Nome</th><th>Email</th><th>Perfil</th><th>Ativo</th></tr></thead><tbody>{rows.map((u: any) => <tr key={u.id} className="border-t border-slate-100"><td>{u.name}</td><td>{u.email}</td><td>{u.role?.name}</td><td>{u.isActive ? 'Sim' : 'Não'}</td></tr>)}</tbody></Table><Pagination page={page} totalPages={totalPages} onPage={setPage} /></Card>
    </div>
  );
}
