import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button, Card, Input, Pagination, Table } from '../components/ui';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export function LocationsPage() {
  const { canAccess } = useAuth();
  const canCreate = canAccess('LOCAIS', 'create');
  const canEdit = canAccess('LOCAIS', 'edit');
  const canDeactivate = canAccess('LOCAIS', 'deactivate');
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [active, setActive] = useState(true);

  const { data } = useQuery({
    queryKey: ['locations', page],
    queryFn: async () => (await api.get('/locations', { params: { page, limit: 20 } })).data,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingId) {
        return api.patch(`/locations/${editingId}`, { name, code, active });
      }
      return api.post('/locations', { name, code, active });
    },
    onSuccess: () => {
      setName('');
      setCode('');
      setActive(true);
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/locations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
  });

  const rows: any[] = data?.data ?? [];
  const totalPages: number = data?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Locais</h1>

      {(canCreate || canEdit) && (
        <Card className="flex flex-wrap gap-2">
          <Input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Código" value={code} onChange={(e) => setCode(e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Ativo
          </label>
          <Button disabled={editingId ? !canEdit : !canCreate} onClick={() => saveMutation.mutate()}>{editingId ? 'Salvar' : 'Criar'}</Button>
          {editingId && (
            <Button
              className="bg-slate-500 hover:bg-slate-600"
              onClick={() => {
                setEditingId(null);
                setName('');
                setCode('');
                setActive(true);
              }}
            >
              Cancelar
            </Button>
          )}
        </Card>
      )}

      <Card>
        <Table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Código</th>
              <th>Ativo</th>
              {(canEdit || canDeactivate) && <th>Ações</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((l: any) => (
              <tr key={l.id} className="border-t border-slate-100">
                <td>{l.name}</td>
                <td>{l.code}</td>
                <td>{l.active ? 'Sim' : 'Não'}</td>
                {(canEdit || canDeactivate) && (
                  <td className="flex gap-2 py-2">
                    {canEdit && (
                      <Button
                        className="h-8 bg-slate-700 px-2 text-xs hover:bg-slate-600"
                        onClick={() => {
                          setEditingId(l.id);
                          setName(l.name ?? '');
                          setCode(l.code ?? '');
                          setActive(Boolean(l.active));
                        }}
                      >
                        Editar
                      </Button>
                    )}
                    {canDeactivate && (
                      <Button
                        className="h-8 bg-slate-500 px-2 text-xs hover:bg-slate-600"
                        onClick={() => {
                          if (window.confirm('Deseja desativar este local?')) {
                            deleteMutation.mutate(l.id);
                          }
                        }}
                      >
                        Excluir
                      </Button>
                    )}
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
