import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button, Card, Input, Select, Table } from '../components/ui';
import { useState } from 'react';
import { formatDateTime } from '../lib/utils';

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

type HeavySubtypeOptions = {
  truckSubtypes: string[];
  busSubtypes: string[];
};

type HeavyPendingItem = {
  id: string;
  vehicleId: string;
  capturedAt: string;
  normalizedPlate: string;
  imageUrl?: string;
  location?: { name: string };
  vehicle?: { model?: string; categoryType?: string };
};

type RowForm = {
  categoryType: 'CARRO' | 'CAMINHAO' | 'ONIBUS';
  subtype: string;
  notes: string;
};

export function HeavyPage() {
  const queryClient = useQueryClient();
  const [formByReadingId, setFormByReadingId] = useState<Record<string, RowForm>>({});
  const [selectedImage, setSelectedImage] = useState<{ url: string; plate: string } | null>(null);

  const { data } = useQuery<HeavyPendingItem[]>({
    queryKey: ['heavy-pending'],
    queryFn: async () => (await api.get('/heavy-checks/pending')).data,
  });

  const { data: subtypeOptions } = useQuery<HeavySubtypeOptions>({
    queryKey: ['heavy-subtypes'],
    queryFn: async () => (await api.get('/heavy-checks/subtypes')).data,
  });

  function getSubtypeOptionsByCategory(categoryType?: string) {
    if (categoryType === 'ONIBUS') {
      return subtypeOptions?.busSubtypes || [];
    }

    if (categoryType === 'CAMINHAO') {
      return subtypeOptions?.truckSubtypes || [];
    }

    return [...(subtypeOptions?.truckSubtypes || []), ...(subtypeOptions?.busSubtypes || [])];
  }

  function getDefaultSubtype(item: HeavyPendingItem) {
    return getSubtypeOptionsByCategory(item.vehicle?.categoryType)[0] || '';
  }

  function getDefaultCategory(item: HeavyPendingItem): 'CARRO' | 'CAMINHAO' | 'ONIBUS' {
    if (item.vehicle?.categoryType === 'ONIBUS') return 'ONIBUS';
    if (item.vehicle?.categoryType === 'CAMINHAO') return 'CAMINHAO';
    return 'CAMINHAO';
  }

  function getRowForm(item: HeavyPendingItem): RowForm {
    return formByReadingId[item.id] || {
      categoryType: getDefaultCategory(item),
      subtype: getDefaultSubtype(item),
      notes: '',
    };
  }

  function updateRowForm(item: HeavyPendingItem, patch: Partial<RowForm>) {
    setFormByReadingId((current) => {
      const previous = current[item.id] || getRowForm(item);
      return {
        ...current,
        [item.id]: {
          ...previous,
          ...patch,
        },
      };
    });
  }

  const heavyCheckMutation = useMutation({
    mutationFn: async (payload: any) => api.post('/heavy-checks', payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['heavy-pending'] });
      if (variables?.readingId) {
        setFormByReadingId((current) => {
          const next = { ...current };
          delete next[variables.readingId];
          return next;
        });
      }
    },
    onError: () => {
      window.alert('Falha ao registrar checagem. Verifique os dados e tente novamente.');
    },
  });

  const categorizeMutation = useMutation({
    mutationFn: async (payload: { plate: string; categoryType: 'CARRO' | 'CAMINHAO' | 'ONIBUS'; subSegment?: string }) =>
      api.patch(`/vehicles/${payload.plate}/categorize`, {
        categoryType: payload.categoryType,
        subSegment: payload.subSegment || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['heavy-pending'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['readings'] });
    },
    onError: (error: any) => {
      window.alert(error?.response?.data?.message ?? 'Falha ao recategorizar veículo.');
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Veículos pesados</h1>
      <Card>
        <Table>
          <thead><tr><th>Horário</th><th>Placa</th><th>Modelo</th><th>Local</th><th>Tipo</th><th>Subtipo</th><th>Ação</th></tr></thead>
          <tbody>
            {(data || []).map((item) => {
              const rowForm = getRowForm(item);
              const options = getSubtypeOptionsByCategory(rowForm.categoryType);
              const effectiveSubtype = options.includes(rowForm.subtype) ? rowForm.subtype : (options[0] || '');

              return (
              <tr key={item.id} className="border-t border-slate-100">
                <td>{formatDateTime(item.capturedAt)}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded border border-slate-200"
                      onClick={() => setSelectedImage({
                        url: normalizeReadingImageUrl(item.imageUrl, item.normalizedPlate),
                        plate: item.normalizedPlate,
                      })}
                      title="Miniatura da placa"
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
                    <span>{item.normalizedPlate}</span>
                  </div>
                </td>
                <td>{item.vehicle?.model || '-'}</td>
                <td>{item.location?.name}</td>
                <td>
                  <Select
                    value={rowForm.categoryType}
                    onChange={(e) => {
                      const nextType = e.target.value as 'CARRO' | 'CAMINHAO' | 'ONIBUS';
                      const nextSubtypeOptions = getSubtypeOptionsByCategory(nextType);
                      updateRowForm(item, {
                        categoryType: nextType,
                        subtype: nextType === 'CARRO' ? '' : (nextSubtypeOptions[0] || ''),
                      });
                    }}
                  >
                    <option value="CARRO">CARRO</option>
                    <option value="CAMINHAO">CAMINHAO</option>
                    <option value="ONIBUS">ONIBUS</option>
                  </Select>
                </td>
                <td>
                  {rowForm.categoryType === 'CARRO' ? (
                    <div className="h-9 flex items-center text-sm text-slate-500">Não se aplica</div>
                  ) : (
                    <Select value={effectiveSubtype} onChange={(e) => updateRowForm(item, { subtype: e.target.value })}>
                      {options.map((option) => <option key={option} value={option}>{option}</option>)}
                    </Select>
                  )}
                  <Input value={rowForm.notes} onChange={(e) => updateRowForm(item, { notes: e.target.value })} placeholder="Observação" className="mt-1" />
                </td>
                <td>
                  <Button
                    disabled={(rowForm.categoryType !== 'CARRO' && !effectiveSubtype) || heavyCheckMutation.isPending || categorizeMutation.isPending}
                    onClick={async () => {
                      if (rowForm.categoryType === 'CARRO') {
                        await categorizeMutation.mutateAsync({
                          plate: item.normalizedPlate,
                          categoryType: 'CARRO',
                        });
                        return;
                      }

                      await categorizeMutation.mutateAsync({
                        plate: item.normalizedPlate,
                        categoryType: rowForm.categoryType,
                        subSegment: effectiveSubtype,
                      });

                      await heavyCheckMutation.mutateAsync({
                        vehicleId: item.vehicleId,
                        readingId: item.id,
                        subtype: effectiveSubtype,
                        notes: rowForm.notes,
                      });
                    }}
                  >
                    {rowForm.categoryType === 'CARRO' ? 'Marcar como carro' : 'Checado'}
                  </Button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      {selectedImage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="w-full max-w-5xl rounded-lg bg-white p-3 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Placa {selectedImage.plate}</h2>
              <Button
                className="h-8 px-3 text-xs bg-slate-600 hover:bg-slate-500"
                onClick={() => setSelectedImage(null)}
              >
                Fechar
              </Button>
            </div>
            <img
              src={selectedImage.url}
              alt={`Imagem ampliada ${selectedImage.plate}`}
              className="max-h-[80vh] w-full rounded object-contain bg-slate-100"
              onError={(event) => {
                const image = event.currentTarget;
                if (image.dataset.fallbackTried === '1') {
                  image.style.display = 'none';
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
