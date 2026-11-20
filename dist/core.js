import {speechSignal} from './speech-core.js?v=0.5.2';
export function splitForApi(text, maxBytes = 480) {
  const encoder = new TextEncoder(); const chunks = []; let current = '';
  for (const char of text) { if (encoder.encode(current + char).length > maxBytes) { chunks.push(current); current = ''; } current += char; }
  if (current) chunks.push(current); return chunks;
}
export function stamp(seconds, srt = false) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor(ms / 60000) % 60).padStart(2, '0');
  const s = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
  return srt ? `${h}:${m}:${s},${String(ms % 1000).padStart(3, '0')}` : (h === '00' ? `${m}:${s}` : `${h}:${m}:${s}`);
}
export function toSrt(rows) { return rows.filter(r => r.original).map((r, i) => `${i + 1}\n${stamp(r.start, true)} --> ${stamp(Math.max(r.end, r.start + 1), true)}\n${r.original}\n${r.translation || '[译文未完成]'}\n`).join('\n'); }
export function resample(input, rate, target = 16000) {
  if (rate === target) return input;
  const output = new Float32Array(Math.floor(input.length * target / rate)); const ratio = rate / target;
  for (let i = 0; i < output.length; i++) { const x = i * ratio; const j = Math.floor(x); const f = x - j; output[i] = input[j] * (1 - f) + (input[Math.min(j + 1, input.length - 1)] || 0) * f; }
  return output;
}
export class Segmenter {
  constructor(onSegment, rate = 16000, options = {}) { this.emit = onSegment; this.rate = rate; this.maxSeconds = options.maxSeconds ?? 8; this.pauseSeconds = options.pauseSeconds ?? .7; this.minSeconds = options.minSeconds ?? 1.2; this.reset(); this.position = 0; }
  reset() { this.parts = []; this.length = 0; this.quiet = 0; this.voiced = 0; this.pre = []; }
  push(samples) {
    let energy = 0; for (const x of samples) energy += x * x;
    const rms = Math.sqrt(energy / samples.length); const voice = speechSignal(samples,this.rate).voicedSeconds >= Math.min(.04,samples.length/this.rate*.5);
    if (voice && !this.length) { this.start = Math.max(0, this.position - this.pre.reduce((n, x) => n + x.length, 0)); this.parts.push(...this.pre); this.length = this.pre.reduce((n, x) => n + x.length, 0); this.pre = []; }
    if (this.length || voice) { this.parts.push(samples); this.length += samples.length; if (voice) { this.voiced += samples.length; this.quiet = 0; } else this.quiet += samples.length; }
    else { this.pre.push(samples); while (this.pre.reduce((n, x) => n + x.length, 0) > this.rate * .3) this.pre.shift(); }
    this.position += samples.length;
    if (this.length >= this.rate * this.maxSeconds || (this.length >= this.rate * this.minSeconds && this.quiet >= this.rate * this.pauseSeconds)) this.flush();
    return rms;
  }
  flush() { let segment; if (this.voiced >= this.rate * .2) { const audio = new Float32Array(this.length); let offset = 0; for (const part of this.parts) { audio.set(part, offset); offset += part.length; } segment = { audio, start: this.start / this.rate, end: (this.start + this.length) / this.rate }; } this.reset(); if (segment) this.emit(segment); }
}
