import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button, Card, Select, Table } from '../components/ui';
import { useState } from 'react';

type LocationItem = { id: string; name: string };
type RouteRuleItem = {
  id: string;
  originLocal?: { name?: string };
  destinationLocal?: { name?: string };
  resultType: string;
  severity: string;
  active: boolean;
};

function toRows<T>(payload: any): T[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

export function RouteRulesPage() {
  const queryClient = useQueryClient();
  const [originLocalId, setOriginLocalId] = useState('');
  const [destinationLocalId, setDestinationLocalId] = useState('');
  const [resultType, setResultType] = useState('CONCLUIDO_OK');
  const [severity, setSeverity] = useState('BAIXA');

  const { data } = useQuery({ queryKey: ['route-rules'], queryFn: async () => (await api.get('/route-rules')).data });
  const { data: locations } = useQuery({ queryKey: ['locations'], queryFn: async () => (await api.get('/locations')).data });

  const ruleRows = toRows<RouteRuleItem>(data);
  const locationRows = toRows<LocationItem>(locations);

  const mutation = useMutation({
    mutationFn: async () => api.post('/route-rules', { originLocalId, destinationLocalId, resultType, severity }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['route-rules'] }),
  });

  return (
    <div className="space-y-4"><h1 className="text-xl font-semibold">Regras de rota</h1>
      <Card className="grid gap-2 md:grid-cols-5"><Select value={originLocalId} onChange={(e) => setOriginLocalId(e.target.value)}><option value="">Origem</option>{locationRows.map((loc) => <option value={loc.id} key={loc.id}>{loc.name}</option>)}</Select><Select value={destinationLocalId} onChange={(e) => setDestinationLocalId(e.target.value)}><option value="">Destino</option>{locationRows.map((loc) => <option value={loc.id} key={loc.id}>{loc.name}</option>)}</Select><Select value={resultType} onChange={(e) => setResultType(e.target.value)}><option>CONCLUIDO_OK</option><option>CONCLUIDO_ATENCAO</option><option>CANCELADO</option><option>INCONSISTENTE</option></Select><Select value={severity} onChange={(e) => setSeverity(e.target.value)}><option>BAIXA</option><option>MEDIA</option><option>ALTA</option><option>CRITICA</option></Select><Button onClick={() => mutation.mutate()}>Salvar</Button></Card>
      <Card><Table><thead><tr><th>Origem</th><th>Destino</th><th>Resultado</th><th>Severidade</th><th>Ativa</th></tr></thead><tbody>{ruleRows.map((r) => <tr key={r.id} className="border-t border-slate-100"><td>{r.originLocal?.name}</td><td>{r.destinationLocal?.name}</td><td>{r.resultType}</td><td>{r.severity}</td><td>{r.active ? 'Sim' : 'Não'}</td></tr>)}</tbody></Table></Card>
    </div>
  );
}
