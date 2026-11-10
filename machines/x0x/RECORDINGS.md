# Recording credits

The machine code is MIT. The embedded recordings retain these separate terms.

## TR-707

Recorded by Francois Dion, distributed through Hyperreal and repackaged by
Fluid Music. The sampler's original README explicitly dedicates the recordings
to the public domain. Source revision:
[`fluid-music/open-drums` 475cc3314fe06f6d1af02e9790ad9707c1f2b26b](https://github.com/fluid-music/open-drums/tree/475cc3314fe06f6d1af02e9790ad9707c1f2b26b/tr-707/TR707WAV).
The original dedication is preserved in [707-README.txt](707-README.txt).

## TR-909 cymbals and hats

From the **TR-909 JGB pack**, recorded by **Janne G:son Berg (2005)** and edited
and published by **altemark**. Licensed under
[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
No endorsement by the recordists, altemark or Roland is implied.

| Embedded recording | Original | Source |
| --- | --- | --- |
| Closed hat | ch13.wav | [Freesound 26532](https://freesound.org/people/altemark/sounds/26532/) |
| Open hat | oh08.wav | [Freesound 26650](https://freesound.org/people/altemark/sounds/26650/) |
| Crash | clp17.wav | [Freesound 26568](https://freesound.org/people/altemark/sounds/26568/) |
| Ride | ride07.wav | [Freesound 26664](https://freesound.org/people/altemark/sounds/26664/) |

Sources are the publicly downloadable high-quality MP3 previews. They are not
the original WAV files. The pack's clp12–clp22 files are long cymbal recordings,
despite their names. The selection follows the independently documented
[Gateria attribution and instrument mapping](https://gateriamusic.com/audio/909/CREDITS.txt).

## Adaptations

Recordings are converted to mono, resampled to 22.05 kHz (707) or 30 kHz (909),
trimmed, peak normalized to 0.85, given a short end fade and encoded with an
8-bit logarithmic curve. Playback decodes and linearly interpolates this data.
No firmware ROM data is included. These recordings have their own existing
analog/digital character; the encoder is a storage optimization, not a claim
to reproduce an original converter exactly.

`provenance.json` records each source URL, source SHA-256 and encoded SHA-256.
`generate.py` reproduces the transformations with Python and ffmpeg. Keep this
attribution and the applicable license with redistributed source and packages.
