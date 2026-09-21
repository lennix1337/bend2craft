import assert from "node:assert/strict";
import { createAudioMixer } from "../web/audio.js";

class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = "running";
    this.destination = {};
    this.oscillators = [];
  }
  createGain() {
    return {
      gain: {
        value: 0,
        setValueAtTime() {},
        exponentialRampToValueAtTime() {},
      },
      connect() {},
    };
  }
  createOscillator() {
    const oscillator = {
      type: "",
      frequency: { setValueAtTime() {} },
      connect() {},
      start() {},
      stop() {},
    };
    this.oscillators.push(oscillator);
    return oscillator;
  }
  resume() {}
  close() {}
}

const mixer = createAudioMixer({ AudioContextCtor: FakeAudioContext });
assert.equal(mixer.ensure(), true);
assert.equal(mixer.play("click"), true);
assert.equal(mixer.play("click"), false, "rapid duplicate sounds should be throttled");
mixer.destroy();
console.log("audio mixer ok");
