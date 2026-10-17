// 51a104..51a138 reset -> 53f560 event draw -> 35f174 voice seed draw.
import {secondaryFrequencySeed} from './excitation-frequency-variation.mjs';
import {nextExcitationRandom} from './final-excitation.mjs';
export class ExcitationManagerRandom {
  constructor({configurationSeed, eventBranch} = {}) {
    if (!Number.isInteger(configurationSeed) || configurationSeed < 0 || configurationSeed > 0xffffffff ||
        eventBranch !== 'velocity-randomization-enabled')
      throw new RangeError('Explicit unsigned configuration seed and verified event branch required');
    this.state = secondaryFrequencySeed((configurationSeed + 0x232a56) >>> 0);
    this.draws = 0; this.starts = 0;
  }
  nextVoice() {
    const velocityWord = nextExcitationRandom(this.state);
    const seedWord = nextExcitationRandom(this.state);
    this.draws += 2; this.starts++;
    return {velocityWord, seedWord, voiceState: secondaryFrequencySeed(seedWord),
      managerState: [...this.state], managerDraws: this.draws, ordinal: this.starts - 1};
  }
}
