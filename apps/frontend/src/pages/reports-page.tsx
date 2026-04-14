import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button, Card, Input, Select, Table } from '../components/ui';
import { useMemo, useState } from 'react';

type QuantitativeRow = {
  tipo: string;
  subtipo: string;
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
  const [filterTipo, setFilterTipo] = useState('');
  const [filterSubtipo, setFilterSubtipo] = useState('');

  const { data: vehicleSegments } = useQuery<string[]>({
    queryKey: ['reports-vehicle-segments'],
    queryFn: async () => (await api.get('/reports/vehicle-segments')).data,
  });

  const allSubtypes = vehicleSegments || [];

  const queryParams = {
    from: toISO(fromDate),
    to: toISO(toDate),
    tipo: filterTipo || undefined,
    subtipo: filterSubtipo || undefined,
  };

  const { data, isLoading } = useQuery<QuantitativeResponse>({
    queryKey: ['reports-quantitative', fromDate, toDate, filterTipo, filterSubtipo],
    queryFn: async () => (await api.get('/reports/quantitative', { params: queryParams })).data,
  });

  const exportFile = async (format: 'csv' | 'xls' | 'pdf') => {
    const response = await api.get('/reports/quantitative/export', {
      params: { format, ...queryParams },
      responseType: 'blob',
    });

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
    a.download = `quantitativo-tipo-subtipo-${dateToken}.${extensionByFormat[format]}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <p>Carregando relatórios...</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Relatórios</h1>

      <Card className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
        <div>
          <p className="text-xs uppercase text-slate-500">Data/hora inicial</p>
          <Input type="datetime-local" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Data/hora final</p>
          <Input type="datetime-local" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Tipo</p>
          <Select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)}>
            <option value="">Todos</option>
            <option value="CAMINHAO">Caminhão</option>
            <option value="ONIBUS">Ônibus</option>
            <option value="CARRO">Carro</option>
          </Select>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Subtipo</p>
          <Select value={filterSubtipo} onChange={(e) => setFilterSubtipo(e.target.value)}>
            <option value="">Todos</option>
            {allSubtypes.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </div>
      </Card>

      <Card className="space-y-3">
        <p className="text-sm">Total no período: <strong>{data?.total || 0}</strong></p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => exportFile('pdf')}>Exportar PDF</Button>
          <Button onClick={() => exportFile('csv')}>Exportar CSV</Button>
          <Button onClick={() => exportFile('xls')}>Exportar XLS</Button>
        </div>
      </Card>

      <Card>
        {(data?.rows || []).length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">Nenhum registro encontrado para os filtros selecionados.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Subtipo</th>
                <th>Quantidade</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows || []).map((row) => (
                <tr key={`${row.tipo}-${row.subtipo}`} className="border-t border-slate-100">
                  <td>{row.tipo}</td>
                  <td>{row.subtipo}</td>
                  <td>{row.quantidade}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
