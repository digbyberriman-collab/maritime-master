/**
 * Simulated navigation and machinery sources plus a narrow NMEA 0183 RMC
 * parser for pasted sentences. This is demonstration input only: there is
 * no live AMCS or NMEA gateway connection in this module.
 */
export type SampleType = 'navigation' | 'machinery';

export interface SampleInput {
  sample_type: SampleType;
  source: string;
  protocol: string;
  mode: 'simulated' | 'manual-test';
  quality: string;
  observed_at: string;
  received_at: string;
  values: Record<string, number>;
  raw: unknown;
}

export function checksum(body: string): string {
  return [...body].reduce((sum, character) => sum ^ character.charCodeAt(0), 0).toString(16).toUpperCase().padStart(2, '0');
}

/** Narrow RMC demonstrator. Real connectors require licensed specifications and hardware validation. */
export function parseRmc(sentence: string, receivedAt = new Date().toISOString()): SampleInput {
  if (typeof sentence !== 'string' || sentence.length > 160) throw new Error('Provide one RMC sentence (maximum 160 characters).');
  const match = /^\$([A-Z0-9]{2}RMC,[ -~]+)\*([0-9A-F]{2})$/i.exec(sentence.trim());
  if (!match || checksum(match[1]) !== match[2].toUpperCase()) throw new Error('Invalid RMC sentence or checksum.');
  const parts = match[1].split(',');
  if (parts[2] !== 'A' || (parts[12] && !['A', 'D', 'P', 'R', 'F'].includes(parts[12]))) throw new Error('RMC fix is invalid, estimated or simulated.');
  const coordinate = (value: string, direction: string, latitude: boolean) => {
    const digits = latitude ? 2 : 3;
    if (!(latitude ? /^[0-9]{4}(\.[0-9]+)?$/ : /^[0-9]{5}(\.[0-9]+)?$/).test(value) || !(latitude ? ['N', 'S'] : ['E', 'W']).includes(direction)) throw new Error('Invalid coordinates.');
    const degrees = Number(value.slice(0, digits));
    const minutes = Number(value.slice(digits));
    const result = degrees + minutes / 60;
    if (minutes >= 60 || result > (latitude ? 90 : 180)) throw new Error('Coordinates outside valid range.');
    return Number((result * (['S', 'W'].includes(direction) ? -1 : 1)).toFixed(6));
  };
  if (!/^\d{6}(\.\d+)?$/.test(parts[1]) || !/^\d{6}$/.test(parts[9])) throw new Error('RMC UTC date and time are required.');
  const hour = +parts[1].slice(0, 2), minute = +parts[1].slice(2, 4), second = +parts[1].slice(4);
  const day = +parts[9].slice(0, 2), month = +parts[9].slice(2, 4), year = 2000 + +parts[9].slice(4);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, Math.floor(second), Math.round((second % 1) * 1000)));
  if (hour > 23 || minute > 59 || second >= 60 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('Invalid RMC UTC date or time.');
  if (!parts[7] || !parts[8] || !Number.isFinite(+parts[7]) || !Number.isFinite(+parts[8]) || +parts[7] < 0 || +parts[7] > 100 || +parts[8] < 0 || +parts[8] >= 360) throw new Error('Speed or course outside the demonstrator range.');
  return {
    sample_type: 'navigation', source: 'Pasted RMC / unverified input', protocol: 'NMEA 0183 RMC',
    mode: 'manual-test', quality: 'valid-sentence', observed_at: date.toISOString(), received_at: receivedAt,
    values: { latitude: coordinate(parts[3], parts[4], true), longitude: coordinate(parts[5], parts[6], false), speed: +parts[7], course: +parts[8] },
    raw: sentence.trim(),
  };
}

export function simulate(type: SampleType, now = new Date()): SampleInput {
  const observedAt = now.toISOString();
  if (type === 'navigation') {
    const utc = observedAt.slice(11, 19).replace(/:/g, '');
    const date = `${observedAt.slice(8, 10)}${observedAt.slice(5, 7)}${observedAt.slice(2, 4)}`;
    const body = `GPRMC,${utc},A,4341.8200,N,00716.2400,E,12.4,086.2,${date},,,A`;
    return { ...parseRmc(`$${body}*${checksum(body)}`, observedAt), source: 'Demo bridge gateway', mode: 'simulated' };
  }
  return {
    sample_type: 'machinery', source: 'Demo AMCS gateway', protocol: 'Normalised I/O sample', mode: 'simulated', quality: 'valid-sample',
    observed_at: observedAt, received_at: observedAt,
    values: { generatorLoad: 186, oilPressure: 4.8, coolantTemp: 82, runningHours: 4821.6 },
    raw: { tags: ['GEN1.ACTIVE_POWER', 'ME1.LUBE_OIL_PRESSURE', 'ME1.COOLANT_TEMP', 'GEN1.RUN_HOURS'], units: ['kW', 'bar', 'degC', 'h'] },
  };
}
