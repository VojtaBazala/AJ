# AJ Trainer — Hands-free English + Energy News

PWA pro Android Chrome. Funguje hands-free při řízení.

## Rychlý deploy

### 1. Naklonuj repo a nainstaluj závislosti
```bash
git clone https://github.com/<tvuj-username>/AJ.git
cd AJ
npm install
```

### 2. Lokální test
```bash
# vytvoř .env soubor
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
echo "OPENWEATHER_API_KEY=..." >> .env

# spusť
node server.js
# otevři http://localhost:3000
```

### 3. Deploy na Heroku
```bash
heroku login
heroku create <tvuj-app-nazev>

heroku config:set ANTHROPIC_API_KEY=sk-ant-...
heroku config:set OPENWEATHER_API_KEY=...

git add .
git commit -m "initial deploy"
git push heroku main
```

### 4. Přidej na plochu Androidu
1. Otevři `https://<tvuj-app-nazev>.herokuapp.com` v Chrome
2. Menu (tři tečky) → **Add to Home screen**
3. Potvrď — appka se přidá jako ikona

## Hlasové příkazy (home screen)
Řekni anglicky nebo česky:
- **"news"** / **"energy"** → spustí zprávy + přečte nahlas
- **"pronunciation"** / **"sentence"** → spustí výslovnost
- **"vocab"** / **"words"** → spustí slovíčkový kvíz
- **"talk"** / **"conversation"** → spustí small talk

## Funkce
| Modul | Co dělá |
|-------|---------|
| ⚡ Energy News | AI shrnutí EU/DE/CZ trhů + počasí, přečte nahlas |
| 🗣 Pronunciation | B2 věta → přehraje → čeká na opakování → vyhodnotí |
| 📝 Vocab Quiz | 10 slov CZ → odpovíš EN → okamžitá zpětná vazba |
| 💬 Small Talk | Plnohodnotná AI konverzace, jemné opravy gramatiky |

## Env variables (Heroku)
```
ANTHROPIC_API_KEY=sk-ant-...
OPENWEATHER_API_KEY=...
```
Nikdy je nedávej do kódu ani na GitHub.
