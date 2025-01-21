import { atom } from 'recoil';

export const timelineZoomState = atom<number>({
  key: 'timelineZoomState',
  default: 1
});

export const currentBlockIndexState = atom<number>({
  key: 'currentBlockIndexState',
  default: -1
});

export type VideoBlockType = {
  start: number;
  end: number;
  active: boolean;
  label?: string;
};

export const videoBlocksState = atom<VideoBlockType[]>({
  key: 'videoBlocksState',
  default: [],
});
