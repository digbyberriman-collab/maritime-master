/**
 * The reports hub's trend charts (gap/02 R1), one card per series of
 * `fleet_report_trends` (../lib/trends.ts trendCards): incidents, corrective
 * actions opened and closed, drills carried out and overdue, document
 * expiries ahead. Loaded lazily by the hub (React.lazy), so Recharts is in
 * this chunk only, never the entry chunk or the hub's own.
 *
 * - Recharts on the theme defaults (D-53): axis, grid and tooltip colours
 *   come from src/index.css; the bars use the chart tokens (`--chart-n`),
 *   the same series keeping the same colour in every card.
 * - Each chart is an image with a one-sentence summary, and the numbers are
 *   also in a visually hidden table, so nothing depends on colour or on
 *   seeing the chart.
 * - A series switched off on every vessel shown keeps its card and says so;
 *   a series the reader cannot count has no card (decided in the lib).
 */
import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState } from '@/shared/components/states';
import { trendSummary, type ReportPeriod, type TrendCard, type TrendColour } from '../lib/trends';

const fill = (colour: TrendColour) => `hsl(var(--${colour}))`;

function Legend({ card }: { card: Extract<TrendCard, { state: 'ok' }> }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 type-caption text-muted-foreground" aria-hidden="true">
      {card.bars.map((bar) => (
        <li key={bar.key} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: fill(bar.colour) }} />
          {bar.label}
          <span className="tabular-nums text-foreground">{card.totals[bar.key].toLocaleString('en-GB')}</span>
        </li>
      ))}
      {card.expired ? (
        <li className="inline-flex items-center gap-1.5">
          <span className="tabular-nums text-foreground">{card.expired.toLocaleString('en-GB')}</span> already expired
        </li>
      ) : null}
    </ul>
  );
}

function ChartCard({ card, period }: { card: TrendCard; period: ReportPeriod }) {
  const headingId = React.useId();
  const summary = trendSummary(card, period);
  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground">
      <div className="min-w-0">
        <h3 id={headingId} className="type-subtitle text-foreground">
          {card.title}
        </h3>
        <p className="type-caption text-muted-foreground">{card.description}</p>
      </div>
      {card.state === 'module_off' ? (
        <EmptyState kind="not-enabled" title="Not counted" body={card.offReason} headingLevel={4} compact />
      ) : (
        <>
          <Legend card={card} />
          <div role="img" aria-label={summary} className="h-48 w-full min-w-0 text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={card.rows.map((r) => ({ label: r.label, longLabel: r.longLabel, ...r.values }))}
                margin={{ top: 4, right: 4, bottom: 0, left: -16 }}
                barGap={2}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} interval="preserveStartEnd" minTickGap={4} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
                <Tooltip
                  cursor={{ fillOpacity: 0.08 }}
                  labelFormatter={(_label, payload) => {
                    const row = payload?.[0]?.payload as { longLabel?: string } | undefined;
                    return row?.longLabel ?? String(_label);
                  }}
                />
                {card.bars.map((bar) => (
                  <Bar key={bar.key} dataKey={bar.key} name={bar.label} fill={fill(bar.colour)} radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* A table ignores the width of .sr-only, so the hidden wrapper keeps it from widening the page. */}
          <div className="sr-only">
            <table>
              <caption>{summary}</caption>
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  {card.bars.map((bar) => (
                    <th key={bar.key} scope="col">
                      {bar.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {card.rows.map((row) => (
                  <tr key={row.month}>
                    <th scope="row">{row.longLabel}</th>
                    {card.bars.map((bar) => (
                      <td key={bar.key}>{row.values[bar.key]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export interface TrendChartsProps {
  cards: readonly TrendCard[];
  period: ReportPeriod;
}

const TrendCharts: React.FC<TrendChartsProps> = ({ cards, period }) => (
  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
    {cards.map((card) => (
      <ChartCard key={card.key} card={card} period={period} />
    ))}
  </div>
);

export default TrendCharts;
