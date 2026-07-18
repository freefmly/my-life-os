const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Cache-Control': 'no-store',
};

const symbols = ['SOXL', 'TQQQ', 'QLD', 'SPMO'];

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const apiKey = Deno.env.get('FINNHUB_API_KEY');
  if (!apiKey) return Response.json({ error: 'Market quote service is not configured.' }, { status: 503, headers: corsHeaders });

  try {
    const results = await Promise.all(symbols.map(async (symbol) => {
      const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`);
      if (!response.ok) throw new Error(`Quote request failed for ${symbol}`);
      const quote = await response.json();
      const price = Number(quote?.c);
      if (!Number.isFinite(price) || price <= 0) throw new Error(`Invalid quote for ${symbol}`);
      const timestamp = Number(quote?.t);
      return [symbol, { price, timestamp: timestamp ? new Date(timestamp * 1000).toISOString() : new Date().toISOString() }];
    }));

    return Response.json({ quotes: Object.fromEntries(results), fetchedAt: new Date().toISOString() }, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Unable to load market quotes.' }, { status: 502, headers: corsHeaders });
  }
});
