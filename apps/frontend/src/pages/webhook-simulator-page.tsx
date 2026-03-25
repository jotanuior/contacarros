import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { Button, Card, CardTitle, Input, Select } from '../components/ui';

interface Camera {
  id: string;
  code: string;
  name: string;
  active: boolean;
  location: { id: string; name: string; code: string } | null;
}

interface LogEntry {
  id: number;
  ts: string;
  plate: string;
  cameraCode: string;
  capturedAt: string;
  confidence: number | null;
  status: 'ok' | 'erro';
  statusCode: number | null;
  response: unknown;
}

function toLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function localDatetimeToISO(value: string): string {
  // datetime-local gives "YYYY-MM-DDTHH:MM" — treat as local time and convert to ISO
  return new Date(value).toISOString();
}

export function WebhookSimulatorPage() {
  const [plate, setPlate] = useState('');
  const [cameraCode, setCameraCode] = useState('');
  const [capturedAt, setCapturedAt] = useState(() => toLocalDatetimeValue(new Date()));
  const [confidence, setConfidence] = useState('0.95');
  const [sending, setSending] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  let logCounter = 0;

  const { data: camerasData } = useQuery({
    queryKey: ['cameras-simulator'],
    queryFn: async () => (await api.get<{ data: Camera[] }>('/cameras', { params: { page: 1, limit: 200 } })).data,
  });
  const cameras: Camera[] = camerasData?.data ?? [];

  const selectedCamera = cameras.find((c) => c.code === cameraCode) ?? null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!plate.trim() || !cameraCode) return;
    setSending(true);

    const payload: Record<string, unknown> = {
      plate: plate.trim().toUpperCase(),
      cameraCode,
      capturedAt: localDatetimeToISO(capturedAt),
    };
    if (confidence !== '') {
      const conf = parseFloat(confidence);
      if (!Number.isNaN(conf)) payload.confidence = conf;
    }

    let entry: LogEntry;
    try {
      const res = await api.post('/lpr/readings', payload);
      entry = {
        id: ++logCounter,
        ts: new Date().toLocaleTimeString('pt-BR'),
        plate: payload.plate as string,
        cameraCode,
        capturedAt: payload.capturedAt as string,
        confidence: payload.confidence != null ? (payload.confidence as number) : null,
        status: 'ok',
        statusCode: res.status,
        response: res.data,
      };
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status: number; data: unknown } };
      entry = {
        id: ++logCounter,
        ts: new Date().toLocaleTimeString('pt-BR'),
        plate: payload.plate as string,
        cameraCode,
        capturedAt: payload.capturedAt as string,
        confidence: payload.confidence != null ? (payload.confidence as number) : null,
        status: 'erro',
        statusCode: axiosErr.response?.status ?? null,
        response: axiosErr.response?.data ?? String(err),
      };
    } finally {
      setSending(false);
    }

    setLog((prev) => [entry, ...prev]);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Simulador de Webhook — Defence LPR</h1>
      <p className="text-sm text-slate-500">
        Simule o envio de leituras LPR como se fosse o sistema Defence. Preencha os campos e clique em
        &ldquo;Enviar leitura&rdquo;. A câmera deve estar cadastrada e vinculada a um local para que o
        sistema processe a travessia corretamente.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Formulário ── */}
        <Card>
          <CardTitle className="mb-4">Dados da leitura</CardTitle>
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Placa */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Placa *</label>
              <Input
                className="w-full uppercase"
                placeholder="Ex: ABC1D23"
                value={plate}
                maxLength={8}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                required
              />
            </div>

            {/* Câmera */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Câmera *</label>
              <Select
                className="w-full"
                value={cameraCode}
                onChange={(e) => setCameraCode(e.target.value)}
                required
              >
                <option value="">Selecione a câmera…</option>
                {cameras.map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.name} ({c.code}) — {c.location?.name ?? 'sem local'}{!c.active ? ' [inativa]' : ''}
                  </option>
                ))}
              </Select>
              {selectedCamera && (
                <p className="mt-1 text-xs text-slate-400">
                  Local: <strong>{selectedCamera.location?.name ?? '—'}</strong>
                  {' '}(código <code>{selectedCamera.location?.code}</code>)
                  &nbsp;·&nbsp; código da câmera enviado no payload:{' '}
                  <code className="rounded bg-slate-100 px-1">{selectedCamera.code}</code>
                </p>
              )}
            </div>

            {/* Data/hora da captura */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Data e hora da captura *</label>
              <Input
                type="datetime-local"
                className="w-full"
                value={capturedAt}
                onChange={(e) => setCapturedAt(e.target.value)}
                required
              />
              <p className="mt-1 text-xs text-slate-400">
                Será enviado como ISO 8601 UTC:{' '}
                <code>{capturedAt ? localDatetimeToISO(capturedAt) : '—'}</code>
              </p>
            </div>

            {/* Confiança */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Confiança (0.00–1.00) — opcional
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  className="flex-1"
                  value={confidence}
                  onChange={(e) => setConfidence(e.target.value)}
                />
                <Input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  className="w-20"
                  value={confidence}
                  onChange={(e) => setConfidence(e.target.value)}
                />
              </div>
            </div>

            {/* Preview do payload */}
            <div className="rounded-md bg-slate-50 p-3">
              <p className="mb-1 text-xs font-medium text-slate-500">Payload que será enviado (POST /lpr/readings):</p>
              <pre className="overflow-x-auto text-xs text-slate-700">
                {JSON.stringify(
                  {
                    plate: plate.trim().toUpperCase() || '<placa>',
                    cameraCode: cameraCode || '<código da câmera>',
                    capturedAt: capturedAt ? localDatetimeToISO(capturedAt) : '<data/hora>',
                    ...(confidence !== '' && !Number.isNaN(parseFloat(confidence))
                      ? { confidence: parseFloat(confidence) }
                      : {}),
                  },
                  null,
                  2,
                )}
              </pre>
            </div>

            <Button
              type="submit"
              disabled={sending || !plate.trim() || !cameraCode}
              className="w-full"
            >
              {sending ? 'Enviando…' : 'Enviar leitura'}
            </Button>
          </form>
        </Card>

        {/* ── Log de respostas ── */}
        <Card className="flex flex-col">
          <CardTitle className="mb-4">
            Log de envios
            {log.length > 0 && (
              <button
                onClick={() => setLog([])}
                className="ml-2 text-xs font-normal text-slate-400 hover:text-slate-600"
              >
                limpar
              </button>
            )}
          </CardTitle>

          {log.length === 0 && (
            <p className="text-sm text-slate-400">Nenhuma leitura enviada ainda.</p>
          )}

          <div className="flex-1 space-y-3 overflow-y-auto" style={{ maxHeight: '520px' }}>
            {log.map((entry) => (
              <div
                key={entry.id}
                className={`rounded-md border p-3 text-sm ${
                  entry.status === 'ok'
                    ? 'border-green-200 bg-green-50'
                    : 'border-red-200 bg-red-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold">{entry.plate}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      entry.status === 'ok'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {entry.status === 'ok' ? `✓ ${entry.statusCode}` : `✗ ${entry.statusCode ?? 'erro'}`}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {entry.ts} · câmera <strong>{entry.cameraCode}</strong>{' '}
                  · captura {new Date(entry.capturedAt).toLocaleString('pt-BR')}
                </p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
                    Ver resposta
                  </summary>
                  <pre className="mt-1 max-h-40 overflow-y-auto rounded bg-white p-2 text-xs text-slate-700">
                    {JSON.stringify(entry.response, null, 2)}
                  </pre>
                </details>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── Câmeras cadastradas (referência rápida) ── */}
      <Card>
        <CardTitle className="mb-3">Câmeras cadastradas (referência)</CardTitle>
        {cameras.length === 0 ? (
          <p className="text-sm text-slate-400">Carregando câmeras…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                  <th className="pb-2 pr-4">Código (cameraCode no payload)</th>
                  <th className="pb-2 pr-4">Nome</th>
                  <th className="pb-2 pr-4">Local vinculado</th>
                  <th className="pb-2">Ativa</th>
                </tr>
              </thead>
              <tbody>
                {cameras.map((c) => (
                  <tr key={c.id} className="border-t border-slate-50">
                    <td className="py-1.5 pr-4 font-mono text-xs">{c.code}</td>
                    <td className="py-1.5 pr-4">{c.name}</td>
                    <td className="py-1.5 pr-4">
                      {c.location ? `${c.location.name} (${c.location.code})` : <span className="text-red-400">sem local</span>}
                    </td>
                    <td className="py-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          c.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {c.active ? 'sim' : 'não'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
