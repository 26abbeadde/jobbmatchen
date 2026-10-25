# Jobbmatchen

Hittar jobbannonser från Platsbanken som publicerats de senaste 7 dagarna och visar hur väl de matchar dina kunskaper och ditt CV.

## Funktioner

- **Bransch, roll och län/kommun**: välj en eller flera roller ur Arbetsförmedlingens yrkesregister.
- **Nyckelord, verktyg och system**: varje annons får en matchning i procent. Träffar i rubriken och i annonsens kravdel väger tyngre.
- **Synonymer**: "kalkylprogram" hittar Excel, "AI" hittar "artificiell intelligens" osv. (egen lista plus Arbetsförmedlingens kompetensregister).
- **CV-uppladdning**: PDF, Word (.docx/.doc), text eller bild. Inskannade CV:n läses med textigenkänning.
- **Krav du saknar**: visar kompetenser som annonsen kräver men som inte finns i din profil.
- **Filter**: distans/hybrid, heltid/deltid, anställningsform, ord att utesluta.
- **Spara, markera som sökt, dölj** och fliken *Sparade*.
- **Bevakning**: nya annonser sedan förra besöket markeras med NY, och appen kollar var 30:e minut medan den är öppen.
- **AI-analys (valfritt)**: med en egen Anthropic API-nyckel får du en bedömning per annons med styrkor, luckor och tips.

## Integritet

Allt körs i webbläsaren. CV, sparade annonser och API-nyckel lagras bara lokalt i din webbläsare. CV och annons skickas till Anthropic endast när du själv klickar *AI-analys*.

## Köra lokalt

Dubbelklicka på `Starta Jobbmatchen.bat` (kräver Python), eller öppna `index.html` via valfri webbserver.

Annonsdata: [JobTech / Arbetsförmedlingen](https://jobtechdev.se/).
