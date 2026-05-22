import React, { useState } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { FileText, Download, History, Upload, CheckCircle2, Eye, FileUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Version {
  version: string;
  status: 'current' | 'superseded' | 'draft';
  effectiveDate: string;
  approvedBy: string;
  changeSummary: string;
  fileSize: string;
  pageCount: number;
}

const VERSIONS: Version[] = [
  { version: 'v4.2', status: 'current', effectiveDate: '2026-04-12', approvedBy: 'DPA — J. Marsden', changeSummary: 'Updated enclosed-space entry procedure; added new PPE matrix; revised emergency contact list per IMO MSC.1/Circ.1638.', fileSize: '4.2 MB', pageCount: 184 },
  { version: 'v4.1', status: 'superseded', effectiveDate: '2025-11-01', approvedBy: 'DPA — J. Marsden', changeSummary: 'Annual review; minor wording corrections; updated company address.', fileSize: '4.1 MB', pageCount: 182 },
  { version: 'v4.0', status: 'superseded', effectiveDate: '2025-03-15', approvedBy: 'DPA — K. Roberts', changeSummary: 'Major revision: added MLC 2006 amendments, restructured Section 7 (Crew Welfare), new flowcharts.', fileSize: '4.0 MB', pageCount: 178 },
  { version: 'v3.3', status: 'superseded', effectiveDate: '2024-08-22', approvedBy: 'DPA — K. Roberts', changeSummary: 'Hot-work permit revision; added drone operation procedure.', fileSize: '3.8 MB', pageCount: 165 },
  { version: 'v3.2', status: 'superseded', effectiveDate: '2024-01-10', approvedBy: 'DPA — K. Roberts', changeSummary: 'Updated emergency response checklists; ISPS Annex B refresh.', fileSize: '3.7 MB', pageCount: 162 },
];

const statusStyle = (s: Version['status']) =>
  s === 'current' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40'
  : s === 'draft' ? 'bg-yellow-400/20 text-yellow-700 dark:text-yellow-300 border-yellow-400/40'
  : 'bg-muted text-muted-foreground border-border';

const SafetyDocumentVersioning: React.FC = () => {
  const [showUpload, setShowUpload] = useState(false);
  const current = VERSIONS.find(v => v.status === 'current')!;
  const archive = VERSIONS.filter(v => v.status !== 'current');

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Safety Document</p>
            <h1 className="text-2xl font-bold text-foreground">Safety Management System Manual</h1>
            <p className="text-muted-foreground">STORM-DOC-2024-0042 · Owner: DPA Office · Review cycle: 12 months</p>
          </div>
          <Dialog open={showUpload} onOpenChange={setShowUpload}>
            <DialogTrigger asChild>
              <Button><Upload className="w-4 h-4 mr-2" />Upload New Version</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Upload New Version</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Version Number</Label>
                    <Input placeholder="v4.3" />
                  </div>
                  <div>
                    <Label>Effective Date</Label>
                    <Input type="date" />
                  </div>
                </div>
                <div>
                  <Label>Change Summary</Label>
                  <Textarea rows={4} placeholder="Describe what changed in this revision..." />
                </div>
                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                  <FileUp className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">Drop PDF here or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">Max 25 MB · PDF only</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowUpload(false)}>Cancel</Button>
                <Button onClick={() => setShowUpload(false)}>Upload & Notify Crew</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="border-emerald-500/40 bg-gradient-to-br from-emerald-500/5 to-transparent">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    Current Version
                    <Badge className={cn('border', statusStyle('current'))}>
                      <CheckCircle2 className="w-3 h-3 mr-1" />Active
                    </Badge>
                  </CardTitle>
                  <p className="text-2xl font-bold mt-1">{current.version}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm"><Eye className="w-4 h-4 mr-2" />Preview</Button>
                <Button variant="outline" size="sm"><Download className="w-4 h-4 mr-2" />Download</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <Meta label="Effective Date" value={new Date(current.effectiveDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} />
              <Meta label="Approved By" value={current.approvedBy} />
              <Meta label="File Size" value={current.fileSize} />
              <Meta label="Pages" value={`${current.pageCount}`} />
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1">Change Summary</p>
              <p className="text-sm">{current.changeSummary}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4" />
              Version History
              <Badge variant="outline" className="ml-2">{archive.length} archived</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {archive.map(v => (
                <div key={v.version} className="p-4 hover:bg-muted/30 transition flex items-start gap-4">
                  <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{v.version}</span>
                      <Badge variant="outline" className={cn('text-xs border', statusStyle(v.status))}>Superseded</Badge>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">Effective {new Date(v.effectiveDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{v.approvedBy}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{v.changeSummary}</p>
                    <p className="text-xs text-muted-foreground mt-1">{v.fileSize} · {v.pageCount} pages</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm"><Eye className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm"><Download className="w-4 h-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

const Meta: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
    <p className="font-medium mt-0.5">{value}</p>
  </div>
);

export default SafetyDocumentVersioning;