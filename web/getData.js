
function splitIntoX(arr) {
  const result = [];
  for (let i = 0; i < arr.length; i += measureCount) {
    result.push(arr.slice(i, i + measureCount));
  }
  return result;
}

function getChordNames(jsonData) {

  let chordNamesMeasures = []
  jsonData.forEach((measure) => {
    let chordNamesMeasure = []

    measure.forEach( (element, index) => {
      chordNamesMeasure.push(getChordSymbol(element.chord_details.map(note => note.note_key )))
    })
    if (chordNamesMeasure.length > 0) {
      chordNamesMeasures.push(chordNamesMeasure);

    }
  })

  return chordNamesMeasures;
}

function createTubletIndexFromJson(jsonData) {
  let indeces = []
  jsonData.forEach((measure, index0) => {
    let indexcesMeasure = []

    measure.forEach( (element, index) => {

      if (element.oneNote && element.oneNote.hasOwnProperty("oneTuplet") && element.oneNote.oneTuplet !== null) [
        indexcesMeasure.push([index0, index])
      ]
    })
    indeces.push(indexcesMeasure);
  })

  return indeces;
}

function allDataAddVoicingIndeces(allData, originalData) {
  allData.addedVoicingsIndeces = []
  originalData.forEach((measure, index0) => {
    measure.forEach( (element, index) => {
      if (Object.hasOwn(element, 'voicingIndex') && element.voicingIndex != -1) {
        allData.addedVoicingsIndeces.push([Math.floor(index0 / measureCount), index0 % measureCount, index, element.voicingIndex]);
      }  
    })
  })
  console.log("alleda", allData.addedVoicingsIndeces)
  return allData;
}

function getVoicings(jsonData) {
  let voicingsMeasures = []
  jsonData.forEach((measure) => {
    let voicingsMeasure = []

    measure.forEach( (element, index) => {
      if (element.leftHandVoicings && element.leftHandVoicings.length > 0 )
        voicingsMeasure.push(element.voicings.concat(element.leftHandVoicings))
      else
        voicingsMeasure.push(element.voicings)
    })

    voicingsMeasures.push(voicingsMeasure);
  })

  return voicingsMeasures;
}

async function syncFetch(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP-Fehler! Status: ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Fetch-Fehler:', error);
      throw error;
    }
  }
  // Hauptfunktion, die fetch ausführt und dann weiteren Code
  let fetchData = null;
  async function main() {
    try {
      // Fetch ausführen
      fetchData = await syncFetch('http://localhost:3000/data/' + indexForRoute); // Example API
      console.log("fetchDATE", fetchData)
      keySign = fetchData["keySign"]
      let timeSign = fetchData["timeSign"]
      fetchData = fetchData["noteInfo"]

      
      // Code, der NUR nach dem Fetch ausgeführt wird

      let tupletsIndeces = createTubletIndexFromJson(fetchData);
      staveNotes = createStaveNotesFromJson(fetchData, getVoicings(fetchData));
      staveNotes = splitIntoX(staveNotes);
      let chordNames = splitIntoX(getChordNames(fetchData));
      let voicings = splitIntoX(getVoicings(fetchData));

      console.log(voicings, chordNames, staveNotes, tupletsIndeces)
      let allData = allDataAddVoicingIndeces({"chordNames": chordNames, "staveNotes": staveNotes, "voicings": voicings, "tupletsIndeces": tupletsIndeces}, fetchData);
      for (let i = 0; i < staveNotes.length ; ++i) {
        renderMeasures(staveNotes[i], 220 * i, i, chordNames[i], allData, fetchData, keySign, timeSign); 
      }

    } catch (error) {
      console.error('Fehler beim Abrufen der Daten:', error);
    }
  }
  
  // Hauptfunktion aufrufen

  main();
