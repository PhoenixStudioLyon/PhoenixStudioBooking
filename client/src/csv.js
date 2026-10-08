// CSV cell for exports. Values starting with = + - @ (or tab / carriage return) would be run as formulas by
// Excel or LibreOffice, so they get a leading apostrophe ("formula injection" protection).
export const csvCell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};
