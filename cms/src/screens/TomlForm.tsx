/**
 * A form over one TOML file.
 *
 * The file is read, spliced field by field and written back whole, so the
 * Hebrew comments the owner reads in the repo survive every save. Nothing on
 * screen names a file, a key or a quote mark.
 */
import { useEffect, useMemo, useState } from 'react';
import { api, FriendlyError } from '../api';
import { useStore } from '../store';
import type { Screen } from '../model/types';
import { FieldInput } from '../components/Fields';
import { DraftOffer } from '../lib/unsaved';
import { useTomlFields } from '../lib/toml-fields';

interface Props {
  screen: Screen;
  role: 'owner' | 'maintainer';
  onSaved: () => void;
}

export function TomlForm({ screen, role, onSaved }: Props): JSX.Element {
  const store = useStore();
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fields = useMemo(() => (screen.groups ?? []).flatMap((g) => g.fields), [screen]);
  const form = useTomlFields(screen.file!, fields, source);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .read(screen.file!)
      .then(({ content }) => {
        if (cancelled || content === null) return;
        setSource(content);
      })
      .catch((e: FriendlyError) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [screen]);

  async function save(): Promise<void> {
    if (!source) return;
    setBusy(true);
    setError(null);
    try {
      const next = form.splice(source);
      await api.save(`עדכון ${screen.title}`, [{ path: screen.file!, content: next }]);
      setSource(next);
      form.settle();
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
      <DraftOffer keeper={form.draft} onRestore={form.restore} />

      {(screen.groups ?? []).map((group, i) => (
        <section className="group" key={i}>
          {group.title && <h2>{group.title}</h2>}
          {group.help && <p className="help muted">{group.help}</p>}
          {group.fields.map((field) => (
            <FieldInput
              key={field.key}
              field={field}
              locked={Boolean(field.locked) && role === 'owner'}
              value={form.values[field.key]}
              onChange={(v) => form.set(field.key, v)}
            />
          ))}
        </section>
      ))}

      {/* Beside the button: a failure reported at the top of a long form is
          reported where she is not looking. */}
      {error && <p className="banner error" role="alert">{error}</p>}

      <button className="primary" onClick={save} disabled={!form.dirty || busy || form.missing.length > 0}>
        {busy ? 'שומר…' : 'שמירה'}
      </button>
      {form.missing.length > 0 && (
        <p className="invalid">צריך למלא: {form.missing.map((f) => f.label).join(', ')}</p>
      )}
      {!form.dirty && !busy && <p className="muted" style={{ marginBlockStart: 8 }}>אין שינויים לשמור.</p>}
    </>
  );
}
