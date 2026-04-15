import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button, Card, Input, Select, Table } from '../components/ui';
import { useEffect, useState } from 'react';

type SettingItem = {
  id: string;
  key: string;
  value: string;
  description?: string | null;
};

type CameraVehicleTypeItem = {
  id: string;
  rawType: string;
  mappedCategory?: 'CARRO' | 'CAMINHAO' | 'ONIBUS' | 'OUTRO' | 'DESCONHECIDO' | null;
  mappedSubtype?: string | null;
  sampleBrand?: string | null;
  sampleDirection?: string | null;
  samplePlateColor?: string | null;
  occurrenceCount: number;
  lastSeenAt: string;
};

type HeavySubtypeOptions = {
  truckSubtypes: string[];
  busSubtypes: string[];
};

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [enabled, setEnabled] = useState('true');
  const [cacheMinutes, setCacheMinutes] = useState('1440');
  const [fetchOnlyUnknown, setFetchOnlyUnknown] = useState('true');
  const [forceRefreshAfterDays, setForceRefreshAfterDays] = useState('0');
  const [heavyTripsRequireValidation, setHeavyTripsRequireValidation] = useState('true');
  const [returnSameLocalCancelMinutes, setReturnSameLocalCancelMinutes] = useState('30');
  const [tripsEnforceRouteRules, setTripsEnforceRouteRules] = useState('true');
  const [truckSubtypes, setTruckSubtypes] = useState('');
  const [busSubtypes, setBusSubtypes] = useState('');
  const [gratuidadeTypes, setGratuidadeTypes] = useState('');
  const [editableRows, setEditableRows] = useState<Record<string, { value: string; description: string }>>({});
  const [cameraTypeRows, setCameraTypeRows] = useState<Record<string, { mappedCategory: string; mappedSubtype: string }>>({});

  const { data } = useQuery<SettingItem[]>({ queryKey: ['settings'], queryFn: async () => (await api.get('/settings')).data });
  const { data: cameraVehicleTypes } = useQuery<CameraVehicleTypeItem[]>({
    queryKey: ['camera-vehicle-types'],
    queryFn: async () => (await api.get('/settings/camera-vehicle-types')).data,
  });
  const { data: heavySubtypeOptions } = useQuery<HeavySubtypeOptions>({
    queryKey: ['heavy-subtypes'],
    queryFn: async () => (await api.get('/heavy-checks/subtypes')).data,
  });

  useEffect(() => {
    if (!data?.length) return;

    const byKey = (settingKey: string) => data.find((item) => item.key === settingKey)?.value ?? '';

    setBaseUrl(byKey('PLACA_FIPE_BASE_URL'));
    setToken(byKey('PLACA_FIPE_TOKEN'));
    setEnabled(byKey('PLACA_FIPE_ENABLED') || 'true');
    setCacheMinutes(byKey('PLACA_FIPE_CACHE_MINUTES') || '1440');
    setFetchOnlyUnknown(byKey('PLACA_FIPE_FETCH_ONLY_UNKNOWN') || 'true');
    setForceRefreshAfterDays(byKey('PLACA_FIPE_FORCE_REFRESH_AFTER_DAYS') || '0');
    setHeavyTripsRequireValidation(byKey('HEAVY_TRIPS_REQUIRE_VALIDATION') || 'true');
    setReturnSameLocalCancelMinutes(byKey('RETURN_SAME_LOCAL_CANCEL_MINUTES') || '30');
    setTripsEnforceRouteRules(byKey('TRIPS_ENFORCE_ROUTE_RULES') || 'true');
    setTruckSubtypes(byKey('TRUCK_SUBTYPES'));
    setBusSubtypes(byKey('BUS_SUBTYPES'));
    setGratuidadeTypes(byKey('GRATUIDADE_TYPES') || 'PCD,Carro Oficial,NGISUL');

    setEditableRows(
      data.reduce<Record<string, { value: string; description: string }>>((acc, item) => {
        acc[item.id] = {
          value: item.value || '',
          description: item.description || '',
        };
        return acc;
      }, {}),
    );
  }, [data]);

  useEffect(() => {
    if (!cameraVehicleTypes?.length) return;

    setCameraTypeRows(
      cameraVehicleTypes.reduce<Record<string, { mappedCategory: string; mappedSubtype: string }>>((acc, item) => {
        acc[item.id] = {
          mappedCategory: item.mappedCategory || '',
          mappedSubtype: item.mappedSubtype || '',
        };
        return acc;
      }, {}),
    );
  }, [cameraVehicleTypes]);

  const mutation = useMutation({
    mutationFn: async () => api.post('/settings', { key, value }),
    onSuccess: () => {
      setKey(''); setValue('');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const integrationMutation = useMutation({
    mutationFn: async () =>
      Promise.all([
        api.post('/settings', {
          key: 'PLACA_FIPE_BASE_URL',
          value: baseUrl.trim(),
          description: 'URL base da API Placa Fipe',
        }),
        api.post('/settings', {
          key: 'PLACA_FIPE_TOKEN',
          value: token.trim(),
          description: 'Token Bearer da API Placa Fipe',
        }),
        api.post('/settings', {
          key: 'PLACA_FIPE_ENABLED',
          value: enabled,
          description: 'Habilita integração da API Placa Fipe',
        }),
        api.post('/settings', {
          key: 'PLACA_FIPE_CACHE_MINUTES',
          value: cacheMinutes,
          description: 'Tempo de cache da API Placa Fipe em minutos',
        }),
        api.post('/settings', {
          key: 'PLACA_FIPE_FETCH_ONLY_UNKNOWN',
          value: fetchOnlyUnknown,
          description: 'Consulta API externa apenas para placas sem dados locais',
        }),
        api.post('/settings', {
          key: 'PLACA_FIPE_FORCE_REFRESH_AFTER_DAYS',
          value: forceRefreshAfterDays,
          description: 'Força nova consulta na API após X dias desde a última sincronização externa',
        }),
      ]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const subtypeMutation = useMutation({
    mutationFn: async () =>
      Promise.all([
        api.post('/settings', {
          key: 'TRUCK_SUBTYPES',
          value: truckSubtypes,
          description: 'Subtipos de caminhão (separados por vírgula)',
        }),
        api.post('/settings', {
          key: 'BUS_SUBTYPES',
          value: busSubtypes,
          description: 'Subtipos de ônibus (separados por vírgula)',
        }),
      ]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['heavy-subtypes'] });
    },
  });

  const gratuidadeMutation = useMutation({
    mutationFn: async () =>
      api.post('/settings', {
        key: 'GRATUIDADE_TYPES',
        value: gratuidadeTypes,
        description: 'Tipos de gratuidade (separados por vírgula)',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['gratuidade-types'] });
    },
  });

  const heavyValidationMutation = useMutation({
    mutationFn: async () =>
      api.post('/settings', {
        key: 'HEAVY_TRIPS_REQUIRE_VALIDATION',
        value: heavyTripsRequireValidation,
        description: 'Caminhão/ônibus só contam como viagem após validação',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-daily'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['reports-quantitative'] });
      queryClient.invalidateQueries({ queryKey: ['reports-quantitative-dashboard'] });
    },
  });

  const sameLocalCancelWindowMutation = useMutation({
    mutationFn: async () =>
      api.post('/settings', {
        key: 'RETURN_SAME_LOCAL_CANCEL_MINUTES',
        value: returnSameLocalCancelMinutes,
        description: 'Minutos para considerar cancelado quando retorna ao mesmo ponto de origem',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-daily'] });
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    },
  });

  const tripsRouteRulesMutation = useMutation({
    mutationFn: async () =>
      api.post('/settings', {
        key: 'TRIPS_ENFORCE_ROUTE_RULES',
        value: tripsEnforceRouteRules,
        description: 'Quando true, o fechamento do trajeto depende das regras de rota',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    },
  });

  const rowMutation = useMutation({
    mutationFn: async (payload: { key: string; value: string; description: string }) => api.post('/settings', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['heavy-subtypes'] });
    },
  });

  const cameraTypeMutation = useMutation({
    mutationFn: async (payload: { id: string; mappedCategory?: string | null; mappedSubtype?: string | null }) =>
      api.patch(`/settings/camera-vehicle-types/${payload.id}`, {
        mappedCategory: payload.mappedCategory || null,
        mappedSubtype: payload.mappedSubtype || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['camera-vehicle-types'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });

  function updateRow(itemId: string, patch: Partial<{ value: string; description: string }>) {
    setEditableRows((current) => ({
      ...current,
      [itemId]: {
        value: current[itemId]?.value ?? '',
        description: current[itemId]?.description ?? '',
        ...patch,
      },
    }));
  }

  function updateCameraTypeRow(itemId: string, patch: Partial<{ mappedCategory: string; mappedSubtype: string }>) {
    setCameraTypeRows((current) => ({
      ...current,
      [itemId]: {
        mappedCategory: current[itemId]?.mappedCategory ?? '',
        mappedSubtype: current[itemId]?.mappedSubtype ?? '',
        ...patch,
      },
    }));
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Configurações</h1>

      <Card className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Integração API Placa Fipe</h2>
          <a
            href="https://doc.placafipe.com.br"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-slate-600 underline hover:text-slate-900"
          >
            Documentação oficial
          </a>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <Input placeholder="URL base (ex: https://api.placafipe.com.br)" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          <Input placeholder="Token da API" type="password" value={token} onChange={(e) => setToken(e.target.value)} />
          <Input placeholder="Integração habilitada (true/false)" value={enabled} onChange={(e) => setEnabled(e.target.value)} />
          <Input placeholder="Cache em minutos (ex: 1440)" value={cacheMinutes} onChange={(e) => setCacheMinutes(e.target.value)} />
          <Input placeholder="Consultar só desconhecidos (true/false)" value={fetchOnlyUnknown} onChange={(e) => setFetchOnlyUnknown(e.target.value)} />
          <Input placeholder="Forçar refresh após dias (ex: 0 desativa)" value={forceRefreshAfterDays} onChange={(e) => setForceRefreshAfterDays(e.target.value)} />
        </div>
        <div>
          <Button onClick={() => integrationMutation.mutate()} disabled={integrationMutation.isPending}>
            Salvar integração
          </Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Subtipos de veículos pesados</h2>
          <p className="text-sm text-slate-600">Configure os subtipos separados por vírgula (ex: Caminhão pequeno,Caminhão truck,Carreta).</p>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <Input placeholder="Subtipos de caminhão" value={truckSubtypes} onChange={(e) => setTruckSubtypes(e.target.value)} />
          <Input placeholder="Subtipos de ônibus" value={busSubtypes} onChange={(e) => setBusSubtypes(e.target.value)} />
        </div>
        <div>
          <Button onClick={() => subtypeMutation.mutate()} disabled={subtypeMutation.isPending}>
            Salvar subtipos
          </Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Tipos de Gratuidade</h2>
          <p className="text-sm text-slate-600">Defina os tipos de gratuidade disponíveis, separados por vírgula (ex: PCD,Carro Oficial,NGISUL).</p>
        </div>
        <div className="grid gap-2 md:grid-cols-1">
          <Input placeholder="ex: PCD,Carro Oficial,NGISUL" value={gratuidadeTypes} onChange={(e) => setGratuidadeTypes(e.target.value)} />
        </div>
        <div>
          <Button onClick={() => gratuidadeMutation.mutate()} disabled={gratuidadeMutation.isPending}>
            Salvar tipos de gratuidade
          </Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Tipos recebidos da câmera</h2>
          <p className="text-sm text-slate-600">
            Cada tipo novo recebido pela câmera é salvo automaticamente. Aqui o admin define como ele entra no sistema.
          </p>
        </div>
        <Table>
          <thead>
            <tr>
              <th>Tipo da câmera</th>
              <th>Amostra</th>
              <th>Qtd.</th>
              <th>Categoria</th>
              <th>Subtipo</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {(cameraVehicleTypes || []).map((item) => {
              const current = cameraTypeRows[item.id] || { mappedCategory: '', mappedSubtype: '' };
              const subtypeOptions = current.mappedCategory === 'CAMINHAO'
                ? heavySubtypeOptions?.truckSubtypes || []
                : current.mappedCategory === 'ONIBUS'
                  ? heavySubtypeOptions?.busSubtypes || []
                  : [];

              return (
                <tr key={item.id} className="border-t border-slate-100">
                  <td>{item.rawType}</td>
                  <td>
                    {[item.sampleBrand, item.sampleDirection, item.samplePlateColor].filter(Boolean).join(' / ') || '-'}
                  </td>
                  <td>{item.occurrenceCount}</td>
                  <td>
                    <Select
                      value={current.mappedCategory}
                      onChange={(e) => updateCameraTypeRow(item.id, {
                        mappedCategory: e.target.value,
                        mappedSubtype: e.target.value === 'CARRO' ? '' : current.mappedSubtype,
                      })}
                    >
                      <option value="">Sem mapeamento</option>
                      <option value="CARRO">Carro</option>
                      <option value="CAMINHAO">Caminhão</option>
                      <option value="ONIBUS">Ônibus</option>
                    </Select>
                  </td>
                  <td>
                    {current.mappedCategory === 'CAMINHAO' || current.mappedCategory === 'ONIBUS' ? (
                      <Select
                        value={current.mappedSubtype}
                        onChange={(e) => updateCameraTypeRow(item.id, { mappedSubtype: e.target.value })}
                      >
                        <option value="">Selecione</option>
                        {subtypeOptions.map((subtype) => (
                          <option key={subtype} value={subtype}>{subtype}</option>
                        ))}
                      </Select>
                    ) : (
                      <span className="text-sm text-slate-500">-</span>
                    )}
                  </td>
                  <td>
                    <Button
                      disabled={cameraTypeMutation.isPending}
                      onClick={() => cameraTypeMutation.mutate({
                        id: item.id,
                        mappedCategory: current.mappedCategory || null,
                        mappedSubtype: current.mappedCategory === 'CARRO' ? null : current.mappedSubtype || null,
                      })}
                    >
                      Salvar
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Validação para contar viagem de pesados</h2>
          <p className="text-sm text-slate-600">Quando ativo, caminhão/ônibus só contam como viagem após validação no módulo de Pesados.</p>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <Input
            placeholder="true ou false"
            value={heavyTripsRequireValidation}
            onChange={(e) => setHeavyTripsRequireValidation(e.target.value)}
          />
        </div>
        <div>
          <Button onClick={() => heavyValidationMutation.mutate()} disabled={heavyValidationMutation.isPending}>
            Salvar regra de validação
          </Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Janela de cancelamento por retorno ao mesmo ponto</h2>
          <p className="text-sm text-slate-600">Se o veículo sair de A e retornar para A dentro desta janela (minutos), o trajeto será cancelado.</p>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <Input
            placeholder="Minutos (ex: 30)"
            value={returnSameLocalCancelMinutes}
            onChange={(e) => setReturnSameLocalCancelMinutes(e.target.value)}
          />
        </div>
        <div>
          <Button onClick={() => sameLocalCancelWindowMutation.mutate()} disabled={sameLocalCancelWindowMutation.isPending}>
            Salvar janela de cancelamento
          </Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Validação de regra de rota no fechamento de trajetos</h2>
          <p className="text-sm text-slate-600">Quando true, o sistema usa as regras de rota para definir o status final. Quando false, fecha automaticamente como CONCLUIDO_OK no primeiro ponto.</p>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <Input
            placeholder="true ou false"
            value={tripsEnforceRouteRules}
            onChange={(e) => setTripsEnforceRouteRules(e.target.value)}
          />
        </div>
        <div>
          <Button onClick={() => tripsRouteRulesMutation.mutate()} disabled={tripsRouteRulesMutation.isPending}>
            Salvar regra de rota para trajetos
          </Button>
        </div>
      </Card>

      <Card className="flex gap-2">
        <Input placeholder="Chave" value={key} onChange={(e) => setKey(e.target.value)} />
        <Input placeholder="Valor" value={value} onChange={(e) => setValue(e.target.value)} />
        <Button onClick={() => mutation.mutate()}>Salvar</Button>
      </Card>

      <Card>
        <Table>
          <thead>
            <tr>
              <th>Chave</th>
              <th>Valor</th>
              <th>Descrição</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((item) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td>{item.key}</td>
                <td>
                  <Input
                    value={editableRows[item.id]?.value ?? ''}
                    onChange={(e) => updateRow(item.id, { value: e.target.value })}
                  />
                </td>
                <td>
                  <Input
                    value={editableRows[item.id]?.description ?? ''}
                    onChange={(e) => updateRow(item.id, { description: e.target.value })}
                  />
                </td>
                <td>
                  <Button
                    disabled={rowMutation.isPending}
                    onClick={() => rowMutation.mutate({
                      key: item.key,
                      value: editableRows[item.id]?.value ?? '',
                      description: editableRows[item.id]?.description ?? '',
                    })}
                  >
                    Salvar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
