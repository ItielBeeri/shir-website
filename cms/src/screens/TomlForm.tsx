/**
 * A form over one TOML file.
 *
 * The file is read, spliced field by field and written back whole, so the
 * Hebrew comments the owner reads in the repo survive every save. Nothing on
 * screen names a file, a key or a quote mark.
 */
import { useEffect, useMemo, useState } from 'react';
import { api, FriendlyError } from '../api';
import { findSlot, setValues } from '../content/toml-edit';
import { useStore } from '../store';
import type { TomlScalar } from '../content/toml-edit';
import type { Field, Screen } from '../model/types';
import { FieldInput } from '../components/Fields';
import type { FieldValue } from '../components/Fields';

interface Props {
  screen: Screen;
  role: 'owner' | 'maintainer';
  onSaved: () => void;
}

type Values = Record<string, FieldValue>;

const readValue = (source: string, field: Field): TomlScalar | undefined => {
  try {
    return findSlot(source, field.path ?? []).value;
  } catch {
    // A field the model knows and the file does not: the parity test catches
    // that: here the input simply stays empty rather than crashing the screen.
    return undefined;
  }
};

export function TomlForm({ screen, role, onSaved }: Props): JSX.Element {
  const store = useStore();
  const [source, setSource] = useState<string | null>(null);
  const [values, setValues_] = useState<Values>({});
  const [initial, setInitial] = useState<Values>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fields = useMemo(() => (screen.groups ?? []).flatMap((g) => g.fields), [screen]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .read(screen.file!)
      .then(({ content }) => {
        if (cancelled || content === null) return;
        const next: Values = {};
        for (const field of fields) {
          const value = readValue(content, field);
          if (value !== undefined) next[field.key] = value;
        }
        setSource(content);
        setValues_(next);
        setInitial(next);
      })
      .catch((e: FriendlyError) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [screen, fields]);

  const dirty = Object.keys(values).some((k) => values[k] !== initial[k]);
  const missing = fields.filter(
    (f) => f.required && typeof values[f.key] === 'string' && !String(values[f.key]).trim(),
  );

  async function save(): Promise<void> {
    if (!source) return;
    setBusy(true);
    setError(null);
    try {
      const edits = fields
        .filter((f) => values[f.key] !== undefined && values[f.key] !== initial[f.key])
        .map((f) => ({ path: f.path ?? [], value: values[f.key] as TomlScalar }));
      const next = setValues(source, edits);
      await api.save(`עדכון ${screen.title}`, [{ path: screen.file!, content: next }]);
      setSource(next);
      setInitial(values);
      store.saved();
      onSaved();
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'משהו השתבש. אפשר לנסות שוב.');
    } finally {
      setBusy(false);
    }
  }

  if (error && !source) {
    return (
      <>
          <p className="banner error">{error}</p>
      </>
    );
  }
  if (!source) {
    return (
      <>
          <p className="muted">רגע, טוען…</p>
      </>
    );
  }

  return (
    <>
      {(screen.groups ?? []).map((group, i) => (
        <section className="group" key={i}>
          {group.title && <h2>{group.title}</h2>}
          {group.help && <p className="help muted">{group.help}</p>}
          {group.fields.map((field) => (
            <FieldInput
              key={field.key}
              field={field}
              locked={Boolean(field.locked) && role === 'owner'}
              value={values[field.key]}
              onChange={(v) => setValues_((prev) => ({ ...prev, [field.key]: v }))}
            />
          ))}
        </section>
      ))}

      {/* Beside the button: a failure reported at the top of a long form is
          reported where she is not looking. */}
      {error && <p className="banner error" role="alert">{error}</p>}

      <button className="primary" onClick={save} disabled={!dirty || busy || missing.length > 0}>
        {busy ? 'שומר…' : 'שמירה'}
      </button>
      {missing.length > 0 && (
        <p className="invalid">צריך למלא: {missing.map((f) => f.label).join(', ')}</p>
      )}
      {!dirty && !busy && <p className="muted" style={{ marginBlockStart: 8 }}>אין שינויים לשמור.</p>}
    </>
  );
}
