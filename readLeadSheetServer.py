from music21 import *
import sys

def analyze_lead_sheet(file_path):
    returnArray = []
    # Partitur laden
    try:
        score = converter.parse(file_path)
    except Exception as e:
        print(f"Fehler beim Laden der Datei: {e}")
        return

    # Melodie und Akkorde extrahieren
    melody = None
    chords = None
    
    for part in score.parts:
        if any(isinstance(el, (note.Note, note.Rest)) for el in part.recurse()):
            melody = part
        if any(isinstance(el, harmony.ChordSymbol) for el in part.recurse()):
            chords = part

    if not melody:
        return
    if not chords:
        return

    # Melodie und Akkorde nach Takten organisieren
    melody_measures = melody.getElementsByClass('Measure')
    chord_measures = chords.getElementsByClass('Measure')

    # Analyse der Übereinstimmungen pro Takt
    
    for measure_num, (melody_measure, chord_measure) in enumerate(zip(melody_measures, chord_measures), 1):
        returnArray.append([])

        # Noten und Pausen im aktuellen Takt sammeln
        elements = [el for el in melody_measure.recurse() if isinstance(el, (note.Note, note.Rest))]
        chord_symbols = [el for el in chord_measure.recurse() if isinstance(el, harmony.ChordSymbol)]

        # Noten und Pausen durchlaufen und Akkorde mit exaktem Offset abgleichen
        for elem in elements:
            elem_offset = elem.offset
            elem_name = "Rest" if isinstance(elem, note.Rest) else elem.pitch.nameWithOctave
            elem_length = elem.duration.quarterLength

            # Suche nach einem Akkord mit exakt demselben Offset
            matching_chord = None
            for chord_symbol in chord_symbols:
                chord_offset = chord_symbol.offset
                if abs(chord_offset - elem_offset) < 0.0001:  # Toleranz für Gleitkommavergleich
                    matching_chord = chord_symbol
                    break

            from fractions import Fraction
            if isinstance(elem_length, Fraction):
                elem_length = {"numerator": elem_length.numerator, "denominator": elem_length.denominator}
                
            if matching_chord:
                chord_name = matching_chord.commonName
                chord_pitches = [p.nameWithOctave for p in matching_chord.pitches]
                chord_details = f"[{', '.join(chord_pitches)}]"
                returnArray[-1].append({"elem_name": elem_name, "chord_details": chord_pitches, "elem_length": elem_length})
            else:
                returnArray[-1].append({"elem_name": elem_name, "chord_details": [], "elem_length": elem_length})

    return returnArray
import json
import re

possibleChords = {
    "X7":    [0, 4, 7, 10],
    "X-7":   [0, 3, 7, 10],
    "Xmaj7": [0, 4, 7, 11],
    "X-7b5": [0, 3, 6, 10]
}

def transpose_voicing(voicing, intervalPar):
    transposed_voicing = []
    transposed_voicing.append(chord.Chord(voicing[0]).transpose(intervalPar))
    transposed_voicing.append(chord.Chord(voicing[1]).transpose(intervalPar))
    return [[note.nameWithOctave for note in transposed_voicing[0]], [note.nameWithOctave for note in transposed_voicing[1]]]

# Funktion zum Überprüfen, ob ein Voicing die Kriterien erfüllt
def check_voicing(voicing, top_note, required_notes, chord_notes):
    # Rechte Hand (zweite Liste) prüfen
    right_hand = voicing[1] if len(voicing) > 1 and voicing[1] else []
    if not right_hand:
        return False
    
    # TopNote ist die letzte Note der rechten Hand
    voicing_top_note = note.Note(right_hand[-1])
    
    # TopNote prüfen (nur Tonhöhe, Oktave ignorieren)
    top_note_pitch = note.Note(top_note).pitch.name
    if voicing_top_note.pitch.name != top_note_pitch:
        return False
    
    # Alle Noten des Voicings (linke + rechte Hand)
    all_notes = []
    for hand in voicing:
        all_notes.extend(hand)
    
    # Akkordtöne prüfen
    voicing_pitches = set(note.Note(n).pitch.name for n in all_notes)
    required_pitches = set(note.Note(n).pitch.name for n in required_notes)
    
    return required_pitches.issubset(voicing_pitches)

import json
import sys
from voicings import voicings

def rePossibleVoicings(result):
    # Voicings für jeden Akkord finden
    for index, oneMeasure in enumerate(result):
        for index1, oneNoteInfo in enumerate(oneMeasure):
            top_note = oneNoteInfo['elem_name']
            chord_notes = oneNoteInfo['chord_details']
            
            if len(chord_notes) == 0:
                continue
            # Akkordnoten und Wurzelnote berechnen
            required_notes = chord_notes
            root_note = chord_notes[0]
            
            # Passende Voicings finden
            matching_voicings = []
            for voicing in voicings:
                # Top note als reference
                ref_note = note.Note(voicing[1][-1]) if voicing[1] else note.Note('C3')
                interval = note.Note(top_note).pitch.midi - ref_note.pitch.midi
                # Voicing transponieren
                transposed_voicing = transpose_voicing(voicing, interval)

                # Kriterien prüfen
                if check_voicing(transposed_voicing, top_note, required_notes, chord_notes):
                    matching_voicings.append(transposed_voicing)
            
            result[index][index1]["voicings"] = matching_voicings
    return result
def main():
    if len(sys.argv) != 2:
        return
    
    file_path = sys.argv[1]
    result = analyze_lead_sheet(file_path)
    result = rePossibleVoicings(result)
    print(json.dumps(result))

if __name__ == "__main__":
    main()
