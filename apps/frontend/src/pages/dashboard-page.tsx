import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, CardTitle, Input, Select, Table } from '../components/ui';
import { PieChart, Pie, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { formatDateTime } from '../lib/utils';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bus, Car, Truck, X } from 'lucide-react';

type QuantitativeRow = {
  tipo: string;
  subtipo: string;
  quantidade: number;
};

function toDateTimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function DashboardPage() {
  const [fromDateTime, setFromDateTime] = useState(() => toDateTimeLocal(new Date(Date.now() - 24 * 60 * 60 * 1000)));
  const [toDateTime, setToDateTime] = useState(() => toDateTimeLocal(new Date()));
  const [plate, setPlate] = useState('');
  const [status, setStatus] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [filterSubSegment, setFilterSubSegment] = useState('');
  const [filterGratuidade, setFilterGratuidade] = useState('');
  const [startLocalId, setStartLocalId] = useState('');
  const [selectedSubtypeType, setSelectedSubtypeType] = useState<'CAMINHAO' | 'ONIBUS' | null>(null);
  const drawerCloseButtonRef = useRef<HTMLButtonElement>(null);
  const autoFallbackAppliedRef = useRef(false);

  const queryParams = {
    from: fromDateTime ? new Date(fromDateTime).toISOString() : undefined,
    to: toDateTime ? new Date(toDateTime).toISOString() : undefined,
    plate: plate || undefined,
    status: status || undefined,
    categoryType: filterTipo || undefined,
    subSegment: filterSubSegment || undefined,
    isGratuidade: filterGratuidade === '' ? undefined : filterGratuidade,
    startLocalId: startLocalId || undefined,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-daily', fromDateTime, toDateTime, plate, status, filterTipo, filterSubSegment, filterGratuidade, startLocalId],
    queryFn: async () => (await api.get('/dashboard/daily', { params: queryParams })).data,
    refetchInterval: 30000,
  });

  const { data: subtypeOptions } = useQuery<{ truckSubtypes: string[]; busSubtypes: string[] }>({
    queryKey: ['heavy-subtypes'],
    queryFn: async () => (await api.get('/heavy-checks/subtypes')).data,
  });

  const { data: locations } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['locations-dashboard-filter'],
    queryFn: async () => {
      const response = await api.get('/locations', { params: { page: 1, limit: 200 } });
      return response.data?.data || [];
    },
  });

  const cards = data?.cards || {};
  const cardLabels: Record<string, string> = {
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

  const selectedTipoCode = selectedSubtypeType || '';
  const selectedTipoLabel = selectedSubtypeType ? (vehicleLabels[selectedSubtypeType] || selectedSubtypeType) : '';
  const subtypeRows: QuantitativeRow[] = (data?.charts?.subtypeByType || []).filter((row: QuantitativeRow) => row.tipo === selectedTipoCode);
  const subtypeTotal = subtypeRows.reduce((acc: number, row: QuantitativeRow) => acc + row.quantidade, 0);
  const subtiposForFilter = useMemo(() => {
    if (filterTipo === 'CAMINHAO') return subtypeOptions?.truckSubtypes ?? [];
    if (filterTipo === 'ONIBUS') return subtypeOptions?.busSubtypes ?? [];
    return [];
  }, [filterTipo, subtypeOptions]);

  useEffect(() => {
    const todayLocal = toDateTimeLocal(new Date()).slice(0, 10);
    const isTodayRange = fromDateTime.slice(0, 10) === todayLocal && toDateTime.slice(0, 10) === todayLocal;
    const hasNoTrips = Number(cards.totalTrips || 0) === 0;
    const lastTripDate = data?.meta?.lastTripDate as string | null | undefined;

    if (!isTodayRange || !hasNoTrips || !lastTripDate || lastTripDate === todayLocal || autoFallbackAppliedRef.current) {
      return;
    }

    autoFallbackAppliedRef.current = true;
    setFromDateTime(`${lastTripDate}T00:00`);
    setToDateTime(`${lastTripDate}T23:59`);
  }, [fromDateTime, toDateTime, cards.totalTrips, data?.meta?.lastTripDate]);

  useEffect(() => {
    if (!selectedSubtypeType) return;

    drawerCloseButtonRef.current?.focus();

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

  if (isLoading) return <p>Carregando dashboard...</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Dashboard operacional</h1>
      <Card className="flex flex-wrap gap-2 items-end">
        <div>
          <p className="text-xs uppercase text-slate-500">Placa</p>
          <Input placeholder="Filtrar placa" value={plate} onChange={(e) => setPlate(e.target.value)} />
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">De</p>
          <Input type="datetime-local" value={fromDateTime} onChange={(e) => setFromDateTime(e.target.value)} />
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Até</p>
          <Input type="datetime-local" value={toDateTime} onChange={(e) => setToDateTime(e.target.value)} />
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Status</p>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            <option value="EM_ANDAMENTO">EM_ANDAMENTO</option>
            <option value="CONCLUIDO_OK">CONCLUIDO_OK</option>
            <option value="CONCLUIDO_ATENCAO">CONCLUIDO_ATENCAO</option>
            <option value="CANCELADO">CANCELADO</option>
            <option value="SEM_SAIDA">SEM_SAIDA</option>
            <option value="INCONSISTENTE">INCONSISTENTE</option>
            <option value="PENDENTE_VALIDACAO">PENDENTE_VALIDACAO</option>
          </Select>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Tipo</p>
          <Select value={filterTipo} onChange={(e) => { setFilterTipo(e.target.value); setFilterSubSegment(''); }}>
            <option value="">Todos</option>
            <option value="CARRO">Carro</option>
            <option value="CAMINHAO">Caminhão</option>
            <option value="ONIBUS">Ônibus</option>
            <option value="OUTRO">Outro</option>
            <option value="DESCONHECIDO">Desconhecido</option>
          </Select>
        </div>
        {subtiposForFilter.length > 0 && (
          <div>
            <p className="text-xs uppercase text-slate-500">Subtipo</p>
            <Select value={filterSubSegment} onChange={(e) => setFilterSubSegment(e.target.value)}>
              <option value="">Todos</option>
              {subtiposForFilter.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
        )}
        <div>
          <p className="text-xs uppercase text-slate-500">Gratuidade</p>
          <Select value={filterGratuidade} onChange={(e) => setFilterGratuidade(e.target.value)}>
            <option value="">Todos</option>
            <option value="true">Somente gratuidade</option>
            <option value="false">Sem gratuidade</option>
          </Select>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Local de partida</p>
          <Select value={startLocalId} onChange={(e) => setStartLocalId(e.target.value)}>
            <option value="">Todos</option>
            {(locations || []).map((location) => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
          </Select>
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
        {Object.entries(cards).filter(([k]) => !['cars', 'trucks', 'buses'].includes(k)).map(([k, v]) => (
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
          <CardTitle>Viagens por hora</CardTitle>
          <ResponsiveContainer width="100%" height="90%">
            <LineChart data={data?.charts?.tripsByHour || []}><XAxis dataKey="hour" /><YAxis /><Tooltip /><Line dataKey="total" stroke="#0f172a" /></LineChart>
          </ResponsiveContainer>
        </Card>
        <Card className="h-72">
          <CardTitle>Viagens por local de partida</CardTitle>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={data?.charts?.tripsByLocal || []}><XAxis dataKey="localName" /><YAxis /><Tooltip /><Bar dataKey="value" fill="#475569" /></BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card>
        <CardTitle>Últimas viagens do período</CardTitle>
        <Table>
          <thead><tr><th>Início</th><th>Placa</th><th>Origem</th><th>Destino</th><th>Status</th><th>Tipo</th></tr></thead>
          <tbody>
            {(data?.tables?.lastTrips || []).map((item: any) => (
              <tr key={item.id} className="border-t border-slate-100"><td>{formatDateTime(item.startedAt)}</td><td>{item.plate}</td><td>{item.startLocal?.name || '-'}</td><td>{item.endLocal?.name || '-'}</td><td>{item.currentStatus}</td><td>{vehicleLabels[item.vehicle?.categoryType] || item.vehicle?.categoryType || '-'}</td></tr>
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
          <aside
            className="fixed right-0 top-0 z-50 h-full w-full max-w-md border-l border-slate-200 bg-white p-4 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label={`Subcategorias de ${selectedTipoLabel}`}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Subcategorias de {selectedTipoLabel}</h2>
                <p className="text-xs text-slate-500">Total filtrado: {subtypeTotal}</p>
              </div>
              <button
                type="button"
                ref={drawerCloseButtonRef}
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
