const possibleChords = {
    "X7":    [0, 4, 7, 10],
    "X-7":   [0, 3, 7, 10],
    "Xmaj7": [0, 4, 7, 11],
    "X-7b5": [0, 3, 6, 10]
};

const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const flatNoteNames = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function getChordSymbol(notes) {
    // Parse notes to MIDI numbers
    const midiNotes = notes.map(note => {
        const [, pitch, accidental, octave] = note.match(/^([A-G])(--|-|#)?(\d)$/);
        let noteIndex;
        
        if (accidental === '#') {
            noteIndex = noteNames.indexOf(pitch + '#');
        } else if (accidental === '-') {
            noteIndex = flatNoteNames.indexOf(pitch + 'b');
        } else if (accidental === '--') {
            // Double flat: shift two semitones down
            noteIndex = (noteNames.indexOf(pitch) - 2 + 12) % 12;
        } else {
            noteIndex = noteNames.indexOf(pitch);
        }
        
        return noteIndex;
    });

    // Normalize to pitch classes (0-11)
    const pitchClasses = midiNotes.map(note => note % 12).sort((a, b) => a - b);
    
    // Try each possible root
    for (let root = 0; root < 12; root++) {
        // Shift pitch classes to test this root
        const shifted = pitchClasses.map(pc => (pc - root + 12) % 12).sort((a, b) => a - b);
        
        // Check against each chord type
        for (let chordType in possibleChords) {
            const chordIntervals = possibleChords[chordType].sort((a, b) => a - b);
            if (arraysEqual(shifted, chordIntervals)) {
                return flatNoteNames[root] + chordType.replace('X', '');
            }
        }
    }
    
    return "Unknown chord";
}

function arraysEqual(arr1, arr2) {
    if (arr1.length !== arr2.length) return false;
    return arr1.every((val, index) => val === arr2[index]);
}

// Example usage:
// console.log(getChordSymbol(['C', 'E', 'G', 'B'])); // Output: Cmaj7
// console.log(getChordSymbol(['D', 'F', 'A', 'C'])); // Output: D-7
// console.log(getChordSymbol(['Bb', 'D', 'F', 'A'])); // Output: Bb-7
// console.log(getChordSymbol(['D#', 'G', 'A#', 'C'])); // Output: Eb-7
// console.log(getChordSymbol(['A--', 'D', 'F', 'A'])); // Output: Gb-7
