// Startup file for cPanel "Setup Node.js App" (Phusion Passenger), which loads apps with require().
// The server is an ES module, so it is loaded with import(). Locally, keep using `npm start`.
import('./server/index.js').catch((err) => {
  console.error(err);
  process.exit(1);
});
