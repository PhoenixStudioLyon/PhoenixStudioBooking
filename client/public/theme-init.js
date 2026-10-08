// Applies the saved light/dark theme before the page draws (avoids a white flash in dark mode)
try { document.documentElement.dataset.theme = localStorage.getItem('pb:theme') === 'dark' ? 'dark' : 'light'; } catch (e) { /* no storage */ }
