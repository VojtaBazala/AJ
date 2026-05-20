const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const WEATHER_KEY = process.env.OPENWEATHER_API_KEY;
const ENTSOE_KEY = process.env.ENTSOE_API_KEY;

// ── ENTSO-E helper ───────────────────────────────────────
async function getEntsoePrice(areaCode, date) {
  const d = date.toISOString().slice(0,10).replace(/-/g,'');
  const tomorrow = new Date(date);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const d2 = tomorrow.toISOString().slice(0,10).replace(/-/g,'');
  const url = `https://web-api.tp.entsoe.eu/api?securityToken=${ENTSOE_KEY}&documentType=A44&in_Domain=${areaCode}&out_Domain=${areaCode}&periodStart=${d}0000&periodEnd=${d2}0000`;
  const res = await fetch(url);
  const xml = await res.text();
  // extract all prices
  const prices = [];
  const regex = /<price.Amount>([\d.]+)<\/price.Amount>/g;
  let m;
  while ((m = regex.exec(xml)) !== null) prices.push(parseFloat(m[1]));
  if (prices.length === 0) return null;
  const avg = prices.reduce((a,b) => a+b, 0) / prices.length;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return { avg: avg.toFixed(1), min: min.toFixed(1), max: max.toFixed(1), hours: prices.length };
}

// ── TTF Gas via Yahoo Finance ────────────────────────────
async function getTTFPrice() {
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/TTF=F?interval=1d&range=2d';
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return price ? price.toFixed(2) : null;
  } catch(e) { return null; }
}

// ── Energy data endpoint ─────────────────────────────────
app.get('/api/energy', async (req, res) => {
  try {
    const today = new Date();
    const [cz, de, ttf] = await Promise.all([
      getEntsoePrice('10YCZ-CEPS-----N', today),
      getEntsoePrice('10Y1001A1001A83F', today),
      getTTFPrice()
    ]);
    res.json({ cz, de, ttf, date: today.toISOString().slice(0,10) });
  } catch(e) {
    console.error('Energy data error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Anthropic proxy ──────────────────────────────────────
app.post('/api/claude', async (req, res) => {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        ...req.body
      })
    });
    const data = await response.json();
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Weather proxy ────────────────────────────────────────
app.get('/api/weather', async (req, res) => {
  try {
    const cities = ['Prague,CZ', 'Berlin,DE'];
    const results = await Promise.all(cities.map(city =>
      fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${city}&appid=${WEATHER_KEY}&units=metric&cnt=8`)
        .then(r => r.json())
    ));
    res.json(results);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
