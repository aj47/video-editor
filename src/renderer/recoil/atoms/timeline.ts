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
  label: string;
  color?: string;
};

export const videoBlocksState = atom<VideoBlockType[]>({
  key: 'videoBlocksState',
  default: [],
});

export const timelineZoomState = atom<number>({
  key: 'timelineZoomState',
  default: 1
});

export const currentBlockIndexState = atom<number>({
  key: 'currentBlockIndexState', 
  default: -1
});

// Helper selector for derived timeline state
export const timelineState = selector({
  key: 'timelineState',
  get: ({get}) => {
    const blocks = get(videoBlocksState);
    const zoom = get(timelineZoomState);
    return {
      blocks,
      zoom,
      totalDuration: blocks.reduce((sum, block) => sum + (block.end - block.start), 0)
    };
  }
});
