const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const WEATHER_KEY = process.env.OPENWEATHER_API_KEY;
const ENTSOE_KEY = process.env.ENTSOE_API_KEY;

async function getEntsoePrice(areaCode, date) {
  // ENTSO-E needs YYYYMMDDHHmm UTC format
  const pad = n => String(n).padStart(2,'0');
  const fmtDate = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
  
  // Use yesterday to today to ensure data exists
  const start = new Date(date);
  start.setUTCHours(0,0,0,0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate()+1);

  const url = `https://web-api.tp.entsoe.eu/api?securityToken=${ENTSOE_KEY}&documentType=A44&in_Domain=${areaCode}&out_Domain=${areaCode}&periodStart=${fmtDate(start)}&periodEnd=${fmtDate(end)}`;
  
  const res = await fetch(url);
  const xml = await res.text();
  console.log(`ENTSOE ${areaCode} status:`, res.status, 'xml start:', xml.slice(0,200));
  
  const prices = [];
  const regex = /<price.Amount>([\d.]+)<\/price.Amount>/g;
  let m;
  while ((m = regex.exec(xml)) !== null) prices.push(parseFloat(m[1]));
  console.log(`ENTSOE ${areaCode} prices found:`, prices.length, prices.slice(0,3));
  
  if (!prices.length) return null;
  const avg = prices.reduce((a,b)=>a+b,0)/prices.length;
  return { avg: avg.toFixed(1), min: Math.min(...prices).toFixed(1), max: Math.max(...prices).toFixed(1) };
}

async function getTTFPrice() {
  try {
    const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/TTF=F?interval=1d&range=2d', {
      headers: {'User-Agent':'Mozilla/5.0'}
    });
    const data = await res.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return price ? price.toFixed(2) : null;
  } catch(e) { return null; }
}

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
    console.error('Energy error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/claude', async (req, res) => {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':ANTHROPIC_KEY, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({ model:'claude-sonnet-4-5', max_tokens:1000, ...req.body })
    });
    const data = await response.json();
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/weather', async (req, res) => {
  try {
    const cities = ['Prague,CZ','Berlin,DE'];
    const results = await Promise.all(cities.map(c =>
      fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${c}&appid=${WEATHER_KEY}&units=metric&cnt=8`).then(r=>r.json())
    ));
    res.json(results);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
