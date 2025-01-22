import { ChangeEvent, useCallback, useRef } from 'react';
import { useVideoController } from '@hooks/index';
import { videoBlocksState } from '@recoil/atoms/timeline';
import { useRecoilValue } from 'recoil';
import { TimelineEditor } from '@components/Main/TimelineEditor';
import * as Styled from './Styled';

export const SeekBar = () => {
  const wasPlaying = useRef(false);

  const { isPlaying, currentTime, duration, play, pause, seekTo } =
    useVideoController();

  const onMouseDown = useCallback(() => {
    wasPlaying.current = isPlaying;
    pause();
  }, [isPlaying, pause]);

  const onMouseUp = useCallback(() => {
    wasPlaying.current && play();
  }, [play]);

  const videoBlocks = useRecoilValue(videoBlocksState);

  const onChange = useCallback(
    ({ target: { value } }: ChangeEvent<HTMLInputElement>) => {
      const newTime = parseFloat(value);
      const isInSilentBlock = videoBlocks.some(block => 
        newTime >= block.start && newTime <= block.end
      );
      
      if (!isInSilentBlock) {
        seekTo(newTime);
      }
    },
    [seekTo, videoBlocks]
  );

  return (
    <>
      <Styled.Input
        className="allow-event"
        type="range"
        step="any"
        max={duration}
        value={currentTime}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onChange={onChange}
      />
      <TimelineEditor />
    </>
  );
};
