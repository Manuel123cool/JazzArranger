// Stelle sicher, dass VexFlow korrekt geladen ist
if (typeof VexFlow === "undefined") {
    console.error("VexFlow is not loaded. Please include vexflow-min.js.");
    throw new Error("VexFlow not loaded");
  }
  
  const VF = VexFlow;

  function convertToVexFlowKey(note, keySign) {
    if (note == "Rest") {
      return "b/4"
    }
    const match = note.match(/^([A-G])([#-])?(\d)$/);
    if (!match) {
      console.error(`Ungültige Note: ${note}`);
      return null;
    }
  
    let [_, letter, accidental, octave] = match;
    let key = letter.toLowerCase();
  
    if (accidental === "#") {
      key += "#";
    } else if (accidental === "-") {
      key += "b";
    }

    return `${key}/${octave}`;
  }
  
  function music21ToVexflowDuration(music21Duration) {
    /**
     * Wandelt music21 Duration in VexFlow Notenwert um.
     * @param {number} music21Duration - music21 Duration (z.B. 1.0 für Viertelnote, 0.5 für Achtelnote)
     * @returns {string} VexFlow Notenwert ('q' für Viertel, '8' für Achtel, etc.)
     */

    

    const durationMap = {
        4.0: 'w',    // Ganze Note
        3.0: 'wd',   // Ganze mit Punkt
        2.0: 'h',    // Halbe Note
        1.5: 'hd',   // Halbe mit Punkt
        1.0: 'q',    // Viertelnote
        0.75: 'qd',  // Viertel mit Punkt
        0.5: '8',    // Achtelnote
        0.375: '8d', // Achtel mit Punkt
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
    jsonData.forEach((measure, index0 ) => {
      let staffNotesMeasure = []

      let tripletNotes = []
      measure.forEach( (element, index) => {
        let keys = [convertToVexFlowKey(element.relative_to_key, keySign)]
        if (voicings[index0][index].length > 0) {
          let voicingIndex = null;
          jsonData.forEach((measure, indexDsonData) => {
                measure.forEach( (element, indexDsonData1) => {
                  if (Object.hasOwn(element, 'voicingIndex') && indexDsonData == index0 && indexDsonData1 == index) {
                    voicingIndex = element.voicingIndex;
                  }  
                  console.log(index , indexDsonData ,  index0 , indexDsonData1 , index)

              })
          })
          if (voicingIndex != null) {
            keys = []
            for (let i = 0; i < voicings[index0][index][voicingIndex][1].length; ++i) {
              
              keys.push(convertToVexFlowKey(voicings[index0][index][voicingIndex][1][i], keySign))
            }
          }
          
        }
        let duration = music21ToVexflowDuration(element.elem_length)
        const note = new VF.StaveNote({
          keys: keys,
          duration: (duration + (element.relative_to_key == "Rest" ? "r" : "")),
          clef: "treble", // Akkordnoten im Violinschlüssel
        });
        const isFlat = note.keys[0].split("/")[0].length == 2 && note.keys[0][1] == "b"

        if (note.keys[0].includes("#")) {
          note.addModifier(new VF.Accidental("#"), index);
        } else if (isFlat) {
          note.addModifier(new VF.Accidental("b"), index);
        }

        
          staffNotesMeasure.push(note);

      })
      staffNotesMeasures.push(staffNotesMeasure);
    })
    console.log(staffNotesMeasures)
    return staffNotesMeasures;
  }
