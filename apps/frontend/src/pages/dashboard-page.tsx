import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, CardTitle, Table } from '../components/ui';
import { PieChart, Pie, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { formatDateTime } from '../lib/utils';

export function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-daily'],
    queryFn: async () => (await api.get('/dashboard/daily')).data,
    refetchInterval: 30000,
  });

  if (isLoading) return <p>Carregando dashboard...</p>;

  const cards = data?.cards || {};

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Dashboard operacional do dia</h1>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Object.entries(cards).map(([k, v]) => (
          <Card key={k}>
            <p className="text-xs uppercase text-slate-500">{k}</p>
            <p className="text-2xl font-semibold">{String(v)}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="h-72">
          <CardTitle>Tipo de veículo</CardTitle>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={data?.charts?.vehicleType || []}><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="value" fill="#0f172a" /></BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="h-72">
          <CardTitle>Status de trajeto</CardTitle>
          <ResponsiveContainer width="100%" height="90%">
            <PieChart><Pie data={data?.charts?.tripStatus || []} dataKey="value" nameKey="name" outerRadius={90} fill="#334155" /><Tooltip /></PieChart>
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
