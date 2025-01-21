import { useCallback, useEffect, useState } from 'react';
import { useRecoilValue } from 'recoil';

import { inputFilePathState, playerRefState } from '@recoil/atoms';

export const useVideoController = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const filePath = useRecoilValue(inputFilePathState);
  const videoRef = useRecoilValue(playerRefState);

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
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlaying();
      } else if (e.code === 'Tab') {
        e.preventDefault();
        // Toggle edit mode logic here
      } else if (e.code.startsWith('Digit') && editMode) {
        const digit = parseInt(e.code.slice(5), 10);
        // Handle number key labels 1-9
        if (digit >= 1 && digit <= 9) {
          e.preventDefault();
          handleLabelApply(digit);
        }
      } else if (e.code === 'ArrowLeft' && editMode) {
        e.preventDefault();
        setCurrentBlockIndex(prev => Math.max(0, prev - 1));
      } else if (e.code === 'ArrowRight' && editMode) {
        e.preventDefault();
        setCurrentBlockIndex(prev => Math.min(videoBlocks.length - 1, prev + 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlaying]);

  useEffect(() => {
    setIsPlaying(false);

    const handleLoadedmetadata = () => {
      setDuration(videoRef.current?.duration || 0);

      const timeUpdate = () => {
        setCurrentTime(videoRef.current?.currentTime || 0);
        requestAnimationFrame(timeUpdate);
      };
      requestAnimationFrame(timeUpdate);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    videoRef.current?.addEventListener('loadedmetadata', handleLoadedmetadata);
    videoRef.current?.addEventListener('play', handlePlay);
    videoRef.current?.addEventListener('pause', handlePause);

    return () => {
      videoRef.current?.removeEventListener(
        'loadedmetadata',
        handleLoadedmetadata
      );
      videoRef.current?.removeEventListener('play', handlePlay);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      videoRef.current?.removeEventListener('pause', handlePause);
    };
  }, [filePath, videoRef]);

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
