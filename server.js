const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const WEATHER_KEY = process.env.OPENWEATHER_API_KEY;

app.post('/api/claude', async (req, res) => {
  try {
    console.log('Claude API call, key starts:', ANTHROPIC_KEY ? ANTHROPIC_KEY.substring(0,20) : 'MISSING');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        ...req.body
      })
    });
    const data = await response.json();
    console.log('Claude API response type:', data.type, 'error:', data.error);
    res.json(data);
  } catch (e) {
    console.error('Claude API error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/weather', async (req, res) => {
  try {
    const cities = ['Prague,CZ', 'Berlin,DE'];
    const results = await Promise.all(cities.map(city =>
      fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${city}&appid=${WEATHER_KEY}&units=metric&cnt=8`)
        .then(r => r.json())
    ));
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
