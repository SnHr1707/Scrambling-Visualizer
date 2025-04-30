document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const bitInputElement = document.getElementById('bitInput');
    const plotButton = document.getElementById('plotButton');
    const visualizerSection = document.getElementById('visualizerSection');
    const b8zsButton = document.getElementById('b8zsButton');
    const hdb3Button = document.getElementById('hdb3Button');
    const playPauseButton = document.getElementById('playPauseButton');
    const speedControl = document.getElementById('speedControl');
    const speedValueSpan = document.getElementById('speedValue');
    // --- New Seek Slider Elements ---
    const seekSlider = document.getElementById('seekSlider');
    const seekValueSpan = document.getElementById('seekValue');
    const seekMaxSpan = document.getElementById('seekMax');
    // --- End New Elements ---
    const resetButton = document.getElementById('resetButton');
    const statusTextSpan = document.getElementById('statusText');
    const stepInfoSpan = document.getElementById('stepInfo');
    const inputBitsDisplay = document.getElementById('inputBitsDisplay');
    const canvas = document.getElementById('signalCanvas');
    const ctx = canvas.getContext('2d');

    // --- State Variables ---
    let bitStream = [];
    let processedAmiSignal = [];
    let substitutionInfo = [];
    let currentIndex = 0;
    let lastPulsePolarity = -1;
    let zeroCount = 0;
    let pulsesSinceLastV = 0; // HDB3 specific
    let isPlaying = false;
    let animationTimer = null;
    let currentAlgorithm = null;
    let animationSpeed = parseInt(speedControl.value, 10);

    // --- Canvas Configuration ---
    const BIT_WIDTH = 40;
    const V_MARGIN = 30;
    const V_LEVEL_HEIGHT = 50;
    let canvasHeight = 2 * V_MARGIN + 2 * V_LEVEL_HEIGHT;
    let canvasWidth = 0;

    // --- Colors ---
    const colorZero = getComputedStyle(document.documentElement).getPropertyValue('--color-zero').trim();
    const colorHigh = getComputedStyle(document.documentElement).getPropertyValue('--color-high').trim();
    const colorLow = getComputedStyle(document.documentElement).getPropertyValue('--color-low').trim();
    const colorViolation = getComputedStyle(document.documentElement).getPropertyValue('--color-violation').trim();
    const colorGrid = getComputedStyle(document.documentElement).getPropertyValue('--grid-color').trim();
    const colorCanvasBg = getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg').trim();

    // --- Event Listeners ---
    plotButton.addEventListener('click', initializeVisualization);
    b8zsButton.addEventListener('click', () => selectAlgorithm('B8ZS'));
    hdb3Button.addEventListener('click', () => selectAlgorithm('HDB3'));
    playPauseButton.addEventListener('click', togglePlayPause);
    speedControl.addEventListener('input', updateSpeed);
    // --- New Seek Slider Listener ---
    seekSlider.addEventListener('input', handleSeek);
    // --- End New Listener ---
    resetButton.addEventListener('click', resetVisualization);

    // --- Initialization ---
    function initializeVisualization() {
        const inputString = bitInputElement.value.trim().replace(/[^01]/g, '');
        if (!inputString) {
            alert('Please enter a valid binary bit stream.');
            return;
        }
        bitInputElement.value = inputString;

        resetState(false);

        bitStream = inputString.split('').map(Number);

        visualizerSection.classList.remove('hidden');
        plotButton.disabled = true;
        bitInputElement.disabled = true;
        b8zsButton.disabled = false;
        hdb3Button.disabled = false;
        resetButton.disabled = false;
        // --- Enable and configure seek slider ---
        seekSlider.max = bitStream.length > 0 ? bitStream.length : 0; // Max value is length (to seek *after* last bit)
        seekSlider.value = 0;
        seekSlider.disabled = bitStream.length === 0; // Disable if no bits
        seekValueSpan.textContent = 0;
        seekMaxSpan.textContent = bitStream.length; // Display total number of steps (0 to length)
        // --- End seek slider config ---


        canvasWidth = bitStream.length * BIT_WIDTH;
        canvas.width = Math.max(canvasWidth, 300);
        canvas.height = canvasHeight;

        displayInputBits();

        updateStatus('Ready. Select B8ZS or HDB3.');
        clearCanvas();
        drawGrid();
    }

    function resetVisualization() {
        resetState(true);

        visualizerSection.classList.add('hidden');
        plotButton.disabled = false;
        bitInputElement.disabled = false;
        bitInputElement.value = '';
        b8zsButton.disabled = true;
        hdb3Button.disabled = true;
        playPauseButton.disabled = true;
        speedControl.disabled = true;
        resetButton.disabled = true;
        b8zsButton.classList.remove('active');
        hdb3Button.classList.remove('active');
        playPauseButton.textContent = 'Play';

        // --- Reset seek slider ---
        seekSlider.disabled = true;
        seekSlider.value = 0;
        seekSlider.max = 0;
        seekValueSpan.textContent = '0';
        seekMaxSpan.textContent = '0';
        // --- End reset seek slider ---

        updateStatus('Idle');
        stepInfoSpan.textContent = '-';
        inputBitsDisplay.innerHTML = '';
        clearCanvas();
        hideInputHighlight();
    }

     function resetState(fullReset = false) {
        clearTimeout(animationTimer);
        animationTimer = null;

        if (fullReset) {
            bitStream = [];
        }
        processedAmiSignal = [];
        substitutionInfo = [];
        currentIndex = 0;
        lastPulsePolarity = -1;
        zeroCount = 0;
        pulsesSinceLastV = 0;
        isPlaying = false;
        currentAlgorithm = null;

        playPauseButton.textContent = 'Play';
        playPauseButton.disabled = true;
        speedControl.disabled = true;
        b8zsButton.classList.remove('active');
        hdb3Button.classList.remove('active');
        b8zsButton.disabled = bitStream.length === 0; // Re-enable only if bits exist
        hdb3Button.disabled = bitStream.length === 0; // Re-enable only if bits exist


        // --- Reset/Update Seek Slider State ---
        seekSlider.value = 0;
        seekValueSpan.textContent = '0';
        if (fullReset) {
            seekSlider.max = 0;
            seekMaxSpan.textContent = '0';
            seekSlider.disabled = true;
        } else if (bitStream.length > 0) {
            // Soft reset, keep slider enabled if bits exist, update max
            seekSlider.max = bitStream.length;
            seekMaxSpan.textContent = bitStream.length;
            seekSlider.disabled = false;
        } else {
             // Soft reset resulted in no bits (shouldn't happen with current flow, but safe)
             seekSlider.max = 0;
             seekMaxSpan.textContent = '0';
             seekSlider.disabled = true;
        }
         // --- End Seek Slider State ---


        if (!fullReset && bitStream.length > 0) {
             updateStatus('Ready. Select B8ZS or HDB3.');
             stepInfoSpan.textContent = '-';
             clearCanvas();
             drawGrid();
             hideInputHighlight();
             // Ensure controls reflect resettable state
             playPauseButton.disabled = true; // Need to select algo first
             speedControl.disabled = true;
        } else if (fullReset) {
            // Ensure UI cleared on full reset
            updateStatus('Idle');
            stepInfoSpan.textContent = '-';
            inputBitsDisplay.innerHTML = '';
            clearCanvas();
            hideInputHighlight();
        }
    }


    // --- Algorithm Selection ---
    function selectAlgorithm(algo) {
        if (isPlaying) {
            togglePlayPause();
        }

        processedAmiSignal = [];
        substitutionInfo = [];
        currentIndex = 0;
        lastPulsePolarity = -1;
        zeroCount = 0;
        pulsesSinceLastV = 0;

        currentAlgorithm = algo;
        b8zsButton.classList.toggle('active', algo === 'B8ZS');
        hdb3Button.classList.toggle('active', algo === 'HDB3');
        b8zsButton.disabled = true;
        hdb3Button.disabled = true;

        playPauseButton.disabled = false;
        speedControl.disabled = false;
        // --- Enable slider when algo selected ---
        seekSlider.disabled = bitStream.length === 0;
        seekSlider.value = 0; // Reset seek position
        seekValueSpan.textContent = 0;
        // --- End enable slider ---

        updateStatus(`Algorithm ${algo} selected. Press Play.`);
        stepInfoSpan.textContent = '-';
        clearCanvas();
        drawGrid();
        hideInputHighlight();
    }

    // --- Playback Controls ---
    function togglePlayPause() {
        if (!currentAlgorithm || bitStream.length === 0) return;

        isPlaying = !isPlaying;
        playPauseButton.textContent = isPlaying ? 'Pause' : 'Play';
        // Disable slider during active playback to avoid conflicts
        seekSlider.disabled = isPlaying;


        if (isPlaying) {
            updateStatus(`Running ${currentAlgorithm}...`);
            b8zsButton.disabled = true;
            hdb3Button.disabled = true;
            // Ensure playback starts from current index (might have been changed by slider)
            animationStep();
        } else {
            updateStatus('Paused.');
            clearTimeout(animationTimer);
            animationTimer = null;
             // Re-enable slider when paused if not at the end
            seekSlider.disabled = currentIndex >= bitStream.length;
             // Don't re-enable algorithm buttons, wait for reset
        }
    }

    function updateSpeed() {
        animationSpeed = parseInt(speedControl.value, 10);
        speedValueSpan.textContent = `${animationSpeed} ms`;
    }

    // --- Animation Loop ---
    function animationStep() {
        if (!isPlaying) { // Check if paused externally (e.g., by seek)
             clearTimeout(animationTimer);
             animationTimer = null;
             seekSlider.disabled = false; // Re-enable slider if paused
             return;
        }

        // Termination condition: currentIndex reaches the *end* of the stream
        if (currentIndex >= bitStream.length) {
            updateStatus(`${currentAlgorithm} finished.`);
            isPlaying = false;
            playPauseButton.textContent = 'Play';
            playPauseButton.disabled = true; // Finished
            hideInputHighlight();
            seekSlider.value = currentIndex; // Ensure slider shows final position
            seekValueSpan.textContent = currentIndex;
            seekSlider.disabled = false; // Allow seeking after finish
            redrawCanvas(); // Final draw without cursor
            clearTimeout(animationTimer);
            animationTimer = null;
            return;
        }

        // Process logic for the *current* bit
        processNextBit(); // This processes bitStream[currentIndex]

        // Update slider position *before* incrementing currentIndex
        seekSlider.value = currentIndex;
        seekValueSpan.textContent = currentIndex;


        // Update visuals
        redrawCanvas(); // Shows state *after* processing currentIndex

        // Move to the next bit index for the *next* step
        currentIndex++;

        // Schedule next step
        animationTimer = setTimeout(animationStep, animationSpeed);
    }


    // --- Core Scrambling Logic (Step-by-Step, Refined & Corrected) ---
    // (processNextBit function remains unchanged from the previous version)
    function processNextBit() {
        if (currentIndex >= bitStream.length) return;

        const bit = bitStream[currentIndex];
        let stepDescription = `Bit ${currentIndex}: Input ${bit}. `;
        let substitutionOccurred = false; // Flag for descriptive text

        // --- Ensure arrays are sized correctly ---
        while (processedAmiSignal.length <= currentIndex) {
            processedAmiSignal.push(0); // Default to 0 level
        }
        while (substitutionInfo.length <= currentIndex) {
            substitutionInfo.push(false); // Default to not being a substitution bit
        }

        // --- Apply Algorithm Logic ---
        if (currentAlgorithm === 'B8ZS') {
            if (bit === 0) {
                zeroCount++;
                // Tentatively set current bit to 0. Might be overwritten by substitution.
                processedAmiSignal[currentIndex] = 0;
                substitutionInfo[currentIndex] = false; // Assume not substitution first

                if (zeroCount >= 8) {
                     let eightZeros = true;
                     for (let k = 1; k < 8; k++) {
                         if ((currentIndex - k < 0) || bitStream[currentIndex - k] !== 0) {
                             eightZeros = false;
                             break;
                         }
                     }

                     if (eightZeros) {
                         substitutionOccurred = true;
                         stepDescription += `Detected 8 zeros ending here. Polarity before zeros: ${lastPulsePolarity > 0 ? '+' : '-'}. Applying B8ZS: `;
                         const sub = (lastPulsePolarity > 0)
                             ? [0, 0, 0, 1, -1, 0, -1, 1] // 000+-0-+
                             : [0, 0, 0, -1, 1, 0, 1, -1]; // 000-+0+-
                         stepDescription += (lastPulsePolarity > 0) ? '000+-0-+' : '000-+0+-';

                         for (let i = 0; i < 8; i++) {
                             const targetIndex = currentIndex - 7 + i;
                             if (targetIndex >= 0) {
                                 processedAmiSignal[targetIndex] = sub[i];
                                 substitutionInfo[targetIndex] = true;
                             }
                         }
                         lastPulsePolarity = sub[7];
                         zeroCount = 0;
                         stepDescription += `. New expected polarity: ${lastPulsePolarity > 0 ? '+' : '-'}.`;

                     } else {
                        stepDescription += `Processing 0 (Zero count: ${zeroCount}).`;
                     }
                } else {
                     stepDescription += `Processing 0 (Zero count: ${zeroCount}).`;
                }
            } else { // bit === 1
                zeroCount = 0;
                lastPulsePolarity *= -1;
                processedAmiSignal[currentIndex] = lastPulsePolarity;
                substitutionInfo[currentIndex] = false;
                stepDescription += `Processing 1. Applying AMI: ${lastPulsePolarity > 0 ? '+' : '-'}.`;
            }

        } else if (currentAlgorithm === 'HDB3') {
            if (bit === 0) {
                zeroCount++;
                processedAmiSignal[currentIndex] = 0;
                substitutionInfo[currentIndex] = false;

                if (zeroCount >= 4) {
                    let fourZeros = true;
                    for (let k = 1; k < 4; k++) {
                        if ((currentIndex - k < 0) || bitStream[currentIndex - k] !== 0) {
                            fourZeros = false;
                            break;
                        }
                    }

                    if (fourZeros) {
                        substitutionOccurred = true;
                        stepDescription += `Detected 4 zeros ending here. Pulses since last V: ${pulsesSinceLastV}. Polarity before zeros: ${lastPulsePolarity > 0 ? '+' : '-'}. Applying HDB3: `;
                        let sub;
                        if (pulsesSinceLastV % 2 === 0) { // Even pulses -> B00V
                            sub = [-lastPulsePolarity, 0, 0, -lastPulsePolarity]; // B00V
                            stepDescription += 'B00V';
                        } else { // Odd pulses -> 000V
                            sub = [0, 0, 0, lastPulsePolarity]; // 000V
                            stepDescription += '000V';
                        }

                        for (let i = 0; i < 4; i++) {
                            const targetIndex = currentIndex - 3 + i;
                            if (targetIndex >= 0) {
                                processedAmiSignal[targetIndex] = sub[i];
                                substitutionInfo[targetIndex] = true;
                            }
                        }
                        lastPulsePolarity = sub[3];
                        pulsesSinceLastV = 0;
                        zeroCount = 0;
                        stepDescription += `. New expected polarity: ${lastPulsePolarity > 0 ? '+' : '-'}.`;

                    } else {
                        stepDescription += `Processing 0 (Zero count: ${zeroCount}).`;
                    }
                } else {
                     stepDescription += `Processing 0 (Zero count: ${zeroCount}).`;
                }
            } else { // bit === 1
                zeroCount = 0;
                lastPulsePolarity *= -1;
                pulsesSinceLastV++;
                processedAmiSignal[currentIndex] = lastPulsePolarity;
                substitutionInfo[currentIndex] = false;
                stepDescription += `Processing 1. Applying AMI: ${lastPulsePolarity > 0 ? '+' : '-'}. Pulses since V: ${pulsesSinceLastV}.`;
            }
        }

        stepInfoSpan.textContent = stepDescription;
        updateInputHighlight(currentIndex);
    }


    // --- Canvas Drawing ---
    // (clearCanvas, drawGrid functions remain unchanged)
    function clearCanvas() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = colorCanvasBg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    function drawGrid() {
        ctx.strokeStyle = colorGrid;
        ctx.lineWidth = 0.5;

        const yZero = V_MARGIN + V_LEVEL_HEIGHT;
        const yHigh = V_MARGIN;
        const yLow = V_MARGIN + 2 * V_LEVEL_HEIGHT;
        const effectiveCanvasWidth = bitStream.length * BIT_WIDTH;

        ctx.beginPath();
        ctx.moveTo(0, yZero);
        ctx.lineTo(effectiveCanvasWidth, yZero);
        ctx.stroke();

        ctx.setLineDash([4, 2]);
        ctx.beginPath();
        ctx.moveTo(0, yHigh);
        ctx.lineTo(effectiveCanvasWidth, yHigh);
        ctx.moveTo(0, yLow);
        ctx.lineTo(effectiveCanvasWidth, yLow);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        for (let i = 0; i <= bitStream.length; i++) {
            const x = i * BIT_WIDTH;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvasHeight);
        }
        ctx.stroke();
    }


    function redrawCanvas() {
        clearCanvas();
        drawGrid();
        drawSignal();
    }

    // (drawSignal function remains unchanged)
    function drawSignal() {
        ctx.lineWidth = 2;
        const yZero = V_MARGIN + V_LEVEL_HEIGHT;
        const yHigh = V_MARGIN;
        const yLow = V_MARGIN + 2 * V_LEVEL_HEIGHT;

        let lastY = yZero;

        // Determine how much of the signal to draw
        // When playing, draw up to currentIndex (which has just been processed)
        // When paused or finished, draw the entire calculated signal up to currentIndex
        const drawLength = currentIndex; // Draw signal resulting from indices 0 to currentIndex - 1


        // Draw signal segments based on the calculated state in processedAmiSignal
        for (let i = 0; i < processedAmiSignal.length && i < drawLength; i++) {
            const level = processedAmiSignal[i];
            const xStart = i * BIT_WIDTH;
            const xEnd = (i + 1) * BIT_WIDTH;
            let currentY = yZero;
            let color = colorZero;

            if (level === 1) {
                currentY = yHigh;
                color = colorHigh;
            } else if (level === -1) {
                currentY = yLow;
                color = colorLow;
            } else {
                currentY = yZero;
                color = colorZero;
            }

            ctx.strokeStyle = color;

            // Draw vertical transitions at the START of the interval
            if (lastY === yZero && currentY !== yZero) { // From 0 to +/-V
                 ctx.beginPath(); ctx.moveTo(xStart, lastY); ctx.lineTo(xStart, currentY); ctx.stroke();
            } else if (lastY !== yZero && currentY !== yZero && lastY !== currentY) { // Between +V and -V
                 ctx.beginPath(); ctx.moveTo(xStart, lastY); ctx.lineTo(xStart, currentY); ctx.stroke();
            } else if (lastY !== yZero && currentY === yZero) { // From +/-V to 0 (draw at start of *current* interval)
                 // This transition technically happens at the *end* of the previous bit,
                 // handled by the end-transition logic below. Avoid double drawing.
            }


            // Draw horizontal line for the bit interval duration
            ctx.beginPath();
            ctx.moveTo(xStart, currentY);
            ctx.lineTo(xEnd, currentY);
            ctx.stroke();

            // Determine the level of the *next* processed bit for end transition
            const nextLevel = (i + 1 < processedAmiSignal.length && i + 1 < drawLength) ? processedAmiSignal[i+1] : undefined;
            let nextY = yZero; // Default assumption if next bit isn't drawn/calculated yet or is 0

            if(nextLevel !== undefined) {
                nextY = (nextLevel === 1) ? yHigh : (nextLevel === -1) ? yLow : yZero;
            } else {
                 // If next bit is beyond drawLength, assume transition back to zero unless current level is zero
                 nextY = (currentY !== yZero) ? yZero : yZero;
            }


             // Draw vertical transitions at the END of the interval
             if (currentY !== yZero && nextY === yZero) { // To 0 from +/-V
                 ctx.beginPath(); ctx.moveTo(xEnd, currentY); ctx.lineTo(xEnd, nextY); ctx.stroke();
             } else if (currentY !== yZero && nextY !== yZero && currentY !== nextY) { // Between +V and -V (redundant with start?)
                 // This logic might be complex - let's rely on the start transition of the *next* bit
                 // Only draw transition TO zero explicitly at the end here.
             } else if (currentY === yZero && nextY !== yZero) { // From 0 to +/-V
                // Handled by the start transition logic of the *next* bit interval.
             }


            // Highlight substitution bits
            if (i < substitutionInfo.length && substitutionInfo[i]) {
                ctx.fillStyle = colorViolation;
                ctx.fillRect(xStart + BIT_WIDTH / 2 - 3, currentY - 3, 6, 6);
            }

            lastY = currentY;
        }

        // Draw cursor if playing and not at the very end
        if (isPlaying && currentIndex < bitStream.length) {
            const cursorX = currentIndex * BIT_WIDTH;
            ctx.strokeStyle = colorViolation;
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 3]);
            ctx.beginPath();
            ctx.moveTo(cursorX, 0);
            ctx.lineTo(cursorX, canvasHeight);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }


    // --- Input Bit Display & Highlighting ---
    // (displayInputBits, updateInputHighlight, hideInputHighlight functions remain unchanged)
     function displayInputBits() {
        inputBitsDisplay.innerHTML = '';
        bitStream.forEach((bit, index) => {
            const span = document.createElement('span');
            span.textContent = bit;
            span.dataset.index = index;
            inputBitsDisplay.appendChild(span);
        });

        let highlightBox = document.getElementById('inputHighlightBox');
        if (!highlightBox) {
             highlightBox = document.createElement('div');
             highlightBox.id = 'inputHighlightBox';
             highlightBox.className = 'highlight-box';
             inputBitsDisplay.style.position = 'relative';
             inputBitsDisplay.appendChild(highlightBox);
        }
        hideInputHighlight();
    }

    function updateInputHighlight(index) {
         const highlightBox = document.getElementById('inputHighlightBox');
         if (!highlightBox || index >= bitStream.length || index < 0) {
             hideInputHighlight();
             return;
         }

         const spanElements = inputBitsDisplay.querySelectorAll('span');
         if (index < spanElements.length) {
             const targetSpan = spanElements[index];
             const spanRect = targetSpan.getBoundingClientRect();
             const containerRect = inputBitsDisplay.getBoundingClientRect();

             const left = spanRect.left - containerRect.left;
             const top = spanRect.top - containerRect.top;
             const width = spanRect.width;
             const height = spanRect.height;

             const computedStyle = getComputedStyle(inputBitsDisplay);
             const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;

             highlightBox.style.left = `${left + inputBitsDisplay.scrollLeft}px`;
             highlightBox.style.top = `${top}px`;
             highlightBox.style.width = `${width}px`;
             highlightBox.style.height = `${height}px`;
             highlightBox.style.opacity = '1';
         } else {
             hideInputHighlight();
         }
     }

    function hideInputHighlight() {
        const highlightBox = document.getElementById('inputHighlightBox');
        if (highlightBox) {
            highlightBox.style.opacity = '0';
        }
    }

    // --- Utility Functions ---
    function updateStatus(message) {
        statusTextSpan.textContent = message;
    }

    // --- New Seek Functionality ---

    // Helper function to save/restore state (used for getting step info during seek)
    function saveCurrentProcessingState() {
        return {
            processedAmiSignal: [...processedAmiSignal],
            substitutionInfo: [...substitutionInfo],
            lastPulsePolarity,
            zeroCount,
            pulsesSinceLastV,
            currentIndex // Save current index too
        };
    }

    function restoreProcessingState(state) {
        processedAmiSignal = state.processedAmiSignal;
        substitutionInfo = state.substitutionInfo;
        lastPulsePolarity = state.lastPulsePolarity;
        zeroCount = state.zeroCount;
        pulsesSinceLastV = state.pulsesSinceLastV;
        currentIndex = state.currentIndex; // Restore index
    }


    // Recalculates the signal state from the beginning up to (but not including) targetIndex
    function recalculateStateUpTo(targetIndex) {
        // Reset state variables to initial conditions
        processedAmiSignal = [];
        substitutionInfo = [];
        // IMPORTANT: Keep track of state *during* this calculation locally
        let tempLastPulsePolarity = -1;
        let tempZeroCount = 0;
        let tempPulsesSinceLastV = 0;

        // Simulate processing bit by bit up to targetIndex
        for (let i = 0; i < targetIndex; i++) {
            if (i >= bitStream.length) break; // Safety check

            const bit = bitStream[i];

            // Ensure arrays are sized
            while (processedAmiSignal.length <= i) processedAmiSignal.push(0);
            while (substitutionInfo.length <= i) substitutionInfo.push(false);

            // --- Apply Algorithm Logic (Simplified version of processNextBit, only for state calculation) ---
             if (currentAlgorithm === 'B8ZS') {
                    if (bit === 0) {
                        tempZeroCount++;
                        processedAmiSignal[i] = 0;
                        substitutionInfo[i] = false;
                        if (tempZeroCount >= 8) {
                             let eightZeros = true;
                             for (let k = 1; k < 8; k++) if ((i - k < 0) || bitStream[i - k] !== 0) { eightZeros = false; break; }
                             if (eightZeros) {
                                const sub = (tempLastPulsePolarity > 0) ? [0, 0, 0, 1, -1, 0, -1, 1] : [0, 0, 0, -1, 1, 0, 1, -1];
                                for (let j = 0; j < 8; j++) {
                                    const idx = i - 7 + j;
                                    if (idx >= 0) { processedAmiSignal[idx] = sub[j]; substitutionInfo[idx] = true; }
                                }
                                tempLastPulsePolarity = sub[7];
                                tempZeroCount = 0;
                             }
                         }
                    } else {
                        tempZeroCount = 0; tempLastPulsePolarity *= -1;
                        processedAmiSignal[i] = tempLastPulsePolarity; substitutionInfo[i] = false;
                    }
                } else if (currentAlgorithm === 'HDB3') {
                     if (bit === 0) {
                         tempZeroCount++;
                         processedAmiSignal[i] = 0; substitutionInfo[i] = false;
                         if (tempZeroCount >= 4) {
                              let fourZeros = true;
                              for (let k = 1; k < 4; k++) if ((i - k < 0) || bitStream[i - k] !== 0) { fourZeros = false; break; }
                              if(fourZeros){
                                 let sub;
                                 if (tempPulsesSinceLastV % 2 === 0) { sub = [-tempLastPulsePolarity, 0, 0, -tempLastPulsePolarity]; }
                                 else { sub = [0, 0, 0, tempLastPulsePolarity]; }
                                 for (let j = 0; j < 4; j++) {
                                     const idx = i - 3 + j;
                                     if (idx >= 0) { processedAmiSignal[idx] = sub[j]; substitutionInfo[idx] = true; }
                                 }
                                 tempLastPulsePolarity = sub[3]; tempPulsesSinceLastV = 0; tempZeroCount = 0;
                              }
                         }
                     } else {
                         tempZeroCount = 0; tempLastPulsePolarity *= -1; tempPulsesSinceLastV++;
                         processedAmiSignal[i] = tempLastPulsePolarity; substitutionInfo[i] = false;
                     }
                }
        } // End loop

        // Trim arrays to the correct size (contain data for indices 0 to targetIndex - 1)
         processedAmiSignal.length = targetIndex;
         substitutionInfo.length = targetIndex;

        // Update the *actual* global state variables to reflect the state *before* processing targetIndex
        lastPulsePolarity = tempLastPulsePolarity;
        zeroCount = tempZeroCount;
        pulsesSinceLastV = tempPulsesSinceLastV;
        // currentIndex is NOT set here, it's set in handleSeek
    }

    function handleSeek() {
        const targetIndex = parseInt(seekSlider.value, 10);

        // 1. Pause playback if it's running
        if (isPlaying) {
             // togglePlayPause will set isPlaying = false, clear timer, update button, enable slider
             togglePlayPause();
        }

        // 2. Recalculate the state *up to* the target index
        // This sets processedAmiSignal, substitutionInfo, lastPulsePolarity, zeroCount, pulsesSinceLastV
        // as they should be *before* processing the bit at targetIndex.
        recalculateStateUpTo(targetIndex);

        // 3. Set the global currentIndex to the seek target
        currentIndex = targetIndex;

        // 4. Update UI
        seekValueSpan.textContent = targetIndex;
        redrawCanvas(); // Redraw signal based on recalculated processedAmiSignal and new currentIndex

        // Update step info and input highlight for the new current index
        if (currentIndex < bitStream.length) {
            // To get the correct description for the *next* step (which is now currentIndex),
            // we can temporarily run processNextBit without advancing currentIndex further.
            // Save state, run processNextBit just for description, restore state.
             const tempState = saveCurrentProcessingState();
             processNextBit(); // This will calculate signal[currentIndex] and update stepInfoSpan/highlight
             restoreProcessingState(tempState); // Restore state so play resumes correctly
             updateInputHighlight(currentIndex); // Ensure highlight is correct
             updateStatus(`Seeked to index ${currentIndex}. Ready to play.`);
        } else {
             // Seeked to the very end (index == length)
             stepInfoSpan.textContent = `Seeked to end (after index ${currentIndex - 1})`;
             hideInputHighlight();
             updateStatus('Seeked to end.');
        }

        // 5. Update Play/Pause button state
        playPauseButton.textContent = 'Play'; // Always show 'Play' after seeking
        // Enable play only if not at the very end
        playPauseButton.disabled = (currentIndex >= bitStream.length || !currentAlgorithm);
        // Keep slider enabled after seeking
        seekSlider.disabled = false;


    }

    // --- End New Seek Functionality ---

}); // End DOMContentLoaded