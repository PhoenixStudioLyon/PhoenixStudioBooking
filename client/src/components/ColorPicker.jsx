// Colour swatches (studio palette) + a custom colour input. Used for artists and booking types.
export const PALETTE = ['#C8643F', '#6F8A72', '#6F8FA6', '#B8893F', '#9A6A86', '#A0523D', '#5E7C8C', '#8A7A5C', '#B5707A', '#4F6B5A',
  '#D4A373', '#7D8F5A', '#8C6BB1', '#C25B7A', '#3E7C7A', '#5A5A5A'];

// allowNone: shows a "no colour" choice (value '')
export default function ColorPicker({ value, onChange, allowNone = false, noneLabel = 'None' }) {
  return (
    <div className="swatches">
      {allowNone && (
        <button type="button" className={`swatch swatch-none ${!value ? 'on' : ''}`} onClick={() => onChange('')}
          aria-label={noneLabel} title={noneLabel} />
      )}
      {PALETTE.map((c) => (
        <button key={c} type="button" className={`swatch ${value?.toLowerCase() === c.toLowerCase() ? 'on' : ''}`} style={{ background: c }}
          onClick={() => onChange(c)} aria-label={`Colour ${c}`} title={c} />
      ))}
      <input type="color" value={value || '#c8643f'} onChange={(e) => onChange(e.target.value)} aria-label="Custom colour" title="Custom colour" />
    </div>
  );
}
