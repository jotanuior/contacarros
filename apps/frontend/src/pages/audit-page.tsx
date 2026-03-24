import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, Pagination, Table } from '../components/ui';
import { formatDateTime } from '../lib/utils';
import { useState } from 'react';

export function AuditPage() {
  const [page, setPage] = useState(1);
  const { data } = useQuery({
    queryKey: ['audit-logs', page],
    queryFn: async () => (await api.get('/audit-logs', { params: { page, limit: 20 } })).data,
  });

  const rows: any[] = data?.data ?? [];
  const totalPages: number = data?.totalPages ?? 1;

  return (
    <div className="space-y-4"><h1 className="text-xl font-semibold">Auditoria</h1>
      <Card>
        <Table><thead><tr><th>Data/hora</th><th>Usuário</th><th>Ação</th><th>Entidade</th><th>Descrição</th><th>IP</th></tr></thead><tbody>{rows.map((l: any) => <tr key={l.id} className="border-t border-slate-100"><td>{formatDateTime(l.createdAt)}</td><td>{l.user?.name || '-'}</td><td>{l.action}</td><td>{l.entityType}</td><td>{l.description}</td><td>{l.ip || '-'}</td></tr>)}</tbody></Table>
        <Pagination page={page} totalPages={totalPages} onPage={setPage} />
      </Card>
    </div>
  );
}
