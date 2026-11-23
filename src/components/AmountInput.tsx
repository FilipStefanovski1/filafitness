'use client';

/** Numeric field that opens the decimal keypad on phones and accepts "," as decimal separator. */
export function AmountInput({
  value,
  onChange,
  label,
  id,
  autoFocus,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  id?: string;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const fid = id ?? `amt-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="min-w-0 flex-1">
      <label className="label" htmlFor={fid}>
        {label}
      </label>
      <input
        id={fid}
        className="input text-lg font-semibold"
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''))}
        onFocus={(e) => e.target.select()}
      />
    </div>
  );
}
