/**
 * WebGL Utilities for Fluid Simulation
 */

// Initialize WebGL context with appropriate extensions
function initWebGL(canvas) {
    const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
    
    let gl = canvas.getContext('webgl2', params);
    let isWebGL2 = !!gl;
    
    if (!gl) {
        gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);
    }
    
    if (!gl) {
        console.error('WebGL not supported');
        return { gl: null, ext: null };
    }
    
    // Extension setup
    if (isWebGL2) {
        gl.getExtension('EXT_color_buffer_float');
    } else {
        gl.getExtension('OES_texture_float');
        gl.getExtension('OES_texture_half_float');
        gl.getExtension('OES_texture_half_float_linear');
        gl.getExtension('OES_standard_derivatives');
        gl.getExtension('EXT_shader_texture_lod');
        gl.getExtension('WEBGL_color_buffer_float');
        gl.getExtension('OES_element_index_uint');
    }
    
    // Determine which extensions and formats are supported
    let ext = {
        formatRGBA: gl.RGBA,
        formatRG: gl.RGBA,  // WebGL1 doesn't have RG format, fallback to RGBA
        formatR: gl.RGBA,   // WebGL1 doesn't have R format, fallback to RGBA
        halfFloatTexType: gl.UNSIGNED_BYTE,
        supportLinearFiltering: false
    };
    
    if (isWebGL2) {
        // We're using HALF_FLOAT, so we need floating-point formats
        gl.getExtension('EXT_color_buffer_float'); // Needed for float rendering
        ext.formatRGBA = gl.RGBA16F; // Use RGBA16F instead of RGBA8
        ext.formatRG = gl.RG16F;     // Use RG16F instead of RG8
        ext.formatR = gl.R16F;       // Use R16F instead of R8
        ext.halfFloatTexType = gl.HALF_FLOAT;
        ext.supportLinearFiltering = true;
    } else {
        const textureFloat = gl.getExtension('OES_texture_float');
        const textureHalfFloat = gl.getExtension('OES_texture_half_float');
        
        if (textureHalfFloat) {
            ext.halfFloatTexType = textureHalfFloat.HALF_FLOAT_OES;
            ext.supportLinearFiltering = !!gl.getExtension('OES_texture_half_float_linear');
        } else if (textureFloat) {
            ext.halfFloatTexType = gl.FLOAT;
            ext.supportLinearFiltering = !!gl.getExtension('OES_texture_float_linear');
        }
        
        // For WebGL1, we must use RGBA for all formats
        ext.formatRGBA = gl.RGBA;
        ext.formatRG = gl.RGBA;
        ext.formatR = gl.RGBA;
    }
    
    console.log('WebGL Context:', isWebGL2 ? 'WebGL2' : 'WebGL1');
    console.log('Texture formats:', ext.formatRGBA, ext.formatRG, ext.formatR);
    console.log('Half float type:', ext.halfFloatTexType);
    console.log('Linear filtering support:', ext.supportLinearFiltering);
    
    // Basic setup
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    
    return { gl, ext, isWebGL2 };
}

// Compile shader
function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
        console.error('Shader source:', source);
        gl.deleteShader(shader);
        return null;
    }
    
    console.log(`Successfully compiled ${type === gl.VERTEX_SHADER ? 'vertex' : 'fragment'} shader`);
    return shader;
}

// Create program from shaders
function createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program linking error:', gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    
    // Extract uniforms
    const uniforms = {};
    const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    
    console.log(`Program linked successfully with ${uniformCount} uniforms`);
    for (let i = 0; i < uniformCount; i++) {
        const uniformInfo = gl.getActiveUniform(program, i);
        uniforms[uniformInfo.name] = gl.getUniformLocation(program, uniformInfo.name);
        console.log(`  Uniform ${i}: ${uniformInfo.name}`);
    }
    
    // Extract attributes
    const attribCount = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
    console.log(`Program has ${attribCount} active attributes`);
    for (let i = 0; i < attribCount; i++) {
        const attribInfo = gl.getActiveAttrib(program, i);
        const location = gl.getAttribLocation(program, attribInfo.name);
        console.log(`  Attribute ${i}: ${attribInfo.name} at location ${location}`);
    }
    
    return {
        program,
        uniforms,
        bind() {
            gl.useProgram(program);
        }
    };
}

// Get appropriate resolution based on device capabilities
function getResolution(gl, resolution) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;
    
    let max = Math.round(resolution * aspectRatio);
    let min = Math.round(resolution);
    
    if (gl.drawingBufferWidth > gl.drawingBufferHeight) {
        return { width: max, height: min };
    } else {
        return { width: min, height: max };
    }
}

// Create a framebuffer object
function createFBO(gl, w, h, format, type, filter) {
    const texture = gl.createTexture();
    
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    // Handle format differences between WebGL 1 and 2
    const isWebGL2 = gl instanceof WebGL2RenderingContext;
    
    try {
        if (isWebGL2) {
            // For WebGL2, handle different internal formats properly
            const textureFormat = getTextureFormat(gl, format);
            console.log(`Creating texture: format=${format}, textureFormat=${textureFormat}, type=${type}, size=${w}x${h}`);
            gl.texImage2D(gl.TEXTURE_2D, 0, format, w, h, 0, textureFormat, type, null);
        } else {
            // For WebGL1, we can only use gl.RGBA as the internal format
            console.log(`Creating WebGL1 texture: format=RGBA, size=${w}x${h}`);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, type, null);
        }
    } catch (e) {
        console.error('Error creating texture:', e);
        // Try fallback to RGBA8 if floating-point fails
        if (isWebGL2 && (format === gl.RGBA16F || format === gl.RG16F || format === gl.R16F)) {
            console.log('Trying fallback to 8-bit format');
            const fallbackFormat = format === gl.RGBA16F ? gl.RGBA8 : 
                                  format === gl.RG16F ? gl.RG8 : gl.R8;
            const textureFormat = getTextureFormat(gl, fallbackFormat);
            try {
                gl.texImage2D(gl.TEXTURE_2D, 0, fallbackFormat, w, h, 0, textureFormat, gl.UNSIGNED_BYTE, null);
                console.log('Fallback successful');
            } catch (e2) {
                console.error('Fallback also failed:', e2);
                console.log('Trying basic RGBA format as last resort');
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            }
        }
    }
    
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    
    // Check framebuffer status
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
        console.error('Framebuffer is not complete:', status);
        console.error('Format:', format, 'Size:', w, 'x', h);
        
        // Translate the error code to a readable message
        let errorMessage = 'Unknown error';
        switch (status) {
            case gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
                errorMessage = 'INCOMPLETE_ATTACHMENT';
                break;
            case gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
                errorMessage = 'INCOMPLETE_MISSING_ATTACHMENT';
                break;
            case gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
                errorMessage = 'INCOMPLETE_DIMENSIONS';
                break;
            case gl.FRAMEBUFFER_UNSUPPORTED:
                errorMessage = 'UNSUPPORTED';
                break;
        }
        console.error('Error details:', errorMessage);
        
        // Try one more fallback for framebuffer creation
        gl.deleteFramebuffer(fbo);
        gl.deleteTexture(texture);
        
        // Try with RGBA format and UNSIGNED_BYTE
        console.log('Trying emergency fallback with RGBA/UNSIGNED_BYTE');
        const emergencyTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, emergencyTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        
        const emergencyFbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, emergencyFbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, emergencyTexture, 0);
        
        const emergencyStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (emergencyStatus === gl.FRAMEBUFFER_COMPLETE) {
            console.log('Emergency fallback successful');
            const texelSizeX = 1.0 / w;
            const texelSizeY = 1.0 / h;
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            return {
                texture: emergencyTexture,
                fbo: emergencyFbo,
                width: w,
                height: h,
                texelSizeX,
                texelSizeY,
                attach(id) {
                    gl.activeTexture(gl.TEXTURE0 + id);
                    gl.bindTexture(gl.TEXTURE_2D, emergencyTexture);
                    return id;
                }
            };
        } else {
            console.error('Emergency fallback also failed');
        }
    }
    
    const texelSizeX = 1.0 / w;
    const texelSizeY = 1.0 / h;
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    return {
        texture,
        fbo,
        width: w,
        height: h,
        texelSizeX,
        texelSizeY,
        attach(id) {
            gl.activeTexture(gl.TEXTURE0 + id);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            return id;
        }
    };
}

// Helper function to get the correct texture format
function getTextureFormat(gl, internalFormat) {
    // Map internal formats to corresponding texture formats
    if (gl instanceof WebGL2RenderingContext) {
        switch (internalFormat) {
            // Basic formats (8-bit)
            case gl.R8:
                return gl.RED;
            case gl.RG8:
                return gl.RG;
            case gl.RGBA8:
                return gl.RGBA;
                
            // Float formats (16-bit)
            case gl.R16F:
                return gl.RED;
            case gl.RG16F:
                return gl.RG;
            case gl.RGBA16F:
                return gl.RGBA;
                
            // Float formats (32-bit)
            case gl.R32F:
                return gl.RED;
            case gl.RG32F:
                return gl.RG;
            case gl.RGBA32F:
                return gl.RGBA;
                
            default:
                return gl.RGBA;
        }
    } else {
        // WebGL 1 only supports RGBA
        return gl.RGBA;
    }
}

// Create a double framebuffer (for ping-pong rendering)
function createDoubleFBO(gl, w, h, format, type, filter) {
    let fbo1 = createFBO(gl, w, h, format, type, filter);
    let fbo2 = createFBO(gl, w, h, format, type, filter);
    
    return {
        read: fbo1,
        write: fbo2,
        width: w,
        height: h,
        texelSizeX: fbo1.texelSizeX,
        texelSizeY: fbo1.texelSizeY,
        swap() {
            const temp = this.read;
            this.read = this.write;
            this.write = temp;
        }
    };
}

// Blit a framebuffer (render to target framebuffer)
function blit(gl, target, vertexArray, vaoExt) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    
    // Ensure vertex array is properly bound for WebGL2 or WebGL1 with extension
    if (gl instanceof WebGL2RenderingContext && vertexArray) {
        gl.bindVertexArray(vertexArray);
    } else if (vaoExt && vertexArray) {
        vaoExt.bindVertexArrayOES(vertexArray);
    }
    
    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

// Generate a random color for fluid splats
function generateColor() {
    const r = Math.random() * 0.5 + 0.5;
    const g = Math.random() * 0.5 + 0.5;
    const b = Math.random() * 0.5 + 0.5;
    return { r, g, b };
}

// Helper functions for fluid dynamics
function correctRadius(gl, radius) {
    const aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    return radius * aspectRatio;
}

function correctDeltaX(gl, delta) {
    const aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    return aspectRatio * delta;
}

function correctDeltaY(delta) {
    return delta;
} 
