import { useCallback, useEffect, useState } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { editorModeState } from '@recoil/atoms/status';
import { videoBlocksState, currentBlockIndexState } from '@recoil/atoms/timeline';
import { boolOptionsStateFamily } from '@recoil/atoms/options';

import { inputFilePathState, playerRefState } from '@recoil/atoms';

export const useVideoController = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const filePath = useRecoilValue(inputFilePathState);
  const videoRef = useRecoilValue(playerRefState);
  const skipSilence = useRecoilValue(boolOptionsStateFamily('option/skipSilence'));

  const play = useCallback(() => {
    if (!videoRef.current) return;

    videoRef.current.play();
  }, [videoRef]);

  const pause = useCallback(() => {
    if (!videoRef.current) return;

    videoRef.current.pause();
  }, [videoRef]);

  const togglePlaying = useCallback(() => {
    if (!videoRef.current) return;

    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, pause, play, videoRef]);

  const seekTo = useCallback(
    (time: number) => {
      if (!videoRef.current) return;

      setCurrentTime(time);

      // eslint-disable-next-line no-param-reassign
      videoRef.current.currentTime = time;
    },
    [videoRef]
  );

  // Keyboard shortcuts
  const [editorMode, setEditorMode] = useRecoilState(editorModeState);
  const [videoBlocks, setVideoBlocks] = useRecoilState(videoBlocksState);
  const [currentBlockIndex, setCurrentBlockIndex] = useRecoilState(currentBlockIndexState);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlaying();
      } else if (e.code === 'Tab') {
        e.preventDefault();
        setEditorMode(mode => mode === 'cut' ? 'label' : 'cut');
      } else if (e.code.startsWith('Digit') && editorMode === 'label') {
        const digit = parseInt(e.code.slice(5), 10);
        if (digit >= 1 && digit <= 9) {
          e.preventDefault();
          setVideoBlocks(blocks => blocks.map((block, i) => 
            i === currentBlockIndex ? {...block, label: `Label ${digit}`} : block
          ));
        }
      } else if (e.code === 'ArrowLeft' && editorMode === 'cut') {
        e.preventDefault();
        setCurrentBlockIndex(prev => Math.max(0, prev - 1));
      } else if (e.code === 'ArrowRight' && editorMode === 'cut') {
        e.preventDefault();
        setCurrentBlockIndex(prev => Math.min(videoBlocks.length - 1, prev + 1));
      } else if (e.key === 'm' && e.shiftKey) {
        e.preventDefault();
        if (currentBlockIndex >= 0 && currentBlockIndex < videoBlocks.length - 1) {
          setVideoBlocks(blocks => {
            const newBlocks = [...blocks];
            const mergedBlock = {
              ...newBlocks[currentBlockIndex],
              end: newBlocks[currentBlockIndex + 1].end,
              label: newBlocks[currentBlockIndex].label
            };
            newBlocks.splice(currentBlockIndex, 2, mergedBlock);
            return newBlocks;
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlaying]);

  useEffect(() => {
    setIsPlaying(false);

    const handleLoadedmetadata = () => {
      setDuration(videoRef.current?.duration || 0);
    };

    const timeUpdate = () => {
      const video = videoRef.current;
      if (!video) return;

      const currentTime = video.currentTime;
      setCurrentTime(currentTime);

      if (skipSilence && videoBlocks.length > 0) {
        console.log('[SilenceSkip] Current time:', currentTime);
        console.log('[SilenceSkip] Video blocks:', videoBlocks);
        
        const currentBlock = videoBlocks.find(block => 
          currentTime >= block.start && currentTime <= block.end
        );

        if (currentBlock) {
          console.log(`[SilenceSkip] In silent block ${currentBlock.start}-${currentBlock.end}, skipping...`);
          const wasPlaying = !video.paused;
          
          // Pause before seeking to prevent audio glitches
          pause();
          
          // Seek to end of block + small offset to prevent infinite loop
          const skipTime = currentBlock.end + 0.001;
          console.log(`[SilenceSkip] Seeking to ${skipTime}`);
          seekTo(Math.min(skipTime, duration));
          
          // Resume playback if needed
          if (wasPlaying) {
            requestAnimationFrame(() => play());
          }
        }
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    videoRef.current?.addEventListener('loadedmetadata', handleLoadedmetadata);
    videoRef.current?.addEventListener('timeupdate', timeUpdate);
    videoRef.current?.addEventListener('play', handlePlay);
    videoRef.current?.addEventListener('pause', handlePause);

    return () => {
      videoRef.current?.removeEventListener('timeupdate', timeUpdate);
      videoRef.current?.removeEventListener('loadedmetadata', handleLoadedmetadata);
      videoRef.current?.removeEventListener('play', handlePlay);
      videoRef.current?.removeEventListener('pause', handlePause);
    };
  }, [filePath, videoRef, skipSilence, videoBlocks, duration, pause, play, seekTo]);

  return {
    isPlaying,
    duration,
    currentTime,
    play,
    pause,
    togglePlaying,
    seekTo,
  };
};
