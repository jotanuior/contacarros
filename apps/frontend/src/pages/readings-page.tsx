import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

const appBasePath = (import.meta.env.VITE_APP_BASE_PATH || '/').replace(/\/+$/g, '') || '';

function normalizeReadingImageUrl(imageUrl: string | undefined, plate: string) {
  const fallback = `${appBasePath}/api/media/vehicles/${plate}.jpg`;

  if (!imageUrl) {
    return fallback;
  }

  let fixed = imageUrl
    .replace('/contacarros/media/', '/contacarros/api/media/')
    .replace('/media/vehicles/', '/api/media/vehicles/');

  if (fixed.startsWith('/api/')) {
    fixed = `${appBasePath}${fixed}`;
  }

  return fixed;
}

export function ReadingsPage() {
  const [plate, setPlate] = useState('');
  const [page, setPage] = useState(1);
  const [to, setTo] = useState(() => toDateTimeLocal(new Date()));
  const [from, setFrom] = useState(() => toDateTimeLocal(new Date(Date.now() - 24 * 60 * 60 * 1000)));
  const [filterTipo, setFilterTipo] = useState('');
  const [filterSubSegment, setFilterSubSegment] = useState('');
  const [filterGratuidade, setFilterGratuidade] = useState('');
  const [selectedImage, setSelectedImage] = useState<{ url: string; plate: string } | null>(null);
  const [categoryChoices, setCategoryChoices] = useState<Record<string, string>>({});
  const [subCategoryChoices, setSubCategoryChoices] = useState<Record<string, string>>({});
  const [correctTarget, setCorrectTarget] = useState<{ plate: string; categoryType: string; subSegment: string } | null>(null);
  const [correctForm, setCorrectForm] = useState({ newPlate: '', categoryType: '', subSegment: '', justification: '' });
  const queryClient = useQueryClient();

  const { data: subtypeOptions } = useQuery<HeavySubtypeOptions>({
    queryKey: ['heavy-subtypes'],
    queryFn: async () => (await api.get('/heavy-checks/subtypes')).data,
  });

  const subtiposForFilter = useMemo(() => {
    if (!filterTipo) return [];
    if (filterTipo === 'CAMINHAO') return subtypeOptions?.truckSubtypes ?? [];
    if (filterTipo === 'ONIBUS') return subtypeOptions?.busSubtypes ?? [];
    return [];
  }, [filterTipo, subtypeOptions]);

  const queryParams = {
    plate: plate || undefined,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(to).toISOString() : undefined,
    categoryType: filterTipo || undefined,
    subSegment: filterSubSegment || undefined,
    isGratuidade: filterGratuidade === '' ? undefined : filterGratuidade,
    page,
    limit: 20,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['readings', plate, from, to, filterTipo, filterSubSegment, filterGratuidade, page],
    queryFn: async () => (await api.get('/lpr/readings', { params: queryParams })).data,
  });

  const rows: any[] = data?.data ?? [];
  const totalPages: number = data?.totalPages ?? 1;

  const categorizeMutation = useMutation({
    mutationFn: async ({ plate: p, categoryType, subSegment }: { plate: string; categoryType: string; subSegment?: string }) =>
      api.patch(`/vehicles/${p}/categorize`, { categoryType, subSegment: subSegment || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['readings'] });
      setCategoryChoices({});
      setSubCategoryChoices({});
    },
    onError: (error: any) => {
      window.alert(error?.response?.data?.message ?? 'Falha ao categorizar veículo');
    },
  });

  const needsCategorization = (item: any) =>
    ['OUTRO', 'DESCONHECIDO'].includes(item.vehicle?.categoryType) || !item.vehicle?.categoryType;

  const correctMutation = useMutation({
    mutationFn: async ({ plate: p, ...body }: { plate: string; newPlate?: string; categoryType?: string; subSegment?: string; justification: string }) =>
      api.patch(`/vehicles/${p}/correct`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['readings'] });
      setCorrectTarget(null);
      setCorrectForm({ newPlate: '', categoryType: '', subSegment: '', justification: '' });
    },
    onError: (error: any) => {
      window.alert(error?.response?.data?.message ?? 'Falha ao corrigir veículo');
    },
  });

  const openCorrectModal = (item: any) => {
    setCorrectTarget({ plate: item.normalizedPlate, categoryType: item.vehicle?.categoryType ?? '', subSegment: item.vehicle?.subSegment ?? '' });
    setCorrectForm({ newPlate: '', categoryType: item.vehicle?.categoryType ?? '', subSegment: item.vehicle?.subSegment ?? '', justification: '' });
  };

  const subtiposForCorrect = useMemo(() => {
    if (correctForm.categoryType === 'CAMINHAO') return subtypeOptions?.truckSubtypes ?? [];
    if (correctForm.categoryType === 'ONIBUS') return subtypeOptions?.busSubtypes ?? [];
    return [];
  }, [correctForm.categoryType, subtypeOptions]);

  const exportFile = async (format: 'csv' | 'pdf') => {
    try {
      const response = await api.get('/lpr/readings/export', {
        params: { format, ...queryParams, page: undefined, limit: undefined },
        responseType: 'blob',
      });

      // If the server returned an error JSON inside a blob, surface it
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
      a.download = `leituras.${format}`;
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
      <h1 className="text-xl font-semibold">Leituras</h1>
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
      <Card>
        {isLoading ? <p>Carregando...</p> : (
          <>
            <Table>
              <thead><tr><th>Data/hora</th><th>Placa</th><th>Marca/Modelo</th><th>Tipo</th><th>Local</th><th>Câmera</th><th>Confiança</th><th>Duplicada</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.map((item: any) => (
                  <tr key={item.id} className={`border-t border-slate-100${item.vehicle?.isGratuidade ? ' bg-yellow-50' : ''}`}>
                    <td>{formatDateTime(item.capturedAt)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        {item.imageUrl || item.normalizedPlate ? (
                          <button
                            type="button"
                            className="rounded border border-slate-200"
                            onClick={() => setSelectedImage({
                              url: normalizeReadingImageUrl(item.imageUrl, item.normalizedPlate),
                              plate: item.normalizedPlate,
                            })}
                            title="Clique para ampliar"
                          >
                            <img
                              src={normalizeReadingImageUrl(item.imageUrl, item.normalizedPlate)}
                              alt={`Veículo ${item.normalizedPlate}`}
                              className="h-10 w-16 rounded object-cover"
                              loading="lazy"
                              onError={(event) => {
                                const image = event.currentTarget;
                                if (image.dataset.fallbackTried === '1') {
                                  image.style.display = 'none';
                                  return;
                                }

                                image.dataset.fallbackTried = '1';
                                image.src = `${appBasePath}/api/media/vehicles/${item.normalizedPlate}.jpg`;
                              }}
                            />
                          </button>
                        ) : null}
                        <span>{item.normalizedPlate}</span>
                        {item.vehicle?.isGratuidade && (
                          <Badge className="bg-yellow-200 text-yellow-800 text-xs">{item.vehicle.gratuidadeType || 'Gratuidade'}</Badge>
                        )}
                      </div>
                    </td>
                    <td>{`${item.vehicle?.brand || '-'} ${item.vehicle?.model || ''}`}</td>
                    <td>
                      {needsCategorization(item) ? (
                        <div className="flex flex-col gap-1">
                          <Select
                            className="h-8 w-36 text-xs"
                            value={categoryChoices[item.id] ?? ''}
                            onChange={(e) => {
                              setCategoryChoices((prev) => ({ ...prev, [item.id]: e.target.value }));
                              setSubCategoryChoices((prev) => ({ ...prev, [item.id]: '' }));
                            }}
                          >
                            <option value="">{item.vehicle?.categoryType || 'Categorizar'}</option>
                            <option value="CARRO">Carro</option>
                            <option value="CAMINHAO">Caminhão</option>
                            <option value="ONIBUS">Ônibus</option>
                          </Select>
                          {(categoryChoices[item.id] === 'CAMINHAO' || categoryChoices[item.id] === 'ONIBUS') && (
                            <Select
                              className="h-8 w-36 text-xs"
                              value={subCategoryChoices[item.id] ?? ''}
                              onChange={(e) => setSubCategoryChoices((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            >
                              <option value="">Subtipo (opcional)</option>
                              {(categoryChoices[item.id] === 'CAMINHAO'
                                ? subtypeOptions?.truckSubtypes
                                : subtypeOptions?.busSubtypes
                              )?.map((s) => <option key={s} value={s}>{s}</option>)}
                            </Select>
                          )}
                          {categoryChoices[item.id] ? (
                            <Button
                              className="h-7 px-2 text-xs"
                              disabled={categorizeMutation.isPending}
                              onClick={() => categorizeMutation.mutate({ plate: item.normalizedPlate, categoryType: categoryChoices[item.id], subSegment: subCategoryChoices[item.id] })}
                            >
                              Salvar
                            </Button>
                          ) : null}
                        </div>
                      ) : (
                        <span>{item.vehicle?.categoryType || '-'}{item.vehicle?.subSegment ? ` / ${item.vehicle.subSegment}` : ''}</span>
                      )}
                    </td>
                    <td>{item.location?.name}</td>
                    <td>{item.camera?.name}</td>
                    <td>{item.confidence ?? '-'}</td>
                    <td>{item.isDuplicate ? <Badge className="bg-amber-100 text-amber-700">Sim</Badge> : 'Não'}</td>
                    <td>{item.processingStatus}</td>
                    <td>
                      <Button className="h-7 px-2 text-xs bg-slate-600 hover:bg-slate-500" onClick={() => openCorrectModal(item)}>
                        Corrigir
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} totalPages={totalPages} onPage={setPage} />
          </>
        )}
      </Card>

      {correctTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setCorrectTarget(null)}>
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-800">Corrigir veículo — {correctTarget.plate}</h2>

            <div>
              <p className="text-xs uppercase text-slate-500 mb-1">Nova placa (deixe em branco para manter)</p>
              <Input
                placeholder={correctTarget.plate}
                value={correctForm.newPlate}
                onChange={(e) => setCorrectForm((f) => ({ ...f, newPlate: e.target.value.toUpperCase() }))}
              />
            </div>

            <div>
              <p className="text-xs uppercase text-slate-500 mb-1">Tipo</p>
              <Select
                value={correctForm.categoryType}
                onChange={(e) => setCorrectForm((f) => ({ ...f, categoryType: e.target.value, subSegment: '' }))}
              >
                <option value="">Manter atual ({correctTarget.categoryType || '-'})</option>
                <option value="CARRO">Carro</option>
                <option value="CAMINHAO">Caminhão</option>
                <option value="ONIBUS">Ônibus</option>
                <option value="OUTRO">Outro</option>
              </Select>
            </div>

            {(correctForm.categoryType === 'CAMINHAO' || correctForm.categoryType === 'ONIBUS') && (
              <div>
                <p className="text-xs uppercase text-slate-500 mb-1">Subtipo</p>
                <Select
                  value={correctForm.subSegment}
                  onChange={(e) => setCorrectForm((f) => ({ ...f, subSegment: e.target.value }))}
                >
                  <option value="">Nenhum / manter atual</option>
                  {subtiposForCorrect.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>
            )}

            <div>
              <p className="text-xs uppercase text-slate-500 mb-1">Justificativa <span className="text-red-500">*</span></p>
              <Input
                placeholder="Descreva o motivo da correção"
                value={correctForm.justification}
                onChange={(e) => setCorrectForm((f) => ({ ...f, justification: e.target.value }))}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                disabled={!correctForm.justification.trim() || correctMutation.isPending}
                onClick={() => correctMutation.mutate({
                  plate: correctTarget.plate,
                  newPlate: correctForm.newPlate.trim() || undefined,
                  categoryType: correctForm.categoryType || undefined,
                  subSegment: correctForm.subSegment || undefined,
                  justification: correctForm.justification.trim(),
                })}
              >
                Salvar correção
              </Button>
              <Button className="bg-slate-500 hover:bg-slate-400" onClick={() => setCorrectTarget(null)}>Cancelar</Button>
            </div>
          </div>
        </div>
      ) : null}

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
              onError={(event) => {
                const image = event.currentTarget;
                if (image.dataset.fallbackTried === '1') {
                  return;
                }

                image.dataset.fallbackTried = '1';
                image.src = `${appBasePath}/api/media/vehicles/${selectedImage.plate}.jpg`;
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
