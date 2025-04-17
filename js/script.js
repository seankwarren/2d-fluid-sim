// Wait for the DOM to be fully loaded before executing JavaScript
document.addEventListener('DOMContentLoaded', () => {
    console.log('Fluid simulation initializing');
    
    // Get reference to the canvas
    const canvas = document.getElementById('canvas');
    
    // Add simple error handling
    canvas.addEventListener('webglcontextlost', function(e) {
        e.preventDefault();
        console.error('WebGL context lost. Please refresh the page.');
    });
    
    try {
        // Create the fluid simulation
        const fluidSim = createFluidSimulation(canvas);
        if (!fluidSim) {
            console.error('Failed to initialize fluid simulation. Your browser might not support required WebGL features.');
            return;
        }
        
        // Configure the fluid simulation with the user's preferred values
        fluidSim.setConfig({
            SIM_RESOLUTION: 512,
            DYE_RESOLUTION: 1024,
            DENSITY_DISSIPATION: .99,     // User specified value
            VELOCITY_DISSIPATION: 0.98,   // User specified value  
            PRESSURE: 0.8,                // User specified value
            PRESSURE_ITERATIONS: 20,
            CURL: 4,                      // User specified value (vorticity)
            SPLAT_RADIUS: 0.12,           // User specified value
            SPLAT_FORCE: 5000,
            SHADING: false,
            COLORFUL: false
        });
        
        console.log('Fluid simulation initialized successfully');
        
    } catch (err) {
        console.error('Initialization error:', err);
    }
}); 
