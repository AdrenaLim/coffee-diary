// Coffee Diary Worker — D1-backed brew log API, static assets for everything else.
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const METHODS = new Set(['latte', 'icelatte', 'coldbrew']);
const RECORDERS = new Set(['kang', 'natasha']);

function parseBrew(body) {
  const errors = [];
  const method = String(body.method || '').trim().toLowerCase();
  if (!METHODS.has(method)) errors.push('method must be latte or coldbrew');

  const bean = String(body.bean || '').trim().slice(0, 120) || 'House blend';

  const num = (v, name, min, max) => {
    const n = Number(v);
    if (!Number.isFinite(n)) { errors.push(`${name} must be a number`); return null; }
    return Math.min(max, Math.max(min, n));
  };

  const grind = num(body.grind, 'grind', 0, 100);
  const dose_g = num(body.dose_g, 'dose_g', 0, 500);
  const water_g = num(body.water_g, 'water_g', 0, 5000);
  const milk_g = (body.milk_g == null || body.milk_g === '') ? 0 : num(body.milk_g, 'milk_g', 0, 5000);   // ice latte milk, optional
  // seconds optional — null means "didn't time it", stored as 0
  let seconds = null;
  if (body.seconds != null && body.seconds !== ''){
    const s = Number(body.seconds);
    if (!Number.isFinite(s)) errors.push('seconds must be a number');
    else seconds = Math.min(86400, Math.max(0, s));
  }

  let rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 0 || rating > 10) errors.push('rating must be an integer 0-10');

  const notes = String(body.notes || '').trim().slice(0, 600);
  const recorder = RECORDERS.has(String(body.recorder || '').trim().toLowerCase())
    ? String(body.recorder).trim().toLowerCase()
    : 'kang';

  if (errors.length) return { errors };
  return {
    brew: {
      method,
      bean,
      grind,
      dose_g,
      water_g,
      milk_g,
      seconds: seconds == null ? 0 : Math.round(seconds),
      rating,
      notes,
      recorder,
    },
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/brews') {
      if (request.method === 'GET') {
        const method = url.searchParams.get('method');
        const stmt = method
          ? env.DB.prepare('SELECT * FROM brews WHERE method = ? ORDER BY created_at DESC, id DESC')
          : env.DB.prepare('SELECT * FROM brews ORDER BY created_at DESC, id DESC');
        const { results } = method
          ? await stmt.bind(method).all()
          : await stmt.all();
        return json({ brews: results });
      }

      if (request.method === 'POST') {
        let body;
        try {
          body = await request.json();
        } catch {
          return json({ error: 'invalid JSON body' }, 400);
        }
        const { errors, brew } = parseBrew(body);
        if (errors) return json({ error: errors.join('; ') }, 400);
        const { success, meta } = await env.DB.prepare(
          `INSERT INTO brews (method, bean, grind, dose_g, water_g, milk_g, seconds, rating, notes, recorder)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(brew.method, brew.bean, brew.grind, brew.dose_g, brew.water_g, brew.milk_g, brew.seconds, brew.rating, brew.notes, brew.recorder)
          .run();
        const id = meta.last_row_id;
        const row = await env.DB.prepare('SELECT * FROM brews WHERE id = ?').bind(id).first();
        return json({ brew: row }, 201);
      }

      return json({ error: 'method not allowed' }, 405);
    }

    const del = path.match(/^\/api\/brews\/(\d+)$/);
    if (del && request.method === 'DELETE') {
      const id = Number(del[1]);
      const { meta } = await env.DB.prepare('DELETE FROM brews WHERE id = ?').bind(id).run();
      return meta.changes > 0 ? json({ ok: true }) : json({ error: 'not found' }, 404);
    }

    if (del && request.method === 'PUT') {
      const id = Number(del[1]);
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'invalid JSON body' }, 400);
      }
      const { errors, brew } = parseBrew(body);
      if (errors) return json({ error: errors.join('; ') }, 400);
      const { meta } = await env.DB.prepare(
        `UPDATE brews SET method=?, bean=?, grind=?, dose_g=?, water_g=?, milk_g=?, seconds=?, rating=?, notes=?, recorder=?
         WHERE id = ?`
      )
        .bind(brew.method, brew.bean, brew.grind, brew.dose_g, brew.water_g, brew.milk_g, brew.seconds, brew.rating, brew.notes, brew.recorder, id)
        .run();
      if (!meta.changes) return json({ error: 'not found' }, 404);
      const row = await env.DB.prepare('SELECT * FROM brews WHERE id = ?').bind(id).first();
      return json({ brew: row });
    }

    if (path === '/api/health') return json({ ok: true, ts: Date.now() });

    return env.ASSETS.fetch(request);
  },
};
