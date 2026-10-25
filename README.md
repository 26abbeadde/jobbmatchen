# Jobbmatchen

Hittar jobbannonser som publicerats de senaste 7 dagarna och visar hur väl de matchar dina kunskaper och ditt CV.

**Öppna appen:** https://26abbeadde.github.io/jobbmatchen/ (går att installera på mobilens hemskärm)

## Funktioner

- **Bransch, roller, län/kommun**: välj en eller flera roller ur Arbetsförmedlingens yrkesregister.
- **Pendlingsavstånd**: ange din ort eller använd din position och visa bara jobb inom t.ex. 30 km.
- **Fler källor**: annonser från Platsbanken plus andra jobbsajter via JobTech Links.
- **Matchning**: nyckelord, verktyg och CV ger en procentsiffra per annons. Träffar i rubriken och kravdelen väger tyngre, synonymer räknas och krav du saknar visas.
- **Lär av dina val**: annonser som liknar dem du sparat hamnar högre, och sådana som liknar dem du dolt hamnar lägre.
- **Mina ansökningar**: följ annonser från Sparad till Sökt, Intervju och Erbjudande/Avslag, med anteckningar och påminnelse innan sista ansökningsdag.
- **AI-hjälp (valfritt, egen API-nyckel)**: bedömning av hur väl du passar, utkast till personligt brev och tips för CV:t.
- **Bevakning**: nya annonser markeras med NY, och appen kollar var 30:e minut medan den är öppen.
- **Export/import** av dina data mellan enheter, och **offlinestöd** för sparade annonser.

## Integritet

Allt körs i webbläsaren. CV, sparade annonser och API-nyckel lagras bara lokalt. CV och annons skickas till Anthropic endast när du själv använder AI-hjälpen. När du söker på ort skickas ortnamnet till OpenStreetMap för att hitta koordinaterna.

## Utveckling

Ingen byggprocess, bara statiska filer och ES-moduler:

| Fil | Innehåll |
|---|---|
| `js/app.js` | Gränssnittet |
| `js/matching.js` | Matchning, synonymer, CV-termer, dubbletter |
| `js/learning.js` | Rankning som lär sig av dina val |
| `js/tracker.js` | Ansökningsuppföljning och påminnelser |
| `js/sources.js` | Hämtning från JobSearch och JobTech Links |
| `js/store.js` | Lagring och export/import |
| `js/taxonomy.js`, `js/geo.js`, `js/cv.js`, `js/ai.js` | Register, platser, CV-läsning, AI |

```bash
npm start      # lokal server på http://localhost:8765 (kräver Python)
npm test       # kör testerna (Node 20+)
```

Appen kräver en webbserver, eftersom ES-moduler inte laddas från `file://`. På Windows räcker det att dubbelklicka på `Starta Jobbmatchen.bat`.

Annonsdata: [JobTech / Arbetsförmedlingen](https://jobtechdev.se/). Ortsökning: [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/).
