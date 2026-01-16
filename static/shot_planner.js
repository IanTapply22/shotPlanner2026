// State
let shootState = {
    x: -2.8,
    y: 0.4,
    vx: 2.5,
    vy: 8.0
};

let heatmapData = null;
let trajectoryData = null;
let angleSpeedData = null;
let isDragging = false;
let currentCanvas = null;

// Canvas setup
const trajCanvas = document.getElementById('trajectoryCanvas');
const trajCtx = trajCanvas.getContext('2d');
const angCanvas = document.getElementById('angleSpeedCanvas');
const angCtx = angCanvas.getContext('2d');

// Constants
const RIM_WIDTH = 1.04;
const RIM_HEIGHT = 1.83;

// Initialize
async function init() {
    await loadHeatmap();
    await updateAll();
    setupEventListeners();
}

// Load heatmap data
async function loadHeatmap() {
    try {
        const response = await fetch('/api/generate_heatmap');
        heatmapData = await response.json();
    } catch (error) {
        console.error('Error loading heatmap:', error);
    }
}

// Update all visualizations and data
async function updateAll() {
    await Promise.all([
        updateTrajectory(),
        updateAngleSpeed()
    ]);
    updateInfo();
}

// Calculate and update trajectory
async function updateTrajectory() {
    try {
        const response = await fetch('/api/calculate_trajectory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(shootState)
        });
        trajectoryData = await response.json();
        drawTrajectoryCanvas();
    } catch (error) {
        console.error('Error updating trajectory:', error);
    }
}

// Calculate and update angle-speed space
async function updateAngleSpeed() {
    try {
        const response = await fetch('/api/calculate_ang_speed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ x: shootState.x, y: shootState.y })
        });
        angleSpeedData = await response.json();
        drawAngleSpeedCanvas();
    } catch (error) {
        console.error('Error updating angle-speed:', error);
    }
}

// Draw trajectory canvas
function drawTrajectoryCanvas() {
    const width = trajCanvas.width;
    const height = trajCanvas.height;
    
    trajCtx.clearRect(0, 0, width, height);
    
    // Transform functions
    const xScale = width / 7.2;
    const yScale = height / 4.1;
    const toCanvasX = (x) => (x + 6.2) * xScale;
    const toCanvasY = (y) => height - (y + 0.1) * yScale;
    const fromCanvasX = (cx) => cx / xScale - 6.2;
    const fromCanvasY = (cy) => (height - cy) / yScale - 0.1;
    
    // Draw heatmap
    if (heatmapData) {
        const x_range = heatmapData.x_range;
        const y_range = heatmapData.y_range;
        const area_grid = heatmapData.area_grid;
        
        let maxArea = 0;
        for (let row of area_grid) {
            maxArea = Math.max(maxArea, ...row);
        }
        
        const cellWidth = (x_range[1] - x_range[0]) * xScale;
        const cellHeight = (y_range[1] - y_range[0]) * yScale;
        
        for (let i = 0; i < x_range.length; i++) {
            for (let j = 0; j < y_range.length; j++) {
                const intensity = area_grid[i][j] / maxArea;
                const hue = intensity * 120; // 0 = red, 120 = green
                const saturation = 100;
                const lightness = 50;
                trajCtx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
                
                const cx = toCanvasX(x_range[i]);
                const cy = toCanvasY(y_range[j]);
                trajCtx.fillRect(cx, cy - cellHeight, cellWidth, cellHeight);
            }
        }
    }
    
    // Draw axis labels and grid
    trajCtx.strokeStyle = '#ddd';
    trajCtx.lineWidth = 1;
    trajCtx.fillStyle = '#666';
    trajCtx.font = '12px Arial';
    
    // X-axis grid and labels
    for (let x = -6; x <= 0; x += 1) {
        const cx = toCanvasX(x);
        trajCtx.beginPath();
        trajCtx.moveTo(cx, 0);
        trajCtx.lineTo(cx, height);
        trajCtx.stroke();
        
        trajCtx.fillText(x + 'm', cx - 10, height - 5);
    }
    
    // Y-axis grid and labels
    for (let y = 0; y <= 4; y += 0.5) {
        const cy = toCanvasY(y);
        trajCtx.beginPath();
        trajCtx.moveTo(0, cy);
        trajCtx.lineTo(width, cy);
        trajCtx.stroke();
        
        trajCtx.fillText(y.toFixed(1) + 'm', 5, cy - 5);
    }
    
    // Axis titles
    trajCtx.fillStyle = '#333';
    trajCtx.font = 'bold 14px Arial';
    trajCtx.fillText('X Position (meters)', width / 2 - 60, height - 25);
    trajCtx.save();
    trajCtx.translate(50, height / 2);
    trajCtx.rotate(-Math.PI / 2);
    trajCtx.fillText('Y Position (meters)', -60, 0);
    trajCtx.restore();
    
    // Draw ground
    trajCtx.fillStyle = '#888';
    trajCtx.fillRect(toCanvasX(-6), toCanvasY(-0.5), 7 * xScale, 0.5 * yScale);
    
    // Draw goal structure
    trajCtx.strokeStyle = '#666';
    trajCtx.lineWidth = 2;
    trajCtx.strokeRect(
        toCanvasX(-RIM_WIDTH / 2),
        toCanvasY(RIM_HEIGHT),
        RIM_WIDTH * xScale,
        RIM_HEIGHT * yScale
    );
    
    // Draw robot
    const robotWidth = (2.72 - 2 * 0.34) * xScale;
    const robotHeight = 0.57 * yScale;
    trajCtx.strokeRect(
        toCanvasX(-(2.72 / 2 - 0.34)),
        toCanvasY(0),
        robotWidth,
        robotHeight
    );
    
    // Draw trajectory
    if (trajectoryData) {
        const color = trajectoryData.result === 0 ? '#28a745' : '#dc3545';
        trajCtx.strokeStyle = color;
        trajCtx.lineWidth = 2;
        trajCtx.beginPath();
        for (let i = 0; i < trajectoryData.x.length; i++) {
            const cx = toCanvasX(trajectoryData.x[i]);
            const cy = toCanvasY(trajectoryData.y[i]);
            if (i === 0) {
                trajCtx.moveTo(cx, cy);
            } else {
                trajCtx.lineTo(cx, cy);
            }
        }
        trajCtx.stroke();
    }
    
    // Draw shoot position
    trajCtx.fillStyle = '#000';
    trajCtx.beginPath();
    trajCtx.arc(toCanvasX(shootState.x), toCanvasY(shootState.y), 5, 0, 2 * Math.PI);
    trajCtx.fill();
    
    // Store transform functions for mouse events
    trajCanvas.toCanvasX = toCanvasX;
    trajCanvas.toCanvasY = toCanvasY;
    trajCanvas.fromCanvasX = fromCanvasX;
    trajCanvas.fromCanvasY = fromCanvasY;
}

// Draw angle-speed canvas
function drawAngleSpeedCanvas() {
    const width = angCanvas.width;
    const height = angCanvas.height;
    
    angCtx.clearRect(0, 0, width, height);
    
    // Transform functions
    const minAngle = 20;
    const maxAngle = 85;
    const minSpeed = 5;
    const maxSpeed = 15;
    
    const xScale = width / (maxAngle - minAngle);
    const yScale = height / (maxSpeed - minSpeed);
    const toCanvasX = (angle) => (angle - minAngle) * xScale;
    const toCanvasY = (speed) => height - (speed - minSpeed) * yScale;
    const fromCanvasX = (cx) => cx / xScale + minAngle;
    const fromCanvasY = (cy) => maxSpeed - cy / yScale;
    
    // Draw axes
    angCtx.strokeStyle = '#ddd';
    angCtx.lineWidth = 1;
    for (let a = 20; a <= 85; a += 10) {
        const x = toCanvasX(a);
        angCtx.beginPath();
        angCtx.moveTo(x, 0);
        angCtx.lineTo(x, height);
        angCtx.stroke();
        
        angCtx.fillStyle = '#999';
        angCtx.font = '12px Arial';
        angCtx.fillText(a + '°', x - 10, height - 5);
    }
    
    for (let s = 5; s <= 15; s += 2) {
        const y = toCanvasY(s);
        angCtx.beginPath();
        angCtx.moveTo(0, y);
        angCtx.lineTo(width, y);
        angCtx.stroke();
        
        angCtx.fillStyle = '#999';
        angCtx.font = '12px Arial';
        angCtx.fillText(s + 'm/s', 5, y - 5);
    }
    
    // Draw allowable region
    if (angleSpeedData) {
        const angles = angleSpeedData.angles;
        const lower = angleSpeedData.lower_bound;
        const upper = angleSpeedData.upper_bound;
        
        angCtx.fillStyle = 'rgba(40, 167, 69, 0.3)';
        angCtx.strokeStyle = 'rgba(40, 167, 69, 0.8)';
        angCtx.lineWidth = 2;
        
        angCtx.beginPath();
        for (let i = 0; i < angles.length; i++) {
            const x = toCanvasX(angles[i]);
            const y = toCanvasY(lower[i]);
            if (i === 0) {
                angCtx.moveTo(x, y);
            } else {
                angCtx.lineTo(x, y);
            }
        }
        for (let i = angles.length - 1; i >= 0; i--) {
            const x = toCanvasX(angles[i]);
            const y = toCanvasY(upper[i]);
            angCtx.lineTo(x, y);
        }
        angCtx.closePath();
        angCtx.fill();
        angCtx.stroke();
    }
    
    // Draw current angle/speed
    const angle = Math.atan2(shootState.vy, shootState.vx) * 180 / Math.PI;
    const speed = Math.sqrt(shootState.vx ** 2 + shootState.vy ** 2);
    
    angCtx.fillStyle = '#000';
    angCtx.beginPath();
    angCtx.arc(toCanvasX(angle), toCanvasY(speed), 5, 0, 2 * Math.PI);
    angCtx.fill();
    
    // Store transform functions
    angCanvas.toCanvasX = toCanvasX;
    angCanvas.toCanvasY = toCanvasY;
    angCanvas.fromCanvasX = fromCanvasX;
    angCanvas.fromCanvasY = fromCanvasY;
}

// Update info panel
function updateInfo() {
    document.getElementById('posX').textContent = shootState.x.toFixed(2);
    document.getElementById('posY').textContent = shootState.y.toFixed(2);
    document.getElementById('velX').textContent = shootState.vx.toFixed(2);
    document.getElementById('velY').textContent = shootState.vy.toFixed(2);
    
    const angle = Math.atan2(shootState.vy, shootState.vx) * 180 / Math.PI;
    const speed = Math.sqrt(shootState.vx ** 2 + shootState.vy ** 2);
    
    document.getElementById('angle').textContent = angle.toFixed(1);
    document.getElementById('speed').textContent = speed.toFixed(2);
    
    const statusEl = document.getElementById('status');
    if (trajectoryData) {
        if (trajectoryData.result === 0) {
            statusEl.innerHTML = '<span class="status-success">✓ Success</span>';
        } else if (trajectoryData.result === -1) {
            statusEl.innerHTML = '<span class="status-fail">✗ Undershot</span>';
        } else {
            statusEl.innerHTML = '<span class="status-fail">✗ Overshot</span>';
        }
    }
}

// Event listeners
function setupEventListeners() {
    trajCanvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        currentCanvas = 'trajectory';
        handleDrag(e);
    });
    
    angCanvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        currentCanvas = 'angle';
        handleDrag(e);
    });
    
    window.addEventListener('mousemove', (e) => {
        if (isDragging) {
            handleDrag(e);
        }
    });
    
    window.addEventListener('mouseup', () => {
        isDragging = false;
        currentCanvas = null;
    });
}

// Handle dragging
function handleDrag(e) {
    if (!isDragging) return;
    
    if (currentCanvas === 'trajectory') {
        const rect = trajCanvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        
        const x = trajCanvas.fromCanvasX(cx);
        const y = trajCanvas.fromCanvasY(cy);
        
        if (x >= -6 && x <= -1 && y >= 0.2 && y <= 1.25) {
            shootState.x = x;
            shootState.y = y;
            updateAll();
        }
    } else if (currentCanvas === 'angle') {
        const rect = angCanvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        
        const angle = angCanvas.fromCanvasX(cx);
        const speed = angCanvas.fromCanvasY(cy);
        
        const angleRad = angle * Math.PI / 180;
        shootState.vx = speed * Math.cos(angleRad);
        shootState.vy = speed * Math.sin(angleRad);
        
        updateTrajectory().then(() => {
            drawTrajectoryCanvas();
            drawAngleSpeedCanvas();
            updateInfo();
        });
    }
}

// Start the app
init();