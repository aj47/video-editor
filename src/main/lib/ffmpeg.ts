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

        output.split('\n').forEach(line => {
          if (line.includes('silence_start')) {
            const time = parseFloat(line.split('silence_start: ')[1].split(' ')[0]);
            currentStart = time;
            log.debug(`[detectSilence] Found silence start at ${time}s`);
          } else if (line.includes('silence_end') && currentStart !== null) {
            const time = parseFloat(line.split('silence_end: ')[1].split(' ')[0]);
            if (time > currentStart) {
              silenceRanges.push([currentStart, time]);
              log.debug(`[detectSilence] Found silence end at ${time}s`);
            }
            currentStart = null;
          }
        });

        // Sort and filter silence ranges
        silenceRanges.sort((a, b) => a[0] - b[0]);
        const filteredRanges = silenceRanges.filter(([start, end], i) => {
          // Skip short silence gaps between non-silence regions
          if (i > 0 && i < silenceRanges.length - 1) {
            const prevEnd = silenceRanges[i-1][1];
            const nextStart = silenceRanges[i+1][0];
            const silenceDuration = end - start;
            if (silenceDuration < 0.5) { // min_silence_gap
              log.debug(`[detectSilence] Removing short silence gap: ${start}s - ${end}s`);
              return false;
            }
          }
          return true;
        });

        // Create blocks with buffers
        const blocks: Array<{ start: number; end: number }> = [];
        let currentPos = 0.0;

        filteredRanges.forEach(([silenceStart, silenceEnd]) => {
          // Add non-silence block before silence if there's a gap
          if (currentPos < silenceStart) {
            const nonSilenceStart = Math.max(0, currentPos - nonSilenceBuffer);
            const nonSilenceEnd = Math.min(duration, silenceStart + nonSilenceBuffer);
            
            if (nonSilenceEnd - nonSilenceStart >= 0.5) { // min_non_silence_duration
              blocks.push({ start: nonSilenceStart, end: nonSilenceEnd });
              log.debug(`[detectSilence] Created non-silence block: ${nonSilenceStart}s - ${nonSilenceEnd}s`);
            }
          }

          // Add silence block
          blocks.push({ start: silenceStart, end: silenceEnd });
          log.debug(`[detectSilence] Created silence block: ${silenceStart}s - ${silenceEnd}s`);
          currentPos = silenceEnd;
        });

        // Add final non-silence block if needed
        if (currentPos < duration) {
          const finalStart = Math.max(0, currentPos - nonSilenceBuffer);
          const finalEnd = duration;
          
          if (finalEnd - finalStart >= 0.5) { // min_non_silence_duration
            blocks.push({ start: finalStart, end: finalEnd });
            log.debug(`[detectSilence] Created final non-silence block: ${finalStart}s - ${finalEnd}s`);
          }
        }

        // Validate and fill gaps
        const validatedBlocks: Array<{ start: number; end: number }> = [];
        blocks.forEach((block, i) => {
          if (i > 0) {
            const prevBlock = validatedBlocks[validatedBlocks.length - 1];
            if (block.start < prevBlock.end) {
              // Adjust overlapping blocks
              block.start = prevBlock.end;
            } else if (block.start - prevBlock.end > 2.0) { // max_gap_to_bridge
              // Add silence block to fill large gaps
              validatedBlocks.push({ 
                start: prevBlock.end, 
                end: block.start 
              });
            }
          }
          validatedBlocks.push(block);
        });

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
