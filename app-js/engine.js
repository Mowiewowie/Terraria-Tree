// --- Function: Custom 2D infinite canvas physics, framerate math, and all mobile/desktop drag-pan events ---

// --- Animation Loop & Canvas Physics Engine ---

function renderLoop() {
    const factor = 0.15;
    currentX += (targetX - currentX) * factor;
    currentY += (targetY - currentY) * factor;
    currentScale += (targetScale - currentScale) * factor;

    // Force GPU Acceleration with translate3d
    dom.treeContainer.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) scale(${currentScale})`;

    const diff = Math.abs(targetX - currentX) + Math.abs(targetY - currentY) + Math.abs(targetScale - currentScale);
    
    // Restore pointer events early (when movement is visually negligible) to completely eliminate perceived lag.
    // Keep them disabled during fast travel or physical dragging to maintain CPU performance.
    if (isPanning || initialPinchDist || diff > 1.5) {
        dom.treeContainer.style.pointerEvents = 'none';
    } else {
        dom.treeContainer.style.pointerEvents = '';
    }

    if (diff < 0.001 && !isPanning && !initialPinchDist) {
        currentX = targetX;
        currentY = targetY;
        currentScale = targetScale;
        dom.treeContainer.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) scale(${currentScale})`;
        isAnimating = false;
    } else {
        requestAnimationFrame(renderLoop);
    }
}

function triggerAnimation() {
    if (!isAnimating) {
        isAnimating = true;
        requestAnimationFrame(renderLoop);
    }
}

// --- Canvas Interaction Event Listeners ---

let wheelTimeout;
dom.vizArea.addEventListener('wheel', e => { 
    e.preventDefault(); 
    const rect = dom.vizArea.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const localX = (mouseX - targetX) / targetScale;
    const localY = (mouseY - targetY) / targetScale;
    const zoomDelta = -e.deltaY * 0.0015; 
    
    targetScale = Math.max(getMinScale(), Math.min(targetScale + zoomDelta, 4));
    targetX = mouseX - localX * targetScale;
    targetY = mouseY - localY * targetScale;
    triggerAnimation();

    clearTimeout(wheelTimeout);
    wheelTimeout = setTimeout(saveCurrentState, 300);
});

// Explicitly kill native HTML5 ghost-image dragging
dom.vizArea.addEventListener('dragstart', e => e.preventDefault());

dom.vizArea.addEventListener('mousedown', e => { 
    if (e.target.closest('.no-pan')) return; 
    isPanning = true; 
    isDraggingThresholdMet = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    startX = e.clientX - targetX; 
    startY = e.clientY - targetY; 
    dom.vizArea.classList.add('grabbing'); 
});

window.addEventListener('mouseup', () => { 
    if (isPanning) {
        isPanning = false; 
        dom.vizArea.classList.remove('grabbing'); 
        saveCurrentState();
    }
});

window.addEventListener('mousemove', e => { 
    if(isPanning) { 
        if (Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY) > 5) {
            isDraggingThresholdMet = true;
        }
        e.preventDefault(); 
        targetX = e.clientX - startX; 
        targetY = e.clientY - startY; 
        triggerAnimation(); 
    }
});

dom.vizArea.addEventListener('touchstart', e => {
    if (e.target.closest('.no-pan')) return;
    if (e.touches.length === 1) {
        isPanning = true;
        isDraggingThresholdMet = false;
        dragStartX = e.touches[0].clientX;
        dragStartY = e.touches[0].clientY;
        startX = e.touches[0].clientX - targetX;
        startY = e.touches[0].clientY - targetY;
        dom.vizArea.classList.add('grabbing');
    } else if (e.touches.length === 2) {
        isPanning = false; 
        initialPinchDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        initialScale = targetScale;
    }
}, { passive: false });

dom.vizArea.addEventListener('touchmove', e => {
    if (e.target.closest('.no-pan') && !isPanning && !initialPinchDist) return;
    e.preventDefault(); 
    if (isPanning && e.touches.length === 1) {
        if (Math.hypot(e.touches[0].clientX - dragStartX, e.touches[0].clientY - dragStartY) > 5) {
            isDraggingThresholdMet = true;
        }
        targetX = e.touches[0].clientX - startX;
        targetY = e.touches[0].clientY - startY;
        triggerAnimation();
    } else if (e.touches.length === 2 && initialPinchDist) {
        const currentDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        const zoomDelta = currentDist / initialPinchDist;
        
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const rect = dom.vizArea.getBoundingClientRect();
        const mouseX = midX - rect.left;
        const mouseY = midY - rect.top;
        const localX = (mouseX - targetX) / targetScale;
        const localY = (mouseY - targetY) / targetScale;

        const newScale = Math.max(getMinScale(), Math.min(initialScale * zoomDelta, 4));
        if (Number.isFinite(newScale)) {
            targetScale = newScale;
            targetX = mouseX - localX * targetScale;
            targetY = mouseY - localY * targetScale;
            triggerAnimation();
        }
    }
}, { passive: false });

dom.vizArea.addEventListener('touchend', e => {
    if (e.touches.length === 0) {
        isPanning = false;
        initialPinchDist = null;
        dom.vizArea.classList.remove('grabbing');
        saveCurrentState();
    } else if (e.touches.length === 1) {
        initialPinchDist = null;
        isPanning = true;
        startX = e.touches[0].clientX - targetX;
        startY = e.touches[0].clientY - targetY;
    }
});
