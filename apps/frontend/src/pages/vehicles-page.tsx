import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Badge, Button, Card, Input, Pagination, Select, Table } from '../components/ui';
import { useState } from 'react';

type GratuidadeTypesData = { gratuidadeTypes: string[] };

export function VehiclesPage() {
  const queryClient = useQueryClient();
  const [plate, setPlate] = useState('');
  const [filterGratuidade, setFilterGratuidade] = useState('');
  const [page, setPage] = useState(1);

  // Gratuidade form
  const [formPlate, setFormPlate] = useState('');
  const [formIsGratuidade, setFormIsGratuidade] = useState(true);
  const [formGratuidadeType, setFormGratuidadeType] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['vehicles', plate, filterGratuidade, page],
    queryFn: async () =>
      (await api.get('/vehicles', {
        params: {
          plate: plate || undefined,
          isGratuidade: filterGratuidade || undefined,
          page,
          limit: 20,
        },
      })).data,
  });

  const { data: gratuidadeTypesData } = useQuery<GratuidadeTypesData>({
    queryKey: ['gratuidade-types'],
    queryFn: async () => (await api.get('/settings/gratuidade-types')).data,
  });

  const gratuidadeTypes = gratuidadeTypesData?.gratuidadeTypes ?? [];

  const rows: any[] = data?.data ?? [];
  const totalPages: number = data?.totalPages ?? 1;

  const gratuidadeMutation = useMutation({
    mutationFn: async (payload: { plate: string; isGratuidade: boolean; gratuidadeType?: string | null }) =>
      api.patch(`/vehicles/${payload.plate}/gratuidade`, {
        isGratuidade: payload.isGratuidade,
        gratuidadeType: payload.isGratuidade ? payload.gratuidadeType || null : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['readings'] });
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      setFormPlate('');
      setFormIsGratuidade(true);
      setFormGratuidadeType('');
    },
    onError: (err: any) => {
      window.alert(err?.response?.data?.message ?? 'Erro ao salvar gratuidade');
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Veículos</h1>

      {/* Gratuidade form */}
      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">Marcar / desmarcar gratuidade</h2>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <p className="text-xs uppercase text-slate-500 mb-1">Placa</p>
            <Input
              placeholder="Ex: ABC1234"
              value={formPlate}
              onChange={(e) => setFormPlate(e.target.value.toUpperCase())}
              className="w-36"
            />
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500 mb-1">Gratuidade</p>
            <Select value={formIsGratuidade ? 'true' : 'false'} onChange={(e) => setFormIsGratuidade(e.target.value === 'true')}>
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </Select>
          </div>
          {formIsGratuidade && (
            <div>
              <p className="text-xs uppercase text-slate-500 mb-1">Tipo</p>
              <Select value={formGratuidadeType} onChange={(e) => setFormGratuidadeType(e.target.value)}>
                <option value="">Selecione</option>
                {gratuidadeTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>
          )}
          <Button
            disabled={!formPlate.trim() || gratuidadeMutation.isPending}
            onClick={() => gratuidadeMutation.mutate({
              plate: formPlate.trim(),
              isGratuidade: formIsGratuidade,
              gratuidadeType: formIsGratuidade ? formGratuidadeType || null : null,
            })}
          >
            Salvar
          </Button>
        </div>
      </Card>

      {/* Filters */}
      <Card className="flex flex-wrap gap-2 items-end">
        <div>
          <p className="text-xs uppercase text-slate-500 mb-1">Placa</p>
          <Input placeholder="Filtrar placa" value={plate} onChange={(e) => { setPlate(e.target.value); setPage(1); }} />
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500 mb-1">Gratuidade</p>
          <Select value={filterGratuidade} onChange={(e) => { setFilterGratuidade(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            <option value="true">Somente gratuidade</option>
            <option value="false">Sem gratuidade</option>
          </Select>
        </div>
      </Card>

      {/* Table */}
      <Card>
        {isLoading ? <p>Carregando...</p> : (
          <>
            <Table>
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>Marca/Modelo</th>
                  <th>Tipo</th>
                  <th>Gratuidade</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item: any) => (
                  <tr key={item.id} className={`border-t border-slate-100${item.isGratuidade ? ' bg-yellow-50' : ''}`}>
                    <td className="font-mono">{item.plate}</td>
                    <td>{[item.brand, item.model].filter(Boolean).join(' ') || '-'}</td>
                    <td>{item.categoryType}{item.subSegment ? ` / ${item.subSegment}` : ''}</td>
                    <td>
                      {item.isGratuidade
                        ? <Badge className="bg-yellow-200 text-yellow-800">{item.gratuidadeType || 'Gratuidade'}</Badge>
                        : <span className="text-slate-400 text-sm">-</span>}
                    </td>
                    <td>
                      <Button
                        className="h-7 px-2 text-xs bg-slate-600 hover:bg-slate-500"
                        onClick={() => {
                          setFormPlate(item.plate);
                          setFormIsGratuidade(item.isGratuidade);
                          setFormGratuidadeType(item.gratuidadeType || '');
                        }}
                      >
                        Editar
                      </Button>
                    </td>
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
