# Toetsing

Klasapp voor een lesstart waarbij leerlingen eerst het vak, jaar en de leerstof kiezen en daarna een kleur-vormcombinatie openen voor een vraag uit de geziene leerstof.

## Wat zit erin

- keuze voor vak en jaar
- keuze tussen 1 thema of de ganse leerstof
- bord met gekleurde vormen
- vragen alleen uit de door de leerkracht ingevoerde vraagbank
- leerkrachtenunit met paswoord
- vakken toevoegen
- vragen beheren per vak, jaar, thema, kleur en vorm

## Startgegevens

Voorlopig staan deze vakken klaar:

- Nederlands
- Wiskunde

Er staan bewust nog geen vragen in de app.

## Standaard paswoord

Voor deze eerste lokale versie is het standaard paswoord:

`toetsing123`

Je kan dat overschrijven met een environment variable:

`TOETSING_TEACHER_PASSWORD`

## Lokaal starten

Vanuit de projectmap:

```powershell
.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8020
```

## Render

Voor Render staat er een aparte deployconfig klaar:

- `render.yaml`
- `requirements-render.txt`

Render gebruikt dan:

```text
Build command:
pip install -r requirements-render.txt

Start command:
uvicorn app:app --host 0.0.0.0 --port $PORT
```

Belangrijk: de vraagbank wordt nu bewaard in `data/catalog.json`. Op een gratis Render web service is het bestandssysteem tijdelijk, dus leerkrachtvragen gaan verloren bij een redeploy of restart. Voor blijvende opslag heb je later best een persistent disk of een echte database.
