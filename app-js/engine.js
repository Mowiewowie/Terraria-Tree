// --- Function: Custom 2D infinite canvas physics, framerate math, and all mobile/desktop drag-pan events ---

// --- Custom 2D Frustum Culling Engine (Virtualization) ---
let cullingBounds = [];
let isCullingActive = false;
let lastCullX = null, lastCullY = null, lastCullScale = null;

window.calculateCullingBounds = function() {
    cullingBounds = [];
    const targets = dom.treeContainer.querySelectorAll('.item-card, .discover-box-container');
    const treeRect = dom.treeContainer.getBoundingClientRect();
    
    targets.forEach(el => {
        const rect = el.getBoundingClientRect();
        // Store absolute local coordinates relative to the tree root, invariant of zoom
        const localLeft = (rect.left - treeRect.left) / currentScale;
        const localTop = (rect.top - treeRect.top) / currentScale;
        
        cullingBounds.push({
            el: el,
            left: localLeft,
            top: localTop,
            right: localLeft + (rect.width / currentScale),
            bottom: localTop + (rect.height / currentScale),
            isHidden: false
        });
    });
    isCullingActive = true;
    lastCullX = null; // Force immediate cull
    applyCulling();
};

function applyCulling() {
    if (!isCullingActive || cullingBounds.length === 0) return;
    
    // Optimization: Only recalculate if the camera moved significantly
    if (lastCullX !== null && Math.abs(currentX - lastCullX) < 20 && Math.abs(currentY - lastCullY) < 20 && Math.abs(currentScale - lastCullScale) < 0.02) return;
    
    lastCullX = currentX; lastCullY = currentY; lastCullScale = currentScale;

    // Viewport mapped to local coordinates + 1000px safety padding so images load before entering screen
    const pad = 1000 / currentScale; 
    const vLeft = -currentX / currentScale - pad;
    const vTop = -currentY / currentScale - pad;
    const vRight = (window.innerWidth - currentX) / currentScale + pad;
    const vBottom = (window.innerHeight - currentY) / currentScale + pad;

    for (let i = 0; i < cullingBounds.length; i++) {
        const b = cullingBounds[i];
        const isVisible = !(b.right < vLeft || b.left > vRight || b.bottom < vTop || b.top > vBottom);
        
        if (isVisible && b.isHidden) {
            b.el.style.visibility = 'visible';
            b.isHidden = false;
        } else if (!isVisible && !b.isHidden) {
            b.el.style.visibility = 'hidden';
            b.isHidden = true;
        }
    }
}

// --- Animation Loop & Canvas Physics Engine ---

function renderLoop() {
    const factor = 0.15;
    currentX += (targetX - currentX) * factor;
    currentY += (targetY - currentY) * factor;
    currentScale += (targetScale - currentScale) * factor;

    // Force GPU Acceleration with translate3d
    dom.treeContainer.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) scale(${currentScale})`;

    const diff = Math.abs(targetX - currentX) + Math.abs(targetY - currentY) + Math.abs(targetScale - currentScale);
    
    applyCulling(); // Dynamically hide off-screen items while panning/zooming

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
    
    // Allowed manual zoom down to 2% (0.02) overriding the getMinScale() reset limit
    targetScale = Math.max(0.02, Math.min(targetScale + zoomDelta, 4));
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
        dom.treeContainer.style.pointerEvents = ''; // Force unlock clicks
        triggerAnimation(); // Ensure physics loop settles gracefully
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

        // Allowed manual zoom down to 2% (0.02) overriding the getMinScale() reset limit
        const newScale = Math.max(0.02, Math.min(initialScale * zoomDelta, 4));
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
        dom.treeContainer.style.pointerEvents = ''; // Force unlock taps
        triggerAnimation(); // Ensure physics loop settles gracefully
        saveCurrentState();
    } else if (e.touches.length === 1) {
        initialPinchDist = null;
        isPanning = true;
        startX = e.touches[0].clientX - targetX;
        startY = e.touches[0].clientY - targetY;
    }
});
