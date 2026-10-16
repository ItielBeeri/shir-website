/**
 * Form state over some fields of one TOML file: what is saved, what she has
 * typed over it, and the splice that saves the difference.
 *
 * The source is the screen's, not the hook's. The recommendations screen also
 * rewrites that file from its list, and a form holding its own copy would save
 * that copy over whatever the list had changed since.
 */
import { useMemo, useState } from 'react';
import { findSlot, setValues } from '../content/toml-edit';
import type { TomlScalar } from '../content/toml-edit';
import type { Field } from '../model/types';
import type { FieldValue } from '../components/Fields';
import { useDraftKeeper } from './unsaved';
import type { DraftKeeper } from './unsaved';

export type Values = Record<string, FieldValue>;

export interface TomlFields {
  values: Values;
  set: (key: string, value: FieldValue) => void;
  /** Put back work offered by the draft keeper. */
  restore: (values: Values) => void;
  dirty: boolean;
  /** Required text fields left empty. */
  missing: Field[];
  draft: DraftKeeper<Values>;
  /** `source` with every changed field spliced in. */
  splice: (source: string) => string;
  /** Call once the spliced source is saved and adopted. */
  settle: () => void;
}

const readValue = (source: string, field: Field): TomlScalar | undefined => {
  try {
    return findSlot(source, field.path ?? []).value;
  } catch {
    // A field the model knows and the file does not: the parity test catches
    // that: here the input simply stays empty rather than crashing the screen.
    return undefined;
  }
};

export function useTomlFields(file: string, fields: Field[], source: string | null): TomlFields {
  const saved = useMemo(() => {
    const out: Values = {};
    if (source === null) return out;
    for (const field of fields) {
      const value = readValue(source, field);
      if (value !== undefined) out[field.key] = value;
    }
    return out;
  }, [source, fields]);

  const [typed, setTyped] = useState<Values>({});
  const values = useMemo(() => ({ ...saved, ...typed }), [saved, typed]);

  const changed = fields.filter((f) => values[f.key] !== undefined && values[f.key] !== saved[f.key]);
  const dirty = changed.length > 0;
  const draft = useDraftKeeper(file, values, { dirty, ready: source !== null });

  return {
    values,
    set: (key, value) => setTyped((prev) => ({ ...prev, [key]: value })),
    restore: setTyped,
    dirty,
    missing: fields.filter(
      (f) => f.required && typeof values[f.key] === 'string' && !String(values[f.key]).trim(),
    ),
    draft,
    splice: (src) =>
      setValues(
        src,
        changed.map((f) => ({ path: f.path ?? [], value: values[f.key] as TomlScalar })),
      ),
    settle: () => setTyped({}),
  };
}
