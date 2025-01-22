import { useCallback, useEffect, useRef, useState } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import styled from 'styled-components';

import { useVideoController } from '@hooks/use-video-controller';
import { inputFilePathState } from '@recoil/atoms/input-file';
import { videoBlocksState, currentBlockIndexState } from '@recoil/atoms/timeline';
import { formatTimeShort } from '../../../util/time';

import { Container, Canvas } from './Styled';

export const TimelineEditor = () => {
  const { duration, seekTo } = useVideoController();
  const [zoomLevel, setZoomLevel] = useState(1);
  const [scrollLeft, setScrollLeft] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>();
  const [videoBlocks] = useRecoilState(videoBlocksState);
  const [, setCurrentBlockIndex] = useRecoilState(currentBlockIndexState);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    // Set canvas dimensions
    canvas.width = containerWidth * zoomLevel;
    canvas.height = containerHeight;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw timeline blocks
    videoBlocks.forEach(block => {
      const blockStart = (block.start / duration) * canvas.width;
      const blockWidth = ((block.end - block.start) / duration) * canvas.width;
      
      ctx.fillStyle = block.color || '#4CAF50';
      ctx.fillRect(blockStart, 0, blockWidth, containerHeight - 20);
      
      // Draw block label
      if (blockWidth > 40) {
        ctx.fillStyle = '#fff';
        ctx.font = '12px sans-serif';
        ctx.fillText(block.label, blockStart + 5, containerHeight - 25);
      }
    });

    // Draw time markers
    ctx.strokeStyle = '#666';
    ctx.beginPath();
    const markerInterval = Math.max(1, Math.floor(duration / 10));
    for (let t = 0; t <= duration; t += markerInterval) {
      const x = (t / duration) * canvas.width;
      ctx.moveTo(x, containerHeight - 15);
      ctx.lineTo(x, containerHeight);
    }
    ctx.stroke();

    // Draw time labels
    ctx.fillStyle = '#fff';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    for (let t = 0; t <= duration; t += markerInterval) {
      const x = (t / duration) * canvas.width;
      ctx.fillText(formatTimeShort(t), x, containerHeight - 5);
    }

    requestRef.current = requestAnimationFrame(animate);
  }, [videoBlocks, duration, zoomLevel]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current!);
  }, [animate]);

  const handleScroll = useCallback((e: React.WheelEvent) => {
    setScrollLeft(prev => {
      const newScroll = prev + e.deltaY;
      return Math.max(0, Math.min(newScroll, canvasRef.current!.width - containerRef.current!.clientWidth));
    });
  }, []);

  const handleZoom = useCallback((direction: 'in' | 'out') => {
    setZoomLevel(prev => {
      const newZoom = direction === 'in' ? prev * 1.2 : prev / 1.2;
      return Math.min(10, Math.max(1, newZoom));
    });
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left + scrollLeft;
    const clickTime = (clickX / canvas.width) * duration;

    // Find clicked block
    const clickedBlockIndex = videoBlocks.findIndex(block => 
      block.start <= clickTime && clickTime <= block.end
    );
    
    if (clickedBlockIndex !== -1) {
      setCurrentBlockIndex(clickedBlockIndex);
      seekTo(clickTime);
    }
  }, [duration, scrollLeft, seekTo, setCurrentBlockIndex, videoBlocks]);

  return (
    <Container 
      ref={containerRef}
      onWheel={handleScroll}
      style={{ overflowX: 'auto' }}
    >
      <Canvas 
        ref={canvasRef}
        onClick={handleClick}
        style={{ 
          width: `${zoomLevel * 100}%`,
          transform: `translateX(-${scrollLeft}px)`,
          height: '120px'
        }}
      />
      <div className="zoom-controls">
        <button onClick={() => handleZoom('in')}>+</button>
        <button onClick={() => handleZoom('out')}>-</button>
      </div>
    </Container>
  );
};
