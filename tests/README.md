# Testovi za J.A.R.V.I.S.

Automatske provjere koje učitavaju `../index.html` u simulirani preglednik (jsdom) i klikaju, govore i fotografiraju kao korisnik.

- Ne trebaju API ključeve ni internet: AI modeli, Firebase baza, kamera, govor i imenik telefona su lažni (simulirani).
- Ne sadrže osobne podatke: brojevi, imena i očitanja su izmišljeni.

## Pokretanje

```
cd tests
npm install
npm test
```

| Datoteka | Što provjerava |
|---|---|
| `passwords.test.js` | Lozinka prije brisanja, manje tipke za brisanje |
| `rezije-voice.test.js` | Režije glasom: upis, potvrda, slikanje brojila, zaštite, cijene, brisanje |
| `rezije-panel.test.js` | Ploča Režije: kartice, unos, grafovi, cijene, glas i kamera iz ploče |
| `models.test.js` | Claude Opus 5.5 pravila, zamjena zastarjelih modela, Haiku, Qwen, Gemini |
| `calls.test.js` | Pozivi iz protokola i glasom, padeži imena |
| `contacts.test.js` | Kontakti glasom i iz imenika, brzi poziv, sigurna potvrda |
