const symbols = ['TQQQ', 'QLD', 'SPMO'];
const nyDate = (value: Date | number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(value));
const number = (value: unknown) => Number(value) || 0;

type Quote = { price: number; timestamp: number };
type Snapshot = Record<string, unknown> & { date: string };

function replaceDailySnapshot(snapshots: unknown, snapshot: Snapshot) {
  const day = snapshot.date.slice(0, 10);
  const existing = Array.isArray(snapshots) ? snapshots.filter((item) => String(item?.date || '').slice(0, 10) !== day) : [];
  return [...existing, snapshot];
}

function currentVrCycle(vr: Record<string, unknown>) {
  const cycles = Array.isArray(vr.cycles) ? vr.cycles : [];
  return [...cycles].sort((a, b) => new Date(String(a?.date || '')).getTime() - new Date(String(b?.date || '')).getTime()).at(-1) as Record<string, unknown> | undefined;
}

function vrPosition(vr: Record<string, unknown>, cycle: Record<string, unknown>) {
  let shares = number(cycle.shares);
  let averagePrice = number(cycle.averagePrice);
  let pool = number(cycle.pool);
  const trades = (Array.isArray(vr.trades) ? vr.trades : [])
    .filter((trade) => trade?.cycleId === cycle.id)
    .sort((a, b) => new Date(String(a?.date || '')).getTime() - new Date(String(b?.date || '')).getTime());
  trades.forEach((trade) => {
    const quantity = number(trade.shares);
    const price = number(trade.price);
    const amount = quantity * price;
    if (trade.type === 'buy') {
      averagePrice = shares + quantity ? ((shares * averagePrice) + amount) / (shares + quantity) : 0;
      shares += quantity;
      pool -= amount;
    } else {
      shares = Math.max(0, shares - quantity);
      pool += amount;
      if (!shares) averagePrice = 0;
    }
  });
  return { shares, averagePrice, pool };
}

Deno.serve(async (request) => {
  const cronSecret = Deno.env.get('CRON_SNAPSHOT_SECRET');
  if (!cronSecret || request.headers.get('x-cron-secret') !== cronSecret) return new Response('Unauthorized', { status: 401 });

  const apiKey = Deno.env.get('FINNHUB_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!apiKey || !supabaseUrl || !serviceKey) return new Response('Server configuration missing', { status: 503 });

  try {
    const quoteEntries = await Promise.all(symbols.map(async (symbol) => {
      const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`);
      if (!response.ok) throw new Error(`Quote request failed for ${symbol}`);
      const quote = await response.json();
      const price = number(quote?.c);
      const timestamp = number(quote?.t) * 1000;
      if (!price || !timestamp) throw new Error(`Invalid quote for ${symbol}`);
      return [symbol, { price, timestamp }] as const;
    }));
    const quotes = Object.fromEntries(quoteEntries) as Record<string, Quote>;
    const marketDay = nyDate(new Date());
    if (Object.values(quotes).some((quote) => nyDate(quote.timestamp) !== marketDay)) return Response.json({ skipped: 'market-not-closed-today' });

    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
    const rowsResponse = await fetch(`${supabaseUrl}/rest/v1/life_app_states?select=user_id,data`, { headers });
    if (!rowsResponse.ok) throw new Error('Unable to load app states');
    const rows = await rowsResponse.json() as Array<{ user_id: string; data: Record<string, unknown> }>;
    const capturedAt = new Date().toISOString();
    let updated = 0;

    for (const row of rows) {
      const data = row.data || {};
      const investments = (data.investments || {}) as Record<string, unknown>;
      const accounts = (investments.familyAccounts || {}) as Record<string, Record<string, unknown>>;
      let changed = false;

      for (const account of Object.values(accounts)) {
        const holdings = (account.holdings || {}) as Record<string, Record<string, unknown>>;
        const symbolsValue = Object.keys(holdings);
        if (!symbolsValue.length) continue;
        let stockValue = 0;
        symbolsValue.forEach((symbol) => {
          const holding = holdings[symbol];
          const price = quotes[symbol]?.price || number(holding.currentPrice);
          holding.currentPrice = price;
          stockValue += number(holding.shares) * price;
        });
        const total = stockValue + number(account.cash);
        if (!total && !number(account.contributed)) continue;
        account.snapshots = replaceDailySnapshot(account.snapshots, { id: crypto.randomUUID(), date: capturedAt, total, principal: number(account.contributed), source: 'market-close' });
        changed = true;
      }

      const vr = investments.tqqqVr as Record<string, unknown> | undefined;
      const cycle = vr ? currentVrCycle(vr) : undefined;
      if (vr && cycle) {
        const position = vrPosition(vr, cycle);
        const valuation = position.shares * quotes.TQQQ.price;
        vr.snapshots = replaceDailySnapshot(vr.snapshots, { id: crypto.randomUUID(), date: capturedAt, cycleId: cycle.id, valuation, total: valuation + position.pool, pool: position.pool, targetValue: number(cycle.targetValue), lowerBand: number(cycle.lowerBand), upperBand: number(cycle.upperBand), source: 'market-close' });
        changed = true;
      }

      if (!changed) continue;
      data.investments = investments;
      const update = await fetch(`${supabaseUrl}/rest/v1/life_app_states?user_id=eq.${encodeURIComponent(row.user_id)}`, { method: 'PATCH', headers, body: JSON.stringify({ data, updated_at: capturedAt }) });
      if (!update.ok) throw new Error(`Unable to save snapshot for ${row.user_id}`);
      updated += 1;
    }
    return Response.json({ updated, marketDay, capturedAt });
  } catch (error) {
    console.error(error);
    return new Response('Unable to capture daily investment snapshots', { status: 502 });
  }
});
