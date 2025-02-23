import path from 'path';

import { detectSilence } from '../../../src/main/lib/ffmpeg';

describe('detectSilence', () => {
  const testVideoPath = path.join(__dirname, 'assets', 'test.mp4');

  it('should detect silence periods in a video', async () => {
    const silenceRanges = await detectSilence(testVideoPath);
    expect(silenceRanges).toEqual([
      {
        start: 0,
        end: 4,
        active: true,
        label: 'Segment 1',
        color: '#4CAF50',
      },
    ]);
  });

  it('should handle videos with no silence', async () => {
    const silenceRanges = await detectSilence(testVideoPath, -100);
    expect(silenceRanges).toEqual([
      {
        start: 0,
        end: 4,
        active: true,
        label: 'Segment 1',
        color: '#4CAF50',
      },
    ]);
  });

  it('should respect the silence threshold', async () => {
    const strictRanges = await detectSilence(testVideoPath, -30);
    const lenientRanges = await detectSilence(testVideoPath, -50);
    expect(strictRanges.length).toBeGreaterThanOrEqual(lenientRanges.length);
  });

  it('should handle minimum silence duration', async () => {
    const shortRanges = await detectSilence(testVideoPath, -40, 0.1);
    const longRanges = await detectSilence(testVideoPath, -40, 1.0);
    expect(shortRanges.length).toBeGreaterThanOrEqual(longRanges.length);
  });

  it('should handle non-silence buffer', async () => {
    const smallBufferRanges = await detectSilence(testVideoPath, -40, 0.1, 0.1);
    const largeBufferRanges = await detectSilence(testVideoPath, -40, 0.1, 1.0);
    expect(smallBufferRanges.length).toBeGreaterThanOrEqual(
      largeBufferRanges.length
    );
  });

  it('should detect complex silence patterns', async () => {
    const complexTestVideoPath = path.join(
      __dirname,
      'assets',
      'complex_test.mp4'
    );
    const silenceRanges = await detectSilence(
      complexTestVideoPath,
      -40,
      0.1,
      0.1
    );

    expect(silenceRanges).toEqual([
      {
        start: 2.00002,
        end: 10,
        active: true,
        label: 'Segment 1',
        color: '#4CAF50',
      },
    ]);
  });
});
