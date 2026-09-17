import React from 'react';
import { Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LogbookBook } from '../lib/catalog';
import type { EntryView, PageRow, VolumeRow } from '../lib/types';
import type { TemplateSection } from '../lib/templates';
import { bookColumns, itemCode } from '../lib/lineLayouts';
import { stamp } from '../lib/format';

interface Props {
  book: LogbookBook;
  volume: VolumeRow;
  entries: EntryView[];
  pages: PageRow[];
  onExit: () => void;
}

const val = (v: unknown) => (v === undefined || v === null || v === '' ? '—' : String(v));

const signatureText = (e: EntryView) =>
  e.signatures.filter((s) => s.kind !== 'acknowledge').map((s) => `${s.kind === 'attested' ? `${s.witness_name} (${s.witness_capacity}) attested by ${s.actor_name}` : s.actor_name} · ${s.kind} · ${stamp(s.signed_at)}`).join('\n') || 'Unsigned';

const fieldsText = (e: EntryView) =>
  (e.schema_snapshot?.fields ?? []).map((f) => `${f.item ? `${itemCode(f.item)} ` : ''}${f.label}: ${val(e.data[f.key])}`).join('\n');

/** Section-specific record tables, following the source book column layouts. */
function recordGrid(book: LogbookBook, section: TemplateSection, records: EntryView[]): { headings: string[]; rows: string[][] } {
  const d = (e: EntryView) => e.data as Record<string, unknown>;
  if (['oil', 'oil2', 'cargo', 'ballast'].includes(book.id)) {
    return {
      headings: ['Event date / time UTC', 'Code / item', 'Operations / officer’s signature'],
      rows: records.map((e) => [stamp(e.entry_at), `${section.operationCode ?? section.id}\n${(e.schema_snapshot?.fields ?? []).map((f) => itemCode(f.item)).filter(Boolean).join(', ')}`, `${fieldsText(e)}\n${e.remarks ?? ''}\n${signatureText(e)}`]),
    };
  }
  if (['garbage', 'garbage2'].includes(book.id)) {
    if (section.id === 'exception') {
      return {
        headings: ['Date / time UTC', 'Place / depth if known', 'Category', 'Lost / discharged m³', 'Reason / precautions / remarks', 'Officer’s signature'],
        rows: records.map((e) => [stamp(e.entry_at), `${val(d(e).location)}\n${d(e).depth ?? 'Depth unknown'}`, val(d(e).category), val(d(e).quantity), `${val(d(e).reason)}\n${val(d(e).precautions)}\n${e.remarks ?? ''}`, signatureText(e)]),
      };
    }
    return {
      headings: ['Date / time UTC', 'Position / port / receiving ship', 'Category', 'To sea · m³', 'To facility / ship · m³', ...(book.id === 'garbage' ? ['Incinerated · m³'] : []), 'Remarks / start and finish', 'Officer’s signature'],
      rows: records.map((e) => [
        stamp(e.entry_at),
        d(e).port ? `${d(e).port}\n${val(d(e).recipient)}` : (d(e).startPlace as string) || `${val(d(e).latitude)}°, ${val(d(e).longitude)}°`,
        val(d(e).category),
        e.section_id === 'sea' ? val(d(e).quantity) : '—',
        e.section_id === 'reception' ? val(d(e).quantity) : '—',
        ...(book.id === 'garbage' ? [e.section_id === 'incineration' ? val(d(e).quantity) : '—'] : []),
        `${d(e).startTime ? `Start ${d(e).startTime} UTC · ${val(d(e).startPlace)}\nFinish ${val(d(e).endTime)} UTC · ${val(d(e).endPlace)}` : ''}\n${val(d(e).circumstances)}\n${val(d(e).evidenceRef)}\n${e.remarks ?? ''}`,
        signatureText(e),
      ]),
    };
  }
  if (book.id === 'official' && section.id === 'crew') {
    return { headings: ['Crew reference', 'Seafarer', 'Capacity', 'Narrative pages / record IDs'], rows: records.map((e) => [val(d(e).crewReference), val(d(e).crewName), val(d(e).capacity), val(d(e).narrativePages)]) };
  }
  if (book.id === 'official' && ['drills', 'steering', 'accommodation', 'foodwater'].includes(section.id)) {
    return { headings: ['Event date / time UTC', 'Inspection / exercise / results', 'Entry date', 'Signatures'], rows: records.map((e) => [stamp(e.entry_at), `${fieldsText(e)}\n${e.remarks ?? ''}`, stamp(e.created_at), signatureText(e)]) };
  }
  if (book.id === 'official' && section.id === 'narrative') {
    return { headings: ['Event date / time UTC', 'Place / position', 'Entry date', 'Narrative / signatures'], rows: records.map((e) => [stamp(e.entry_at), val(d(e).location), stamp(e.created_at), `${val(d(e).event)}\n${val(d(e).record)}\n${val(d(e).crewReferences)}\n${val(d(e).evidenceRef)}\n${signatureText(e)}`]) };
  }
  if (book.id === 'gmdss' && section.id === 'traffic') {
    return { headings: ['UTC', 'From / to', 'Frequency / channel', 'Radio traffic / action', 'Operator'], rows: records.map((e) => [stamp(e.entry_at), `${val(d(e).from)}\n${val(d(e).to)}`, val(d(e).channel), `${val(d(e).priority)}\n${val(d(e).traffic)}`, signatureText(e)]) };
  }
  return { headings: ['Date / time UTC', 'Section / record', 'Recorded particulars', 'Signature'], rows: records.map((e) => [stamp(e.entry_at), `${section.title}\n${e.id}`, `${fieldsText(e)}\n${e.remarks ?? ''}`, signatureText(e)]) };
}

const Grid: React.FC<{ headings: string[]; rows: string[][] }> = ({ headings, rows }) => (
  <table className="w-full border-collapse text-[11px]">
    <thead><tr>{headings.map((h) => <th key={h} className="border border-black p-1 text-left align-top">{h}</th>)}</tr></thead>
    <tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className="whitespace-pre-wrap border border-black p-1 align-top">{cell}</td>)}</tr>)}</tbody>
  </table>
);

const EntryDetail: React.FC<{ entry: EntryView }> = ({ entry }) => (
  <article className="break-inside-avoid border-t border-black py-2 text-[11px]">
    <h3 className="font-semibold">{entry.schema_snapshot?.operationCode ? `Code ${entry.schema_snapshot.operationCode} · ` : ''}{entry.schema_snapshot?.title} · line {entry.line_number}</h3>
    <p>Record {entry.id} · {entry.status} · {entry.flag_profile} · {entry.template_revision} · entered {stamp(entry.created_at)} by {entry.recorded_by_name}</p>
    {entry.amended_from_id && <p>Correction of {entry.amended_from_id} · {entry.amendment_reason}</p>}
    {entry.superseded_by_id && <p>Superseded by linked correction {entry.superseded_by_id}</p>}
    <dl className="grid grid-cols-2 gap-x-3">
      {(entry.schema_snapshot?.fields ?? []).map((f) => (
        <div key={f.key}><dt className="inline font-semibold">{f.item ? `${itemCode(f.item)} · ` : ''}{f.label}: </dt><dd className="inline whitespace-pre-wrap">{val(entry.data[f.key])}</dd></div>
      ))}
    </dl>
    {entry.remarks && <p><strong>Remarks:</strong> {entry.remarks}</p>}
    {entry.source_snapshot && <p>Captured source · {entry.source_snapshot.source} · {stamp(entry.source_snapshot.observed_at, true)} · {entry.override_reason ?? 'Captured readings retained.'}</p>}
    {entry.signatures.map((s) => (
      <p key={s.id}>✓ {s.kind} · {s.kind === 'attested' ? `${s.witness_name} (${s.witness_capacity}) attested by ${s.actor_name}` : s.actor_name} · {stamp(s.signed_at, true)} · <code>{s.digest.slice(0, 24)}…</code></p>
    ))}
  </article>
);

/** Printable book: cover, section index, sealed pages, record details and blank ruled sections. */
const PrintBook: React.FC<Props> = ({ book, volume, entries, pages, onExit }) => {
  const sections = volume.template.sections;
  const forPage = (p: PageRow) => p.entry_ids.map((id) => entries.find((e) => e.id === id)).filter((e): e is EntryView => Boolean(e));
  return (
    <div id="logbook-print" className="fixed inset-0 z-50 overflow-auto bg-white p-6 text-black print:static print:p-0">
      <style>{`@media print { body * { visibility: hidden; } #logbook-print, #logbook-print * { visibility: visible; } #logbook-print { position: absolute; inset: 0; } .print-controls { display: none; } }`}</style>
      <div className="print-controls mb-4 flex gap-2">
        <Button type="button" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" /> Print / save PDF</Button>
        <Button type="button" variant="outline" onClick={onExit}><X className="mr-1 h-4 w-4" /> Back to book</Button>
      </div>
      <section className="mb-6 break-after-page">
        <h1 className="text-2xl font-bold">{book.title}</h1>
        <h2 className="text-lg">{volume.label}</h2>
        <p className="my-2 text-xs font-semibold">MAPPED ELECTRONIC DESIGN · NOT AN APPROVED FACSIMILE · NO FLAG, MCA OR CLASS APPROVAL HELD</p>
        <dl className="grid grid-cols-2 gap-x-4 text-sm">
          {volume.cover_fields.map((f) => <div key={f.key}><dt className="inline font-semibold">{f.label}: </dt><dd className="inline">{val(volume.particulars[f.key])}</dd></div>)}
        </dl>
        <p className="mt-2 text-xs">{volume.flag_profile} · {volume.template_revision} · {volume.status} · opened {stamp(volume.opened_at)} by {volume.opened_by_name}{volume.closed_at ? ` · closed ${stamp(volume.closed_at)} at ${volume.closure_place}` : ''}</p>
        <p className="text-xs">Source: {volume.template.reference.title}. {volume.template.reference.note}</p>
        <h2 className="mt-4 text-base font-semibold">Section index</h2>
        <table className="w-full border-collapse text-xs">
          <thead><tr><th className="border border-black p-1 text-left">Section</th><th className="border border-black p-1 text-left">Reference pages / code</th><th className="border border-black p-1 text-left">Signed pages</th></tr></thead>
          <tbody>{sections.map((s) => <tr key={s.id}><td className="border border-black p-1">{s.title}</td><td className="border border-black p-1">{s.operationCode ?? s.referencePages}</td><td className="border border-black p-1">{pages.filter((p) => p.section_id === s.id).map((p) => p.page_number).join(', ') || 'No signed page'}</td></tr>)}</tbody>
        </table>
        <p className="mt-1 text-[10px]">Reference-page numbers refer to source publications. Page numbers here identify fixed groups of signed records; physical printer pagination is not certified.</p>
      </section>
      {pages.map((p) => {
        const section = sections.find((s) => s.id === p.section_id)!;
        const records = forPage(p);
        return (
          <section key={p.id} className="mb-6 break-after-page">
            <header className="mb-2"><h2 className="text-base font-semibold">Page {p.page_number} · {section?.title}</h2><p className="text-xs">{val(volume.particulars.shipName)} · {val(volume.particulars.officialNumber)} · {volume.flag_profile}</p></header>
            <Grid {...recordGrid(book, section, records)} />
            <footer className="mt-2 text-xs">Master's page signature: {p.sealed_by_name} · {stamp(p.sealed_at, true)}<br /><code>{p.digest}</code></footer>
            {records.filter((e) => e.superseded_by_id || e.amended_from_id).map((e) => <p key={e.id} className="text-[10px]">Record {e.id} {e.superseded_by_id ? `now has correction ${e.superseded_by_id}` : `corrects ${e.amended_from_id}: ${e.amendment_reason}`}</p>)}
          </section>
        );
      })}
      {pages.length > 0 && (
        <section className="mb-6 break-after-page">
          <h2 className="text-base font-semibold">Record details, signatures &amp; source evidence</h2>
          {pages.flatMap(forPage).map((e) => <EntryDetail key={e.id} entry={e} />)}
        </section>
      )}
      {sections.map((section) => {
        const unpaged = entries.filter((e) => !e.page_id && e.section_id === section.id);
        const any = entries.some((e) => e.section_id === section.id);
        if (unpaged.length) {
          return (
            <section key={section.id} className="mb-6 break-after-page">
              <h2 className="text-base font-semibold">{section.title} · unpaged lines / drafts</h2>
              <Grid {...recordGrid(book, section, unpaged)} />
              {unpaged.map((e) => <EntryDetail key={e.id} entry={e} />)}
            </section>
          );
        }
        if (any) return null;
        const cols = bookColumns(book.id, section);
        return (
          <section key={section.id} className="mb-6 break-after-page">
            <h2 className="text-base font-semibold">{section.title}</h2>
            <p className="text-xs">Blank section · {section.coverage} · Reference {section.operationCode ?? section.referencePages}</p>
            <table className="w-full border-collapse text-[11px]">
              <thead><tr><th className="border border-black p-1">Line</th>{cols.map((c) => <th key={c.key} className="border border-black p-1 text-left">{c.title}</th>)}</tr></thead>
              <tbody>
                {[0, 1, 2].map((i) => (
                  <tr key={i} className="h-10">
                    <td className="border border-black p-1">{i + 1}</td>
                    {cols.map((c) => (
                      <td key={c.key} className="border border-black p-1 align-top">
                        {c.kind === 'code' ? section.operationCode ?? '' : i === 0 && c.fields?.length && (c.fields.length > 1 || c.title !== c.fields[0].label)
                          ? c.fields.map((f) => <div key={f.key}>{f.item ? `${itemCode(f.item)} · ` : ''}{f.label}<br />________________</div>)
                          : ' '}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
};

export default PrintBook;
