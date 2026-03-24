import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button, Card } from '../components/ui';

export function ReportsPage() {
  const { data } = useQuery({ queryKey: ['reports'], queryFn: async () => (await api.get('/reports')).data });

  const exportCsv = async () => {
    const response = await api.get('/reports/csv');
    const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reports-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4"><h1 className="text-xl font-semibold">Relatórios</h1>
      <Card className="space-y-2">
        <p className="text-sm">Leituras: {data?.readings?.length || 0}</p>
        <p className="text-sm">Trajetos: {data?.trips?.length || 0}</p>
        <p className="text-sm">Alertas: {data?.alerts?.length || 0}</p>
        <p className="text-sm">Pesados checados: {data?.heavyChecks?.length || 0}</p>
        <Button onClick={exportCsv}>Exportar CSV/JSON</Button>
      </Card>
    </div>
  );
}
