# 2D Fluid Simulation

An interactive, GPU-accelerated fluid simulation built with vanilla JavaScript, HTML, CSS, and WebGL. This simulation solves the Navier-Stokes equations for incompressible fluids in real-time using the GPU.

## Features

- Real-time fluid dynamics simulation
- Interactive mouse/touch controls
- GPU-accelerated calculations using WebGL shaders
- Responsive design that works on desktop and mobile
- Vorticity confinement for more interesting swirls
- Pressure solver for incompressible fluid behavior

## Project Structure

- `index.html` - Main HTML document
- `css/styles.css` - Styling for the application
- `js/fluid-simulation.js` - Core fluid simulation implementation
- `js/script.js` - Configuration and initialization

## How It Works

The simulation uses the Navier-Stokes equations for incompressible fluids, implemented using WebGL shader programs:

1. **Advection**: Moves velocity and dye through the velocity field
2. **Diffusion**: Simulates viscosity (implemented via dissipation)
3. **Vorticity Confinement**: Enhances vortices for more interesting swirls
4. **Pressure Projection**: Ensures mass conservation (divergence-free velocity field)
5. **External Forces**: User interaction adds velocity and dye to the simulation

The entire simulation runs on the GPU, allowing for real-time performance even at high resolutions.

## Configuration

The simulation parameters can be adjusted by modifying the configuration object in `js/script.js`:

```javascript
fluidSim.setConfig({
    SIM_RESOLUTION: 512,         // Simulation resolution
    DYE_RESOLUTION: 1024,        // Dye field resolution
    DENSITY_DISSIPATION: 0.99,   // How quickly the color/dye fades (1.0 = no dissipation)
    VELOCITY_DISSIPATION: 0.98,  // How quickly the velocity field fades
    PRESSURE: 0.8,               // Pressure solver strength
    PRESSURE_ITERATIONS: 20,     // Number of iterations for pressure solver
    CURL: 2,                     // Vorticity/curl strength (higher = more swirls)
    SPLAT_RADIUS: 0.12,          // Size of fluid splats
    SPLAT_FORCE: 5000,           // Force of fluid splats
    SHADING: false,              // Disable shading effects
    COLORFUL: false              // Disable colorful mode
});
```

## Interaction

- **Mouse/Touch**: Click and drag on the canvas to interact with the fluid
- The simulation automatically creates random splats at the start to show the fluid in motion

## Getting Started

To run this simulation locally:

1. Clone this repository or download the files
2. Open `index.html` in a modern web browser that supports WebGL
3. Click and drag on the canvas to interact with the fluid

Note: For best performance, use a desktop browser with hardware acceleration enabled.

## Important Implementation Notes

The code has been updated to ensure consistency:
- The canvas element in `index.html` has an ID of `canvas`
- The JavaScript in `js/script.js` now correctly references the element with ID `canvas`

## Browser Compatibility

This simulation requires WebGL support. It works best in:

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Most modern mobile browsers

## License

This project is based on Pavel Dobryakov's WebGL Fluid Simulation and is available under the MIT License. 
