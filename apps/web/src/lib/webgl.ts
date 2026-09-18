export function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }
  return shader;
}

export function createProgram(
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to create program");
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(gl);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${info}`);
  }
  return program;
}

export interface SphereBuffers {
  positions: Float32Array;
  seeds: Float32Array;
  tints: Float32Array;
  shells: Float32Array;
  count: number;
}

/**
 * Two concentric Fibonacci-distributed point shells: a dense outer shell
 * (surface particles) and a sparser, dimmer inner shell for volumetric depth.
 */
export function generateSphereBuffers(outerCount: number, innerCount: number): SphereBuffers {
  const count = outerCount + innerCount;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const tints = new Float32Array(count);
  const shells = new Float32Array(count);

  const fillShell = (start: number, n: number, shellValue: number) => {
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const idx = start + i;
      const y = 1 - (i / Math.max(n - 1, 1)) * 2;
      const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = goldenAngle * i;
      const x = Math.cos(theta) * radiusAtY;
      const z = Math.sin(theta) * radiusAtY;
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;
      seeds[idx] = Math.random();
      tints[idx] = Math.random();
      shells[idx] = shellValue;
    }
  };

  fillShell(0, outerCount, 0);
  fillShell(outerCount, innerCount, 1);

  return { positions, seeds, tints, shells, count };
}

/** Column-major mat3 combining a Y-axis rotation followed by an X-axis rotation. */
export function rotationMat3(pitchX: number, yawY: number): Float32Array {
  const cx = Math.cos(pitchX);
  const sx = Math.sin(pitchX);
  const cy = Math.cos(yawY);
  const sy = Math.sin(yawY);
  return new Float32Array([
    cy, 0, -sy,
    sy * sx, cx, cy * sx,
    sy * cx, -sx, cy * cx,
  ]);
}
