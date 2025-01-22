import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '@components/Shared/Modal';
import { ModalHeader, ShortcutList, ShortcutKey, ShortcutDesc } from '@components/Shared/Modal/Styled';
import { HexColorPicker } from 'react-colorful';
import { useClickOutside } from '../../../hooks/use-click-outside';
import { useRecoilState, useRecoilValue } from 'recoil';
import { inputFilePathState } from '@recoil/atoms/input-file';
import { videoBlocksState, currentBlockIndexState, VideoBlockType } from '@recoil/atoms/timeline';
import { useResizeObserver } from '@hooks/use-resize-observer';
import { useVideoController } from '@hooks/use-video-controller';
import styled from 'styled-components';
import {
  Container,
  TimelineTrack,
  Block,
  ResizeHandle,
  LabelText,
  TimelineScale
} from './Styled';

export const TimelineEditor = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { duration, seekTo } = useVideoController();
  const [isDragging, setIsDragging] = useState(false);
  const [dragHandle, setDragHandle] = useState<'start' | 'end' | null>(null);
  const [currentBlock, setCurrentBlock] = useState<number>(-1);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeOriginalTime, setResizeOriginalTime] = useState(0);

  const [videoBlocks, setVideoBlocks] = useRecoilState(videoBlocksState);
  const [currentBlockIndex, setCurrentBlockIndex] = useRecoilState(currentBlockIndexState);

  const handleResizeStart = useCallback((e: React.MouseEvent, index: number, handle: 'start' | 'end') => {
    e.stopPropagation();
    setIsDragging(true);
    setCurrentBlock(index);
    setDragHandle(handle);
    setResizeStartX(e.clientX);
    setResizeOriginalTime(handle === 'start' ? videoBlocks[index].start : videoBlocks[index].end);
  }, [videoBlocks]);

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
  }, [handleResizeMove, handleResizeEnd]);

  useEffect(() => {
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [handleResizeMove, handleResizeEnd]);
  const { width: containerWidth } = useResizeObserver(containerRef);

  const handleBlockClick = useCallback((index: number, e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickPosition = (e.clientX - rect.left) / rect.width;
    const block = videoBlocks[index];
    const clickedTime = block.start + (block.end - block.start) * clickPosition;
    
    seekTo(clickedTime);
    setCurrentBlockIndex(index);
  }, [setCurrentBlockIndex, seekTo, videoBlocks]);

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
  }, [setVideoBlocks, setCurrentBlockIndex]);

  const filePath = useRecoilValue(inputFilePathState);

  const [showHelp, setShowHelp] = useState(false);
  const [colorPickerPos, setColorPickerPos] = useState<{x: number; y: number} | null>(null);
  const [colorPickerBlock, setColorPickerBlock] = useState<number>(-1);
  const colorPickerRef = useClickOutside<HTMLDivElement>(() => setColorPickerPos(null));

  const handleColorChange = useCallback((color: string) => {
    setVideoBlocks(blocks => blocks.map((b, i) => 
      i === colorPickerBlock ? {...b, color} : b
    ));
  }, [colorPickerBlock]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        setEditMode(mode => mode === 'cut' ? 'label' : 'cut');
      }
      if (e.key === '?') {
        setShowHelp(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <Container ref={containerRef}>
      <Modal isVisible={showHelp} onClose={() => setShowHelp(false)}>
        <ModalHeader>Keyboard Shortcuts</ModalHeader>
        <ShortcutList>
          <ShortcutKey>Space</ShortcutKey>
          <ShortcutDesc>Play/Pause video</ShortcutDesc>
          <ShortcutKey>Tab</ShortcutKey>
          <ShortcutDesc>Toggle cut/label mode</ShortcutDesc>
          <ShortcutKey>← →</ShortcutKey>
          <ShortcutDesc>Navigate blocks</ShortcutDesc>
          <ShortcutKey>L</ShortcutKey>
          <ShortcutDesc>Label selected block</ShortcutDesc>
          <ShortcutKey>M</ShortcutKey>
          <ShortcutDesc>Merge selected blocks</ShortcutDesc>
          <ShortcutKey>?</ShortcutKey>
          <ShortcutDesc>Show this help</ShortcutDesc>
        </ShortcutList>
      </Modal>
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
        <TimelineScale $duration={duration} />
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
