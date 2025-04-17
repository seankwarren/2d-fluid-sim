/**
 * 2D Fluid Simulation
 * Based on the implementation from https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
 */

function createFluidSimulation(canvas) {
  try {
    // Configuration
    const config = {
      SIM_RESOLUTION: 128,
      DYE_RESOLUTION: 1024,
      DENSITY_DISSIPATION: 3.0,    // User specified value
      VELOCITY_DISSIPATION: 0.45,  // User specified value
      PRESSURE: 0.8,               // User specified value
      PRESSURE_ITERATIONS: 20,
      CURL: 9,                     // User specified value (vorticity)
      SPLAT_RADIUS: 0.12,          // User specified value
      SPLAT_FORCE: 6000,
      SHADING: false,              // Disabled as per user request
      COLORFUL: false,             // Disabled as per user request
      PAUSED: false,
      BACK_COLOR: { r: 0, g: 0, b: 0 },
      TRANSPARENT: false,
      FALLBACK_RESOLUTION: 512  // Lower resolution for fallback
    };

  // Setup canvas with proper device pixel ratio
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);

  // Initialize WebGL context
    const gl = canvas.getContext('webgl', {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false
    }) || canvas.getContext('experimental-webgl', {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false
    });
  
  if (!gl) {
      console.error('WebGL not supported in your browser');
      return null;
    }

    // Extension support
    const ext = getWebGLExtensions();

    function getWebGLExtensions() {
      // Explicitly enable required extensions for compatibility
      const extColorBufferHalfFloat = gl.getExtension('EXT_color_buffer_half_float');
      const webgl2ColorBufferFloat = gl.getExtension('WEBGL_color_buffer_float');
      const extTextureHalfFloat = gl.getExtension('OES_texture_half_float');
      const supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
      
      let ext = {
        formatRGBA: { internalFormat: gl.RGBA, format: gl.RGBA },
        formatRG: { internalFormat: gl.RGBA, format: gl.RGBA },
        formatR: { internalFormat: gl.RGBA, format: gl.RGBA },
        halfFloatTexType: gl.FLOAT,
        supportLinearFiltering,
        extColorBufferHalfFloat
      };
      
      // Try to get half float texture extension
      if (extTextureHalfFloat) {
        ext.halfFloatTexType = extTextureHalfFloat.HALF_FLOAT_OES;
      }
      
      // Try to get linear filtering for half float textures
      const extTextureHalfFloatLinear = gl.getExtension('OES_texture_half_float_linear');
      const hasHalfFloatTexture = extTextureHalfFloat && extTextureHalfFloatLinear;
      
      if (hasHalfFloatTexture) {
        ext.supportLinearFiltering = true;
      }
      
      // Set up formats
      let textureExists = checkRenderTargetSupport(ext);
      
      if (!textureExists) {
        ext.formatRGBA = { internalFormat: gl.RGBA, format: gl.RGBA };
        ext.formatRG = { internalFormat: gl.RGBA, format: gl.RGBA };
        ext.formatR = { internalFormat: gl.RGBA, format: gl.RGBA };
      }
      
      console.log('WebGL extensions loaded:', {
        'EXT_color_buffer_half_float': !!extColorBufferHalfFloat,
        'WEBGL_color_buffer_float': !!webgl2ColorBufferFloat,
        'OES_texture_half_float': !!extTextureHalfFloat,
        'OES_texture_half_float_linear': !!extTextureHalfFloatLinear,
        'OES_texture_float_linear': !!supportLinearFiltering
      });
      
      return ext;
    }

    function checkRenderTargetSupport(ext) {
      try {
        const targetType = ext.halfFloatTexType;
        let targetTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, targetTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        
        // Try to create the texture
        gl.texImage2D(gl.TEXTURE_2D, 0, ext.formatRGBA.internalFormat, 4, 4, 0, ext.formatRGBA.format, targetType, null);
        
        // Check for any errors
        if (gl.getError() !== gl.NO_ERROR) {
          console.warn("Error creating texture with formats", ext.formatRGBA);
          gl.deleteTexture(targetTexture);
          return false;
        }

        let fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, targetTexture, 0);

        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        const hasSupport = status === gl.FRAMEBUFFER_COMPLETE;
        
        if (!hasSupport) {
          console.warn("Framebuffer not complete, status:", status);
        }
        
        // Properly clean up resources
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteTexture(targetTexture);
        gl.deleteFramebuffer(fbo);
        
        return hasSupport;
      } catch (e) {
        console.error("Error checking render target support:", e);
        return false;
      }
    }

    // Adjust simulation resolution based on support
    if (!ext.supportLinearFiltering) {
      console.log('Linear filtering not supported, using fallback settings');
      config.DYE_RESOLUTION = config.FALLBACK_RESOLUTION;
      config.SIM_RESOLUTION = Math.min(config.SIM_RESOLUTION, config.FALLBACK_RESOLUTION);
      config.SHADING = false;
    }
    
    // Also reduce quality if no half float support
    if (!ext.extColorBufferHalfFloat) {
      console.log('Half float textures not supported, using fallback settings');
      config.DYE_RESOLUTION = Math.floor(config.FALLBACK_RESOLUTION / 2);
      config.SIM_RESOLUTION = Math.min(config.SIM_RESOLUTION, Math.floor(config.FALLBACK_RESOLUTION / 2));
      config.CURL = Math.min(config.CURL, 20);
      config.PRESSURE_ITERATIONS = Math.min(config.PRESSURE_ITERATIONS, 15);
    }

    // Compile shader utility
    function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    
    return shader;
  }
  
    // Create program utility
    function createProgram(vertexShader, fragmentShader) {
      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program linking error:', gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
      }

      return program;
    }

    // Get uniform locations
    function getUniforms(program) {
      const uniforms = {};
      const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      
      for (let i = 0; i < uniformCount; i++) {
        const uniformInfo = gl.getActiveUniform(program, i);
        const { name } = uniformInfo;
        uniforms[name] = gl.getUniformLocation(program, name);
      }
      
      return uniforms;
    }

    // Program class
    class Program {
      constructor(vertexShader, fragmentShader) {
        this.program = createProgram(vertexShader, fragmentShader);
        this.uniforms = getUniforms(this.program);
      }
      
      bind() {
        gl.useProgram(this.program);
      }
    }

    // Create framebuffer
    function createFBO(width, height, internalFormat, format, type, param) {
      gl.activeTexture(gl.TEXTURE0);
      
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, null);
      
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.viewport(0, 0, width, height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      
      return {
        texture,
        fbo,
        width,
        height,
        attach(id) {
          gl.activeTexture(gl.TEXTURE0 + id);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          return id;
        }
      };
    }

    // Double buffer for ping-pong rendering
    function createDoubleFBO(width, height, internalFormat, format, type, param) {
      let fbo1 = createFBO(width, height, internalFormat, format, type, param);
      let fbo2 = createFBO(width, height, internalFormat, format, type, param);
      
    return {
        get read() {
          return fbo1;
        },
        get write() {
          return fbo2;
        },
        swap() {
          const temp = fbo1;
          fbo1 = fbo2;
          fbo2 = temp;
        }
      };
    }

    // Shader sources
    const baseVertexShader = `
      precision highp float;
      attribute vec2 aPosition;
      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform vec2 texelSize;

      void main () {
        vUv = aPosition * 0.5 + 0.5;
        vL = vUv - vec2(texelSize.x, 0.0);
        vR = vUv + vec2(texelSize.x, 0.0);
        vT = vUv + vec2(0.0, texelSize.y);
        vB = vUv - vec2(0.0, texelSize.y);
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `;

    const displayShaderSource = `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      uniform sampler2D uTexture;

      void main () {
        vec3 color = texture2D(uTexture, vUv).rgb;
        gl_FragColor = vec4(color, 1.0);
      }
    `;

    const splatShaderSource = `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      uniform sampler2D uTarget;
      uniform float aspectRatio;
      uniform vec3 color;
      uniform vec2 point;
      uniform float radius;

      void main () {
        vec2 p = vUv - point.xy;
        p.x *= aspectRatio;
        vec3 splat = exp(-dot(p, p) / radius) * color;
        vec3 base = texture2D(uTarget, vUv).xyz;
        gl_FragColor = vec4(base + splat, 1.0);
      }
    `;

    const advectionShaderSource = `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      uniform sampler2D uVelocity;
      uniform sampler2D uSource;
      uniform vec2 texelSize;
      uniform float dt;
      uniform float dissipation;

      void main () {
        vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
        gl_FragColor = dissipation * texture2D(uSource, coord);
      }
    `;

    const divergenceShaderSource = `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform sampler2D uVelocity;

      void main () {
        float L = texture2D(uVelocity, vL).x;
        float R = texture2D(uVelocity, vR).x;
        float T = texture2D(uVelocity, vT).y;
        float B = texture2D(uVelocity, vB).y;
        float div = 0.5 * (R - L + T - B);
        gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
      }
    `;

    const curlShaderSource = `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform sampler2D uVelocity;

      void main () {
        float L = texture2D(uVelocity, vL).y;
        float R = texture2D(uVelocity, vR).y;
        float T = texture2D(uVelocity, vT).x;
        float B = texture2D(uVelocity, vB).x;
        float curl = R - L - T + B;
        gl_FragColor = vec4(0.5 * curl, 0.0, 0.0, 1.0);
      }
    `;

    const vorticityShaderSource = `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform sampler2D uVelocity;
      uniform sampler2D uCurl;
      uniform float curl;
      uniform float dt;

      void main () {
        float L = texture2D(uCurl, vL).x;
        float R = texture2D(uCurl, vR).x;
        float T = texture2D(uCurl, vT).x;
        float B = texture2D(uCurl, vB).x;
        float C = texture2D(uCurl, vUv).x;
        vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
        force /= length(force) + 0.0001;
        force *= curl * C;
        force.y *= -1.0;
        vec2 velocity = texture2D(uVelocity, vUv).xy;
        velocity += force * dt;
        gl_FragColor = vec4(velocity, 0.0, 1.0);
      }
    `;

    const pressureShaderSource = `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform sampler2D uPressure;
      uniform sampler2D uDivergence;

      void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        float C = texture2D(uPressure, vUv).x;
        float divergence = texture2D(uDivergence, vUv).x;
        float pressure = (L + R + B + T - divergence) * 0.25;
        gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
      }
    `;

    const gradientSubtractShaderSource = `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform sampler2D uPressure;
      uniform sampler2D uVelocity;

      void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        vec2 velocity = texture2D(uVelocity, vUv).xy;
        velocity.xy -= vec2(R - L, T - B);
        gl_FragColor = vec4(velocity, 0.0, 1.0);
      }
    `;

    // Compile shaders and create programs
    const vertexShader = compileShader(gl.VERTEX_SHADER, baseVertexShader);
    
    const displayProgram = new Program(vertexShader, compileShader(gl.FRAGMENT_SHADER, displayShaderSource));
    const splatProgram = new Program(vertexShader, compileShader(gl.FRAGMENT_SHADER, splatShaderSource));
    const advectionProgram = new Program(vertexShader, compileShader(gl.FRAGMENT_SHADER, advectionShaderSource));
    const divergenceProgram = new Program(vertexShader, compileShader(gl.FRAGMENT_SHADER, divergenceShaderSource));
    const curlProgram = new Program(vertexShader, compileShader(gl.FRAGMENT_SHADER, curlShaderSource));
    const vorticityProgram = new Program(vertexShader, compileShader(gl.FRAGMENT_SHADER, vorticityShaderSource));
    const pressureProgram = new Program(vertexShader, compileShader(gl.FRAGMENT_SHADER, pressureShaderSource));
    const gradientSubtractProgram = new Program(vertexShader, compileShader(gl.FRAGMENT_SHADER, gradientSubtractShaderSource));

    // Setup geometry
    const blit = (() => {
      // Create a quad
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, -1, -1, 1, 1, 1, -1]), gl.STATIC_DRAW);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(0);
      
      return (target, clear = false) => {
        if (target) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
          gl.viewport(0, 0, target.width, target.height);
        } else {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        }
        
        if (clear) {
          gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
        }
        
        // Draw the quad
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      };
    })();

    // Calculate aspect ratio for simulation
    function getResolution(resolution) {
      const aspectRatio = canvas.width / canvas.height;
      if (aspectRatio < 1) {
        return { width: Math.round(resolution), height: Math.round(resolution / aspectRatio) };
      } else {
        return { width: Math.round(resolution * aspectRatio), height: Math.round(resolution) };
      }
    }

    // Initialize simulation framebuffers
    let simRes = getResolution(config.SIM_RESOLUTION);
    let dyeRes = getResolution(config.DYE_RESOLUTION);

    const texType = ext.halfFloatTexType;
    const filterType = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    let density = createDoubleFBO(
      dyeRes.width,
      dyeRes.height,
      ext.formatRGBA.internalFormat,
      ext.formatRGBA.format,
      texType,
      filterType
    );
    
    let velocity = createDoubleFBO(
      simRes.width,
      simRes.height,
      ext.formatRG.internalFormat,
      ext.formatRG.format,
      texType,
      filterType
    );
    
    let divergence = createFBO(
      simRes.width,
      simRes.height,
      ext.formatR.internalFormat,
      ext.formatR.format,
      texType,
      gl.NEAREST
    );
    
    let curl = createFBO(
      simRes.width,
      simRes.height,
      ext.formatR.internalFormat,
      ext.formatR.format,
      texType,
      gl.NEAREST
    );
    
    let pressure = createDoubleFBO(
      simRes.width,
      simRes.height,
      ext.formatR.internalFormat,
      ext.formatR.format,
      texType,
      gl.NEAREST
    );

    // Mouse Interaction state
    const pointer = {
      x: 0,
      y: 0,
      dx: 0,
      dy: 0,
      down: false,
      moved: false,
      color: { r: 0, g: 0, b: 0 }
    };

    // Simulation functions
    function applyInputs() {
      if (pointer.moved && pointer.down) {
        pointer.moved = false;
        
        const aspectRatio = canvas.width / canvas.height;
        let velocity = 10.0 * pointer.dx;
        let force = 10.0 * pointer.dy;
        
        splat(
          pointer.x / canvas.width,
          1.0 - pointer.y / canvas.height,
          velocity,
          -force,
          pointer.color
        );
      }
    }

    function splat(x, y, dx, dy, color) {
      splatProgram.bind();
      gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
      gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
      gl.uniform2f(splatProgram.uniforms.point, x, y);
      gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0.0);
      gl.uniform1f(splatProgram.uniforms.radius, config.SPLAT_RADIUS / 100.0);
      blit(velocity.write);
      velocity.swap();

      gl.uniform1i(splatProgram.uniforms.uTarget, density.read.attach(0));
      gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
      blit(density.write);
      density.swap();
    }

    function step(dt) {
      gl.disable(gl.BLEND);
      
      // Calculate curl and vorticity
      curlProgram.bind();
      gl.uniform2f(curlProgram.uniforms.texelSize, 1.0 / simRes.width, 1.0 / simRes.height);
      gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
      blit(curl);
      
      // Apply vorticity force
      vorticityProgram.bind();
      gl.uniform2f(vorticityProgram.uniforms.texelSize, 1.0 / simRes.width, 1.0 / simRes.height);
      gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
      gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1));
      gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL);
      gl.uniform1f(vorticityProgram.uniforms.dt, dt);
      blit(velocity.write);
      velocity.swap();
      
      // Advect velocity
      advectionProgram.bind();
      gl.uniform2f(advectionProgram.uniforms.texelSize, 1.0 / simRes.width, 1.0 / simRes.height);
      gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
      gl.uniform1i(advectionProgram.uniforms.uSource, velocity.read.attach(0));
      gl.uniform1f(advectionProgram.uniforms.dt, dt);
      gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
      blit(velocity.write);
      velocity.swap();
      
      // Advect density
      gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
      gl.uniform1i(advectionProgram.uniforms.uSource, density.read.attach(1));
      gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
      blit(density.write);
      density.swap();
      
      // Calculate divergence
      divergenceProgram.bind();
      gl.uniform2f(divergenceProgram.uniforms.texelSize, 1.0 / simRes.width, 1.0 / simRes.height);
      gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
      blit(divergence);
      
      // Clear pressure
      pressureProgram.bind();
      gl.uniform2f(pressureProgram.uniforms.texelSize, 1.0 / simRes.width, 1.0 / simRes.height);
      gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
      
      // Solve pressure iteratively
      for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
        gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
        blit(pressure.write);
        pressure.swap();
      }
      
      // Subtract pressure gradient
      gradientSubtractProgram.bind();
      gl.uniform2f(gradientSubtractProgram.uniforms.texelSize, 1.0 / simRes.width, 1.0 / simRes.height);
      gl.uniform1i(gradientSubtractProgram.uniforms.uPressure, pressure.read.attach(0));
      gl.uniform1i(gradientSubtractProgram.uniforms.uVelocity, velocity.read.attach(1));
      blit(velocity.write);
      velocity.swap();
    }

    function render() {
      // Simple display with no bloom or sunrays
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.BLEND);
      
      // Display result
      displayProgram.bind();
      gl.uniform1i(displayProgram.uniforms.uTexture, density.read.attach(0));
      blit(null);
    }

    // Random color generation - simplified for consistency
    function generateColor() {
      // Generate a color from a simplified HSV color wheel
      const h = Math.random(); // Random hue
      const s = 0.7;           // Fixed saturation
      const v = 0.8;           // Fixed value/brightness
      
      let r, g, b;
      
      const i = Math.floor(h * 6);
      const f = h * 6 - i;
      const p = v * (1 - s);
      const q = v * (1 - f * s);
      const t = v * (1 - (1 - f) * s);
      
      switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
      }
      
      // Make colors less intense
      return { r: r * 0.2, g: g * 0.2, b: b * 0.2 };
    }

    // Animation loop
    let lastTime = 0;
    
    function update(time) {
      const dt = (time - lastTime) / 1000.0 || 0;
      lastTime = time;
      
      applyInputs();
      step(Math.min(dt, 0.016));
      render();
      
      requestAnimationFrame(update);
    }

    function resizeCanvas() {
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      
      simRes = getResolution(config.SIM_RESOLUTION);
      dyeRes = getResolution(config.DYE_RESOLUTION);
      
      // Resize FBOs
      const texType = ext.halfFloatTexType;
      const filterType = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
      
      density = createDoubleFBO(
        dyeRes.width,
        dyeRes.height,
        ext.formatRGBA.internalFormat,
        ext.formatRGBA.format,
        texType,
        filterType
      );
      
      velocity = createDoubleFBO(
        simRes.width,
        simRes.height,
        ext.formatRG.internalFormat,
        ext.formatRG.format,
        texType,
        filterType
      );
      
      divergence = createFBO(
        simRes.width,
        simRes.height,
        ext.formatR.internalFormat,
        ext.formatR.format,
        texType,
        gl.NEAREST
      );
      
      curl = createFBO(
        simRes.width,
        simRes.height,
        ext.formatR.internalFormat,
        ext.formatR.format,
        texType,
        gl.NEAREST
      );
      
      pressure = createDoubleFBO(
        simRes.width,
        simRes.height,
        ext.formatR.internalFormat,
        ext.formatR.format,
        texType,
        gl.NEAREST
      );
    }

    // Event handlers
  canvas.addEventListener('mousemove', e => {
      // Calculate pointer delta
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Store previous position
      const prevX = pointer.x;
      const prevY = pointer.y;
      
      // Update position
      pointer.x = x * window.devicePixelRatio;
      pointer.y = y * window.devicePixelRatio;
      
      // Calculate movement
      pointer.dx = (pointer.x - prevX) * 1.0;
      pointer.dy = (pointer.y - prevY) * 1.0;
      
      pointer.moved = Math.abs(pointer.dx) > 0 || Math.abs(pointer.dy) > 0;
  });
  
  canvas.addEventListener('mousedown', e => {
      pointer.down = true;
      pointer.color = generateColor();
  });
  
  window.addEventListener('mouseup', () => {
      pointer.down = false;
  });
  
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      
      // Calculate new position
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      
      // Store previous position
      const prevX = pointer.x;
      const prevY = pointer.y;
      
      // Update position - Fixed: multiply by devicePixelRatio
      pointer.x = x * window.devicePixelRatio;
      pointer.y = y * window.devicePixelRatio;
      
      // Calculate movement
      pointer.dx = (pointer.x - prevX) * 10.0;
      pointer.dy = (pointer.y - prevY) * 10.0;
      
      pointer.moved = Math.abs(pointer.dx) > 0 || Math.abs(pointer.dy) > 0;
    }, { passive: false });
  
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      
      // Fixed: multiply by devicePixelRatio
      pointer.x = (touch.clientX - rect.left) * window.devicePixelRatio;
      pointer.y = (touch.clientY - rect.top) * window.devicePixelRatio;
      pointer.down = true;
      pointer.color = generateColor();
    }, { passive: false });
    
    window.addEventListener('touchend', () => {
      pointer.down = false;
    });
    
    window.addEventListener('resize', resizeCanvas);

    // Initialize and start simulation
    resizeCanvas();
    
    // Add some initial random splats for visual effect
    multipleSplats(5);
    
    update(0);

    // Function to create multiple random splats
    function multipleSplats(amount) {
      for (let i = 0; i < amount; i++) {
        const color = generateColor();
        const x = Math.random();
        const y = Math.random();
        const dx = 1000 * (Math.random() - 0.5);
        const dy = 1000 * (Math.random() - 0.5);
        splat(x, y, dx, dy, color);
      }
    }

    // Return API
  return {
      setConfig(newConfig) {
        Object.assign(config, newConfig);
      },
      pause() {
        config.PAUSED = true;
      },
      resume() {
        config.PAUSED = false;
        lastTime = 0;
        update(0);
      }
    };
  } catch (e) {
    console.error('Fatal error in fluid simulation:', e);
    return null;
  }
} 
