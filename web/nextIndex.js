function isDifferentVoicing(currentVoicing, nextVoicing) {
    function checkIfNoteSetEqual(noteSet1, noteSet2) {
        let isInThereCount = 0;

        for (let i = 0; i < noteSet1.length; ++i) {
            for (let j = 0; j < noteSet2.length; ++j) {
                if (noteSet1[i].relative_to_key == noteSet2[j].relative_to_key) {
                    isInThereCount += 1;
                }
            }
        }
        if (isInThereCount == noteSet1.length) {
            return true
        }
        return false
    }

    if (currentVoicing.length != nextVoicing.length) {
        return true
    }
    let isInThereCount = 0
    for (let i = 0; i < currentVoicing.length; ++i) {
        if (checkIfNoteSetEqual(currentVoicing[i], nextVoicing[i])) {
            isInThereCount += 1
        }
    }
    if (isInThereCount == currentVoicing.length) {
        return false
    }
    return true
}

function isDifferentInversion(currentVoicing, nextVoicing) {
    for (let i = 0; i < currentVoicing.length; ++i) {
        for (let j = 0; j < currentVoicing[i].length; ++j) {
            if (currentVoicing[i][j].relative_to_key != nextVoicing[i][j].relative_to_key) {
                return true;
            }
        }
    }

    return false;
}

function nextIndex(twoHandedVoicings, leftHandedVoicings, mode, currentIndex) {
    if (Number(mode) == 1) {
        if (currentIndex > twoHandedVoicings.length - 1 || currentIndex >= twoHandedVoicings.length -1 ) {
            return 0;
        }
        return currentIndex + 1;
    }

    if (Number(mode) == 2) {
        if (currentIndex > twoHandedVoicings.length - 1 || currentIndex == twoHandedVoicings.length - 1) {
            currentIndex = 0;
        }
        let once = false

        for (let i = currentIndex + 1; i < leftHandedVoicings.length + twoHandedVoicings.length; ++i) {
            if (leftHandedVoicings.length > 0 && leftHandedVoicings[i][2].length > 0) {
                return i
            }
            if (i == twoHandedVoicings.length - 1 && !once) {
                i = 0;
                once = true;
            }  
        }
        return currentIndex;
    }

    if (Number(mode) == 3 && currentIndex > twoHandedVoicings.length - 1) {
        let once = false
        let returnIndeces = [];
        let returnOctaves = [];

        if (currentIndex == leftHandedVoicings.length + twoHandedVoicings.length - 1) {
            currentIndex = twoHandedVoicings.length;
        }

        for (let i = currentIndex; i < leftHandedVoicings.length + twoHandedVoicings.length; ++i) {
            if (isDifferentVoicing(leftHandedVoicings[currentIndex - twoHandedVoicings.length], leftHandedVoicings[i - twoHandedVoicings.length])) {
                if (!returnIndeces.includes(i)) {
                    returnOctaves.push(leftHandedVoicings[i - twoHandedVoicings.length][0][0].octave);
                    returnIndeces.push(i);
                }
            }
            if (i == twoHandedVoicings.length + leftHandedVoicings.length - 1 && !once) {
                i = twoHandedVoicings.length - 1;
                once = true;
            }  
        }
        let diff = Infinity
        let returnIndex = -1;
        for (let i = 0; i < returnOctaves.length; ++i) {
            if (Math.abs(leftHandedVoicings[currentIndex - twoHandedVoicings.length][0][0].octave - returnOctaves[i]) < diff) {
                diff = Math.abs(leftHandedVoicings[currentIndex - twoHandedVoicings.length][0][0].octave - returnOctaves[i])
                returnIndex = i;
            }
        }
        if (returnIndex !== -1) return returnIndeces[returnIndex]

        return currentIndex

    } else if (leftHandedVoicings.length > 0 && Number(mode) == 3) {
        return twoHandedVoicings.length 
    }

    if (Number(mode) == 4 && currentIndex > twoHandedVoicings.length - 1) {
        let once = false
        let returnIndeces = [];
        let returnOctaves = [];

        if (currentIndex == leftHandedVoicings.length + twoHandedVoicings.length - 1) {
            currentIndex = twoHandedVoicings.length;
        }

        for (let i = currentIndex; i < leftHandedVoicings.length + twoHandedVoicings.length; ++i) {
            if (!isDifferentVoicing(leftHandedVoicings[currentIndex - twoHandedVoicings.length], leftHandedVoicings[i - twoHandedVoicings.length])) {
                if (isDifferentInversion(leftHandedVoicings[currentIndex - twoHandedVoicings.length], leftHandedVoicings[i - twoHandedVoicings.length])) {
                    if (!returnIndeces.includes(i)) {
                        returnOctaves.push(leftHandedVoicings[i - twoHandedVoicings.length][0][0].octave);
                        returnIndeces.push(i);
                    }
                    
                }
                
            }
            if (i == twoHandedVoicings.length + leftHandedVoicings.length - 1 && !once) {
                i = twoHandedVoicings.length - 1;
                once = true;
            }
        }
        
        let diff = Infinity
        let returnIndex = -1;
        for (let i = 0; i < returnOctaves.length; ++i) {
            if (Math.abs(leftHandedVoicings[currentIndex - twoHandedVoicings.length][0][0].octave - returnOctaves[i]) < diff) {
                diff = Math.abs(leftHandedVoicings[currentIndex - twoHandedVoicings.length][0][0].octave - returnOctaves[i])
                returnIndex = i;
            }
        }
        if (returnIndex !== -1) return returnIndeces[returnIndex]
    } 

    if (Number(mode) == 5 && currentIndex > twoHandedVoicings.length - 1) {
        let once = false
        let returnIndeces = [];
        let returnOctaves = [];

        if (currentIndex == leftHandedVoicings.length + twoHandedVoicings.length - 1) {
            currentIndex = twoHandedVoicings.length;
        }

        for (let i = currentIndex + 1; i < leftHandedVoicings.length + twoHandedVoicings.length; ++i) {
            if (!isDifferentVoicing(leftHandedVoicings[currentIndex - twoHandedVoicings.length], leftHandedVoicings[i - twoHandedVoicings.length])) {
                if (!isDifferentInversion(leftHandedVoicings[currentIndex - twoHandedVoicings.length], leftHandedVoicings[i - twoHandedVoicings.length])) {
                    return i;
                }
                
            }
            if (i == twoHandedVoicings.length + leftHandedVoicings.length - 1 && !once) {
                i = twoHandedVoicings.length - 1;
                once = true;
            }
        }
    } 

    if (currentIndex >= leftHandedVoicings.length + twoHandedVoicings.length - 1) return 0; else
    return currentIndex + 1;
}