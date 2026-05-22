import React, { useState } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/shared/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Save, ArrowLeft, Shield, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const LIKELIHOOD = ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost Certain'];
const SEVERITY = ['Negligible', 'Minor', 'Moderate', 'Major', 'Catastrophic'];

const cellTone = (score: number) => {
  if (score >= 17) return 'bg-destructive text-destructive-foreground';
  if (score >= 10) return 'bg-orange-500 text-white';
  if (score >= 5) return 'bg-yellow-400 text-yellow-950';
  return 'bg-emerald-500 text-emerald-50';
};

const tone = (score: number) => {
  if (score >= 17) return { label: 'Extreme', cls: 'bg-destructive text-destructive-foreground' };
  if (score >= 10) return { label: 'High', cls: 'bg-orange-500 text-white' };
  if (score >= 5) return { label: 'Medium', cls: 'bg-yellow-400 text-yellow-950' };
  return { label: 'Low', cls: 'bg-emerald-500 text-emerald-50' };
};

const HIERARCHY = [
  { key: 'eliminate', label: 'Eliminate', desc: 'Remove the hazard entirely' },
  { key: 'substitute', label: 'Substitute', desc: 'Replace with a less hazardous option' },
  { key: 'engineering', label: 'Engineering Controls', desc: 'Isolate people from the hazard' },
  { key: 'administrative', label: 'Administrative Controls', desc: 'Change the way people work' },
  { key: 'ppe', label: 'PPE', desc: 'Personal protective equipment' },
];

const RiskAssessmentForm: React.FC = () => {
  const navigate = useNavigate();
  const [initL, setInitL] = useState(3);
  const [initS, setInitS] = useState(4);
  const [resL, setResL] = useState(2);
  const [resS, setResS] = useState(2);
  const [controls, setControls] = useState<Record<string, boolean>>({ engineering: true, administrative: true, ppe: true });

  const initial = initL * initS;
  const residual = resL * resS;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <PageHeader
            className="flex-1"
            title="New Risk Assessment"
            description="Identify hazards, assess risk, define controls"
            actions={
              <>
                <Button variant="outline">Save Draft</Button>
                <Button>
                  <Save className="w-4 h-4 mr-2" />
                  Submit for Approval
                </Button>
              </>
            }
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Assessment Details</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Activity / Task</Label>
                  <Input placeholder="e.g. Working at height — mast inspection" />
                </div>
                <div>
                  <Label>Vessel</Label>
                  <Select>
                    <SelectTrigger><SelectValue placeholder="Select vessel" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="storm">M/Y Storm</SelectItem>
                      <SelectItem value="atlas">M/Y Atlas</SelectItem>
                      <SelectItem value="meridian">M/Y Meridian</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Location</Label>
                  <Input placeholder="Deck / Engine Room / Mast" />
                </div>
                <div>
                  <Label>Assessor</Label>
                  <Input placeholder="Chief Officer" />
                </div>
                <div>
                  <Label>Date</Label>
                  <Input type="date" />
                </div>
                <div className="col-span-2">
                  <Label>Hazard Description</Label>
                  <Textarea rows={3} placeholder="Describe what could cause harm and to whom..." />
                </div>
                <div className="col-span-2">
                  <Label>Potential Consequences</Label>
                  <Textarea rows={2} placeholder="Injury type, environmental impact, asset damage..." />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Shield className="w-4 h-4" /> Hierarchy of Controls</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {HIERARCHY.map((h, i) => (
                  <div key={h.key} className="flex items-start gap-3 p-3 rounded-md border border-border bg-card">
                    <Checkbox
                      checked={!!controls[h.key]}
                      onCheckedChange={(v) => setControls(s => ({ ...s, [h.key]: !!v }))}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground">{i + 1}</span>
                        <span className="font-medium">{h.label}</span>
                        <Badge variant="outline" className="text-xs">{i === 0 ? 'Most Effective' : i === 4 ? 'Least Effective' : ''}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{h.desc}</p>
                      {controls[h.key] && (
                        <Input className="mt-2" placeholder={`Describe ${h.label.toLowerCase()} measures...`} />
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <RiskMatrix title="Initial Risk" l={initL} s={initS} onL={setInitL} onS={setInitS} />
            <RiskMatrix title="Residual Risk" l={resL} s={resS} onL={setResL} onS={setResS} />

            <Card>
              <CardHeader><CardTitle className="text-base">Risk Summary</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Row label="Initial Risk Score" score={initial} />
                <Row label="Residual Risk Score" score={residual} />
                <div className="pt-2 border-t border-border">
                  <div className="flex items-center gap-2 text-sm">
                    {residual >= 10 ? (
                      <><AlertTriangle className="w-4 h-4 text-destructive" /><span className="text-destructive font-medium">DPA approval required</span></>
                    ) : (
                      <span className="text-muted-foreground">Master approval sufficient</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

const Row: React.FC<{ label: string; score: number }> = ({ label, score }) => {
  const t = tone(score);
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className={cn('px-2 py-1 rounded text-xs font-bold', t.cls)}>{score}</span>
        <Badge variant="outline">{t.label}</Badge>
      </div>
    </div>
  );
};

const RiskMatrix: React.FC<{ title: string; l: number; s: number; onL: (n: number) => void; onS: (n: number) => void }> = ({ title, l, s, onL, onS }) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-base">{title}</CardTitle>
      <p className="text-xs text-muted-foreground">Tap cell to select likelihood × severity</p>
    </CardHeader>
    <CardContent>
      <div className="grid gap-1" style={{ gridTemplateColumns: '60px repeat(5, 1fr)' }}>
        <div />
        {SEVERITY.map((sv, i) => (
          <div key={sv} className="text-[10px] text-center text-muted-foreground font-medium pb-1">{i + 1}</div>
        ))}
        {LIKELIHOOD.map((lk, li) => (
          <React.Fragment key={lk}>
            <div className="text-[10px] text-muted-foreground font-medium flex items-center justify-end pr-1">{5 - li}</div>
            {SEVERITY.map((_, si) => {
              const likelihood = 5 - li;
              const severity = si + 1;
              const score = likelihood * severity;
              const isSel = l === likelihood && s === severity;
              return (
                <button
                  key={si}
                  onClick={() => { onL(likelihood); onS(severity); }}
                  className={cn(
                    'aspect-square rounded text-xs font-bold transition',
                    cellTone(score),
                    isSel ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background scale-105' : 'opacity-80 hover:opacity-100'
                  )}
                >
                  {score}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3 text-[10px] text-muted-foreground">
        <div>Y: Likelihood (5→1)</div>
        <div className="text-right">X: Severity (1→5)</div>
      </div>
    </CardContent>
  </Card>
);

export default RiskAssessmentForm;