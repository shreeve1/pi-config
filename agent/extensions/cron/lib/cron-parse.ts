type ValidationResult = { valid: true } | { valid: false; error: string };

type ParsedCron = {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>; // 0-6, 0 = Sunday
  domIsWildcard: boolean;
  dowIsWildcard: boolean;
};

type FieldSpec = {
  name: string;
  min: number;
  max: number;
  normalize?: (value: number) => number;
};

const FIELD_SPECS: readonly FieldSpec[] = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day-of-month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12 },
  {
    name: "day-of-week",
    min: 0,
    max: 7,
    normalize: (v) => (v === 7 ? 0 : v),
  },
] as const;

function parseNumber(value: string, spec: FieldSpec): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid ${spec.name} token: "${value}"`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < spec.min || parsed > spec.max) {
    throw new Error(
      `${spec.name} value ${parsed} out of range (${spec.min}-${spec.max})`,
    );
  }

  return spec.normalize ? spec.normalize(parsed) : parsed;
}

function addRange(
  out: Set<number>,
  start: number,
  end: number,
  step: number,
  spec: FieldSpec,
): void {
  if (step <= 0) {
    throw new Error(`${spec.name} step must be > 0`);
  }
  if (start > end) {
    throw new Error(`${spec.name} range start must be <= end`);
  }

  for (let n = start; n <= end; n += step) {
    out.add(spec.normalize ? spec.normalize(n) : n);
  }
}

function parseListItem(item: string, spec: FieldSpec, out: Set<number>): void {
  if (item === "*") {
    addRange(out, spec.min, spec.max, 1, spec);
    return;
  }

  const [base, stepRaw] = item.split("/");
  if (item.split("/").length > 2) {
    throw new Error(`Invalid ${spec.name} token: "${item}"`);
  }

  const step = stepRaw === undefined ? 1 : Number(stepRaw);
  if (stepRaw !== undefined && (!/^\d+$/.test(stepRaw) || step <= 0)) {
    throw new Error(`Invalid ${spec.name} step in "${item}"`);
  }

  if (base === "*") {
    addRange(out, spec.min, spec.max, step, spec);
    return;
  }

  if (base.includes("-")) {
    const [startRaw, endRaw] = base.split("-");
    if (base.split("-").length !== 2 || !startRaw || !endRaw) {
      throw new Error(`Invalid ${spec.name} range in "${item}"`);
    }

    const start = parseNumber(startRaw, spec);
    const end = parseNumber(endRaw, spec);
    addRange(out, start, end, step, spec);
    return;
  }

  if (stepRaw !== undefined) {
    throw new Error(`Invalid ${spec.name} step base in "${item}"`);
  }

  out.add(parseNumber(base, spec));
}

function parseField(rawField: string, spec: FieldSpec): Set<number> {
  if (!rawField.trim()) {
    throw new Error(`Missing ${spec.name} field`);
  }

  const values = new Set<number>();
  const parts = rawField.split(",");

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) {
      throw new Error(`Invalid ${spec.name} list syntax`);
    }
    parseListItem(trimmed, spec, values);
  }

  if (values.size === 0) {
    throw new Error(`No values parsed for ${spec.name}`);
  }

  return values;
}

function parseCron(expr: string): ParsedCron {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Cron expression must have exactly 5 fields`);
  }

  const [minF, hourF, domF, monF, dowF] = fields;

  return {
    minutes: parseField(minF, FIELD_SPECS[0]),
    hours: parseField(hourF, FIELD_SPECS[1]),
    daysOfMonth: parseField(domF, FIELD_SPECS[2]),
    months: parseField(monF, FIELD_SPECS[3]),
    daysOfWeek: parseField(dowF, FIELD_SPECS[4]),
    domIsWildcard: domF.trim() === "*",
    dowIsWildcard: dowF.trim() === "*",
  };
}

function matchesDate(parts: ParsedCron, date: Date): boolean {
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dayOfMonth = date.getDate();
  const month = date.getMonth() + 1;
  const dayOfWeek = date.getDay();

  if (!parts.minutes.has(minute)) return false;
  if (!parts.hours.has(hour)) return false;
  if (!parts.months.has(month)) return false;

  const domMatch = parts.daysOfMonth.has(dayOfMonth);
  const dowMatch = parts.daysOfWeek.has(dayOfWeek);

  if (parts.domIsWildcard && parts.dowIsWildcard) return true;
  if (parts.domIsWildcard) return dowMatch;
  if (parts.dowIsWildcard) return domMatch;
  return domMatch || dowMatch;
}

export function validateCron(expr: string): ValidationResult {
  try {
    parseCron(expr);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Invalid cron expression",
    };
  }
}

export function nextRun(expr: string, after: Date = new Date(), _timezone?: string): Date {
  const parsed = parseCron(expr);

  const candidate = new Date(after.getTime());
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  const maxMinutes = 4 * 366 * 24 * 60; // 4 years to handle Feb 29

  for (let i = 0; i < maxMinutes; i++) {
    if (matchesDate(parsed, candidate)) {
      return new Date(candidate.getTime());
    }
    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  throw new Error("No matching run time found within 4 years");
}
