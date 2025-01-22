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
  bufferBefore = 0.5,
  bufferAfter = 0.5
): Promise<Array<{ start: number; end: number }>> => {
  log.info(`[detectSilence] Starting silence detection for: ${filePath}`);
  return new Promise((resolve, reject) => {
    let output = ''
    log.info('[detectSilence] Setting up ffmpeg command with silencedetect filter');
    const command = ffmpeg(filePath)
      .audioFilters('silencedetect=noise=-40dB:d=0.1')
      .format('null')
      .output('-')

    command.on('stderr', (errLine) => {
      log.debug(`[detectSilence] ffmpeg stderr: ${errLine}`);
      output += errLine
    })

    command.on('end', async () => {
      log.info('[detectSilence] ffmpeg command completed');
      const blocks = [];
      const startTimes = [];
      const endTimes = [];
      
      // Get video duration using ffprobe
      const getVideoDuration = async (filePath: string) => {
        log.info(`[detectSilence] Getting video duration for: ${filePath}`);
        try {
          const data = await ffprobeAsync(filePath);
          log.info(`[detectSilence] Video duration: ${data.format.duration}`);
          return data.format.duration || 0;
        } catch (err) {
          log.error('[detectSilence] Error getting video duration:', err);
          throw err;
        }
      };
      
      const videoDuration = await getVideoDuration(filePath);
      log.info(`[detectSilence] Processing output for ${filePath}, duration: ${videoDuration}s`);
      
      const lines = output.split('\n');
      log.debug(`[detectSilence] Processing ${lines.length} lines of ffmpeg output`);
      
      lines.forEach(line => {
        const startMatch = line.match(/silence_start: (\d+\.\d+)/);
        const endMatch = line.match(/silence_end: (\d+\.\d+)/);
        
        if (startMatch) {
          const time = parseFloat(startMatch[1]);
          log.debug(`[detectSilence] Found silence_start at ${time}s`);
          startTimes.push(time);
        }
        if (endMatch) {
          const time = parseFloat(endMatch[1]);
          log.debug(`[detectSilence] Found silence_end at ${time}s`);
          endTimes.push(time);
        }
      });
      
      log.info(`[detectSilence] Found ${startTimes.length} silence starts and ${endTimes.length} silence ends`);

      // Process detected silence blocks into usable segments
      let currentStart = 0
      startTimes.forEach((start, i) => {
        const end = endTimes[i] || start + 0.1
        if (start > currentStart) {
          // Apply buffer zones to detected blocks
          const blockStart = Math.max(0, currentStart - bufferBefore)
          const blockEnd = Math.min(videoDuration, start + bufferAfter)
          blocks.push({ start: blockStart, end: blockEnd })
        }
        currentStart = end
      })
      
      // Add final segment if needed
      if (currentStart < videoDuration) {
        blocks.push({ 
          start: Math.max(0, currentStart - bufferBefore),
          end: videoDuration
        })
      }
      
      const resultBlocks = blocks.map((b, i) => ({
        start: b.start,
        end: b.end,
        active: i === 0, // First block active by default
        label: `Segment ${i + 1}`,
        color: '#4CAF50'
      }));
      
      log.info(`[detectSilence] Generated ${resultBlocks.length} video blocks`);
      log.debug('[detectSilence] Result blocks:', resultBlocks);
      
      resolve(resultBlocks);
    })

    command.on('error', err => {
      log.error('[detectSilence] ffmpeg command error:', err);
      reject(err);
    })
    command.run()
  })
}

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
