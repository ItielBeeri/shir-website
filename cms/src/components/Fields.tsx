/**
 * One input per field type, shared by every form.
 *
 * Nothing here renders a key name, a quote mark or a bracket, and a boolean is
 * always a labelled switch rather than the words true and false - chapter 2 of
 * the editor guide exists only because those leak through in a text editor.
 */
import { ImageField } from './ImagePicker';
import type { Field } from '../model/types';

export type FieldValue = string | number | boolean | string[] | undefined;

interface Props {
  field: Field;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  /** Locked fields render read-only with their reason (legal pages, §6). */
  locked?: boolean;
  onRequestChange?: () => void;
}

export function FieldInput({ field, value, onChange, locked, onRequestChange }: Props): JSX.Element {
  const id = `f-${field.key.replace(/\W/g, '-')}`;
  const describedBy = field.help ? `${id}-help` : undefined;

  if (field.type === 'image') {
    return (
      <ImageField
        label={field.label}
        help={field.help}
        value={typeof value === 'string' ? value : undefined}
        onChange={onChange}
        disabled={locked}
      />
    );
  }

  const body = ((): JSX.Element => {
    switch (field.type) {
      case 'boolean':
        return (
          <div className="switch">
            <input
              id={id}
              type="checkbox"
              checked={Boolean(value)}
              disabled={locked}
              aria-describedby={describedBy}
              onChange={(e) => onChange(e.target.checked)}
            />
            <span>{value ? 'מוצג באתר' : 'מוסתר'}</span>
          </div>
        );

      case 'longtext':
        return (
          <textarea
            id={id}
            value={String(value ?? '')}
            disabled={locked}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case 'enum':
        return (
          <div className="chips" role="group" aria-labelledby={`${id}-label`}>
            {(field.options ?? []).map((option) => (
              <button
                key={option.value}
                type="button"
                className={value === option.value ? 'chip is-on' : 'chip'}
                disabled={locked}
                aria-pressed={value === option.value}
                onClick={() => onChange(value === option.value ? undefined : option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        );

      case 'tags':
        return (
          <TagsInput
            id={id}
            value={Array.isArray(value) ? value : []}
            disabled={locked}
            onChange={onChange}
          />
        );

      case 'paragraphs':
        return (
          <ParagraphsInput
            value={Array.isArray(value) ? value : []}
            disabled={locked}
            onChange={onChange}
          />
        );

      case 'date':
        return (
          <input
            id={id}
            type="date"
            value={String(value ?? '')}
            disabled={locked}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case 'number':
        return (
          <input
            id={id}
            type="number"
            value={value === undefined || value === null ? '' : String(value)}
            disabled={locked}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          />
        );

      default:
        return (
          <input
            id={id}
            type="text"
            value={String(value ?? '')}
            disabled={locked}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value)}
          />
        );
    }
  })();

  return (
    <div className="field">
      <label htmlFor={id} id={`${id}-label`}>
        {field.label}
      </label>
      {field.help && (
        <p className="help" id={`${id}-help`}>
          {field.help}
        </p>
      )}
      {body}
      {locked && (
        <p className="locked-note">
          <span>{field.locked}</span>
          {onRequestChange && (
            <button type="button" className="ghost" onClick={onRequestChange}>
              בקשת שינוי מאיתיאל
            </button>
          )}
        </p>
      )}
    </div>
  );
}

function TagsInput({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: string[];
  disabled?: boolean;
  onChange: (value: string[]) => void;
}): JSX.Element {
  return (
    <div className="tags">
      {value.map((tag, i) => (
        <span className="tag" key={i}>
          {tag}
          <button
            type="button"
            className="ghost"
            aria-label={`הסרת ${tag}`}
            disabled={disabled}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </span>
      ))}
      <input
        id={id}
        type="text"
        disabled={disabled}
        placeholder="הוספת מילה, ואז Enter"
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          const next = e.currentTarget.value.trim();
          if (!next || value.includes(next)) return;
          onChange([...value, next]);
          e.currentTarget.value = '';
        }}
      />
    </div>
  );
}

/**
 * A list of paragraphs, which is a list before it is a set of boxes: the count
 * is the owner's to change. Without add and remove she can rewrite what is
 * there and nothing else, and a statement that has to match the site cannot
 * gain the sentence the site just earned.
 */
export function ParagraphsInput({
  value,
  disabled,
  itemLabel = 'פסקה',
  onChange,
}: {
  value: string[];
  disabled?: boolean;
  /** Hebrew, singular - "פסקה" for prose, "שורה" for a bulleted list. */
  itemLabel?: string;
  onChange: (value: string[]) => void;
}): JSX.Element {
  const swap = (i: number, j: number): void => {
    const next = value.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="paragraphs">
      {value.map((paragraph, i) => (
        <div className="paragraph-row" key={i}>
          <textarea
            value={paragraph}
            disabled={disabled}
            aria-label={`${itemLabel} ${i + 1}`}
            onChange={(e) => {
              const next = value.slice();
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          <div className="paragraph-controls">
            <button
              type="button"
              className="ghost"
              aria-label="העברה למעלה"
              disabled={disabled || i === 0}
              onClick={() => swap(i, i - 1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="ghost"
              aria-label="העברה למטה"
              disabled={disabled || i === value.length - 1}
              onClick={() => swap(i, i + 1)}
            >
              ↓
            </button>
            <button
              type="button"
              className="ghost danger"
              aria-label={`מחיקת ${itemLabel} ${i + 1}`}
              disabled={disabled}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="ghost" disabled={disabled} onClick={() => onChange([...value, ''])}>
        + הוספת {itemLabel}
      </button>
      {value.length === 0 && <p className="muted">אין כאן כלום כרגע.</p>}
    </div>
  );
}
