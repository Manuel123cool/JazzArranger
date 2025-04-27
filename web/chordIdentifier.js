const possibleChords = {
    "X7":    [0, 4, 7, 10],
    "X-7":   [0, 3, 7, 10],
    "Xmaj7": [0, 4, 7, 11],
    "X-7b5": [0, 3, 6, 10]
};

const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const moreCharps = ['B#', null, null, null, null, "E#", null, null, null, null, null, null];
const flatNoteNames = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const moreflatNoteNames = [null, null, null, null, "Fb", null, null, null, null, null, null, "Cb"];

function getChordSymbol(notes) {
    
    if (notes.length == 0) {
        return "Unknown chord";
    }
    notes = notes.map(note => {
        const [, pitch, accidental, octave] = note.match(/^([A-G])(--|-|#)?(\d)$/);
        return pitch + (accidental != undefined ? accidental : "");
    });
    console.log(notes)
    if (notes[0] == "C") {


    }
    let root = notes[0].replace("-", "b")

    let indeces = []
    for (let i = 0; i < notes.length; ++i) {
        if (noteNames.indexOf(notes[i]) != -1) {
            indeces.push(noteNames.indexOf(notes[i]))
        } else if (flatNoteNames.indexOf(notes[i].replace("-", "b")) != -1) {
            indeces.push(flatNoteNames.indexOf(notes[i].replace("-", "b")))
            if (notes[i].split('-').length - 1 == 2) {
                indeces.at(-1) -= 1;
            }
        } else if (moreCharps.indexOf(notes[i]) != -1) {
            indeces.push(moreCharps.indexOf(notes[i]))
        } else if (moreflatNoteNames.indexOf(notes[i].replace("-", "b")) != -1) {
            indeces.push(moreflatNoteNames.indexOf(notes[i].replace("-", "b")))
            if (notes[i].split('-').length - 1 == 2) {
                indeces.at(-1) -= 1;
            }
        } 
    }

    let prevIndex = indeces[0]
    for (let i = 1; i < indeces.length; ++i) {
        if (prevIndex > indeces[i]) {
            indeces[i] += 12;
        }
        prevIndex = indeces[i]
    }
    const minus = indeces[0]
    for (let i = 0; i < indeces.length; ++i) {
        indeces[i] -= minus
    }

    for (let chordType in possibleChords) {
        if (arraysEqual(possibleChords[chordType], indeces)) {
            return root + chordType.replace('X', '');
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
