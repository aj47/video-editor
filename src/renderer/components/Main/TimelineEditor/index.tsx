import { useCallback, useEffect, useRef } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { videoBlocksState, currentBlockIndexState, VideoBlockType } from '@recoil/atoms/timeline';
import { useResizeObserver } from '@hooks/use-resize-observer';
import { useVideoController } from '@hooks/use-video-controller';
import styled from 'styled-components';

const Container = styled.div`
  padding: 16px 0;
  background: ${({ theme }) => theme.color.bgSecondary};
  border-radius: 8px;
`;

const Canvas = styled.canvas`
  width: 100%;
  height: 60px;
`;

export const TimelineEditor = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { duration, seekTo } = useVideoController();
  const videoBlocks = useRecoilValue(videoBlocksState);
  const setCurrentBlockIndex = useSetRecoilState(currentBlockIndexState);
  const { width: containerWidth } = useResizeObserver(containerRef);

  const drawTimeline = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !duration) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw timeline blocks
    videoBlocks.forEach((block, index) => {
      const x = (block.start / duration) * canvas.width;
      const width = ((block.end - block.start) / duration) * canvas.width;
      
      ctx.fillStyle = block.active ? '#4CAF50' : '#FF5252';
      ctx.fillRect(x, 0, width, canvas.height);
      
      // Draw block border
      ctx.strokeStyle = '#333';
      ctx.strokeRect(x, 0, width, canvas.height);
    });
  }, [duration, videoBlocks]);

  useEffect(() => {
    if (containerWidth && canvasRef.current) {
      canvasRef.current.width = containerWidth;
      canvasRef.current.height = 60;
      drawTimeline();
    }
  }, [containerWidth, drawTimeline]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !duration) return;

    const clickX = e.clientX - rect.left;
    const clickTime = (clickX / rect.width) * duration;
    seekTo(clickTime);
  };

  return (
    <Container ref={containerRef}>
      <Canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
      />
    </Container>
  );
};
