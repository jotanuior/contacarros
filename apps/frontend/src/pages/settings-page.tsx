import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button, Card, Input, Table } from '../components/ui';
import { useEffect, useState } from 'react';

type SettingItem = {
  id: string;
  key: string;
  value: string;
  description?: string | null;
};

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [enabled, setEnabled] = useState('true');
  const [cacheMinutes, setCacheMinutes] = useState('1440');

  const { data } = useQuery<SettingItem[]>({ queryKey: ['settings'], queryFn: async () => (await api.get('/settings')).data });

  useEffect(() => {
    if (!data?.length) return;

    const byKey = (settingKey: string) => data.find((item) => item.key === settingKey)?.value ?? '';

    setBaseUrl(byKey('PLACA_FIPE_BASE_URL'));
    setToken(byKey('PLACA_FIPE_TOKEN'));
    setEnabled(byKey('PLACA_FIPE_ENABLED') || 'true');
    setCacheMinutes(byKey('PLACA_FIPE_CACHE_MINUTES') || '1440');
  }, [data]);

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
      ]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  function renderSettingValue(item: SettingItem) {
    if (item.key === 'PLACA_FIPE_TOKEN' && item.value) {
      return '••••••••••••••••';
    }

    return item.value || '-';
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
        </div>
        <div>
          <Button onClick={() => integrationMutation.mutate()} disabled={integrationMutation.isPending}>
            Salvar integração
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
            </tr>
          </thead>
          <tbody>
            {(data || []).map((item) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td>{item.key}</td>
                <td>{renderSettingValue(item)}</td>
                <td>{item.description || '-'}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
