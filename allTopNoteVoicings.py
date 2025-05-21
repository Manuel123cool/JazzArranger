from readLeadSheetServer import *

def allPossibleTopNotes(chord_notes):
    intervals_chord_notes = []
    for n in chord_notes:
        intervals_chord_notes.append((n - chord_notes[0]))
        while intervals_chord_notes[-1] > 12:
            intervals_chord_notes[-1] -= 12
    
    intervals_chord_notes = set(intervals_chord_notes)

    for key, value in possibleChords.items():
        possibleChordsSet = set(value)

        if possibleChordsSet == intervals_chord_notes:

            # Erlaubte Tensionen hinzufügen
            tensions = availableTensions[key]
            base_note = chord_notes[0]
            tension_midi_values = [base_note + tension for tension in tensions]
            return tension_midi_values + chord_notes
        
    return None

def reVoicings(result, keySign, voicings):
    chord_notes = [midi_map[note_detail.replace("b", "-")] for note_detail in oneNoteInfo['chord_details']]
    
    if len(chord_notes) == 0:
        continue

    # Akkordnoten und Wurzelnote berechnen
    required_notes = chord_notes
    root_note = chord_notes[0]
    
    # Passende Voicings finden
    matching_voicings = []
    matching_voicings_relative = []
    matching_voicings_implied = []

    for top_note in allPossibleTopNotes(required_notes):
        for v_index, voicing in enumerate(voicings):
            if voicing["rightHand"][0] == "ANY": continue
                                
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

def updateVoicingLookUpTable():
    