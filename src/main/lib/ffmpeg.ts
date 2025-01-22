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
        
        // Process each chunk while handling multi-line outputs
        output.split('\n').forEach(chunk => {
          buffer += chunk;
          
          while (buffer.length > 0) {
            const lineEnd = buffer.indexOf('\n');
            if (lineEnd === -1) break;
            
            const line = buffer.slice(0, lineEnd).trim();
            buffer = buffer.slice(lineEnd + 1);

            log.debug(`[detectSilence] Processing line: ${line}`);
            
            const silenceStartMatch = line.match(/silence_start: (\d+\.?\d*)/);
            const silenceEndMatch = line.match(/silence_end: (\d+\.?\d*)/);

            if (silenceStartMatch) {
              currentStart = parseFloat(silenceStartMatch[1]);
              log.debug(`[detectSilence] Found silence_start at ${currentStart}s`);
            } else if (silenceEndMatch && currentStart !== null) {
              const endTime = parseFloat(silenceEndMatch[1]);
              if (endTime > currentStart) {
                silenceRanges.push([currentStart, endTime]);
                log.debug(`[detectSilence] Found silence_end at ${endTime}s (duration: ${endTime - currentStart}s)`);
              } else {
                log.debug(`[detectSilence] Discarding invalid silence range ${currentStart}-${endTime}s`);
              }
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

        // Process all silence ranges
        for (const [silenceStart, silenceEnd] of filteredRanges) {
          // Add non-silence block before silence if there's a gap
          if (currentPos < silenceStart) {
            const blockStart = currentPos;
            const blockEnd = silenceStart;
            
            // Apply buffer and check minimum duration
            const bufferedStart = Math.max(0, blockStart - nonSilenceBuffer);
            const bufferedEnd = Math.min(duration, blockEnd + nonSilenceBuffer);
            
            // Only create block if duration meets minimum
            if (bufferedEnd - bufferedStart >= minNonSilenceDuration) {
              blocks.push({ start: bufferedStart, end: bufferedEnd });
              log.debug(`[detectSilence] Created buffered non-silence block: ${bufferedStart}s - ${bufferedEnd}s`);
            } else {
              log.debug(`[detectSilence] Skipping short non-silence block: ${blockStart}s - ${blockEnd}s`);
            }
          }

          // Add silence block with buffer check
          if (silenceEnd - silenceStart >= 0.1) { // Minimum silence duration
            blocks.push({ start: silenceStart, end: silenceEnd });
            log.debug(`[detectSilence] Created silence block: ${silenceStart}s - ${silenceEnd}s`);
            currentPos = silenceEnd;
          } else {
            log.debug(`[detectSilence] Skipping short silence: ${silenceStart}s - ${silenceEnd}s`);
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

        // Fill small gaps between blocks
        const mergedBlocks: Array<{ start: number; end: number }> = [];
        log.debug('[detectSilence] Initial blocks before gap bridging:', JSON.stringify(blocks));
        
        for (const block of blocks) {
          if (mergedBlocks.length === 0) {
            mergedBlocks.push(block);
            log.debug(`[detectSilence] Added initial block: ${block.start}s-${block.end}s`);
            continue;
          }

          const lastBlock = mergedBlocks[mergedBlocks.length - 1];
          const gap = block.start - lastBlock.end;
          log.debug(`[detectSilence] Checking gap between ${lastBlock.end}s and ${block.start}s (${gap}s)`);

          if (gap > 0 && gap <= maxGapToBridge) {
            // Only bridge gaps between non-silence blocks
            if (lastBlock.end === blocks[blocks.indexOf(lastBlock)]?.end) { // Check if last block was non-silence
              log.debug(`[detectSilence] Bridging gap of ${gap}s (max allowed: ${maxGapToBridge}s)`);
              lastBlock.end = block.start;
            } else {
              log.debug(`[detectSilence] Not bridging gap - previous block is silence`);
            }
          } else if (gap > maxGapToBridge) {
            log.debug(`[detectSilence] Gap exceeds bridge threshold (${gap}s > ${maxGapToBridge}s)`);
          }

          log.debug(`[detectSilence] Adding block: ${block.start}s-${block.end}s`);
          mergedBlocks.push(block);
        }
        log.debug('[detectSilence] Blocks after gap bridging:', JSON.stringify(mergedBlocks));

        // If no blocks were created, create a single block for the entire duration
        if (blocks.length === 0) {
          blocks.push({ start: 0, end: duration });
          log.debug(`[detectSilence] Created single block for entire duration: 0s - ${duration}s`);
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
