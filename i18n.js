// Langue de l'interface : anglais par défaut, français au choix. Changer de langue recharge la page
// (l'état est sauvé avant), donc les textes calculés au chargement suivent toujours la langue.
export const LANG = (() => { try { return localStorage.getItem('xy-lang') === 'fr' ? 'fr' : 'en'; } catch (e) { return 'en'; } })();
export function setLang(lang) { try { localStorage.setItem('xy-lang', lang); } catch (e) {} }
// Texte français -> anglais. Les clés sont les textes français tels qu'écrits dans le code et la page.
const EN = {
  // moteurs intégrés
  'Batterie': 'Drums', 'Corde': 'String',
  "Douze sons de batterie synthétisés, un par note de l'octave.": 'Twelve synthesized drum sounds, one per note of the octave.',
  'Deux oscillateurs scie et carré, filtre résonant.': 'Two saw and square oscillators, resonant filter.',
  'Deux opérateurs, du doux au métallique.': 'Two operators, from soft to metallic.',
  'Corde pincée par synthèse Karplus-Strong.': 'Plucked string, Karplus-Strong synthesis.',
  'Grosse caisse': 'Kick', 'Caisse claire': 'Snare', 'Charleston': 'Hi-hat', 'Saturation': 'Drive',
  'Forme': 'Shape', 'Désaccord': 'Detune', 'Filtre': 'Cutoff', 'Résonance': 'Resonance',
  'Indice': 'Index', 'Ton': 'Tone', 'Éclat': 'Brightness', 'Tenue': 'Decay', 'Matière': 'Material', 'Attaque': 'Attack',
  'Cloche': 'Cowbell', 'Tom grave': 'Low tom', 'Charley fermé': 'Closed hat', 'Tom médium': 'Mid tom', 'Tom aigu': 'High tom',
  'Charley ouvert': 'Open hat', 'Cymbale': 'Cymbal',
  // players
  'Montant': 'Up', 'Descendant': 'Down', 'Aller-retour': 'Up-down', 'Aléatoire': 'Random', 'Ordre joué': 'As played',
  'Majeur': 'Major', 'Mineur': 'Minor', 'Septième': 'Seventh', 'Mineur 7': 'Minor 7', 'Quinte': 'Fifth', 'Neuvième': 'Ninth',
  'Aucun': 'Off', 'Arpège': 'Arp', 'Accord': 'Chord', 'Vitesse': 'Rate', 'Renversement': 'Inversion',
  'Pas de player': 'No player', 'Arpège ': 'Arp ', 'Accord ': 'Chord ', 'tiens des notes': 'hold some notes',
  "Joue ou tiens des notes : l'arpège suit le tempo, lecture ou non.": 'Play or hold notes: the arp follows the tempo, playing or not.',
  "Choisis Arpège ou Accord avec l'encodeur 1.": 'Choose Arp or Chord with encoder 1.',
  // pages
  'Son': 'Sound', 'Enveloppe': 'Envelope', 'enveloppe': 'envelope', 'Piste': 'Track', 'Piste ': 'Track ', 'Pas': 'Step', 'Pas ': 'Step ',
  'Déclin': 'Decay', 'Maintien': 'Sustain', 'Relâche': 'Release', 'Moteur': 'Engine', 'Transposition': 'Transpose',
  'Niveau': 'Level', 'Envoi délai': 'Delay send', 'Vélocité': 'Velocity', 'Longueur': 'Length',
  'Délai': 'Delay', 'Retour': 'Feedback', 'Tonalité': 'Tone', 'Pistes 1–4': 'Tracks 1–4', 'Pistes 5–8': 'Tracks 5–8',
  'Panoramique': 'Pan', 'Général': 'Master', 'centre': 'center', 'Métronome': 'Metronome', 'oui': 'on', 'non': 'off',
  'Projet': 'Project', 'Projet ': 'Project ', 'Charger': 'Load', 'Sauver': 'Save', 'Nouveau': 'New', 'Exporter': 'Export', 'Suivre': 'Follow',
  ' pas': ' steps', ' pas · ': ' steps · ', ' mesure': ' bar', ' · retour ': ' · feedback ', '+ nouveau': '+ new', 'nouveau': 'new',
  'vide': 'empty', 'muet': 'muted', 'écran indisponible': 'screen unavailable', 'indisponible': 'unavailable', 'chargement…': 'loading…',
  'Rien sur cette sous-page.': 'Nothing on this sub-page.', 'Rien sur cette sous-page pour ce moteur.': 'Nothing on this sub-page for this engine.',
  ' vide. Touche un pas pour le créer, puis règle-le ici.': ' is empty. Tap a step to create it, then set it here.',
  'Rappuie sur la piste sélectionnée pour la couper ou la rétablir.': 'Press the selected track again to mute or unmute it.',
  'M1 charge, M2 sauve, M3 repart de zéro, M4 exporte en fichier.': 'M1 loads, M2 saves, M3 starts from scratch, M4 exports to a file.',
  'Appuie encore sur Bar pour dupliquer la dernière mesure.': 'Press Bar again to duplicate the last bar.',
  "Allonge la séquence avec Bar": 'Lengthen the sequence with Bar',
  'pas dans LAB_XY': 'not in LAB_XY', " n'est pas dans LAB_XY.": ' is not in LAB_XY.', ' : pas dans LAB_XY': ': not in LAB_XY',
  "allume l'instrument pour entendre": 'turn the instrument on to hear it',
  'Chargement de la machine…': 'Loading the machine…', 'Machine indisponible : ': 'Machine unavailable: ',
  'bpm · swing ': 'bpm · swing ',
  // navigateur de machines
  'Moteurs LAB_XY': 'LAB_XY engines', 'Kits de batterie Open-XY': 'Open-XY drum kits',
  'Démo : House': 'Demo: House', 'Démo : Techno': 'Demo: Techno', 'Démo : Easy jazz': 'Demo: Easy jazz',
  'Mapping MIDI': 'MIDI mapping', 'Jouer': 'Playing', 'Associer les touches et encodeurs d\'un contrôleur MIDI': 'Map the keys and encoders of a MIDI controller',
  'Rappuie sur M3 : attaque et relâche de la machine.': 'Press M3 again: the machine\'s attack and release.',
  'Rangée Shift (comme en tenant Shift sur l\'OP-XY). Rappuie sur M1 ou M2 pour revenir.': 'Shift row (as when holding Shift on the OP-XY). Press M1 or M2 again to go back.',
  'Rappuie sur M1 ou M2 : la rangée Shift, huit réglages de plus.': 'Press M1 or M2 again: the Shift row, eight more controls.',
  'La relâche fait durer le son après le relâchement de la note : les queues de nappes, de cloches, de pianos.': 'Release keeps the sound going after the note is let go: the tails of pads, bells and pianos.',
  'Hasard': 'Random', 'Scramble': 'Scramble', 'Hasard sur la piste {n}': 'Random steps on track {n}', 'Scramble sur la piste {n}': 'Sound scrambled on track {n}',
  'Maj+clic : annuler': 'Shift+click to undo', 'Rien à annuler': 'Nothing to undo', 'Annulé': 'Undone',
  'Pas au hasard sur la piste sélectionnée. Maj+clic : annuler.': 'Random steps on the selected track. Shift+click to undo.',
  'Mélange les réglages du son de la piste sélectionnée. Maj+clic : annuler.': 'Scrambles the sound settings of the selected track. Shift+click to undo.', 'Machines Open-XY': 'Open-XY machines', 'intégré': 'built in',
  ' machines': ' machines', 'source · ': 'source · ', 'licence du dépôt': "repository's license",
  'Aucune machine ne correspond.': 'No machine matches.',
  // messages
  "Allume d'abord l'instrument": 'Turn the instrument on first',
  "Allume d'abord l'instrument et branche l'OP-XY": 'Turn the instrument on and connect a MIDI controller first',
  'Arrêté · Stop encore pour couper tout le son': 'Stopped · Stop again to silence everything', 'Silence': 'Silenced',
  ' coupée': ' muted', ' rétablie': ' unmuted', '64 pas maximum': '64 steps maximum', 'Mesure dupliquée : ': 'Bar duplicated: ',
  'Stockage du navigateur plein': 'Browser storage is full', "Choisis un projet avec l'encodeur 1": 'Choose a project with encoder 1',
  ' chargé': ' loaded', ' sauvé': ' saved', 'Nouveau projet': 'New project', 'Projet exporté': 'Project exported',
  'Projet illisible : ': 'Unreadable project: ', 'Projet importé': 'Project imported', 'Import refusé : ': 'Import refused: ',
  'format inconnu': 'unknown format', 'fichier trop gros': 'file too large', 'lien invalide': 'invalid link',
  'Lien copié': 'Link copied', 'Lien prêt : copie-le ci-dessous': 'Link ready: copy it below', 'Partage impossible : ': 'Cannot share: ',
  'Lien de projet illisible : ': 'Unreadable project link: ', 'Avant le lien partagé': 'Before the shared link',
  'Projet partagé ouvert. Ton état précédent est dans Projects.': 'Shared project opened. Your previous state is in Projects.',
  "Rien d'enregistré": 'Nothing recorded', 'Enregistrement : ': 'Recording: ', '● Enregistrer': '● Record',
  'Touche CC ': 'Key CC ', ' non associée': ' not assigned', 'Touches associées': 'Keys assigned',
  'Confirmer ?': 'Confirm?', 'Tout désassocier': 'Unassign all', 'Confirmer la remise à zéro': 'Confirm the reset', 'Réinitialiser': 'Reset',
  'Apprendre': 'Learn', 'Annuler': 'Cancel', 'aucun': 'none', ' (défaut)': ' (default)', ' (à tourner)': ' (turn it)',
  'Encodeur ': 'Encoder ', 'Encodeurs (CC 1 à 4 par défaut)': 'Encoders (CC 1 to 4 by default)',
  'Modes': 'Modes', 'Sous-pages': 'Sub-pages', 'Pistes': 'Tracks', 'Fonctions': 'Functions', 'Moins (−)': 'Minus (−)', 'Plus (+)': 'Plus (+)',
  'Actualiser le MIDI': 'Refresh MIDI', 'Démarrage…': 'Starting…', 'Son impossible : ': 'No sound: ',
  'le navigateur ne fournit pas 44,1 kHz': 'the browser does not provide 44.1 kHz',
  'Son prêt. Web MIDI absent : utilise Chrome ou Edge.': 'Sound ready. No Web MIDI: use Chrome or Edge.',
  'Son prêt. Accès MIDI refusé par le navigateur.': 'Sound ready. The browser refused MIDI access.',
  "Son prêt. Aucun contrôleur MIDI : joue au clavier de l'ordinateur ou à l'écran.": 'Sound ready. No MIDI controller: play with the computer keyboard or on screen.',
  'Toutes les entrées': 'All inputs', 'Aucune entrée': 'No input', ' entrée': ' input', ' MIDI': ' MIDI', 'Éteint': 'Off',
  'Liste des machines introuvable : sers ce dossier par HTTP': 'Machine list not found: serve this folder over HTTP',
  'engine.wasm manquant': 'engine.wasm missing',
  'Encodeur {n} : {label} {value}': 'Encoder {n}: {label} {value}', 'Encodeur {n} inutilisé': 'Encoder {n} unused',
  'Séquence · piste {n} · {len} pas': 'Sequence · track {n} · {len} steps',
  'App installée': 'App installed', 'Installer l\'app': 'Install the app',
  'Hors ligne : {n} machines prêtes': 'Offline: {n} machines ready', 'Préparer le hors ligne': 'Make available offline',
  'Téléchargement des machines… {n} / {total}': 'Downloading machines… {n} / {total}',
  'Hors ligne impossible : ': 'Offline unavailable: ',

  // séquenceur
  'Toujours': 'Always', 'Sans fill': 'Not fill', '1er passage': '1st pass', 'Après le 1er': 'After 1st', 'Condition': 'Condition',
  'Motif {p} en attente': 'Pattern {p} queued', '{n} p-lock(s) effacé(s)': '{n} p-lock(s) cleared',
  'Accord de {n} notes. ': '{n}-note chord. ', '{n} p-lock(s). ': '{n} p-lock(s). ',
  'Tiens un pas et tourne un encodeur de son pour un p-lock.': 'Hold a step and turn a sound encoder to p-lock it.',
  'Latch : les notes jouées restent tenues ; rejoue une note pour la relâcher. Idéal pour les drones.': 'Latch: played notes keep holding; play a note again to release it. Great for drones.',
  'Motifs': 'Patterns', 'Morceau': 'Song', 'Copier': 'Copy', 'Effacer': 'Clear', 'Lecture': 'Playback', 'Boucle': 'Loop', 'Motif': 'Pattern',
  'Pendant la lecture, le motif choisi démarre à la fin du motif en cours.': 'While playing, the chosen pattern starts when the current one ends.',
  'Ligne': 'Row', 'Répétitions': 'Repeats', 'retirer': 'remove', 'Vers': 'To', '(rempli)': '(used)',
  'Ligne « + » puis encodeur 2 pour ajouter un motif ; répétitions à 0 pour retirer la ligne.': 'Row “+”, then encoder 2 to add a pattern; repeats at 0 to remove the row.',
  'Appuie encore sur M3 pour copier le motif {a} vers {b}.': 'Press M3 again to copy pattern {a} to {b}.',
  'Appuie encore sur M4 pour effacer le motif {a}.': 'Press M4 again to clear pattern {a}.',
  'Motif {a} copié vers {b}': 'Pattern {a} copied to {b}', 'Motif {a} effacé': 'Pattern {a} cleared',
  'Motif {p} · piste {n} · {len} pas': 'Pattern {p} · track {n} · {len} steps',
  'Tiens pour les pas en condition Fill (touche Q)': 'Hold for steps with the Fill condition (Q key)',
  "Pas : appui bref pour poser ou retirer un pas ; tiens-le pour l'éditer. Tenu, joue une note pour la placer, plusieurs pour un accord ; tourne un encodeur de son pour un p-lock ; rappuie sur la touche M de la page pour effacer ses p-locks. À la souris, Maj+clic (ou clic droit) garde un pas tenu jusqu'au prochain Maj+clic.":
    "Steps: tap to add or remove a step; hold it to edit. While holding, play a note to place it, several for a chord; turn a sound encoder for a p-lock; press the page's M key again to clear its p-locks. With a mouse, Shift+click (or right-click) keeps a step held until the next Shift+click.",
  'Encodeurs': 'Encoders', 'Détection automatique': 'Automatic detection', 'Relatif (1 / 127)': 'Relative (1 / 127)',
  'Relatif (1 / 0)': 'Relative (1 / 0)', 'Absolu (0 à 127)': 'Absolute (0 to 127)',
  'Tourne un encodeur pour voir les valeurs reçues.': 'Turn an encoder to see the values it sends.',
  'Répétition': 'Repeat', 'Roulement': 'Roll', 'Envers': 'Reverse', 'Arrêt bande': 'Tape stop', 'Passe-bas': 'Low pass', 'Passe-haut': 'High pass', 'Hachoir': 'Gate',
  'Effets': 'Effects', 'Tiens un effet': 'Hold an effect', 'Punch-in · tiens un effet': 'Punch-in · hold an effect',
  'Tiens les pas 1 à 8, ou les touches 1 à 8 du clavier, pour jouer les effets sur tout le son.': 'Hold steps 1 to 8, or keys 1 to 8 on the keyboard, to play the effects on the whole sound.',
  // page
  "Les machines Open-XY dans le navigateur. Avec ton OP-XY, un clavier MIDI, ou rien d'autre que ton ordinateur.": 'Open-XY machines in your browser. With your OP-XY, a MIDI keyboard, or nothing but your computer.',
  'Allumer': 'Turn on', 'Entrée MIDI': 'MIDI input', 'Partager': 'Share', 'Fermer': 'Close', 'Lien du projet': 'Project link',
  'Lien du projet à partager': 'Project link to share',
  'Enregistre la sortie audio en fichier WAV': 'Records the audio output to a WAV file',
  "Crée un lien qui ouvre ce projet chez quelqu'un d'autre": 'Creates a link that opens this project for someone else',
  "Remet l'instrument dans son état de départ. Garde les touches associées et les projets sauvés.": 'Puts the instrument back to its starting state. Keeps assigned keys and saved projects.',
  "Première fois ? Avec un OP-XY (mode contrôleur : COM puis M2) ou un autre contrôleur MIDI, associe ses touches une fois, c'est mémorisé. Sans matériel, joue au clavier de l'ordinateur ou sur le clavier à l'écran.": 'First time? With an OP-XY (controller mode: COM then M2) or another MIDI controller, assign its keys once; it is remembered. No hardware? Play with the computer keyboard or the on-screen keyboard.',
  'Associer les touches': 'Assign keys', 'Écran': 'Screen', 'Importer un projet': 'Import a project',
  'Clavier': 'Keyboard', 'Pages de 16 pas': 'Pages of 16 steps', 'Chercher : fm, drone, acid…': 'Search: fm, drone, acid…',
  'Chercher une machine': 'Search for a machine', 'Touches et encodeurs MIDI': 'MIDI keys and encoders',
  "Lancer l'assistant": 'Start the assistant', 'Appuie sur : <b id="wizAsk">—</b>': 'Press: <b id="wizAsk">—</b>',
  'Passer': 'Skip', 'Terminer': 'Done', 'Crédits': 'Credits',
  "Les touches −, + et Shift de l'OP-XY n'envoient pas de MIDI : l'octave se règle ici avec − et +, et en mode Mix un second appui sur la piste sélectionnée la coupe ou la rétablit. Les encodeurs 1 à 4 répondent aux CC 1 à 4 sans association, comme sur l'OP-XY ; avec un autre contrôleur, associe-les en tournant le bouton voulu. Tiens un pas et joue une note pour la placer dans ce pas.":
    "The OP-XY's −, + and Shift keys send no MIDI: set the octave here with − and +, and in Mix mode press the selected track again to mute or unmute it. Encoders 1 to 4 answer CC 1 to 4 without assigning, as on the OP-XY; with another controller, assign them by turning the knob you want. Hold a step and play a note to put it in that step.",
  "Sans matériel : touches A W S E D F T G Y H U J K pour les notes, Z et X pour l'octave, Q (tenue) pour Fill, 1 à 8 (tenues) pour les punch-in effects, Espace pour lecture et arrêt, Échap pour couper le son. Le clavier à l'écran se joue à la souris ou au doigt, plusieurs notes à la fois ; plus tu appuies bas sur une touche, plus la note est forte.":
    'No hardware: keys A W S E D F T G Y H U J K for notes, Z and X for the octave, Q (held) for Fill, 1 to 8 (held) for punch-in effects, Space to play and stop, Esc to silence. Play the on-screen keyboard with the mouse or your fingers, several notes at once; the lower you press a key, the louder the note.',
  "Ce que LAB_XY reproduit, et ce qu'il ne reproduit pas": 'What LAB_XY reproduces, and what it does not',
  'Reproduit': 'Reproduced', 'Pas reproduit': 'Not reproduced',
  'Le son de chaque machine : son vrai code C++, compilé en WebAssembly avec le SDK Open-XY.': "Each machine's sound: its real C++ code, compiled to WebAssembly with the Open-XY SDK.",
  "Son écran : l'animation est calculée par le même code que sur l'appareil.": 'Its screen: the animation is computed by the same code as on the device.',
  'Ses paramètres, leurs valeurs affichées et ses presets.': 'Its parameters, their displayed values and its presets.',
  'Les bugs propres à la logique de la machine (calculs, débordements, état, dessin) se montrent en général de la même façon.': "Bugs in the machine's own logic (math, overflow, state, drawing) usually show up the same way.",
  "Ce que le firmware de l'OP-XY fait autour de la machine : enveloppe, filtre et LFO d'origine, p-locks, attribution et vol des voix.": "What the OP-XY firmware does around the machine: stock envelope, filter and LFOs, p-locks, voice allocation and stealing.",
  "Les limites de temps réel du processeur de l'OP-XY, et le compilateur natif.": "The real-time limits of the OP-XY's processor, and the native compiler.",
  "Tout ce qui modifie le firmware lui-même : live looping, séquenceur d'origine, extensions. LAB_XY ne joue que les machines synthé.": 'Anything that changes the firmware itself: live looping, the stock sequencer, extensions. LAB_XY only plays synth machines.',
  'Une machine qui marche ici peut donc se comporter autrement une fois flashée. Pour les développeurs, le SDK fournit les vérifications côté appareil : compilation native (<code>sdk.py test --firmware</code>), mesure du processeur sur le matériel (<code>sdk.py profile</code>) et la liste de vérification QA.md de chaque machine. Pour écouter une machine avant de l\'installer, le <a href="https://open-xy.com" target="_blank" rel="noopener">builder Open-XY</a> propose aussi un aperçu de chacune ; LAB_XY sert à les jouer ensemble, comme une groovebox, avec ou sans OP-XY.':
    'So a machine that works here can behave differently once flashed. For developers, the SDK provides device-side checks: native compile (<code>sdk.py test --firmware</code>), CPU measurement on hardware (<code>sdk.py profile</code>) and each machine\'s QA.md checklist. To hear a machine before installing it, the <a href="https://open-xy.com" target="_blank" rel="noopener">Open-XY builder</a> also previews each one; LAB_XY is for playing them together, like a groovebox, with or without an OP-XY.',
  'Les machines sont celles du catalogue <a href="https://github.com/etcetc000/open-xy" target="_blank" rel="noopener">Open-XY</a>, compilées en WebAssembly avec son SDK, chacune sous la licence de son dépôt (MIT) ; l\'auteur et le dépôt sont indiqués sur chaque fiche. L\'aperçu navigateur du SDK n\'émule pas les enveloppes, filtres et effets du système d\'origine : une machine peut sonner un peu différemment sur l\'appareil. LAB_XY n\'est ni affilié à teenage engineering ni approuvé par elle ; OP-XY est une marque de son propriétaire.':
    'The machines come from the <a href="https://github.com/etcetc000/open-xy" target="_blank" rel="noopener">Open-XY</a> catalog, compiled to WebAssembly with its SDK, each under its repository\'s license (MIT); the author and repository are shown on each card. The SDK\'s browser preview does not emulate the stock system\'s envelopes, filters and effects: a machine can sound a little different on the device. LAB_XY is not affiliated with or endorsed by teenage engineering; OP-XY is a trademark of its owner.',
};
const norm = t => t.replace(/\s+/g, ' ').trim();
const ENN = {}; for (const k in EN) ENN[norm(k)] = EN[k];
// Traduit un texte écrit en français. {n} etc. sont remplacés par les valeurs données.
export function L(fr, vars) {
  let out = LANG === 'fr' ? fr : (EN[fr] ?? ENN[norm(fr)] ?? fr);
  if (vars) for (const k in vars) out = out.split('{' + k + '}').join(String(vars[k]));
  return out;
}
// Traduit la page : contenu des éléments [data-l], et attributs title, placeholder, aria-label.
export function translatePage(root = document) {
  document.documentElement.lang = LANG;
  if (LANG === 'fr') return;
  root.querySelectorAll('[data-l]').forEach(el => { el.innerHTML = L(norm(el.innerHTML)); });
  root.querySelectorAll('[title],[placeholder],[aria-label]').forEach(el => {
    for (const a of ['title', 'placeholder', 'aria-label']) if (el.hasAttribute(a)) el.setAttribute(a, L(el.getAttribute(a)));
  });
}
