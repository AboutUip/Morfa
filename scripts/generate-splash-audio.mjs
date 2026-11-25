import fs from "node:fs";
import path from "node:path";

const SAMPLE_RATE = 44_100;
const DURATION = 0.85;
const CHANNELS = 2;
const OUTPUT = path.resolve(
  "apps/web/public/audio/splash-metal.wav",
);

let seed = 0x1f2e3d4c;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0xffffffff;
}

function envelope(time, decay) {
  return Math.exp(-time / decay);
}

const partials = [
  { frequency: 196, gain: 0.42, decay: 0.36, pan: -0.12 },
  { frequency: 296, gain: 0.34, decay: 0.29, pan: 0.14 },
  { frequency: 449, gain: 0.27, decay: 0.23, pan: -0.2 },
  { frequency: 676, gain: 0.21, decay: 0.18, pan: 0.22 },
  { frequency: 1013, gain: 0.16, decay: 0.13, pan: -0.24 },
  { frequency: 1519, gain: 0.1, decay: 0.09, pan: 0.26 },
  { frequency: 2278, gain: 0.065, decay: 0.06, pan: -0.1 },
  { frequency: 3417, gain: 0.04, decay: 0.04, pan: 0.08 },
].map((partial) => ({
  ...partial,
  phase: random() * Math.PI * 2,
  detune: (random() - 0.5) * 0.006,
}));

const frames = Math.floor(SAMPLE_RATE * DURATION);
const samples = new Float32Array(frames * CHANNELS);
let peak = 0;

for (let index = 0; index < frames; index += 1) {
  const time = index / SAMPLE_RATE;

  // Crisp metallic attack: high-passed noise with a very fast decay.
  const noise = random() * 2 - 1;
  const previousNoise = random() * 2 - 1;
  const transient =
    (noise - previousNoise) * envelope(time, 0.012) * 0.55;

  // Low impact and a short hum body.
  const thump =
    Math.sin(2 * Math.PI * 74 * time) * envelope(time, 0.1) * 0.42;
  const body =
    Math.sin(2 * Math.PI * 112 * time + 0.7) *
    envelope(time, 0.22) *
    0.2;

  let left = transient * 0.7 + thump + body;
  let right = transient * 0.7 + thump + body;

  // Inharmonic partials give the hit its metallic character.
  for (const partial of partials) {
    const pitchDrop = 1 - 0.018 * Math.min(1, time / 0.22);
    const frequency =
      partial.frequency * (1 + partial.detune) * pitchDrop;
    const value =
      Math.sin(2 * Math.PI * frequency * time + partial.phase) *
      envelope(time, partial.decay) *
      partial.gain;

    const pan = partial.pan;
    left += value * (1 - Math.max(0, pan));
    right += value * (1 + Math.min(0, pan));
  }

  // Short early reflections, just enough to avoid a dry click.
  for (const reflection of [
    { delay: 0.019, gain: 0.12 },
    { delay: 0.037, gain: 0.08 },
    { delay: 0.061, gain: 0.05 },
  ]) {
    const delayed = time - reflection.delay;
    if (delayed < 0) continue;
    const value =
      Math.sin(2 * Math.PI * 296 * delayed) *
      envelope(delayed, 0.16) *
      reflection.gain;
    left += value;
    right += value * 0.92;
  }

  const fadeOut = Math.min(1, Math.max(0, (DURATION - time) / 0.08));
  left = Math.tanh(left * 1.15) * fadeOut;
  right = Math.tanh(right * 1.15) * fadeOut;

  samples[index * CHANNELS] = left;
  samples[index * CHANNELS + 1] = right;
  peak = Math.max(peak, Math.abs(left), Math.abs(right));
}

const normalization = peak > 0 ? 0.9 / peak : 1;
const dataSize = samples.length * 2;
const buffer = Buffer.alloc(44 + dataSize);

buffer.write("RIFF", 0, "ascii");
buffer.writeUInt32LE(36 + dataSize, 4);
buffer.write("WAVE", 8, "ascii");
buffer.write("fmt ", 12, "ascii");
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(CHANNELS, 22);
buffer.writeUInt32LE(SAMPLE_RATE, 24);
buffer.writeUInt32LE(SAMPLE_RATE * CHANNELS * 2, 28);
buffer.writeUInt16LE(CHANNELS * 2, 32);
buffer.writeUInt16LE(16, 34);
buffer.write("data", 36, "ascii");
buffer.writeUInt32LE(dataSize, 40);

for (let index = 0; index < samples.length; index += 1) {
  const value = Math.max(-1, Math.min(1, samples[index] * normalization));
  buffer.writeInt16LE(Math.round(value * 32767), 44 + index * 2);
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, buffer);
console.log(
  `wrote ${OUTPUT} (${(buffer.length / 1024).toFixed(1)} KiB)`,
);
