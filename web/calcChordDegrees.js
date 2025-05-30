/**
 * Basis-Tonhöhenklassen (Pitch Classes) für die MIDI-Umwandlung.
 * C = 0, C# = 1, ..., B = 11
 */
const _BASE_NOTE_TO_PC = {
    'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11
};

function getIntervals(voicing, chordDetails) {
    let intervalsChordDetails = [];
    for (let n of chordDetails) {
        intervalsChordDetails.push(n - chordDetails[0]);
        while (intervalsChordDetails[intervalsChordDetails.length - 1] > 12) {
            intervalsChordDetails[intervalsChordDetails.length - 1] -= 12;
        }
    }

    let refNote = null;
    for (let voicingNote of voicing) {
        if (voicingNote % 12 === chordDetails[0] % 12) {
            refNote = voicingNote;
        }
    }

    if (refNote === null) {
        return "";
    }

    let intervalsVoicing = [];
    for (let n of voicing) {
        intervalsVoicing.push(n - refNote);
        while (intervalsVoicing[intervalsVoicing.length - 1] < 0) {
            intervalsVoicing[intervalsVoicing.length - 1] += 12;
        }

        while (intervalsVoicing[intervalsVoicing.length - 1] > 12) {
            intervalsVoicing[intervalsVoicing.length - 1] -= 12;
        }
    }
    return [intervalsChordDetails, intervalsVoicing]
}


function noteToMidiVal(noteObj) {
    
    const noteKey = noteObj.note_key;
    const octave = noteObj.octave;

    const baseChar = noteKey.charAt(0).toUpperCase();
    let pc = _BASE_NOTE_TO_PC[baseChar];

    if (typeof pc === 'undefined') {
        throw new Error(`Invalid base note_key character: ${baseChar} in ${noteKey}`);
    }

    if (noteKey.length > 1) {
        if (noteKey.charAt(1) === '#') {
            pc += 1;
        } else if (noteKey.charAt(1) === 'b' || noteKey.charAt(1) === '-') {
            pc -= 1;
        }
    }

    pc = (pc + 12) % 12; // Normalize pitch class (z.B. B# -> C, Cb -> B)

    return pc + octave * 12;
}

const MINOR_DEGREES_MAP = {
    0: "1",
    3: "3",   // Kleine Terz
    7: "5",   // Reine Quinte
    10: "7",  // Kleine Septime
    2: "9",   // Große None
    5: "11",  // Reine Undezime
    9: "13"   // Große Tredezime
};

const DOMINANT_DEGREES_MAP = {
    0: "1",
    4: "3",   // Große Terz
    7: "5",   // Reine Quinte
    10: "7",  // Kleine Septime
    1: "b9",  // Kleine None
    2: "9",   // Große None
    3: "#9",  // Übermäßige None
    6: "#11", // Übermäßige Undezime
    8: "b13", // Kleine Tredezime
    9: "13"   // Große Tredezime
};

const MAJOR_DEGREES_MAP = {
    0: "1",
    4: "3",   // Große Terz
    7: "5",   // Reine Quinte
    11: "7",  // Große Septime
    2: "9",   // Große None
    6: "#11", // Übermäßige Undezime
    9: "13"   // Große Tredezime
};

const HALF_DIMINISHED_DEGREES_MAP = {
    0: "1",
    3: "3",   // Kleine Terz
    6: "b5",  // Verminderte Quinte
    10: "7",  // Kleine Septime
    2: "9",   // Große None
    5: "11",  // Reine Undezime
    8: "b13"  // Kleine Tredezime
};

const MINOR_MAJOR_DEGREES_MAP = {
    0: "1",
    3: "3",   // Kleine Terz
    7: "5",   // Reine Quinte
    11: "7",  // Große Septime
    2: "9",   // Große None
    5: "11",  // Reine Undezime
    9: "13"   // Große Tredezime
};

const MAJOR_SIXTH_DEGREES_MAP = {
    0: "1",
    4: "3",   // Große Terz
    7: "5",   // Reine Quinte
    9: "6",   // Große Sexte
    2: "9",   // Große None
    5: "11",  // Reine Undezime
    11: "7"   // Große Septime
};

const MINOR_SIXTH_DEGREES_MAP = {
    0: "1",
    3: "3",   // Kleine Terz
    7: "5",   // Reine Quinte
    9: "6",   // Große Sexte
    2: "9",   // Große None
    5: "11"   // Reine Undezime
};

const SUS4_DEGREES_MAP = {
    0: "1",
    5: "4",   // Reine Quarte
    7: "5",   // Reine Quinte
    10: "7",  // Kleine Septime
    1: "b9",  // Kleine None
    2: "9",   // Große None
    3: "#9",  // Übermäßige None
    4: "3",   // Große Terz (auflösende Tension)
    8: "b13", // Kleine Tredezime
    9: "13"   // Große Tredezime
};

function calcChordDegrees(voicing, chordDetails) {
    voicingCombined = [...voicing[0], ...voicing[1], ...voicing[2]]
    const intervals = getIntervals(voicingCombined.map(note => noteToMidiVal(note)), chordDetails.map(note => noteToMidiVal(note)))[1]

    let degreeMap = DOMINANT_DEGREES_MAP
    const chordSymbol = getChordSymbol(chordDetails.map(note => note.note_key))
    
    if (chordSymbol.includes("sus4")) {
        degreeMap = SUS4_DEGREES_MAP
    } else if (chordSymbol.includes("-maj7")) {
        degreeMap = MINOR_MAJOR_DEGREES_MAP
    } else if (chordSymbol.includes("-6")) {
        degreeMap = MINOR_SIXTH_DEGREES_MAP
    } else if (chordSymbol.includes("6")) {
        degreeMap = MAJOR_SIXTH_DEGREES_MAP
    } else if (chordSymbol.includes("b5")) {
        degreeMap = HALF_DIMINISHED_DEGREES_MAP
    } else if (chordSymbol.includes("-")) {
        degreeMap = MINOR_DEGREES_MAP
    } else if (chordSymbol.includes("maj")) {
        degreeMap = MAJOR_DEGREES_MAP
    }

    return (JSON.stringify(intervals.slice(0, voicing[0].length).map(midiNote => degreeMap[midiNote])) + " | " + 
    JSON.stringify(intervals.slice(voicing[0].length, voicing[0].length + voicing[1].length).map(midiNote => degreeMap[midiNote])) + " | "+ 
    JSON.stringify(intervals.slice(voicing[0].length + voicing[1].length, voicing[0].length + voicing[1].length + voicing[2].length).map(midiNote => degreeMap[midiNote]))).replaceAll('"', "")
}