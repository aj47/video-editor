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
  return new Promise((resolve, reject) => {
    let output = ''
    const command = ffmpeg(filePath)
      .audioFilters('silencedetect=noise=-40dB:d=0.1')
      .format('null')
      .output('-')

    command.on('stderr', (errLine) => {
      output += errLine
    })

    command.on('end', () => {
      const blocks = []
      const startTimes = []
      const endTimes = []
      
      const videoDuration = await new Promise<number>((resolve) => {
        ffmpeg(filePath).ffprobe((err, data) => {
          resolve(data?.format?.duration || 0);
        });
      });
      
      const lines = output.split('\n');
      lines.forEach(line => {
        const startMatch = line.match(/silence_start: (\d+\.\d+)/);
        const endMatch = line.match(/silence_end: (\d+\.\d+)/);
        if (startMatch) startTimes.push(parseFloat(startMatch[1]));
        if (endMatch) endTimes.push(parseFloat(endMatch[1]));
      });

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
      
      resolve(blocks)
    })

    command.on('error', reject)
    command.run()
  })
}

export const convert = (filePath: string, option: ConvertOption, segments: Array<{ start: number; end: number }>) => {
  const command = ffmpeg()
    .input(filePath)
    .inputOptions(segments.flatMap(({ start, end }) => [
      `-ss ${Math.max(0, start - 0.1)}`, // Add 100ms padding before segment
      `-to ${end + 0.1}`, // Add 100ms padding after segment
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
