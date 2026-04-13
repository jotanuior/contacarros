import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Badge, Card, Input, Pagination, Table } from '../components/ui';
import { useState } from 'react';
import { formatDateTime } from '../lib/utils';

function toDateTimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function ReadingsPage() {
  const [plate, setPlate] = useState('');
  const [page, setPage] = useState(1);
  const [to, setTo] = useState(() => toDateTimeLocal(new Date()));
  const [from, setFrom] = useState(() => toDateTimeLocal(new Date(Date.now() - 24 * 60 * 60 * 1000)));
  const [selectedImage, setSelectedImage] = useState<{ url: string; plate: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['readings', plate, from, to, page],
    queryFn: async () =>
      (
        await api.get('/lpr/readings', {
          params: {
            plate: plate || undefined,
            from: from ? new Date(from).toISOString() : undefined,
            to: to ? new Date(to).toISOString() : undefined,
            page,
            limit: 20,
          },
        })
      ).data,
  });

  const rows: any[] = data?.data ?? [];
  const totalPages: number = data?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Leituras</h1>
      <Card className="flex gap-2">
        <Input placeholder="Filtrar placa" value={plate} onChange={(e) => { setPlate(e.target.value); setPage(1); }} />
        <Input type="datetime-local" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        <Input type="datetime-local" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
      </Card>
      <Card>
        {isLoading ? <p>Carregando...</p> : (
          <>
            <Table>
              <thead><tr><th>Data/hora</th><th>Placa</th><th>Marca/Modelo</th><th>Tipo</th><th>Local</th><th>Câmera</th><th>Confiança</th><th>Duplicada</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((item: any) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td>{formatDateTime(item.capturedAt)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        {item.imageUrl ? (
                          <button
                            type="button"
                            className="rounded border border-slate-200"
                            onClick={() => setSelectedImage({ url: item.imageUrl, plate: item.normalizedPlate })}
                            title="Clique para ampliar"
                          >
                            <img
                              src={item.imageUrl}
                              alt={`Veículo ${item.normalizedPlate}`}
                              className="h-10 w-16 rounded object-cover"
                              loading="lazy"
                            />
                          </button>
                        ) : null}
                        <span>{item.normalizedPlate}</span>
                      </div>
                    </td>
                    <td>{`${item.vehicle?.brand || '-'} ${item.vehicle?.model || ''}`}</td>
                    <td>{item.vehicle?.categoryType || '-'}</td>
                    <td>{item.location?.name}</td>
                    <td>{item.camera?.name}</td>
                    <td>{item.confidence ?? '-'}</td>
                    <td>{item.isDuplicate ? <Badge className="bg-amber-100 text-amber-700">Sim</Badge> : 'Não'}</td>
                    <td>{item.processingStatus}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} totalPages={totalPages} onPage={setPage} />
          </>
        )}
      </Card>

      {selectedImage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="max-h-full w-full max-w-5xl rounded-lg bg-white p-3 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Placa {selectedImage.plate}</h2>
              <button
                type="button"
                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                onClick={() => setSelectedImage(null)}
              >
                Fechar
              </button>
            </div>
            <img
              src={selectedImage.url}
              alt={`Imagem ampliada ${selectedImage.plate}`}
              className="max-h-[80vh] w-full rounded object-contain"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
