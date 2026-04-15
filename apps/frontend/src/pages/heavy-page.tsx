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
  subtype: string;
  notes: string;
};

export function HeavyPage() {
  const queryClient = useQueryClient();
  const [formByReadingId, setFormByReadingId] = useState<Record<string, RowForm>>({});

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

  function getRowForm(item: HeavyPendingItem): RowForm {
    return formByReadingId[item.id] || {
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

  const mutation = useMutation({
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

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Veículos pesados</h1>
      <Card>
        <Table>
          <thead><tr><th>Horário</th><th>Placa</th><th>Modelo</th><th>Local</th><th>Tipo</th><th>Subtipo</th><th>Ação</th></tr></thead>
          <tbody>
            {(data || []).map((item) => {
              const rowForm = getRowForm(item);
              const options = getSubtypeOptionsByCategory(item.vehicle?.categoryType);
              const effectiveSubtype = options.includes(rowForm.subtype) ? rowForm.subtype : (options[0] || '');

              return (
              <tr key={item.id} className="border-t border-slate-100">
                <td>{formatDateTime(item.capturedAt)}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded border border-slate-200"
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
                <td>{item.vehicle?.categoryType}</td>
                <td>
                  <Select value={effectiveSubtype} onChange={(e) => updateRowForm(item, { subtype: e.target.value })}>
                    {options.map((option) => <option key={option} value={option}>{option}</option>)}
                  </Select>
                  <Input value={rowForm.notes} onChange={(e) => updateRowForm(item, { notes: e.target.value })} placeholder="Observação" className="mt-1" />
                </td>
                <td>
                  <Button
                    disabled={!effectiveSubtype || mutation.isPending}
                    onClick={() => mutation.mutate({ vehicleId: item.vehicleId, readingId: item.id, subtype: effectiveSubtype, notes: rowForm.notes })}
                  >
                    Checado
                  </Button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
