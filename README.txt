Heizungs-Logbuch (PWA) – Deploy auf GitHub Pages

1) GitHub Repository erstellen (z.B. "heizlog")
2) Alle Dateien aus diesem Ordner ins Repo hochladen:
   - index.html
   - app.js
   - config.js
   - manifest.json
   - sw.js
   - icon-192.png
   - icon-512.png

3) GitHub Pages aktivieren:
   Repo -> Settings -> Pages
   Source: Deploy from a branch
   Branch: main
   Folder: / (root)

4) URL am iPhone in Safari öffnen -> Teilen -> "Zum Home-Bildschirm"

Hinweis:
- Zwei Logins: in der App unter "Registrieren" zwei Accounts erstellen.
- Daten sind pro Benutzer getrennt (RLS Policies).
