
function isTuplet(obj) {
    console.log(obj instanceof VF.Tuplet)
    return obj instanceof VF.Tuplet;
}

function createBeamEights(notes, notesTriplets, indecesTubles) {


    const possibleBeams = [[-1, 2048, 2048, 2048], [2048, 2048, 2048, -1], [-1, 2048, 2048, -1],  [2048, 2048, -1, -1], [2048, 2048, 2048, 2048]]
    const noteCount = [4, 4, 4, 3, 3, 4, 4];
    
    
    let noLongerThanEights = [];
    let counter = 0;
    for (let i = 0; i < notes.length; ++i) {
        let continueVar = false;
        for (let j = 0; j < indecesTubles.length; ++j) { 
            if (counter == 3) {
                counter = 0;
            }
            if (indecesTubles[j] == i && counter > 0) {
                counter += 1;
                continueVar = true
            }
            if (indecesTubles[j] == i && counter == 0) {
                noLongerThanEights.push(-1);
                noLongerThanEights.push(-1);
                counter += 1;
                continueVar = true
            }
        }
        if (continueVar) {
            continue
        }
        if (notes[i].isRest() || notes[i].getTicks().value() != 2048) {
            const addedEightRests = notes[i].getTicks().value() / 2048
            for (let j = 0; j < addedEightRests; ++j) {
                noLongerThanEights.push(-1);
            }
            
        } else {
            noLongerThanEights.push(notes[i].getTicks().value());
        }
    }
    let beamGroup1 = []
    let beamGroup2 = []

    function getSpliceValues(possibleBeam) {
        let startIndex = null;
        let length = 0;
        for (let i = 0; i < possibleBeam.length; ++i) {
            if (possibleBeam[i] != -1 && startIndex == null) {
                startIndex = i;
            } 
            if (possibleBeam[i] != -1) length += 1;
        }
        return [startIndex, length]
    }

    for (let i = 0; i < possibleBeams.length; ++i) {
        if (noLongerThanEights.length >= 3) {
            // Erste Bedingung: Vergleiche die ersten 4 Elemente von noLongerThanEights, ohne Änderung
            if (JSON.stringify(noLongerThanEights.slice(0, 4)) === JSON.stringify(possibleBeams[i])) {
                // Extrahiere den Bereich aus notes ohne Änderung des Original-Arrays
                const spliceValues = getSpliceValues(possibleBeams[i]);
                beamGroup1 = notes.slice(spliceValues[0], spliceValues[1] + spliceValues[0]);
            }
            // Zweite Bedingung: Vergleiche die letzten 4 Elemente und prüfe beamGroup1.length
            if (JSON.stringify(noLongerThanEights.slice(-4)) === JSON.stringify(possibleBeams[i])) {
                // Extrahiere die letzten 4 Elemente aus notes ohne Änderung
                const spliceValues = getSpliceValues(possibleBeams[i]);
                beamGroup2 = notes.slice(-4).slice(spliceValues[0], spliceValues[0] + spliceValues[1]);
            }
        }
    }
    if (beamGroup2.length > 0 && beamGroup1.length > 0) {
        return [beamGroup1, beamGroup2]
    }
    if (beamGroup1.length > 0 ) {
        return [beamGroup1]
    }
    if (beamGroup2.length > 0 ) {
        return [beamGroup2]
    }
    return []
}

const { Renderer, Stave, StaveNote, Voice, Formatter, StaveConnector, Accidental, Annotation, Beam } = VexFlow;

// Create an SVG renderer and attach it to the DIV element named "output".
const div = document.getElementById("output");
const renderer = new Renderer(div, Renderer.Backends.SVG);

// Configure the rendering context.
renderer.resize(1200, 5000);
const context = renderer.getContext();

// Finde das SVG-Element
const svg = document.querySelector('svg');

let isClicked = null;

async function changeOriginalData(originalData) {
    console.log(JSON.stringify(originalData))
    const url = "/saveStatus/" + indexForRoute;
    try {
        const response = await fetch(url, {
            method: "POST",
            body: JSON.stringify(originalData),
            headers: { 
                "Content-Type": "application/json" // 🠐- Wichtig!
              },
        });
        if (!response.ok) {
        throw new Error(`Response status: ${response.status}`);
        }

        const json = await response.json();
        console.log(json);
    } catch (error) {
        console.error(error.message);
    }
}

// Globale Event-Listener für benutzerdefinierte chordClick-Events
svg.addEventListener('chordClick', (e) => {
    context.clear()
    resetGlobalChordCounter()

    let index1 = null
    let index2 = null
    let index3 = null

    const groupIndex = e.detail.chordPosition[2]
    const measureInGroupIndex = e.detail.chordPosition[0]
    const noteIndex = e.detail.chordPosition[1]
    const measureIndex = groupIndex * 3 + measureInGroupIndex;

    if (e.detail.allData.chordNames[groupIndex][measureInGroupIndex][noteIndex] != "Unknown chord") {
        if (e.detail.allData.voicings[groupIndex][measureInGroupIndex][noteIndex].length > 0) {
             // Neue Keys aus den Voicings erstellen (nur erste Note oder alle Voicings)
             let newKeys = [];

             if (!e.detail.allData.addedVoicingsIndeces) {
                e.detail.allData.addedVoicingsIndeces = []
             }

             let voicngIndex = 0;
             let lastAddedVoicingIndex = null;

             if (Object.hasOwn(e.detail.originalData[measureIndex][noteIndex], 'voicingIndex')) {
                voicngIndex = e.detail.originalData[measureIndex][noteIndex].voicingIndex
             }

             for (let i = 0; i < e.detail.allData.addedVoicingsIndeces.length; ++i) {
                if (JSON.stringify(e.detail.allData.addedVoicingsIndeces[i].slice(0, 3)) === JSON.stringify([groupIndex, measureInGroupIndex, noteIndex])) {
                    lastAddedVoicingIndex = i;
                }
             }

             if (lastAddedVoicingIndex != null && e.detail.allData.addedVoicingsIndeces[lastAddedVoicingIndex][3] < e.detail.allData.voicings[groupIndex][measureInGroupIndex][noteIndex].length - 1) {
                voicngIndex = e.detail.allData.addedVoicingsIndeces[lastAddedVoicingIndex][3] + 1;
            }

            if (lastAddedVoicingIndex != null && e.detail.allData.addedVoicingsIndeces[lastAddedVoicingIndex][3] + 1 == e.detail.allData.voicings[groupIndex][measureInGroupIndex][noteIndex].length) {
                voicngIndex = 0;
            }
             // Voicings hinzufügen (falls vorhanden)
             if (e.detail.allData.voicings[groupIndex][measureInGroupIndex][noteIndex].length > 0) {
                for (let m = 0; m < e.detail.allData.voicings[groupIndex][measureInGroupIndex][noteIndex][voicngIndex][1].length; ++m) {
                    newKeys.push(convertToVexFlowKey(e.detail.allData.voicings[groupIndex][measureInGroupIndex][noteIndex][voicngIndex][1][m]));
                }
                if (newKeys.length > 1) {
                    e.detail.allData.addedVoicingsIndeces.push([groupIndex, measureInGroupIndex, noteIndex, voicngIndex]);
                }    
             }
             e.detail.originalData[measureIndex][noteIndex].voicingIndex = voicngIndex;
             changeOriginalData(e.detail.originalData);
 
             // Dauer der Note anpassen (entferne "r" für Rest)
             const duration = e.detail.allData.staveNotes[groupIndex][measureInGroupIndex][noteIndex].getDuration().replace("r", "");
 
             // Erstelle eine neue StaveNote mit den neuen Keys und der Dauer
             const newNote = new VexFlow.StaveNote({
                 keys: newKeys,
                 duration: duration
             });
             e.detail.allData.staveNotes[groupIndex][measureInGroupIndex][noteIndex] = newNote;

        }   
    }
    isClicked = true;
    for (let i = 0; i < e.detail.allData.staveNotes.length ; ++i) {
        renderThreeMeasure(e.detail.allData.staveNotes[i], 220 * i, i, e.detail.allData.chordNames[i], e.detail.allData, e.detail.originalData, e.detail.keySignatureNumber); 
    }
    isClicked = false;

    console.log(`Geklickter Akkord: ${e.detail.chord} (Index: ${e.detail.chordPosition})`);
});

// Funktion zum Zurücksetzen des globalen Zählers (nicht mehr benötigt, aber für Kompatibilität beibehalten)
function resetGlobalChordCounter() {
    // Leer, da globalChordCounter entfernt wurde
}

// Funktion bleibt unverändert
function removeRedundantAccidentals(notes, keySignature) {
    const keySignatureAccidentals = {
        'Cb': { 'B': 'b', 'E': 'b', 'A': 'b', 'D': 'b', 'G': 'b', 'C': 'b', 'F': 'b' },
        'Gb': { 'B': 'b', 'E': 'b', 'A': 'b', 'D': 'b', 'G': 'b', 'C': 'b' },
        'Db': { 'B': 'b', 'E': 'b', 'A': 'b', 'D': 'b', 'G': 'b' },
        'Ab': { 'B': 'b', 'E': 'b', 'A': 'b', 'D': 'b' },
        'Eb': { 'B': 'b', 'E': 'b', 'A': 'b' },
        'Bb': { 'B': 'b', 'E': 'b' },
        'F': { 'B': 'b' },
        'C': {},
        'G': { 'F': '#' },
        'D': { 'F': '#', 'C': '#' },
        'A': { 'F': '#', 'C': '#', 'G': '#' },
        'E': { 'F': '#', 'C': '#', 'G': '#', 'D': '#' },
        'B': { 'F': '#', 'C': '#', 'G': '#', 'D': '#', 'A': '#' },
        'F#': { 'F': '#', 'C': '#', 'G': '#', 'D': '#', 'A': '#', 'E': '#' },
        'C#': { 'F': '#', 'C': '#', 'G': '#', 'D': '#', 'A': '#', 'E': '#', 'B': '#' }
    };

    const keyAccidentals = keySignatureAccidentals[keySignature] || {};

    return notes.map(note => {
        const newKeys = note.getKeys().map(key => {
            const [noteName, octave] = key.split('/');
            const baseNote = noteName[0].toUpperCase();
            const accidental = noteName.length > 1 ? noteName[1] : null;
            const keyAccidental = keyAccidentals[baseNote] || null;

            if (accidental && accidental === keyAccidental) {
                return `${baseNote.toLowerCase()}/${octave}`;
            }
            return key;
        });
        if (note.isRest()) {
            const duration = note.getDuration();
            const finalDuration = duration.includes("r") ? duration : duration + "r";
            return new VexFlow.StaveNote({
                clef: note.clef,
                keys: newKeys,
                duration: finalDuration
            });
        }
        return new VexFlow.StaveNote({
            clef: note.clef,
            keys: newKeys,
            duration: note.getDuration()
        });
    });
}

// Funktion bleibt unverändert
function applyAccidentals(notes, keySignature) {
    const keySignatureAccidentals = {
        'Cb': { 'B': 'b', 'E': 'b', 'A': 'b', 'D': 'b', 'G': 'b', 'C': 'b', 'F': 'b' },
        'Gb': { 'B': 'b', 'E': 'b', 'A': 'b', 'D': 'b', 'G': 'b', 'C': 'b' },
        'Db': { 'B': 'b', 'E': 'b', 'A': 'b', 'D': 'b', 'G': 'b' },
        'Ab': { 'B': 'b', 'E': 'b', 'A': 'b', 'D': 'b' },
        'Eb': { 'B': 'b', 'E': 'b', 'A': 'b' },
        'Bb': { 'B': 'b', 'E': 'b' },
        'F': { 'B': 'b' },
        'C': {},
        'G': { 'F': '#' },
        'D': { 'F': '#', 'C': '#' },
        'A': { 'F': '#', 'C': '#', 'G': '#' },
        'E': { 'F': '#', 'C': '#', 'G': '#', 'D': '#' },
        'B': { 'F': '#', 'C': '#', 'G': '#', 'D': '#', 'A': '#' },
        'F#': { 'F': '#', 'C': '#', 'G': '#', 'D': '#', 'A': '#', 'E': '#' },
        'C#': { 'F': '#', 'C': '#', 'G': '#', 'D': '#', 'A': '#', 'E': '#', 'B': '#' }
    };

    const accidentalsInMeasure = {};
    const keyAccidentals = keySignatureAccidentals[keySignature] || {};
    console.log(notes)
    notes.forEach((note, noteIndex) => {
        note.getKeys().forEach((key, keyIndex) => {
            const [noteName, octave] = key.split('/');
            const baseNote = noteName[0].toUpperCase();
            const accidental = noteName.length > 1 ? noteName[1] : null;
            const keyAccidental = keyAccidentals[baseNote] || null;
            const currentAccidentalInMeasure = accidentalsInMeasure[baseNote] || null;

            if (accidental) {
                if (accidental !== currentAccidentalInMeasure) {
                    note.addModifier(new Accidental(accidental), keyIndex);
                    accidentalsInMeasure[baseNote] = accidental;
                }
            } else {
                if (currentAccidentalInMeasure === null && keyAccidental) {
                    accidentalsInMeasure[baseNote] = keyAccidental;
                } else if (currentAccidentalInMeasure !== null && currentAccidentalInMeasure !== keyAccidental) {
                    if (keyAccidental) {
                        note.addModifier(new Accidental(keyAccidental), keyIndex);
                        accidentalsInMeasure[baseNote] = keyAccidental;
                    } else {
                        if (!note.isRest()) {
                            note.addModifier(new Accidental('n'), keyIndex);
                            accidentalsInMeasure[baseNote] = 'n';
                        }
                    }
                }
            }
        });
    });
    return notes;
}

// Angepasste renderOneMeasure-Funktion
function renderOneMeasure(bassStaveNotes, trebleStaveNotes, xOffset, yOffset, isFirstMeasure, keySignatureNumber, chordNames, allData, measureIndex, lineIndex, originalData) {
    const keySignatureMap = {
        '-7': 'Cb', '-6': 'Gb', '-5': 'Db', '-4': 'Ab', '-3': 'Eb', '-2': 'Bb', '-1': 'F',
        '0': 'C', '1': 'G', '2': 'D', '3': 'A', '4': 'E', '5': 'B', '6': 'F#', '7': 'C#'
    };

    const keySignature = keySignatureMap[keySignatureNumber] || 'C';
    bassStaveNotes = removeRedundantAccidentals(bassStaveNotes, keySignature);
    trebleStaveNotes = removeRedundantAccidentals(trebleStaveNotes, keySignature);

    console.log(bassStaveNotes)
    const trebleStave = new Stave(10 + xOffset, 40 + yOffset, 350);
    if (isFirstMeasure) {
        trebleStave.addClef("treble").addKeySignature(keySignature).addTimeSignature("4/4");
    }
    trebleStave.setContext(context).draw();

    const bassStave = new Stave(10 + xOffset, 140 + yOffset, 350);
    if (isFirstMeasure) {
        bassStave.addClef("bass").addKeySignature(keySignature).addTimeSignature("4/4");
    }
    bassStave.setContext(context).draw();

    if (isFirstMeasure) {
        const connector = new StaveConnector(trebleStave, bassStave);
        connector.setType(StaveConnector.type.BRACE);
        connector.setContext(context).draw();
    }

    const lineLeft = new StaveConnector(trebleStave, bassStave);
    lineLeft.setType(StaveConnector.type.SINGLE_LEFT);
    lineLeft.setContext(context).draw();

    const lineRight = new StaveConnector(trebleStave, bassStave);
    lineRight.setType(StaveConnector.type.SINGLE_RIGHT);
    lineRight.setContext(context).draw();

    const annotatedTrebleNotes = trebleStaveNotes.map((note, noteIndex) => {
        if (chordNames[noteIndex] && chordNames[noteIndex] !== "Unknown chord") {
            const annotation = new Annotation(chordNames[noteIndex])
                .setFont("Times", 12, "normal")
                .setVerticalJustification(Annotation.VerticalJustify.TOP);
            note.addModifier(annotation, 0);
            note.annotation = { text: chordNames[noteIndex], position: [measureIndex, noteIndex] };
        }
        return note;
    });

    const processedTrebleNotes = applyAccidentals(annotatedTrebleNotes, keySignature);
    const processedBassNotes = applyAccidentals(bassStaveNotes, keySignature);

    // Helper function to check if a group is beamable
    function isBeamableGroup(group) {
        return group.every(note => {
            const duration = note.getDuration();
            const isRest = note.isRest() || duration.includes('r');
            const baseDuration = duration.replace(/[dwhqr]/g, '');
            return !isRest && ['8', '16', '32', '64'].includes(baseDuration);
        });
    }
    // Integrate NoteGrouper for treble notes
    
    let counter = 0;
    let trebleNoteTupletGroups = []
    let bassNoteTupletGroups = []

    let indecesTuples = []

    console.log(measureIndex, lineIndex)
    for (let i = 0; i < allData.tupletsIndeces.length; ++i) {
        for (let j = 0; j < allData.tupletsIndeces[i].length; ++j) {
            if (allData.tupletsIndeces[i][j][0] != measureIndex + lineIndex * 3) {
                continue
            }
            if (counter == 0 ) {
                trebleNoteTupletGroups.push([])
                bassNoteTupletGroups.push([])
            }
            
            trebleNoteTupletGroups.at(-1).push(processedTrebleNotes[allData.tupletsIndeces[i][j][1]])
            bassNoteTupletGroups.at(-1).push(processedBassNotes[allData.tupletsIndeces[i][j][1]])
            indecesTuples.push(allData.tupletsIndeces[i][j][1])

            counter += 1; 
            if (counter == 3 ) {
                counter = 0
            }
        }
    }
    const trebleBeams = [...createBeamEights(processedTrebleNotes, trebleNoteTupletGroups, indecesTuples), ...trebleNoteTupletGroups].map(group => new VexFlow.Beam(group));


    // Integrate NoteGrouper for bass notes
    const bassBeams = [...createBeamEights(processedBassNotes, bassNoteTupletGroups, indecesTuples), ...bassNoteTupletGroups].map(group => new VexFlow.Beam(group));


    const trebleVoice = new Voice({ num_beats: 4, beat_value: 4 });
    const bassVoice = new Voice({ num_beats: 4, beat_value: 4 });
    trebleVoice.setStrict(false); // Ermöglicht komplexere Rhythmen

    trebleVoice.addTickables(processedTrebleNotes);
    bassVoice.setStrict(false); // Ermöglicht komplexere Rhythmen

    bassVoice.addTickables(processedBassNotes);

    const formatter = new Formatter();
    formatter.joinVoices([trebleVoice]).joinVoices([bassVoice]);
    formatter.formatToStave([trebleVoice, bassVoice], trebleStave, { align_rests: false });

    // Draw the voices and beams
    trebleVoice.draw(context, trebleStave);
    bassVoice.draw(context, bassStave);
    trebleBeams.forEach(beam => beam.setContext(context).draw());
    bassBeams.forEach(beam => beam.setContext(context).draw());

    for (let i = 0; i < trebleNoteTupletGroups.length; i++) {
        const tuplet = new VF.Tuplet(trebleNoteTupletGroups[i], {
            num_notes: 3,   // Anzahl der Noten im Tuplet
            beats_occupied: 2 // Wie viele Schläge die Gruppe beansprucht
        });
        tuplet.setContext(context).draw()

    }
    for (let i = 0; i < bassNoteTupletGroups.length; i++) {
        const tuplet = new VF.Tuplet(bassNoteTupletGroups[i], {
            num_notes: 3,   // Anzahl der Noten im Tuplet
            beats_occupied: 2 // Wie viele Schläge die Gruppe beansprucht
        });
        tuplet.setContext(context).draw()
    }
    // Integration der klickbaren Bereiche für Akkordsymbole
    processedTrebleNotes.forEach((note, noteIndex) => {
        if (note.annotation && (isClicked == null || isClicked)) {
            const { text: chordText, position } = note.annotation;
            const chordPosition = [...position, lineIndex];

            // Finde das Text-Element der Annotation im SVG
            const textElements = svg.querySelectorAll('.vf-annotation text');
            let textElement;
            textElements.forEach((el) => {
                if (el.textContent === chordText && !el.associatedRect) {
                    textElement = el;
                    el.associatedRect = true; // Markiere das Element als verarbeitet
                }
            });

            if (textElement) {
                const bbox = textElement.getBBox();
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('x', (bbox.x - 5).toString());
                rect.setAttribute('y', (bbox.y - 5).toString());
                rect.setAttribute('width', (bbox.width + 10).toString());
                rect.setAttribute('height', (bbox.height + 10).toString());
                rect.setAttribute('fill', 'transparent');
                rect.setAttribute('stroke', 'blue');
                rect.setAttribute('stroke-width', '1');
                rect.setAttribute('pointer-events', 'auto');

                // Füge das Rechteck zum SVG hinzu
                svg.appendChild(rect);

                // Event-Listener für das Rechteck
                rect.addEventListener('click', () => {
                    console.log(`Akkord ${chordText} wurde geklickt! Position: ${chordPosition}`);
                    console.log(originalData)
                    const event = new CustomEvent('chordClick', {
                        detail: { chord: chordText, chordPosition, allData, originalData, keySignatureNumber},
                    });
                    svg.dispatchEvent(event);
                });

                // Touch-Unterstützung
                rect.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    console.log(`Akkord ${chordText} wurde getippt! Position: ${chordPosition}`);
                    const event = new CustomEvent('chordClick', {
                        detail: { chord: chordText, chordPosition, allData, originalData, keySignatureNumber},
                    });
                    svg.dispatchEvent(event);
                });
            }
        }
    });
}

// Angepasste renderThreeMeasure-Funktion
function renderThreeMeasure(musicElements, yOffset, lineIndex, chordNames, allData, originalData, keySign) {
    console.log(originalData)
    // Fülle leere Takte mit Viertelpausen
    for (let i = musicElements.length; i < 3; ++i) {
        musicElements.push([
            new StaveNote({ clef: "treble", keys: ["b/4"], duration: "qr" }),
            new StaveNote({ clef: "treble", keys: ["b/4"], duration: "qr" }),
            new StaveNote({ clef: "treble", keys: ["b/4"], duration: "qr" }),
            new StaveNote({ clef: "treble", keys: ["b/4"], duration: "qr" })
        ]);
        chordNames.push(["Unknown chord", "Unknown chord", "Unknown chord", "Unknown chord"]);
    }

    // Erstelle Bass-Noten (Pausen) für jeden Takt
    let musicElementsBase = [];
    for (let i = 0; i < musicElements.length; ++i) {
        musicElementsBase.push(
            musicElements[i].map(note => {
                const duration = note.getDuration();
                const finalDuration = duration.includes("r") ? duration : duration + "r";
                return new StaveNote({ clef: "bass", keys: ["d/3"], duration: finalDuration });
            })
        );
    }
    console.log("bas", musicElementsBase, lineIndex)

    if (allData.addedVoicingsIndeces) {
        let usedVoicings = [];
        musicElementsIndeces = [];
            
        for (let i = 0; i < allData.addedVoicingsIndeces.length; ++i) {
            for (let j = 0; j < musicElementsBase.length; ++j) { 
                
                for (let k = 0; k < musicElementsBase[j].length; ++k) {
                    const voicingsIndeces = allData.addedVoicingsIndeces[i];
                    if (allData.addedVoicingsIndeces[i][0] == lineIndex && allData.addedVoicingsIndeces[i][1] == j && allData.addedVoicingsIndeces[i][2] == k) {
                        if (allData.voicings[voicingsIndeces[0]][voicingsIndeces[1]][voicingsIndeces[2]][voicingsIndeces[3]][0].length > 0) {
                            usedVoicings.push(allData.voicings[voicingsIndeces[0]][voicingsIndeces[1]][voicingsIndeces[2]][voicingsIndeces[3]][0]);
                            musicElementsIndeces.push([j, k])
                        }
                        
                    }
                }
            }
        }
        
        
        for (let i = 0; i < usedVoicings.length; ++i) {
            const usedVoicing = usedVoicings[i];
            let newKeys = [];
            // Voicings hinzufügen (falls vorhanden)

            for (let m = 0; m < usedVoicing.length; ++m) {
                newKeys.push(convertToVexFlowKey(usedVoicing[m]));
            }

            // Dauer der Note anpassen (entferne "r" für Rest)
            const duration = musicElementsBase[musicElementsIndeces[i][0]][musicElementsIndeces[i][1]].getDuration().replace("r", "");

            // Erstelle eine neue StaveNote mit den neuen Keys und der Dauer
            console.log(newKeys, duration, musicElementsBase, musicElementsIndeces[i], usedVoicing)
            const newNote = new VexFlow.StaveNote({
                keys: newKeys,
                duration: duration,
                clef: "bass"
            });

            musicElementsBase[musicElementsIndeces[i][0]][musicElementsIndeces[i][1]] = newNote;
        }
            //e.detail.allData.addedVoicingsIndeces.push([groupIndex, measureInGroupIndex, noteIndex, 0]);
               
    }
    const leftOffset = 5;
    renderOneMeasure(musicElementsBase[0], musicElements[0], 0 + leftOffset, yOffset, true, keySign, chordNames[0], allData, 0, lineIndex, originalData);
    renderOneMeasure(musicElementsBase[1], musicElements[1], 350 + leftOffset, yOffset, false, keySign, chordNames[1], allData, 1, lineIndex, originalData);
    renderOneMeasure(musicElementsBase[2], musicElements[2], 700 + leftOffset, yOffset, false, keySign, chordNames[2], allData, 2, lineIndex, originalData);
}
