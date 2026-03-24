import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, CardTitle, Input, Table } from '../components/ui';
import { PieChart, Pie, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { formatDateTime } from '../lib/utils';
import { useEffect, useMemo, useState } from 'react';
import { Bus, Car, Truck, X } from 'lucide-react';

type QuantitativeRow = {
  tipo: string;
  subtipo: string;
  quantidade: number;
};

type QuantitativeResponse = {
  rows: QuantitativeRow[];
};

export function DashboardPage() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [selectedSubtypeType, setSelectedSubtypeType] = useState<'CAMINHAO' | 'ONIBUS' | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-daily', fromDate, toDate],
    queryFn: async () => (await api.get('/dashboard/daily', { params: { from: fromDate, to: toDate } })).data,
    refetchInterval: 30000,
  });

  const { data: quantitativeData } = useQuery<QuantitativeResponse>({
    queryKey: ['reports-quantitative-dashboard', fromDate, toDate],
    queryFn: async () => (await api.get('/reports/quantitative', { params: { from: fromDate, to: toDate } })).data,
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

  const selectedTipoLabel = selectedSubtypeType ? vehicleLabels[selectedSubtypeType] : '';
  const subtypeRows = (quantitativeData?.rows || []).filter((row) => row.tipo === selectedTipoLabel);

  useEffect(() => {
    if (!selectedSubtypeType) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedSubtypeType(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [selectedSubtypeType]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Dashboard operacional</h1>
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

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="flex items-center gap-3">
          <div className="rounded-lg bg-slate-100 p-2 text-slate-700">
            <Car size={22} />
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Carros</p>
            <p className="text-2xl font-semibold">{String(cards.cars || 0)}</p>
          </div>
        </Card>

        <Card
          className={`flex cursor-pointer items-center gap-3 ${selectedSubtypeType === 'CAMINHAO' ? 'ring-2 ring-slate-300' : ''}`}
          onClick={() => setSelectedSubtypeType((current) => (current === 'CAMINHAO' ? null : 'CAMINHAO'))}
        >
          <div className="rounded-lg bg-slate-100 p-2 text-slate-700">
            <Truck size={22} />
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Caminhões</p>
            <p className="text-2xl font-semibold">{String(cards.trucks || 0)}</p>
          </div>
        </Card>

        <Card
          className={`flex cursor-pointer items-center gap-3 ${selectedSubtypeType === 'ONIBUS' ? 'ring-2 ring-slate-300' : ''}`}
          onClick={() => setSelectedSubtypeType((current) => (current === 'ONIBUS' ? null : 'ONIBUS'))}
        >
          <div className="rounded-lg bg-slate-100 p-2 text-slate-700">
            <Bus size={22} />
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Ônibus</p>
            <p className="text-2xl font-semibold">{String(cards.buses || 0)}</p>
          </div>
        </Card>
      </div>

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
        <CardTitle>Últimas leituras do período</CardTitle>
        <Table>
          <thead><tr><th>Data/hora</th><th>Placa</th><th>Local</th><th>Câmera</th><th>Tipo</th></tr></thead>
          <tbody>
            {(data?.tables?.lastReadings || []).map((item: any) => (
              <tr key={item.id} className="border-t border-slate-100"><td>{formatDateTime(item.capturedAt)}</td><td>{item.normalizedPlate}</td><td>{item.location?.name}</td><td>{item.camera?.name}</td><td>{vehicleLabels[item.vehicle?.categoryType] || item.vehicle?.categoryType || '-'}</td></tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {selectedSubtypeType && (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-900/30"
            onClick={() => setSelectedSubtypeType(null)}
          />
          <aside className="fixed right-0 top-0 z-50 h-full w-full max-w-md border-l border-slate-200 bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Subcategorias de {selectedTipoLabel}</h2>
              <button
                type="button"
                onClick={() => setSelectedSubtypeType(null)}
                className="rounded-md p-1 text-slate-600 hover:bg-slate-100"
                aria-label="Fechar painel"
              >
                <X size={18} />
              </button>
            </div>

            <Table>
              <thead>
                <tr><th>Subcategoria</th><th>Quantidade</th></tr>
              </thead>
              <tbody>
                {subtypeRows.length ? subtypeRows.map((row) => (
                  <tr key={`${row.tipo}-${row.subtipo}`} className="border-t border-slate-100">
                    <td>{row.subtipo}</td>
                    <td>{row.quantidade}</td>
                  </tr>
                )) : (
                  <tr className="border-t border-slate-100">
                    <td colSpan={2}>Sem dados de subcategoria no período selecionado.</td>
                  </tr>
                )}
              </tbody>
            </Table>
          </aside>
        </>
      )}
    </div>
  );
}
