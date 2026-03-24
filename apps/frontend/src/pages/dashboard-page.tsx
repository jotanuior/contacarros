import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, CardTitle, Input, Table } from '../components/ui';
import { PieChart, Pie, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { formatDateTime } from '../lib/utils';
import { useMemo, useState } from 'react';

export function DashboardPage() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-daily', fromDate, toDate],
    queryFn: async () => (await api.get('/dashboard/daily', { params: { from: fromDate, to: toDate } })).data,
    refetchInterval: 30000,
  });

  if (isLoading) return <p>Carregando dashboard...</p>;

  const cards = data?.cards || {};
  const cardLabels: Record<string, string> = {
    totalReadings: 'Total de leituras',
    totalTrips: 'Total de trajetos',
    concludedOk: 'Concluído OK',
    concludedAttention: 'Concluído atenção',
    canceled: 'Cancelado',
    noExit: 'Sem saída',
    trucks: 'Caminhões',
    buses: 'Ônibus',
    cars: 'Carros',
  };

  const vehicleLabels: Record<string, string> = {
    CARRO: 'Carro',
    CAMINHAO: 'Caminhão',
    ONIBUS: 'Ônibus',
    OUTRO: 'Outro',
    DESCONHECIDO: 'Desconhecido',
  };

  const tripStatusLabels: Record<string, string> = {
    EM_ANDAMENTO: 'Em andamento',
    CONCLUIDO_OK: 'Concluído OK',
    CONCLUIDO_ATENCAO: 'Concluído atenção',
    CANCELADO: 'Cancelado',
    SEM_SAIDA: 'Sem saída',
    INCONSISTENTE: 'Inconsistente',
    PENDENTE_VALIDACAO: 'Pendente validação',
  };

  const vehicleTypeChart = (data?.charts?.vehicleType || []).map((item: any) => ({
    ...item,
    name: vehicleLabels[item.name] || item.name,
  }));

  const tripStatusChart = (data?.charts?.tripStatus || []).map((item: any) => ({
    ...item,
    name: tripStatusLabels[item.name] || item.name,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Dashboard operacional do dia</h1>
      <Card className="flex flex-col gap-2 md:flex-row md:items-end md:gap-3">
        <div>
          <p className="text-xs uppercase text-slate-500">Data inicial</p>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Data final</p>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
      </Card>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Object.entries(cards).map(([k, v]) => (
          <Card key={k}>
            <p className="text-xs uppercase text-slate-500">{cardLabels[k] || k}</p>
            <p className="text-2xl font-semibold">{String(v)}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="h-72">
          <CardTitle>Tipo de veículo</CardTitle>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={vehicleTypeChart}><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="value" fill="#0f172a" /></BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="h-72">
          <CardTitle>Status de trajeto</CardTitle>
          <ResponsiveContainer width="100%" height="90%">
            <PieChart><Pie data={tripStatusChart} dataKey="value" nameKey="name" outerRadius={90} fill="#334155" /><Tooltip /></PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="h-72">
          <CardTitle>Volume por hora</CardTitle>
          <ResponsiveContainer width="100%" height="90%">
            <LineChart data={data?.charts?.readingsByHour || []}><XAxis dataKey="hour" /><YAxis /><Tooltip /><Line dataKey="total" stroke="#0f172a" /></LineChart>
          </ResponsiveContainer>
        </Card>
        <Card className="h-72">
          <CardTitle>Leituras por local</CardTitle>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={data?.charts?.readingsByLocal || []}><XAxis dataKey="localName" /><YAxis /><Tooltip /><Bar dataKey="value" fill="#475569" /></BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card>
        <CardTitle>Últimas leituras</CardTitle>
        <Table>
          <thead><tr><th>Data/hora</th><th>Placa</th><th>Local</th><th>Câmera</th><th>Tipo</th></tr></thead>
          <tbody>
            {(data?.tables?.lastReadings || []).map((item: any) => (
              <tr key={item.id} className="border-t border-slate-100"><td>{formatDateTime(item.capturedAt)}</td><td>{item.normalizedPlate}</td><td>{item.location?.name}</td><td>{item.camera?.name}</td><td>{item.vehicle?.categoryType || '-'}</td></tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
