import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button, Card, Input, Pagination, Select, Table } from '../components/ui';
import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export function UsersPage() {
  const { canAccess } = useAuth();
  const canCreate = canAccess('USUARIOS', 'create');
  const canEdit = canAccess('USUARIOS', 'edit');
  const canDeactivate = canAccess('USUARIOS', 'deactivate');
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('OPERADOR');
  const [isActive, setIsActive] = useState(true);

  const { data } = useQuery({
    queryKey: ['users', page],
    queryFn: async () => (await api.get('/users', { params: { page, limit: 20 } })).data,
  });
  const { data: rolesData } = useQuery({
    queryKey: ['roles', 'active-select'],
    queryFn: async () => (await api.get('/roles/assignable')).data,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingId) {
        return api.patch(`/users/${editingId}`, { name, role, isActive });
      }
      return api.post('/users', { name, email, password, role });
    },
    onSuccess: () => {
      setName('');
      setEmail('');
      setPassword('');
      setRole('OPERADOR');
      setIsActive(true);
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async ({ id, newPassword }: { id: string; newPassword: string }) =>
      api.patch(`/users/${id}/password`, { newPassword }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => api.patch(`/users/${id}/deactivate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const rows: any[] = data?.data ?? [];
  const totalPages: number = data?.totalPages ?? 1;
  const availableRoles: any[] = rolesData ?? [];

  useEffect(() => {
    if (!availableRoles.length) return;
    const currentStillExists = availableRoles.some((item) => item.name === role);
    if (!currentStillExists) {
      setRole(availableRoles[0].name);
    }
  }, [availableRoles, role]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Usuários</h1>

      {(canCreate || canEdit) && (
        <Card className="grid gap-2 md:grid-cols-6">
          <Input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Email" value={email} disabled={Boolean(editingId)} onChange={(e) => setEmail(e.target.value)} />
          {!editingId ? (
            <Input placeholder="Senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          ) : (
            <Select value={isActive ? 'true' : 'false'} onChange={(e) => setIsActive(e.target.value === 'true')}>
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </Select>
          )}
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            {availableRoles.map((item) => (
              <option key={item.id} value={item.name}>{item.name}</option>
            ))}
          </Select>
          <Button disabled={editingId ? !canEdit : !canCreate} onClick={() => saveMutation.mutate()}>{editingId ? 'Salvar' : 'Criar'}</Button>
          {editingId && (
            <Button
              className="bg-slate-500 hover:bg-slate-600"
              onClick={() => {
                setEditingId(null);
                setName('');
                setEmail('');
                setPassword('');
                setRole('OPERADOR');
                setIsActive(true);
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
              <th>Email</th>
              <th>Perfil</th>
              <th>Ativo</th>
              {(canEdit || canDeactivate) && <th>Ações</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((u: any) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.role?.name}</td>
                <td>{u.isActive ? 'Sim' : 'Não'}</td>
                {(canEdit || canDeactivate) && (
                  <td className="flex gap-2 py-2">
                    {canEdit && (
                      <>
                        <Button
                          className="h-8 bg-slate-700 px-2 text-xs hover:bg-slate-600"
                          onClick={() => {
                            setEditingId(u.id);
                            setName(u.name ?? '');
                            setEmail(u.email ?? '');
                            setRole(u.role?.name ?? 'OPERADOR');
                            setIsActive(Boolean(u.isActive));
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          className="h-8 bg-slate-700 px-2 text-xs hover:bg-slate-600"
                          onClick={() => {
                            const newPassword = window.prompt('Nova senha (mín. 6 caracteres):');
                            if (newPassword && newPassword.length >= 6) {
                              changePasswordMutation.mutate({ id: u.id, newPassword });
                            }
                          }}
                        >
                          Trocar senha
                        </Button>
                      </>
                    )}
                    {canDeactivate && u.isActive && u.role?.isSystem !== true && (
                      <Button
                        className="h-8 bg-slate-500 px-2 text-xs hover:bg-slate-600"
                        onClick={() => {
                          if (window.confirm('Deseja desativar este usuário?')) {
                            deactivateMutation.mutate(u.id);
                          }
                        }}
                      >
                        Desativar
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
