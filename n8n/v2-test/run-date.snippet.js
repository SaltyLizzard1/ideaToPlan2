// RUN DATE: the date this run started, read from the workflow clock. It is never hardcoded and never left to a
// model's own sense of the current year. Every prompt that judges a date is given this line.
const runDate = (() => {
  let ms = Date.now();
  try { const c = $('Founder Context').first().json; if (c && Number(c.run_started_ms) > 0) ms = Number(c.run_started_ms); } catch (e) {}
  const d = new Date(ms);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const iso = d.toISOString().slice(0, 10);
  return { ms, iso, line: 'RUN DATE: today is ' + iso + ' (' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + '), timezone UTC. This is the current date. Do not rely on your own sense of the current year. A date on or before ' + iso + ' is in the past and is not an error. Only a date after ' + iso + ' is in the future; a future publication date is an error to report and is never treated as published.' };
})();
