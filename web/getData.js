
function splitIntoThrees(arr) {
  const result = [];
  for (let i = 0; i < arr.length; i += 3) {
    result.push(arr.slice(i, i + 3));
  }
  return result;
}

function getChordNames(jsonData) {

  let chordNamesMeasures = []
  jsonData.forEach((measure) => {
    let chordNamesMeasure = []

    measure.forEach( (element, index) => {
      chordNamesMeasure.push(getChordSymbol(element.chord_details))
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
      if (JSON.stringify(element).includes("numerator")) [
        indexcesMeasure.push([index0, index])
      ]
    })
    indeces.push(indexcesMeasure);
  })

  return indeces;
}

function getVoicings(jsonData) {
  let voicingsMeasures = []
  jsonData.forEach((measure) => {
    let voicingsMeasure = []

    measure.forEach( (element, index) => {
      voicingsMeasure.push(element.voicings ? element.voicings : [])
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
  
      // Code, der NUR nach dem Fetch ausgeführt wird
      let tupletsIndeces = createTubletIndexFromJson(fetchData);
      staveNotes = createStaveNotesFromJson(fetchData);
      staveNotes = splitIntoThrees(staveNotes);
      let chordNames = splitIntoThrees(getChordNames(fetchData));
      let voicings = splitIntoThrees(getVoicings(fetchData));
      for (let i = 0; i < staveNotes.length ; ++i) {
        renderThreeMeasure(staveNotes[i], 220 * i, i, chordNames[i], {"chordNames": chordNames, "staveNotes": staveNotes, "voicings": voicings, "tupletsIndeces": tupletsIndeces}); 
      }

      // Beispiel: Daten verarbeiten
      if (fetchData.title) {
      }
    } catch (error) {
      console.error('Fehler beim Abrufen der Daten:', error);
    }
  }
  
  // Hauptfunktion aufrufen

  main();
