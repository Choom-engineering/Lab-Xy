# LAB_XY

Les machines du catalogue Open-XY, jouables dans le navigateur avec un OP-XY branché en USB en mode contrôleur MIDI, sans flasher de firmware.

👉 **[lab-xy.netlify.app](https://lab-xy.netlify.app)** · 🐞 [Signaler un bug](https://github.com/Choom-engineering/Lab-Xy/issues) · 🇬🇧 [English](README.md)

## Lancer sur ton ordinateur

Double-clique sur `index.html` : l'app s'ouvre dans ton navigateur, sans serveur ni Python. Utilise Chrome ou Edge (Web MIDI). Au premier clic sur **Turn on**, Chrome demande l'accès aux appareils MIDI : accepte. Si la demande n'apparaît pas, autorise le MIDI pour les fichiers locaux dans `chrome://settings/content/midiDevices`.

## Publier pour d'autres utilisateurs

Tout est statique : n'importe quel hébergement HTTPS convient (GitHub Pages, Cloudflare Pages, Netlify).
Avec GitHub Pages : pousser ce dossier dans un dépôt, puis Settings → Pages → Deploy from a branch → `main` / racine.
HTTPS est requis pour Web MIDI hors `localhost`.

## Séquenceur

- **Pas** : appui bref pour poser ou retirer ; tenu pour éditer. Tenu, une note la place, plusieurs font un accord (jusqu'à 6 notes).
- **P-locks** : pas tenu + encodeur sur une page de son (Son, Machine, Page 2, Enveloppe) ; le réglage ne vaut que pour ce pas, appliqué à l'échantillon près. Pas tenu + touche M de la page affichée : efface ses p-locks. À la souris, Maj+clic garde un pas tenu.
- **Conditions** (Instrument M4, encodeur 4) : probabilités, 1:2 à 4:4, Fill / Sans fill (touche Fill, ou Q), 1er passage / Après le 1er.
- **Latch** (Players M2) : les notes jouées restent tenues jusqu'à être rejouées.
- **Arrange** : 16 motifs A à P (M1), morceau en lignes motif × répétitions (M2), copier (M3, appuyer deux fois) et effacer (M4, appuyer deux fois). En lecture, un nouveau motif démarre à la fin du motif en cours.

## Punch-in effects

Mode **Punch** : les pas 1 à 8 (à l'écran ou sur l'OP-XY) se tiennent pour jouer un effet sur tout le son ; les touches 1 à 8 du clavier marchent dans tous les modes. Repeat et Roll rejouent une tranche (division réglable), Reverse lit à l'envers, Tape stop ralentit jusqu'à l'arrêt, Low pass et High pass balaient un filtre, Bits dégrade, Gate hache le son. Les effets se combinent ; chacun a son animation à l'écran, et un bandeau rappelle les effets actifs dans les autres modes.

## Encodeurs

La détection relatif/absolu est automatique et suit les derniers messages reçus. Si un encodeur répond mal, choisir son codage à la main dans **Touches et encodeurs MIDI** ; les valeurs reçues s'y affichent pour vérifier.

## App installable et hors ligne

Servi en HTTPS (Netlify, GitHub Pages…), le site s'installe comme une app : Chrome ou Edge affichent **Install the app** en haut de la page, ou l'icône d'installation dans la barre d'adresse. L'app s'ouvre ensuite dans sa propre fenêtre, depuis une icône sur le bureau, sans Python ni serveur local.

Le service worker (`sw.js`) garde l'app et chaque machine utilisée ; **Make available offline**, dans le panneau Machines, télécharge les 56 machines d'un coup (environ 7 Mo) pour jouer sans connexion.

**Publier une mise à jour** :
1. Modifier les sources (`app.js`, `i18n.js`, `worklet.js`), puis lancer `python tools/build.py`, qui régénère `app.bundle.js` et les scripts des machines.
2. Augmenter le numéro de version : `VERSION` dans `sw.js` et dans `app.js`, et `app.bundle.js?v=` dans `index.html`. Sinon les visiteurs gardent l'ancienne version en cache.

## Langues

L'interface démarre en anglais ; le sélecteur EN | FR en haut retient le choix. Les textes sont écrits en français dans le code et traduits par `i18n.js` (dictionnaire français → anglais) : un nouveau texte s'écrit `L('…')` et prend son entrée dans le dictionnaire.

## Contenu

- `index.html`, `app.js` (source) et `app.bundle.js` (généré par `tools/build.py`, c'est lui que la page charge) : l'interface, le séquenceur (8 pistes, jusqu'à 64 pas), Players (arpège, accords), Projects.
- `worklet.js` : l'audio. Les machines tournent dans l'hôte WebAssembly du SDK Open-XY (`sdk/browser/engine.mjs`), avec des notes datées à l'échantillon près ; les moteurs intégrés (Batterie, Analog, FM, Corde) sont écrits ici.
- `machines/` : 55 machines compilées, chacune avec son manifeste, son artwork d'écran et sa licence. Voir `CREDITS.md`.
- `sdk/` : modules hôtes du SDK Open-XY (MIT), copiés sans modification.

## Mettre à jour les machines

Avec le SDK Open-XY cloné et Clang (wasm32) installé : `python sdk.py preview --machine <dossier> --out <sortie>` pour chaque machine du catalogue, puis copier `engine.wasm`, `panel.svg`, le manifeste et la licence dans `machines/<id>/` et régénérer `machines/index.json`.

## Limites connues

- L'aperçu navigateur du SDK n'émule pas les enveloppes, filtres, LFO et effets du système de l'OP-XY : une machine peut sonner un peu différemment sur l'appareil.
- Les touches −, + et Shift de l'OP-XY n'envoient pas de MIDI en mode contrôleur ; l'octave se règle à l'écran, et le mode Mix sert à couper les pistes.
- Les modes Sample et Com ne sont pas implémentés.

LAB_XY n'est ni affilié à teenage engineering ni approuvé par elle. OP-XY est une marque de son propriétaire.
