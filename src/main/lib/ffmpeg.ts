import log from 'electron-log';
import ffmpeg from 'fluent-ffmpeg';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

import { ConvertOption, InspectData } from '@shared/types';
import { isProduction } from '@shared/util';

const getFfmpegPath = (binaryType: 'ffmpeg' | 'ffprobe') => {
  const platform = os.platform() === 'darwin' ? 'mac' : 'win';
  const arch = os.arch();

  const binaryPath = `node_modules/${binaryType}-static-electron/bin/${platform}/${arch}/${binaryType}`;

  return isProduction
    ? path.join(process.resourcesPath, binaryPath)
    : binaryPath;
};

ffmpeg.setFfmpegPath(getFfmpegPath('ffmpeg'));
ffmpeg.setFfprobePath(getFfmpegPath('ffprobe'));

const ffprobeAsync = promisify<string, ffmpeg.FfprobeData>(ffmpeg.ffprobe);

export const inspectFile = async (
  filePath: string
): Promise<InspectData | undefined> => {
  log.info(`Inspecting file: ${filePath}`);

  const data = await ffprobeAsync(filePath).catch((err) => {
    log.error(err);
    return undefined;
  });

  log.debug(data);

  const videoStream = data?.streams.find(
    (stream) => stream.codec_type === 'video'
  );
  if (data === undefined || videoStream === undefined) {
    log.error('Input file is not a video');
    return undefined;
  }

  const fps = (() => {
    const formula = videoStream.avg_frame_rate || '';
    const match = formula.match(/^(\d+)\/(\d+)$/);
    if (!match) return NaN;

    const [, numer, denom] = match;
    return parseInt(numer, 10) / parseInt(denom, 10);
  })();

  if (Number.isNaN(fps)) return undefined;

  return {
    size: data.format.size || 0,
    codec: videoStream.codec_name || '',
    width: videoStream.width || 0,
    height: videoStream.height || 0,
    fps,
  };
};

export const detectSilence = async (
  filePath: string,
  silenceThreshold = -40,
  minSilenceDuration = 0.1,
  nonSilenceBuffer = 0.3
): Promise<Array<{ start: number; end: number }>> => {
  log.info(`[detectSilence] Starting detection for: ${filePath}`);
  return new Promise((resolve, reject) => {
    let output = '';
    const command = ffmpeg(filePath)
      .audioFilters(`silencedetect=noise=${silenceThreshold}dB:d=${minSilenceDuration}`)
      .format('null')
      .output('-');

    command.on('stderr', (errLine) => {
      log.debug(`[detectSilence] ffmpeg stderr: ${errLine}`);
      output += errLine;
    });

    command.on('end', async () => {
      try {
        log.info('[detectSilence] ffmpeg command completed');
        
        // Get video duration
        const data = await ffprobeAsync(filePath);
        const duration = data.format.duration || 0;
        log.info(`[detectSilence] Video duration: ${duration}s`);

        // Parse silence ranges
        const silenceRanges: Array<[number, number]> = [];
        let currentStart: number | null = null;

        // Buffer for accumulating multi-line output
        let buffer = '';
        
        // Process each line directly
        output.split('\n').forEach(rawLine => {
          const line = rawLine.trim();
          if (!line) return;

          log.debug(`[detectSilence] Processing line: ${line}`);
          
          // Improved regex patterns to capture decimal values more accurately
          const silenceStartMatch = line.match(/silence_start:\s*([\d.]+)/);
          const silenceEndMatch = line.match(/silence_end:\s*([\d.]+)/);

          if (silenceStartMatch) {
            currentStart = parseFloat(silenceStartMatch[1]);
            log.debug(`[detectSilence] Found silence_start at ${currentStart}s`);
          } else if (silenceEndMatch && currentStart !== null) {
            const endTime = parseFloat(silenceEndMatch[1]);
            if (endTime > currentStart) {
              silenceRanges.push([currentStart, endTime]);
              log.debug(`[detectSilence] Found silence_end at ${endTime}s (duration: ${endTime - currentStart}s)`);
              currentStart = null;  // Reset only after successful pair
            } else {
              log.debug(`[detectSilence] Discarding invalid silence range ${currentStart}-${endTime}s`);
              currentStart = null;
            }
          }
        });

        // Sort and process all detected silences
        silenceRanges.sort((a, b) => a[0] - b[0]);
        const filteredRanges = silenceRanges;
        log.info(`[detectSilence] Found ${silenceRanges.length} raw silence ranges`);
        log.debug(`[detectSilence] Raw silence ranges:\n${JSON.stringify(filteredRanges, null, 2)}`);

        // Create blocks array with proper buffer handling
        const blocks: Array<{ start: number; end: number }> = [];
        let currentPos = 0.0;
        // Use parameters instead of hardcoded values
        const minNonSilenceDuration = 0.3;
        const maxGapToBridge = 1.0;
        
        log.debug(`[detectSilence] Using buffer settings - nonSilenceBuffer: ${nonSilenceBuffer}s, minNonSilenceDuration: ${minNonSilenceDuration}s, maxGapToBridge: ${maxGapToBridge}s`);

        // Process all silence ranges to find non-silence segments
        let lastEnd = 0;
        for (const [silenceStart, silenceEnd] of filteredRanges) {
          // Calculate non-silence segment before this silence
          const segmentStart = Math.max(lastEnd, 0);
          const segmentEnd = silenceStart;
          
          // Apply buffer to create usable blocks
          const bufferedStart = Math.max(0, segmentStart - nonSilenceBuffer);
          const bufferedEnd = Math.min(duration, segmentEnd + nonSilenceBuffer);
          
          // Only create block if duration meets minimum
          if (bufferedEnd - bufferedStart >= minNonSilenceDuration) {
            blocks.push({ 
              start: bufferedStart, 
              end: bufferedEnd,
              isSilence: false
            });
            log.debug(`[detectSilence] Created non-silence block: ${bufferedStart}s - ${bufferedEnd}s`);
          }
          
          lastEnd = silenceEnd;
        }

        // Handle final segment after last silence
        if (lastEnd < duration) {
          const bufferedStart = Math.max(0, lastEnd - nonSilenceBuffer);
          const bufferedEnd = duration;
          
          if (bufferedEnd - bufferedStart >= minNonSilenceDuration) {
            blocks.push({
              start: bufferedStart,
              end: bufferedEnd,
              isSilence: false
            });
            log.debug(`[detectSilence] Created final non-silence block: ${bufferedStart}s - ${bufferedEnd}s`);
          }
        }

        // Handle final non-silence segment
        if (currentPos < duration) {
          const finalStart = currentPos;
          const bufferedEnd = Math.min(duration, finalStart + nonSilenceBuffer);
          
          if (bufferedEnd - finalStart >= minNonSilenceDuration) {
            blocks.push({ start: finalStart, end: duration });
            log.debug(`[detectSilence] Created final non-silence block: ${finalStart}s - ${duration}s`);
          } else {
            log.debug(`[detectSilence] Extending previous block to cover final segment`);
            if (blocks.length > 0) {
              blocks[blocks.length - 1].end = duration;
            }
          }
        }

        // Merge adjacent or overlapping blocks
        const mergedBlocks: Array<{ start: number; end: number }> = [];
        
        for (const block of blocks) {
          if (mergedBlocks.length === 0) {
            mergedBlocks.push({...block});
            continue;
          }

          const lastBlock = mergedBlocks[mergedBlocks.length - 1];
          
          // Check if we should merge with previous block
          if (block.start <= lastBlock.end + maxGapToBridge) {
            // Extend the previous block
            lastBlock.end = Math.max(lastBlock.end, block.end);
            log.debug(`[detectSilence] Merged block with previous, new range: ${lastBlock.start}s-${lastBlock.end}s`);
          } else {
            // Add as new block
            mergedBlocks.push({...block});
            log.debug(`[detectSilence] Added new block: ${block.start}s-${block.end}s`);
          }
        }
        log.debug('[detectSilence] Blocks after gap bridging:', JSON.stringify(mergedBlocks));

        // Handle case where video starts with silence
        if (blocks.length === 0) {
          log.debug('[detectSilence] No silence detected, creating full-length block');
          blocks.push({ start: 0, end: duration });
        } else if (blocks[0].start > 0) {
          log.debug('[detectSilence] Adding initial non-silence block');
          blocks.unshift({ start: 0, end: blocks[0].start });
        }

        // Validate and fill gaps
        const validatedBlocks: Array<{ start: number; end: number }> = [];
        log.debug('[detectSilence] Starting validation of merged blocks');
        
        blocks.forEach((block, i) => {
          if (i > 0) {
            const prevBlock = validatedBlocks[validatedBlocks.length - 1];
            log.debug(`[detectSilence] Checking block ${i}: ${block.start}s-${block.end}s against previous ${prevBlock.start}s-${prevBlock.end}s`);

            if (block.start < prevBlock.end) {
              log.debug(`[detectSilence] Adjusting overlap by moving block start from ${block.start}s to ${prevBlock.end}s`);
              block.start = prevBlock.end;
            } else if (block.start - prevBlock.end > maxGapToBridge) {
              log.debug(`[detectSilence] Adding silence block to fill large gap (${block.start - prevBlock.end}s)`);
              validatedBlocks.push({ 
                start: prevBlock.end, 
                end: block.start 
              });
            }
          }
          validatedBlocks.push(block);
        });
        
        log.debug('[detectSilence] Final validated blocks:', JSON.stringify(validatedBlocks));

        // Format result with labels and colors
        const resultBlocks = validatedBlocks.map((b, i) => ({
          start: b.start,
          end: b.end,
          active: i === 0,
          label: `Segment ${i + 1}`,
          color: '#4CAF50'
        }));

        log.info(`[detectSilence] Generated ${resultBlocks.length} video blocks`);
        resolve(resultBlocks);
      } catch (err) {
        log.error('[detectSilence] Error processing results:', err);
        reject(err);
      }
    });

    command.on('error', err => {
      log.error('[detectSilence] ffmpeg command error:', err);
      reject(err);
    });

    command.run();
  });
};

export const convert = (filePath: string, option: ConvertOption, segments: Array<{ start: number; end: number }>) => {
  const command = ffmpeg()
    .input(filePath)
    .inputOptions(segments.flatMap(({ start, end }) => [
      '-ss', `${Math.max(0, start - 0.1)}`,
      '-to', `${end + 0.1}`,
      '-c copy',
      '-avoid_negative_ts make_zero'
    ]))
    .format('gif')
    .withNoAudio()
    .output(option.outputPath);

  if (option.startTime) {
    command.inputOptions([`-ss ${option.startTime}`]);
  }
  if (option.endTime && (option.startTime || 0) < option.endTime) {
    command.outputOptions([`-t ${option.endTime - (option.startTime || 0)}`]);
  }

  option.fps && command.videoFilters(`fps=${option.fps}`);

  if (option.width || option.height) {
    command.videoFilters(
      `scale=w=${option.width || -1}:h=${option.height || -1}`
    );
  }

  if (
    option.crop.x !== 0 ||
    option.crop.y !== 0 ||
    option.crop.width !== 100 ||
    option.crop.height !== 100
  ) {
    const width = `in_w*(${option.crop.width}/100)`;
    const height = `in_h*(${option.crop.height}/100)`;
    const x = `in_w*(${option.crop.x}/100)`;
    const y = `in_h*(${option.crop.y}/100)`;

    const crop = `crop=${width}:${height}:${x}:${y}`;

    command.videoFilters(crop);
  }

  option.palette &&
    command
      .videoFilters('split[a]')
      .videoFilters('palettegen')
      .videoFilters('[a]paletteuse');

  return command;
};
