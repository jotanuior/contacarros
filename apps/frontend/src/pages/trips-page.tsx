import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Badge, Card, Input, Pagination, Select, Table } from '../components/ui';
import { useState } from 'react';
import { formatDateTime } from '../lib/utils';

export function TripsPage() {
  const [plate, setPlate] = useState('');
  const [status, setStatus] = useState('');
  const [filterGratuidade, setFilterGratuidade] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['trips', plate, status, filterGratuidade, page],
    queryFn: async () => (await api.get('/trips', { params: { plate: plate || undefined, status: status || undefined, isGratuidade: filterGratuidade || undefined, page, limit: 20 } })).data,
  });

  const rows: any[] = data?.data ?? [];
  const totalPages: number = data?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Trajetos</h1>
      <Card className="flex gap-2 flex-wrap">
        <Input value={plate} onChange={(e) => { setPlate(e.target.value); setPage(1); }} placeholder="Placa" />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Todos os status</option>
          <option value="EM_ANDAMENTO">EM_ANDAMENTO</option>
          <option value="CONCLUIDO_OK">CONCLUIDO_OK</option>
          <option value="CONCLUIDO_ATENCAO">CONCLUIDO_ATENCAO</option>
          <option value="CANCELADO">CANCELADO</option>
          <option value="SEM_SAIDA">SEM_SAIDA</option>
          <option value="INCONSISTENTE">INCONSISTENTE</option>
        </Select>
        <Select value={filterGratuidade} onChange={(e) => { setFilterGratuidade(e.target.value); setPage(1); }}>
          <option value="">Todos (gratuidade)</option>
          <option value="true">Somente gratuidade</option>
          <option value="false">Sem gratuidade</option>
        </Select>
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
