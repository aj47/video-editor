import styled, { css } from 'styled-components';

export const Container = styled.div`
  padding: 16px 0;
  border-radius: 8px;
`;

export const TimelineTrack = styled.div`
  position: relative;
  height: 48px;
  border-radius: 4px;
`;

export const LabelText = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 12px;
  pointer-events: none;
  user-select: none;
`;

export const ResizeHandle = styled.div<{ $side: 'left' | 'right' }>`
  position: absolute;
  ${({ $side }) => $side}: -4px;
  top: 0;
  width: 8px;
  height: 100%;
  cursor: col-resize;
  background: rgba(255, 255, 255, 0.3);
  z-index: 2;
`;

export const Block = styled.div<{
  $width: number;
  $left: number;
  $active: boolean;
}>`
  position: absolute;
  height: 100%;
  width: ${({ $width }) => $width}%;
  left: ${({ $left }) => $left}%;
  cursor: pointer;
  transition: background 0.2s;
`;

export const Canvas = styled.canvas`
  width: 100%;
  height: 60px;
`;
