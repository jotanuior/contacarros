import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button, Card, Input, Table } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import type { PermissionMap, ScreenKey } from '../lib/rbac';

type RoleItem = {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  isSystem: boolean;
  usersCount: number;
  permissions: PermissionMap;
};

type ScreenItem = {
  key: ScreenKey;
  label: string;
};

type PermissionFlags = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDeactivate: boolean;
  canExport: boolean;
};

const emptyFlags: PermissionFlags = {
  canView: false,
  canCreate: false,
  canEdit: false,
  canDeactivate: false,
  canExport: false,
};

export function RolesPage() {
  const { canAccess } = useAuth();
  const canCreateRole = canAccess('PERFIS', 'create');
  const canEditRole = canAccess('PERFIS', 'edit');
  const canDeactivateRole = canAccess('PERFIS', 'deactivate');

  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [permissionsDraft, setPermissionsDraft] = useState<Record<string, PermissionFlags>>({});

  const { data: roles = [] } = useQuery<RoleItem[]>({
    queryKey: ['roles'],
    queryFn: async () => (await api.get('/roles')).data,
  });

  const { data: screens = [] } = useQuery<ScreenItem[]>({
    queryKey: ['roles', 'screens'],
    queryFn: async () => (await api.get('/roles/screens')).data,
  });

  const selectedRole = useMemo(() => roles.find((role) => role.id === selectedId) || null, [roles, selectedId]);

  const createMutation = useMutation({
    mutationFn: async () =>
      api.post('/roles', {
        name: newName,
        description: newDescription || undefined,
      }),
    onSuccess: async () => {
      setNewName('');
      setNewDescription('');
      await queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
  });

  const updateMetaMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRole) return;
      return api.patch(`/roles/${selectedRole.id}`, {
        name: editName,
        description: editDescription,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
  });

  const updatePermissionsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRole) return;
      const permissions = screens.map((screen) => {
        const flags = permissionsDraft[screen.key] || emptyFlags;
        return {
          screen: screen.key,
          canView: !!flags.canView,
          canCreate: !!flags.canCreate,
          canEdit: !!flags.canEdit,
          canDeactivate: !!flags.canDeactivate,
          canExport: !!flags.canExport,
        };
      });

      return api.patch(`/roles/${selectedRole.id}/permissions`, { permissions });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => api.patch(`/roles/${id}/deactivate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
  });

  const onSelectRole = (role: RoleItem) => {
    setSelectedId(role.id);
    setEditName(role.name);
    setEditDescription(role.description || '');
    const nextDraft: Record<string, PermissionFlags> = {};
    for (const screen of screens) {
      nextDraft[screen.key] = role.permissions?.[screen.key] || emptyFlags;
    }
    setPermissionsDraft(nextDraft);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Perfis e Permissões</h1>

      {canCreateRole && (
        <Card className="grid gap-2 md:grid-cols-4">
          <Input placeholder="Nome do perfil" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Input placeholder="Descrição (opcional)" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
          <div className="md:col-span-2">
            <Button disabled={!newName.trim()} onClick={() => createMutation.mutate()}>
              Criar perfil
            </Button>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <Table>
            <thead>
              <tr>
                <th>Perfil</th>
                <th>Ativo</th>
                <th>Usuários</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr
                  key={role.id}
                  className={`cursor-pointer border-t border-slate-100 ${selectedId === role.id ? 'bg-slate-100' : ''}`}
                  onClick={() => onSelectRole(role)}
                >
                  <td className="font-medium">{role.name}</td>
                  <td>{role.isActive ? 'Sim' : 'Não'}</td>
                  <td>{role.usersCount}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card>
          {!selectedRole && <p className="text-sm text-slate-500">Selecione um perfil para editar permissões.</p>}

          {selectedRole && (
            <div className="space-y-4">
              <div className="grid gap-2 md:grid-cols-3">
                <Input
                  value={editName}
                  disabled={!canEditRole || selectedRole.isSystem}
                  onChange={(e) => setEditName(e.target.value)}
                />
                <Input
                  value={editDescription}
                  disabled={!canEditRole}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Descrição"
                />
                <div className="flex gap-2">
                  <Button
                    disabled={!canEditRole || (selectedRole.isSystem && selectedRole.name !== editName)}
                    onClick={() => updateMetaMutation.mutate()}
                  >
                    Salvar dados
                  </Button>
                  {canDeactivateRole && selectedRole.isActive && !selectedRole.isSystem && (
                    <Button
                      className="bg-slate-500 hover:bg-slate-600"
                      onClick={() => {
                        if (window.confirm('Deseja desativar este perfil?')) {
                          deactivateMutation.mutate(selectedRole.id);
                        }
                      }}
                    >
                      Desativar
                    </Button>
                  )}
                </div>
              </div>

              <div className="overflow-auto">
                <Table>
                  <thead>
                    <tr>
                      <th>Tela</th>
                      <th>Visualizar</th>
                      <th>Criar</th>
                      <th>Editar</th>
                      <th>Desativar</th>
                      <th>Exportar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {screens.map((screen) => {
                      const flags = permissionsDraft[screen.key] || emptyFlags;
                      const setFlag = (field: keyof PermissionFlags, value: boolean) => {
                        setPermissionsDraft((prev) => ({
                          ...prev,
                          [screen.key]: {
                            ...(prev[screen.key] || emptyFlags),
                            [field]: value,
                          },
                        }));
                      };

                      return (
                        <tr key={screen.key} className="border-t border-slate-100">
                          <td>{screen.label}</td>
                          <td><input type="checkbox" checked={flags.canView} disabled={!canEditRole} onChange={(e) => setFlag('canView', e.target.checked)} /></td>
                          <td><input type="checkbox" checked={flags.canCreate} disabled={!canEditRole} onChange={(e) => setFlag('canCreate', e.target.checked)} /></td>
                          <td><input type="checkbox" checked={flags.canEdit} disabled={!canEditRole} onChange={(e) => setFlag('canEdit', e.target.checked)} /></td>
                          <td><input type="checkbox" checked={flags.canDeactivate} disabled={!canEditRole} onChange={(e) => setFlag('canDeactivate', e.target.checked)} /></td>
                          <td><input type="checkbox" checked={flags.canExport} disabled={!canEditRole} onChange={(e) => setFlag('canExport', e.target.checked)} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>

              <div>
                <Button disabled={!canEditRole} onClick={() => updatePermissionsMutation.mutate()}>
                  Salvar permissões
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
