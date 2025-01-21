import { atom } from 'recoil';
import { ConvertStatus } from '@shared/types';

export type VideoBlock = {
  start: number;
  end: number;
  active: boolean;
};

export const convertStatusState = atom<ConvertStatus | undefined>({
  key: 'convertStatusState',
  default: undefined,
});

export const convertVideoBlocksState = atom<VideoBlock[]>({
  key: 'convertVideoBlocksState',
  default: [],
});

export const editorModeState = atom<'cut' | 'label'>({
  key: 'editorModeState',
  default: 'cut',
});

// Extend InspectData with silence information
declare global {
  interface InspectData {
    silenceBlocks?: Array<{ start: number; end: number }>;
  }
}
