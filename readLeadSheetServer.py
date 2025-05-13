from music21 import *

import sys
import copy 
from random import randrange
import requests

from enum import Enum

class Eccidental(Enum):
    NONE = 0
    NATURAL = 1
    TRUE = 2
    REST = -1

def get_all_chromatic_notes():
    # Erstelle ein leeres Array für die Noten
    chromatic_notes = []
    
    # Die chromatischen Noten beginnen bei C4 (MIDI 60) und enden bei B4 (MIDI 71)
    for midi_number in range(60, 72):  # C4 (60) bis B4 (71)
        # Erstelle eine Pitch-Instanz aus der MIDI-Nummer
        current_pitch = pitch.Pitch(midi=midi_number)
        # Füge den Notennamen (z. B. 'C4', 'C#4', 'D4') zum Array hinzu
        chromatic_notes.append(current_pitch.nameWithOctave)
    
    return chromatic_notes

def create_notes_with_root_c_as_list():
    root_note_midi = 60  # MIDI-Nummer für C4
    chords_notes_list = []  # Liste zur Speicherung der Noten für jeden Akkordtyp
    
    # Durchlaufe alle Akkordtypen in possibleChords
    for chord_type, intervals in possibleChords.items():
        # Erstelle die MIDI-Nummern für den Akkord basierend auf den Intervallen
        chord_midi_notes = [root_note_midi + interval for interval in intervals]
        # Erstelle eine Liste von music21.note.Note-Objekten für den aktuellen Akkord
        note_objects = [note.Note(midi=midi) for midi in chord_midi_notes]
        # Füge die Liste der Noten zur Gesamtliste hinzu
        chords_notes_list.append(note_objects)
    
    return chords_notes_list

def getPossibleLeftHandVoicings(voicings, required_notes, top_note, keySign):
    def makeInversions(voicing):
        inversedVoicings = [voicing]

        for _ in range(len(voicing) - 1):
            newInversion = copy.deepcopy(inversedVoicings[-1])

            move_note = newInversion.pop(0)
            #append() method to add the elements
            newInversion.append(move_note)
            while note.Note(newInversion[-1]).octave < note.Note(newInversion[-2]).octave:
                newInversion[-1] = note.Note(newInversion[-1])
                newInversion[-1].octave += 1
                newInversion[-1] = newInversion[-1].nameWithOctave
            
            while note.Note(move_note).octave > note.Note(top_note).octave:
                for newInversionNote in newInversion:
                    newInversionNote = note.Note(newInversionNote)
                    newInversionNote.octave -= 1
                    newInversionNote = newInversionNote.nameWithOctave

            inversedVoicings.append(newInversion)

        return inversedVoicings
    
    def makeOctaves(inversedVoicings):
        voicingsWithAllOctaves = []
        for inversedVoicing in inversedVoicings:
            voicingsWithAllOctaves.append([])
            newOctave = copy.deepcopy(inversedVoicing)
            while note.Note(newOctave["leftHand"][-1]).octave < note.Note(newOctave["rightHand"][0]).octave:
                for index in range(len(newOctave["leftHand"])):
                    newOctave["leftHand"][index] = note.Note(newOctave["leftHand"][index])
                    newOctave["leftHand"][index].octave += 1
                    newOctave["leftHand"][index] = newOctave["leftHand"][index].nameWithOctave

            if note.Note(newOctave["leftHand"][-1]).octave > note.Note(newOctave["rightHand"][-0]).octave:
                for index in range(len(newOctave["leftHand"])):
                    newOctave["leftHand"][index] = note.Note(newOctave["leftHand"][index])
                    newOctave["leftHand"][index].octave -= 1
                    newOctave["leftHand"][index] = newOctave["leftHand"][index].nameWithOctave
            
            if note.Note(newOctave["leftHand"][-1]).octave < 4:
                voicingsWithAllOctaves[-1].append(copy.deepcopy(newOctave))
                
            while note.Note(newOctave["leftHand"][0]).octave > 1:
                for index in range(len(newOctave["leftHand"])):
                    newOctave["leftHand"][index] = note.Note(newOctave["leftHand"][index])
                    newOctave["leftHand"][index].octave -= 1
                    newOctave["leftHand"][index] = newOctave["leftHand"][index].nameWithOctave

                if note.Note(newOctave["leftHand"][0]).octave > 1 or note.Note(newOctave["leftHand"][-1]).octave < 4:
                    voicingsWithAllOctaves[-1].append(copy.deepcopy(newOctave))

        return voicingsWithAllOctaves
    
    possibleLeftHandChords = []

    for voicing in voicings:
        if voicing["rightHand"][0] == "ANY":
            newVoicing = copy.deepcopy(voicing)
            newVoicing["rightHand"] = [top_note]

            for intervalForTranspose in range(-7, 8):
                newVoicingTransposed =  transpose_voicing(newVoicing, intervalForTranspose, True)
                newVoicingTransposed[1] = [top_note]

                if check_voicing(newVoicingTransposed, top_note, required_notes):
                    inversions = [{"leftHand": inversion, "rightHand": newVoicingTransposed[1], "impliedNotes": newVoicingTransposed[2]} for inversion in makeInversions(newVoicingTransposed[0])]

                    octaves = makeOctaves(inversions)

                    relativeVoicings = []
                    for inversion in octaves:
                        relativeVoicings.append([])
                        for octave in inversion:
                            relativeVoicings[-1].append(relativeKeysOfVoicing(transpose_voicing(octave, 0, True), keySign, required_notes))

                    possibleLeftHandChords.append({"absolute": octaves, "relative": relativeVoicings})
                    
                    
    json_formatted_str = json.dumps(possibleLeftHandChords, indent=2)
    #print(json_formatted_str)

    return possibleLeftHandChords

def getAllVoicings():
    url = 'http://localhost:3000/voicings'

    try:
        response = requests.get(url)
        voicings = response.json()["voicings"]
        # Statuscode und Antwort ausgeben

        return voicings
    except requests.exceptions.RequestException as e:
        print(f"Ein Fehler ist aufgetreten: {e}")


def getRelativeNoteToKey(note, keySignNum):
    note = copy.deepcopy(note)
    keySign = key.KeySignature(keySignNum)
    scale_pitches = [p.midi % 12 for p in keySign.getScale().pitches]

    if note.pitch.midi % 12 in scale_pitches:
        note.pitch.accidental = None
        return (note, Eccidental.NONE)
    elif note.pitch.accidental is None:
        return (note, Eccidental.NATURAL)
    
    return (note, Eccidental.TRUE)

def analyze_lead_sheet(score, keySign):
    returnArray = []
    # Partitur laden

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
            
            relative_to_key = (getRelativeNoteToKey(elem, keySign)[0].nameWithOctave, getRelativeNoteToKey(elem, keySign)[1].value) if elem_name != "Rest" else ("Rest", -1)

            if matching_chord:
                chord_name = matching_chord.commonName
                chord_pitches = [p.nameWithOctave for p in matching_chord.pitches]
                chord_details = f"[{', '.join(chord_pitches)}]"


                returnArray[-1].append({"elem_name": elem_name, "chord_details": chord_pitches, "elem_length": elem_length, "relative_to_key":  relative_to_key})
            else:

                returnArray[-1].append({"elem_name": elem_name, "chord_details": [], "elem_length": elem_length, "relative_to_key": relative_to_key})

    return returnArray
import json
import re

possibleChords = {
    "X7":    [0, 4, 7, 10],
    "X-7":   [0, 3, 7, 10],
    "Xmaj7": [0, 4, 7, 11],
    "X-7b5": [0, 3, 6, 10]
}

availableTensions = {
    "X7":    [2, 1, 3, 6, 9, 8],
    "X-7":   [2, 5, 9],
    "Xmaj7": [2, 6, 9],
    "X-7b5": [2, 5, 8]
}

def transpose_voicing(voicing, intervalPar, withImpliedNotes = False):
    transposed_voicing = []
    transposed_voicing.append(chord.Chord(voicing["leftHand"]).transpose(intervalPar))
    transposed_voicing.append(chord.Chord(voicing["rightHand"]).transpose(intervalPar))
    if withImpliedNotes:
        transposed_voicing.append(chord.Chord(voicing["impliedNotes"]).transpose(intervalPar))
        return [[note.nameWithOctave for note in transposed_voicing[0]], [note.nameWithOctave for note in transposed_voicing[1]], [note.nameWithOctave for note in transposed_voicing[2]]]

    return [[note.nameWithOctave for note in transposed_voicing[0]], [note.nameWithOctave for note in transposed_voicing[1]]]


def checkIfAvailableTensions(required_notes, voicing_notes):
    intervals_required = []
    for n in required_notes:
        intervals_required.append((note.Note(n).pitch.midi - note.Note(required_notes[0]).pitch.midi))
        while intervals_required[-1] > 12:
            intervals_required[-1] -= 12

    intervals_voicing = []
    for n in voicing_notes:
        intervals_voicing.append((note.Note(n).pitch.midi - note.Note(required_notes[0]).pitch.midi))
        while intervals_voicing[-1] < 0:
            intervals_voicing[-1] += 12

        while intervals_voicing[-1] > 12:
            intervals_voicing[-1] -= 12

    intervals_voicing = set(intervals_voicing)
    intervals_required = set(intervals_required)

    for key, value in possibleChords.items():
        possibleChordsSet = set(value)

        if possibleChordsSet == intervals_required:

            # Erlaubte Tensionen hinzufügen
            tensions = set(availableTensions[key])
            allowed_pitches = possibleChordsSet.union(tensions)

            if set(intervals_voicing).issubset(allowed_pitches):
                return (True, key)
    return (False, "")

# Funktion zum Überprüfen, ob ein Voicing die Kriterien erfüllt
def check_voicing(voicing, top_note, required_notes):
    # Rechte Hand (zweite Liste) prüfen
    right_hand = voicing[1] if len(voicing) > 1 and voicing[1] else []
    if not right_hand:
        return False
    
    # TopNote ist die letzte Note der rechten Hand
    voicing_top_note = note.Note(right_hand[-1])
    
    # TopNote prüfen (nur Tonhöhe, Oktave ignorieren)
    top_note_pitch = note.Note(top_note).pitch.midi % 12
    if voicing_top_note.pitch.midi % 12 != top_note_pitch:
        return False
    
    # Alle Noten des Voicings (linke + rechte Hand)
    all_notes = []
    for hand in voicing:
        all_notes.extend(hand)

    # Akkordtöne prüfen
    voicing_pitches = set(note.Note(n).pitch.midi % 12 for n in all_notes)

    required_pitches = set(note.Note(n).pitch.midi % 12 for n in required_notes)

    availableTensions = checkIfAvailableTensions(required_notes, all_notes)
    if availableTensions[0] and availableTensions[1] != "X-7b5":
        required_notes_copy = copy.deepcopy(required_notes)
        del required_notes_copy[2]
        required_pitches = set(note.Note(n).pitch.midi % 12 for n in required_notes_copy)
        
    return availableTensions[0] and required_pitches.issubset(voicing_pitches)

import json
import sys

def is_sharp(note_list):
    if not(note_list):
        return None
    #note_list = chord.Chord(["B-4", "D5", "F5", "A5"])
    # Iteriere über alle möglichen KeySignatures
    countNoAccidentals = 0

    allSharpKey = []
    for sharps in range(1, 8):  # Von 7 ♭ bis 7 ♯
        newCount = 0
        tonality = key.KeySignature(sharps).asKey().getScale().pitches
        
        for p in tonality:
            for n in note_list:
                if p.midi % 12 == n.pitch.midi % 12:
                    newCount += 1

        if newCount >= len(note_list):
            allSharpKey.append(sharps)

    allFlatKey = []
    for flats in range(-7, -1):  # Von 7 ♭ bis 7 ♯
        newCount = 0
        tonality = key.KeySignature(flats).asKey().getScale().pitches
        
        for p in tonality:
            for n in note_list:
                if p.midi % 12 == n.pitch.midi % 12:
                    newCount += 1

        if newCount >= len(note_list):
            allFlatKey.append(flats)

    tonality = key.KeySignature(0).asKey().getScale().pitches
        
    newCount = 0
    for p in tonality:
        for n in note_list:
            if p.midi % 12 == n.pitch.midi % 12:
                newCount += 1

    if newCount >= len(note_list):
        countNoAccidentals += 1

    if len(allSharpKey) > len(allFlatKey) and len(allSharpKey) > countNoAccidentals:
        return True
    elif len(allFlatKey) > len(allSharpKey) and len(allFlatKey) > countNoAccidentals:
        return False
    else:
        return None

def adjust_chord_to_key(chord_obj, use_sharps=True):
    """
    Passt die Vorzeichen eines Akkords an die gewünschte Tonart (mit # oder b) an.
    """
    for n in chord_obj:
        if n.pitch.accidental == None:
            continue
        if use_sharps and n.pitch.accidental.name == "flat":            
            n.pitch = n.pitch.getEnharmonic()
        elif not(use_sharps) and n.pitch.accidental.name == "sharp":
            n.pitch = n.pitch.getEnharmonic()

    return chord_obj

def relativeKeysOfVoicing(voicing, keySign, definingNotes):
    reVoicing = [[], []]

    from music21 import note
    notes1 = [note.Note(n) for n in voicing[0]]
    notes2 = [note.Note(n) for n in voicing[1]]
    definingNotes = [note.Note(n) for n in definingNotes]

    reVoicing[0] = adjust_chord_to_key(notes1, is_sharp(definingNotes))
    reVoicing[1] = adjust_chord_to_key(notes2, is_sharp(definingNotes))
    
    for index, n in enumerate(reVoicing[0]):
        reVoicing[0][index] = (getRelativeNoteToKey(n, keySign)[0].nameWithOctave, getRelativeNoteToKey(n, keySign)[1].value)
    
    for index, n in enumerate(reVoicing[1]):
        reVoicing[1][index] = (getRelativeNoteToKey(n, keySign)[0].nameWithOctave, getRelativeNoteToKey(n, keySign)[1].value)

    return reVoicing
    

def rePossibleVoicings(result, keySign, voicings):
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
            matching_voicings_relative = []
            matching_voicings_implied = []

            for voicing in voicings:
                if voicing["rightHand"][0] == "ANY": continue

                # Top note als reference
                ref_note = note.Note(voicing["rightHand"][-1]) if voicing["rightHand"] else note.Note('C3')
                interval = note.Note(top_note).pitch.midi - ref_note.pitch.midi
                # Voicing transponieren
                transposed_voicing = transpose_voicing(voicing, interval, True)

                # Kriterien prüfen
                if check_voicing(transposed_voicing, top_note, required_notes):
                    matching_voicings.append(transposed_voicing)
                    matching_voicings_relative.append(relativeKeysOfVoicing(transposed_voicing, keySign, required_notes))

            result[index][index1]["voicings"] = matching_voicings
            result[index][index1]["relativeVoicings"] = matching_voicings_relative
            result[index][index1]["leftHandVoicings"] = getPossibleLeftHandVoicings(voicings, required_notes, top_note, keySign)

    return result


def main():
    if len(sys.argv) != 2:
        return

    file_path = sys.argv[1]
    score = converter.parse(file_path)
    keySign = 0
    for ks in score.flatten().getElementsByClass('KeySignature'):
        keySign = ks.sharps

    voicings = getAllVoicings()
    result = analyze_lead_sheet(score, keySign)
    result = rePossibleVoicings(result, keySign, voicings)

    print(json.dumps({"result": result, "keySign": keySign}))

if __name__ == "__main__":
    main()
