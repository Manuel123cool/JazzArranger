
const { Renderer, Stave, StaveNote, Voice, Formatter, StaveConnector, Accidental, Annotation, Beam, GhostNote } = VexFlow;

function isTuplet(obj) {
    return obj instanceof VF.Tuplet;
}

function isGhostNote(note) {
    // Durchsuche die Modifier der Note
    return note.attrs.type === "GhostNote";
}

function createBeamEights(notes, notesTriplets, indecesTubles) {
    const possibleBeams = [[-1, 2048, 2048, 2048], [2048, 2048, 2048, -1], [-1, 2048, 2048, -1],  [-1, -1, 2048, 2048], [2048, 2048, -1, -1], [2048, 2048, 2048, 2048]]
    
    let noLongerThanEights = [];
    let allNotesTicks = [];

    let  = false;
    for (let i = 0; i < notes.length; ++i) {
        if (isGhostNote(notes[i])) {
            continue;
        }
        let continueVar = false;
        for (let j = 0; j < indecesTubles.length; ++j) { 
            
            if (indecesTubles[j].length > 0 && indecesTubles[j][1] == i) {
                noLongerThanEights.push(-1);
                noLongerThanEights.push(-1);

                allNotesTicks.push(2048 * 2)
            
                i += 3;
                continueVar = true;
                continue;
            }
        }
        if (continueVar) {
            continueVar = false;
            continue
        }
        if (notes[i].isRest() ||  notes[i].getTicks().value() != 2048) {
            allNotesTicks.push(notes[i].getTicks().value())
            const addedEightRests = notes[i].getTicks().value() / 2048
            for (let j = 0; j < addedEightRests; ++j) {
                noLongerThanEights.push(-1);
            }
            
        } else {
            noLongerThanEights.push(notes[i].getTicks().value());
            allNotesTicks.push(notes[i].getTicks().value())
        }
    }
    let beamGroup1 = []
    let beamGroup2 = []

    function getSpliceValues(possibleBeam, start) {
        let notesTickValues = []
        let startIndex = null;
        let length = 0;
        let counter = 0;
        for (let i = start; i < allNotesTicks.length; ++i) {
            if (counter >= 4) {
                break
            }

            if (allNotesTicks[i] != 2048) {
                counter += allNotesTicks[i] / 2048;
                continue
            }
            if (possibleBeam[counter] != -1 && startIndex == null) {
                startIndex = i;
            } 
            if (possibleBeam[counter] != -1) length += 1;
            counter += 1

        }
        return [startIndex, length]
    }

    const compareArrays = (a, b) =>
        a.length === b.length &&
        a.every((element, index) => element === b[index]);
      
    for (let i = 0; i < possibleBeams.length; ++i) {
        if (noLongerThanEights.length >= 3) {
            // Erste Bedingung: Vergleiche die ersten 4 Elemente von noLongerThanEights, ohne Änderung
            if (compareArrays(noLongerThanEights.slice(0, 4), possibleBeams[i])) {
                // Extrahiere den Bereich aus notes ohne Änderung des Original-Arrays
                const spliceValues = getSpliceValues(possibleBeams[i], 0);
                beamGroup1 = notes.slice(spliceValues[0], spliceValues[1] + spliceValues[0]);
            }
            // Zweite Bedingung: Vergleiche die letzten 4 Elemente und prüfe beamGroup1.length
            if (compareArrays(noLongerThanEights.slice(-4), possibleBeams[i])) {
                // Extrahiere die letzten 4 Elemente aus notes ohne Änderung
                const spliceValues = getSpliceValues(possibleBeams[i], 4);
                beamGroup2 = notes.slice(spliceValues[0], spliceValues[0] + spliceValues[1]);
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

// Create an SVG renderer and attach it to the DIV element named "output".
const div = document.getElementById("output");
const renderer = new Renderer(div, Renderer.Backends.SVG);

// Configure the rendering context.
renderer.resize(1200, 5000);
const context = renderer.getContext();
context.scale(0.7,0.7)

// Finde das SVG-Element
const svg = document.querySelector('svg');

let isClicked = null;

async function changeVoicingIndex(measureId, voicingIndex, elemId) {
    const url = "/saveStatus/" + indexForRoute;
    try {
        const response = await fetch(url, {
            method: "POST",
            body: JSON.stringify({"measureId": measureId, "voicingIndex": voicingIndex, "elemId": elemId}),
            headers: { 
                "Content-Type": "application/json" // 🠐- Wichtig!
              },
        });
        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }

        const json = await response.json();
    } catch (error) {
        console.error(error.message);
    }
}

// Globale Event-Listener für benutzerdefinierte chordClick-Events
svg.addEventListener('chordClick', (e) => {
    context.clear()

    let index1 = null
    let index2 = null
    let index3 = null

    const groupIndex = e.detail.chordPosition[2]
    const measureInGroupIndex = e.detail.chordPosition[0]
    const noteIndex = e.detail.chordPosition[1]
    const measureIndex = groupIndex * measureCount + measureInGroupIndex;

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
            
             if (e.detail.originalData[measureIndex][noteIndex].voicingIndex == -1) {
                voicngIndex = 0;
             }

             for (let i = 0; i < e.detail.allData.addedVoicingsIndeces.length; ++i) {
                if (JSON.stringify(e.detail.allData.addedVoicingsIndeces[i].slice(0, 3)) === JSON.stringify([groupIndex, measureInGroupIndex, noteIndex])) {
                    lastAddedVoicingIndex = i;
                }
             }

             if (lastAddedVoicingIndex != null) {
                voicngIndex = e.detail.allData.addedVoicingsIndeces[lastAddedVoicingIndex][3];

                voicngIndex = nextIndex(e.detail.originalData[measureIndex][noteIndex].voicings, e.detail.originalData[measureIndex][noteIndex].leftHandVoicings, document.getElementById("mode-select1").value, voicngIndex)
            }

             // Voicings hinzufügen (falls vorhanden)
             if (e.detail.allData.voicings[groupIndex][measureInGroupIndex][noteIndex].length > 0) {
                for (let m = 0; m < e.detail.allData.voicings[groupIndex][measureInGroupIndex][noteIndex][voicngIndex][1].length; ++m) {
                    newKeys.push(convertToVexFlowKeyVoicing(e.detail.allData.voicings[groupIndex][measureInGroupIndex][noteIndex][voicngIndex][1][m]));
                }
                e.detail.allData.addedVoicingsIndeces.push([groupIndex, measureInGroupIndex, noteIndex, voicngIndex]);
                document.getElementById("impliedNotes").textContent = JSON.stringify(e.detail.allData.voicings[groupIndex][measureInGroupIndex][noteIndex][voicngIndex][2].map(note => note.note_key));
             }
             e.detail.originalData[measureIndex][noteIndex].voicingIndex = voicngIndex;

             changeVoicingIndex(measureIndex, voicngIndex, noteIndex);

             // Dauer der Note anpassen (entferne "r" für Rest)
             const duration = e.detail.allData.staveNotes[groupIndex][measureInGroupIndex][noteIndex].getDuration().replace("r", "");
 
             // Erstelle eine neue StaveNote mit den neuen Keys und der Dauer
             let newNote = new VexFlow.StaveNote({
                 keys: newKeys,
                 duration: duration,
                 
             });

             newNote.dots = e.detail.allData.staveNotes[groupIndex][measureInGroupIndex][noteIndex].dots
             if (newNote.dots == 1) {
                VF.Dot.buildAndAttach([newNote], {all: true})
            }
             e.detail.allData.staveNotes[groupIndex][measureInGroupIndex][noteIndex] = newNote;

        }   
    }
    isClicked = true;
    for (let i = 0; i < e.detail.allData.staveNotes.length ; ++i) {
        renderMeasures(e.detail.allData.staveNotes[i], 220 * i, i, e.detail.allData.chordNames[i], e.detail.allData, e.detail.originalData, e.detail.keySignatureNumber); 
    }
    isClicked = false;

    console.log(`Geklickter Akkord: ${e.detail.chord} (Index: ${e.detail.chordPosition})`);
});

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
                return `${baseNote.toUpperCase()}/${octave}`;
            }
            return key;
        });

        if (note.isRest()) {
            const duration = note.getDuration();
            const finalDuration = duration.includes("r") ? duration : duration + "r";
            let newNote = new VexFlow.StaveNote({
                clef: note.clef,
                keys: newKeys,
                duration: finalDuration,
            });
            newNote.dots = note.dots

            if (note.dots == 1) {
                 VF.Dot.buildAndAttach([newNote], {all: true})
            }
            return newNote
        }
        let newNote = new VexFlow.StaveNote({
            clef: note.clef,
            keys: newKeys,
            duration: note.getDuration(),
        });
        newNote.dots = note.dots

        if (newNote.dots == 1) {
             VF.Dot.buildAndAttach([newNote], {all: true})
        }
        return newNote

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

function addDotted(notes) {
    for (let i = 0; i < notes.length; ++i) {
        if (notes[i].duration.includes("d")) {
            notes[i].addDotToAll()
        }
    }
    
    return notes
}


function combineRests(notes, tupletsIndeces, measureIndex, measureLength) {

    const durations = {
        16384: "w",    // Ganze Note (4 Viertel)
        12288: "hd",   // Punktierte halbe Note (3 Viertel)
        8192: "h",     // Halbe Note (2 Viertel)
        6144: "qd",    // Punktierte Viertelnote (1.5 Viertel)
        4096: "q",     // Viertelnote (1 Viertel)
        3072: "8d",    // Punktierte Achtelnote (0.75 Viertel)
        2048: "8",     // Achtelnote (0.5 Viertel)
        1536: "16d",   // Punktierte Sechzehntelnote (0.375 Viertel)
        1024: "16",    // Sechzehntelnote (0.25 Viertel)
        768: "32d",    // Punktierte Zweiunddreißigstelnote (0.1875 Viertel)
        512: "32",     // Zweiunddreißigstelnote (0.125 Viertel)
    };

    function checkTupletIndex(index) {
        for (let i = 0; measureIndex < tupletsIndeces.length && i < tupletsIndeces[measureIndex].length; ++i) {
            if (tupletsIndeces[measureIndex][i][1] == index && tupletsIndeces[measureIndex][i][0] == measureIndex) {
                return tupletsIndeces[measureIndex][i];
            }
        }
        return false
    }

    function getNextSmallerDuration(currentKey) {
        const keys = Object.keys(durations).map(Number).sort((a, b) => b - a);
        const current = Number(currentKey);
        const index = keys.indexOf(current);
        
        if (index === -1 || index === keys.length - 1) {
            return null; // Schlüssel nicht gefunden oder kein kleinerer vorhanden
        }
        return keys[index + 1];
    }

    function ticksToDuration(ticks) {
        // Finde die nächstgelegene Dauer
        let closestDuration = "q";
        let minDiff = Infinity;
        let equalDuration = null;
        let closestDurationTicks = -1;

        for (const [tickValue, duration] of Object.entries(durations)) {
            if (ticks - tickValue < 0) {
                continue;
            }
            const diff = Math.abs(ticks - tickValue);
            if (diff <= minDiff) {
                minDiff = diff;
                closestDuration = duration;
                closestDurationTicks = tickValue
            }
            if (diff === 0) {
                equalDuration = duration;
            }
        }
        return {"closestDuration": closestDuration, "equalDuration": equalDuration, "closestDurationTicks": closestDurationTicks};
    }

    let restGroups = [];
    let isRestStart = false;
    
    // Gruppieren von Pausen und Noten
    let tubletGroups = []
    for (let i = 0; i < notes.length; ++i) {
        let startTupletCount = 0
        let oneNoteInTuplet = false;

        for (let j = i; j < 3 && i < notes.length; ++j) {
            if (checkTupletIndex(j)) {
                startTupletCount += 1;
                if (!notes[j].isRest()) {
                    oneNoteInTuplet = true;
                }
            }
        }

        if (startTupletCount === 3 && oneNoteInTuplet) {
            for (let j = i; j < 3 && i < notes.length; ++j) {
                restGroups.push([{ note: notes[j], index: j}]);
            }
            i += 2;
            continue;
        }

        if (notes[i].isRest()) {
            if (!isRestStart) {
                isRestStart = true;
                restGroups.push([]);
            }
            if (checkTupletIndex(i)) {
                stopRestGroupAtIndex = i + 3;
                for (let j = 0; j < 3; ++j) {
                    restGroups[restGroups.length - 1].push({ note: notes[i], index: i, tupletIndex: checkTupletIndex(i)[1]});
                }
                i += 2;
                continue;
            }

            restGroups[restGroups.length - 1].push({ note: notes[i], index: i});
        } else {
            isRestStart = false;
            restGroups.push([{ note: notes[i], index: i }]);
            stopRestGroupAtIndex = -1;
        }
    }

    let newNotes = [];
    let newTupletIndeces = JSON.parse(JSON.stringify(tupletsIndeces))

    for (let i = 0; i < restGroups.length; ++i) {
        let group = restGroups[i];

        if (group.length === 1) {
            // Einzelne Note oder Pause
            newNotes.push(group[0].note);
        } else {
            // Kombinieren von Pausen
            let combinedTicks = 0;
            let tickPositionsTuplet = [];
            for (let j = 0; j < group.length; ++j) {
                let item = group[j];
                
                let startTupletCount = 0

                for (let k = j; k < j + 3 && k < group.length; ++k) {
                    if (group[k].hasOwnProperty("tupletIndex")) {
                        startTupletCount += 1; 
                    } else {
                        break;
                    }
                            
                }

                if (startTupletCount === 3) {
                    combinedTicks += item.note.getTicks().value() * 2;
                    tickPositionsTuplet.push(combinedTicks);

                    if (item.hasOwnProperty("tupletIndex")) {
                        newTupletIndeces[measureIndex].splice(item.tupletIndex , 3);  
                        for (let k = j + 3; k < group.length; ++k) {
                            if (group[k].hasOwnProperty("tupletIndex"))
                                group[k].tupletIndex -= 3;
                        }  
                    }
                    
                    j += 2;
                    continue
                }
                combinedTicks += item.note.getTicks().value();
            }
            // Erstelle eine neue StaveNote mit der korrekten Dauer
            
            let durationObj = ticksToDuration(combinedTicks);
            let currentDurationObj = durationObj;
            let remainingTicks = combinedTicks;
            do  {
                const newRest = new VexFlow.StaveNote({
                    clef: group[0].note.clef,
                    keys: group[0].note.getKeys(),
                    duration: currentDurationObj.closestDuration + "r" // Sicherstellen, dass es eine Pause ist
                });
                if (currentDurationObj.closestDuration.includes("d")) {
                    VexFlow.Dot.buildAndAttach([newRest], { all: true });
                }
                newNotes.push(newRest);
                remainingTicks = remainingTicks - newRest.getTicks().value();

                if (remainingTicks !== 0) {
                    currentDurationObj = ticksToDuration(remainingTicks)
                    while (currentDurationObj.equalDuration === null) {
                        currentDurationObj = ticksToDuration(getNextSmallerDuration(currentDurationObj.closestDurationTicks))
                    }
                }
            } while (remainingTicks !== 0)
            
            let combinedTicksForGhost = 0;
            for (let j = 0; j < newNotes.length; ++j) {
                combinedTicksForGhost += newNotes[i].getTicks().value()
                if (tickPositionsTuplet.length > 0 && combinedTicksForGhost > tickPositionsTuplet[0]) {
                    tickPositionsTuplet.shift();

                    const ghost = new VF.GhostNote({
                        duration: "8" // quarter note
                    });
                    newNotes.splice(j + 1, 0, ghost);
                    j + 1;
                }
            }
            
        }
    }

    return {newNotes: newNotes, newTupletIndeces: newTupletIndeces};
}


function createTupletGroups(tupletsIndeces, measureIndex, notes) {
    let counter = 0;
    let tupletGroups = []

    let indecesTuples = []

    for (let i = 0; i < tupletsIndeces.length; ++i) {
        for (let j = 0; j < tupletsIndeces[i].length; ++j) {
            if (tupletsIndeces[i][j][0] != measureIndex) {
                continue
            }
            if (counter == 0 ) {
                tupletGroups.push([])
            }
            
            tupletGroups.at(-1).push(notes[tupletsIndeces[i][j][1]])
            indecesTuples.push(tupletsIndeces[i][j][1])

            counter += 1; 
            if (counter == 3 ) {
                counter = 0
            }
        }
    }
    return tupletGroups;
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

    let processedTrebleNotes = annotatedTrebleNotes.map((note, noteIndex) => {
        const measureIndexAbsolute = measureIndex + lineIndex * measureCount;
        let lastAddedVoicingIndex = -1;
        for (let i = 0; i < allData.addedVoicingsIndeces.length; ++i) {
            if (JSON.stringify(allData.addedVoicingsIndeces[i].slice(0, 3)) === JSON.stringify([lineIndex, measureIndex , noteIndex])) {
                lastAddedVoicingIndex = allData.addedVoicingsIndeces[i][3];
            }
        }

        if (!note.isRest()) {
            if (lastAddedVoicingIndex > originalData[measureIndexAbsolute][noteIndex].voicings.length - 1) {
                return addAccidental([originalData[measureIndexAbsolute][noteIndex].oneNote], note)
            }

            return addAccidental(lastAddedVoicingIndex != -1 ? originalData[measureIndexAbsolute][noteIndex].voicings[lastAddedVoicingIndex][1] : [originalData[measureIndexAbsolute][noteIndex].oneNote], note)
        }
        return note;
    });

    let processedBassNotes = bassStaveNotes.map((note, noteIndex) => {
        const measureIndexAbsolute = measureIndex + lineIndex * measureCount;

        let lastAddedVoicingIndex = -1;
        for (let i = 0; i < allData.addedVoicingsIndeces.length; ++i) {
            if (JSON.stringify(allData.addedVoicingsIndeces[i].slice(0, 3)) === JSON.stringify([lineIndex, measureIndex , noteIndex])) {
                lastAddedVoicingIndex = allData.addedVoicingsIndeces[i][3];
            }
        }

        if (!note.isRest()) {
            const voicingsLength = originalData[measureIndexAbsolute][noteIndex].voicings.length
            if (lastAddedVoicingIndex >  voicingsLength - 1 && lastAddedVoicingIndex != -1) {
                return addAccidental(originalData[measureIndexAbsolute][noteIndex].leftHandVoicings[lastAddedVoicingIndex - voicingsLength][0], note)
            }
            return addAccidental(lastAddedVoicingIndex != -1 ? originalData[measureIndexAbsolute][noteIndex].voicings[lastAddedVoicingIndex][0] : [originalData[measureIndex][noteIndex].oneNote], note)
        }
        return note;
    });

    let combineResult  = combineRests(processedBassNotes, allData.tupletsIndeces,  measureIndex + lineIndex * measureCount);
    const bassTupletIndeces = combineResult.newTupletIndeces;
    processedBassNotes =  combineResult.newNotes;

    processedTrebleNotes = addDotted(processedTrebleNotes)
    processedBassNotes = addDotted(processedBassNotes)

    // Integrate NoteGrouper for treble notes
    
    const trebleNoteTupletGroups = createTupletGroups(allData.tupletsIndeces, measureIndex + lineIndex * measureCount, processedTrebleNotes);
    const trebleBeams = [...createBeamEights(processedTrebleNotes, trebleNoteTupletGroups, allData.tupletsIndeces[measureIndex + lineIndex * measureCount]), ...trebleNoteTupletGroups].map(group => new VexFlow.Beam(group));


    // Integrate NoteGrouper for bass notes
    const bassNoteTupletGroups = createTupletGroups(bassTupletIndeces, measureIndex + lineIndex * measureCount, processedBassNotes)
    const bassBeams = [...createBeamEights(processedBassNotes, bassNoteTupletGroups, bassTupletIndeces), ...bassNoteTupletGroups].map(group => new VexFlow.Beam(group));


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
function renderMeasures(musicElements, yOffset, lineIndex, chordNames, allData, originalData, keySign) {
    // Fülle leere Takte mit Viertelpausen
    for (let i = musicElements.length; i < measureCount; ++i) {
        musicElements.push([
            new StaveNote({ clef: "treble", keys: ["b/4"], duration: "wr" })
        ]);
        chordNames.push(["Unknown chord"]);
    }

    // Erstelle Bass-Noten (Pausen) für jeden Takt
    let musicElementsBase = [];
    for (let i = 0; i < musicElements.length; ++i) {
        musicElementsBase.push(
            musicElements[i].map(note => {
                const duration = note.getDuration();
                const finalDuration = duration.includes("r") ? duration : duration + "r";
                let newNote = new StaveNote({ clef: "bass", keys: ["d/3"], duration: finalDuration });

                newNote.dots = note.dots
                if (newNote.dots == 1) {
                    VF.Dot.buildAndAttach([newNote], {all: true});
                }
                return newNote
            })
        );
    }

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
                newKeys.push(convertToVexFlowKeyVoicing(usedVoicing[m]));
            }

            // Dauer der Note anpassen (entferne "r" für Rest)
            const duration = musicElementsBase[musicElementsIndeces[i][0]][musicElementsIndeces[i][1]].getDuration().replace("r", "");

            // Erstelle eine neue StaveNote mit den neuen Keys und der Dauer
            let newNote = new VexFlow.StaveNote({
                keys: newKeys,
                duration: duration,
                clef: "bass",
            });

            newNote.dots = musicElementsBase[musicElementsIndeces[i][0]][musicElementsIndeces[i][1]].dots

            if (newNote.dots == 1) {
                VF.Dot.buildAndAttach([newNote], {all: true});
            }
            musicElementsBase[musicElementsIndeces[i][0]][musicElementsIndeces[i][1]] = newNote;
        }               
    }
    const leftOffset = 5;

    for (let i = 0; i < measureCount; ++i) {
        renderOneMeasure(musicElementsBase[i], musicElements[i], 350 * i + leftOffset, yOffset, i == 0, keySign, chordNames[i], allData, i, lineIndex, originalData);
    }
}
