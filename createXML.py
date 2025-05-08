import json
from music21 import *
import sys
from fractions import Fraction
import requests

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
    intervalArray = []
    rootNote = notes[0]
    for note in notes:
        intervalArray.append(interval.Interval(pitchStart=rootNote, pitchEnd=note).semitones)
    for index, (chord_name, intervals) in enumerate(possible_chords.items()):
        if intervals == intervalArray:
            return harmony.ChordSymbol(root=rootNote.name, kind=possibleChordsKind[index])
    return None

def getNoteKey(oneNote):
    if "oneNote" in oneNote.keys():
        oneNote = oneNote["oneNote"]

    if oneNote["relative_to_key"] != None and ("-" in oneNote["relative_to_key"] or "#" in oneNote["relative_to_key"]):
        return oneNote["relative_to_key"] + str(oneNote["octave"])
    
    return oneNote["note_key"] + str(oneNote["octave"])

def consolidate_rests_in_measure(measure, measure_idx):
    """
    Fasst aufeinanderfolgende Pausen in einem Takt zu einer Pause zusammen.
    
    Args:
        measure: Ein music21.stream.Measure Objekt
        
    Returns:
        Modifizierter Takt mit zusammengefassten Pausen
    """
    new_elements = []
    elements = list(measure.notesAndRests)
    i = 0
    
    while i < len(elements):
        if isinstance(elements[i], note.Rest):
            total_duration = elements[i].quarterLength
            j = i + 1
            while j < len(elements) and isinstance(elements[j], note.Rest):
                total_duration += elements[j].quarterLength
                j += 1
            new_elements.append(note.Rest(quarterLength=total_duration))
            i = j
        else:
            new_elements.append(elements[i])
            i += 1
    
    new_measure = stream.Measure(number=measure_idx)
    for elem in new_elements:
        new_measure.append(elem)
    return new_measure

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
            # Erstellt das ChordSymbol basierend auf chord_details
            if elem.get("chord_details"):
                notes_for_chord = [
                    pitch.Pitch(getNoteKey(note_detail))
                    for note_detail in elem["chord_details"]
                ]
                chordSymbol = get_chord_symbol(notes_for_chord)
                if chordSymbol:
                    chordSymbol.offset = noteIndex * elem["oneNote"]["duration"]
                    treble_measure.append(chordSymbol)

            duration = elem["oneNote"]["duration"]
            isRest = elem["oneNote"]["is_rest"]

            # Verarbeitet Pausen
            if isRest:
                rest = note.Rest(quarterLength=duration)
                treble_measure.append(rest)

                rest = note.Rest(quarterLength=duration)
                bass_measure.append(rest)
                continue

            # Verarbeitet Noten oder Akkorde
            if elem.get('voicings') and 'voicingIndex' in elem and elem["voicingIndex"] >= 0:
                # Trennt die Noten in Bass- und Violinstimme
                voicing_index = elem['voicingIndex']
                chosen_voicing = elem['voicings'][voicing_index]
                bass_notes = [
                    pitch.Pitch(getNoteKey(n))
                    for n in chosen_voicing[0]
                ]
                treble_notes = [
                    pitch.Pitch(getNoteKey(n))
                    for n in chosen_voicing[1]
                ] if len(chosen_voicing) > 1 else []

                # Fügt Bassnoten hinzu
                if bass_notes:
                    bass_chord = chord.Chord(bass_notes)
                    bass_chord.duration.quarterLength = duration
                    bass_measure.append(bass_chord)
                else:
                    rest = note.Rest(quarterLength=duration)
                    bass_measure.append(rest)

                # Fügt Violinnoten hinzu
                if treble_notes:
                    treble_chord = chord.Chord(treble_notes)
                    treble_chord.duration.quarterLength = duration
                    treble_measure.append(treble_chord)
                else:
                    rest = note.Rest(quarterLength=duration)
                    treble_measure.append(rest)
            else:
                # Einzelnote in der Violinstimme
                insert_note = note.Note(getNoteKey(elem))
                insert_note.duration.quarterLength = duration
                treble_measure.append(insert_note)

                rest = note.Rest(quarterLength=duration)
                bass_measure.append(rest)

        treble_measure.insert(0, keySign)

        bass_measure = consolidate_rests_in_measure(bass_measure, measure_idx + 1)
        bass_measure.insert(0, keySign)

        treble_part.append(treble_measure)

        bass_part.append(bass_measure)


    # Speichert die Partitur als MusicXML
    score.write('musicxml', fp=output_file)

# Beispielhafte Verwendung der Funktion
if __name__ == "__main__":
    # Hier die JSON-Daten einfügen
    url = 'http://localhost:3000/data/' + sys.argv[1]

    try:
        response = requests.get(url)
        
        # Statuscode und Antwort ausgeben
        print(f"Statuscode: {response.status_code}")
        print(f"Antwort vom Server: {response.json()}")

        create_musicxml(response.json()["noteInfo"], 'output.xml', response.json()["keySign"])

    except requests.exceptions.RequestException as e:
        print(f"Ein Fehler ist aufgetreten: {e}")
