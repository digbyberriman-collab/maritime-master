import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plug, RefreshCw } from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/shared/hooks/use-toast';
import { useLogbookActor } from '../hooks/useLogbookActor';
import { useLogbookSamples } from '../hooks/useLogbookSamples';
import { isFresh } from '../lib/registryRules';
import { stamp } from '../lib/format';

/** Simulated AMCS / NMEA sources. Captured samples become evidence attached to draft lines. */
const LogbookConnections: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const actor = useLogbookActor();
  const { samples, simulateSample, pasteRmc, refetch } = useLogbookSamples(actor.vesselId, actor.companyId);
  const [sentence, setSentence] = React.useState('');
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 5000); return () => clearInterval(t); }, []);
  const canCapture = ['master', 'officer', 'engineer'].includes(actor.capacity ?? '');
  const run = async (fn: () => Promise<unknown>, title: string) => {
    try { await fn(); toast({ title }); } catch (e) { toast({ title: 'Capture failed', description: (e as Error).message, variant: 'destructive' }); }
  };
  const latest = (type: string) => samples.find((s) => s.sample_type === type);

  return (
    <DashboardLayout>
      <div className="space-y-5 p-1">
        <Button asChild variant="ghost" size="sm" className="-ml-2"><Link to="/vessel/logbooks"><ArrowLeft className="mr-1 h-4 w-4" /> Back to logbooks</Link></Button>
        <div className="flex items-center gap-3">
          <Plug className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Connections</h1>
            <p className="text-sm text-muted-foreground">Demonstration sources only. No live AMCS or NMEA gateway is connected; the planned onboard service and read-only equipment gateway are separate deliverables.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {([['navigation', 'Demo bridge gateway', 'Position, speed and course over ground (NMEA 0183 RMC)', 'deck-log'], ['machinery', 'Demo AMCS gateway', 'Generator load, lubricating-oil pressure, coolant temperature and running hours', 'engine-log']] as const).map(([type, title, description, slug]) => {
            const sample = latest(type);
            const fresh = sample ? isFresh(sample, Date.now() + tick * 0) : false;
            return (
              <section key={type} className="space-y-3 rounded-lg border border-border bg-card p-4">
                <header className="flex items-center justify-between">
                  <div><h2 className="font-semibold">{title}</h2><p className="text-xs text-muted-foreground">{description}</p></div>
                  <Badge variant={fresh ? 'default' : 'secondary'}>{sample ? (fresh ? 'Fresh' : 'Stale') : 'No sample'}</Badge>
                </header>
                {sample && (
                  <div className="rounded-md bg-muted p-3 text-xs">
                    <p><strong>{sample.mode === 'simulated' ? 'Simulated' : 'Pasted'}</strong> · observed {stamp(sample.observed_at, true)} · {sample.quality}</p>
                    <pre className="mt-1 overflow-auto">{JSON.stringify(sample.values, null, 1)}</pre>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" disabled={!canCapture || simulateSample.isPending} onClick={() => run(() => simulateSample.mutateAsync(type), 'Sample captured')}>
                    <RefreshCw className="mr-1 h-4 w-4" /> Capture simulated sample
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={!sample || !fresh} onClick={() => navigate(`/vessel/logbooks/${slug}?sample=${sample!.id}`)}>Use in draft</Button>
                </div>
              </section>
            );
          })}
        </div>
        <section className="space-y-2 rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">Paste an RMC sentence</h2>
          <p className="text-xs text-muted-foreground">Restricted NMEA 0183 RMC parser for testing: checksum, fix status, UTC date/time, position, speed and course are validated. Invalid, estimated or simulated fixes are rejected.</p>
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void run(() => pasteRmc.mutateAsync(sentence), 'RMC sample captured'); }}>
            <Input value={sentence} onChange={(e) => setSentence(e.target.value)} placeholder="$GPRMC,120000,A,4341.8200,N,00716.2400,E,12.4,086.2,150926,,,A*XX" className="min-w-[24rem] flex-1 font-mono text-xs" maxLength={160} aria-label="RMC sentence" />
            <Button type="submit" size="sm" disabled={!canCapture || !sentence.trim() || pasteRmc.isPending}>Capture</Button>
          </form>
        </section>
        <section className="rounded-lg border border-border bg-card">
          <header className="flex items-center justify-between border-b border-border px-4 py-3"><h2 className="font-semibold">Captured samples</h2><Button type="button" size="sm" variant="ghost" onClick={() => void refetch()}>Refresh</Button></header>
          <ul className="divide-y divide-border text-sm">
            {samples.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span><strong>{s.sample_type}</strong> · {s.source} · {s.mode}<span className="block text-xs text-muted-foreground">observed {stamp(s.observed_at, true)} · received {stamp(s.received_at, true)} · {s.captured_by_name ?? '—'}</span></span>
                <Badge variant={isFresh(s) ? 'default' : 'outline'}>{isFresh(s) ? 'fresh' : 'stale'}</Badge>
              </li>
            ))}
            {samples.length === 0 && <li className="px-4 py-4 text-muted-foreground">No samples captured for this vessel.</li>}
          </ul>
        </section>
        <p className="text-xs text-muted-foreground">Freshness: two minutes, with five seconds of clock lead tolerated. Stale samples never create rows and cannot silently become fresh readings.</p>
      </div>
    </DashboardLayout>
  );
};

export default LogbookConnections;
