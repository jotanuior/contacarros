import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button, Card, Input, Pagination, Select, Table } from '../components/ui';
import { useMemo, useState } from 'react';

type QuantitativeRow = {
  tipo: string;
  quantidade: number;
};

type QuantitativeResponse = {
  period: {
    from: string;
    to: string;
  };
  total: number;
  rows: QuantitativeRow[];
};

type DescriptiveRow = {
  capturedAt: string;
  plate: string;
  tipo: string;
  marcaModelo: string;
  local: string;
  camera: string;
  confianca: string;
  status: string;
};

type DescriptiveResponse = {
  data: DescriptiveRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

function localDatetime(offsetMinutes: number) {
  const d = new Date(Date.now() + offsetMinutes * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function toISO(val: string): string | undefined {
  if (!val) return undefined;
  return new Date(val).toISOString();
}

export function ReportsPage() {
  const todayStart = useMemo(() => localDatetime(-23 * 60 - 59), []);
  const todayEnd = useMemo(() => localDatetime(0), []);

  const [fromDate, setFromDate] = useState(todayStart.slice(0, 10) + 'T00:00');
  const [toDate, setToDate] = useState(todayEnd.slice(0, 10) + 'T23:59');
  const [mode, setMode] = useState<'quantitative' | 'descriptive'>('quantitative');
  const [filterTipo, setFilterTipo] = useState('');
  const [plate, setPlate] = useState('');
  const [localId, setLocalId] = useState('');
  const [cameraId, setCameraId] = useState('');
  const [filterGratuidade, setFilterGratuidade] = useState('');
  const [page, setPage] = useState(1);

  const { data: locations } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['report-locations'],
    queryFn: async () => {
      const response = await api.get('/locations', { params: { page: 1, limit: 200 } });
      return response.data?.data || [];
    },
  });

  const { data: cameras } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['report-cameras'],
    queryFn: async () => {
      const response = await api.get('/cameras', { params: { page: 1, limit: 200 } });
      return response.data?.data || [];
    },
  });

  const queryParams = {
    from: toISO(fromDate),
    to: toISO(toDate),
    tipo: filterTipo || undefined,
    plate: plate || undefined,
    localId: localId || undefined,
    cameraId: cameraId || undefined,
    isGratuidade: filterGratuidade === '' ? undefined : filterGratuidade,
    page,
    limit: 20,
  };

  const { data: quantitativeData, isLoading: loadingQuantitative } = useQuery<QuantitativeResponse>({
    queryKey: ['reports-quantitative', fromDate, toDate, filterTipo, plate, localId, cameraId, filterGratuidade],
    enabled: mode === 'quantitative',
    queryFn: async () => (await api.get('/reports/quantitative', { params: queryParams })).data,
  });

  const { data: descriptiveData, isLoading: loadingDescriptive } = useQuery<DescriptiveResponse>({
    queryKey: ['reports-descriptive', fromDate, toDate, filterTipo, plate, localId, cameraId, filterGratuidade, page],
    enabled: mode === 'descriptive',
    queryFn: async () => (await api.get('/reports/descriptive', { params: queryParams })).data,
  });

  const isLoading = loadingQuantitative || loadingDescriptive;
  const totalFiltered = mode === 'quantitative' ? (quantitativeData?.total || 0) : (descriptiveData?.total || 0);

  const exportFile = async (format: 'csv' | 'xls' | 'pdf') => {
    try {
      const response = await api.get('/reports/export', {
        params: { mode, format, ...queryParams, page: undefined, limit: undefined },
        responseType: 'blob',
      });

      const contentType = response.headers?.['content-type'] ?? '';
      if (contentType.includes('application/json')) {
        const text = await (response.data as Blob).text();
        window.alert(`Erro ao exportar: ${text}`);
        return;
      }

      const mimeByFormat: Record<'csv' | 'xls' | 'pdf', string> = {
        csv: 'text/csv;charset=utf-8',
        xls: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        pdf: 'application/pdf',
      };

      const extensionByFormat: Record<'csv' | 'xls' | 'pdf', string> = {
        csv: 'csv',
        xls: 'xlsx',
        pdf: 'pdf',
      };

      const blob = new Blob([response.data], { type: mimeByFormat[format] });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateToken = fromDate.slice(0, 10);
      a.download = `relatorio-${mode}-${dateToken}.${extensionByFormat[format]}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      const msg = err?.response?.data
        ? await (err.response.data as Blob).text?.().catch(() => String(err.response.data))
        : err?.message ?? 'Erro desconhecido';
      window.alert(`Erro ao exportar: ${msg}`);
    }
  };

  if (isLoading) return <p>Carregando relatórios...</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Relatórios</h1>

      <Card className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
        <div>
          <p className="text-xs uppercase text-slate-500">Modo</p>
          <Select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as 'quantitative' | 'descriptive');
              setPage(1);
            }}
          >
            <option value="quantitative">Quantitativo</option>
            <option value="descriptive">Descritivo (lista)</option>
          </Select>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Data/hora inicial</p>
          <Input type="datetime-local" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} />
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Data/hora final</p>
          <Input type="datetime-local" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} />
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Tipo</p>
          <Select value={filterTipo} onChange={(e) => { setFilterTipo(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            <option value="CAMINHAO">Caminhão</option>
            <option value="ONIBUS">Ônibus</option>
            <option value="CARRO">Carro</option>
            <option value="OUTRO">Outro</option>
            <option value="DESCONHECIDO">Desconhecido</option>
          </Select>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Placa</p>
          <Input placeholder="Filtrar placa" value={plate} onChange={(e) => { setPlate(e.target.value); setPage(1); }} />
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Local</p>
          <Select value={localId} onChange={(e) => { setLocalId(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            {(locations || []).map((location) => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Câmera</p>
          <Select value={cameraId} onChange={(e) => { setCameraId(e.target.value); setPage(1); }}>
            <option value="">Todas</option>
            {(cameras || []).map((camera) => (
              <option key={camera.id} value={camera.id}>{camera.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Gratuidade</p>
          <Select value={filterGratuidade} onChange={(e) => { setFilterGratuidade(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            <option value="true">Somente gratuidade</option>
            <option value="false">Sem gratuidade</option>
          </Select>
        </div>
      </Card>

      <Card className="space-y-3">
        <p className="text-sm">Total filtrado: <strong>{totalFiltered}</strong></p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => exportFile('pdf')}>Exportar PDF</Button>
          <Button onClick={() => exportFile('csv')}>Exportar CSV</Button>
          <Button onClick={() => exportFile('xls')}>Exportar XLS</Button>
        </div>
      </Card>

      <Card>
        {mode === 'quantitative' && (quantitativeData?.rows || []).length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">Nenhum registro encontrado para os filtros selecionados.</p>
        ) : mode === 'quantitative' ? (
          <Table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Quantidade</th>
              </tr>
            </thead>
            <tbody>
              {(quantitativeData?.rows || []).map((row) => (
                <tr key={`${row.tipo}`} className="border-t border-slate-100">
                  <td>{row.tipo}</td>
                  <td>{row.quantidade}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (descriptiveData?.data || []).length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">Nenhum registro encontrado para os filtros selecionados.</p>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <th>Data/hora</th>
                  <th>Placa</th>
                  <th>Tipo</th>
                  <th>Marca/Modelo</th>
                  <th>Local</th>
                  <th>Câmera</th>
                  <th>Confiança</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(descriptiveData?.data || []).map((row) => (
                  <tr key={`${row.capturedAt}-${row.plate}-${row.camera}`} className="border-t border-slate-100">
                    <td>{new Date(row.capturedAt).toLocaleString('pt-BR')}</td>
                    <td>{row.plate}</td>
                    <td>{row.tipo}</td>
                    <td>{row.marcaModelo}</td>
                    <td>{row.local}</td>
                    <td>{row.camera}</td>
                    <td>{row.confianca}</td>
                    <td>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={descriptiveData?.page || 1} totalPages={descriptiveData?.totalPages || 1} onPage={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
