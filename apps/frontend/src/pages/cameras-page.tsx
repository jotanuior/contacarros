import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button, Card, Input, Pagination, Select, Table } from '../components/ui';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export function CamerasPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [locationId, setLocationId] = useState('');
  const [active, setActive] = useState(true);

  const { data } = useQuery({
    queryKey: ['cameras', page],
    queryFn: async () => (await api.get('/cameras', { params: { page, limit: 20 } })).data,
  });
  const { data: locations } = useQuery({
    queryKey: ['locations', 'select'],
    queryFn: async () => (await api.get('/locations', { params: { page: 1, limit: 200 } })).data,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingId) {
        return api.patch(`/cameras/${editingId}`, { name, code, locationId, active });
      }
      return api.post('/cameras', { name, code, locationId, active });
    },
    onSuccess: () => {
      setName('');
      setCode('');
      setLocationId('');
      setActive(true);
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ['cameras'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/cameras/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cameras'] });
    },
  });

  const rows: any[] = data?.data ?? [];
  const totalPages: number = data?.totalPages ?? 1;
  const locationRows: any[] = locations?.data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Câmeras</h1>

      {isAdmin && (
        <Card className="grid gap-2 md:grid-cols-5">
          <Input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Código" value={code} onChange={(e) => setCode(e.target.value)} />
          <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">Selecione o local</option>
            {locationRows.map((loc: any) => (
              <option value={loc.id} key={loc.id}>{loc.name}</option>
            ))}
          </Select>
          <Select value={active ? 'true' : 'false'} onChange={(e) => setActive(e.target.value === 'true')}>
            <option value="true">Ativa</option>
            <option value="false">Inativa</option>
          </Select>
          <div className="flex gap-2">
            <Button onClick={() => saveMutation.mutate()}>{editingId ? 'Salvar' : 'Criar'}</Button>
            {editingId && (
              <Button
                className="bg-slate-500 hover:bg-slate-600"
                onClick={() => {
                  setEditingId(null);
                  setName('');
                  setCode('');
                  setLocationId('');
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
              <th>Nome</th>
              <th>Código</th>
              <th>Local</th>
              <th>Ativo</th>
              {isAdmin && <th>Ações</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((c: any) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td>{c.name}</td>
                <td>{c.code}</td>
                <td>{c.location?.name}</td>
                <td>{c.active ? 'Sim' : 'Não'}</td>
                {isAdmin && (
                  <td className="flex gap-2 py-2">
                    <Button
                      className="h-8 bg-slate-700 px-2 text-xs hover:bg-slate-600"
                      onClick={() => {
                        setEditingId(c.id);
                        setName(c.name ?? '');
                        setCode(c.code ?? '');
                        setLocationId(c.locationId ?? '');
                        setActive(Boolean(c.active));
                      }}
                    >
                      Editar
                    </Button>
                    <Button
                      className="h-8 bg-slate-500 px-2 text-xs hover:bg-slate-600"
                      onClick={() => {
                        if (window.confirm('Deseja desativar esta câmera?')) {
                          deleteMutation.mutate(c.id);
                        }
                      }}
                    >
                      Excluir
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={page} totalPages={totalPages} onPage={setPage} />
      </Card>
    </div>
  );
}
