import styled, { css } from 'styled-components';

export const Container = styled.div`
  position: relative;
  padding: 16px 0;
  margin-top: 40px;
  border-radius: 8px;
  z-index: 50;
  background: ${({ theme }) => theme.palette.background};
  border: 1px solid ${({ theme }) => theme.palette.border};
`;

export const TimelineTrack = styled.div`
  position: relative;
  height: 32px;
  border-radius: 4px;
  background: ${({ theme }) => theme.palette.backgroundDark};
  border: 1px solid ${({ theme }) => theme.palette.border};
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
  background: ${({ theme }) => theme.palette.text};
  opacity: 0.6;
  z-index: 2;
  transition: opacity 0.2s;

  &:hover {
    opacity: 1;
    width: 10px;
    ${({ $side }) => $side}: -5px;
  }
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
  transition: all 0.2s;
  border-radius: 4px;
  overflow: hidden;
  background: ${({ $active, theme }) =>
    $active ? theme.palette.success : theme.palette.error};
  border: 1px solid ${({ theme }) => theme.palette.border};
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

  &:hover {
    filter: brightness(1.1);
    z-index: 1;
  }
`;

export const Canvas = styled.canvas`
  width: 100%;
  height: 60px;
`;

export const TimelineScale = styled.div<{ $duration: number }>`
  position: absolute;
  top: -20px;
  left: 0;
  right: 0;
  height: 12px;
  background: ${({ theme }) => theme.palette.background};
  
  &::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 1px;
    background: ${({ theme }) => theme.palette.border};
    transform: translateY(-50%);
  }

  ${({ $duration }) => {
    const step = Math.max($duration / 10, 5); // Show marks every 5-10% of duration
    return css`
      background-image: repeating-linear-gradient(
        to right,
        ${({ theme }) => theme.palette.border} 0 1px,
        transparent 1px ${100 / step}%
      );
    `;
  }}
`;
