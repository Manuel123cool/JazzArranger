// Stelle sicher, dass VexFlow korrekt geladen ist
if (typeof VexFlow === "undefined") {
    console.error("VexFlow is not loaded. Please include vexflow-min.js.");
    throw new Error("VexFlow not loaded");
  }
  
  const VF = VexFlow;
function convertToVexFlowKeyVoicing(oneNote) {  
  return convertToVexFlowKey(oneNote.relative_to_key, oneNote.note_key, oneNote.octave, oneNote.is_rest)
}

  function convertToVexFlowKey(relative_to_key, note_key, octave, isRest) {
    console.log(relative_to_key, note_key, octave, isRest)
    const key = relative_to_key ? relative_to_key : note_key
    
    if (isRest) {
      return "b/4"
    }

    return `${key.replace("-", "b")}/${octave}`;
  }
  
  function music21ToVexflowDuration(music21Duration) {
    /**
     * Wandelt music21 Duration in VexFlow Notenwert um.
     * @param {number} music21Duration - music21 Duration (z.B. 1.0 für Viertelnote, 0.5 für Achtelnote)
     * @returns {string} VexFlow Notenwert ('q' für Viertel, '8' für Achtel, etc.)
     */

    

    const durationMap = {
        4.0: 'w',    // Ganze Note
        3.0: 'hd',   // Ganze mit Punkt
        2.0: 'h',    // Halbe Note
        1.5: 'qd',   // Halbe mit Punkt
        1.0: 'q',    // Viertelnote
        0.75: '8d',  // Viertel mit Punkt
        0.5: '8',    // Achtelnote
        0.375: '16d', // Achtel mit Punkt
        0.25: '16',  // Sechzehntelnote
        0.125: '32'  // Zweiunddreißigstelnote
    };
    if (JSON.stringify(music21Duration).includes("numerator")) {

      return "8";
    }
    return durationMap[music21Duration] || 'q'; // Default: Viertelnote
}

  function createStaveNotesFromJson(jsonData, voicings, voicingsIndeces, keySign) {

    let staffNotesMeasures = []
    jsonData.forEach((measure, indexMeasure) => {
      let staffNotesMeasure = []
      measure.forEach( (element, index) => {
          let elementNote = element.oneNote
          let keys = [convertToVexFlowKey(elementNote.relative_to_key, elementNote.note_key, elementNote.octave, elementNote.is_rest)]
          let voicingIndex = null;

          if (voicings[indexMeasure][index].length > 0) {
            jsonData.forEach((measure, indexDsonData) => {
                  measure.forEach( (element, indexDsonData1) => {
                    if (Object.hasOwn(element, 'voicingIndex') && indexDsonData == indexMeasure && indexDsonData1 == index) {
                      voicingIndex = element.voicingIndex;
                    }  

                })
            })
          }
          if (voicingIndex != null) {
            keys = []
            for (let i = 0; i < voicings[indexMeasure][index][voicingIndex][1].length; ++i) {
              const voicingNote = voicings[indexMeasure][index][voicingIndex][1][i];
              console.log("hier", voicingNote)
              keys.push(convertToVexFlowKey(voicingNote.relative_to_key, voicingNote.note_key, voicingNote.octave, voicingNote.is_rest))
            }
          }
          let duration = music21ToVexflowDuration(element.oneNote.duration)
          
          console.log(keys, element.oneNote.duration, )
          const note = new VF.StaveNote({
            keys: keys,
            duration: (duration + (element.oneNote.is_rest ? "r" : "")),
            clef: "treble", 
          });

          const isFlat = note.keys[0].split("/")[0].length == 2 && note.keys[0][1] == "b"

          if (note.keys[0].includes("#")) {
            note.addModifier(new VF.Accidental("#"), index);
          } else if (isFlat) {
            note.addModifier(new VF.Accidental("b"), index);
          }

          if (duration.includes("d")) {
            note.dots = 1

            VF.Dot.buildAndAttach([note], {all: true});
          }
          
            staffNotesMeasure.push(note);

        });
        staffNotesMeasures.push(staffNotesMeasure);
    });
    return staffNotesMeasures;
  }
