function midiToNoteObj(midiVal) {
    const octave = Math.floor(midiVal / 12);
    const pitchClass = midiVal % 12;
    
    // Umkehrung von _BASE_NOTE_TO_PC
    const PC_TO_NOTE = {
        0: 'C', 1: 'C#', 2: 'D', 3: 'D#', 
        4: 'E', 5: 'F', 6: 'F#', 7: 'G', 
        8: 'G#', 9: 'A', 10: 'A#', 11: 'B'
    };
    
    return {
        note_key: PC_TO_NOTE[pitchClass],
        octave: octave
    };
}

function getRandomInt(min, max) {
    const minCeiled = Math.ceil(min);
    const maxFloored = Math.floor(max);
    return Math.floor(Math.random() * (maxFloored - minCeiled) + minCeiled); // The maximum is exclusive and the minimum is inclusive
}

function generateRandomNoteFromChord(chordNotes) {
    console.log(chordNotes)
    // Bestimme den Akkordtyp
    const chordSymbol = getChordSymbol(chordNotes.map(note => note.note_key));
    
    // Wähle die entsprechende Degree Map
    let degreeMap = DOMINANT_DEGREES_MAP;
    
    if (chordSymbol.includes("sus4")) {
        degreeMap = SUS4_DEGREES_MAP;
    } else if (chordSymbol.includes("-maj7")) {
        degreeMap = MINOR_MAJOR_DEGREES_MAP;
    } else if (chordSymbol.includes("-6")) {
        degreeMap = MINOR_SIXTH_DEGREES_MAP;
    } else if (chordSymbol.includes("6")) {
        degreeMap = MAJOR_SIXTH_DEGREES_MAP;
    } else if (chordSymbol.includes("b5")) {
        degreeMap = HALF_DIMINISHED_DEGREES_MAP;
    } else if (chordSymbol.includes("-")) {
        degreeMap = MINOR_DEGREES_MAP;
    } else if (chordSymbol.includes("maj")) {
        degreeMap = MAJOR_DEGREES_MAP;
    }
    
    // Extrahiere die verfügbaren Intervalle
    const availableIntervals = Object.keys(degreeMap).map(key => parseInt(key));
    
    // Wähle ein zufälliges Intervall
    const randomInterval = availableIntervals[Math.floor(Math.random() * availableIntervals.length)];
    
    // Bestimme die Grundnote (Root) des Akkords
    const rootNote = chordNotes[0];
    const rootMidi = noteToMidiVal(rootNote);
    
    // Berechne die neue MIDI-Note
    let newMidi = rootMidi + randomInterval;
    
    // Wähle eine zufällige Oktave (optional: anpassen nach Bedarf)
    const octaveOffset = Math.floor(Math.random() * 3) - 1; // -1, 0, oder 1
    newMidi += octaveOffset * 12;
    
    // Konvertiere MIDI zurück zu Note
    const noteObj = midiToNoteObj(newMidi);
    

    // Erstelle VexFlow-kompatibles Objekt
    return {
        note_key: noteObj.note_key,
        octave: getRandomInt(4, 6),
        degree: degreeMap[randomInterval]
    };
}

function calculateNoteDistances(quarterNoteCount, measureNotes) {
    const ticksPerQuarter = 4096; // Standard-Tick-Auflösung in VexFlow (1 Viertelnote = 256 Ticks)

    // Berechnung der Startzeitpunkte jeder Note im Takt (in Ticks)
    let noteStartTicks = [];
    let currentTick = 0;
    
    for (let i = 0; i < measureNotes.length; i++) {
        noteStartTicks.push(currentTick);
        // Berechnung der Notendauer in Ticks
        const durationValue = measureNotes[i].getTicks().value();
        const noteTicks = durationValue;
        currentTick += noteTicks;
    }

    // Erstellung des 2D-Arrays mit Distanzen (quarterNoteCount x Anzahl Noten)
    let distanceArray = [];
    
    for (let q = 0; q < quarterNoteCount; q++) {
        const quarterPosition = q * ticksPerQuarter;
        let distances = [];
        
        for (let i = 0; i < noteStartTicks.length; i++) {
            const distance = Math.abs(noteStartTicks[i] - quarterPosition);
            distances.push(distance);
        }
        
        distanceArray.push(distances);
    }

    return distanceArray;
}


function moveNotesForDegreeImpro(quarterNoteCount, measureNotes, chordNames, measureIndex) {
    console.log(chordNames)
    const ticksPerQuarter = 4096;

    const noteDistances = calculateNoteDistances(quarterNoteCount, measureNotes);

    let reNotes = []
    let reChordNames = []

    for (let i = 0; i < quarterNoteCount; ++i) {
        reNotes.push(
            new StaveNote({ clef: "treble", keys: ["b/4"], duration: "qr" })
        );
        reChordNames.push("Unknown chord")
    }

    let strongBeats = [0,2]
    if (quarterNoteCount == 3) {
        strongBeats = [0]
    }

    let usedNotesIndeces = [];
    let quarterPosition = [];

    for (let i = 0; i < strongBeats.length; ++i) {
        for (let j = 0; j < noteDistances[strongBeats[i]].length; ++j) {
            if (noteDistances[strongBeats[i]][j] < ticksPerQuarter && !usedNotesIndeces.includes(j) && !measureNotes[j].isRest()) {
                usedNotesIndeces.push(j)
                quarterPosition.push(strongBeats[i])
            }
        }
    }

    for (let i = 0; i < quarterNoteCount; ++i) {
        for (let j = 0; j < noteDistances[i].length; ++j) {
            if (noteDistances[i][j] < ticksPerQuarter && !usedNotesIndeces.includes(j) && !measureNotes[j].isRest()) {
                usedNotesIndeces.push(j)
                quarterPosition.push(i)
            }
        }
    }

    for (let i = 0; i < usedNotesIndeces.length; ++i) {
        const note = measureNotes[usedNotesIndeces[i]]
        
        let newNote = new VexFlow.StaveNote({
            keys: note.keys,
            duration: "q",
            clef: "treble",
        });

        const annotation = new Annotation(chordNames[usedNotesIndeces[i]])
            .setFont("Times", 12, "normal")
            .setVerticalJustification(Annotation.VerticalJustify.TOP);
        newNote.addModifier(annotation, 0);
        newNote.annotation = { text: chordNames[usedNotesIndeces[i]], position: [measureIndex, i] };

        reNotes[quarterPosition[i]] = newNote;
        reChordNames[quarterPosition[i]] = chordNames[usedNotesIndeces[i]]
    }

    return {reNotes, reChordNames};
}
