/**
 * AudioWorkletProcessor to capture raw PCM audio from the microphone
 * and send it to the main thread in chunks.
 * Gemini Live API expects 16kHz, 16-bit PCM audio.
 */
class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const channelData = input[0];
      
      for (let i = 0; i < channelData.length; i++) {
        this.buffer[this.bufferIndex++] = channelData[i];
        
        if (this.bufferIndex >= this.bufferSize) {
          // Convert Float32 [-1.0, 1.0] to Int16 [-32768, 32767] for Gemini
          const int16Buffer = new Int16Array(this.bufferSize);
          for (let j = 0; j < this.bufferSize; j++) {
            let s = Math.max(-1, Math.min(1, this.buffer[j]));
            int16Buffer[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          
          this.port.postMessage(int16Buffer.buffer, [int16Buffer.buffer]);
          this.bufferIndex = 0;
          this.buffer = new Float32Array(this.bufferSize);
        }
      }
    }
    return true;
  }
}

registerProcessor('pcm-processor', PcmProcessor);
class DownsamplingPcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Default WebAudio might be 48kHz, Gemini needs exactly 16kHz.
    // 48000 / 16000 = ratio of 3. We'll simply drop samples.
    this.bufferSize = 2048;
    this.buffer = new Int16Array(this.bufferSize);
    this.bufferIndex = 0;
    this.sampleCount = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      const sampleRateRatio = Math.round(sampleRate / 16000); 

      for (let i = 0; i < channelData.length; i++) {
        // Downsample by keeping only every Nth sample
        if (this.sampleCount++ % sampleRateRatio === 0) {
          let s = Math.max(-1, Math.min(1, channelData[i]));
          this.buffer[this.bufferIndex++] = s < 0 ? s * 0x8000 : s * 0x7FFF;

          if (this.bufferIndex >= this.bufferSize) {
            // Buffer full, send to main thread
            const outBuffer = new Int16Array(this.buffer);
            this.port.postMessage(outBuffer.buffer, [outBuffer.buffer]);
            this.bufferIndex = 0;
          }
        }
      }
    }
    return true;
  }
}
registerProcessor('downsampling-pcm-processor', DownsamplingPcmProcessor);
