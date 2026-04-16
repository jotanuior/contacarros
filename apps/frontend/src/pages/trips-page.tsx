import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Badge, Button, Card, Input, Pagination, Select, Table } from '../components/ui';
import { useState, useMemo } from 'react';
import { formatDateTime } from '../lib/utils';

type HeavySubtypeOptions = {
  truckSubtypes: string[];
  busSubtypes: string[];
};

function toDateTimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function TripsPage() {
  const [plate, setPlate] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState(() => toDateTimeLocal(new Date(Date.now() - 24 * 60 * 60 * 1000)));
  const [to, setTo] = useState(() => toDateTimeLocal(new Date()));
  const [filterTipo, setFilterTipo] = useState('');
  const [filterSubSegment, setFilterSubSegment] = useState('');
  const [filterGratuidade, setFilterGratuidade] = useState('');
  const [page, setPage] = useState(1);

  const { data: subtypeOptions } = useQuery<HeavySubtypeOptions>({
    queryKey: ['heavy-subtypes'],
    queryFn: async () => (await api.get('/heavy-checks/subtypes')).data,
  });

  const subtiposForFilter = useMemo(() => {
    if (filterTipo === 'CAMINHAO') return subtypeOptions?.truckSubtypes ?? [];
    if (filterTipo === 'ONIBUS') return subtypeOptions?.busSubtypes ?? [];
    return [];
  }, [filterTipo, subtypeOptions]);

  const queryParams = {
    plate: plate || undefined,
    status: status || undefined,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(to).toISOString() : undefined,
    categoryType: filterTipo || undefined,
    subSegment: filterSubSegment || undefined,
    isGratuidade: filterGratuidade === '' ? undefined : filterGratuidade,
    page,
    limit: 20,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['trips', plate, status, from, to, filterTipo, filterSubSegment, filterGratuidade, page],
    queryFn: async () => (await api.get('/trips', { params: queryParams })).data,
  });

  const rows: any[] = data?.data ?? [];
  const totalPages: number = data?.totalPages ?? 1;
  const summary = data?.summary;

  const exportFile = async (format: 'csv' | 'pdf') => {
    try {
      const response = await api.get('/trips/export', {
        params: { format, ...queryParams, page: undefined, limit: undefined },
        responseType: 'blob',
      });
      const contentType = response.headers?.['content-type'] ?? '';
      if (contentType.includes('application/json')) {
        const text = await (response.data as Blob).text();
        window.alert(`Erro ao exportar: ${text}`);
        return;
      }
      const mime = format === 'pdf' ? 'application/pdf' : 'text/csv;charset=utf-8';
      const blob = new Blob([response.data], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `trajetos.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      const msg = err?.response?.data
        ? await (err.response.data as Blob).text?.().catch(() => String(err.response.data))
        : err?.message ?? 'Erro desconhecido';
      window.alert(`Erro ao exportar: ${msg}`);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Trajetos</h1>
      <Card className="flex flex-wrap gap-2 items-end">
        <div>
          <p className="text-xs uppercase text-slate-500">Placa</p>
          <Input placeholder="Filtrar placa" value={plate} onChange={(e) => { setPlate(e.target.value); setPage(1); }} />
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">De</p>
          <Input type="datetime-local" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Até</p>
          <Input type="datetime-local" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Status</p>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Todos os status</option>
            <option value="EM_ANDAMENTO">EM_ANDAMENTO</option>
            <option value="CONCLUIDO_OK">CONCLUIDO_OK</option>
            <option value="CONCLUIDO_ATENCAO">CONCLUIDO_ATENCAO</option>
            <option value="CANCELADO">CANCELADO</option>
            <option value="SEM_SAIDA">SEM_SAIDA</option>
            <option value="INCONSISTENTE">INCONSISTENTE</option>
          </Select>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Tipo</p>
          <Select value={filterTipo} onChange={(e) => { setFilterTipo(e.target.value); setFilterSubSegment(''); setPage(1); }}>
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
            <Select value={filterSubSegment} onChange={(e) => { setFilterSubSegment(e.target.value); setPage(1); }}>
              <option value="">Todos</option>
              {subtiposForFilter.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
        )}
        <div>
          <p className="text-xs uppercase text-slate-500">Gratuidade</p>
          <Select value={filterGratuidade} onChange={(e) => { setFilterGratuidade(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            <option value="true">Somente gratuidade</option>
            <option value="false">Sem gratuidade</option>
          </Select>
        </div>
        <div className="flex gap-2 pt-4">
          <Button className="h-9 text-sm" onClick={() => exportFile('csv')}>Exportar CSV</Button>
          <Button className="h-9 text-sm" onClick={() => exportFile('pdf')}>Exportar PDF</Button>
        </div>
      </Card>
      <Card className="flex flex-wrap gap-2">
        <p className="text-sm font-semibold text-slate-700">Total filtrado: {summary?.totalFiltered ?? 0}</p>
        <Badge>EM_ANDAMENTO: {summary?.emAndamento ?? 0}</Badge>
        <Badge>CONCLUIDO_OK: {summary?.concluidoOk ?? 0}</Badge>
        <Badge>CONCLUIDO_ATENCAO: {summary?.concluidoAtencao ?? 0}</Badge>
        <Badge>CANCELADO: {summary?.cancelado ?? 0}</Badge>
        <Badge>SEM_SAIDA: {summary?.semSaida ?? 0}</Badge>
        <Badge>INCONSISTENTE: {summary?.inconsistente ?? 0}</Badge>
        <Badge>PENDENTE_VALIDACAO: {summary?.pendenteValidacao ?? 0}</Badge>
      </Card>
      <Card>
        {isLoading ? <p>Carregando...</p> : (
          <>
            <Table>
              <thead><tr><th>Placa</th><th>Tipo</th><th>Origem</th><th>Destino</th><th>Início</th><th>Fim</th><th>Status</th><th>Severidade</th></tr></thead>
              <tbody>
                {rows.map((item: any) => (
                  <tr key={item.id} className={`border-t border-slate-100${item.vehicle?.isGratuidade ? ' bg-yellow-50' : ''}`}>
                    <td>
                      <span>{item.plate}</span>
                      {item.vehicle?.isGratuidade && (
                        <Badge className="ml-1 bg-yellow-200 text-yellow-800 text-xs">{item.vehicle.gratuidadeType || 'Gratuidade'}</Badge>
                      )}
                    </td><td>{item.vehicle?.categoryType || '-'}</td><td>{item.startLocal?.name}</td><td>{item.endLocal?.name || '-'}</td><td>{formatDateTime(item.startedAt)}</td><td>{formatDateTime(item.endedAt)}</td><td><Badge>{item.currentStatus}</Badge></td><td>{item.severity}</td>
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
