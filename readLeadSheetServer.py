from music21 import *

import sys
import copy 
from random import randrange
import requests
import timeit

from enum import Enum

class Eccidental(Enum):
    NONE = 0
    NATURAL = 1
    TRUE = 2
    REST = -1

def note_to_midi(note_name):
    
    n = note.Note(note_name)
    return n.pitch.midi

def create_note_to_midi_map(start_octave=0, end_octave=8):
    
    note_to_midi_dict = {}
    notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    for octave in range(start_octave, end_octave + 1):
        for note_name in notes:
            full_note = f"{note_name}{octave}"
            midi = note_to_midi(full_note)
            # Füge die ursprüngliche Note hinzu
            note_to_midi_dict[full_note] = midi
            # Füge die enharmonische Entsprechung hinzu
            n = pitch.Pitch(full_note)
            enharmonic_note = n.getEnharmonic().nameWithOctave
            note_to_midi_dict[enharmonic_note] = midi
    return note_to_midi_dict

midi_map = create_note_to_midi_map()

def check_voicing_midi(voicing, top_note, required_notes, exceptRightHand = False):
    # Rechte Hand (zweite Liste) prüfen
    right_hand = voicing[1] if len(voicing) > 1 and voicing[1] else []
    if not right_hand:
        return False
    
    # TopNote ist die letzte Note der rechten Hand
    voicing_top_note = right_hand[-1]
    
    # TopNote prüfen (nur Tonhöhe, Oktave ignorieren)
    top_note_pitch = top_note % 12
    if voicing_top_note % 12 != top_note_pitch:
        return False
    
    # Alle Noten des Voicings (linke + rechte Hand)
    all_notes = []
    for index, hand in enumerate(voicing):
        if exceptRightHand and index == True:
            continue
        all_notes.extend(hand)

    # Akkordtöne prüfen
    voicing_pitches = set(n % 12 for n in all_notes)

    required_pitches = set(n % 12 for n in required_notes)

    availableTensions = checkIfAvailableTensionsMidi(required_notes, all_notes)
    if availableTensions[0] and availableTensions[1] != "X-7b5":
        required_notes_copy = copy.deepcopy(required_notes)
        del required_notes_copy[2]
        required_pitches = set(n% 12 for n in required_notes_copy)
        
    return availableTensions[0] and required_pitches.issubset(voicing_pitches)

def checkIfAvailableTensionsMidi(required_notes, voicing_notes):
    intervals_required = []
    for n in required_notes:
        intervals_required.append((n - required_notes[0]))
        while intervals_required[-1] > 12:
            intervals_required[-1] -= 12

    ref_note = None
    for voicing_note in voicing_notes:
        if voicing_note % 12 == required_notes[0] % 12:
            ref_note =  voicing_note

    if ref_note == None:
        return (False, "")
    
    intervals_voicing = []
    for n in voicing_notes:
        intervals_voicing.append((n - ref_note))
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

def transpose_voicing_midi(voicing, intervalPar, withImpliedNotes = False):
    transposed_voicing = []
    transposed_voicing.append([noteMidi + intervalPar for noteMidi in voicing["leftHand"]])
    transposed_voicing.append([noteMidi + intervalPar for noteMidi in voicing["rightHand"]])

    if withImpliedNotes:
        transposed_voicing.append([noteMidi + intervalPar for noteMidi in voicing["impliedNotes"]])

    return transposed_voicing

def octave(midiNote):
    return int((midiNote - 12) / 12)

_MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11]
_SHARP_KEY_TONICS_PC = [7, 2, 9, 4, 11, 6, 1]
_FLAT_KEY_TONICS_PC = [5, 10, 3, 8, 1, 6, 11]
_NEUTRAL_KEY_TONIC_PC = 0

def _get_scale_pitch_classes(tonic_pc):
    """
    Erzeugt eine Menge von Pitch-Klassen für eine Dur-Tonleiter
    basierend auf dem gegebenen Grundton (tonic_pc).
    """
    return {(tonic_pc + interval) % 12 for interval in _MAJOR_SCALE_INTERVALS}

# Vorkalkulierte Mengen von Pitch-Klassen für alle relevanten Skalen
_C_MAJOR_SCALE_PCS = _get_scale_pitch_classes(_NEUTRAL_KEY_TONIC_PC)
_SHARP_SCALES_PCS = [_get_scale_pitch_classes(tonic) for tonic in _SHARP_KEY_TONICS_PC]
_FLAT_SCALES_PCS = [_get_scale_pitch_classes(tonic) for tonic in _FLAT_KEY_TONICS_PC]

def is_sharp_midi_optimized(midi_note_list):
    """
    Bestimmt, ob eine Liste von MIDI-Notenwerten eher zu Kreuz-Tonarten,
    B-Tonarten oder keiner von beiden (neutral oder mehrdeutig) passt.

    Args:
        midi_note_list (list): Eine Liste von MIDI-Notenwerten (Integer, z.B. [60, 64, 67]).

    Returns:
        bool or None:
            True, wenn die Noten in signifikant mehr Kreuz-Tonarten passen.
            False, wenn die Noten in signifikant mehr B-Tonarten passen.
            None, wenn es mehrdeutig ist, zu C-Dur/A-Moll passt oder in keine Kategorie überwiegt.
    """
    if not midi_note_list:
        return None

    # Erzeuge eine Menge von einzigartigen Pitch-Klassen aus der Eingabeliste
    # Modulo 12, um Oktaven zu ignorieren (z.B. 60, 72, 84 werden alle zu 0)
    input_pitch_classes = {note % 12 for note in midi_note_list}

    # Wenn die Eingabeliste nach der Umwandlung in Pitch-Klassen leer ist
    # (sollte bei nicht-leerer midi_note_list nie passieren, außer alle Noten wären ungültig)
    # Dieser Check ist eher redundant, da input_pitch_classes immer mind. 1 Element hat,
    # wenn midi_note_list nicht leer ist.
    if not input_pitch_classes:
        return None 

    count_fits_sharp_keys = 0
    for scale_pcs in _SHARP_SCALES_PCS:
        # Prüft, ob alle Pitch-Klassen der Eingabe in der aktuellen Kreuz-Tonleiter-Skala enthalten sind
        if input_pitch_classes.issubset(scale_pcs):
            count_fits_sharp_keys += 1

    count_fits_flat_keys = 0
    for scale_pcs in _FLAT_SCALES_PCS:
        # Prüft, ob alle Pitch-Klassen der Eingabe in der aktuellen B-Tonleiter-Skala enthalten sind
        if input_pitch_classes.issubset(scale_pcs):
            count_fits_flat_keys += 1

    count_fits_neutral_key = 0
    # Prüft, ob alle Pitch-Klassen der Eingabe in der C-Dur-Skala enthalten sind
    if input_pitch_classes.issubset(_C_MAJOR_SCALE_PCS):
        count_fits_neutral_key = 1

    # Vergleichslogik, analog zur Originalfunktion
    if count_fits_sharp_keys > count_fits_flat_keys and \
       count_fits_sharp_keys > count_fits_neutral_key:
        return True
    elif count_fits_flat_keys > count_fits_sharp_keys and \
         count_fits_flat_keys > count_fits_neutral_key:
        return False
    else:
        # Dies deckt Fälle ab, in denen:
        # - Es einen Gleichstand gibt (z.B. gleich viele Kreuz- wie B-Tonarten passen)
        # - Die neutrale Tonart am besten oder gleich gut wie andere passt
        # - Keine der Tonarten passt (alle Zähler sind 0)
        return None
    
_PITCH_CLASS_SCALES_CACHE = {} # Cache für bereits berechnete Skalen-Pitch-Klassen

def _get_scale_pitch_classes_for_key_sig(key_signature_num):
    """
    Gibt eine Menge von Pitch-Klassen (0-11) für die Dur-Tonleiter
    zurück, die durch key_signature_num definiert wird.
    key_signature_num: 0 für C, positive Zahlen für Kreuze, negative für Bs.
    """
    if key_signature_num in _PITCH_CLASS_SCALES_CACHE:
        return _PITCH_CLASS_SCALES_CACHE[key_signature_num]

    tonic_pc = -1
    if key_signature_num == 0:
        tonic_pc = _NEUTRAL_KEY_TONIC_PC
    elif key_signature_num > 0:
        if 1 <= key_signature_num <= len(_SHARP_KEY_TONICS_PC):
            tonic_pc = _SHARP_KEY_TONICS_PC[key_signature_num - 1]
        else:
            raise ValueError(f"Ungültige Anzahl von Kreuzen: {key_signature_num}")
    else: # key_signature_num < 0
        if -len(_FLAT_KEY_TONICS_PC) <= key_signature_num <= -1:
            tonic_pc = _FLAT_KEY_TONICS_PC[-key_signature_num - 1]
        else:
            raise ValueError(f"Ungültige Anzahl von Bs: {key_signature_num}")

    scale_pcs = {(tonic_pc + interval) % 12 for interval in _MAJOR_SCALE_INTERVALS}
    _PITCH_CLASS_SCALES_CACHE[key_signature_num] = scale_pcs
    return scale_pcs
from enum import Enum, auto
# --- Definition für den Rückgabestatus ---
class MidiAccidentalStatus(Enum):
    """
    Status eines MIDI-Tons relativ zu einer Tonart.
    """
    DIATONIC_IN_KEY = auto()        # Ton ist diatonisch zur Tonart (benötigt kein explizites Vorzeichen)
    CHROMATIC_OUT_OF_KEY = auto()   # Ton ist chromatisch zur Tonart (benötigt ein explizites Vorzeichen)
    # Die Unterscheidungen 'NATURAL' vs 'TRUE' aus dem Original sind mit reinen MIDI-Werten
    # nicht direkt abbildbar, da ein MIDI-Wert keinen "ursprünglichen Vorzeichenstatus" hat.
    # 'NONE' im Original (impliziert durch Tonart) entspricht hier DIATONIC_IN_KEY.

class Eccidental(Enum):
    NONE = 0
    NATURAL = 1
    TRUE = 2
    REST = -1

def get_note_status_in_key_midi(midi_note_value, key_signature_num):
    """
    Bestimmt den Status eines MIDI-Tons relativ zu einer gegebenen Tonart.

    Args:
        midi_note_value (int): Der MIDI-Wert des Tons (z.B. 60 für C4).
        key_signature_num (int): Die Anzahl der Kreuze (positiv) oder Bs (negativ).
                                 0 für C-Dur/A-Moll.

    Returns:
        tuple: (int, MidiAccidentalStatus)
            - Der ursprüngliche midi_note_value.
            - Der MidiAccidentalStatus, der angibt, ob der Ton diatonisch oder
              chromatisch zur Tonart ist.
    """
    if not isinstance(midi_note_value, int) or not (0 <= midi_note_value <= 127):
        raise ValueError("midi_note_value muss ein Integer zwischen 0 und 127 sein.")

    scale_pitch_classes = _get_scale_pitch_classes_for_key_sig(key_signature_num)
    note_pitch_class = midi_note_value % 12

    if note_pitch_class in scale_pitch_classes:
        # Der Ton ist Teil der Skala, also diatonisch.
        # Im music21-Original würde hier note.pitch.accidental = None gesetzt.
        return (midi_note_value, MidiAccidentalStatus.DIATONIC_IN_KEY)
    else:
        # Der Ton ist nicht Teil der Skala, also chromatisch.
        # Ob er ursprünglich "natural" war oder ein explizites Vorzeichen hatte,
        # können wir aus dem MIDI-Wert allein nicht schließen.
        return (midi_note_value, MidiAccidentalStatus.CHROMATIC_OUT_OF_KEY)


def relativeKeysOfVoicingMidi(voicing, keySign, definingNotes):
    reVoicing = [[*voicing[0]], [*voicing[1]]]

    from music21 import note

    notes1 = voicing[0]
    notes2 = voicing[1]

    import time
    
    isSharp = is_sharp_midi_optimized(definingNotes)

    #print(f" Real time: {t2[0] - t1[0]:.2f} seconds")
    
    for index, n in enumerate(reVoicing[0]):
        noteKey = getNoteFromMidiNumber(n, isSharp)
        hasAccidental = "-" in noteKey or "#" in noteKey

        reVoicing[0][index] = (noteKey, Eccidental.NATURAL.value if (get_note_status_in_key_midi(n, keySign)[1] == MidiAccidentalStatus.CHROMATIC_OUT_OF_KEY and not(hasAccidental)) else Eccidental.NONE.value) 
    
    for index, n in enumerate(reVoicing[1]):
        noteKey = getNoteFromMidiNumber(n, isSharp)
        hasAccidental = "-" in noteKey or "#" in noteKey
        
        reVoicing[1][index] = (noteKey, Eccidental.NATURAL.value if (get_note_status_in_key_midi(n, keySign)[1] == MidiAccidentalStatus.CHROMATIC_OUT_OF_KEY and not(hasAccidental)) else Eccidental.NONE.value) 

    
    return reVoicing

SHARP_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLAT_NOTE_NAMES  = ["C", "D-", "D", "E-", "E", "F", "G-", "G", "A-", "A", "B-", "B"]

def get_octave(midiNote):
    """
    Berechnet die Oktave für eine gegebene MIDI-Notennummer.
    MIDI-Note 60 (C4) ist in Oktave 4.
    MIDI-Note 0 (C-1) ist in Oktave -1.
    """
    return (midiNote // 12) - 1

def getNoteFromMidiNumber(midiNote, prefer_sharps=True):
    """
    Wandelt eine MIDI-Notennummer in einen Notennamen mit Oktave um.
    Ermöglicht die Wahl zwischen Sharp (#) und enharmonisch Flat (b) Notation.

    Args:
        midiNote (int): Die MIDI-Notennummer (z.B. 60 für mittleres C).
        prefer_sharps (bool, optional): 
            True (Standard): Verwendet Sharp (#) für Vorzeichen (z.B. C#).
            False: Verwendet Flat (b) für Vorzeichen (z.B. Db).

    Returns:
        str: Der Notenname mit Oktave (z.B. "C#4" oder "Db4").
        
    Raises:
        ValueError: Wenn midiNote außerhalb des typischen Bereichs (0-127) liegt.
    """

    note_index = midiNote % 12
    octave_number = get_octave(midiNote)

    if prefer_sharps:
        note_base_name = SHARP_NOTE_NAMES[note_index]
    else:
        note_base_name = FLAT_NOTE_NAMES[note_index]
        
    return note_base_name + str(octave_number)

def absoluteKeysOfVoicingMidi(voicing):
    reVoicing = {}
    reVoicing["rightHand"] = [getNoteFromMidiNumber(midiNote) for midiNote in voicing["rightHand"]]
    reVoicing["leftHand"] = [getNoteFromMidiNumber(midiNote) for midiNote in voicing["leftHand"]]
    reVoicing["impliedNotes"] = [getNoteFromMidiNumber(midiNote) for midiNote in voicing["impliedNotes"]]

    return reVoicing

def getPossibleLeftHandVoicings(voicings, required_notes, top_note, keySign):
    def makeInversions(voicing):
        inversedVoicings = [voicing]

        for _ in range(len(voicing) - 1):
            newInversion = copy.deepcopy(inversedVoicings[-1])

            move_note = newInversion.pop(0)
            #append() method to add the elements
            newInversion.append(move_note)
            while newInversion[-1]< newInversion[-2]:
                newInversion[-1] += 12
            
            while move_note >top_note:
                for newInversionNote in newInversion:
                    newInversionNote -= 12

            inversedVoicings.append(newInversion)

        return inversedVoicings
    
    def makeOctaves(inversedVoicings):
        voicingsWithAllOctaves = []
        for inversedVoicing in inversedVoicings:
            voicingsWithAllOctaves.append([])
            newOctave = copy.deepcopy(inversedVoicing)
            while octave(newOctave["leftHand"][-1]) < octave(newOctave["rightHand"][0]):
                for index in range(len(newOctave["leftHand"])):
                    newOctave["leftHand"][index] += 12
        
            if octave(newOctave["leftHand"][-1]) > octave(newOctave["rightHand"][-0]):
                for index in range(len(newOctave["leftHand"])):
                    newOctave["leftHand"][index] -= 12
            
            if octave(newOctave["leftHand"][-1]) < 4:
                voicingsWithAllOctaves[-1].append(copy.deepcopy(newOctave))

            while octave(newOctave["leftHand"][0]) > 1:
                for index in range(len(newOctave["leftHand"])):
                    newOctave["leftHand"][index] -= 12

                if octave(newOctave["leftHand"][0]) > 1 or octave(newOctave["leftHand"][-1]) < 4:
                    voicingsWithAllOctaves[-1].append(copy.deepcopy(newOctave))

        return voicingsWithAllOctaves
    
    possibleLeftHandChords = []

    for voicing in voicings:
        if voicing["rightHand"][0] == "ANY":
            #print("rightHand")
            newVoicing = copy.deepcopy(voicing)
            newVoicing["rightHand"] = [top_note]

            for intervalForTranspose in range(-7, 8):
                newVoicingTransposed =  transpose_voicing_midi(newVoicing, intervalForTranspose, True)
                newVoicingTransposed[1] = [top_note]

                if check_voicing_midi(newVoicingTransposed, top_note, required_notes, True):
                    inversions = [{"leftHand": inversion, "rightHand": newVoicingTransposed[1], "impliedNotes": newVoicingTransposed[2]} for inversion in makeInversions(newVoicingTransposed[0])]

                    octaves = makeOctaves(inversions)

                    relativeVoicings = []
                    for inversion in octaves:
                        relativeVoicings.append([])
                        for octaveV in inversion:
                            relativeVoicings[-1].append(relativeKeysOfVoicingMidi(transpose_voicing_midi(octaveV, 0, True), keySign, required_notes))

                    for indexInversion in range(len(octaves)):
                        relativeVoicings.append([])
                        for indexOctave in range(len(octaves[indexInversion])):
                            octaves[indexInversion][indexOctave] = absoluteKeysOfVoicingMidi(octaves[indexInversion][indexOctave])

                    possibleLeftHandChords.append({"absolute": octaves, "relative": relativeVoicings})
                    break
                    
                    
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


            relative_to_key = None
            if not(elem.isRest):
                noteKey = getNoteFromMidiNumber(elem.pitch.midi, "#" in elem.name)
                hasAccidental = "-" in noteKey or "#" in noteKey

                relative_to_key = (noteKey, Eccidental.NATURAL.value) if (get_note_status_in_key_midi(elem.pitch.midi, keySign)[1] == MidiAccidentalStatus.CHROMATIC_OUT_OF_KEY and not(hasAccidental)) else (noteKey, Eccidental.NONE.value)
            else:
                relative_to_key = ("Rest", -1)

            
            if matching_chord:
                chord_pitches = [p.nameWithOctave for p in matching_chord.pitches]


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

import json
import sys

def rePossibleVoicings(result, keySign, voicings):
    # Voicings für jeden Akkord finden
    for index, oneMeasure in enumerate(result):
        for index1, oneNoteInfo in enumerate(oneMeasure):
            chord_notes = [midi_map[note_detail.replace("b", "-")] for note_detail in oneNoteInfo['chord_details']]
            
            if len(chord_notes) == 0:
                continue

            top_note = midi_map[oneNoteInfo['elem_name']]

            # Akkordnoten und Wurzelnote berechnen
            required_notes = chord_notes
            root_note = chord_notes[0]
            
            # Passende Voicings finden
            matching_voicings = []
            matching_voicings_relative = []
            matching_voicings_implied = []

            for v_index, voicing in enumerate(voicings):
                if voicing["rightHand"][0] == "ANY": continue
                
                # Top note als reference
                ref_note = voicing["rightHand"][-1]
                interval = top_note - ref_note
                # Voicing transponieren
                transposed_voicing = transpose_voicing_midi(voicing, interval, True)

                # Kriterien prüfen
                if check_voicing_midi(transposed_voicing, top_note, required_notes):
                    input_voicing = {"leftHand": transposed_voicing[0], "rightHand": transposed_voicing[1], "impliedNotes": transposed_voicing[2]}
                    matching_voicings.append(absoluteKeysOfVoicingMidi(input_voicing))
                    matching_voicings_relative.append(relativeKeysOfVoicingMidi(transpose_voicing_midi(input_voicing, 0, True), keySign, required_notes))


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

    
    timeSign = {"numerator": score.getTimeSignatures()[0].numerator, "denominator": score.getTimeSignatures()[0].denominator}

    voicings = getAllVoicings()
    for voicing in voicings:
        voicing["leftHand"] = [midi_map[note_v.replace("b", "-")] for note_v in voicing["leftHand"]]
        voicing["impliedNotes"] = [midi_map[note_v.replace("b", "-")] for note_v in voicing["impliedNotes"]]
        if voicing["rightHand"][0] == "ANY":
            continue
        voicing["rightHand"] = [midi_map[note_v.replace("b", "-")] for note_v in voicing["rightHand"]]
        

    result = analyze_lead_sheet(score, keySign)
    result = rePossibleVoicings(result, keySign, voicings)

    print(json.dumps({"result": result, "keySign": keySign, "timeSign": timeSign}))

if __name__ == "__main__":
    main()