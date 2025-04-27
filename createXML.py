import json
from music21 import *
import sys
from fractions import Fraction

import re

possible_chords = {
    "X7":    [0, 4, 7, 10],
    "X-7":   [0, 3, 7, 10],
    "Xmaj7": [0, 4, 7, 11],
    "X-7b5": [0, 3, 6, 10]
}

possibleChordsKind = [
    "dominant-seventh",
    'minor-seventh',
    'major-seventh',
    'half-diminished-seventh'
]
def get_chord_symbol(notes):
    if len(notes) == 0:
        return None
    print(notes)
    intervalArray = []
    rootNote = notes[0]
    for note in notes:
        intervalArray.append(interval.Interval(pitchStart=rootNote, pitchEnd=note).semitones)
    print(intervalArray)
    for index, (chord_name, intervals) in enumerate(possible_chords.items()):
        if intervals == intervalArray:
            return harmony.ChordSymbol(root=rootNote.name, kind=possibleChordsKind[index])
    return None

def create_musicxml(json_data, output_file, keySign):
    # Erstellt eine neue Partitur
    score = stream.Score()

    # Erstellt die Stimmen für Violin- und Bassschlüssel
    treble_part = stream.Part()
    treble_part.insert(0, clef.TrebleClef())

    bass_part = stream.Part()
    bass_part.insert(0, clef.BassClef())

    keySign = key.KeySignature(keySign)

    score.append([treble_part, bass_part])

    # Verarbeitet jede Stimme in den JSON-Daten
    for measure_idx, measure_data in enumerate(json_data):
        treble_measure = stream.Measure(number=measure_idx + 1)
        bass_measure = stream.Measure(number=measure_idx + 1)

        if (measure_idx + 1) % 4 == 0:
            treble_measure.append(layout.SystemLayout(isNew=True))
            bass_measure.append(layout.SystemLayout(isNew=True))

        for noteIndex, elem in enumerate(measure_data):
            chordSymbol = get_chord_symbol([note.Note(noteDetails) for noteDetails in elem["chord_details"]])
            if chordSymbol:
                print(noteIndex, chordSymbol)
                chordSymbol.offset = noteIndex
                treble_measure.append(chordSymbol)

            duration = elem['elem_length']
            isRest = elem['elem_name'] == 'Rest'

            if isinstance(duration, dict) and "numerator" in duration:
                duration = Fraction(duration["numerator"], duration["denominator"])

            # Verarbeitet Pausen
            if isRest:
                rest = note.Rest(quarterLength=duration)
                treble_measure.append(rest)

                rest = note.Rest(quarterLength=duration)
                bass_measure.append(rest)
                continue

            # Verarbeitet Noten oder Akkorde
            if elem.get('voicings') and 'voicingIndex' in elem:
                # Trennt die Noten in Bass- und Violinstimme
                voicing_index = elem['voicingIndex']
                choosen_voicing = elem['voicings'][voicing_index]
                bass_noten = choosen_voicing[0]
                treble_noten = choosen_voicing[1] if len(choosen_voicing) > 1 else []

                # Fügt Bassnoten hinzu
                if bass_noten:
                    bass_chord = chord.Chord([pitch.Pitch(n) for n in bass_noten])
                    bass_chord.duration.quarterLength = duration
                    bass_measure.append(bass_chord)
                else:
                    rest = note.Rest(quarterLength=duration)
                    bass_measure.append(rest)

                # Fügt Violinnoten hinzu
                if treble_noten:
                    treble_chord = chord.Chord([pitch.Pitch(n) for n in treble_noten])
                    treble_chord.duration.quarterLength = duration
                    treble_measure.append(treble_chord)
            else:
                # Einzelnote in der Violinstimme
                insert_note = note.Note(elem['elem_name'])
                insert_note.duration.quarterLength = duration
                treble_measure.append(insert_note)

                rest = note.Rest(quarterLength=duration)
                bass_measure.append(rest)

        treble_measure.insert(0, keySign)
        bass_measure.insert(0, keySign)

        treble_part.append(treble_measure)
        bass_part.append(bass_measure)
    # Speichert die Partitur als MusicXML
    score.write('musicxml', fp=output_file)

# Beispielhafte Verwendung der Funktion
if __name__ == "__main__":
    # Hier die JSON-Daten einfügen
    with open("leadSheetData.json", 'r') as file:
        data = json.load(file)
    
    print(data)
    create_musicxml(data[int(sys.argv[1])]["noteInfo"], 'output.xml', data[int(sys.argv[1])]["keySign"])
