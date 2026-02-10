/**
 * Vision Test Fixture Generator
 *
 * Renders each test scenario in a headless-like Three.js canvas,
 * captures the robot's first-person camera view, and packages
 * everything (images + prompts + expected results) into a zip file
 * for local testing.
 *
 * Uses a minimal browser-native zip builder (no external dependencies).
 */

// ═══════════════════════════════════════════════════════════════════════════
// MINIMAL ZIP BUILDER (browser-native, no dependencies)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Minimal zip file builder using raw binary construction.
 * Supports storing (no compression) UTF-8 text files and binary blobs.
 * Good enough for test fixtures — small file count, moderate sizes.
 */
class ZipBuilder {
  private files: { name: string; data: Uint8Array; }[] = [];

  /** Add a text file to the zip */
  addTextFile(name: string, content: string): void {
    const encoder = new TextEncoder();
    this.files.push({ name, data: encoder.encode(content) });
  }

  /** Add a binary file (e.g., PNG image from data URL) */
  addBinaryFile(name: string, data: Uint8Array): void {
    this.files.push({ name, data });
  }

  /** Add an image from a data URL (base64 encoded) */
  addImageFromDataUrl(name: string, dataUrl: string): void {
    // Strip the data URL prefix to get raw base64
    const base64 = dataUrl.split(',')[1];
    if (!base64) return;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    this.files.push({ name, data: bytes });
  }

  /** Build the zip file and return as Blob */
  build(): Blob {
    const localHeaders: Uint8Array[] = [];
    const centralHeaders: Uint8Array[] = [];
    let offset = 0;

    for (const file of this.files) {
      const nameBytes = new TextEncoder().encode(file.name);

      // Local file header (30 bytes + name + data)
      const local = new ArrayBuffer(30 + nameBytes.length);
      const lv = new DataView(local);
      lv.setUint32(0, 0x04034b50, true); // Local file header signature
      lv.setUint16(4, 20, true);         // Version needed to extract
      lv.setUint16(6, 0, true);          // General purpose bit flag
      lv.setUint16(8, 0, true);          // Compression method (store)
      lv.setUint16(10, 0, true);         // Last mod file time
      lv.setUint16(12, 0, true);         // Last mod file date
      lv.setUint32(14, this.crc32(file.data), true); // CRC-32
      lv.setUint32(18, file.data.length, true);      // Compressed size
      lv.setUint32(22, file.data.length, true);      // Uncompressed size
      lv.setUint16(26, nameBytes.length, true);      // File name length
      lv.setUint16(28, 0, true);                     // Extra field length
      new Uint8Array(local).set(nameBytes, 30);

      localHeaders.push(new Uint8Array(local));

      // Central directory header (46 bytes + name)
      const central = new ArrayBuffer(46 + nameBytes.length);
      const cv = new DataView(central);
      cv.setUint32(0, 0x02014b50, true); // Central dir signature
      cv.setUint16(4, 20, true);         // Version made by
      cv.setUint16(6, 20, true);         // Version needed
      cv.setUint16(8, 0, true);          // General purpose bit flag
      cv.setUint16(10, 0, true);         // Compression method
      cv.setUint16(12, 0, true);         // Last mod time
      cv.setUint16(14, 0, true);         // Last mod date
      cv.setUint32(16, this.crc32(file.data), true); // CRC-32
      cv.setUint32(20, file.data.length, true);      // Compressed size
      cv.setUint32(24, file.data.length, true);      // Uncompressed size
      cv.setUint16(28, nameBytes.length, true);      // File name length
      cv.setUint16(30, 0, true);         // Extra field length
      cv.setUint16(32, 0, true);         // File comment length
      cv.setUint16(34, 0, true);         // Disk number start
      cv.setUint16(36, 0, true);         // Internal file attributes
      cv.setUint32(38, 0, true);         // External file attributes
      cv.setUint32(42, offset, true);    // Relative offset of local header
      new Uint8Array(central).set(nameBytes, 46);

      centralHeaders.push(new Uint8Array(central));

      offset += 30 + nameBytes.length + file.data.length;
    }

    // End of central directory record
    const centralDirSize = centralHeaders.reduce((sum, h) => sum + h.length, 0);
    const endRecord = new ArrayBuffer(22);
    const ev = new DataView(endRecord);
    ev.setUint32(0, 0x06054b50, true);   // End of central dir signature
    ev.setUint16(4, 0, true);            // Number of this disk
    ev.setUint16(6, 0, true);            // Disk where central dir starts
    ev.setUint16(8, this.files.length, true);  // Entries on this disk
    ev.setUint16(10, this.files.length, true); // Total entries
    ev.setUint32(12, centralDirSize, true);    // Size of central directory
    ev.setUint32(16, offset, true);            // Offset of start of central dir
    ev.setUint16(20, 0, true);                 // Comment length

    // Assemble: local headers + data, central directory, end record
    const parts: (Uint8Array | ArrayBuffer)[] = [];
    for (let i = 0; i < this.files.length; i++) {
      parts.push(localHeaders[i]);
      parts.push(this.files[i].data);
    }
    for (const ch of centralHeaders) {
      parts.push(ch);
    }
    parts.push(new Uint8Array(endRecord));

    return new Blob(parts, { type: 'application/zip' });
  }

  /** CRC-32 calculation */
  private crc32(data: Uint8Array): number {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
      }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURE GENERATION
// ═══════════════════════════════════════════════════════════════════════════

export interface FixtureGenerationProgress {
  current: number;
  total: number;
  scenarioName: string;
  phase: 'rendering' | 'capturing' | 'packaging' | 'done';
}

/**
 * Build a zip file from captured scenario images + prompt/result text.
 *
 * @param captures - Array of { scenarioId, imageDataUrl, promptText, expectedResult }
 * @returns Blob of the zip file
 */
export function buildTestFixtureZip(
  captures: {
    scenarioId: number;
    scenarioName: string;
    imageDataUrl: string;
    promptText: string;
    expectedResult: string;
  }[]
): Blob {
  const zip = new ZipBuilder();

  // Add a README
  zip.addTextFile('vision-test-fixtures/README.txt',
    `Vision Test Fixtures - Generated ${new Date().toISOString()}
================================================================

These test fixtures validate the camera analysis prompts for robot navigation.
Each scenario contains:
  - prompt-X.txt    : The prompt context sent to the vision LLM
  - result-X.txt    : The expected JSON response structure
  - image-X.png     : The robot's first-person camera view for this scenario

Grid Reference:
  - Floor grid lines are spaced 0.5m apart
  - Thicker/darker lines appear every 1.0m
  - Origin axis lines are the darkest
  - Use grid squares to estimate distances (1 square = 0.5m)

Scenarios:
${captures.map(c => `  ${c.scenarioId}. ${c.scenarioName}`).join('\n')}

To run tests locally:
  1. Send image-X.png + prompt-X.txt to your vision LLM
  2. Compare the response structure against result-X.txt
  3. Validate that objects, distances, and directions are consistent
`);

  // Add each scenario
  for (const capture of captures) {
    const prefix = `vision-test-fixtures`;
    zip.addTextFile(`${prefix}/prompt-${capture.scenarioId}.txt`, capture.promptText);
    zip.addTextFile(`${prefix}/result-${capture.scenarioId}.txt`, capture.expectedResult);
    zip.addImageFromDataUrl(`${prefix}/image-${capture.scenarioId}.png`, capture.imageDataUrl);
  }

  return zip.build();
}

/**
 * Trigger a download of the zip blob in the browser.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
