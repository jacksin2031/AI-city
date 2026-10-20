// Exact driver diagnostic observed on the headless CI runner; never a CSP or JS exception.
export function isKnownCiDriverWarning(type: string, text: string, ci: boolean) {
  return (
    ci &&
    type === "warning" &&
    /^\[\.WebGL-0x[0-9a-f]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels(?: \(this message will no longer repeat\))?$/.test(
      text,
    )
  );
}
