import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button, Card, Input, Table } from '../components/ui';
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

export function ReportsPage() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);

  const { data, isLoading } = useQuery<QuantitativeResponse>({
    queryKey: ['reports-quantitative', fromDate, toDate],
    queryFn: async () => (await api.get('/reports/quantitative', { params: { from: fromDate, to: toDate } })).data,
  });

  const exportFile = async (format: 'csv' | 'xls' | 'pdf') => {
    const response = await api.get('/reports/quantitative/export', {
      params: { format, from: fromDate, to: toDate },
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
    a.download = `quantitativo-tipo-subtipo-${fromDate}-${toDate}.${extensionByFormat[format]}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <p>Carregando relatórios...</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Relatórios</h1>

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

      <Card className="space-y-3">
        <p className="text-sm">Total no período: {data?.total || 0}</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => exportFile('pdf')}>Exportar PDF</Button>
          <Button onClick={() => exportFile('csv')}>Exportar CSV</Button>
          <Button onClick={() => exportFile('xls')}>Exportar XLS</Button>
        </div>
      </Card>

      <Card>
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
      </Card>
    </div>
  );
}
