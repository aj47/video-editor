import { useCallback, useEffect, useRef, useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import { useClickOutside } from '../../../hooks/use-click-outside';
import { useRecoilState, useRecoilValue } from 'recoil';
import { inputFilePathState } from '@recoil/atoms/input-file';
import { videoBlocksState, currentBlockIndexState, VideoBlockType } from '@recoil/atoms/timeline';
import { useResizeObserver } from '@hooks/use-resize-observer';
import { useVideoController } from '@hooks/use-video-controller';
import styled from 'styled-components';

const Container = styled.div`
  padding: 16px 0;
  background: ${({ theme }) => theme.palette.bgSecondary};
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
  const [isDragging, setIsDragging] = useState(false);
  const [dragHandle, setDragHandle] = useState<'start' | 'end' | null>(null);
  const [currentBlock, setCurrentBlock] = useState<number>(-1);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeOriginalTime, setResizeOriginalTime] = useState(0);

  const handleResizeStart = useCallback((e: React.MouseEvent, index: number, handle: 'start' | 'end') => {
    e.stopPropagation();
    setIsDragging(true);
    setCurrentBlock(index);
    setDragHandle(handle);
    setResizeStartX(e.clientX);
    setResizeOriginalTime(handle === 'start' ? videoBlocks[index].start : videoBlocks[index].end);
  }, []);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isDragging || currentBlock === -1 || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const deltaX = e.clientX - resizeStartX;
    const timeDelta = (deltaX / containerRect.width) * duration;

    setVideoBlocks(blocks => blocks.map((block, i) => {
      if (i !== currentBlock) return block;

      return dragHandle === 'start'
        ? { ...block, start: Math.max(0, Math.min(block.end - 0.1, resizeOriginalTime + timeDelta)) }
        : { ...block, end: Math.min(duration, Math.max(block.start + 0.1, resizeOriginalTime + timeDelta)) };
    }));
  }, [isDragging, currentBlock, duration, resizeStartX, resizeOriginalTime, dragHandle, setVideoBlocks]);

  const handleResizeEnd = useCallback(() => {
    setIsDragging(false);
    setCurrentBlock(-1);
    setDragHandle(null);
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [handleResizeMove, handleResizeEnd]);
  const [videoBlocks, setVideoBlocks] = useRecoilState(videoBlocksState);
  const [currentBlockIndex, setCurrentBlockIndex] = useRecoilState(currentBlockIndexState);
  const { width: containerWidth } = useResizeObserver(containerRef);

  const handleBlockClick = useCallback((index: number) => {
    setCurrentBlockIndex(index);
    setVideoBlocks(blocks => 
      blocks.map((block, i) => 
        i === index ? {...block, active: !block.active} : block
      )
    );
  }, [setCurrentBlockIndex, setVideoBlocks]);

  const mergeBlocks = useCallback((index: number) => {
    setVideoBlocks(blocks => {
      if (index < 0 || index >= blocks.length - 1) return blocks;
      const newBlocks = [...blocks];
      const mergedBlock = {
        ...newBlocks[index],
        end: newBlocks[index + 1].end,
        label: newBlocks[index].label
      };
      newBlocks.splice(index, 2, mergedBlock);
      return newBlocks;
    });
    setCurrentBlockIndex(-1);
  }, [setVideoBlocks]);

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

  const filePath = useRecoilValue(inputFilePathState);

  useEffect(() => {
    if (containerWidth && canvasRef.current && filePath) {
      canvasRef.current.width = containerWidth;
      canvasRef.current.height = 60;
      drawTimeline();
    }
  }, [containerWidth, drawTimeline, filePath]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !duration) return;

    const clickX = e.clientX - rect.left;
    const clickTime = (clickX / rect.width) * duration;
    seekTo(clickTime);
  };

  const [colorPickerPos, setColorPickerPos] = useState<{x: number; y: number} | null>(null);
  const [colorPickerBlock, setColorPickerBlock] = useState<number>(-1);
  const colorPickerRef = useClickOutside<HTMLDivElement>(() => setColorPickerPos(null));

  const handleColorChange = useCallback((color: string) => {
    setVideoBlocks(blocks => blocks.map((b, i) => 
      i === colorPickerBlock ? {...b, color} : b
    ));
  }, [colorPickerBlock]);

  return (
    <Container ref={containerRef}>
      {colorPickerPos && (
        <div
          ref={colorPickerRef}
          style={{
            position: 'fixed',
            left: colorPickerPos.x,
            top: colorPickerPos.y,
            zIndex: 1000,
            background: 'white',
            padding: '8px',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
          }}
        >
          <HexColorPicker color={videoBlocks[colorPickerBlock]?.color || '#FF5252'} onChange={handleColorChange} />
        </div>
      )}
      <TimelineTrack>
        {videoBlocks.map((block, index) => (
          <Block
            key={index}
            $width={((block.end - block.start) / duration) * 100}
            $left={(block.start / duration) * 100}
            $active={block.active}
            onClick={(e) => {
              e.stopPropagation();
              handleBlockClick(index);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setColorPickerBlock(index);
              setColorPickerPos({x: e.clientX, y: e.clientY});
            }}
          >
            <ResizeHandle 
              $side="left" 
              onMouseDown={(e) => handleResizeStart(e, index, 'start')}
            />
            <LabelText
              onDoubleClick={() => {
                const newLabel = prompt('Enter new label:', block.label);
                if (newLabel) {
                  setVideoBlocks(blocks => blocks.map((b, i) => 
                    i === index ? {...b, label: newLabel} : b
                  ));
                }
              }}
            >
              {block.label}
            </LabelText>
            <ResizeHandle 
              $side="right" 
              onMouseDown={(e) => handleResizeStart(e, index, 'end')}
            />
          </Block>
        ))}
      </TimelineTrack>
    </Container>
  );
};
